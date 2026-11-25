import { Injectable } from '@nestjs/common';
import {
  DEFAULT_ACCOUNT_BALANCE,
  env,
  FEATURE_MANIFEST_VERSION,
  FEATURE_NAMES,
  RISK_HARD_CAPS,
  RISK_PROFILE_TEMPLATES,
} from '@ts/config';
import type { RiskAssessment, RiskCalculation, RiskRuleCode, RiskRuleDefinition } from '@ts/types';
import type { RiskCalculateInput, RiskContextInput, RiskEvaluateRequest } from '@ts/validation';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteService } from '../market/quote.service';
import { EconomicEventsService } from '../news/economic-events.service';
import {
  ALL_RISK_RULES,
  configuredThresholds,
  evaluateRules,
  RULE_NAMES,
  type EffectiveRiskProfile,
  type RiskRuleContext,
} from './rules';
import {
  calculateSizing,
  dailyLossPct,
  DrawdownTracker,
  portfolioExposure,
  riskAmount,
  scalingForSymbol,
  stopDistance,
  stopPips,
  type ExposurePosition,
  type PairScaling,
} from './sizing.service';
import { noTradeRuleViolation } from './risk.errors';

interface ProfileOverride {
  name?: string;
  profileType?: EffectiveRiskProfile['profileType'];
  riskPerTradePct?: number;
  maxOpenPositions?: number;
  maxDailyLossPct?: number;
  minRiskReward?: number;
  maxPortfolioExposurePct?: number;
  maxDrawdownPct?: number;
  maxVolatilityPct?: number;
  newsEventRestrictions?: boolean;
}

interface AccountState {
  balance: number;
  equity: number;
  openPositions: number;
  dailyLossPct: number;
  drawdownPct: number;
  portfolioExposurePct: number;
  correlatedExposurePct: number;
  positions: (ExposurePosition & { pairId: string })[];
}

export abstract class RiskService {
  abstract calculate(input: RiskCalculateInput, userId?: string): Promise<RiskCalculation>;
  abstract rules(userId?: string): Promise<{
    items: RiskRuleDefinition[];
    profile: EffectiveRiskProfile;
    thresholds: ReturnType<typeof configuredThresholds>;
  }>;
  /** Non-throwing assessment for in-process consumers (P16 decision engine). */
  abstract assess(input: RiskEvaluateRequest, userId?: string): Promise<RiskAssessment>;
  /** HTTP form: a BLOCK becomes a structured 422. */
  abstract evaluate(input: RiskEvaluateRequest, userId?: string): Promise<RiskAssessment>;
}

/** P15's deterministic risk authority. No AI, no hidden state, no client trust. */
@Injectable()
export class Phase15RiskService extends RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuoteService,
    private readonly events: EconomicEventsService,
  ) {
    super();
  }

  async calculate(input: RiskCalculateInput, userId?: string): Promise<RiskCalculation> {
    const scaling = await this.scalingOf(input.symbol);
    const sizing = calculateSizing({ ...input, ...scaling });
    const account = await this.accountState(userId, input.balance, input.symbol);
    return {
      symbol: input.symbol,
      side: input.side,
      ...scaling,
      ...sizing,
      maxLoss: sizing.potentialLoss,
      exposure: account.portfolioExposurePct,
      drawdown: account.drawdownPct,
    };
  }

  async rules(userId?: string) {
    const profile = await this.resolveProfile(userId);
    const thresholds = configuredThresholds();
    const items: RiskRuleDefinition[] = ALL_RISK_RULES.map((rule) => ({
      code: rule.code,
      rule: RULE_NAMES[rule.code],
      defaultSeverity: 'PASS',
      message: `Evaluates ${RULE_NAMES[rule.code].toLowerCase()}`,
      threshold: this.thresholdFor(rule.code, profile, thresholds),
      source:
        rule.code === 'MAX_RISK_PER_TRADE' && profile.riskPerTradePct >= env.MAX_RISK_PER_TRADE_PCT
          ? 'config'
          : this.sourceOf(rule.code),
    }));
    return { items, profile, thresholds };
  }

  async assess(input: RiskEvaluateRequest, userId?: string): Promise<RiskAssessment> {
    const client = this.prisma.getClient();
    const profile = await this.resolveProfile(userId, input.profile);
    const scaling = await this.scalingOf(input.order.symbol);
    const account = await this.accountState(userId, input.context?.balance, input.order.symbol);
    const balance = account.balance;
    const equity = account.equity ?? balance;
    const distance = stopDistance(input.order.entry, input.order.stopLoss);
    const maxAllowedSize =
      riskAmount(balance, Math.min(profile.riskPerTradePct, env.MAX_RISK_PER_TRADE_PCT)) /
      (stopPips(distance, scaling.pipSize) * scaling.pointValue);

    const pair = await client.currencyPair.findUnique({
      where: { symbol: input.order.symbol },
      select: { id: true, baseCurrency: true },
    });
    const featureGap = await this.featureGap(pair?.id);
    const confidence = await this.confidenceOf(pair?.id, input.context);
    const freshness = await this.freshnessOf(input.order.symbol, input.context);
    const imminentEvents = await this.imminentEvents();

    const context: RiskRuleContext = {
      symbol: input.order.symbol,
      side: input.order.side,
      entry: input.order.entry,
      stopLoss: input.order.stopLoss,
      takeProfit: input.order.takeProfit,
      size: input.order.size,
      balance,
      equity,
      profile,
      scaling,
      maxAllowedSize,
      volatilityPct: input.context?.volatilityPct ?? featureGap.volatilityPct,
      confidence,
      dataFreshnessSeconds: freshness,
      missingFeatures: input.context?.missingFeatures ?? featureGap.missing,
      openPositions: input.context?.openPositions ?? account.openPositions,
      dailyLossPct: input.context?.dailyLossPct ?? account.dailyLossPct,
      drawdownPct: input.context?.drawdownPct ?? account.drawdownPct,
      portfolioExposurePct: input.context?.portfolioExposurePct ?? account.portfolioExposurePct,
      correlatedExposurePct: input.context?.correlatedExposurePct ?? account.correlatedExposurePct,
      imminentEvents: input.context?.imminentEvents ?? imminentEvents,
    };

    const chain = evaluateRules(ALL_RISK_RULES, context);
    const sizing = calculateSizing({
      ...input.order,
      balance,
      riskPerTradePct: Math.min(profile.riskPerTradePct, env.MAX_RISK_PER_TRADE_PCT),
      ...scaling,
    });
    const assessment: RiskAssessment = {
      positionSize: sizing.positionSize,
      maxLoss: sizing.potentialLoss,
      riskReward: sizing.riskReward,
      potentialProfit: sizing.potentialProfit,
      potentialLoss: sizing.potentialLoss,
      exposure: context.portfolioExposurePct,
      drawdown: context.drawdownPct,
      ...chain,
    };

    return assessment;
  }

  async evaluate(input: RiskEvaluateRequest, userId?: string): Promise<RiskAssessment> {
    const assessment = await this.assess(input, userId);
    if (assessment.status === 'BLOCK') {
      noTradeRuleViolation({
        reasons: assessment.verdicts
          .filter((verdict) => verdict.status === 'BLOCK')
          .map((verdict) => verdict.message),
        verdicts: assessment.verdicts,
        reasonCodes: assessment.reasonCodes ?? [],
        noTradeReasons: assessment.noTradeReasons ?? [],
        assessment,
      });
    }
    return assessment;
  }

  /** Clamp every override to the documented hard caps before it can be used. */
  private async resolveProfile(
    userId?: string,
    override?: ProfileOverride,
  ): Promise<EffectiveRiskProfile> {
    const client = this.prisma.getClient();
    const row =
      override !== undefined
        ? null
        : userId === undefined
          ? null
          : await client.riskProfile.findUnique({
              where: { userId },
              select: {
                name: true,
                profileType: true,
                riskPerTradePct: true,
                maxOpenPositions: true,
                maxDailyLossPct: true,
                minRiskReward: true,
                maxPortfolioExposurePct: true,
                maxDrawdownPct: true,
                maxVolatilityPct: true,
                newsEventRestriction: true,
              },
            });
    const stored: ProfileOverride | null =
      row === null
        ? null
        : {
            name: row.name,
            profileType: row.profileType,
            riskPerTradePct: Number(row.riskPerTradePct),
            maxOpenPositions: row.maxOpenPositions,
            maxDailyLossPct: Number(row.maxDailyLossPct),
            minRiskReward: Number(row.minRiskReward),
            maxPortfolioExposurePct: Number(row.maxPortfolioExposurePct),
            maxDrawdownPct: Number(row.maxDrawdownPct),
            maxVolatilityPct: Number(row.maxVolatilityPct),
            newsEventRestrictions: row.newsEventRestriction,
          };
    const fallback = RISK_PROFILE_TEMPLATES[env.DEFAULT_RISK_PROFILE];
    const source: ProfileOverride = {
      name: fallback.name,
      profileType: env.DEFAULT_RISK_PROFILE,
      riskPerTradePct: fallback.riskPerTradePct,
      maxOpenPositions: fallback.maxOpenPositions,
      maxDailyLossPct: fallback.maxDailyLossPct,
      minRiskReward: fallback.minRiskReward,
      maxPortfolioExposurePct: fallback.maxPortfolioExposurePct,
      maxDrawdownPct: fallback.maxDrawdownPct,
      maxVolatilityPct: fallback.maxVolatilityPct,
      newsEventRestrictions: fallback.newsEventRestrictions,
      ...(stored ?? {}),
    };
    return {
      name: override?.name ?? source.name ?? fallback.name,
      profileType: override?.profileType ?? source.profileType ?? env.DEFAULT_RISK_PROFILE,
      riskPerTradePct: Math.min(
        override?.riskPerTradePct ?? source.riskPerTradePct ?? fallback.riskPerTradePct,
        env.MAX_RISK_PER_TRADE_PCT,
        RISK_HARD_CAPS.riskPerTradePct,
      ),
      maxOpenPositions: Math.min(
        override?.maxOpenPositions ?? source.maxOpenPositions ?? fallback.maxOpenPositions,
        RISK_HARD_CAPS.maxOpenPositions,
      ),
      maxDailyLossPct: Math.min(
        override?.maxDailyLossPct ?? source.maxDailyLossPct ?? fallback.maxDailyLossPct,
        RISK_HARD_CAPS.maxDailyLossPct,
      ),
      minRiskReward: Math.min(
        override?.minRiskReward ?? source.minRiskReward ?? fallback.minRiskReward,
        RISK_HARD_CAPS.minRiskReward,
      ),
      maxPortfolioExposurePct: Math.min(
        override?.maxPortfolioExposurePct ??
          source.maxPortfolioExposurePct ??
          fallback.maxPortfolioExposurePct,
        RISK_HARD_CAPS.maxPortfolioExposurePct,
      ),
      maxDrawdownPct: Math.min(
        override?.maxDrawdownPct ?? source.maxDrawdownPct ?? fallback.maxDrawdownPct,
        RISK_HARD_CAPS.maxDrawdownPct,
      ),
      maxVolatilityPct: Math.min(
        override?.maxVolatilityPct ?? source.maxVolatilityPct ?? fallback.maxVolatilityPct,
        RISK_HARD_CAPS.maxVolatilityPct,
      ),
      newsEventRestrictions:
        override?.newsEventRestrictions ?? source.newsEventRestrictions ?? true,
    };
  }

  private async scalingOf(symbol: string): Promise<PairScaling> {
    const pair = await this.prisma
      .getClient()
      .currencyPair.findUnique({ where: { symbol }, select: { pipSize: true, pointValue: true } });
    if (pair === null) return scalingForSymbol(symbol);
    return { pipSize: Number(pair.pipSize), pointValue: Number(pair.pointValue) };
  }

  /** Reads real open positions; zeroed state is honest when none exist. */
  private async accountState(
    userId: string | undefined,
    fallbackBalance?: number,
    symbol?: string,
  ): Promise<AccountState> {
    const fallback = fallbackBalance ?? DEFAULT_ACCOUNT_BALANCE;
    if (userId === undefined) {
      return {
        balance: fallback,
        equity: fallback,
        openPositions: 0,
        dailyLossPct: 0,
        drawdownPct: 0,
        portfolioExposurePct: 0,
        correlatedExposurePct: 0,
        positions: [],
      };
    }
    const client = this.prisma.getClient();
    const portfolio = await client.portfolio.findFirst({
      where: { userId },
      include: { positions: { where: { status: 'OPEN' } } },
      orderBy: { createdAt: 'asc' },
    });
    if (portfolio === null) {
      return {
        balance: fallback,
        equity: fallback,
        openPositions: 0,
        dailyLossPct: 0,
        drawdownPct: 0,
        portfolioExposurePct: 0,
        correlatedExposurePct: 0,
        positions: [],
      };
    }
    const balance = Number(portfolio.balance);
    const unrealized = portfolio.positions.reduce(
      (total, position) => total + Number(position.unrealizedPnl),
      0,
    );
    const equity = balance + unrealized;
    const pairIds = [...new Set(portfolio.positions.map((position) => position.pairId))];
    const pairs = pairIds.length
      ? await client.currencyPair.findMany({
          where: { id: { in: pairIds } },
          select: {
            id: true,
            baseCurrency: true,
            quoteCurrency: true,
            pipSize: true,
            pointValue: true,
          },
        })
      : [];
    const byPair = new Map(pairs.map((pair) => [pair.id, pair]));
    const positions = portfolio.positions.map((position) => {
      const pair = byPair.get(position.pairId);
      return {
        pairId: position.pairId,
        size: Number(position.size),
        entryPrice: Number(position.entryPrice),
        pipSize: pair === undefined ? undefined : Number(pair.pipSize),
        pointValue: pair === undefined ? undefined : Number(pair.pointValue),
      };
    });

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const closedToday = await client.position.findMany({
      where: {
        portfolioId: portfolio.id,
        status: { not: 'OPEN' },
        closedAt: { gte: startOfDay },
      },
      select: { realizedPnl: true },
    });
    const todayRealized = closedToday.reduce((total, row) => total + Number(row.realizedPnl), 0);
    const startOfDayEquity = equity - todayRealized - unrealized;
    const closedHistory = await client.position.findMany({
      where: { portfolioId: portfolio.id, status: { not: 'OPEN' } },
      orderBy: { closedAt: 'asc' },
      select: { realizedPnl: true },
    });
    const curve = [Number(portfolio.initialBalance)];
    let running = Number(portfolio.initialBalance);
    for (const row of closedHistory) {
      running += Number(row.realizedPnl);
      curve.push(running);
    }
    curve.push(equity);
    return {
      balance,
      equity,
      openPositions: portfolio.positions.length,
      dailyLossPct: dailyLossPct(Math.max(startOfDayEquity, 0.01), equity),
      drawdownPct: DrawdownTracker.worst(curve[0], curve.slice(1)),
      portfolioExposurePct: portfolioExposure(positions, equity),
      correlatedExposurePct: portfolioExposure(
        positions.filter((position) => {
          const pair = byPair.get(position.pairId);
          if (pair === undefined || symbol === undefined) return false;
          const currencies = symbol.toUpperCase().split('/');
          return currencies.some(
            (currency) => currency === pair.baseCurrency || currency === pair.quoteCurrency,
          );
        }),
        equity,
      ),
      positions,
    };
  }

  private async featureGap(pairId: string | undefined): Promise<{
    missing: string[];
    volatilityPct?: number;
  }> {
    if (pairId === undefined) return { missing: [] };
    const latest = await this.prisma.getClient().marketFeature.findFirst({
      where: { pairId, featureVersion: FEATURE_MANIFEST_VERSION },
      orderBy: { timestamp: 'desc' },
      select: { values: true },
    });
    if (latest === null || typeof latest.values !== 'object' || latest.values === null) {
      // No vector for a known pair means every required feature is missing.
      return { missing: [...FEATURE_NAMES] };
    }
    const values = latest.values as Record<string, unknown>;
    const volatility = values.atr_pct ?? values.realized_vol_pct;
    return {
      missing: FEATURE_NAMES.filter((name) => !Object.hasOwn(values, name)),
      volatilityPct: typeof volatility === 'number' ? volatility : undefined,
    };
  }

  private async confidenceOf(
    pairId: string | undefined,
    context: RiskContextInput | undefined,
  ): Promise<number | undefined> {
    if (context?.confidence !== undefined) return context.confidence;
    if (pairId === undefined) return undefined;
    const prediction = await this.prisma.getClient().prediction.findFirst({
      where: { pairId },
      orderBy: { createdAt: 'desc' },
      select: { confidence: true, createdAt: true },
    });
    if (prediction === null) return undefined;
    const ageSeconds = (Date.now() - prediction.createdAt.getTime()) / 1000;
    const limit = Math.max(1, Number(env.MARKET_DATA_STALE_THRESHOLD_SECONDS ?? 120));
    return ageSeconds <= limit ? Number(prediction.confidence) : undefined;
  }

  private async freshnessOf(
    symbol: string,
    context: RiskContextInput | undefined,
  ): Promise<number | undefined> {
    if (context?.dataFreshnessSeconds !== undefined) return context.dataFreshnessSeconds;
    try {
      const quotes = await this.quotes.quotes([symbol]);
      return quotes.items[0]?.dataFreshnessSeconds;
    } catch {
      // An unavailable quote cannot be trusted as current: fail closed.
      return Math.max(1, Number(env.MARKET_DATA_STALE_THRESHOLD_SECONDS ?? 120)) + 1;
    }
  }

  private async imminentEvents(): Promise<RiskRuleContext['imminentEvents']> {
    const events = await this.events.imminentRisks();
    return events.map((event) => ({
      eventName: event.eventName,
      currency: event.currency,
      minutesUntil: event.minutesUntil,
    }));
  }

  private thresholdFor(
    code: RiskRuleCode,
    profile: EffectiveRiskProfile,
    thresholds: ReturnType<typeof configuredThresholds>,
  ): number | boolean | null {
    switch (code) {
      case 'MAX_RISK_PER_TRADE':
        return Math.min(profile.riskPerTradePct, thresholds.maxRiskPerTradePct);
      case 'MAX_DAILY_LOSS':
        return Math.min(profile.maxDailyLossPct, RISK_HARD_CAPS.maxDailyLossPct);
      case 'MAX_OPEN_POSITIONS':
        return Math.min(profile.maxOpenPositions, RISK_HARD_CAPS.maxOpenPositions);
      case 'MAX_PORTFOLIO_EXPOSURE':
        return Math.min(profile.maxPortfolioExposurePct, RISK_HARD_CAPS.maxPortfolioExposurePct);
      case 'MAX_CORRELATED_EXPOSURE':
        return thresholds.maxCorrelatedExposurePct;
      case 'MAX_DRAWDOWN':
        return Math.min(profile.maxDrawdownPct, RISK_HARD_CAPS.maxDrawdownPct);
      case 'MIN_RISK_REWARD':
        return profile.minRiskReward;
      case 'MAX_VOLATILITY':
        return Math.min(profile.maxVolatilityPct, RISK_HARD_CAPS.maxVolatilityPct);
      case 'NEWS_EVENT_RESTRICTION':
        return profile.newsEventRestrictions;
      case 'MIN_CONFIDENCE':
        return thresholds.minConfidence;
      case 'DATA_STALENESS':
        return thresholds.maxDataFreshnessSeconds;
      case 'MISSING_FEATURES':
        return FEATURE_NAMES.length;
    }
  }

  private sourceOf(code: RiskRuleCode): 'config' | 'profile' {
    switch (code) {
      case 'MAX_DAILY_LOSS':
      case 'MAX_OPEN_POSITIONS':
      case 'MAX_PORTFOLIO_EXPOSURE':
      case 'MAX_DRAWDOWN':
      case 'MIN_RISK_REWARD':
      case 'MAX_VOLATILITY':
      case 'NEWS_EVENT_RESTRICTION':
      case 'MAX_RISK_PER_TRADE':
        return 'profile';
      default:
        return 'config';
    }
  }
}

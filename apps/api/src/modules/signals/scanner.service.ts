import { Injectable } from '@nestjs/common';
import { SCANNER_CACHE_TTL_SECONDS } from '@ts/config';
import type { RiskLevel, ScannerRow, TradeSignal } from '@ts/types';
import { cursorPage, type CursorPage } from '../../common/helpers/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { mapSignal } from './signal.mapper';
import { SignalGenerationService } from './signal-generation.service';
import { SCANNER_CACHE_KEY } from './scanner.constants';
import type { ScannerHttpQuery } from './dto/signals.dto';

const RISK_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3 };

function scannerRow(signal: TradeSignal): ScannerRow {
  return {
    symbol: signal.symbol,
    action: signal.action,
    score: signal.score,
    probability: signal.probability,
    riskLevel: signal.riskLevel,
    volatility: signal.volatilityPct,
    confidence: signal.confidence,
    band: signal.band,
    regime: signal.regime,
    noTradeReasons: signal.noTradeReasons,
    reasons: signal.reasons,
  };
}

function fallbackRow(symbol: string): ScannerRow {
  return {
    symbol,
    action: 'NO_TRADE',
    score: 0,
    probability: 0,
    riskLevel: 'HIGH',
    reasons: ['INSUFFICIENT_DATA: no signal could be generated for this pair'],
    noTradeReasons: ['INSUFFICIENT_DATA'],
  };
}

function parseCached(raw: string): ScannerRow[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const rows = (parsed as { rows?: unknown }).rows;
    if (!Array.isArray(rows)) return null;
    return rows.filter(
      (row): row is ScannerRow =>
        row !== null &&
        typeof row === 'object' &&
        typeof (row as ScannerRow).symbol === 'string' &&
        typeof (row as ScannerRow).score === 'number',
    );
  } catch {
    return null;
  }
}

/** README §15.4 — every active pair, cached for five minutes, sortable. */
@Injectable()
export class ScannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly generation: SignalGenerationService,
  ) {}

  async scan(query: ScannerHttpQuery): Promise<CursorPage<ScannerRow>> {
    const cached = await this.redis.get(SCANNER_CACHE_KEY);
    const rows =
      cached === null ? await this.buildRows() : (parseCached(cached) ?? (await this.buildRows()));
    if (cached === null || parseCached(cached) === null) {
      await this.redis.set(
        SCANNER_CACHE_KEY,
        JSON.stringify({ generatedAt: new Date().toISOString(), rows }),
        SCANNER_CACHE_TTL_SECONDS,
      );
    }

    const filtered =
      query.action === undefined ? rows : rows.filter((row) => row.action === query.action);
    const sorted = [...filtered].sort((left, right) => {
      const result = this.compare(left, right, query.sortBy);
      const direction = query.order === 'asc' ? 1 : -1;
      return result === 0 ? left.symbol.localeCompare(right.symbol) : result * direction;
    });
    return cursorPage(sorted, query);
  }

  async invalidate(): Promise<void> {
    await this.redis.del(SCANNER_CACHE_KEY);
  }

  private compare(left: ScannerRow, right: ScannerRow, sortBy: ScannerHttpQuery['sortBy']): number {
    if (sortBy === 'risk') return RISK_ORDER[left.riskLevel] - RISK_ORDER[right.riskLevel];
    if (sortBy === 'probability') return left.probability - right.probability;
    if (sortBy === 'volatility') {
      // Unknown volatility always sorts last, whichever direction is requested.
      if (left.volatility === undefined) return right.volatility === undefined ? 0 : 1;
      if (right.volatility === undefined) return -1;
      return left.volatility - right.volatility;
    }
    return left.score - right.score;
  }

  private async buildRows(): Promise<ScannerRow[]> {
    const pairs = await this.prisma.getClient().currencyPair.findMany({
      where: { isActive: true },
      select: { id: true, symbol: true },
      orderBy: { symbol: 'asc' },
    });
    const rows: ScannerRow[] = [];
    for (const pair of pairs) {
      try {
        const latest = await this.prisma.getClient().tradeSignal.findFirst({
          where: { pairId: pair.id },
          orderBy: { generatedAt: 'desc' },
          include: { pair: true },
        });
        const fresh =
          latest !== null &&
          Date.now() - latest.generatedAt.getTime() <= SCANNER_CACHE_TTL_SECONDS * 1000;
        const signal =
          latest === null
            ? await this.generation.generate(pair.symbol)
            : fresh
              ? mapSignal(latest)
              : await this.generation.generate(pair.symbol);
        rows.push(scannerRow(signal));
      } catch {
        rows.push(fallbackRow(pair.symbol));
      }
    }
    return rows;
  }
}

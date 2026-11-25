/**
 * README §8.2 expressed as data. The contract test treats the README as the
 * source of truth and checks this catalog plus live Nest route metadata against
 * it; the OpenAPI exporter enriches every operation from the same catalog.
 */
export type HttpMethod = 'get' | 'post' | 'patch' | 'delete';
export type RouteAuth = 'Public' | 'Cookie' | 'Bearer' | 'ADMIN' | 'ANALYST';

export interface RouteSpec {
  method: HttpMethod;
  /** README-style path with `:param` placeholders. */
  path: string;
  auth: RouteAuth;
  summary: string;
  /** Defaults to 200 for GET/PATCH/DELETE and 201 for POST. */
  status?: number;
  dataExample?: unknown;
  requestExample?: unknown;
  /** Honest stub failure documented as an error response, not a success body. */
  errorExample?: { status: number; code: string; message: string };
  /** Query names promised by README §8.2. */
  queryParams?: readonly string[];
}

export const ROUTE_CATALOG: readonly RouteSpec[] = [
  // Auth
  {
    method: 'post',
    path: '/api/v1/auth/register',
    auth: 'Public',
    summary: 'Create account and send a verification email',
    requestExample: { email: 'ada@example.com', password: 'Strong-Pass-123', name: 'Ada' },
    dataExample: { message: 'Account created. Verify your email before signing in.' },
  },
  {
    method: 'post',
    path: '/api/v1/auth/login',
    auth: 'Public',
    summary: 'Issue an access token and rotating refresh cookie',
    status: 200,
    requestExample: { email: 'ada@example.com', password: 'Strong-Pass-123' },
    dataExample: {
      user: { id: 'usr_1' },
      tokens: { accessToken: 'eyJ...', refreshToken: 'eyJ...' },
    },
  },
  {
    method: 'post',
    path: '/api/v1/auth/refresh',
    auth: 'Cookie',
    summary: 'Rotate the refresh token from the httpOnly cookie',
    status: 200,
    dataExample: {
      user: { id: 'usr_1' },
      tokens: { accessToken: 'eyJ...', refreshToken: 'eyJ...' },
    },
  },
  {
    method: 'post',
    path: '/api/v1/auth/logout',
    auth: 'Cookie',
    summary: 'Revoke the refresh cookie and blacklist its access token id',
    status: 200,
    dataExample: { message: 'Logged out' },
  },
  {
    method: 'post',
    path: '/api/v1/auth/verify-email',
    auth: 'Public',
    summary: 'Verify an email with a single-use token',
    status: 200,
    requestExample: { token: 'verify_...' },
    dataExample: { message: 'Email verified' },
  },
  {
    method: 'post',
    path: '/api/v1/auth/forgot-password',
    auth: 'Public',
    summary: 'Request a single-use password reset link',
    status: 200,
    requestExample: { email: 'ada@example.com' },
    dataExample: { message: 'If the account exists, a reset link was sent.' },
  },
  {
    method: 'post',
    path: '/api/v1/auth/reset-password',
    auth: 'Public',
    summary: 'Set a new password and invalidate existing sessions',
    status: 200,
    requestExample: { token: 'reset_...', password: 'New-Strong-Pass-123' },
    dataExample: { message: 'Password reset' },
  },
  {
    method: 'post',
    path: '/api/v1/auth/mfa/setup',
    auth: 'Bearer',
    summary: 'Begin MFA enrollment (MFA-ready scaffold)',
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'get',
    path: '/api/v1/auth/sessions',
    auth: 'Bearer',
    summary: 'List active sessions',
    dataExample: [
      {
        id: 'ses_1',
        createdAt: '2026-11-21T00:00:00.000Z',
        lastActivity: '2026-11-21T12:00:00.000Z',
        expiresAt: '2026-11-21T13:00:00.000Z',
      },
    ],
  },
  {
    method: 'delete',
    path: '/api/v1/auth/sessions/:id',
    auth: 'Bearer',
    summary: 'Revoke one active session',
    dataExample: { message: 'Session revoked' },
  },

  // Users
  {
    method: 'get',
    path: '/api/v1/users/me',
    auth: 'Bearer',
    summary: 'Current user and profile',
    dataExample: { id: 'usr_1', email: 'ada@example.com', roles: ['USER'] },
  },
  {
    method: 'patch',
    path: '/api/v1/users/me',
    auth: 'Bearer',
    summary: 'Update the current profile',
    requestExample: { firstName: 'Ada' },
    dataExample: { id: 'usr_1', firstName: 'Ada' },
  },
  {
    method: 'get',
    path: '/api/v1/users/me/risk-profile',
    auth: 'Bearer',
    summary: 'Read the current risk profile',
    dataExample: { profileType: 'MODERATE', riskPerTradePct: 1 },
  },
  {
    method: 'patch',
    path: '/api/v1/users/me/risk-profile',
    auth: 'Bearer',
    summary: 'Update risk-profile overrides within hard caps',
    requestExample: { riskPerTradePct: 1 },
    dataExample: { profileType: 'MODERATE', riskPerTradePct: 1 },
  },
  {
    method: 'get',
    path: '/api/v1/users/me/sessions',
    auth: 'Bearer',
    summary: "Current user's active sessions",
    dataExample: [
      {
        id: 'ses_1',
        createdAt: '2026-11-21T00:00:00.000Z',
        lastActivity: '2026-11-21T12:00:00.000Z',
        expiresAt: '2026-11-21T13:00:00.000Z',
      },
    ],
  },

  // Market
  {
    method: 'get',
    path: '/api/v1/market/pairs',
    auth: 'Bearer',
    summary: 'List seeded currency pairs with pip and point metadata',
    dataExample: {
      items: [
        {
          symbol: 'EUR/USD',
          pipSize: 0.0001,
          pointValue: 10,
          spreadPipsTypical: 1,
          active: true,
        },
      ],
      nextCursor: null,
      hasMore: false,
    },
  },
  {
    method: 'get',
    path: '/api/v1/market/quote',
    auth: 'Bearer',
    summary: 'Latest live quotes with data-freshness flags (freshOnly=true blocks stale data)',
    queryParams: ['symbols', 'freshOnly'],
    dataExample: {
      items: [
        {
          symbol: 'EUR/USD',
          bid: 1.0849,
          ask: 1.0851,
          spread: 0.0002,
          timestamp: '2026-11-24T12:00:00.000Z',
          provider: 'mock',
          dataFreshnessSeconds: 2,
          isStale: false,
          source: 'live',
        },
      ],
      asOf: '2026-11-24T12:00:02.000Z',
    },
    errorExample: {
      status: 503,
      code: 'MARKET_DATA_UNAVAILABLE',
      message: 'Current market data is unavailable.',
    },
  },
  {
    method: 'get',
    path: '/api/v1/market/candles',
    auth: 'Bearer',
    summary: 'Bounded OHLC history with keyset pagination and cached series',
    queryParams: ['symbol', 'timeframe', 'start', 'end', 'limit', 'order', 'cursor'],
    dataExample: {
      items: [
        {
          symbol: 'EUR/USD',
          timeframe: 'D1',
          timestamp: '2026-11-20T00:00:00.000Z',
          open: 1.0842,
          high: 1.091,
          low: 1.0801,
          close: 1.0876,
          volume: null,
          provider: 'mock',
        },
      ],
      limit: 50,
      nextCursor: 'eyJ0IjoiMjAyNi0xMS0yMFQwMDowMDowMC4wMDBaIiwiaSI6ImNkXzEifQ',
      hasMore: true,
      asOf: '2026-11-24T12:00:02.000Z',
      source: 'cache',
    },
    errorExample: {
      status: 422,
      code: 'BAD_REQUEST',
      message: 'Range must not exceed 1098 days',
    },
  },
  {
    method: 'get',
    path: '/api/v1/market/overview',
    auth: 'Bearer',
    summary: 'Aggregated market overview with staleness counts',
    dataExample: {
      asOf: '2026-11-24T12:00:02.000Z',
      totalPairs: 10,
      quotes: [
        {
          symbol: 'EUR/USD',
          bid: 1.0849,
          ask: 1.0851,
          spread: 0.0002,
          timestamp: '2026-11-24T12:00:00.000Z',
          provider: 'mock',
          dataFreshnessSeconds: 2,
          isStale: false,
          source: 'cache',
        },
      ],
      freshCount: 10,
      staleCount: 0,
      unavailableCount: 0,
      byProvider: { mock: 10 },
    },
    errorExample: {
      status: 503,
      code: 'MARKET_DATA_UNAVAILABLE',
      message: 'Current market data is unavailable.',
    },
  },

  // Analysis
  {
    method: 'get',
    path: '/api/v1/analysis/:symbol/technical',
    auth: 'Bearer',
    summary: 'Real indicator snapshot, contextual patterns and 0–100 technical score',
    queryParams: ['timeframe', 'indicators'],
    dataExample: {
      symbol: 'EUR/USD',
      timeframe: 'H1',
      asOf: '2026-11-24T12:00:00.000Z',
      source: 'ai',
      indicators: {
        RSI14: { value: 61.24, series: [58.1, 59.7, 61.24] },
        MACD: {
          value: { macd: 0.00021, signal: 0.00014, histogram: 0.00007 },
          series: [0.00003, 0.00005, 0.00007],
        },
        ATR14: { value: 0.00042, series: [0.00039, 0.00041, 0.00042] },
        OBV: { value: 1250, series: [1100, 1180, 1250], indicative: true },
      },
      patterns: [
        {
          pattern: 'HAMMER',
          score: 78.5,
          detectedAt: '2026-11-24T11:00:00.000Z',
          bodyRatio: 0.18,
          rangeRatio: 0.0042,
          upperWickRatio: 0.2,
          lowerWickRatio: 2.8,
          context: {
            trend: 'UP',
            regime: 'WEAK_UPTREND',
            supportResistanceDistancePct: 0.12,
            volatilityPct: 0.38,
            momentum: 58.2,
          },
        },
      ],
      regime: {
        regime: 'WEAK_UPTREND',
        confidence: 0.62,
        evidence: { adx: 23.4, atrPercentile: 54.2, reason: 'adx_ema_bullish' },
      },
      score: {
        score: 68.4,
        subScores: {
          trend: 72,
          momentum: 64,
          volatility: 58,
          levels: 70,
          patterns: 78,
          regime: 62,
        },
        weights: {
          trend: 0.3,
          momentum: 0.2,
          volatility: 0.1,
          levels: 0.15,
          patterns: 0.15,
          regime: 0.1,
        },
        regime: 'WEAK_UPTREND',
        evidenceCount: 42,
        band: { min: 60, max: 69, label: 'Watch' },
      },
      metadata: {
        indicatorVersion: 'p10.1',
        candleCount: 500,
        from: '2026-11-03T16:00:00.000Z',
        to: '2026-11-24T12:00:00.000Z',
        indicativeNote: 'OBV/VWAP are indicative: spot forex has no centralised volume.',
      },
    },
    errorExample: {
      status: 422,
      code: 'INSUFFICIENT_DATA',
      message: 'Not enough data is available for technical candles',
    },
  },
  {
    method: 'get',
    path: '/api/v1/analysis/:symbol/historical',
    auth: 'Bearer',
    summary: 'Real historical changes/volatility; feature-space NN similarity in P12',
    queryParams: ['timeframe', 'limit'],
    dataExample: {
      symbol: 'EUR/USD',
      timeframe: 'D1',
      asOf: '2026-11-24T12:00:02.000Z',
      periods: [
        {
          period: 'previous_day',
          from: '2026-11-23T12:00:02.000Z',
          to: '2026-11-24T12:00:02.000Z',
          open: 1.0842,
          close: 1.0876,
          changePct: 0.31,
          high: 1.091,
          low: 1.0801,
          candles: 1,
        },
      ],
      volatility: {
        timeframe: 'D1',
        annualizedPct: 6.42,
        periodPct: 0.38,
        sampleSize: 729,
        asOf: '2026-11-24T12:00:02.000Z',
      },
      similarConditions: [
        {
          timestamp: '2026-05-12T00:00:00.000Z',
          distance: 0.18,
          close: 1.0861,
          changePct: 0.24,
        },
      ],
      similarityMethod: 'feature-euclidean-v1.0',
      dataPoints: 730,
    },
    errorExample: {
      status: 422,
      code: 'INSUFFICIENT_DATA',
      message: 'Not enough data is available yet',
    },
  },
  {
    method: 'get',
    path: '/api/v1/analysis/:symbol/regime',
    auth: 'Bearer',
    summary: 'Real market-regime classification with ADX/EMA/ATR evidence',
    dataExample: {
      symbol: 'EUR/USD',
      timeframe: 'H1',
      asOf: '2026-11-24T12:00:00.000Z',
      source: 'cache',
      regime: 'WEAK_UPTREND',
      confidence: 0.62,
      evidence: {
        adx: 23.4,
        plusDi: 28.1,
        minusDi: 19.6,
        atrPercentile: 54.2,
        atrExpansionRatio: 1.02,
        priceVsEma200Pct: 0.42,
        emaStack: true,
        emaSlopePct: 0.18,
        reason: 'adx_ema_bullish',
      },
    },
    errorExample: {
      status: 422,
      code: 'INSUFFICIENT_DATA',
      message: 'Not enough data is available for technical candles',
    },
  },
  {
    method: 'get',
    path: '/api/v1/analysis/:symbol',
    auth: 'Bearer',
    summary: 'Real combined assessment: technical + regime + historical evidence',
    dataExample: {
      symbol: 'EUR/USD',
      timeframe: 'H1',
      asOf: '2026-11-24T12:00:02.000Z',
      technical: { symbol: 'EUR/USD', timeframe: 'H1', source: 'cache', score: { score: 68.4 } },
      historical: { symbol: 'EUR/USD', timeframe: 'D1', dataPoints: 730 },
      regime: { regime: 'WEAK_UPTREND', confidence: 0.62, evidence: { adx: 23.4 } },
      prediction: {
        symbol: 'EUR/USD',
        timeframe: 'H1',
        direction: 'LONG',
        probability: 0.72,
        confidence: 0.74,
        riskLevel: 'MEDIUM',
        modelVersion: 'xgb-v1.0.0',
      },
      modelStatus: 'ACTIVE',
      signalPolicy: { weight: 1, block: false, reason: null },
      pendingPhases: ['P11', 'P12', 'P17'],
    },
    errorExample: {
      status: 422,
      code: 'INSUFFICIENT_DATA',
      message: 'Not enough data is available for technical candles',
    },
  },
  {
    method: 'get',
    path: '/api/v1/analysis/:symbol/report',
    auth: 'Bearer',
    summary: 'AI market report (AI_SERVICE_UNAVAILABLE until P17)',
    errorExample: {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
    },
  },

  // News
  {
    method: 'get',
    path: '/api/v1/news',
    auth: 'Bearer',
    summary: 'Paginated, classified news feed (filters: currency, sentiment, impact)',
    dataExample: {
      items: [
        {
          id: 'news_01',
          source: 'mock-wire',
          title: 'Federal Reserve raises interest rates by 25 basis points',
          publishedAt: '2026-01-15T11:00:00.000Z',
          currencies: ['USD'],
          analysis: { eventType: 'INTEREST_RATES', sentiment: 'BULLISH', impact: 'HIGH' },
        },
      ],
      nextCursor: null,
      hasMore: false,
    },
  },
  {
    method: 'get',
    path: '/api/v1/news/:id',
    auth: 'Bearer',
    summary: 'News article with classification and safety metadata',
    dataExample: {
      id: 'news_01',
      source: 'mock-wire',
      title: 'Federal Reserve raises interest rates by 25 basis points',
      publishedAt: '2026-01-15T11:00:00.000Z',
      currencies: ['USD'],
      analysis: { eventType: 'INTEREST_RATES', sentiment: 'BULLISH', impact: 'HIGH' },
      safety: { injectionAttempted: false, redactions: 0, truncated: false },
    },
    errorExample: {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Unknown news article news_01',
    },
  },
  {
    method: 'get',
    path: '/api/v1/news/events',
    auth: 'Bearer',
    summary: 'Economic calendar events with risk-rule proximity',
    dataExample: {
      items: [
        {
          id: 'event_01',
          eventName: 'Fed Interest Rate Decision',
          currency: 'USD',
          eventClass: 'RATES',
          scheduledAt: '2026-01-15T12:30:00.000Z',
          impact: 'HIGH',
          minutesUntil: 30,
          imminent: true,
        },
      ],
      nextCursor: null,
      hasMore: false,
    },
  },
  {
    method: 'get',
    path: '/api/v1/news/sentiment/:symbol',
    auth: 'Bearer',
    summary: 'Impact and recency weighted pair sentiment, cached 5 minutes',
    dataExample: {
      symbol: 'EUR/USD',
      score: 72,
      sentiment: 'BULLISH',
      articleCount: 3,
      computedAt: '2026-01-15T12:00:00.000Z',
    },
    errorExample: {
      status: 422,
      code: 'INSUFFICIENT_DATA',
      message: 'Not enough data is available yet',
    },
  },

  // Signals and scanner
  {
    method: 'get',
    path: '/api/v1/signals',
    auth: 'Bearer',
    summary: 'Recent trade signals with versioned scores and evidence',
    dataExample: {
      items: [
        {
          id: 'sig_1',
          symbol: 'EUR/USD',
          action: 'LONG',
          direction: 'LONG',
          score: 82,
          probability: 0.74,
          confidence: 0.78,
          riskLevel: 'MEDIUM',
          scores: {
            technical: 0.25,
            historical: 0.2,
            ml: 0.25,
            news: 0.1,
            regime: 0.1,
            risk: 0.1,
            components: {
              technical: 88,
              historical: 72,
              ml: 84,
              news: 65,
              regime: 70,
              risk: 90,
            },
            weightsVersion: 'v1.0',
            band: 'Strong setup',
          },
          reasons: ['ml: Model predicts LONG with probability 0.74'],
          noTradeReasons: [],
          generatedAt: '2026-01-15T12:00:00.000Z',
        },
      ],
      limit: 50,
      nextCursor: null,
      hasMore: false,
    },
    errorExample: {
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Invalid signal filters',
    },
  },
  {
    method: 'get',
    path: '/api/v1/signals/:id',
    auth: 'Bearer',
    summary: 'Signal evidence, weight snapshot and feature values',
    dataExample: {
      id: 'sig_1',
      symbol: 'EUR/USD',
      action: 'LONG',
      score: 82,
      noTradeReasons: [],
      supportingEvidence: [{ source: 'ml', claim: 'Model predicts LONG', value: 0.74 }],
      contradictingEvidence: [{ source: 'risk', claim: 'Spread is elevated', value: 1.4 }],
      status: 'ACTIVE',
      featureVersion: 'v1.0',
      analyses: [],
    },
    errorExample: {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Trade signal sig_1 was not found',
    },
  },
  {
    method: 'get',
    path: '/api/v1/scanner',
    auth: 'Bearer',
    summary: 'All-pairs scan table, cached for five minutes',
    queryParams: ['sortBy', 'order'],
    dataExample: {
      items: [
        {
          symbol: 'EUR/USD',
          action: 'LONG',
          score: 82,
          probability: 0.74,
          riskLevel: 'MEDIUM',
          volatility: 0.8,
          band: 'Strong setup',
          noTradeReasons: [],
        },
      ],
      limit: 50,
      nextCursor: null,
      hasMore: false,
    },
    errorExample: {
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Invalid scanner sort or order',
    },
  },

  // Risk
  {
    method: 'post',
    path: '/api/v1/risk/calculate',
    auth: 'Bearer',
    summary: 'Calculate hypothetical position size and risk metrics',
    status: 200,
    requestExample: {
      symbol: 'EUR/USD',
      balance: 10000,
      riskPerTradePct: 1,
      entry: 1.1,
      stopLoss: 1.095,
      takeProfit: 1.11,
    },
    dataExample: {
      symbol: 'EUR/USD',
      side: 'LONG',
      pipSize: 0.0001,
      pointValue: 10,
      riskAmount: 100,
      stopDistance: 0.005,
      stopPips: 50,
      positionSize: 0.2,
      maxLoss: 100,
      riskReward: 2,
      potentialProfit: 200,
      potentialLoss: 100,
      exposure: 5.5,
      drawdown: 0,
    },
  },
  {
    method: 'get',
    path: '/api/v1/risk/rules',
    auth: 'Bearer',
    summary: 'Effective rules for the current risk profile',
    dataExample: {
      items: [
        {
          code: 'MIN_RISK_REWARD',
          rule: 'Minimum risk/reward',
          defaultSeverity: 'PASS',
          message: 'Evaluates minimum risk/reward',
          threshold: 1.5,
          source: 'profile',
        },
      ],
      profile: {
        name: 'Moderate',
        profileType: 'MODERATE',
        riskPerTradePct: 1,
        maxOpenPositions: 5,
        maxDailyLossPct: 3,
        minRiskReward: 1.5,
      },
      thresholds: { minConfidence: 0.6, maxDataFreshnessSeconds: 120 },
    },
  },
  {
    method: 'post',
    path: '/api/v1/risk/evaluate',
    auth: 'Bearer',
    summary: 'Evaluate an order against all risk rules',
    status: 200,
    requestExample: {
      order: {
        symbol: 'EUR/USD',
        side: 'LONG',
        entry: 1.1,
        stopLoss: 1.095,
        takeProfit: 1.11,
        size: 0.2,
      },
      context: { confidence: 0.9, dataFreshnessSeconds: 2, missingFeatures: [] },
    },
    dataExample: {
      positionSize: 2,
      maxLoss: 1000,
      riskReward: 2,
      potentialProfit: 2000,
      potentialLoss: 1000,
      exposure: 5.5,
      drawdown: 0,
      status: 'PASS',
      action: 'TRADE',
      verdicts: [{ rule: 'Minimum risk/reward', code: 'MIN_RISK_REWARD', status: 'PASS' }],
      reasonCodes: [],
      noTradeReasons: [],
    },
    errorExample: {
      status: 422,
      code: 'NO_TRADE_RULE_VIOLATION',
      message: 'Order blocked by risk rules',
    },
  },

  // Backtests
  {
    method: 'post',
    path: '/api/v1/backtests',
    auth: 'Bearer',
    summary: 'Queue a backtest',
    requestExample: {
      symbol: 'EUR/USD',
      strategy: 'ma-cross',
      timeframe: 'H1',
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-02-01T00:00:00Z',
      startingCapital: 10000,
      riskPerTradePct: 1,
    },
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'get',
    path: '/api/v1/backtests',
    auth: 'Bearer',
    summary: "User's backtests",
    dataExample: { items: [], nextCursor: null, hasMore: false },
  },
  {
    method: 'get',
    path: '/api/v1/backtests/:id',
    auth: 'Bearer',
    summary: 'Backtest status, results and equity curve',
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },

  // Paper trading
  {
    method: 'get',
    path: '/api/v1/paper-trading/account',
    auth: 'Bearer',
    summary: 'Virtual account balance, equity and performance',
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'get',
    path: '/api/v1/paper-trading/positions',
    auth: 'Bearer',
    summary: 'Open and historical simulated positions',
    dataExample: { items: [], nextCursor: null, hasMore: false },
  },
  {
    method: 'post',
    path: '/api/v1/paper-trading/positions',
    auth: 'Bearer',
    summary: 'Open a risk-validated simulated position',
    requestExample: {
      symbol: 'EUR/USD',
      side: 'LONG',
      entry: 1.1,
      stopLoss: 1.095,
      takeProfit: 1.11,
      size: 1000,
    },
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'patch',
    path: '/api/v1/paper-trading/positions/:id',
    auth: 'Bearer',
    summary: 'Modify a position stop loss or take profit',
    requestExample: { stopLoss: 1.096 },
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'delete',
    path: '/api/v1/paper-trading/positions/:id',
    auth: 'Bearer',
    summary: 'Close a simulated position at market',
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },

  // Portfolio
  {
    method: 'get',
    path: '/api/v1/portfolio',
    auth: 'Bearer',
    summary: 'Portfolio summary and positions',
    dataExample: { items: [], positions: [], nextCursor: null, hasMore: false },
  },
  {
    method: 'get',
    path: '/api/v1/portfolio/exposure',
    auth: 'Bearer',
    summary: 'Per-currency exposure and warnings',
    dataExample: {
      items: [{ currency: 'EUR', notional: 5500, exposurePct: 5.5, warning: 'MEDIUM' }],
      warnings: [],
      totalExposurePct: 5.5,
      nextCursor: null,
      hasMore: false,
    },
  },

  // Watchlist
  {
    method: 'get',
    path: '/api/v1/watchlist',
    auth: 'Bearer',
    summary: 'List watchlists',
    dataExample: { items: [], nextCursor: null, hasMore: false },
  },
  {
    method: 'post',
    path: '/api/v1/watchlist',
    auth: 'Bearer',
    summary: 'Create a watchlist',
    requestExample: { name: 'Majors' },
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'delete',
    path: '/api/v1/watchlist',
    auth: 'Bearer',
    summary: 'Delete a watchlist',
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'get',
    path: '/api/v1/watchlist/items',
    auth: 'Bearer',
    summary: 'List watchlist items',
    dataExample: { items: [], nextCursor: null, hasMore: false },
  },
  {
    method: 'post',
    path: '/api/v1/watchlist/items',
    auth: 'Bearer',
    summary: 'Add or reorder a watchlist item',
    requestExample: { symbol: 'EUR/USD', sortOrder: 0 },
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'delete',
    path: '/api/v1/watchlist/items',
    auth: 'Bearer',
    summary: 'Remove a watchlist item',
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },

  // Notifications
  {
    method: 'get',
    path: '/api/v1/notifications',
    auth: 'Bearer',
    summary: 'List notifications',
    dataExample: { items: [], nextCursor: null, hasMore: false },
  },
  {
    method: 'patch',
    path: '/api/v1/notifications/:id/read',
    auth: 'Bearer',
    summary: 'Mark a notification read',
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },

  // AI
  {
    method: 'get',
    path: '/api/v1/ai/assessment/:symbol',
    auth: 'Bearer',
    summary: 'Structured assessment with explanation (AI_SERVICE_UNAVAILABLE)',
    errorExample: {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
    },
  },
  {
    method: 'post',
    path: '/api/v1/ai/explain',
    auth: 'Bearer',
    summary: 'Explain a prediction (AI_SERVICE_UNAVAILABLE)',
    requestExample: { predictionId: 'pred_1' },
    errorExample: {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
    },
  },
  {
    method: 'post',
    path: '/api/v1/ai/assistant',
    auth: 'Bearer',
    summary: 'Grounded assistant chat (AI_SERVICE_UNAVAILABLE)',
    requestExample: { message: 'What changed for EUR/USD?' },
    errorExample: {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
    },
  },

  // Admin
  {
    method: 'get',
    path: '/api/v1/admin/health',
    auth: 'ADMIN',
    summary: 'System, database, Redis and AI health',
    dataExample: {
      status: 'ok',
      dependencies: {
        redis: { status: 'up', latencyMs: 1, error: null },
        database: { status: 'up', latencyMs: 2, error: null },
        ai: { status: 'up', latencyMs: 3, error: null },
      },
    },
  },
  {
    method: 'get',
    path: '/api/v1/admin/users',
    auth: 'ADMIN',
    summary: 'User management list',
    dataExample: { items: [], nextCursor: null, hasMore: false },
  },
  {
    method: 'get',
    path: '/api/v1/admin/providers',
    auth: 'ADMIN',
    summary: 'Market-data provider status',
    dataExample: {
      items: [
        {
          name: 'mock',
          role: 'primary',
          status: 'HEALTHY',
          enabled: true,
          latencyMs: 3,
          lastCheckedAt: '2026-11-24T12:00:00.000Z',
          requestsPerMinute: 5,
        },
      ],
    },
  },
  {
    method: 'patch',
    path: '/api/v1/admin/providers',
    auth: 'ADMIN',
    summary: 'Disable an unhealthy market-data provider',
    requestExample: { provider: 'twelvedata', enabled: false },
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'get',
    path: '/api/v1/admin/models',
    auth: 'ADMIN',
    summary: 'Model versions, runs and metrics',
    dataExample: { items: [], nextCursor: null, hasMore: false },
  },
  {
    method: 'get',
    path: '/api/v1/admin/predictions/performance',
    auth: 'ADMIN',
    summary: 'Accuracy, Brier score, calibration and drift status',
    dataExample: { items: [] },
  },
  {
    method: 'get',
    path: '/api/v1/admin/audit-logs',
    auth: 'ADMIN',
    summary: 'Audit log query',
    dataExample: { items: [], nextCursor: null, hasMore: false },
  },

  // Health
  {
    method: 'get',
    path: '/api/v1/health',
    auth: 'Public',
    summary: 'Liveness probe',
    dataExample: { status: 'ok' },
  },
  {
    method: 'get',
    path: '/api/v1/health/ready',
    auth: 'Public',
    summary: 'Readiness probe (database, Redis, AI)',
    dataExample: {
      status: 'ok',
      dependencies: {
        redis: { status: 'up', latencyMs: 1, error: null },
        database: { status: 'up', latencyMs: 2, error: null },
        ai: { status: 'up', latencyMs: 3, error: null },
      },
    },
  },
];

export function catalogKey(method: HttpMethod, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

export function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/, 1)[0];
  const withApi = withoutQuery.startsWith('/api/v1')
    ? withoutQuery
    : `/api/v1${withoutQuery.startsWith('/') ? '' : '/'}${withoutQuery}`;
  const normalized = withApi.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  return normalized.replace(/:([\w-]+)/g, '{$1}');
}

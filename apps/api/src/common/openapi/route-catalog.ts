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
    summary: 'Bounded OHLC history (INSUFFICIENT_DATA until P09)',
    queryParams: ['symbol', 'timeframe', 'start', 'end', 'limit'],
    errorExample: {
      status: 422,
      code: 'INSUFFICIENT_DATA',
      message: 'Not enough data is available yet',
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
    summary: 'Technical indicator snapshot (AI_SERVICE_UNAVAILABLE until P10)',
    errorExample: {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
    },
  },
  {
    method: 'get',
    path: '/api/v1/analysis/:symbol/historical',
    auth: 'Bearer',
    summary: 'Historical similarity assessment (AI_SERVICE_UNAVAILABLE)',
    errorExample: {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
    },
  },
  {
    method: 'get',
    path: '/api/v1/analysis/:symbol/regime',
    auth: 'Bearer',
    summary: 'Market-regime classification (AI_SERVICE_UNAVAILABLE)',
    errorExample: {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
    },
  },
  {
    method: 'get',
    path: '/api/v1/analysis/:symbol',
    auth: 'Bearer',
    summary: 'Combined assessment (AI_SERVICE_UNAVAILABLE)',
    errorExample: {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
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
    summary: 'Paginated news feed',
    dataExample: { items: [], nextCursor: null, hasMore: false },
  },
  {
    method: 'get',
    path: '/api/v1/news/:id',
    auth: 'Bearer',
    summary: 'News article with analysis',
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'get',
    path: '/api/v1/news/events',
    auth: 'Bearer',
    summary: 'Economic calendar events',
    dataExample: { items: [], nextCursor: null, hasMore: false },
  },
  {
    method: 'get',
    path: '/api/v1/news/sentiment/:symbol',
    auth: 'Bearer',
    summary: 'Aggregated pair sentiment (INSUFFICIENT_DATA until ingestion lands)',
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
    summary: 'Recent trade signals (INSUFFICIENT_DATA until P16)',
    errorExample: {
      status: 422,
      code: 'INSUFFICIENT_DATA',
      message: 'Not enough data is available yet',
    },
  },
  {
    method: 'get',
    path: '/api/v1/signals/:id',
    auth: 'Bearer',
    summary: 'Signal evidence and explanation',
    errorExample: {
      status: 422,
      code: 'INSUFFICIENT_DATA',
      message: 'Not enough data is available yet',
    },
  },
  {
    method: 'get',
    path: '/api/v1/scanner',
    auth: 'Bearer',
    summary: 'All-pairs scan table (INSUFFICIENT_DATA until P16)',
    queryParams: ['sortBy', 'order'],
    errorExample: {
      status: 422,
      code: 'INSUFFICIENT_DATA',
      message: 'Not enough data is available yet',
    },
  },

  // Risk
  {
    method: 'post',
    path: '/api/v1/risk/calculate',
    auth: 'Bearer',
    summary: 'Calculate hypothetical position size and risk metrics',
    requestExample: {
      symbol: 'EUR/USD',
      balance: 10000,
      riskPerTradePct: 1,
      entry: 1.1,
      stopLoss: 1.095,
      takeProfit: 1.11,
    },
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
    },
  },
  {
    method: 'get',
    path: '/api/v1/risk/rules',
    auth: 'Bearer',
    summary: 'Effective rules for the current risk profile',
    dataExample: { items: [] },
  },
  {
    method: 'post',
    path: '/api/v1/risk/evaluate',
    auth: 'Bearer',
    summary: 'Evaluate an order against all risk rules',
    requestExample: { order: { symbol: 'EUR/USD', side: 'LONG' } },
    errorExample: {
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet',
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
    dataExample: { items: [], warnings: [], nextCursor: null, hasMore: false },
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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEMA_PATH = resolve(__dirname, '..', '..', 'prisma', 'schema.prisma');
const schema = readFileSync(SCHEMA_PATH, 'utf8');

function fieldsOf(model: string): Set<string> {
  const match = schema.match(new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Prisma model ${model} is missing`);
  const fields = match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('@@'))
    .map((line) => line.split(/\s+/)[0]);
  return new Set(fields);
}

/** README §7 core models: guard the DB side of the shared contracts. */
const CORE_SCHEMA_FIELDS: Record<string, string[]> = {
  RiskProfile: ['id', 'userId', 'name', 'riskPerTradePct', 'maxOpenPositions'],
  CurrencyPair: ['id', 'symbol', 'baseCurrency', 'quoteCurrency', 'isActive'],
  MarketCandle: ['pairId', 'timeframe', 'timestamp', 'open', 'high', 'low', 'close', 'provider'],
  MarketQuote: ['pairId', 'bid', 'ask', 'spread', 'timestamp', 'provider'],
  TechnicalIndicator: ['pairId', 'timeframe', 'timestamp', 'name', 'value', 'computedAt'],
  MarketFeature: ['pairId', 'timeframe', 'timestamp', 'featureVersion', 'values'],
  NewsArticle: ['id', 'source', 'title', 'publishedAt', 'currencies'],
  NewsAnalysis: ['articleId', 'eventType', 'sentiment', 'impact', 'confidence', 'affectedPairs'],
  EconomicEvent: ['eventName', 'currency', 'scheduledAt', 'impact'],
  ModelVersion: ['name', 'version', 'featureVersion', 'metrics', 'status'],
  ModelRun: ['modelVersionId', 'startedAt', 'trainRange', 'testRange', 'seed', 'metrics'],
  Prediction: [
    'pairId',
    'timeframe',
    'horizon',
    'direction',
    'probability',
    'confidence',
    'riskLevel',
  ],
  PredictionOutcome: ['predictionId', 'resolvedAt', 'actualMovePct', 'label', 'correct'],
  AIAnalysis: [
    'subjectType',
    'subjectId',
    'summary',
    'supportingEvidence',
    'contradictingEvidence',
    'timestamp',
  ],
  TradeSignal: [
    'pairId',
    'action',
    'score',
    'probability',
    'confidence',
    'riskLevel',
    'scores',
    'reasons',
    'noTradeReasons',
  ],
  SignalFeature: ['signalId', 'featureVersion', 'values'],
  Backtest: [
    'userId',
    'pairId',
    'strategy',
    'timeframe',
    'rangeStart',
    'rangeEnd',
    'startingCapital',
    'riskPerTradePct',
  ],
  BacktestTrade: ['backtestId', 'direction', 'entryAt', 'entryPrice', 'exitAt', 'exitPrice', 'pnl'],
  Portfolio: ['userId', 'name', 'balance', 'initialBalance'],
  Position: [
    'portfolioId',
    'pairId',
    'side',
    'status',
    'entryPrice',
    'size',
    'stopLoss',
    'takeProfit',
  ],
  Watchlist: ['userId', 'name'],
  WatchlistItem: ['watchlistId', 'pairId', 'sortOrder'],
  Notification: ['userId', 'type', 'title', 'body', 'payload'],
  AuditLog: ['userId', 'action', 'metadata', 'requestId', 'timestamp'],
  SystemEvent: ['level', 'source', 'message', 'code', 'occurredAt'],
  User: ['email', 'passwordHash', 'role'],
  UserProfile: ['userId', 'timezone', 'baseCurrency'],
};

/** API DTOs use `symbol` for a pair; the DB stores its foreign key as `pairId`. */
interface Mapping {
  model: string;
  dto: string;
  shared: string[];
  aliases: Record<string, string>;
}

const TS_TO_DB_MAPPINGS: Mapping[] = [
  {
    model: 'CurrencyPair',
    dto: 'CurrencyPair',
    shared: ['id', 'symbol', 'baseCurrency', 'quoteCurrency', 'pipSize'],
    aliases: { active: 'isActive' },
  },
  {
    model: 'MarketCandle',
    dto: 'Candle',
    shared: ['timeframe', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'provider'],
    aliases: { symbol: 'pairId' },
  },
  {
    model: 'MarketQuote',
    dto: 'MarketQuote',
    shared: ['bid', 'ask', 'spread', 'timestamp', 'provider'],
    aliases: { symbol: 'pairId' },
  },
  {
    model: 'MarketFeature',
    dto: 'FeatureVector',
    shared: ['timeframe', 'timestamp', 'featureVersion'],
    aliases: { symbol: 'pairId', features: 'values' },
  },
  {
    model: 'Prediction',
    dto: 'Prediction',
    shared: [
      'id',
      'timeframe',
      'horizon',
      'direction',
      'probability',
      'confidence',
      'riskLevel',
      'createdAt',
    ],
    aliases: { symbol: 'pairId', modelVersion: 'modelVersionId' },
  },
  {
    model: 'TradeSignal',
    dto: 'TradeSignal',
    shared: [
      'id',
      'action',
      'score',
      'probability',
      'confidence',
      'riskLevel',
      'direction',
      'scores',
      'reasons',
      'noTradeReasons',
      'generatedAt',
    ],
    aliases: { symbol: 'pairId' },
  },
  {
    model: 'Portfolio',
    dto: 'PortfolioSummary',
    shared: ['id', 'balance'],
    aliases: {},
  },
  {
    model: 'Position',
    dto: 'Position',
    shared: [
      'id',
      'side',
      'status',
      'entryPrice',
      'size',
      'stopLoss',
      'takeProfit',
      'unrealizedPnl',
      'realizedPnl',
      'openedAt',
      'closedAt',
    ],
    aliases: { symbol: 'pairId' },
  },
  {
    model: 'Watchlist',
    dto: 'Watchlist',
    shared: ['id', 'name'],
    aliases: {},
  },
  {
    model: 'WatchlistItem',
    dto: 'WatchlistItem',
    shared: ['id', 'sortOrder'],
    aliases: { symbol: 'pairId' },
  },
  {
    model: 'Notification',
    dto: 'Notification',
    shared: ['id', 'type', 'title', 'body', 'payload', 'createdAt'],
    aliases: {},
  },
  {
    model: 'AIAnalysis',
    dto: 'AIAnalysis',
    shared: [
      'id',
      'subjectType',
      'subjectId',
      'summary',
      'supportingEvidence',
      'contradictingEvidence',
      'explanationText',
      'llmModel',
      'timestamp',
    ],
    aliases: { freshnessSeconds: 'dataFreshness' },
  },
];

describe('P05 database/schema drift guard', () => {
  it.each(Object.entries(CORE_SCHEMA_FIELDS))(
    '%s keeps its documented fields',
    (model, expected) => {
      const fields = fieldsOf(model);
      for (const field of expected) {
        expect({ model, field, present: fields.has(field) }).toEqual({
          model,
          field,
          present: true,
        });
      }
    },
  );

  it.each(TS_TO_DB_MAPPINGS)('$dto ↔ $model field names stay aligned', (mapping) => {
    const fields = fieldsOf(mapping.model);
    for (const field of mapping.shared) {
      expect({ dto: mapping.dto, field, inDb: fields.has(field) }).toEqual({
        dto: mapping.dto,
        field,
        inDb: true,
      });
    }
    for (const [dtoField, dbField] of Object.entries(mapping.aliases)) {
      expect({ dto: mapping.dto, dtoField, inDb: fields.has(dbField) }).toEqual({
        dto: mapping.dto,
        dtoField,
        inDb: true,
      });
    }
  });
});

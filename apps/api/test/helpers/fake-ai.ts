import { FEATURE_NAMES, env } from '@ts/config';
import type { FeaturesResponse, IndicatorsResponse, TrainResponse } from '@ts/types';
import type { AiFetch } from '../../src/modules/technical-analysis/ai-engine.client';

/** Deterministic P10 AI response; the API still owns persistence and caching. */
export function fakeIndicatorsResponse(
  overrides: Partial<IndicatorsResponse> = {},
): IndicatorsResponse {
  return {
    symbol: 'EUR/USD',
    timeframe: 'H1',
    computedAt: '2026-11-24T12:00:00.000Z',
    indicators: {
      RSI14: { value: 61.24, series: [58.1, 59.7, 61.24] },
      MACD: {
        value: { macd: 0.00021, signal: 0.00014, histogram: 0.00007 },
        series: [0.00003, 0.00005, 0.00007],
      },
      ATR14: { value: 0.00042, series: [0.00039, 0.00041, 0.00042] },
      OBV: { value: 1250, series: [1100, 1180, 1250], indicative: true },
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
      },
      metadata: {
        candleCount: 500,
        from: '2026-11-03T16:00:00.000Z',
        to: '2026-11-24T12:00:00.000Z',
        indicativeNote: 'OBV/VWAP are indicative: spot forex has no centralised volume.',
      },
    },
    ...overrides,
  };
}

export interface FakeAiCall {
  url: string;
  init?: RequestInit;
  body: {
    symbol?: string;
    timeframe?: string;
    indicators?: string[];
    candles?: Array<Record<string, unknown>>;
    featureVersion?: string;
    asOf?: string;
    timestamps?: string[];
    news?: unknown[];
    events?: unknown[];
    peerCandles?: Record<string, unknown[]>;
  };
}

/** Records every call so tests can assert the bounded, token-protected payload. */
export function fakeAiFetch(response: IndicatorsResponse = fakeIndicatorsResponse()) {
  const calls: FakeAiCall[] = [];
  const fetch: AiFetch = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as FakeAiCall['body'];
    calls.push({ url, init, body });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ...response,
        symbol: body.symbol ?? response.symbol,
        timeframe: body.timeframe ?? response.timeframe,
      }),
    } as Response;
  };
  return { fetch, calls };
}

/**
 * Deterministic P12 AI response. Vector values vary with the timestamp so NN
 * similarity can be asserted without standing up the Python service.
 */
export function fakeFeaturesFetch() {
  const calls: FakeAiCall[] = [];
  const fetch: AiFetch = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as FakeAiCall['body'];
    calls.push({ url, init, body });
    const timestamps = body.timestamps ?? [body.asOf ?? '2026-11-24T00:00:00.000Z'];
    const vectors = timestamps.map((timestamp, index) => {
      const seed = Date.parse(timestamp) / 3_600_000;
      const features = Object.fromEntries(
        FEATURE_NAMES.map((name, featureIndex) => [
          name,
          Number(((seed % 97) / 97 + featureIndex / 1000 + index / 10000).toFixed(8)),
        ]),
      );
      return { timestamp, features };
    });
    const response: FeaturesResponse = {
      symbol: body.symbol ?? 'EUR/USD',
      timeframe: (body.timeframe ?? 'H1') as FeaturesResponse['timeframe'],
      featureVersion: body.featureVersion ?? env.FEATURE_VERSION,
      timestamp: vectors[vectors.length - 1].timestamp,
      features: vectors[vectors.length - 1].features,
      vectors,
    };
    return {
      ok: true,
      status: 200,
      json: async () => response,
    } as Response;
  };
  return { fetch, calls };
}

/** Deterministic P13 training response for the internal model-eval worker. */
export function fakeTrainFetch(overrides: Partial<TrainResponse> = {}) {
  const calls: Array<{ url: string; init?: RequestInit; body: Record<string, unknown> }> = [];
  const response: TrainResponse = {
    datasetVersion: '20260101-20261124-abcdef12',
    datasetChecksum: 'abcdef12',
    datasetRows: 300,
    featureVersion: env.FEATURE_VERSION,
    selectedModel: 'xgboost',
    selectedVersion: '1.0.0',
    selectionReason: 'xgbeat: all baselines beaten',
    xgboostGatePassed: true,
    calibrationMethod: 'platt',
    modelRuns: 9,
    models: { xgboost: { artifactPath: './models/xgboost/1.0.0', sha256: 'abc' } },
    comparison: [{ name: 'xgboost', brier: 0.12, rocAuc: 0.71 }],
    walkForward: { xgboost: { brier: 0.12, rocAuc: 0.71, folds: 3 } },
    ...overrides,
  };
  const fetch: AiFetch = async (url, init) => {
    calls.push({
      url,
      init,
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return { ok: true, status: 200, json: async () => response } as Response;
  };
  return { fetch, calls, response };
}

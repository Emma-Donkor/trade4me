import type {
  ApiError,
  ApiSuccess,
  ExplainResponse,
  IndicatorsResponse,
  PredictRequest,
  PredictResponse,
  WebSocketEvent,
} from './contracts';

describe('@ts/types contracts', () => {
  it('describes the AI service response shapes', () => {
    const request: PredictRequest = { symbol: 'EUR/USD', timeframe: 'H1', horizon: 5 };
    const prediction: PredictResponse = {
      symbol: request.symbol,
      timeframe: request.timeframe,
      direction: 'LONG',
      probability: 0.72,
      confidence: 0.81,
      riskLevel: 'MEDIUM',
      modelVersion: 'xgboost-1.0.0',
    };
    const indicators: IndicatorsResponse = {
      symbol: 'EUR/USD',
      timeframe: 'H1',
      indicators: { rsi: 61.2 },
      computedAt: '2026-01-01T00:00:00.000Z',
    };
    const explanation: ExplainResponse = {
      predictionId: 'pred-1',
      summary: 'Momentum supports the direction.',
      factors: [{ name: 'RSI', impact: 0.4 }],
    };

    expect(prediction.direction).toBe('LONG');
    expect(indicators.indicators.rsi).toBe(61.2);
    expect(explanation.factors).toHaveLength(1);
  });

  it('describes the API envelope and websocket event shapes', () => {
    const success: ApiSuccess<string> = { success: true, data: 'ok', requestId: 'req-1' };
    const error: ApiError = {
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid input', requestId: 'req-2' },
    };
    const event: WebSocketEvent<{ price: number }> = {
      event: 'quote:update',
      data: { price: 1.0842 },
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    expect(success.success).toBe(true);
    expect(error.error.code).toBe('BAD_REQUEST');
    expect(event.event).toBe('quote:update');
  });
});

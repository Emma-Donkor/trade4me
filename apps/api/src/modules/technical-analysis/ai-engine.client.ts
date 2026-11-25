import { Inject, Injectable } from '@nestjs/common';
import { configuration } from '../../config/configuration';
import { aiUnavailable, insufficientData } from '../../common/errors/stub-errors';
import type {
  DriftRequest,
  DriftResponse,
  FeaturesRequest,
  FeaturesResponse,
  IndicatorsRequest,
  IndicatorsResponse,
  PredictRequest,
  PredictResponse,
  TrainRequest,
  TrainResponse,
} from '@ts/types';
import {
  assistantResponseSchema,
  driftRequestSchema,
  driftResponseSchema,
  explanationRequestV2Schema,
  explanationResultV2Schema,
  featuresResponseSchema,
  indicatorsResponseSchema,
  marketReportViewSchema,
  newsEnhancerInputSchema,
  newsEnhancerResultSchema,
  predictRequestSchema,
  predictResponseSchema,
  reportInputSchema,
  trainRequestSchema,
  trainResponseSchema,
  type AssistantInput,
  type AssistantResponse,
  type ExplanationRequestV2,
  type ExplanationResultV2,
  type MarketReportView,
  type NewsEnhancerInput,
  type NewsEnhancerResult,
  type ReportInput,
} from '@ts/validation';

/** Injectable boundary so tests can replace the AI engine without a socket. */
export const AI_ENGINE_FETCH = Symbol('AI_ENGINE_FETCH');
export type AiFetch = (url: string, init?: RequestInit) => Promise<Response>;

const AI_ENGINE_TIMEOUT_MS = 15_000;
const AI_TRAIN_TIMEOUT_MS = 180_000;

/** Thin, validated HTTP client for the internal Python math authority. */
@Injectable()
export class AiEngineClient {
  constructor(@Inject(AI_ENGINE_FETCH) private readonly fetch: AiFetch) {}

  async indicators(request: IndicatorsRequest): Promise<IndicatorsResponse> {
    const url = `${configuration.app.aiUrl}/api/v1/ai/indicators`;
    try {
      const response = await this.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Service-Token': configuration.app.aiServiceToken,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(AI_ENGINE_TIMEOUT_MS),
      });
      if (!response.ok) aiUnavailable(`indicators (HTTP ${response.status})`);
      return indicatorsResponseSchema.parse(await response.json()) as IndicatorsResponse;
    } catch (error) {
      if (error instanceof Error && 'status' in error) throw error;
      aiUnavailable('indicators');
    }
  }

  /** P12 — validated batch feature build. 422 means missing required inputs. */
  async features(request: FeaturesRequest): Promise<FeaturesResponse> {
    const url = `${configuration.app.aiUrl}/api/v1/ai/features`;
    try {
      const response = await this.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Service-Token': configuration.app.aiServiceToken,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(AI_ENGINE_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: { code?: string; message?: string; missing?: string[] };
      };
      if (!response.ok) {
        if (response.status === 422) {
          insufficientData('features', {
            missing: payload.detail?.missing ?? [],
            message: payload.detail?.message ?? 'Feature inputs are incomplete',
          });
        }
        aiUnavailable(`features (HTTP ${response.status})`);
      }
      return featuresResponseSchema.parse(payload) as FeaturesResponse;
    } catch (error) {
      if (error instanceof Error && 'status' in error) throw error;
      aiUnavailable('features');
    }
  }

  /** P14 — calibrated inference over the caller's exact versioned vector. */
  async predict(request: PredictRequest): Promise<PredictResponse> {
    predictRequestSchema.parse(request);
    const url = `${configuration.app.aiUrl}/api/v1/ai/predict`;
    try {
      const response = await this.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Service-Token': configuration.app.aiServiceToken,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(AI_ENGINE_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string | { code?: string; message?: string };
      };
      if (!response.ok) {
        if (response.status === 422) {
          insufficientData('prediction', {
            message:
              typeof payload.detail === 'string'
                ? payload.detail
                : (payload.detail?.message ?? 'Prediction inputs are incomplete'),
          });
        }
        aiUnavailable(`prediction (HTTP ${response.status})`);
      }
      return predictResponseSchema.parse(payload) as PredictResponse;
    } catch (error) {
      if (error instanceof Error && 'status' in error) throw error;
      aiUnavailable('prediction');
    }
  }

  /** P14 — daily rolling-window drift verdict from the math authority. */
  async drift(request: DriftRequest): Promise<DriftResponse> {
    driftRequestSchema.parse(request);
    const url = `${configuration.app.aiUrl}/api/v1/ai/ml/drift`;
    try {
      const response = await this.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Service-Token': configuration.app.aiServiceToken,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(AI_ENGINE_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string | { message?: string };
      };
      if (!response.ok) {
        if (response.status === 422) {
          insufficientData('model drift', {
            message:
              typeof payload.detail === 'string'
                ? payload.detail
                : (payload.detail?.message ?? 'Drift inputs are incomplete'),
          });
        }
        aiUnavailable(`model drift (HTTP ${response.status})`);
      }
      return driftResponseSchema.parse(payload) as DriftResponse;
    } catch (error) {
      if (error instanceof Error && 'status' in error) throw error;
      aiUnavailable('model drift');
    }
  }

  /** P13 — trigger the internal walk-forward pipeline for scheduled retraining. */
  async train(request: TrainRequest): Promise<TrainResponse> {
    trainRequestSchema.parse(request);
    const url = `${configuration.app.aiUrl}/api/v1/ai/ml/train`;
    try {
      const response = await this.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Service-Token': configuration.app.aiServiceToken,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(AI_TRAIN_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string | { message?: string };
      };
      if (!response.ok) {
        if (response.status === 422) {
          insufficientData('model training', {
            message:
              typeof payload.detail === 'string'
                ? payload.detail
                : (payload.detail?.message ?? 'Training inputs are incomplete'),
          });
        }
        aiUnavailable(`training (HTTP ${response.status})`);
      }
      return trainResponseSchema.parse(payload) as TrainResponse;
    } catch (error) {
      if (error instanceof Error && 'status' in error) throw error;
      aiUnavailable('training');
    }
  }

  /** P17 — grounded explanation narration over a verified structured payload. */
  async explain(request: ExplanationRequestV2): Promise<ExplanationResultV2> {
    explanationRequestV2Schema.parse(request);
    return this.postJson('/api/v1/ai/explain', request, explanationResultV2Schema, 'explanation');
  }

  /** P17 — AI market report narration with deterministic scenario probabilities. */
  async report(request: ReportInput): Promise<MarketReportView> {
    reportInputSchema.parse(request);
    return this.postJson('/api/v1/ai/report', request, marketReportViewSchema, 'market report');
  }

  /** P17 — grounded assistant rendering over DB/cache-retrieved facts. */
  async assistantRequest(request: AssistantInput): Promise<AssistantResponse> {
    return this.postJson('/api/v1/ai/assistant', request, assistantResponseSchema, 'assistant');
  }

  /** P17 — optional LLM news classifier using the P11 NewsAnalysis shape. */
  async enhanceNews(request: NewsEnhancerInput): Promise<NewsEnhancerResult> {
    newsEnhancerInputSchema.parse(request);
    return this.postJson(
      '/api/v1/ai/news/enhance',
      request,
      newsEnhancerResultSchema,
      'news enhancer',
    );
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    schema: { parse(value: unknown): T },
    label: string,
  ): Promise<T> {
    const url = `${configuration.app.aiUrl}${path}`;
    try {
      const response = await this.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Service-Token': configuration.app.aiServiceToken,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(AI_ENGINE_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) aiUnavailable(`${label} (HTTP ${response.status})`);
      return schema.parse(payload);
    } catch (error) {
      if (error instanceof Error && 'status' in error) throw error;
      aiUnavailable(label);
    }
  }
}

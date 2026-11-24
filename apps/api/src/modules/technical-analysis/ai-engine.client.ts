import { Inject, Injectable } from '@nestjs/common';
import { configuration } from '../../config/configuration';
import { aiUnavailable, insufficientData } from '../../common/errors/stub-errors';
import type {
  FeaturesRequest,
  FeaturesResponse,
  IndicatorsRequest,
  IndicatorsResponse,
} from '@ts/types';
import { featuresResponseSchema, indicatorsResponseSchema } from '@ts/validation';

/** Injectable boundary so tests can replace the AI engine without a socket. */
export const AI_ENGINE_FETCH = Symbol('AI_ENGINE_FETCH');
export type AiFetch = (url: string, init?: RequestInit) => Promise<Response>;

const AI_ENGINE_TIMEOUT_MS = 15_000;

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
}

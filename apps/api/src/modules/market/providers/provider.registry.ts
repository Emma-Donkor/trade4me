import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common';
import { env } from '@ts/config';
import type { AdminProviderView, Candle, MarketQuote, Timeframe } from '@ts/types';
import { JsonLogger } from '../../../common/logger/json-logger';
import { SystemEventService } from '../system-event.service';
import { backoffDelayMs, realSleep, type Sleep } from './backoff';
import { isProviderError, ProviderError, timestampRejectionReason } from './provider.errors';
import { ProviderHealthStore } from './provider.health';
import { ProviderRateLimiter } from './provider-rate-limiter';
import {
  MARKET_PROVIDERS,
  type MarketDataProvider,
  type ProviderPairContext,
} from './provider.interface';

export interface ProviderResult<T> {
  value: T;
  provider: string;
}

/** Primary → backup failover with typed failures, backoff and health updates. */
@Injectable()
export class ProviderRegistry implements OnModuleInit {
  private readonly primaryName: string;
  private readonly backupName: string;
  private readonly attemptsPerProvider: number;
  private readonly random: () => number;
  private readonly sleep: Sleep;

  constructor(
    @Inject(MARKET_PROVIDERS) private readonly providers: readonly MarketDataProvider[],
    private readonly health: ProviderHealthStore,
    private readonly rateLimiter: ProviderRateLimiter,
    private readonly systemEvents: SystemEventService,
    private readonly logger: JsonLogger,
    @Optional()
    options: { attemptsPerProvider?: number; random?: () => number; sleep?: Sleep } = {},
  ) {
    this.primaryName = String(env.MARKET_DATA_PROVIDER ?? 'mock');
    this.backupName = String(env.MARKET_BACKUP_PROVIDER ?? 'twelvedata');
    this.attemptsPerProvider = Math.max(1, Math.trunc(options.attemptsPerProvider ?? 2));
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? realSleep;
  }

  async onModuleInit(): Promise<void> {
    const unconfigured = new Set<string>();
    for (const provider of this.providers) {
      const health = await provider.getHealth().catch(() => undefined);
      if (health?.status === 'DISABLED') unconfigured.add(provider.name);
    }
    this.health.register(
      this.providers.map((provider) => provider.name),
      unconfigured,
    );
  }

  get primary(): string {
    return this.primaryName;
  }

  get backup(): string {
    return this.backupName;
  }

  find(name: string): MarketDataProvider | undefined {
    return this.providers.find((provider) => provider.name === name);
  }

  private orderedProviders(): MarketDataProvider[] {
    const names = [this.primaryName, this.backupName].filter(
      (name, index, all) => all.indexOf(name) === index,
    );
    return names
      .map((name) => this.find(name))
      .filter((provider): provider is MarketDataProvider => provider !== undefined);
  }

  private async request<T>(
    operation: 'quote' | 'candles',
    symbol: string,
    invoke: (provider: MarketDataProvider) => Promise<T>,
  ): Promise<ProviderResult<T>> {
    const candidates = this.orderedProviders();
    if (candidates.length === 0) {
      throw new ProviderError('disabled', 'No market data provider is configured');
    }

    for (const provider of candidates) {
      if (!this.health.isAvailable(provider.name)) continue;
      let lastError: ProviderError | undefined;

      for (let attempt = 1; attempt <= this.attemptsPerProvider; attempt += 1) {
        const startedAt = Date.now();
        try {
          await this.rateLimiter.assertAllowed(provider.name);
          const value = await invoke(provider);
          this.health.markSuccess(provider.name, Date.now() - startedAt);
          return { value, provider: provider.name };
        } catch (error) {
          lastError = isProviderError(error)
            ? error
            : new ProviderError('unknown', `${provider.name} ${operation} failed`);
          this.health.markFailure(provider.name, lastError.kind);
          this.logger.warn(
            `Provider ${provider.name} ${operation} failed: ${lastError.kind}`,
            'MARKET',
            { provider: provider.name, kind: lastError.kind, operation, attempt },
          );
          if (lastError.kind === 'invalid_timestamp') {
            // Log at the rejection site: the final wrapped error is only
            // `unavailable`, so the real provider/reason must be captured here.
            await this.systemEvents.timestampRejected(
              provider.name,
              timestampRejectionReason(lastError),
              { symbol, operation, ...lastError.details },
            );
          }

          const canRetry = lastError.retryable && attempt < this.attemptsPerProvider;
          if (canRetry) {
            await this.sleep(backoffDelayMs(attempt - 1, this.random));
            continue;
          }
          await this.systemEvents.providerFailure(provider.name, lastError.kind, {
            operation,
            symbol,
            attempt,
          });
          break;
        }
      }
      if (lastError && lastError.kind === 'rate_limited') {
        // A exhausted bucket is not a provider outage; try the backup at once.
        continue;
      }
    }

    throw new ProviderError('unavailable', 'All market data providers are unavailable', {
      details: { symbol, operation },
    });
  }

  async quote(symbol: string, context?: ProviderPairContext): Promise<ProviderResult<MarketQuote>> {
    return this.request('quote', symbol, (provider) => provider.getQuote(symbol, context));
  }

  async candles(
    symbol: string,
    timeframe: Timeframe,
    start: Date,
    end: Date,
    context?: ProviderPairContext,
  ): Promise<ProviderResult<Candle[]>> {
    return this.request('candles', symbol, (provider) =>
      provider.getCandles(symbol, timeframe, start, end, context),
    );
  }

  /** P28 owns writes; P08 publishes an honest read model for /admin/providers. */
  views(): AdminProviderView[] {
    const names = this.providers.map((provider) => provider.name);
    return this.health.all(names).map((record) => ({
      name: record.name,
      role:
        record.name === this.primaryName
          ? 'primary'
          : record.name === this.backupName
            ? 'backup'
            : 'none',
      status: record.status,
      enabled: record.enabled,
      latencyMs: record.latencyMs ?? null,
      lastCheckedAt: record.lastCheckedAt,
      requestsPerMinute: Number(env.MARKET_REQUESTS_PER_MINUTE),
    }));
  }

  async setEnabled(name: string, enabled: boolean): Promise<boolean> {
    if (!this.find(name)) return false;
    this.health.setEnabled(name, enabled);
    return true;
  }
}

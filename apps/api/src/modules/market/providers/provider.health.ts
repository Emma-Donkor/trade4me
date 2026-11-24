import { Injectable, Optional } from '@nestjs/common';
import type { ProviderHealth, ProviderStatus } from '@ts/types';
import { RedisService } from '../../redis/redis.service';
import type { ProviderErrorKind } from './provider.errors';

const HEALTH_TTL_SECONDS = 30;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

export interface ProviderHealthRecord extends ProviderHealth {
  enabled: boolean;
  consecutiveFailures: number;
  suspendedUntilMs: number;
  /** True when a real provider has not been configured with an API key. */
  unconfigured: boolean;
}

function initialRecord(name: string): ProviderHealthRecord {
  return {
    name,
    status: 'HEALTHY',
    lastCheckedAt: new Date().toISOString(),
    enabled: true,
    consecutiveFailures: 0,
    suspendedUntilMs: 0,
    unconfigured: false,
  };
}

/**
 * Process-local health with a Redis snapshot for admin consumers. P28 will
 * make writes durable; P08 only needs an honest, shared-read status source.
 */
@Injectable()
export class ProviderHealthStore {
  private readonly records = new Map<string, ProviderHealthRecord>();
  private readonly now: () => number;

  constructor(
    private readonly redis: RedisService,
    @Optional() options: { now?: () => number } = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  register(names: readonly string[], unconfigured: ReadonlySet<string> = new Set()): void {
    for (const name of names) {
      const record = this.records.get(name) ?? initialRecord(name);
      record.unconfigured = unconfigured.has(name);
      if (record.unconfigured) {
        record.status = 'DISABLED';
        record.enabled = false;
      }
      this.records.set(name, record);
      void this.persist(record);
    }
  }

  get(name: string): ProviderHealthRecord {
    return this.records.get(name) ?? initialRecord(name);
  }

  all(names?: readonly string[]): ProviderHealthRecord[] {
    const keys = names ?? [...this.records.keys()];
    return keys.map((name) => this.get(name));
  }

  /** Circuit-breaker check before a request is attempted. */
  isAvailable(name: string): boolean {
    const record = this.get(name);
    if (!record.enabled || record.unconfigured) return false;
    if (record.status !== 'DISABLED') return true;
    if (this.now() < record.suspendedUntilMs) return false;
    record.status = 'DEGRADED';
    record.suspendedUntilMs = 0;
    void this.persist(record);
    return true;
  }

  markSuccess(name: string, latencyMs: number): ProviderHealth {
    const record = this.get(name);
    record.status = 'HEALTHY';
    record.latencyMs = Math.max(0, Math.round(latencyMs));
    record.lastCheckedAt = new Date(this.now()).toISOString();
    record.consecutiveFailures = 0;
    record.suspendedUntilMs = 0;
    void this.persist(record);
    return this.view(record);
  }

  /** Failures degrade immediately; repeated failures open a short circuit. */
  markFailure(name: string, _kind: ProviderErrorKind): ProviderHealth {
    const record = this.get(name);
    record.consecutiveFailures += 1;
    record.lastCheckedAt = new Date(this.now()).toISOString();
    record.status =
      record.consecutiveFailures >= FAILURE_THRESHOLD ? 'DISABLED' : ('DEGRADED' as ProviderStatus);
    if (record.status === 'DISABLED') {
      record.suspendedUntilMs = this.now() + CIRCUIT_COOLDOWN_MS;
    }
    void this.persist(record);
    return this.view(record);
  }

  setEnabled(name: string, enabled: boolean): ProviderHealth {
    const record = this.get(name);
    record.enabled = enabled;
    record.status = enabled ? 'DEGRADED' : 'DISABLED';
    record.suspendedUntilMs = 0;
    if (enabled) record.consecutiveFailures = 0;
    void this.persist(record);
    return this.view(record);
  }

  view(record: ProviderHealthRecord): ProviderHealth {
    return {
      name: record.name,
      status: record.status,
      ...(record.latencyMs === undefined ? {} : { latencyMs: record.latencyMs }),
      lastCheckedAt: record.lastCheckedAt,
    };
  }

  private async persist(record: ProviderHealthRecord): Promise<void> {
    try {
      await this.redis.set(
        `health:provider:${record.name}`,
        JSON.stringify(this.view(record)),
        HEALTH_TTL_SECONDS,
      );
    } catch {
      // Health snapshots are advisory; a Redis outage must not block quotes.
    }
  }
}

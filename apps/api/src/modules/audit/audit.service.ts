import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditAction, type Prisma } from '@ts/database';
import { JsonLogger } from '../../common/logger/json-logger';
import { redact } from '../../common/logger/redact';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export interface BufferedAuditEntry extends AuditEntry {
  at: string;
}

const MAX_BUFFER = 1_000;
const ACTIONS = new Set<string>(Object.values(AuditAction));

/**
 * Audit writes are redacted, persisted to AuditLog (P04), and buffered if the
 * database is briefly unavailable so no security-relevant event is lost.
 */
@Injectable()
export class AuditService {
  private readonly buffer: BufferedAuditEntry[] = [];

  constructor(
    @Inject(JsonLogger) private readonly logger: JsonLogger,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const buffered = redact({ ...entry, at: new Date().toISOString() }) as BufferedAuditEntry;
    if (this.prisma && ACTIONS.has(entry.action)) {
      try {
        await this.persist(buffered);
        return;
      } catch (error) {
        this.logger.warn('AuditLog write failed; buffering entry', 'AUDIT', {
          action: entry.action,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.buffer.push(buffered);
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
  }

  /** Drains buffered entries without writing; kept for inspection and tests. */
  drain(): BufferedAuditEntry[] {
    return this.buffer.splice(0, this.buffer.length);
  }

  /** Flushes buffered entries once the database is available again. */
  async flush(): Promise<number> {
    const entries = this.drain();
    let written = 0;
    for (const entry of entries) {
      try {
        await this.persist(entry);
        written += 1;
      } catch (error) {
        this.buffer.push(entry);
        this.logger.warn('AuditLog flush failed; entry retained', 'AUDIT', {
          action: entry.action,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return written;
  }

  private async persist(entry: BufferedAuditEntry): Promise<void> {
    if (!this.prisma) throw new Error('PrismaService unavailable');
    await this.prisma.getClient().auditLog.create({
      data: {
        action: entry.action as AuditAction,
        userId: entry.actorId ?? null,
        symbol: entry.entity === 'CurrencyPair' ? (entry.entityId ?? null) : null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        requestId: entry.requestId ?? 'unspecified',
        timestamp: new Date(entry.at),
      },
    });
  }
}

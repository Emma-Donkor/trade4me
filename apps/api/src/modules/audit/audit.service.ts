import { Inject, Injectable } from '@nestjs/common';
import { JsonLogger } from '../../common/logger/json-logger';
import { redact } from '../../common/logger/redact';

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

/**
 * Audit skeleton: entries are redacted and buffered here, then flushed to the
 * AuditLog table once PHASE 04 creates the Prisma model.
 */
@Injectable()
export class AuditService {
  private readonly buffer: BufferedAuditEntry[] = [];

  constructor(@Inject(JsonLogger) private readonly logger: JsonLogger) {}

  async record(entry: AuditEntry): Promise<void> {
    const buffered = redact({ ...entry, at: new Date().toISOString() }) as BufferedAuditEntry;
    this.buffer.push(buffered);
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
    this.logger.log('audit entry buffered for PHASE 04 persistence', 'AUDIT', {
      action: entry.action,
      entity: entry.entity,
      requestId: entry.requestId,
    });
  }

  /** Called by the PHASE 04 persistence worker. */
  drain(): BufferedAuditEntry[] {
    return this.buffer.splice(0, this.buffer.length);
  }
}

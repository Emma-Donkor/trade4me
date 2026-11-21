import { Injectable } from '@nestjs/common';
import { env } from '@ts/config';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JsonLogger } from '../../../common/logger/json-logger';
import { passwordResetTemplate, verificationTemplate } from './templates';

/**
 * P06 email transport. No SMTP credentials exist in the environment, so the
 * development/test transport logs the prepared message (including the link,
 * as documented in README §6.3) and never persists or sends credentials.
 */
@Injectable()
export class EmailService {
  constructor(private readonly logger: JsonLogger) {}

  private get devMode(): boolean {
    return String(env.NODE_ENV) !== 'production';
  }

  private deliver(
    kind: string,
    message: { subject: string; text: string; url: string },
    to: string,
  ): void {
    if (this.devMode) {
      this.logger.log(`auth.${kind}.dev-link`, 'EmailService', {
        email: to,
        subject: message.subject,
        link: message.url,
      });
      // Dev-only convenience sink so the Playwright flow can follow the same
      // link a developer sees in the console. Never written in production.
      try {
        appendFileSync(
          resolve(process.cwd(), '.auth-dev-links.log'),
          `${JSON.stringify({ at: new Date().toISOString(), kind, email: to, link: message.url })}\n`,
        );
      } catch {
        // Logging remains the authoritative dev transport if the file is unavailable.
      }
      return;
    }
    // Production transport is intentionally absent: MFA/email providers are a
    // later phase. Do not log links or tokens in production.
    this.logger.log(`auth.${kind}.transport-unavailable`, 'EmailService', { email: to });
  }

  async sendVerification(to: string, verifyUrl: string): Promise<void> {
    this.deliver('verification', verificationTemplate({ to, verifyUrl }), to);
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    this.deliver('password-reset', passwordResetTemplate({ to, resetUrl }), to);
  }
}

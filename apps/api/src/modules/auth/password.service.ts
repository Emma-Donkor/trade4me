import { Injectable } from '@nestjs/common';
import { env } from '@ts/config';
import { hash, compare } from 'bcryptjs';

/** P06: bcrypt password policy. Plaintext is never logged or persisted. */
@Injectable()
export class PasswordService {
  private get rounds(): number {
    return Number(env.BCRYPT_ROUNDS ?? 12);
  }

  async hashPassword(password: string): Promise<string> {
    return hash(password, this.rounds);
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  }
}

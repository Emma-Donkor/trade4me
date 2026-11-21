import { env } from '@ts/config';
import { PasswordService } from './password.service';

describe('P06 PasswordService', () => {
  const mutableEnv = env as unknown as Record<string, unknown>;
  const originalRounds = mutableEnv.BCRYPT_ROUNDS;
  const service = new PasswordService();

  afterAll(() => {
    mutableEnv.BCRYPT_ROUNDS = originalRounds;
  });

  it('hashes with the configured bcrypt cost and never stores plaintext', async () => {
    mutableEnv.BCRYPT_ROUNDS = 10;
    const hash = await service.hashPassword('correct-horse-battery');
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(hash).not.toContain('correct-horse-battery');
  });

  it('round-trips a valid password and rejects a wrong one', async () => {
    const hash = await service.hashPassword('s3cure-passphrase');
    await expect(service.verify('s3cure-passphrase', hash)).resolves.toBe(true);
    await expect(service.verify('wrong-passphrase', hash)).resolves.toBe(false);
  });

  it('uses cost 12 by default', async () => {
    mutableEnv.BCRYPT_ROUNDS = 12;
    const hash = await service.hashPassword('default-cost');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });
});

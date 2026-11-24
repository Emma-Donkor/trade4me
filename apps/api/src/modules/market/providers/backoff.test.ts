import { describe, expect, it, jest } from '@jest/globals';
import { backoffDelayMs, retryWithBackoff } from './backoff';

describe('provider backoff', () => {
  it('schedules exponential delays with bounded jitter', () => {
    const zero = () => 0;
    expect(backoffDelayMs(0, zero, 200, 2_000)).toBe(100);
    expect(backoffDelayMs(1, zero, 200, 2_000)).toBe(200);
    expect(backoffDelayMs(2, zero, 200, 2_000)).toBe(400);
    expect(backoffDelayMs(9, zero, 200, 2_000)).toBe(1_000);
    expect(backoffDelayMs(2, () => 0.999, 200, 2_000)).toBeLessThanOrEqual(800);
  });

  it('retries retryable failures and stops after the configured attempts', async () => {
    const sleep = jest.fn(async () => undefined);
    const operation = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('ok');

    await expect(retryWithBackoff(operation, { retries: 1, random: () => 0, sleep })).resolves.toBe(
      'ok',
    );
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it('honours shouldRetry and rethrows the last failure', async () => {
    const operation = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('fatal'));
    await expect(
      retryWithBackoff(operation, { retries: 3, shouldRetry: () => false }),
    ).rejects.toThrow('fatal');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

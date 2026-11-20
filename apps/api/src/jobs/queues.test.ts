import { Queue } from 'bullmq';
import { bullConnectionOptions, QUEUE_NAMES, queueToken } from './queues';

describe('BullMQ scaffolding', () => {
  it('defines the six documented queues and stable injection tokens', () => {
    expect(QUEUE_NAMES).toEqual([
      'market-sync',
      'news-ingest',
      'features',
      'outcomes',
      'cleanup',
      'health',
    ]);
    expect(queueToken('market-sync')).toBe('BullQueue_market-sync');
  });

  it('parses redis:// URLs into BullMQ connection options', () => {
    const options = bullConnectionOptions();
    expect(options.host).toBeTruthy();
    expect(typeof options.port).toBe('number');
    expect(options.maxRetriesPerRequest).toBeNull();
  });

  it('enqueues and reads a job through Redis', async () => {
    const queue = new Queue('phase03-roundtrip', {
      connection: bullConnectionOptions(),
      prefix: 'tradesense:test:',
    });
    let available = false;

    try {
      await queue.waitUntilReady();
      await queue.obliterate({ force: true });
      available = true;
    } catch (error) {
      console.warn(
        `Redis unavailable; skipping queue round-trip: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    try {
      if (!available) return;
      const added = await queue.add('ping', { hello: 'world' });
      const fetched = await queue.getJob(String(added.id));
      expect(fetched?.data).toEqual({ hello: 'world' });

      await queue.obliterate({ force: true });
      expect(await queue.getJob(String(added.id))).toBeFalsy();
    } finally {
      await queue.close();
    }
  }, 30_000);
});

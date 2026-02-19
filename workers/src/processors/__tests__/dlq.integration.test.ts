import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env.local'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

function buildRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required for DLQ integration tests');
  }

  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
    username: url.username || 'default',
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 15_000,
  intervalMs = 200
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

const describeWithRedis = process.env.REDIS_URL ? describe : describe.skip;

describeWithRedis('bullmq dlq integration (real redis)', () => {
  const queueName = `dlq-integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let queue: Queue<{ test: string }>;
  let worker: Worker<{ test: string }, unknown, string>;

  beforeAll(async () => {
    const connection = buildRedisConnection();

    queue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 100 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    worker = new Worker<{ test: string }, unknown, string>(
      queueName,
      async () => {
        throw new Error('integration-transient-error');
      },
      { connection, concurrency: 1 }
    );

    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('should move a job to failed set after retry exhaustion', async () => {
    const job = await queue.add('fail-job', { test: 'dlq' });

    await waitFor(async () => (await queue.getFailedCount()) === 1, 30_000);

    const failedJob = await queue.getJob(job.id as string);
    expect(failedJob).toBeDefined();
    expect(failedJob?.attemptsMade).toBe(2);
    expect(await failedJob?.getState()).toBe('failed');
    expect(failedJob?.failedReason).toContain('integration-transient-error');
  }, 35_000);
});

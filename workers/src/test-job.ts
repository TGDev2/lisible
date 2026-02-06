/**
 * Test script for verifying BullMQ + Redis setup
 *
 * Usage: pnpm tsx src/test-job.ts
 *
 * This script:
 * 1. Connects to Redis (Upstash)
 * 2. Enqueues a test job to the SME queue
 * 3. Processes the job with the worker
 * 4. Logs the result
 *
 * DoD: Job test enqueued + processed with logs
 */
import { type Job, Worker, QueueEvents } from 'bullmq';
import { redisConnection, QUEUE_NAMES } from './config';
import { smeQueue, type SMEJobData, type SMEJobResult } from './queues';

async function runTest(): Promise<void> {
  console.log('='.repeat(50));
  console.log('BullMQ + Redis Connection Test');
  console.log('='.repeat(50));

  // Step 1: Create a test worker
  console.log('\n[1] Creating test worker...');

  const testWorker = new Worker<SMEJobData, SMEJobResult>(
    QUEUE_NAMES.SME,
    async (job: Job<SMEJobData>) => {
      console.log(`\n[WORKER] Processing job ${job.id}`);
      console.log(`[WORKER] Job data:`, JSON.stringify(job.data, null, 2));

      // Simulate some work
      await job.updateProgress(50);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await job.updateProgress(100);

      const result: SMEJobResult = {
        score: 85,
        alertsCount: 3,
      };

      console.log(`[WORKER] Job ${job.id} completed with result:`, result);
      return result;
    },
    {
      connection: redisConnection,
      concurrency: 1,
    }
  );

  // Create QueueEvents for waiting on job completion
  const queueEvents = new QueueEvents(QUEUE_NAMES.SME, {
    connection: redisConnection,
  });

  // Wait for worker to be ready
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log('[1] Test worker created and listening');

  // Step 2: Enqueue a test job
  console.log('\n[2] Enqueueing test job...');

  const testJobData: SMEJobData = {
    fileId: 'test-file-123',
    userId: 'test-user-456',
    storageKey: 'test/path/to/file.srt',
  };

  const job = await smeQueue.add('test-sme-analysis', testJobData, {
    removeOnComplete: true,
    removeOnFail: false,
  });

  console.log(`[2] Test job enqueued with ID: ${job.id}`);

  // Step 3: Wait for job to complete
  console.log('\n[3] Waiting for job to complete...');

  const result = await job.waitUntilFinished(queueEvents, 10000);

  console.log('\n[3] Job completed successfully!');
  console.log('Result:', result);

  // Cleanup
  console.log('\n[4] Cleaning up...');
  await testWorker.close();
  await queueEvents.close();
  await smeQueue.close();

  console.log('\n' + '='.repeat(50));
  console.log('TEST PASSED: Job enqueued and processed successfully!');
  console.log('='.repeat(50));

  process.exit(0);
}

// Handle errors
runTest().catch((error) => {
  console.error('\n' + '='.repeat(50));
  console.error('TEST FAILED:', error.message);
  console.error('='.repeat(50));

  if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
    console.error('\nHint: Make sure REDIS_URL is set correctly in your .env file');
    console.error('Format: rediss://default:xxx@eu1-xxx.upstash.io:6379');
  }

  process.exit(1);
});

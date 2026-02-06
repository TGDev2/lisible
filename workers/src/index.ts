import type { Worker } from 'bullmq';
import { QUEUE_NAMES } from './config';
import { closeAllQueues } from './queues';
import {
  createSTTWorker,
  createSMEWorker,
  createPDFWorker,
  createCleanupWorker,
} from './processors';

// Track all workers for graceful shutdown
const workers: Worker[] = [];

async function startWorkers(): Promise<void> {
  console.log('='.repeat(50));
  console.log('Starting SME Studio Workers...');
  console.log('='.repeat(50));

  // Create and register all workers
  const sttWorker = createSTTWorker();
  const smeWorker = createSMEWorker();
  const pdfWorker = createPDFWorker();
  const cleanupWorker = createCleanupWorker();

  workers.push(sttWorker, smeWorker, pdfWorker, cleanupWorker);

  console.log(`[WORKER] Started ${QUEUE_NAMES.STT} worker (concurrency: 2)`);
  console.log(`[WORKER] Started ${QUEUE_NAMES.SME} worker (concurrency: 5)`);
  console.log(`[WORKER] Started ${QUEUE_NAMES.PDF} worker (concurrency: 3)`);
  console.log(`[WORKER] Started ${QUEUE_NAMES.CLEANUP} worker (concurrency: 1)`);
  console.log('='.repeat(50));
  console.log('All workers running. Press Ctrl+C to stop.');
  console.log('='.repeat(50));
}

async function shutdown(): Promise<void> {
  console.log('\nShutting down workers...');

  // Close all workers gracefully
  await Promise.all(
    workers.map(async (worker) => {
      await worker.close();
      console.log(`[WORKER] Closed ${worker.name}`);
    })
  );

  // Close all queues
  await closeAllQueues();
  console.log('[QUEUE] All queues closed');

  console.log('Shutdown complete');
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start workers
startWorkers().catch((error) => {
  console.error('Failed to start workers:', error);
  process.exit(1);
});

// Export for testing
export { startWorkers, shutdown };
export * from './queues';
export * from './config';

import { type Job, Worker } from 'bullmq';
import { redisConnection, QUEUE_NAMES, workerConfigs } from '../config';
import type { CleanupJobData, CleanupJobResult } from '../queues';
import { getDb, users, files, auditLogs, eq, lt, and, isNotNull } from '@sme-studio/db';
import { deleteObject } from '../lib/storage';
import { sendAccountDeletedEmail } from '../lib/email';
import { cancelSubscription } from '../lib/stripe';

const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000; // 72 hours in milliseconds

/**
 * Cleanup Worker
 * Handles RGPD-related cleanup tasks:
 * - Expired files deletion
 * - Pending user deletions (72h grace period)
 * - Old audit logs cleanup
 */
async function processCleanupJob(job: Job<CleanupJobData>): Promise<CleanupJobResult> {
  const { type, batchSize = 100 } = job.data;

  console.log(`[CLEANUP] Processing job ${job.id}`, {
    type,
    batchSize,
  });

  await job.updateProgress(10);

  let deletedCount = 0;

  switch (type) {
    case 'expired-files':
      deletedCount = await processExpiredFiles(batchSize);
      break;

    case 'pending-deletions':
      deletedCount = await processPendingDeletions(batchSize);
      break;

    case 'old-audit-logs':
      deletedCount = await processOldAuditLogs(batchSize);
      break;

    default:
      throw new Error(`Unknown cleanup type: ${type}`);
  }

  await job.updateProgress(100);

  console.log(`[CLEANUP] Completed job ${job.id}`, { deletedCount });

  return { deletedCount };
}

/**
 * Process expired files - delete from S3 and mark as deleted
 */
async function processExpiredFiles(batchSize: number): Promise<number> {
  const db = getDb();
  const now = new Date();

  // Find files where expires_at < now
  const expiredFiles = await db
    .select({
      id: files.id,
      storageKey: files.storageKey,
      storageKeySrt: files.storageKeySrt,
    })
    .from(files)
    .where(
      and(
        lt(files.expiresAt, now),
        isNotNull(files.expiresAt)
      )
    )
    .limit(batchSize);

  console.log(`[CLEANUP] Found ${expiredFiles.length} expired files`);

  let deletedCount = 0;

  for (const file of expiredFiles) {
    try {
      // Delete from S3
      if (file.storageKey) {
        await deleteObject(file.storageKey);
      }
      if (file.storageKeySrt) {
        await deleteObject(file.storageKeySrt);
      }

      // Update file status to deleted
      await db
        .update(files)
        .set({
          status: 'deleted',
          storageKey: null,
          storageKeySrt: null,
          updatedAt: now,
        })
        .where(eq(files.id, file.id));

      deletedCount++;
    } catch (error) {
      console.error(`[CLEANUP] Failed to delete expired file ${file.id}:`, error);
    }
  }

  return deletedCount;
}

/**
 * Process pending user deletions - delete after 72h grace period
 */
async function processPendingDeletions(batchSize: number): Promise<number> {
  const db = getDb();
  const now = new Date();
  const gracePeriodCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);

  // Find users where deletion_requested_at < 72h ago
  const pendingUsers = await db
    .select({
      id: users.id,
      email: users.email,
      stripeSubscriptionId: users.stripeSubscriptionId,
      deletionRequestedAt: users.deletionRequestedAt,
    })
    .from(users)
    .where(
      and(
        lt(users.deletionRequestedAt, gracePeriodCutoff),
        isNotNull(users.deletionRequestedAt)
      )
    )
    .limit(batchSize);

  console.log(`[CLEANUP] Found ${pendingUsers.length} users pending deletion`);

  let deletedCount = 0;

  for (const user of pendingUsers) {
    try {
      console.log(`[CLEANUP] Processing deletion for user ${user.id}`);

      // 1. Cancel Stripe subscription if exists
      if (user.stripeSubscriptionId) {
        try {
          const cancelled = await cancelSubscription(user.stripeSubscriptionId);
          console.log(`[CLEANUP] Stripe subscription ${user.stripeSubscriptionId} cancelled: ${cancelled}`);
        } catch (stripeError) {
          console.error(`[CLEANUP] Failed to cancel Stripe subscription:`, stripeError);
          // Continue with deletion anyway
        }
      }

      // 2. Get all user files and delete from S3
      const userFiles = await db
        .select({
          id: files.id,
          storageKey: files.storageKey,
          storageKeySrt: files.storageKeySrt,
        })
        .from(files)
        .where(eq(files.userId, user.id));

      console.log(`[CLEANUP] Deleting ${userFiles.length} files for user ${user.id}`);

      for (const file of userFiles) {
        try {
          if (file.storageKey) {
            await deleteObject(file.storageKey);
          }
          if (file.storageKeySrt) {
            await deleteObject(file.storageKeySrt);
          }
        } catch (s3Error) {
          console.error(`[CLEANUP] Failed to delete S3 file ${file.id}:`, s3Error);
          // Continue with other files
        }
      }

      // 3. Delete user exports from S3 (pattern: exports/{userId}/*)
      try {
        const { deleteObjectsByPrefix } = await import('../lib/storage');
        const exportDeleteCount = await deleteObjectsByPrefix(`exports/${user.id}/`);
        console.log(`[CLEANUP] Deleted ${exportDeleteCount} export files for user ${user.id}`);
      } catch (exportError) {
        console.error(`[CLEANUP] Failed to delete exports:`, exportError);
      }

      // 4. Log the final deletion action (before we delete the user)
      await db.insert(auditLogs).values({
        userId: null, // Anonymized
        action: 'account_deleted',
        resourceType: 'user',
        resourceId: user.id,
        metadata: {
          deletionRequestedAt: user.deletionRequestedAt?.toISOString(),
          deletedAt: now.toISOString(),
        },
      });

      // 5. Delete user from database (cascade will handle projects, files, segments, alerts)
      await db.delete(users).where(eq(users.id, user.id));

      // 6. Send final confirmation email
      try {
        await sendAccountDeletedEmail(user.email);
        console.log(`[CLEANUP] Sent deletion confirmation email to ${user.email}`);
      } catch (emailError) {
        console.error(`[CLEANUP] Failed to send deletion email:`, emailError);
        // User is already deleted, so we just log and continue
      }

      deletedCount++;
      console.log(`[CLEANUP] Successfully deleted user ${user.id}`);
    } catch (error) {
      console.error(`[CLEANUP] Failed to delete user ${user.id}:`, error);
    }
  }

  return deletedCount;
}

/**
 * Process old audit logs - delete logs older than 1 year
 */
async function processOldAuditLogs(_batchSize: number): Promise<number> {
  const db = getDb();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Delete old audit logs
  await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, oneYearAgo));

  // Drizzle doesn't return count directly, so we log
  console.log(`[CLEANUP] Deleted old audit logs older than ${oneYearAgo.toISOString()}`);

  return 0; // We don't have the exact count from drizzle delete
}

export function createCleanupWorker(): Worker<CleanupJobData, CleanupJobResult> {
  const worker = new Worker<CleanupJobData, CleanupJobResult>(
    QUEUE_NAMES.CLEANUP,
    processCleanupJob,
    {
      connection: redisConnection,
      ...workerConfigs[QUEUE_NAMES.CLEANUP],
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[CLEANUP] Job ${job.id} completed`, result);
  });

  worker.on('failed', (job, error) => {
    console.error(`[CLEANUP] Job ${job?.id} failed`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[CLEANUP] Job ${job.id} progress: ${progress}%`);
  });

  return worker;
}

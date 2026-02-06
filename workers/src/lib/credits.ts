import {
  getDb,
  users,
  files,
  creditTransactions,
  eq,
} from '@sme-studio/db';

/**
 * Error thrown when user has insufficient credits
 */
export class InsufficientCreditsError extends Error {
  constructor(
    public readonly available: number,
    public readonly required: number
  ) {
    super(`Insufficient credits: ${available} available, ${required} required`);
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Calculate minutes to deduct (rounded up to nearest minute)
 * @param durationSeconds - Duration in seconds
 * @returns Minutes (rounded up)
 */
export function calculateMinutesToDeduct(durationSeconds: number): number {
  return Math.ceil(durationSeconds / 60);
}

/**
 * Deduct credits from user for STT transcription
 * Records transaction in credit_transactions table
 * Updates file with credits consumed
 *
 * @param userId - User ID
 * @param fileId - File ID being processed
 * @param durationSeconds - Duration in seconds
 * @returns Object with minutes deducted and remaining credits
 * @throws InsufficientCreditsError if user doesn't have enough credits
 */
export async function deductCredits(
  userId: string,
  fileId: string,
  durationSeconds: number
): Promise<{
  minutesDeducted: number;
  creditsRemaining: number;
}> {
  const db = getDb();
  const minutesToDeduct = calculateMinutesToDeduct(durationSeconds);

  // Get current user credits
  const [user] = await db
    .select({
      creditsTotal: users.creditsTotal,
      creditsUsed: users.creditsUsed,
      creditsRollover: users.creditsRollover,
      plan: users.plan,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Calculate available credits
  const creditsTotal = user.creditsTotal ?? 30;
  const creditsUsed = user.creditsUsed ?? 0;
  const creditsRollover = user.creditsRollover ?? 0;
  const available = creditsTotal - creditsUsed + creditsRollover;

  // Check if user has enough credits
  if (minutesToDeduct > available) {
    throw new InsufficientCreditsError(available, minutesToDeduct);
  }

  // Calculate deduction from rollover first, then current credits
  let rolloverUsed = 0;
  let newCreditsUsed = creditsUsed;
  let newRollover = creditsRollover;
  let remaining = minutesToDeduct;

  if (creditsRollover > 0 && remaining > 0) {
    rolloverUsed = Math.min(remaining, creditsRollover);
    newRollover = creditsRollover - rolloverUsed;
    remaining -= rolloverUsed;
  }

  if (remaining > 0) {
    newCreditsUsed = creditsUsed + remaining;
  }

  const creditsRemaining = creditsTotal - newCreditsUsed + newRollover;

  // Update user credits
  await db
    .update(users)
    .set({
      creditsUsed: newCreditsUsed,
      creditsRollover: newRollover,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Record credit transaction
  await db.insert(creditTransactions).values({
    userId,
    type: 'consumption',
    amount: -minutesToDeduct,
    balanceAfter: creditsRemaining,
    fileId,
    description: `Transcription: ${minutesToDeduct} minute${minutesToDeduct > 1 ? 's' : ''}`,
  });

  // Update file with credits consumed
  await db
    .update(files)
    .set({
      creditsConsumed: minutesToDeduct,
      updatedAt: new Date(),
    })
    .where(eq(files.id, fileId));

  console.log(`[Credits] Deducted ${minutesToDeduct} minutes from user ${userId}`, {
    rolloverUsed,
    creditsUsed: newCreditsUsed,
    remaining: creditsRemaining,
  });

  return {
    minutesDeducted: minutesToDeduct,
    creditsRemaining,
  };
}

/**
 * Check if user has enough credits for a given duration
 * @param userId - User ID
 * @param durationSeconds - Duration in seconds
 * @returns True if user has enough credits
 */
export async function hasEnoughCredits(
  userId: string,
  durationSeconds: number
): Promise<boolean> {
  const db = getDb();
  const minutesNeeded = calculateMinutesToDeduct(durationSeconds);

  const [user] = await db
    .select({
      creditsTotal: users.creditsTotal,
      creditsUsed: users.creditsUsed,
      creditsRollover: users.creditsRollover,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    return false;
  }

  const creditsTotal = user.creditsTotal ?? 30;
  const creditsUsed = user.creditsUsed ?? 0;
  const creditsRollover = user.creditsRollover ?? 0;
  const available = creditsTotal - creditsUsed + creditsRollover;

  return minutesNeeded <= available;
}

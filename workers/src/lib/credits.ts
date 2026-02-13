import {
  getDb,
  users,
  eq,
  sql,
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
 * E.g. 5min30s (330s) → 6 minutes
 * @param durationSeconds - Duration in seconds
 * @returns Minutes (rounded up)
 */
export function calculateMinutesToDeduct(durationSeconds: number): number {
  return Math.ceil(durationSeconds / 60);
}

/**
 * Deduct credits from user after successful STT transcription.
 *
 * Uses a single atomic SQL CTE that:
 * 1. Updates user credits (rollover consumed first) — only if sufficient balance
 * 2. Inserts a credit_transactions ledger entry
 * 3. Updates the file with credits_consumed
 *
 * The UPDATE WHERE clause checks actual row values at execution time, so
 * concurrent deductions are safe: if two workers race on the same user,
 * only one will match the WHERE condition after the row lock is acquired.
 *
 * @param userId - User ID
 * @param fileId - File ID being processed
 * @param durationSeconds - Actual transcription duration in seconds
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
  const negativeAmount = -minutesToDeduct;
  const description = `Transcription: ${minutesToDeduct} minute${minutesToDeduct > 1 ? 's' : ''}`;

  // Single atomic SQL: UPDATE user + INSERT transaction + UPDATE file
  // The UPDATE only succeeds if available >= minutesToDeduct (concurrent-safe).
  // Rollover is consumed first: credits_rollover decreases before credits_used increases.
  const result = await db.execute(sql`
    WITH do_update_user AS (
      UPDATE users
      SET
        credits_used = CASE
          WHEN ${minutesToDeduct}::int <= COALESCE(credits_rollover, 0)
            THEN COALESCE(credits_used, 0)
          ELSE COALESCE(credits_used, 0)
               + (${minutesToDeduct}::int - COALESCE(credits_rollover, 0))
        END,
        credits_rollover = COALESCE(credits_rollover, 0)
                           - LEAST(${minutesToDeduct}::int, COALESCE(credits_rollover, 0)),
        updated_at = NOW()
      WHERE id = ${userId}
        AND (COALESCE(credits_total, 30) - COALESCE(credits_used, 0)
             + COALESCE(credits_rollover, 0)) >= ${minutesToDeduct}::int
      RETURNING
        credits_used  AS new_credits_used,
        credits_rollover AS new_rollover,
        (COALESCE(credits_total, 30) - credits_used + credits_rollover) AS credits_remaining
    ),
    do_insert_tx AS (
      INSERT INTO credit_transactions
        (user_id, type, amount, balance_after, file_id, description)
      SELECT
        ${userId}::uuid, 'consumption', ${negativeAmount}::int,
        credits_remaining, ${fileId}::uuid, ${description}
      FROM do_update_user
      RETURNING id
    ),
    do_update_file AS (
      UPDATE files
      SET credits_consumed = ${minutesToDeduct}::int, updated_at = NOW()
      WHERE id = ${fileId}
        AND EXISTS (SELECT 1 FROM do_update_user)
      RETURNING id
    )
    SELECT
      new_credits_used::int,
      new_rollover::int,
      credits_remaining::int
    FROM do_update_user
  `);

  // If 0 rows → UPDATE did not match (insufficient credits or user not found)
  if (!result.rows || result.rows.length === 0) {
    // Fetch current balance for a meaningful error message
    const [user] = await db
      .select({
        creditsTotal: users.creditsTotal,
        creditsUsed: users.creditsUsed,
        creditsRollover: users.creditsRollover,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const available =
      (user.creditsTotal ?? 30) - (user.creditsUsed ?? 0) + (user.creditsRollover ?? 0);
    throw new InsufficientCreditsError(available, minutesToDeduct);
  }

  const row = result.rows[0] as Record<string, unknown>;
  const creditsRemaining = Number(row.credits_remaining);

  console.log(`[Credits] Deducted ${minutesToDeduct} minutes from user ${userId}`, {
    newCreditsUsed: Number(row.new_credits_used),
    newRollover: Number(row.new_rollover),
    creditsRemaining,
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

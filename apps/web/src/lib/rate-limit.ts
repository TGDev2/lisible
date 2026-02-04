/**
 * In-memory rate limiting for login attempts.
 * Implements 5 attempts per minute per IP/email combination.
 *
 * Note: This is suitable for single-instance deployments.
 * For multi-instance deployments, consider using Redis (Upstash).
 */

interface RateLimitEntry {
  attempts: number[];
}

const loginAttempts = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts.entries()) {
    const validAttempts = entry.attempts.filter((t) => now - t < WINDOW_MS);
    if (validAttempts.length === 0) {
      loginAttempts.delete(key);
    } else {
      entry.attempts = validAttempts;
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetIn: number; // seconds until reset
}

/**
 * Check if an identifier (IP or email) is rate limited.
 * Call this BEFORE processing the login attempt.
 */
export function checkRateLimit(identifier: string): RateLimitResult {
  const now = Date.now();
  const entry = loginAttempts.get(identifier);

  if (!entry) {
    return { success: true, remaining: MAX_ATTEMPTS, resetIn: 0 };
  }

  // Filter attempts within the window
  const validAttempts = entry.attempts.filter((t) => now - t < WINDOW_MS);
  entry.attempts = validAttempts;

  if (validAttempts.length >= MAX_ATTEMPTS) {
    const oldestAttempt = validAttempts[0]!;
    const resetIn = Math.ceil((oldestAttempt + WINDOW_MS - now) / 1000);
    return { success: false, remaining: 0, resetIn };
  }

  return {
    success: true,
    remaining: MAX_ATTEMPTS - validAttempts.length,
    resetIn: 0,
  };
}

/**
 * Record a failed login attempt.
 * Call this AFTER a failed login attempt.
 */
export function recordFailedAttempt(identifier: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(identifier);

  if (!entry) {
    loginAttempts.set(identifier, { attempts: [now] });
  } else {
    // Clean old attempts and add new one
    entry.attempts = entry.attempts.filter((t) => now - t < WINDOW_MS);
    entry.attempts.push(now);
  }
}

/**
 * Clear rate limit for an identifier (e.g., after successful login).
 */
export function clearRateLimit(identifier: string): void {
  loginAttempts.delete(identifier);
}

/**
 * Get a composite key for rate limiting based on IP and email.
 */
export function getRateLimitKey(ip: string, email?: string): string {
  if (email) {
    return `${ip}:${email.toLowerCase()}`;
  }
  return ip;
}

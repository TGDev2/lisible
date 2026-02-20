import Redis from "ioredis";

/**
 * Login rate limiting (in-memory, single-instance).
 * Implements 5 attempts per minute per IP/email combination.
 */

interface RateLimitEntry {
  attempts: number[];
}

const loginAttempts = new Map<string, RateLimitEntry>();

const LOGIN_WINDOW_MS = 60 * 1000; // 1 minute
const LOGIN_MAX_ATTEMPTS = 5;

const loginCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts.entries()) {
    const validAttempts = entry.attempts.filter((t) => now - t < LOGIN_WINDOW_MS);
    if (validAttempts.length === 0) {
      loginAttempts.delete(key);
    } else {
      entry.attempts = validAttempts;
    }
  }
}, 5 * 60 * 1000);

if (typeof loginCleanupTimer === "object" && "unref" in loginCleanupTimer) {
  loginCleanupTimer.unref();
}

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
    return { success: true, remaining: LOGIN_MAX_ATTEMPTS, resetIn: 0 };
  }

  const validAttempts = entry.attempts.filter((t) => now - t < LOGIN_WINDOW_MS);
  entry.attempts = validAttempts;

  if (validAttempts.length >= LOGIN_MAX_ATTEMPTS) {
    const oldestAttempt = validAttempts[0]!;
    const resetIn = Math.ceil((oldestAttempt + LOGIN_WINDOW_MS - now) / 1000);
    return { success: false, remaining: 0, resetIn };
  }

  return {
    success: true,
    remaining: LOGIN_MAX_ATTEMPTS - validAttempts.length,
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
    return;
  }

  entry.attempts = entry.attempts.filter((t) => now - t < LOGIN_WINDOW_MS);
  entry.attempts.push(now);
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

/**
 * Diagnostic upload rate limiting.
 * Uses Redis (strict, cross-instance) when available, with in-memory fallback.
 */

const DIAGNOSTIC_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DIAGNOSTIC_MAX_REQUESTS = 10;
const DIAGNOSTIC_REDIS_PREFIX = "rate_limit:diagnostic";

const diagnosticAttempts = new Map<string, RateLimitEntry>();

let diagnosticRedis: Redis | null = null;
let diagnosticRedisUnavailable = false;

const diagnosticCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of diagnosticAttempts.entries()) {
    const validAttempts = entry.attempts.filter(
      (t) => now - t < DIAGNOSTIC_WINDOW_MS
    );
    if (validAttempts.length === 0) {
      diagnosticAttempts.delete(key);
    } else {
      entry.attempts = validAttempts;
    }
  }
}, 10 * 60 * 1000);

if (typeof diagnosticCleanupTimer === "object" && "unref" in diagnosticCleanupTimer) {
  diagnosticCleanupTimer.unref();
}

export interface DiagnosticRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds until reset
}

function getDiagnosticRedisClient(): Redis | null {
  if (process.env.NODE_ENV === "test") return null;
  if (diagnosticRedisUnavailable) return null;
  if (diagnosticRedis) return diagnosticRedis;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    diagnosticRedisUnavailable = true;
    return null;
  }

  try {
    diagnosticRedis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 5000,
    });

    diagnosticRedis.on("error", () => {
      diagnosticRedisUnavailable = true;
      diagnosticRedis = null;
    });

    return diagnosticRedis;
  } catch {
    diagnosticRedisUnavailable = true;
    return null;
  }
}

function checkAndRecordDiagnosticRateLimitMemory(
  ip: string,
  now: number
): DiagnosticRateLimitResult {
  const key = ip || "unknown";
  const entry = diagnosticAttempts.get(key);

  if (!entry) {
    diagnosticAttempts.set(key, { attempts: [now] });
    return {
      allowed: true,
      remaining: DIAGNOSTIC_MAX_REQUESTS - 1,
      resetIn: 0,
    };
  }

  const validAttempts = entry.attempts.filter(
    (t) => now - t < DIAGNOSTIC_WINDOW_MS
  );
  entry.attempts = validAttempts;

  if (validAttempts.length >= DIAGNOSTIC_MAX_REQUESTS) {
    const oldestAttempt = validAttempts[0]!;
    const resetIn = Math.ceil((oldestAttempt + DIAGNOSTIC_WINDOW_MS - now) / 1000);
    return { allowed: false, remaining: 0, resetIn };
  }

  entry.attempts.push(now);
  return {
    allowed: true,
    remaining: DIAGNOSTIC_MAX_REQUESTS - entry.attempts.length,
    resetIn: 0,
  };
}

async function checkAndRecordDiagnosticRateLimitRedis(
  ip: string,
  now: number
): Promise<DiagnosticRateLimitResult | null> {
  const client = getDiagnosticRedisClient();
  if (!client) return null;

  const bucket = Math.floor(now / DIAGNOSTIC_WINDOW_MS);
  const windowSeconds = Math.ceil(DIAGNOSTIC_WINDOW_MS / 1000);
  const key = `${DIAGNOSTIC_REDIS_PREFIX}:${ip || "unknown"}:${bucket}`;

  try {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
    }

    const ttl = await client.ttl(key);
    const resetIn = ttl > 0 ? ttl : windowSeconds;

    return {
      allowed: count <= DIAGNOSTIC_MAX_REQUESTS,
      remaining: Math.max(0, DIAGNOSTIC_MAX_REQUESTS - count),
      resetIn,
    };
  } catch {
    diagnosticRedisUnavailable = true;
    diagnosticRedis = null;
    return null;
  }
}

/**
 * Atomically checks and records a diagnostic request.
 * Should be called once at the beginning of the upload endpoint.
 */
export async function checkAndRecordDiagnosticRateLimit(
  ip: string
): Promise<DiagnosticRateLimitResult> {
  const now = Date.now();
  const redisResult = await checkAndRecordDiagnosticRateLimitRedis(ip, now);
  if (redisResult) {
    return redisResult;
  }

  return checkAndRecordDiagnosticRateLimitMemory(ip, now);
}

/**
 * Reset diagnostic rate limit state. Useful for tests.
 */
export function resetDiagnosticRateLimit(ip?: string): void {
  if (ip) {
    diagnosticAttempts.delete(ip);
    return;
  }

  diagnosticAttempts.clear();
}

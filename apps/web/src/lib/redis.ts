import Redis from "ioredis";

const DIAGNOSTIC_TTL = 60 * 60; // 1 hour in seconds
const DIAGNOSTIC_PREFIX = "diagnostic:";

let redisClient: Redis | null = null;
let connectionFailed = false;

function getRedisClient(): Redis | null {
  if (connectionFailed) return null;
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    connectionFailed = true;
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 5000,
    });

    redisClient.on("error", () => {
      connectionFailed = true;
      redisClient = null;
    });

    return redisClient;
  } catch {
    connectionFailed = true;
    return null;
  }
}

/**
 * Store a diagnostic result in Redis with TTL (1 hour).
 * Returns false when Redis is unavailable or write fails.
 */
export async function setDiagnosticResult(
  diagnosticId: string,
  data: string
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.setex(
      `${DIAGNOSTIC_PREFIX}${diagnosticId}`,
      DIAGNOSTIC_TTL,
      data
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieve a diagnostic result from Redis.
 * Returns null if not found or Redis is unavailable.
 */
export async function getDiagnosticResult(
  diagnosticId: string
): Promise<string | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    return await client.get(`${DIAGNOSTIC_PREFIX}${diagnosticId}`);
  } catch {
    return null;
  }
}

import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// Re-export schema
export * from "./schema";

const isNeonWsDriverEnabled = () => process.env.DATABASE_DRIVER === "neon-ws";

const configureNeonWebSocketDriver = () => {
  if (process.env.NEON_WS_PROXY) {
    neonConfig.wsProxy = process.env.NEON_WS_PROXY;
  }

  if (process.env.NEON_USE_SECURE_WEBSOCKET === "false") {
    neonConfig.useSecureWebSocket = false;
  }

  if (process.env.NEON_PIPELINE_CONNECT === "false") {
    neonConfig.pipelineConnect = false;
  }
};

type Database = ReturnType<typeof drizzleHttp<typeof schema>>;

// Create database connection
export function createDb(connectionString: string) {
  if (isNeonWsDriverEnabled()) {
    configureNeonWebSocketDriver();
    return drizzleWs(connectionString, { schema }) as unknown as Database;
  }

  const sql = neon(connectionString);
  return drizzleHttp(sql, { schema });
}

// Type for the database instance
export type { Database };

// Singleton pattern for database connection
let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _db = createDb(connectionString);
  }
  return _db;
}

// Export drizzle utilities
export { sql } from "drizzle-orm";
export { eq, ne, gt, gte, lt, lte, and, or, not, inArray, isNull, isNotNull, asc, desc } from "drizzle-orm";

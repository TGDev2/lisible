import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Re-export schema
export * from "./schema";

// Create database connection
export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

// Type for the database instance
export type Database = ReturnType<typeof createDb>;

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

/**
 * Global setup for API integration tests (E10-S3).
 * Uses a real Postgres test database + migration bootstrap + table cleanup.
 */

import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach } from 'vitest';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/sme_studio_test';

const TABLES_TO_TRUNCATE = [
  'credit_transactions',
  'jobs',
  'alerts',
  'segments',
  'files',
  'password_reset_tokens',
  'projects',
  'audit_logs',
  'users',
] as const;

const resolveMigrationsFolder = () => {
  const candidates = [
    path.resolve(process.cwd(), '../../packages/db/migrations'),
    path.resolve(process.cwd(), 'packages/db/migrations'),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `Unable to locate migrations folder. Checked: ${candidates.join(', ')}`
    );
  }
  return found;
};

const getSetupDb = () => drizzle(neon(TEST_DB_URL));

const truncateAllTables = async () => {
  const db = getSetupDb();
  for (const tableName of TABLES_TO_TRUNCATE) {
    await db.execute(
      sql.raw(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE;`)
    );
  }
};

// Must be set before any module imports resolve process.env
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = TEST_DB_URL;
process.env.DATABASE_URL = TEST_DB_URL;
process.env.AUTH_SECRET = 'test-secret-key-32-chars-minimum!!';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.S3_BUCKET_NAME = 'test-bucket';
process.env.S3_REGION = 'eu-west-1';
process.env.S3_ACCESS_KEY_ID = 'test-access-key';
process.env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.S3_ENDPOINT = 'https://s3.eu-west-1.scw.cloud';
process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
process.env.STRIPE_PRO_PRICE_ID = 'price_test_pro';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_placeholder';
process.env.RESEND_API_KEY = 're_test_placeholder';
process.env.EMAIL_FROM = 'noreply@smestudio.fr';
process.env.REDIS_URL = 'redis://localhost:6379';

beforeAll(async () => {
  const db = getSetupDb();
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
    await truncateAllTables();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Integration DB setup failed. Ensure Postgres test DB is running at ${TEST_DB_URL}. Root cause: ${message}`
    );
  }
});

beforeEach(async () => {
  await truncateAllTables();
});

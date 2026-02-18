import { vi } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Types matching the DB schema ──────────────────────────────────────────────

export interface TestUser {
  id: string;
  email: string;
  passwordHash: string;
  plan: 'free' | 'pro';
  creditsTotal: number;
  creditsUsed: number;
  creditsRollover: number;
  creditsResetAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  emailVerified: boolean;
  deletionRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestFile {
  id: string;
  projectId: string;
  userId: string;
  originalName: string;
  fileType: 'srt' | 'vtt' | 'video' | 'audio';
  mimeType: string | null;
  fileSizeBytes: number;
  durationSeconds: number | null;
  storageKey: string | null;
  storageKeySrt: string | null;
  status: 'pending' | 'uploading' | 'processing_stt' | 'processing_sme' | 'ready' | 'failed' | 'deleted';
  progressPercent: number;
  errorMessage: string | null;
  smeScore: number | null;
  smeAnalyzedAt: Date | null;
  creditsConsumed: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestSegment {
  id: string;
  fileId: string;
  sequenceNum: number;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
  isSoundInfo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── Factory helpers ───────────────────────────────────────────────────────────

let userCounter = 0;
let fileCounter = 0;
let segmentCounter = 0;

/** Reset counters between tests if needed (optional) */
export function resetCounters() {
  userCounter = 0;
  fileCounter = 0;
  segmentCounter = 0;
}

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  userCounter++;
  return {
    id: `user-${userCounter}-test-uuid`,
    email: `test${userCounter}@example.com`,
    passwordHash: '$2b$12$hashedpasswordplaceholder',
    plan: 'free',
    creditsTotal: 30,
    creditsUsed: 0,
    creditsRollover: 0,
    creditsResetAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    emailVerified: true,
    deletionRequestedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createProTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return createTestUser({
    plan: 'pro',
    creditsTotal: 200,
    creditsUsed: 0,
    creditsRollover: 0,
    stripeCustomerId: 'cus_test_existing',
    stripeSubscriptionId: 'sub_test_active',
    subscriptionStatus: 'active',
    ...overrides,
  });
}

export function createTestFile(overrides: Partial<TestFile> = {}): TestFile {
  fileCounter++;
  return {
    id: `file-${fileCounter}-test-uuid`,
    projectId: 'project-1-test-uuid',
    userId: 'user-1-test-uuid',
    originalName: `test-file-${fileCounter}.srt`,
    fileType: 'srt',
    mimeType: 'application/x-subrip',
    fileSizeBytes: 1024,
    durationSeconds: null,
    storageKey: `users/user-1/files/file-${fileCounter}/test-file.srt`,
    storageKeySrt: null,
    status: 'pending',
    progressPercent: 0,
    errorMessage: null,
    smeScore: null,
    smeAnalyzedAt: null,
    creditsConsumed: 0,
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createTestSegment(overrides: Partial<TestSegment> = {}): TestSegment {
  segmentCounter++;
  return {
    id: `segment-${segmentCounter}-test-uuid`,
    fileId: 'file-1-test-uuid',
    sequenceNum: segmentCounter,
    startMs: (segmentCounter - 1) * 3000,
    endMs: segmentCounter * 3000,
    text: `Segment ${segmentCounter} text content.`,
    speaker: null,
    isSoundInfo: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ── Chainable mock DB factory ─────────────────────────────────────────────────
//
// Drizzle query builders are PromiseLike — they resolve when awaited.
// This mock replicates that pattern: every method returns `self` (chainable),
// and `self.then()` dequeues the next queued result.
//
// Usage:
//   const db = createMockDb();
//   db._queue([user]);       // next await will return [user]
//   db._queue([]);           // next await returns []
//
// Cleanup DB after each test:
//   db._clear();             // or create a fresh db per test in beforeEach

export type MockDb = ReturnType<typeof createMockDb>;

export function createMockDb() {
  const results: unknown[][] = [];

  const mock: Record<string, unknown> & {
    _queue: (...values: unknown[][]) => typeof mock;
    _clear: () => typeof mock;
    then: (
      resolve: (value: unknown) => void,
      reject?: (reason?: unknown) => void
    ) => void;
  } = {} as never;

  // Called each time a Drizzle chain is awaited
  const dequeue = (): unknown[] => results.shift() ?? [];

  const returnSelf = () => mock;

  Object.assign(mock, {
    // PromiseLike.then — executes and returns next queued result
    then: (
      resolve: (value: unknown) => void,
      reject?: (reason?: unknown) => void
    ) => {
      try {
        resolve(dequeue());
      } catch (err) {
        reject?.(err);
      }
    },

    // Test helpers
    _queue: (...values: unknown[][]) => {
      results.push(...values);
      return mock;
    },
    _clear: () => {
      results.length = 0;
      return mock;
    },

    // Drizzle query methods — all chainable
    select: vi.fn(returnSelf),
    insert: vi.fn(returnSelf),
    update: vi.fn(returnSelf),
    delete: vi.fn(returnSelf),
    from: vi.fn(returnSelf),
    values: vi.fn(returnSelf),
    set: vi.fn(returnSelf),
    where: vi.fn(returnSelf),
    returning: vi.fn(returnSelf),
    limit: vi.fn(returnSelf),
    orderBy: vi.fn(returnSelf),
    leftJoin: vi.fn(returnSelf),
    innerJoin: vi.fn(returnSelf),
    groupBy: vi.fn(returnSelf),
    having: vi.fn(returnSelf),
  });

  return mock;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

/** Build a Request object the way Next.js App Router route handlers receive it. */
export function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init) as unknown as NextRequest;
}

/** Build a minimal NextAuth session object. */
export function makeSession(user: Pick<TestUser, 'id' | 'email' | 'plan'>) {
  return {
    user: {
      id: user.id,
      email: user.email,
      plan: user.plan,
      name: null,
      image: null,
    },
    expires: new Date(Date.now() + 3600 * 1000).toISOString(),
  };
}

/** Parse a Response body as JSON (helper for assertions). */
export async function parseJson<T = Record<string, unknown>>(
  response: Response
): Promise<T> {
  return response.json() as Promise<T>;
}

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, getDb, passwordResetTokens, users } from '@sme-studio/db';
import { makeRequest, parseJson } from '@/test/integration/helpers';
import { createDbUser } from '@/test/integration/db-fixtures';

vi.mock('@/lib/email', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockReturnValue({
    get: vi.fn((key: string) => (key === 'x-forwarded-for' ? '127.0.0.1' : null)),
  }),
}));

describe('DB integration | /api/auth/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/auth/register persists a new user in test DB', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const email = `register-${randomUUID()}@example.com`;

    const response = await POST(
      makeRequest('POST', 'http://localhost/api/auth/register', {
        email,
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!',
      })
    );

    expect(response.status).toBe(201);
    const db = getDb();
    const [dbUser] = await db
      .select({ id: users.id, email: users.email, plan: users.plan })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    expect(dbUser).toBeDefined();
    expect(dbUser?.plan).toBe('free');
  });

  it('POST /api/auth/forgot-password stores a reset token for an existing user', async () => {
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const user = await createDbUser();

    const response = await POST(
      makeRequest('POST', 'http://localhost/api/auth/forgot-password', {
        email: user.email,
      })
    );

    expect(response.status).toBe(200);
    const db = getDb();
    const tokens = await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        usedAt: passwordResetTokens.usedAt,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    expect(tokens.length).toBe(1);
    expect(tokens[0]?.usedAt).toBeNull();
  });

  it('POST /api/auth/reset-password/[token] updates password and marks token used', async () => {
    const { POST } = await import('@/app/api/auth/reset-password/[token]/route');
    const user = await createDbUser();
    const db = getDb();
    const token = 'b'.repeat(64);

    const [createdToken] = await db
      .insert(passwordResetTokens)
      .values({
        id: randomUUID(),
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
      .returning();

    expect(createdToken).toBeDefined();

    const response = await POST(
      makeRequest('POST', `http://localhost/api/auth/reset-password/${token}`, {
        password: 'NewSecurePass123',
      }),
      { params: Promise.resolve({ token }) }
    );
    const body = await parseJson<{ success: boolean }>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const [updatedToken] = await db
      .select({ usedAt: passwordResetTokens.usedAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    expect(updatedToken?.usedAt).not.toBeNull();
  });
});

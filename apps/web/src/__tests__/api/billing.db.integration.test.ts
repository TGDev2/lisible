import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, getDb, users } from '@sme-studio/db';
import { makeRequest, parseJson } from '@/test/integration/helpers';
import { createDbUser, makeAuthSession } from '@/test/integration/db-fixtures';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn().mockReturnValue({
    customers: {
      create: vi.fn().mockResolvedValue({
        id: 'cus_test_real_123',
      }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_test_real_123',
          url: 'https://checkout.stripe.com/pay/cs_test_real_123',
        }),
      },
    },
  }),
}));

vi.mock('@/lib/storage', () => ({
  getSignedUploadUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
  download: vi.fn(),
}));

vi.mock('@/lib/queue', () => ({
  enqueueSTTJob: vi.fn().mockResolvedValue(undefined),
}));

describe('DB integration | billing + quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/user/quota returns totals from persisted user credits', async () => {
    const { auth } = await import('@/lib/auth');
    const { GET } = await import('@/app/api/user/quota/route');
    const user = await createDbUser({
      plan: 'pro',
      creditsTotal: 200,
      creditsUsed: 50,
      creditsRollover: 20,
    });

    vi.mocked(auth).mockResolvedValue(makeAuthSession(user) as never);

    const response = await GET();
    const body = await parseJson<{
      plan: string;
      credits: { total: number; used: number; available: number };
    }>(response);

    expect(response.status).toBe(200);
    expect(body.plan).toBe('pro');
    expect(body.credits.total).toBe(220);
    expect(body.credits.used).toBe(50);
    expect(body.credits.available).toBe(170);
  });

  it('POST /api/billing/checkout creates stripe customer id in DB for free user', async () => {
    const { auth } = await import('@/lib/auth');
    const { POST } = await import('@/app/api/billing/checkout/route');
    const user = await createDbUser({
      plan: 'free',
      stripeCustomerId: null,
    });

    vi.mocked(auth).mockResolvedValue(makeAuthSession(user) as never);

    const response = await POST();
    const body = await parseJson<{ url: string }>(response);

    expect(response.status).toBe(200);
    expect(body.url).toContain('checkout.stripe.com');

    const db = getDb();
    const [updatedUser] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    expect(updatedUser?.stripeCustomerId).toBe('cus_test_real_123');
  });

  it('POST /api/files blocks video creation with exhausted credits', async () => {
    const { auth } = await import('@/lib/auth');
    const { POST } = await import('@/app/api/files/route');
    const user = await createDbUser({
      creditsTotal: 30,
      creditsUsed: 30,
      creditsRollover: 0,
    });

    vi.mocked(auth).mockResolvedValue(makeAuthSession(user) as never);

    const response = await POST(
      makeRequest('POST', 'http://localhost/api/files', {
        name: 'blocked.mp4',
        type: 'video',
        size: 50 * 1024 * 1024,
        mimeType: 'video/mp4',
        estimatedDuration: 600,
      }) as never
    );

    const body = await parseJson<{ code: string; available: number }>(response);
    expect(response.status).toBe(402);
    expect(body.code).toBe('QUOTA_EXCEEDED');
    expect(body.available).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, getDb, segments } from '@sme-studio/db';
import { makeRequest } from '@/test/integration/helpers';
import {
  createDbFile,
  createDbProject,
  createDbSegment,
  createDbUser,
  makeAuthSession,
} from '@/test/integration/db-fixtures';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

describe('DB integration | /api/segments/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PATCH /api/segments/[id] updates persisted segment text', async () => {
    const { auth } = await import('@/lib/auth');
    const { PATCH } = await import('@/app/api/segments/[id]/route');
    const user = await createDbUser();
    const project = await createDbProject(user.id);
    const file = await createDbFile(user.id, project.id);
    const segment = await createDbSegment(file.id, 1, { text: 'Old text' });

    vi.mocked(auth).mockResolvedValue(makeAuthSession(user) as never);

    const response = await PATCH(
      makeRequest('PATCH', `http://localhost/api/segments/${segment.id}`, {
        text: 'Updated text',
      }),
      { params: Promise.resolve({ id: segment.id }) }
    );

    expect(response.status).toBe(200);
    const db = getDb();
    const [updated] = await db
      .select({ text: segments.text })
      .from(segments)
      .where(eq(segments.id, segment.id))
      .limit(1);

    expect(updated?.text).toBe('Updated text');
  });

  it('POST /api/segments/merge merges two consecutive rows in DB', async () => {
    const { auth } = await import('@/lib/auth');
    const { POST } = await import('@/app/api/segments/merge/route');
    const user = await createDbUser();
    const project = await createDbProject(user.id);
    const file = await createDbFile(user.id, project.id);
    const seg1 = await createDbSegment(file.id, 1, { text: 'Hello' });
    const seg2 = await createDbSegment(file.id, 2, { text: 'world', startMs: 2000, endMs: 4000 });

    vi.mocked(auth).mockResolvedValue(makeAuthSession(user) as never);

    const response = await POST(
      makeRequest('POST', 'http://localhost/api/segments/merge', {
        segmentIds: [seg1.id, seg2.id],
      })
    );
    expect(response.status).toBe(200);

    const db = getDb();
    const persisted = await db
      .select({ id: segments.id, text: segments.text, sequenceNum: segments.sequenceNum })
      .from(segments)
      .where(eq(segments.fileId, file.id));

    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.text).toBe('Hello world');
    expect(persisted[0]?.sequenceNum).toBe(1);
  });

  it('POST /api/segments/split creates a new segment row', async () => {
    const { auth } = await import('@/lib/auth');
    const { POST } = await import('@/app/api/segments/split/route');
    const user = await createDbUser();
    const project = await createDbProject(user.id);
    const file = await createDbFile(user.id, project.id);
    const segment = await createDbSegment(file.id, 1, {
      text: 'Hello world',
      startMs: 0,
      endMs: 4000,
    });

    vi.mocked(auth).mockResolvedValue(makeAuthSession(user) as never);

    const response = await POST(
      makeRequest('POST', 'http://localhost/api/segments/split', {
        segmentId: segment.id,
        cursorPosition: 5,
      })
    );
    expect(response.status).toBe(200);

    const db = getDb();
    const persisted = await db
      .select({ id: segments.id, text: segments.text, sequenceNum: segments.sequenceNum })
      .from(segments)
      .where(eq(segments.fileId, file.id));

    expect(persisted).toHaveLength(2);
    expect(persisted.some((row) => row.text === 'Hello')).toBe(true);
    expect(persisted.some((row) => row.text === 'world')).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, files, getDb, jobs, projects, segments } from '@sme-studio/db';
import { makeRequest, parseJson } from '@/test/integration/helpers';
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

vi.mock('@/lib/storage', () => ({
  getSignedUploadUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
  download: vi.fn(),
}));

vi.mock('@/lib/queue', () => ({
  enqueueSTTJob: vi.fn().mockResolvedValue(undefined),
}));

describe('DB integration | /api/files/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/files creates file + project rows', async () => {
    const { auth } = await import('@/lib/auth');
    const { POST } = await import('@/app/api/files/route');

    const user = await createDbUser();
    vi.mocked(auth).mockResolvedValue(makeAuthSession(user) as never);

    const response = await POST(
      makeRequest('POST', 'http://localhost/api/files', {
        name: 'upload.srt',
        type: 'srt',
        size: 1024,
        mimeType: 'application/x-subrip',
      }) as never
    );

    expect(response.status).toBe(201);
    const body = await parseJson<{ fileId: string; projectId: string }>(response);

    const db = getDb();
    const [dbProject] = await db
      .select({ id: projects.id, userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, body.projectId))
      .limit(1);

    const [dbFile] = await db
      .select({ id: files.id, userId: files.userId, status: files.status })
      .from(files)
      .where(eq(files.id, body.fileId))
      .limit(1);

    expect(dbProject?.userId).toBe(user.id);
    expect(dbFile?.userId).toBe(user.id);
    expect(dbFile?.status).toBe('pending');
  });

  it('POST /api/files returns 402 when video quota is exhausted', async () => {
    const { auth } = await import('@/lib/auth');
    const { POST } = await import('@/app/api/files/route');

    const user = await createDbUser({ creditsTotal: 30, creditsUsed: 30 });
    vi.mocked(auth).mockResolvedValue(makeAuthSession(user) as never);

    const response = await POST(
      makeRequest('POST', 'http://localhost/api/files', {
        name: 'course.mp4',
        type: 'video',
        size: 40 * 1024 * 1024,
        mimeType: 'video/mp4',
        estimatedDuration: 15 * 60,
      }) as never
    );
    const body = await parseJson<{ code: string }>(response);

    expect(response.status).toBe(402);
    expect(body.code).toBe('QUOTA_EXCEEDED');
  });

  it('POST /api/files/[id]/confirm sets processing_stt and creates job for video file', async () => {
    const { auth } = await import('@/lib/auth');
    const { POST } = await import('@/app/api/files/[id]/confirm/route');

    const user = await createDbUser();
    const project = await createDbProject(user.id);
    const file = await createDbFile(user.id, project.id, {
      fileType: 'video',
      mimeType: 'video/mp4',
      status: 'pending',
      storageKey: `users/${user.id}/files/video.mp4`,
    });

    vi.mocked(auth).mockResolvedValue(makeAuthSession(user) as never);

    const response = await POST(
      makeRequest('POST', `http://localhost/api/files/${file.id}/confirm`) as never,
      { params: Promise.resolve({ id: file.id }) }
    );

    expect(response.status).toBe(200);
    const db = getDb();
    const [updatedFile] = await db
      .select({ status: files.status })
      .from(files)
      .where(eq(files.id, file.id))
      .limit(1);

    const createdJobs = await db
      .select({ id: jobs.id, fileId: jobs.fileId, status: jobs.status })
      .from(jobs)
      .where(eq(jobs.fileId, file.id));

    expect(updatedFile?.status).toBe('processing_stt');
    expect(createdJobs.length).toBe(1);
    expect(createdJobs[0]?.status).toBe('pending');
  });

  it('GET /api/files/[id]/export returns subtitle content for ready file', async () => {
    const { auth } = await import('@/lib/auth');
    const { GET } = await import('@/app/api/files/[id]/export/route');

    const user = await createDbUser();
    const project = await createDbProject(user.id);
    const file = await createDbFile(user.id, project.id, {
      status: 'ready',
      fileType: 'srt',
      originalName: 'module.vtt',
    });
    await createDbSegment(file.id, 1, {
      startMs: 0,
      endMs: 1000,
      text: 'Bonjour',
    });

    vi.mocked(auth).mockResolvedValue(makeAuthSession(user) as never);

    const url = `http://localhost/api/files/${file.id}/export?format=srt`;
    const request = makeRequest('GET', url);
    (request as unknown as { nextUrl: URL }).nextUrl = new URL(url);

    const response = await GET(request as never, {
      params: Promise.resolve({ id: file.id }),
    });

    const content = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/srt');
    expect(content).toContain('Bonjour');

    const db = getDb();
    const persistedSegments = await db
      .select({ id: segments.id })
      .from(segments)
      .where(eq(segments.fileId, file.id));
    expect(persistedSegments.length).toBe(1);
  });
});

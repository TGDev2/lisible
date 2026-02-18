import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  getDb,
  users,
  projects,
  files,
  segments,
  type User,
  type Project,
  type File,
  type Segment,
} from '@sme-studio/db';

export async function createDbUser(overrides: Partial<User> = {}): Promise<User> {
  const db = getDb();
  const email = overrides.email ?? `it-${randomUUID()}@example.com`;
  const passwordHash =
    overrides.passwordHash ?? (await bcrypt.hash('SecurePass123!', 12));

  const [user] = await db
    .insert(users)
    .values({
      id: overrides.id ?? randomUUID(),
      email,
      passwordHash,
      emailVerified: overrides.emailVerified ?? true,
      plan: overrides.plan ?? 'free',
      creditsTotal: overrides.creditsTotal ?? 30,
      creditsUsed: overrides.creditsUsed ?? 0,
      creditsRollover: overrides.creditsRollover ?? 0,
      stripeCustomerId: overrides.stripeCustomerId ?? null,
      stripeSubscriptionId: overrides.stripeSubscriptionId ?? null,
      subscriptionStatus: overrides.subscriptionStatus ?? null,
      creditsResetAt: overrides.creditsResetAt ?? null,
      deletionRequestedAt: overrides.deletionRequestedAt ?? null,
      createdAt: overrides.createdAt ?? new Date(),
      updatedAt: overrides.updatedAt ?? new Date(),
    })
    .returning();

  if (!user) {
    throw new Error('Failed to insert test user');
  }
  return user;
}

export async function createDbProject(userId: string, name = 'Projet test'): Promise<Project> {
  const db = getDb();
  const [project] = await db
    .insert(projects)
    .values({
      id: randomUUID(),
      userId,
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
    })
    .returning();

  if (!project) {
    throw new Error('Failed to insert test project');
  }
  return project;
}

export async function createDbFile(
  userId: string,
  projectId: string,
  overrides: Partial<File> = {}
): Promise<File> {
  const db = getDb();
  const [file] = await db
    .insert(files)
    .values({
      id: overrides.id ?? randomUUID(),
      userId,
      projectId,
      originalName: overrides.originalName ?? 'sample.srt',
      fileType: overrides.fileType ?? 'srt',
      mimeType: overrides.mimeType ?? 'application/x-subrip',
      fileSizeBytes: overrides.fileSizeBytes ?? 1024,
      durationSeconds: overrides.durationSeconds ?? null,
      storageKey: overrides.storageKey ?? `users/${userId}/files/${randomUUID()}/sample.srt`,
      storageKeySrt: overrides.storageKeySrt ?? null,
      status: overrides.status ?? 'pending',
      progressPercent: overrides.progressPercent ?? 0,
      errorMessage: overrides.errorMessage ?? null,
      smeScore: overrides.smeScore ?? null,
      smeAnalyzedAt: overrides.smeAnalyzedAt ?? null,
      creditsConsumed: overrides.creditsConsumed ?? 0,
      expiresAt: overrides.expiresAt ?? null,
      createdAt: overrides.createdAt ?? new Date(),
      updatedAt: overrides.updatedAt ?? new Date(),
    })
    .returning();

  if (!file) {
    throw new Error('Failed to insert test file');
  }
  return file;
}

export async function createDbSegment(
  fileId: string,
  sequenceNum: number,
  overrides: Partial<Segment> = {}
): Promise<Segment> {
  const db = getDb();
  const [segment] = await db
    .insert(segments)
    .values({
      id: overrides.id ?? randomUUID(),
      fileId,
      sequenceNum: overrides.sequenceNum ?? sequenceNum,
      startMs: overrides.startMs ?? (sequenceNum - 1) * 3000,
      endMs: overrides.endMs ?? sequenceNum * 3000,
      text: overrides.text ?? `Segment ${sequenceNum}`,
      speaker: overrides.speaker ?? null,
      isSoundInfo: overrides.isSoundInfo ?? false,
      createdAt: overrides.createdAt ?? new Date(),
      updatedAt: overrides.updatedAt ?? new Date(),
    })
    .returning();

  if (!segment) {
    throw new Error('Failed to insert test segment');
  }
  return segment;
}

export function makeAuthSession(user: Pick<User, 'id' | 'email' | 'plan'>) {
  return {
    user: {
      id: user.id,
      email: user.email,
      plan: user.plan ?? 'free',
      name: null,
      image: null,
    },
    expires: new Date(Date.now() + 3600 * 1000).toISOString(),
  };
}

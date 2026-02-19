import { vi } from 'vitest';
import type { Job } from 'bullmq';

/**
 * Create a mock BullMQ Job for testing processors
 */
export function createMockJob<T>(data: T, overrides?: Partial<Job<T>>): Job<T> {
  return {
    id: 'test-job-1',
    name: 'test',
    data,
    attemptsMade: 0,
    updateProgress: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Job<T>;
}

/**
 * Valid SRT content for testing SME processor
 */
export const MOCK_SRT_CONTENT = `1
00:00:01,000 --> 00:00:04,000
Bonjour et bienvenue dans ce module.

2
00:00:04,500 --> 00:00:08,000
Nous allons voir les bases.

3
00:00:08,500 --> 00:00:12,000
Commençons par le premier chapitre.
`;

/**
 * SRT content with known SME errors for testing alert detection
 */
export const MOCK_SRT_WITH_ERRORS = `1
00:00:01,000 --> 00:00:02,000
Ce texte est beaucoup trop long pour tenir dans un seul segment et devrait provoquer une alerte de vitesse.

2
00:00:02,000 --> 00:00:02,400
Court.

3
00:00:03,000 --> 00:00:02,500
Overlap avec le segment précédent qui a un end_ms supérieur.

4
00:00:05,000 --> 00:00:09,000
Bonjour Martin et bienvenue dans ce module de formation chez Dupont International.
`;

/**
 * SRT with overlapping segments
 */
export const MOCK_SRT_OVERLAP = `1
00:00:01,000 --> 00:00:04,000
Premier segment normal.

2
00:00:03,500 --> 00:00:07,000
Ce segment chevauche le premier de 500ms.

3
00:00:07,500 --> 00:00:10,000
Troisième segment sans chevauchement.
`;

/** Test UUIDs */
export const TEST_FILE_ID = '00000000-0000-0000-0000-000000000001';
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
export const TEST_STORAGE_KEY = 'users/test-user/files/test-file/test.srt';

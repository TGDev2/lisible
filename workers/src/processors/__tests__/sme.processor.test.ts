import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.hoisted(() => {
  if (!process.env.REDIS_URL) {
    process.env.REDIS_URL = 'rediss://default:test-password@localhost:6379';
  }
});
import type { SMEJobData } from '../../queues';
import {
  createMockJob,
  MOCK_SRT_CONTENT,
  MOCK_SRT_WITH_ERRORS,
  MOCK_SRT_OVERLAP,
  TEST_FILE_ID,
  TEST_USER_ID,
  TEST_STORAGE_KEY,
} from '../../__tests__/helpers';

// ── Mocks ────────────────────────────────────────────────────────────────

// Mock storage (S3 download)
const mockDownloadObject = vi.fn<[string], Promise<string>>();

vi.mock('../../lib/storage', () => ({
  downloadObject: (...args: unknown[]) => mockDownloadObject(args[0] as string),
}));

// Mock database operations
const mockDbUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockDbUpdateSet = vi.fn().mockReturnValue({
  where: mockDbUpdateWhere,
});
const mockDbUpdate = vi.fn().mockReturnValue({ set: mockDbUpdateSet });
const mockDbInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([]),
  }),
});
const mockDbDelete = vi.fn().mockReturnValue({
  where: vi.fn().mockResolvedValue(undefined),
});

vi.mock('@sme-studio/db', () => ({
  getDb: () => ({
    update: mockDbUpdate,
    insert: mockDbInsert,
    delete: mockDbDelete,
  }),
  files: { id: 'id', progressPercent: 'progressPercent', updatedAt: 'updatedAt' },
  segments: { id: 'id', sequenceNum: 'sequenceNum' },
  alerts: { fileId: 'fileId' },
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

// Import the processor module dynamically after mocks are set up
// We need to access the internal processSMEJob function
// Since it's not exported directly, we test via createSMEWorker indirection
// Instead, we re-export the processor logic for testing

// The processor is not directly exported, so we import it dynamically
// and mock the Worker constructor
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Queue: vi.fn(),
}));

// We need to test the actual processor function.
// Since processSMEJob is not exported, we access it via the Worker constructor mock.
import { createSMEWorker } from '../sme.processor';
import { Worker } from 'bullmq';

/**
 * Extract the processor function passed to the BullMQ Worker constructor.
 */
function getProcessorFn(): (job: ReturnType<typeof createMockJob<SMEJobData>>) => Promise<{ score: number; alertsCount: number }> {
  createSMEWorker();
  const WorkerMock = Worker as unknown as ReturnType<typeof vi.fn>;
  const calls = WorkerMock.mock.calls;
  const lastCall = calls[calls.length - 1] as unknown[];
  return lastCall[1] as (job: ReturnType<typeof createMockJob<SMEJobData>>) => Promise<{ score: number; alertsCount: number }>;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('sme.processor', () => {
  let processSMEJob: ReturnType<typeof getProcessorFn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset insert mock to return segment IDs (needed for segmentIdMap)
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation((returning) => {
          // If returning expects id + sequenceNum (segments insert)
          if (returning && 'id' in returning && 'sequenceNum' in returning) {
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        }),
      }),
    });

    mockDbUpdateSet.mockReturnValue({
      where: mockDbUpdateWhere,
    });

    mockDbDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    processSMEJob = getProcessorFn();
  });

  // AC: Tests sme.processor avec fichier mock
  describe('successful processing with mock SRT file', () => {
    it('should process a valid SRT file and return score + alertsCount', async () => {
      mockDownloadObject.mockResolvedValue(MOCK_SRT_CONTENT);

      // Make insert return mapped segment IDs
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 'seg-1', sequenceNum: 1 },
            { id: 'seg-2', sequenceNum: 2 },
            { id: 'seg-3', sequenceNum: 3 },
          ]),
        }),
      });

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      const result = await processSMEJob(job);

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('alertsCount');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(typeof result.alertsCount).toBe('number');
    });

    it('should download file from storage using the provided storageKey', async () => {
      mockDownloadObject.mockResolvedValue(MOCK_SRT_CONTENT);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 'seg-1', sequenceNum: 1 },
            { id: 'seg-2', sequenceNum: 2 },
            { id: 'seg-3', sequenceNum: 3 },
          ]),
        }),
      });

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSMEJob(job);

      expect(mockDownloadObject).toHaveBeenCalledWith(TEST_STORAGE_KEY);
    });

    it('should insert parsed segments with exact DB payload', async () => {
      mockDownloadObject.mockResolvedValue(MOCK_SRT_CONTENT);

      const mockInsertSegmentsValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 'seg-1', sequenceNum: 1 },
          { id: 'seg-2', sequenceNum: 2 },
          { id: 'seg-3', sequenceNum: 3 },
        ]),
      });

      mockDbInsert.mockReturnValue({
        values: mockInsertSegmentsValues,
      });

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSMEJob(job);

      expect(mockInsertSegmentsValues).toHaveBeenCalledTimes(1);
      const insertedSegments = mockInsertSegmentsValues.mock.calls[0]?.[0] as Array<{
        fileId: string;
        sequenceNum: number;
        startMs: number;
        endMs: number;
        text: string;
        speaker: string | null;
        isSoundInfo: boolean;
      }>;
      expect(insertedSegments).toEqual([
        {
          fileId: TEST_FILE_ID,
          sequenceNum: 1,
          startMs: 1000,
          endMs: 4000,
          text: 'Bonjour et bienvenue dans ce module.',
          speaker: null,
          isSoundInfo: false,
        },
        {
          fileId: TEST_FILE_ID,
          sequenceNum: 2,
          startMs: 4500,
          endMs: 8000,
          text: 'Nous allons voir les bases.',
          speaker: null,
          isSoundInfo: false,
        },
        {
          fileId: TEST_FILE_ID,
          sequenceNum: 3,
          startMs: 8500,
          endMs: 12000,
          text: 'Commençons par le premier chapitre.',
          speaker: null,
          isSoundInfo: false,
        },
      ]);
    });

    it('should update file status to processing_sme at start', async () => {
      mockDownloadObject.mockResolvedValue(MOCK_SRT_CONTENT);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 'seg-1', sequenceNum: 1 },
          ]),
        }),
      });

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSMEJob(job);

      const firstUpdatePayload = mockDbUpdateSet.mock.calls[0]?.[0] as
        | { status?: string }
        | undefined;
      expect(firstUpdatePayload?.status).toBe('processing_sme');
    });

    it('should update progress throughout the job', async () => {
      mockDownloadObject.mockResolvedValue(MOCK_SRT_CONTENT);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 'seg-1', sequenceNum: 1 },
          ]),
        }),
      });

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSMEJob(job);

      // job.updateProgress should have been called multiple times
      expect(job.updateProgress).toHaveBeenCalled();
      const calls = (job.updateProgress as ReturnType<typeof vi.fn>).mock.calls;
      const progressValues = calls.map((c: unknown[]) => c[0] as number);

      // Should start low and end at 100
      expect(progressValues[0]).toBeLessThan(50);
      expect(progressValues[progressValues.length - 1]).toBe(100);
    });

    it('should produce a high score for a clean SRT file', async () => {
      mockDownloadObject.mockResolvedValue(MOCK_SRT_CONTENT);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 'seg-1', sequenceNum: 1 },
            { id: 'seg-2', sequenceNum: 2 },
            { id: 'seg-3', sequenceNum: 3 },
          ]),
        }),
      });

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      const result = await processSMEJob(job);

      // The clean SRT should have a relatively high score
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should delete existing segments and alerts before re-inserting (re-analysis)', async () => {
      mockDownloadObject.mockResolvedValue(MOCK_SRT_CONTENT);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 'seg-1', sequenceNum: 1 },
          ]),
        }),
      });

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSMEJob(job);

      // db.delete should be called for alerts and segments
      expect(mockDbDelete).toHaveBeenCalledTimes(2);
    });
  });

  describe('alert detection', () => {
    it('should detect overlapping segments', async () => {
      mockDownloadObject.mockResolvedValue(MOCK_SRT_OVERLAP);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 'seg-1', sequenceNum: 1 },
            { id: 'seg-2', sequenceNum: 2 },
            { id: 'seg-3', sequenceNum: 3 },
          ]),
        }),
      });

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      const result = await processSMEJob(job);

      // Should have at least 1 alert for overlap
      expect(result.alertsCount).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThan(100);
    });

    it('should detect errors and produce a lower score for problematic SRT', async () => {
      mockDownloadObject.mockResolvedValue(MOCK_SRT_WITH_ERRORS);
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 'seg-1', sequenceNum: 1 },
            { id: 'seg-2', sequenceNum: 2 },
            { id: 'seg-3', sequenceNum: 3 },
            { id: 'seg-4', sequenceNum: 4 },
          ]),
        }),
      });

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      const result = await processSMEJob(job);

      // Should have multiple alerts for speed, duration, overlap, proper nouns
      expect(result.alertsCount).toBeGreaterThanOrEqual(2);
      expect(result.score).toBeLessThan(90);
    });
  });

  // AC: Tests error handling
  describe('error handling', () => {
    it('should update file status to failed when download fails', async () => {
      mockDownloadObject.mockRejectedValue(new Error('S3 download failed'));

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await expect(processSMEJob(job)).rejects.toThrow('S3 download failed');

      const hasFailedStatus = mockDbUpdateSet.mock.calls.some(
        ([payload]) => (payload as { status?: string }).status === 'failed'
      );
      expect(hasFailedStatus).toBe(true);
    });

    it('should throw when SRT file has no segments', async () => {
      // Empty / invalid SRT
      mockDownloadObject.mockResolvedValue('not a valid srt file');

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await expect(processSMEJob(job)).rejects.toThrow();
    });

    it('should re-throw the error so BullMQ can handle retries', async () => {
      mockDownloadObject.mockRejectedValue(new Error('Network timeout'));

      const job = createMockJob<SMEJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await expect(processSMEJob(job)).rejects.toThrow('Network timeout');
    });
  });
});

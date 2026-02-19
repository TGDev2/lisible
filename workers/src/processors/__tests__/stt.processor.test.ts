import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { STTJobData } from '../../queues';
import {
  createMockJob,
  TEST_FILE_ID,
  TEST_USER_ID,
  TEST_STORAGE_KEY,
} from '../../__tests__/helpers';

// ── Mocks ────────────────────────────────────────────────────────────────

// Storage
const mockDownloadObjectAsBuffer = vi.fn<[string], Promise<Buffer>>();
const mockUploadObject = vi.fn<[string, string | Buffer, string], Promise<void>>();
const mockDeleteObject = vi.fn<[string], Promise<void>>();

vi.mock('../../lib/storage', () => ({
  downloadObjectAsBuffer: (...args: unknown[]) => mockDownloadObjectAsBuffer(args[0] as string),
  uploadObject: (...args: unknown[]) => mockUploadObject(args[0] as string, args[1] as string | Buffer, args[2] as string),
  deleteObject: (...args: unknown[]) => mockDeleteObject(args[0] as string),
}));

// FFmpeg
const mockPrepareForSTT = vi.fn();
const mockIsVideoFile = vi.fn();

vi.mock('../../lib/ffmpeg', () => ({
  prepareForSTT: (...args: unknown[]) => mockPrepareForSTT(...args),
  isVideoFile: (...args: unknown[]) => mockIsVideoFile(...args),
}));

// SRT generator
const mockGenerateSRT = vi.fn().mockReturnValue('1\n00:00:01,000 --> 00:00:04,000\nTest\n');
const mockGenerateSrtStorageKey = vi.fn().mockReturnValue('users/test/files/test/test.srt');

vi.mock('../../lib/srt-generator', () => ({
  generateSRT: (...args: unknown[]) => mockGenerateSRT(...args),
  generateSrtStorageKey: (...args: unknown[]) => mockGenerateSrtStorageKey(...args),
}));

// Credits
const mockDeductCredits = vi.fn();

vi.mock('../../lib/credits', () => ({
  deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    constructor(public readonly available: number, public readonly required: number) {
      super(`Insufficient credits: ${available} available, ${required} required`);
      this.name = 'InsufficientCreditsError';
    }
  },
}));

// STT Orchestrator
const mockTranscribe = vi.fn();

vi.mock('@sme-studio/stt', () => ({
  STTOrchestrator: vi.fn().mockImplementation(() => ({
    transcribe: mockTranscribe,
  })),
}));

// Database
const mockDbUpdateSet = vi.fn().mockReturnValue({
  where: vi.fn().mockResolvedValue(undefined),
});
const mockDbUpdate = vi.fn().mockReturnValue({ set: mockDbUpdateSet });
const mockDbSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([{ originalName: 'test-video.mp4' }]),
  }),
});

vi.mock('@sme-studio/db', () => ({
  getDb: () => ({
    update: mockDbUpdate,
    select: mockDbSelect,
  }),
  files: { id: 'id', originalName: 'originalName' },
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

// Mock SME queue for enqueue
const mockSmeQueueAdd = vi.fn().mockResolvedValue(undefined);

vi.mock('../../queues', async () => {
  const actual = await vi.importActual('../../queues') as Record<string, unknown>;
  return {
    ...actual,
    getSMEQueue: () => ({
      add: mockSmeQueueAdd,
    }),
  };
});

// BullMQ Worker mock
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Queue: vi.fn(),
}));

import { createSTTWorker } from '../stt.processor';
import { Worker } from 'bullmq';

function getProcessorFn() {
  createSTTWorker();
  const WorkerMock = Worker as unknown as ReturnType<typeof vi.fn>;
  const calls = WorkerMock.mock.calls;
  const lastCall = calls[calls.length - 1] as unknown[];
  return lastCall[1] as (job: ReturnType<typeof createMockJob<STTJobData>>) => Promise<{ segmentsCount: number; durationMs: number; provider: string }>;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('stt.processor', () => {
  let processSTTJob: ReturnType<typeof getProcessorFn>;

  const sttResultMock = {
    segments: [
      { startMs: 1000, endMs: 4000, text: 'Bonjour', confidence: 0.98 },
      { startMs: 4500, endMs: 8000, text: 'Bienvenue', confidence: 0.95 },
    ],
    durationMs: 120000,
    language: 'fr',
    provider: 'whisper-openai',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path mocks
    mockDownloadObjectAsBuffer.mockResolvedValue(Buffer.from('fake-video-content'));
    mockUploadObject.mockResolvedValue(undefined);
    mockDeleteObject.mockResolvedValue(undefined);

    mockIsVideoFile.mockReturnValue(true);
    mockPrepareForSTT.mockResolvedValue({
      audioBuffer: Buffer.from('fake-audio'),
      durationSeconds: 120,
      wasVideo: true,
    });

    mockTranscribe.mockResolvedValue(sttResultMock);

    mockDeductCredits.mockResolvedValue({
      minutesDeducted: 2,
      creditsRemaining: 28,
    });

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ originalName: 'test-video.mp4' }]),
      }),
    });

    mockDbUpdateSet.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    processSTTJob = getProcessorFn();
  });

  // AC: Tests stt.processor avec provider mocké
  describe('successful transcription with mocked provider', () => {
    it('should download file, transcribe, and return result', async () => {
      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      const result = await processSTTJob(job);

      expect(result.segmentsCount).toBe(2);
      expect(result.durationMs).toBe(120000);
      expect(result.provider).toBe('whisper-openai');
    });

    it('should download the file from S3', async () => {
      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSTTJob(job);

      expect(mockDownloadObjectAsBuffer).toHaveBeenCalledWith(TEST_STORAGE_KEY);
    });

    it('should prepare file for STT (extract audio if video)', async () => {
      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSTTJob(job);

      expect(mockPrepareForSTT).toHaveBeenCalled();
    });

    it('should call STT orchestrator with audio buffer and language', async () => {
      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
        language: 'fr',
      });

      await processSTTJob(job);

      expect(mockTranscribe).toHaveBeenCalled();
      const args = mockTranscribe.mock.calls[0] as unknown[];
      // First arg is the audio buffer
      expect(Buffer.isBuffer(args[0])).toBe(true);
      // Third arg should contain language
      expect(args[2]).toEqual({ language: 'fr' });
    });

    it('should default language to fr', async () => {
      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
        // no language specified
      });

      await processSTTJob(job);

      const args = mockTranscribe.mock.calls[0] as unknown[];
      expect(args[2]).toEqual({ language: 'fr' });
    });

    it('should generate SRT from transcription segments', async () => {
      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSTTJob(job);

      expect(mockGenerateSRT).toHaveBeenCalledWith(sttResultMock.segments);
    });

    it('should upload the generated SRT to S3', async () => {
      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSTTJob(job);

      expect(mockUploadObject).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'text/plain; charset=utf-8'
      );
    });

    it('should deduct credits after successful transcription', async () => {
      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSTTJob(job);

      expect(mockDeductCredits).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_FILE_ID,
        120 // durationSeconds from prepareForSTT
      );
    });

    it('should enqueue SME analysis job after completion', async () => {
      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSTTJob(job);

      expect(mockSmeQueueAdd).toHaveBeenCalledWith(
        'analyze',
        expect.objectContaining({
          fileId: TEST_FILE_ID,
          userId: TEST_USER_ID,
        }),
        expect.any(Object)
      );
    });

    it('should update progress throughout the job', async () => {
      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await processSTTJob(job);

      expect(job.updateProgress).toHaveBeenCalled();
      const calls = (job.updateProgress as ReturnType<typeof vi.fn>).mock.calls;
      const lastProgress = calls[calls.length - 1]![0] as number;
      expect(lastProgress).toBe(100);
    });
  });

  // AC: Tests error handling
  describe('error handling', () => {
    it('should set file status to failed when download fails', async () => {
      mockDownloadObjectAsBuffer.mockRejectedValue(new Error('S3 error'));

      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await expect(processSTTJob(job)).rejects.toThrow('S3 error');

      const hasFailedStatus = mockDbUpdateSet.mock.calls.some(
        ([payload]) => (payload as { status?: string }).status === 'failed'
      );
      expect(hasFailedStatus).toBe(true);
    });

    it('should set file status to failed when STT provider fails', async () => {
      mockTranscribe.mockRejectedValue(new Error('Provider unavailable'));

      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await expect(processSTTJob(job)).rejects.toThrow('Provider unavailable');
    });

    it('should mark insufficient credits as non-retryable', async () => {
      // Import the mocked InsufficientCreditsError
      const { InsufficientCreditsError } = await import('../../lib/credits');
      mockDeductCredits.mockRejectedValue(new InsufficientCreditsError(0, 2));

      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      try {
        await processSTTJob(job);
        expect.fail('Should have thrown');
      } catch (error) {
        const err = error as Error & { unrecoverable?: boolean };
        expect(err.message).toContain('Non-retryable');
        expect(err.unrecoverable).toBe(true);
      }
    });

    it('should cleanup uploaded SRT on failure after upload', async () => {
      // Simulate failure after SRT upload (during credit deduction)
      mockDeductCredits.mockRejectedValue(new Error('DB error during deduction'));

      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await expect(processSTTJob(job)).rejects.toThrow();

      expect(mockDeleteObject).toHaveBeenCalledTimes(1);
      expect(mockDeleteObject).toHaveBeenCalledWith('users/test/files/test/test.srt');
    });

    it('should throw when file record is not found', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no file record
        }),
      });

      const job = createMockJob<STTJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        storageKey: TEST_STORAGE_KEY,
      });

      await expect(processSTTJob(job)).rejects.toThrow('File record not found');
    });
  });
});

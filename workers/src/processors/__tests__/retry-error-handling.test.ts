import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockJob,
  TEST_FILE_ID,
  TEST_USER_ID,
  TEST_STORAGE_KEY,
} from '../../__tests__/helpers';
import type { SMEJobData } from '../../queues';
import {
  InsufficientCreditsError,
  calculateMinutesToDeduct,
} from '../../lib/credits';

// ═══════════════════════════════════════════════════════════════════
// PART 1: Queue config tests (retry logic, backoff, concurrency)
// ═══════════════════════════════════════════════════════════════════

describe('queue configuration (retry logic)', () => {
  beforeEach(() => {
    vi.stubEnv('REDIS_URL', 'rediss://default:pass@localhost:6380');
  });

  it('should configure STT queue with 3 attempts and exponential backoff', async () => {
    const { queueConfigs, QUEUE_NAMES } = await import('../../config');
    const sttConfig = queueConfigs[QUEUE_NAMES.STT];

    expect(sttConfig?.attempts).toBe(3);
    expect(sttConfig?.backoff).toEqual({
      type: 'exponential',
      delay: 30_000,
    });
  });

  it('should configure SME queue with 2 attempts and fixed backoff', async () => {
    const { queueConfigs, QUEUE_NAMES } = await import('../../config');
    const smeConfig = queueConfigs[QUEUE_NAMES.SME];

    expect(smeConfig?.attempts).toBe(2);
    expect(smeConfig?.backoff).toEqual({
      type: 'fixed',
      delay: 5_000,
    });
  });

  it('should configure PDF queue with 3 attempts and exponential backoff', async () => {
    const { queueConfigs, QUEUE_NAMES } = await import('../../config');
    const pdfConfig = queueConfigs[QUEUE_NAMES.PDF];

    expect(pdfConfig?.attempts).toBe(3);
    expect(pdfConfig?.backoff).toEqual({
      type: 'exponential',
      delay: 10_000,
    });
  });

  it('should configure cleanup queue with 3 attempts', async () => {
    const { queueConfigs, QUEUE_NAMES } = await import('../../config');
    const cleanupConfig = queueConfigs[QUEUE_NAMES.CLEANUP];

    expect(cleanupConfig?.attempts).toBe(3);
  });

  it('should set appropriate concurrency limits', async () => {
    const { workerConfigs, QUEUE_NAMES } = await import('../../config');

    expect(workerConfigs[QUEUE_NAMES.STT].concurrency).toBe(2);
    expect(workerConfigs[QUEUE_NAMES.SME].concurrency).toBe(5);
    expect(workerConfigs[QUEUE_NAMES.PDF].concurrency).toBe(3);
    expect(workerConfigs[QUEUE_NAMES.CLEANUP].concurrency).toBe(1);
  });

  it('should set appropriate lock durations (timeouts)', async () => {
    const { workerConfigs, QUEUE_NAMES } = await import('../../config');

    expect(workerConfigs[QUEUE_NAMES.STT].lockDuration).toBe(15 * 60 * 1000);
    expect(workerConfigs[QUEUE_NAMES.SME].lockDuration).toBe(30 * 1000);
    expect(workerConfigs[QUEUE_NAMES.PDF].lockDuration).toBe(2 * 60 * 1000);
    expect(workerConfigs[QUEUE_NAMES.CLEANUP].lockDuration).toBe(5 * 60 * 1000);
  });

  it('should retain completed and failed jobs', async () => {
    const { queueConfigs, QUEUE_NAMES } = await import('../../config');

    for (const queueName of Object.values(QUEUE_NAMES)) {
      const config = queueConfigs[queueName];
      expect(config?.removeOnComplete).toBeDefined();
      expect(config?.removeOnFail).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// PART 2: Credits module (retry-related logic)
// ═══════════════════════════════════════════════════════════════════

describe('InsufficientCreditsError (non-retryable error)', () => {
  it('should have correct name and properties', () => {
    const error = new InsufficientCreditsError(5, 10);
    expect(error.name).toBe('InsufficientCreditsError');
    expect(error.available).toBe(5);
    expect(error.required).toBe(10);
    expect(error.message).toContain('Insufficient credits');
  });

  it('should be an instance of Error', () => {
    const error = new InsufficientCreditsError(0, 3);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('calculateMinutesToDeduct (credit rounding)', () => {
  it('should round up partial minutes', () => {
    expect(calculateMinutesToDeduct(30)).toBe(1);
    expect(calculateMinutesToDeduct(61)).toBe(2);
    expect(calculateMinutesToDeduct(330)).toBe(6); // 5m30s → 6 min
  });

  it('should not round exact minutes', () => {
    expect(calculateMinutesToDeduct(60)).toBe(1);
    expect(calculateMinutesToDeduct(120)).toBe(2);
    expect(calculateMinutesToDeduct(300)).toBe(5);
  });

  it('should return 0 for 0 seconds', () => {
    expect(calculateMinutesToDeduct(0)).toBe(0);
  });

  it('should handle 1 second as 1 minute', () => {
    expect(calculateMinutesToDeduct(1)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PART 3: Worker creation and event handlers
// ═══════════════════════════════════════════════════════════════════

// These tests need mocked bullmq and dependencies
const mockDownloadObject = vi.fn<[string], Promise<string>>();

vi.mock('../../lib/storage', () => ({
  downloadObject: (...args: unknown[]) => mockDownloadObject(args[0] as string),
  downloadObjectAsBuffer: vi.fn().mockResolvedValue(Buffer.from('fake')),
  uploadObject: vi.fn().mockResolvedValue(undefined),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url'),
}));

vi.mock('@sme-studio/db', () => ({
  getDb: () => ({
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ originalName: 'test.mp4' }]),
        orderBy: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  }),
  files: { id: 'id', originalName: 'originalName', progressPercent: 'progressPercent', updatedAt: 'updatedAt' },
  segments: { id: 'id', sequenceNum: 'sequenceNum', fileId: 'fileId' },
  alerts: { fileId: 'fileId', createdAt: 'createdAt' },
  users: { id: 'id', plan: 'plan' },
  eq: (col: unknown, val: unknown) => ({ col, val }),
  asc: (col: unknown) => ({ asc: col }),
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Queue: vi.fn(),
}));

vi.mock('../../lib/ffmpeg', () => ({
  prepareForSTT: vi.fn().mockResolvedValue({ audioBuffer: Buffer.from('audio'), durationSeconds: 60, wasVideo: true }),
  isVideoFile: vi.fn().mockReturnValue(true),
}));

vi.mock('../../lib/srt-generator', () => ({
  generateSRT: vi.fn().mockReturnValue('1\n00:00:01,000 --> 00:00:04,000\nTest\n'),
  generateSrtStorageKey: vi.fn().mockReturnValue('test.srt'),
}));

vi.mock('../../lib/credits', async () => {
  const actual = await vi.importActual('../../lib/credits');
  return {
    ...(actual as object),
    deductCredits: vi.fn().mockResolvedValue({ minutesDeducted: 1, creditsRemaining: 29 }),
  };
});

vi.mock('@sme-studio/stt', () => ({
  STTOrchestrator: vi.fn().mockImplementation(() => ({
    transcribe: vi.fn().mockResolvedValue({
      segments: [{ startMs: 0, endMs: 3000, text: 'Test', confidence: 0.9 }],
      durationMs: 60000,
      language: 'fr',
      provider: 'whisper-openai',
    }),
  })),
}));

vi.mock('@sme-studio/pdf-generator', () => ({
  generateProofDocument: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake')),
}));

vi.mock('@sme-studio/subtitle-parser', () => ({
  parseSubtitle: vi.fn().mockReturnValue({
    segments: [{ sequenceNum: 1, startMs: 0, endMs: 3000, text: 'Test' }],
    errors: [],
    format: 'srt',
  }),
  generateSRT: vi.fn().mockReturnValue('1\n00:00:01,000 --> 00:00:04,000\nTest\n'),
  generateVTT: vi.fn().mockReturnValue('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nTest\n'),
}));

vi.mock('../../queues', async () => {
  const actual = await vi.importActual('../../queues') as Record<string, unknown>;
  return {
    ...actual,
    getSMEQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  };
});

import { Worker } from 'bullmq';

describe('SME processor failure handling (DLQ behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should propagate errors to allow BullMQ retry mechanism', async () => {
    mockDownloadObject.mockRejectedValue(new Error('Transient network error'));

    const { createSMEWorker } = await import('../sme.processor');

    createSMEWorker();
    const WorkerMock = Worker as unknown as ReturnType<typeof vi.fn>;
    const calls = WorkerMock.mock.calls;
    const lastCall = calls[calls.length - 1] as unknown[];
    const processFn = lastCall[1] as (job: ReturnType<typeof createMockJob<SMEJobData>>) => Promise<unknown>;

    const job = createMockJob<SMEJobData>({
      fileId: TEST_FILE_ID,
      userId: TEST_USER_ID,
      storageKey: TEST_STORAGE_KEY,
    });

    await expect(processFn(job)).rejects.toThrow('Transient network error');
  });

  it('should register completed, failed, and progress event handlers on worker', async () => {
    const { createSMEWorker } = await import('../sme.processor');

    const worker = createSMEWorker();

    const onCalls = (worker.on as ReturnType<typeof vi.fn>).mock.calls as [string, unknown][];
    const eventNames = onCalls.map(([event]) => event);

    expect(eventNames).toContain('completed');
    expect(eventNames).toContain('failed');
    expect(eventNames).toContain('progress');
  });
});

describe('worker creation wires correct queue names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create SME worker on sme-analysis queue', async () => {
    const { createSMEWorker } = await import('../sme.processor');
    createSMEWorker();

    const WorkerMock = Worker as unknown as ReturnType<typeof vi.fn>;
    const calls = WorkerMock.mock.calls;
    const lastCall = calls[calls.length - 1] as [string, unknown, unknown];
    expect(lastCall[0]).toBe('sme-analysis');
  });

  it('should create STT worker on stt-transcription queue', async () => {
    const { createSTTWorker } = await import('../stt.processor');
    createSTTWorker();

    const WorkerMock = Worker as unknown as ReturnType<typeof vi.fn>;
    const calls = WorkerMock.mock.calls;
    const lastCall = calls[calls.length - 1] as [string, unknown, unknown];
    expect(lastCall[0]).toBe('stt-transcription');
  });

  it('should create PDF worker on pdf-generation queue', async () => {
    const { createPDFWorker } = await import('../pdf.processor');
    createPDFWorker();

    const WorkerMock = Worker as unknown as ReturnType<typeof vi.fn>;
    const calls = WorkerMock.mock.calls;
    const lastCall = calls[calls.length - 1] as [string, unknown, unknown];
    expect(lastCall[0]).toBe('pdf-generation');
  });
});

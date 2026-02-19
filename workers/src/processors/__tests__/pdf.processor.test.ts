import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PDFJobData } from '../../queues';
import {
  createMockJob,
  TEST_FILE_ID,
  TEST_USER_ID,
} from '../../__tests__/helpers';

// ── Mocks ────────────────────────────────────────────────────────────────

// Storage
const mockUploadObject = vi.fn<[string, string | Buffer, string], Promise<void>>();
const mockGetSignedUrl = vi.fn<[string, number], Promise<string>>();

vi.mock('../../lib/storage', () => ({
  uploadObject: (...args: unknown[]) => mockUploadObject(args[0] as string, args[1] as string | Buffer, args[2] as string),
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(args[0] as string, args[1] as number),
}));

// PDF generator
const mockGenerateProofDocument = vi.fn<[unknown], Promise<Buffer>>();

vi.mock('@sme-studio/pdf-generator', () => ({
  generateProofDocument: (...args: unknown[]) => mockGenerateProofDocument(args[0]),
}));

// Subtitle parser
const mockGenerateSRT = vi.fn().mockReturnValue('1\n00:00:01,000 --> 00:00:04,000\nTest\n');
const mockGenerateVTT = vi.fn().mockReturnValue('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nTest\n');

vi.mock('@sme-studio/subtitle-parser', () => ({
  generateSRT: (...args: unknown[]) => mockGenerateSRT(...args),
  generateVTT: (...args: unknown[]) => mockGenerateVTT(...args),
}));

// Archiver mock
vi.mock('archiver', () => ({
  default: vi.fn().mockImplementation(() => {
    return {
      on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'data') {
          // Push fake zip data
          setTimeout(() => handler(Buffer.from('PK-fake-zip')), 0);
        }
        if (event === 'end') {
          setTimeout(() => handler(), 10);
        }
      }),
      append: vi.fn(),
      finalize: vi.fn(),
    };
  }),
}));

// Database
const mockFileData = {
  id: TEST_FILE_ID,
  originalName: 'formation.srt',
  fileType: 'srt',
  durationSeconds: 600,
  smeScore: 85,
  smeAnalyzedAt: new Date('2024-01-15T10:30:00Z'),
  createdAt: new Date('2024-01-15T10:00:00Z'),
};

const mockAlertData = [
  {
    ruleCode: 'speed',
    severity: 'critical',
    message: 'Vitesse de lecture trop élevée (25 car/s).',
    details: { actual: 25, max: 20, unit: 'car/s' },
    resolved: false,
    segmentId: 'seg-1',
  },
  {
    ruleCode: 'length',
    severity: 'warning',
    message: 'Segment trop long : 90 caractères.',
    details: { charCount: 90, charMax: 84 },
    resolved: false,
    segmentId: 'seg-2',
  },
];

const mockSegmentData = [
  { sequenceNum: 1, startMs: 1000, endMs: 4000, text: 'Bonjour', speaker: null, isSoundInfo: false },
  { sequenceNum: 2, startMs: 4500, endMs: 8000, text: 'Bienvenue', speaker: null, isSoundInfo: false },
];

// Build a chainable mock for db.select().from().where().orderBy().limit()
function createSelectChain(data: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(data),
        orderBy: vi.fn().mockResolvedValue(data),
      }),
      orderBy: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(data),
      }),
    }),
  };
}

let selectCallIndex = 0;
const selectResponses: unknown[][] = [];

const mockDbSelect = vi.fn().mockImplementation(() => {
  const idx = selectCallIndex++;
  const data = selectResponses[idx] ?? [];
  return createSelectChain(data);
});

vi.mock('@sme-studio/db', () => ({
  getDb: () => ({
    select: mockDbSelect,
  }),
  files: { id: 'id' },
  alerts: { fileId: 'fileId', createdAt: 'createdAt' },
  users: { id: 'id', plan: 'plan' },
  segments: { id: 'id', fileId: 'fileId', sequenceNum: 'sequenceNum' },
  eq: (col: unknown, val: unknown) => ({ col, val }),
  asc: (col: unknown) => ({ asc: col }),
}));

// BullMQ
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Queue: vi.fn(),
}));

import { createPDFWorker } from '../pdf.processor';
import { Worker } from 'bullmq';

function getProcessorFn() {
  createPDFWorker();
  const WorkerMock = Worker as unknown as ReturnType<typeof vi.fn>;
  const calls = WorkerMock.mock.calls;
  const lastCall = calls[calls.length - 1] as unknown[];
  return lastCall[1] as (job: ReturnType<typeof createMockJob<PDFJobData>>) => Promise<{
    storageKey: string;
    signedUrl: string;
    zipStorageKey?: string;
    zipSignedUrl?: string;
  }>;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('pdf.processor', () => {
  let processPDFJob: ReturnType<typeof getProcessorFn>;

  beforeEach(() => {
    vi.clearAllMocks();
    selectCallIndex = 0;
    selectResponses.length = 0;

    // Default DB responses in order:
    // 1. file data
    // 2. user plan
    // 3. segment count
    // 4. alerts
    selectResponses.push(
      [mockFileData],          // file
      [{ plan: 'pro' }],      // user
      mockSegmentData,         // segment count (length used)
      mockAlertData,           // alerts
    );

    // PDF generation returns a valid buffer
    mockGenerateProofDocument.mockResolvedValue(Buffer.from('%PDF-1.4 fake content'));
    mockUploadObject.mockResolvedValue(undefined);
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/signed-url');

    processPDFJob = getProcessorFn();
  });

  // AC: Tests pdf.processor
  describe('successful PDF generation', () => {
    it('should generate a PDF and return storageKey + signedUrl', async () => {
      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
      });

      const result = await processPDFJob(job);

      expect(result.storageKey).toContain('pdfs/');
      expect(result.storageKey).toContain(TEST_USER_ID);
      expect(result.signedUrl).toBe('https://s3.example.com/signed-url');
    });

    it('should call generateProofDocument with correct data structure', async () => {
      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
      });

      await processPDFJob(job);

      expect(mockGenerateProofDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          file: expect.objectContaining({
            id: TEST_FILE_ID,
            originalName: 'formation.srt',
          }),
          score: 85,
          breakdown: expect.objectContaining({
            totalAlerts: expect.any(Number),
            bySeverity: expect.any(Object),
            byRule: expect.any(Object),
          }),
          alerts: expect.any(Array),
          userPlan: 'pro',
        })
      );
    });

    it('should upload PDF to S3 with correct content type', async () => {
      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
      });

      await processPDFJob(job);

      expect(mockUploadObject).toHaveBeenCalledWith(
        expect.stringContaining('.pdf'),
        expect.any(Buffer),
        'application/pdf'
      );
    });

    it('should generate signed URL with 24h expiration', async () => {
      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
      });

      await processPDFJob(job);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(String),
        24 * 60 * 60
      );
    });

    it('should update progress to 100 at completion', async () => {
      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
      });

      await processPDFJob(job);

      const calls = (job.updateProgress as ReturnType<typeof vi.fn>).mock.calls;
      const lastProgress = calls[calls.length - 1]![0] as number;
      expect(lastProgress).toBe(100);
    });

    it('should default to free plan when user has no plan', async () => {
      selectResponses.length = 0;
      selectCallIndex = 0;
      selectResponses.push(
        [mockFileData],
        [{ plan: null }],     // user with no plan
        mockSegmentData,
        mockAlertData,
      );

      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
      });

      await processPDFJob(job);

      expect(mockGenerateProofDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          userPlan: 'free',
        })
      );
    });
  });

  describe('ZIP export with subtitles', () => {
    it('should create ZIP when subtitleFormat is srt', async () => {
      // Add segment fetch response for ZIP creation
      selectResponses.push(mockSegmentData);

      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        subtitleFormat: 'srt',
      });

      const result = await processPDFJob(job);

      // Should have zip results
      expect(result.zipStorageKey).toBeDefined();
      expect(result.zipSignedUrl).toBeDefined();
      expect(mockGenerateSRT).toHaveBeenCalled();
    });

    it('should use VTT format when subtitleFormat is vtt', async () => {
      selectResponses.push(mockSegmentData);

      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        subtitleFormat: 'vtt',
      });

      const result = await processPDFJob(job);

      expect(result.zipStorageKey).toBeDefined();
      expect(mockGenerateVTT).toHaveBeenCalled();
    });

    it('should not create ZIP when subtitleFormat is not specified', async () => {
      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
        // no subtitleFormat
      });

      const result = await processPDFJob(job);

      expect(result.zipStorageKey).toBeUndefined();
      expect(result.zipSignedUrl).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should throw when file is not found', async () => {
      selectResponses.length = 0;
      selectCallIndex = 0;
      selectResponses.push(
        [],  // file not found
      );

      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
      });

      await expect(processPDFJob(job)).rejects.toThrow('File not found');
    });

    it('should throw when PDF generation fails', async () => {
      mockGenerateProofDocument.mockRejectedValue(new Error('PDF render error'));

      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
      });

      await expect(processPDFJob(job)).rejects.toThrow('PDF render error');
    });

    it('should throw when S3 upload fails', async () => {
      mockUploadObject.mockRejectedValue(new Error('S3 upload failed'));

      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
      });

      await expect(processPDFJob(job)).rejects.toThrow('S3 upload failed');
    });
  });

  describe('breakdown calculation', () => {
    it('should calculate correct breakdown from alerts', async () => {
      const job = createMockJob<PDFJobData>({
        fileId: TEST_FILE_ID,
        userId: TEST_USER_ID,
      });

      await processPDFJob(job);

      const docData = mockGenerateProofDocument.mock.calls[0]![0] as {
        breakdown: { totalAlerts: number; bySeverity: { critical: number; warning: number } };
      };
      expect(docData.breakdown.totalAlerts).toBe(2);
      expect(docData.breakdown.bySeverity.critical).toBe(1);
      expect(docData.breakdown.bySeverity.warning).toBe(1);
    });
  });
});

/**
 * STT Orchestrator Tests
 *
 * Tests for the STT orchestrator with fallback logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  STTOrchestrator,
  STTOrchestratorConfig,
  TranscriptionLogEntry,
  STTMetrics,
} from '../orchestrator';
import { STTProvider, STTResult, STTOptions, STTProgress, STTError } from '../types';

/**
 * Helper to safely get provider metrics
 */
function getProviderMetrics(metrics: STTMetrics, provider: string) {
  const providerMetrics = metrics.byProvider[provider];
  if (!providerMetrics) {
    throw new Error(`Provider ${provider} not found in metrics`);
  }
  return providerMetrics;
}

/**
 * Mock STT Provider for testing
 */
class MockProvider implements STTProvider {
  readonly name: string;
  readonly maxFileSizeMB = 100;
  readonly maxDurationMinutes = 60;

  private shouldFail = false;
  private failError?: STTError;
  private result?: STTResult;

  constructor(name: string) {
    this.name = name;
  }

  supportsLanguage(_lang: string): boolean {
    return true;
  }

  supportsDiarization(): boolean {
    return false;
  }

  estimateCost(durationSeconds: number): number {
    return durationSeconds * 0.0001;
  }

  async transcribe(
    _fileBuffer: Buffer,
    _filename: string,
    _options: STTOptions,
    onProgress?: (progress: STTProgress) => void
  ): Promise<STTResult> {
    onProgress?.({ percent: 50, stage: 'transcribing' });

    if (this.shouldFail && this.failError) {
      throw this.failError;
    }

    return (
      this.result ?? {
        segments: [
          { startMs: 0, endMs: 1000, text: 'Test segment', confidence: 0.95 },
        ],
        durationMs: 1000,
        language: 'fr',
        provider: this.name,
      }
    );
  }

  async healthCheck(): Promise<boolean> {
    return !this.shouldFail;
  }

  // Test helpers
  setFailure(error: STTError): void {
    this.shouldFail = true;
    this.failError = error;
  }

  setSuccess(result?: STTResult): void {
    this.shouldFail = false;
    this.failError = undefined;
    this.result = result;
  }

  reset(): void {
    this.shouldFail = false;
    this.failError = undefined;
    this.result = undefined;
  }
}

/**
 * Create a mock orchestrator with injected providers
 */
function createMockOrchestrator(
  providers: STTProvider[],
  config?: Partial<STTOrchestratorConfig>
) {
  return new STTOrchestrator({
    ...config,
    providerInstances: providers,
    logger: config?.logger ?? {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  });
}

describe('STTOrchestrator', () => {
  let whisperProvider: MockProvider;
  let deepgramProvider: MockProvider;
  let orchestrator: STTOrchestrator;
  let logEntries: TranscriptionLogEntry[];
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Reset mocks
    whisperProvider = new MockProvider('whisper');
    deepgramProvider = new MockProvider('deepgram');
    logEntries = [];
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    orchestrator = createMockOrchestrator([whisperProvider, deepgramProvider], {
      logger: mockLogger,
      onLogEntry: (entry) => logEntries.push(entry),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful transcription', () => {
    it('should use primary provider (Whisper) when available', async () => {
      const result = await orchestrator.transcribe(
        Buffer.from('test'),
        'test.mp4',
        { language: 'fr' }
      );

      expect(result.provider).toBe('whisper');
      expect(result.segments).toHaveLength(1);

      const metrics = orchestrator.getMetrics();
      expect(getProviderMetrics(metrics, 'whisper').successCount).toBe(1);
      expect(getProviderMetrics(metrics, 'deepgram').successCount).toBe(0);
      expect(metrics.fallbackCount).toBe(0);
    });

    it('should log successful transcription', async () => {
      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0]?.success).toBe(true);
      expect(logEntries[0]?.provider).toBe('whisper');
    });
  });

  describe('Fallback on retryable errors', () => {
    it('should fallback to Deepgram when Whisper fails with retryable error', async () => {
      // Simulate Whisper being down (SERVICE_UNAVAILABLE is retryable)
      whisperProvider.setFailure(
        new STTError('Whisper service unavailable', 'SERVICE_UNAVAILABLE', {
          provider: 'whisper',
          retryable: true,
        })
      );

      const result = await orchestrator.transcribe(
        Buffer.from('test'),
        'test.mp4',
        { language: 'fr' }
      );

      // Should have used Deepgram as fallback
      expect(result.provider).toBe('deepgram');

      const metrics = orchestrator.getMetrics();
      expect(getProviderMetrics(metrics, 'whisper').failureCount).toBe(1);
      expect(getProviderMetrics(metrics, 'deepgram').successCount).toBe(1);
      expect(metrics.fallbackCount).toBe(1);
    });

    it('should fallback on RATE_LIMIT error', async () => {
      whisperProvider.setFailure(
        new STTError('Rate limit exceeded', 'RATE_LIMIT', {
          provider: 'whisper',
          retryable: true,
        })
      );

      const result = await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(result.provider).toBe('deepgram');
      expect(orchestrator.getMetrics().fallbackCount).toBe(1);
    });

    it('should fallback on TIMEOUT error', async () => {
      whisperProvider.setFailure(
        new STTError('Request timeout', 'TIMEOUT', {
          provider: 'whisper',
          retryable: true,
        })
      );

      const result = await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(result.provider).toBe('deepgram');
    });

    it('should fallback on NETWORK_ERROR', async () => {
      whisperProvider.setFailure(
        new STTError('Network error', 'NETWORK_ERROR', {
          provider: 'whisper',
          retryable: true,
        })
      );

      const result = await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(result.provider).toBe('deepgram');
    });

    it('should log both failed and successful attempts', async () => {
      whisperProvider.setFailure(
        new STTError('Service unavailable', 'SERVICE_UNAVAILABLE', {
          provider: 'whisper',
          retryable: true,
        })
      );

      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(logEntries).toHaveLength(2);
      expect(logEntries[0]?.provider).toBe('whisper');
      expect(logEntries[0]?.success).toBe(false);
      expect(logEntries[0]?.error?.retryable).toBe(true);
      expect(logEntries[1]?.provider).toBe('deepgram');
      expect(logEntries[1]?.success).toBe(true);
    });
  });

  describe('Stop on permanent errors', () => {
    it('should NOT fallback on INVALID_FILE error', async () => {
      whisperProvider.setFailure(
        new STTError('Invalid file format', 'INVALID_FILE', {
          provider: 'whisper',
          retryable: false,
        })
      );

      await expect(
        orchestrator.transcribe(Buffer.from('test'), 'test.mp4')
      ).rejects.toThrow('Invalid file format');

      const metrics = orchestrator.getMetrics();
      expect(metrics.fallbackCount).toBe(0);
      expect(getProviderMetrics(metrics, 'deepgram').successCount).toBe(0);
    });

    it('should NOT fallback on QUOTA_EXCEEDED error', async () => {
      whisperProvider.setFailure(
        new STTError('Quota exceeded', 'QUOTA_EXCEEDED', {
          provider: 'whisper',
          retryable: false,
        })
      );

      await expect(
        orchestrator.transcribe(Buffer.from('test'), 'test.mp4')
      ).rejects.toThrow('Quota exceeded');

      expect(orchestrator.getMetrics().fallbackCount).toBe(0);
    });

    it('should NOT fallback on FILE_TOO_LARGE error', async () => {
      whisperProvider.setFailure(
        new STTError('File too large', 'FILE_TOO_LARGE', {
          provider: 'whisper',
          retryable: false,
        })
      );

      await expect(
        orchestrator.transcribe(Buffer.from('test'), 'test.mp4')
      ).rejects.toThrow('File too large');
    });

    it('should NOT fallback on PROVIDER_REJECTED error', async () => {
      whisperProvider.setFailure(
        new STTError('Provider rejected request', 'PROVIDER_REJECTED', {
          provider: 'whisper',
          retryable: false,
        })
      );

      await expect(
        orchestrator.transcribe(Buffer.from('test'), 'test.mp4')
      ).rejects.toThrow('Provider rejected');
    });

    it('should log permanent error correctly', async () => {
      whisperProvider.setFailure(
        new STTError('Invalid file', 'INVALID_FILE', {
          provider: 'whisper',
          retryable: false,
        })
      );

      try {
        await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'stt.transcription.permanent_failure',
        expect.objectContaining({
          provider: 'whisper',
          errorCode: 'INVALID_FILE',
        })
      );
    });
  });

  describe('All providers fail', () => {
    it('should throw when all providers fail with retryable errors', async () => {
      whisperProvider.setFailure(
        new STTError('Whisper down', 'SERVICE_UNAVAILABLE', {
          provider: 'whisper',
          retryable: true,
        })
      );
      deepgramProvider.setFailure(
        new STTError('Deepgram down', 'SERVICE_UNAVAILABLE', {
          provider: 'deepgram',
          retryable: true,
        })
      );

      await expect(
        orchestrator.transcribe(Buffer.from('test'), 'test.mp4')
      ).rejects.toThrow(/All STT providers failed/);

      const metrics = orchestrator.getMetrics();
      expect(metrics.totalFailures).toBe(1);
      expect(getProviderMetrics(metrics, 'whisper').failureCount).toBe(1);
      expect(getProviderMetrics(metrics, 'deepgram').failureCount).toBe(1);
    });

    it('should include all error details in final error', async () => {
      whisperProvider.setFailure(
        new STTError('Whisper timeout', 'TIMEOUT', {
          provider: 'whisper',
          retryable: true,
        })
      );
      deepgramProvider.setFailure(
        new STTError('Deepgram rate limited', 'RATE_LIMIT', {
          provider: 'deepgram',
          retryable: true,
        })
      );

      try {
        await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(STTError);
        const sttError = error as STTError;
        expect(sttError.message).toContain('whisper: TIMEOUT');
        expect(sttError.message).toContain('deepgram: RATE_LIMIT');
      }
    });
  });

  describe('Metrics tracking', () => {
    it('should track success count per provider', async () => {
      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');
      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      const metrics = orchestrator.getMetrics();
      expect(getProviderMetrics(metrics, 'whisper').successCount).toBe(2);
      expect(metrics.totalSuccesses).toBe(2);
    });

    it('should track failure count per provider', async () => {
      whisperProvider.setFailure(
        new STTError('Error', 'SERVICE_UNAVAILABLE', { retryable: true })
      );

      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      const metrics = orchestrator.getMetrics();
      expect(getProviderMetrics(metrics, 'whisper').failureCount).toBe(1);
      expect(getProviderMetrics(metrics, 'deepgram').successCount).toBe(1);
    });

    it('should track total attempts', async () => {
      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');
      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(orchestrator.getMetrics().totalAttempts).toBe(2);
    });

    it('should track fallback count', async () => {
      whisperProvider.setFailure(
        new STTError('Error', 'TIMEOUT', { retryable: true })
      );

      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');
      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(orchestrator.getMetrics().fallbackCount).toBe(2);
    });

    it('should reset metrics correctly', async () => {
      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');
      orchestrator.resetMetrics();

      const metrics = orchestrator.getMetrics();
      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.totalSuccesses).toBe(0);
      expect(getProviderMetrics(metrics, 'whisper').successCount).toBe(0);
    });

    it('should call onMetricsUpdate callback', async () => {
      const onMetricsUpdate = vi.fn();
      const orchestratorWithCallback = createMockOrchestrator(
        [whisperProvider, deepgramProvider],
        { onMetricsUpdate }
      );

      await orchestratorWithCallback.transcribe(Buffer.from('test'), 'test.mp4');

      expect(onMetricsUpdate).toHaveBeenCalled();
    });
  });

  describe('Logging', () => {
    it('should log transcription start', async () => {
      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4', {
        language: 'fr',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'stt.transcription.started',
        expect.objectContaining({
          filename: 'test.mp4',
          language: 'fr',
        })
      );
    });

    it('should log provider attempts', async () => {
      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'stt.provider.attempt',
        expect.objectContaining({
          provider: 'whisper',
          attempt: 1,
        })
      );
    });

    it('should log transcription completion', async () => {
      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'stt.transcription.completed',
        expect.objectContaining({
          provider: 'whisper',
          usedFallback: false,
        })
      );
    });

    it('should log fallback attempts', async () => {
      whisperProvider.setFailure(
        new STTError('Error', 'TIMEOUT', { retryable: true })
      );

      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'stt.fallback.attempting',
        expect.objectContaining({
          provider: 'deepgram',
          attempt: 2,
        })
      );
    });

    it('should warn on provider failure', async () => {
      whisperProvider.setFailure(
        new STTError('Timeout', 'TIMEOUT', { retryable: true })
      );

      await orchestrator.transcribe(Buffer.from('test'), 'test.mp4');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'stt.provider.failed',
        expect.objectContaining({
          provider: 'whisper',
          errorCode: 'TIMEOUT',
          retryable: true,
          willRetry: true,
        })
      );
    });
  });

  describe('Health check', () => {
    it('should check health of all providers', async () => {
      const health = await orchestrator.healthCheck();

      expect(health['whisper']).toBe(true);
      expect(health['deepgram']).toBe(true);
    });

    it('should report unhealthy provider', async () => {
      whisperProvider.setFailure(
        new STTError('Down', 'SERVICE_UNAVAILABLE', { retryable: true })
      );

      const health = await orchestrator.healthCheck();

      expect(health['whisper']).toBe(false);
      expect(health['deepgram']).toBe(true);
    });
  });

  describe('Cost estimation', () => {
    it('should estimate cost for all providers', () => {
      const costs = orchestrator.estimateCost(60); // 60 seconds

      expect(costs['whisper']).toBeDefined();
      expect(costs['deepgram']).toBeDefined();
    });
  });

  describe('DoD: Whisper down → fallback Deepgram works', () => {
    it('should successfully transcribe when Whisper is simulated down', async () => {
      // Simulate Whisper being completely down
      whisperProvider.setFailure(
        new STTError(
          'OpenAI Whisper API is experiencing an outage',
          'SERVICE_UNAVAILABLE',
          { provider: 'whisper', retryable: true }
        )
      );

      // Set up Deepgram with a specific result
      const deepgramResult: STTResult = {
        segments: [
          { startMs: 0, endMs: 2000, text: 'Bonjour et bienvenue', confidence: 0.92 },
          { startMs: 2000, endMs: 4000, text: 'dans ce module de formation', confidence: 0.88 },
        ],
        durationMs: 4000,
        language: 'fr',
        provider: 'deepgram',
      };
      deepgramProvider.setSuccess(deepgramResult);

      // Execute transcription
      const result = await orchestrator.transcribe(
        Buffer.from('fake-audio-data'),
        'formation.mp4',
        { language: 'fr' }
      );

      // Verify fallback worked
      expect(result.provider).toBe('deepgram');
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]?.text).toBe('Bonjour et bienvenue');

      // Verify metrics
      const metrics = orchestrator.getMetrics();
      expect(getProviderMetrics(metrics, 'whisper').failureCount).toBe(1);
      expect(getProviderMetrics(metrics, 'deepgram').successCount).toBe(1);
      expect(metrics.fallbackCount).toBe(1);
      expect(metrics.totalSuccesses).toBe(1);

      // Verify logging
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'stt.provider.failed',
        expect.objectContaining({ provider: 'whisper' })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'stt.fallback.attempting',
        expect.objectContaining({ provider: 'deepgram' })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'stt.transcription.completed',
        expect.objectContaining({ provider: 'deepgram', usedFallback: true })
      );
    });
  });
});

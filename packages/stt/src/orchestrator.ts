/**
 * STT Orchestrator
 * Orchestrates STT providers with fallback logic
 *
 * Features:
 * - Tries Whisper first (primary provider)
 * - Falls back to Deepgram on retryable errors
 * - Detailed logging of all attempts
 * - Metrics tracking per provider
 */

import {
  STTProvider,
  STTOptions,
  STTResult,
  STTProgress,
  STTError,
} from './types';
import { WhisperProvider, WhisperProviderConfig } from './providers/whisper';
import { DeepgramProvider, DeepgramProviderConfig } from './providers/deepgram';

/**
 * Metrics for a single provider
 */
export interface ProviderMetrics {
  /** Total number of successful transcriptions */
  successCount: number;
  /** Total number of failed transcriptions */
  failureCount: number;
  /** Total processing time in milliseconds */
  totalProcessingTimeMs: number;
  /** Last error message if any */
  lastError?: string;
  /** Timestamp of last successful transcription */
  lastSuccessAt?: Date;
  /** Timestamp of last failure */
  lastFailureAt?: Date;
}

/**
 * Aggregated metrics for all providers
 */
export interface STTMetrics {
  /** Metrics per provider name */
  byProvider: Record<string, ProviderMetrics>;
  /** Total transcriptions attempted */
  totalAttempts: number;
  /** Total successful transcriptions (across all providers) */
  totalSuccesses: number;
  /** Total failures after all retries exhausted */
  totalFailures: number;
  /** Number of times fallback was used */
  fallbackCount: number;
}

/**
 * Log entry for a transcription attempt
 */
export interface TranscriptionLogEntry {
  timestamp: Date;
  provider: string;
  success: boolean;
  durationMs: number;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  fileInfo?: {
    filename: string;
    sizeBytes: number;
  };
}

/**
 * Logger interface for structured logging
 */
export interface STTLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Default console logger implementation
 */
const defaultLogger: STTLogger = {
  info(message: string, context?: Record<string, unknown>): void {
    console.log(`[STT INFO] ${message}`, context ? JSON.stringify(context) : '');
  },
  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(`[STT WARN] ${message}`, context ? JSON.stringify(context) : '');
  },
  error(message: string, context?: Record<string, unknown>): void {
    console.error(`[STT ERROR] ${message}`, context ? JSON.stringify(context) : '');
  },
};

/**
 * Configuration for the STT Orchestrator
 */
export interface STTOrchestratorConfig {
  /** Provider configurations */
  providers?: {
    whisper?: WhisperProviderConfig;
    deepgram?: DeepgramProviderConfig;
  };
  /** Pre-built provider instances (for testing or custom providers) */
  providerInstances?: STTProvider[];
  /** Custom provider order (defaults to ['whisper', 'deepgram']) */
  providerOrder?: ('whisper' | 'deepgram')[];
  /** Custom logger for structured logging */
  logger?: STTLogger;
  /** Callback for metrics updates */
  onMetricsUpdate?: (metrics: STTMetrics) => void;
  /** Callback for each transcription log entry */
  onLogEntry?: (entry: TranscriptionLogEntry) => void;
}

/**
 * STT Orchestrator
 *
 * Manages multiple STT providers with automatic fallback on failures.
 * Tracks metrics and provides detailed logging for monitoring.
 */
export class STTOrchestrator {
  private readonly providers: Map<string, STTProvider> = new Map();
  private readonly providerOrder: string[];
  private readonly logger: STTLogger;
  private readonly onMetricsUpdate?: (metrics: STTMetrics) => void;
  private readonly onLogEntry?: (entry: TranscriptionLogEntry) => void;

  private metrics: STTMetrics = {
    byProvider: {},
    totalAttempts: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    fallbackCount: 0,
  };

  constructor(config?: STTOrchestratorConfig) {
    this.logger = config?.logger ?? defaultLogger;
    this.onMetricsUpdate = config?.onMetricsUpdate;
    this.onLogEntry = config?.onLogEntry;

    // If provider instances are provided, use them directly (for testing)
    if (config?.providerInstances && config.providerInstances.length > 0) {
      this.providerOrder = config.providerInstances.map((p) => p.name);
      for (const provider of config.providerInstances) {
        this.providers.set(provider.name, provider);
        this.metrics.byProvider[provider.name] = {
          successCount: 0,
          failureCount: 0,
          totalProcessingTimeMs: 0,
        };
        this.logger.info('stt.provider.initialized', { provider: provider.name });
      }
    } else {
      // Initialize providers based on order
      const order = config?.providerOrder ?? ['whisper', 'deepgram'];
      this.providerOrder = order;

      // Initialize each provider in the order
      for (const providerName of order) {
        try {
          const provider = this.createProvider(providerName, config?.providers);
          if (provider) {
            this.providers.set(providerName, provider);
            this.metrics.byProvider[providerName] = {
              successCount: 0,
              failureCount: 0,
              totalProcessingTimeMs: 0,
            };
            this.logger.info('stt.provider.initialized', { provider: providerName });
          }
        } catch (error) {
          this.logger.warn('stt.provider.init_failed', {
            provider: providerName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (this.providers.size === 0) {
      throw new Error('No STT providers could be initialized. Check API keys configuration.');
    }

    this.logger.info('stt.orchestrator.ready', {
      providers: Array.from(this.providers.keys()),
      order: this.providerOrder,
    });
  }

  /**
   * Create a provider instance by name
   */
  private createProvider(
    name: string,
    configs?: STTOrchestratorConfig['providers']
  ): STTProvider | null {
    switch (name) {
      case 'whisper':
        return new WhisperProvider(configs?.whisper);
      case 'deepgram':
        return new DeepgramProvider(configs?.deepgram);
      default:
        this.logger.warn('stt.provider.unknown', { provider: name });
        return null;
    }
  }

  /**
   * Transcribe audio/video file with automatic fallback
   *
   * @param fileBuffer - The file content as a Buffer
   * @param filename - Original filename for format detection
   * @param options - Transcription options
   * @param onProgress - Progress callback
   * @returns Transcription result
   * @throws STTError if all providers fail
   */
  async transcribe(
    fileBuffer: Buffer,
    filename: string,
    options: STTOptions = {},
    onProgress?: (progress: STTProgress) => void
  ): Promise<STTResult> {
    this.metrics.totalAttempts++;

    const errors: Array<{ provider: string; error: STTError }> = [];
    const fileInfo = { filename, sizeBytes: fileBuffer.length };

    this.logger.info('stt.transcription.started', {
      filename,
      fileSizeBytes: fileBuffer.length,
      language: options.language,
      providers: this.providerOrder,
    });

    // Try each provider in order
    for (let i = 0; i < this.providerOrder.length; i++) {
      const providerName = this.providerOrder[i];
      if (!providerName) {
        continue;
      }

      const provider = this.providers.get(providerName);
      if (!provider) {
        continue;
      }

      // Check language support
      if (options.language && !provider.supportsLanguage(options.language)) {
        this.logger.info('stt.provider.language_unsupported', {
          provider: providerName,
          language: options.language,
        });
        continue;
      }

      const isRetry = i > 0;
      if (isRetry) {
        this.metrics.fallbackCount++;
        this.logger.info('stt.fallback.attempting', {
          provider: providerName,
          attempt: i + 1,
          previousErrors: errors.map((e) => ({
            provider: e.provider,
            code: e.error.code,
          })),
        });
      }

      const startTime = Date.now();

      try {
        this.logger.info('stt.provider.attempt', {
          provider: providerName,
          attempt: i + 1,
          isRetry,
        });

        const result = await provider.transcribe(
          fileBuffer,
          filename,
          options,
          onProgress
        );

        const durationMs = Date.now() - startTime;

        // Update metrics on success
        this.recordSuccess(providerName, durationMs);

        // Log the successful attempt
        this.logEntry({
          timestamp: new Date(),
          provider: providerName,
          success: true,
          durationMs,
          fileInfo,
        });

        this.logger.info('stt.transcription.completed', {
          provider: providerName,
          durationMs,
          segmentCount: result.segments.length,
          totalDurationMs: result.durationMs,
          usedFallback: isRetry,
        });

        return result;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const sttError = this.toSTTError(error, providerName);

        // Record the failure
        this.recordFailure(providerName, sttError.message);

        // Log the failed attempt
        this.logEntry({
          timestamp: new Date(),
          provider: providerName,
          success: false,
          durationMs,
          error: {
            code: sttError.code,
            message: sttError.message,
            retryable: sttError.retryable,
          },
          fileInfo,
        });

        errors.push({ provider: providerName, error: sttError });

        this.logger.warn('stt.provider.failed', {
          provider: providerName,
          errorCode: sttError.code,
          errorMessage: sttError.message,
          retryable: sttError.retryable,
          durationMs,
          willRetry: sttError.retryable && i < this.providerOrder.length - 1,
        });

        // If error is not retryable, don't try other providers
        if (!sttError.retryable) {
          this.logger.error('stt.transcription.permanent_failure', {
            provider: providerName,
            errorCode: sttError.code,
            errorMessage: sttError.message,
          });
          this.metrics.totalFailures++;
          throw sttError;
        }

        // Continue to next provider
      }
    }

    // All providers failed
    this.metrics.totalFailures++;

    const errorSummary = errors.map((e) => `${e.provider}: ${e.error.code}`).join(', ');

    this.logger.error('stt.transcription.all_providers_failed', {
      errors: errors.map((e) => ({
        provider: e.provider,
        code: e.error.code,
        message: e.error.message,
      })),
      totalAttempts: errors.length,
    });

    throw new STTError(
      `All STT providers failed: ${errorSummary}`,
      'SERVICE_UNAVAILABLE',
      {
        retryable: true,
        details: {
          providers: errors.map((e) => e.provider),
          errors: errors.map((e) => ({
            provider: e.provider,
            code: e.error.code,
            message: e.error.message,
          })),
        },
      }
    );
  }

  /**
   * Convert any error to STTError
   */
  private toSTTError(error: unknown, provider: string): STTError {
    if (error instanceof STTError) {
      return error;
    }

    if (error instanceof Error) {
      return new STTError(error.message, 'UNKNOWN', {
        provider,
        retryable: false,
        cause: error,
      });
    }

    return new STTError(String(error), 'UNKNOWN', {
      provider,
      retryable: false,
    });
  }

  /**
   * Record a successful transcription
   */
  private recordSuccess(provider: string, durationMs: number): void {
    const providerMetrics = this.metrics.byProvider[provider];
    if (providerMetrics) {
      providerMetrics.successCount++;
      providerMetrics.totalProcessingTimeMs += durationMs;
      providerMetrics.lastSuccessAt = new Date();
    }
    this.metrics.totalSuccesses++;
    this.notifyMetricsUpdate();
  }

  /**
   * Record a failed transcription
   */
  private recordFailure(provider: string, errorMessage: string): void {
    const providerMetrics = this.metrics.byProvider[provider];
    if (providerMetrics) {
      providerMetrics.failureCount++;
      providerMetrics.lastError = errorMessage;
      providerMetrics.lastFailureAt = new Date();
    }
    this.notifyMetricsUpdate();
  }

  /**
   * Log a transcription entry
   */
  private logEntry(entry: TranscriptionLogEntry): void {
    this.onLogEntry?.(entry);
  }

  /**
   * Notify metrics update callback
   */
  private notifyMetricsUpdate(): void {
    this.onMetricsUpdate?.(this.getMetrics());
  }

  /**
   * Get current metrics (immutable copy)
   */
  getMetrics(): STTMetrics {
    return {
      byProvider: { ...this.metrics.byProvider },
      totalAttempts: this.metrics.totalAttempts,
      totalSuccesses: this.metrics.totalSuccesses,
      totalFailures: this.metrics.totalFailures,
      fallbackCount: this.metrics.fallbackCount,
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    for (const provider of Object.keys(this.metrics.byProvider)) {
      this.metrics.byProvider[provider] = {
        successCount: 0,
        failureCount: 0,
        totalProcessingTimeMs: 0,
      };
    }
    this.metrics.totalAttempts = 0;
    this.metrics.totalSuccesses = 0;
    this.metrics.totalFailures = 0;
    this.metrics.fallbackCount = 0;
    this.notifyMetricsUpdate();
  }

  /**
   * Get list of available providers
   */
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check health of all providers
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    const checks = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          const healthy = await provider.healthCheck();
          results[name] = healthy;
          this.logger.info('stt.health.check', { provider: name, healthy });
        } catch (error) {
          results[name] = false;
          this.logger.warn('stt.health.check_failed', {
            provider: name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    await Promise.all(checks);

    return results;
  }

  /**
   * Estimate cost for transcription
   */
  estimateCost(durationSeconds: number): Record<string, number> {
    const costs: Record<string, number> = {};

    for (const [name, provider] of this.providers.entries()) {
      costs[name] = provider.estimateCost(durationSeconds);
    }

    return costs;
  }
}

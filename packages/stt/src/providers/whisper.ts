/**
 * OpenAI Whisper STT Provider
 * Implements STTProvider interface for OpenAI's Whisper API
 */

import OpenAI from 'openai';
import { Uploadable } from 'openai/uploads';
import {
  STTProvider,
  STTOptions,
  STTResult,
  STTProgress,
  STTSegment,
  STTError,
  STTErrorCode,
} from '../types';

/**
 * Whisper API verbose_json response segment
 */
interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

/**
 * Whisper API verbose_json response
 */
interface WhisperVerboseResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
}

/**
 * Languages supported by Whisper
 */
const SUPPORTED_LANGUAGES = [
  'af', 'ar', 'hy', 'az', 'be', 'bs', 'bg', 'ca', 'zh', 'hr', 'cs', 'da', 'nl',
  'en', 'et', 'fi', 'fr', 'gl', 'de', 'el', 'he', 'hi', 'hu', 'is', 'id', 'it',
  'ja', 'kn', 'kk', 'ko', 'lv', 'lt', 'mk', 'ms', 'mr', 'mi', 'ne', 'no', 'fa',
  'pl', 'pt', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sw', 'sv', 'tl', 'ta', 'th',
  'tr', 'uk', 'ur', 'vi', 'cy',
];

/**
 * Default timeout for Whisper API calls (15 minutes)
 */
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * WhisperProvider configuration options
 */
export interface WhisperProviderConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Base URL for OpenAI API (for proxies or compatible APIs) */
  baseURL?: string;
}

/**
 * OpenAI Whisper STT Provider
 */
export class WhisperProvider implements STTProvider {
  readonly name = 'whisper-openai';
  readonly maxFileSizeMB = 25;
  readonly maxDurationMinutes = 120;

  private readonly client: OpenAI;

  constructor(config?: WhisperProviderConfig) {
    const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey in config.'
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config?.baseURL,
      timeout: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
  }

  supportsLanguage(lang: string): boolean {
    return SUPPORTED_LANGUAGES.includes(lang.toLowerCase());
  }

  supportsDiarization(): boolean {
    // Whisper API does not support speaker diarization natively
    return false;
  }

  estimateCost(durationSeconds: number): number {
    // Whisper API: $0.006 per minute
    const minutes = durationSeconds / 60;
    return minutes * 0.006;
  }

  async transcribe(
    fileBuffer: Buffer,
    filename: string,
    options: STTOptions,
    onProgress?: (progress: STTProgress) => void
  ): Promise<STTResult> {
    onProgress?.({ percent: 0, stage: 'uploading' });

    try {
      // Validate file size
      const fileSizeMB = fileBuffer.length / (1024 * 1024);
      if (fileSizeMB > this.maxFileSizeMB) {
        throw new STTError(
          `File size ${fileSizeMB.toFixed(1)}MB exceeds maximum ${this.maxFileSizeMB}MB`,
          'FILE_TOO_LARGE',
          { provider: this.name, retryable: false }
        );
      }

      onProgress?.({ percent: 10, stage: 'processing' });

      // Create a File-like object for the OpenAI API
      const file = new File([fileBuffer], filename, {
        type: this.getMimeType(filename),
      }) as Uploadable;

      onProgress?.({ percent: 20, stage: 'transcribing' });

      // Call Whisper API with verbose_json for segment-level timestamps
      const response = await this.client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: options.language,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
        prompt: options.vocabularyHints?.join(', '),
      });

      onProgress?.({ percent: 90, stage: 'formatting' });

      // Cast response to verbose format
      const verboseResponse = response as unknown as WhisperVerboseResponse;

      // Map segments to common format
      const segments = this.mapSegments(verboseResponse.segments);

      onProgress?.({ percent: 100, stage: 'formatting' });

      return {
        segments,
        durationMs: Math.round(verboseResponse.duration * 1000),
        language: verboseResponse.language,
        provider: this.name,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Use the models endpoint as a lightweight health check
      const models = await this.client.models.list();
      return models.data.some((model) => model.id === 'whisper-1');
    } catch {
      return false;
    }
  }

  /**
   * Map Whisper segments to common STTSegment format
   */
  private mapSegments(whisperSegments: WhisperSegment[]): STTSegment[] {
    return whisperSegments.map((segment) => ({
      startMs: Math.round(segment.start * 1000),
      endMs: Math.round(segment.end * 1000),
      text: segment.text.trim(),
      // Calculate confidence from avg_logprob (rough approximation)
      // avg_logprob is typically negative, closer to 0 means higher confidence
      confidence: this.logprobToConfidence(segment.avg_logprob),
    }));
  }

  /**
   * Convert log probability to confidence score (0-1)
   */
  private logprobToConfidence(avgLogprob: number): number {
    // avgLogprob is typically between -1 and 0
    // -1 = low confidence, 0 = high confidence
    // Map to 0-1 range
    const confidence = Math.exp(avgLogprob);
    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      mpeg: 'audio/mpeg',
      mpga: 'audio/mpeg',
      m4a: 'audio/mp4',
      wav: 'audio/wav',
      webm: 'video/webm',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
    };
    return mimeTypes[ext ?? ''] ?? 'application/octet-stream';
  }

  /**
   * Handle and transform errors to STTError
   */
  private handleError(error: unknown): STTError {
    if (error instanceof STTError) {
      return error;
    }

    if (error instanceof OpenAI.APIError) {
      const { status, message } = error;

      // Map HTTP status to error code
      const errorMapping: Record<number, { code: STTErrorCode; retryable: boolean }> = {
        400: { code: 'INVALID_FILE', retryable: false },
        401: { code: 'PROVIDER_REJECTED', retryable: false },
        403: { code: 'QUOTA_EXCEEDED', retryable: false },
        413: { code: 'FILE_TOO_LARGE', retryable: false },
        429: { code: 'RATE_LIMIT', retryable: true },
        500: { code: 'SERVICE_UNAVAILABLE', retryable: true },
        502: { code: 'SERVICE_UNAVAILABLE', retryable: true },
        503: { code: 'SERVICE_UNAVAILABLE', retryable: true },
        504: { code: 'TIMEOUT', retryable: true },
      };

      const errorInfo = errorMapping[status ?? 0] ?? { code: 'UNKNOWN' as STTErrorCode, retryable: false };

      return new STTError(message, errorInfo.code, {
        provider: this.name,
        retryable: errorInfo.retryable,
        details: { status, originalMessage: message },
        cause: error,
      });
    }

    if (error instanceof Error) {
      // Check for timeout errors
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        return new STTError('Request timeout', 'TIMEOUT', {
          provider: this.name,
          retryable: true,
          cause: error,
        });
      }

      // Check for network errors
      if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('network')
      ) {
        return new STTError('Network error', 'NETWORK_ERROR', {
          provider: this.name,
          retryable: true,
          cause: error,
        });
      }

      return new STTError(error.message, 'UNKNOWN', {
        provider: this.name,
        retryable: false,
        cause: error,
      });
    }

    return new STTError('Unknown error occurred', 'UNKNOWN', {
      provider: this.name,
      retryable: false,
      details: { error: String(error) },
    });
  }
}

/**
 * STT Provider Types
 * Speech-to-Text provider abstraction for SME Studio
 */

/**
 * A segment returned by an STT provider
 */
export interface STTSegment {
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Transcribed text content */
  text: string;
  /** Confidence score (0-1) if provided by the provider */
  confidence?: number;
  /** Speaker identifier if diarization is enabled */
  speaker?: string;
}

/**
 * Result of a transcription
 */
export interface STTResult {
  /** Transcribed segments */
  segments: STTSegment[];
  /** Total duration in milliseconds */
  durationMs: number;
  /** Detected or specified language */
  language: string;
  /** Provider name that performed the transcription */
  provider: string;
}

/**
 * Progress update during transcription
 */
export interface STTProgress {
  /** Progress percentage (0-100) */
  percent: number;
  /** Current processing stage */
  stage: 'uploading' | 'processing' | 'transcribing' | 'formatting';
}

/**
 * Options for transcription
 */
export interface STTOptions {
  /** Language code (e.g., 'fr', 'en') */
  language?: string;
  /** Enable speaker diarization */
  enableDiarization?: boolean;
  /** Vocabulary hints for better accuracy (e.g., proper nouns, technical terms) */
  vocabularyHints?: string[];
}

/**
 * STT Provider interface
 * All STT providers must implement this interface
 */
export interface STTProvider {
  /** Provider name identifier */
  readonly name: string;

  /** Maximum file size in MB supported by this provider */
  readonly maxFileSizeMB: number;

  /** Maximum duration in minutes supported by this provider */
  readonly maxDurationMinutes: number;

  /**
   * Check if a language is supported by this provider
   * @param lang - Language code (e.g., 'fr', 'en')
   */
  supportsLanguage(lang: string): boolean;

  /**
   * Check if this provider supports speaker diarization
   */
  supportsDiarization(): boolean;

  /**
   * Estimate the cost of transcription
   * @param durationSeconds - Duration in seconds
   * @returns Estimated cost in USD
   */
  estimateCost(durationSeconds: number): number;

  /**
   * Perform transcription
   * @param fileBuffer - Audio/video file buffer
   * @param filename - Original filename (for format detection)
   * @param options - Transcription options
   * @param onProgress - Progress callback
   * @returns Transcription result
   */
  transcribe(
    fileBuffer: Buffer,
    filename: string,
    options: STTOptions,
    onProgress?: (progress: STTProgress) => void
  ): Promise<STTResult>;

  /**
   * Check if the provider is available and properly configured
   * @returns true if the provider is healthy
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Error codes for STT operations
 */
export type STTErrorCode =
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_FILE'
  | 'FILE_TOO_LARGE'
  | 'DURATION_TOO_LONG'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_REJECTED'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

/**
 * Custom error class for STT operations
 */
export class STTError extends Error {
  readonly code: STTErrorCode;
  readonly provider?: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: STTErrorCode,
    options?: {
      provider?: string;
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'STTError';
    this.code = code;
    this.provider = options?.provider;
    this.retryable = options?.retryable ?? this.isRetryableCode(code);
    this.details = options?.details;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  private isRetryableCode(code: STTErrorCode): boolean {
    const retryableCodes: STTErrorCode[] = [
      'RATE_LIMIT',
      'TIMEOUT',
      'NETWORK_ERROR',
      'SERVICE_UNAVAILABLE',
    ];
    return retryableCodes.includes(code);
  }
}

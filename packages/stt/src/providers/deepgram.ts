/**
 * Deepgram STT Provider
 * Implements STTProvider interface for Deepgram's Nova-2 API
 * Fallback provider when Whisper fails
 */

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
 * Deepgram API response types
 */
interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
  speaker?: number;
}

interface DeepgramUtterance {
  start: number;
  end: number;
  confidence: number;
  channel: number;
  transcript: string;
  words: DeepgramWord[];
  speaker?: number;
  id: string;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

interface DeepgramResults {
  channels: DeepgramChannel[];
  utterances?: DeepgramUtterance[];
}

interface DeepgramMetadata {
  transaction_key: string;
  request_id: string;
  sha256: string;
  created: string;
  duration: number;
  channels: number;
  models: string[];
  model_info: Record<string, unknown>;
}

interface DeepgramResponse {
  metadata: DeepgramMetadata;
  results: DeepgramResults;
}

/**
 * Languages supported by Deepgram Nova-2
 */
const SUPPORTED_LANGUAGES = [
  'da', 'de', 'en', 'en-AU', 'en-GB', 'en-IN', 'en-NZ', 'en-US',
  'es', 'es-419', 'es-LATAM', 'fi', 'fr', 'fr-CA', 'hi', 'hi-Latn',
  'id', 'it', 'ja', 'ko', 'nl', 'no', 'pl', 'pt', 'pt-BR', 'pt-PT',
  'ru', 'sv', 'ta', 'taq', 'tr', 'uk', 'zh', 'zh-CN', 'zh-TW',
];

/**
 * Default timeout for Deepgram API calls (15 minutes)
 */
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Deepgram API base URL
 */
const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';

/**
 * DeepgramProvider configuration options
 */
export interface DeepgramProviderConfig {
  /** Deepgram API key (defaults to DEEPGRAM_API_KEY env var) */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Deepgram STT Provider
 * Uses Nova-2 model optimized for accuracy
 */
export class DeepgramProvider implements STTProvider {
  readonly name = 'deepgram';
  readonly maxFileSizeMB = 2000;
  readonly maxDurationMinutes = 480;

  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config?: DeepgramProviderConfig) {
    const apiKey = config?.apiKey ?? process.env.DEEPGRAM_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Deepgram API key is required. Set DEEPGRAM_API_KEY environment variable or pass apiKey in config.'
      );
    }

    this.apiKey = apiKey;
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  supportsLanguage(lang: string): boolean {
    const normalizedLang = lang.toLowerCase();
    return SUPPORTED_LANGUAGES.some(
      (supported) =>
        supported.toLowerCase() === normalizedLang ||
        supported.toLowerCase().startsWith(normalizedLang + '-') ||
        normalizedLang.startsWith(supported.toLowerCase())
    );
  }

  supportsDiarization(): boolean {
    // Deepgram supports speaker diarization
    return true;
  }

  estimateCost(durationSeconds: number): number {
    // Deepgram Nova-2: $0.0043 per minute (pay-as-you-go)
    const minutes = durationSeconds / 60;
    return minutes * 0.0043;
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

      // Build query parameters for Nova-2 model
      const params = new URLSearchParams({
        model: 'nova-2',
        language: this.normalizeLanguage(options.language),
        punctuate: 'true',
        utterances: 'true',
        smart_format: 'true',
      });

      // Enable diarization if requested
      if (options.enableDiarization) {
        params.set('diarize', 'true');
      }

      // Add vocabulary hints as keywords
      if (options.vocabularyHints && options.vocabularyHints.length > 0) {
        params.set('keywords', options.vocabularyHints.join(':5,') + ':5');
      }

      onProgress?.({ percent: 20, stage: 'transcribing' });

      // Make request to Deepgram API
      const response = await this.makeRequest(
        `${DEEPGRAM_API_URL}?${params.toString()}`,
        fileBuffer,
        this.getMimeType(filename)
      );

      onProgress?.({ percent: 90, stage: 'formatting' });

      // Map response to common format
      const segments = this.mapUtterances(response.results.utterances ?? []);

      // If no utterances, fall back to channel alternatives
      if (segments.length === 0 && response.results.channels.length > 0) {
        const fallbackSegments = this.mapFromChannels(response.results.channels);
        return {
          segments: fallbackSegments,
          durationMs: Math.round(response.metadata.duration * 1000),
          language: options.language ?? 'fr',
          provider: this.name,
        };
      }

      onProgress?.({ percent: 100, stage: 'formatting' });

      return {
        segments,
        durationMs: Math.round(response.metadata.duration * 1000),
        language: options.language ?? 'fr',
        provider: this.name,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Transcribe from a pre-signed URL (alternative method)
   * Useful when file is already in cloud storage
   */
  async transcribeUrl(
    fileUrl: string,
    options: STTOptions,
    onProgress?: (progress: STTProgress) => void
  ): Promise<STTResult> {
    onProgress?.({ percent: 0, stage: 'uploading' });

    try {
      // Build query parameters for Nova-2 model
      const params = new URLSearchParams({
        model: 'nova-2',
        language: this.normalizeLanguage(options.language),
        punctuate: 'true',
        utterances: 'true',
        smart_format: 'true',
      });

      // Enable diarization if requested
      if (options.enableDiarization) {
        params.set('diarize', 'true');
      }

      // Add vocabulary hints as keywords
      if (options.vocabularyHints && options.vocabularyHints.length > 0) {
        params.set('keywords', options.vocabularyHints.join(':5,') + ':5');
      }

      onProgress?.({ percent: 20, stage: 'transcribing' });

      // Make request with URL payload
      const response = await this.makeUrlRequest(
        `${DEEPGRAM_API_URL}?${params.toString()}`,
        fileUrl
      );

      onProgress?.({ percent: 90, stage: 'formatting' });

      // Map response to common format
      const segments = this.mapUtterances(response.results.utterances ?? []);

      // If no utterances, fall back to channel alternatives
      if (segments.length === 0 && response.results.channels.length > 0) {
        const fallbackSegments = this.mapFromChannels(response.results.channels);
        return {
          segments: fallbackSegments,
          durationMs: Math.round(response.metadata.duration * 1000),
          language: options.language ?? 'fr',
          provider: this.name,
        };
      }

      onProgress?.({ percent: 100, stage: 'formatting' });

      return {
        segments,
        durationMs: Math.round(response.metadata.duration * 1000),
        language: options.language ?? 'fr',
        provider: this.name,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Use a simple API call to verify credentials
      // Deepgram doesn't have a dedicated health endpoint, so we check the projects endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://api.deepgram.com/v1/projects', {
        method: 'GET',
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Normalize language code to Deepgram format
   */
  private normalizeLanguage(lang?: string): string {
    if (!lang) {
      return 'fr';
    }

    // Map common language codes to Deepgram format
    const langMap: Record<string, string> = {
      fr: 'fr',
      french: 'fr',
      en: 'en',
      english: 'en',
      de: 'de',
      german: 'de',
      es: 'es',
      spanish: 'es',
      it: 'it',
      italian: 'it',
      pt: 'pt',
      portuguese: 'pt',
      nl: 'nl',
      dutch: 'nl',
      ja: 'ja',
      japanese: 'ja',
      ko: 'ko',
      korean: 'ko',
      zh: 'zh',
      chinese: 'zh',
    };

    const normalized = lang.toLowerCase();
    return langMap[normalized] ?? normalized;
  }

  /**
   * Map Deepgram utterances to common STTSegment format
   */
  private mapUtterances(utterances: DeepgramUtterance[]): STTSegment[] {
    return utterances.map((utterance) => ({
      startMs: Math.round(utterance.start * 1000),
      endMs: Math.round(utterance.end * 1000),
      text: utterance.transcript.trim(),
      confidence: utterance.confidence,
      speaker: utterance.speaker !== undefined ? `Speaker ${utterance.speaker}` : undefined,
    }));
  }

  /**
   * Fallback: Map from channel alternatives when utterances are not available
   */
  private mapFromChannels(channels: DeepgramChannel[]): STTSegment[] {
    const segments: STTSegment[] = [];

    for (const channel of channels) {
      for (const alternative of channel.alternatives) {
        if (alternative.words.length === 0) continue;

        // Group words into segments (by sentence or time gaps)
        let currentSegment: {
          words: DeepgramWord[];
          startMs: number;
          endMs: number;
          text: string;
        } | null = null;

        for (const word of alternative.words) {
          const wordStartMs = Math.round(word.start * 1000);
          const wordEndMs = Math.round(word.end * 1000);
          const wordText = word.punctuated_word ?? word.word;

          if (!currentSegment) {
            currentSegment = {
              words: [word],
              startMs: wordStartMs,
              endMs: wordEndMs,
              text: wordText,
            };
          } else {
            // Check for sentence ending or large time gap
            const gap = wordStartMs - currentSegment.endMs;
            const endsWithPunctuation = /[.!?]$/.test(currentSegment.text);

            if (endsWithPunctuation || gap > 1500) {
              // Save current segment
              segments.push({
                startMs: currentSegment.startMs,
                endMs: currentSegment.endMs,
                text: currentSegment.text.trim(),
                confidence: this.calculateAverageConfidence(currentSegment.words),
              });

              // Start new segment
              currentSegment = {
                words: [word],
                startMs: wordStartMs,
                endMs: wordEndMs,
                text: wordText,
              };
            } else {
              // Continue current segment
              currentSegment.words.push(word);
              currentSegment.endMs = wordEndMs;
              currentSegment.text += ' ' + wordText;
            }
          }
        }

        // Add remaining segment
        if (currentSegment && currentSegment.text.trim()) {
          segments.push({
            startMs: currentSegment.startMs,
            endMs: currentSegment.endMs,
            text: currentSegment.text.trim(),
            confidence: this.calculateAverageConfidence(currentSegment.words),
          });
        }
      }
    }

    return segments;
  }

  /**
   * Calculate average confidence from words
   */
  private calculateAverageConfidence(words: DeepgramWord[]): number {
    if (words.length === 0) return 0;
    const sum = words.reduce((acc, word) => acc + word.confidence, 0);
    return sum / words.length;
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
      mov: 'video/quicktime',
    };
    return mimeTypes[ext ?? ''] ?? 'application/octet-stream';
  }

  /**
   * Make HTTP request to Deepgram API with file buffer
   */
  private async makeRequest(
    url: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<DeepgramResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': mimeType,
        },
        body: fileBuffer,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new DeepgramAPIError(response.status, errorBody);
      }

      return (await response.json()) as DeepgramResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Make HTTP request to Deepgram API with URL payload
   */
  private async makeUrlRequest(url: string, fileUrl: string): Promise<DeepgramResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: fileUrl }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new DeepgramAPIError(response.status, errorBody);
      }

      return (await response.json()) as DeepgramResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Handle and transform errors to STTError
   */
  private handleError(error: unknown): STTError {
    if (error instanceof STTError) {
      return error;
    }

    if (error instanceof DeepgramAPIError) {
      const { status, message } = error;

      // Map HTTP status to error code
      const errorMapping: Record<number, { code: STTErrorCode; retryable: boolean }> = {
        400: { code: 'INVALID_FILE', retryable: false },
        401: { code: 'PROVIDER_REJECTED', retryable: false },
        402: { code: 'QUOTA_EXCEEDED', retryable: false },
        403: { code: 'PROVIDER_REJECTED', retryable: false },
        413: { code: 'FILE_TOO_LARGE', retryable: false },
        429: { code: 'RATE_LIMIT', retryable: true },
        500: { code: 'SERVICE_UNAVAILABLE', retryable: true },
        502: { code: 'SERVICE_UNAVAILABLE', retryable: true },
        503: { code: 'SERVICE_UNAVAILABLE', retryable: true },
        504: { code: 'TIMEOUT', retryable: true },
      };

      const errorInfo = errorMapping[status] ?? { code: 'UNKNOWN' as STTErrorCode, retryable: false };

      return new STTError(message, errorInfo.code, {
        provider: this.name,
        retryable: errorInfo.retryable,
        details: { status, originalMessage: message },
        cause: error,
      });
    }

    if (error instanceof Error) {
      // Check for abort/timeout errors
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
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
        error.message.includes('network') ||
        error.message.includes('fetch')
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

/**
 * Custom error class for Deepgram API errors
 */
class DeepgramAPIError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DeepgramAPIError';
    this.status = status;
  }
}

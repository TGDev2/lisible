/**
 * @sme-studio/stt
 * Speech-to-Text provider abstraction for SME Studio
 */

// Types
export type {
  STTProvider,
  STTSegment,
  STTResult,
  STTProgress,
  STTOptions,
  STTErrorCode,
} from './types';

export { STTError } from './types';

// Providers
export { WhisperProvider } from './providers/whisper';
export type { WhisperProviderConfig } from './providers/whisper';

// Mapper utilities
export type { Segment } from './mapper';
export { mapToSegments, mapResultToSegments } from './mapper';

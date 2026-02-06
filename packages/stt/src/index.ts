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

export { DeepgramProvider } from './providers/deepgram';
export type { DeepgramProviderConfig } from './providers/deepgram';

// Orchestrator
export { STTOrchestrator } from './orchestrator';
export type {
  STTOrchestratorConfig,
  STTMetrics,
  ProviderMetrics,
  TranscriptionLogEntry,
  STTLogger,
} from './orchestrator';

// Mapper utilities
export type { Segment } from './mapper';
export { mapToSegments, mapResultToSegments } from './mapper';

/**
 * WhisperProvider Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhisperProvider } from '../providers/whisper';
import { STTError } from '../types';
import { mapToSegments } from '../mapper';

// Mock OpenAI
vi.mock('openai', () => {
  const mockCreate = vi.fn();
  const mockModelsList = vi.fn();

  return {
    default: vi.fn().mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: mockCreate,
        },
      },
      models: {
        list: mockModelsList,
      },
    })),
    APIError: class APIError extends Error {
      status: number;
      constructor(status: number, message: string) {
        super(message);
        this.status = status;
      }
    },
  };
});

describe('WhisperProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  describe('constructor', () => {
    it('should create provider with API key from env', () => {
      const provider = new WhisperProvider();
      expect(provider.name).toBe('whisper-openai');
    });

    it('should create provider with API key from config', () => {
      delete process.env.OPENAI_API_KEY;
      const provider = new WhisperProvider({ apiKey: 'custom-key' });
      expect(provider.name).toBe('whisper-openai');
    });

    it('should throw error if no API key provided', () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => new WhisperProvider()).toThrow('OpenAI API key is required');
    });
  });

  describe('supportsLanguage', () => {
    it('should return true for supported languages', () => {
      const provider = new WhisperProvider();
      expect(provider.supportsLanguage('fr')).toBe(true);
      expect(provider.supportsLanguage('en')).toBe(true);
      expect(provider.supportsLanguage('de')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      const provider = new WhisperProvider();
      expect(provider.supportsLanguage('xyz')).toBe(false);
    });

    it('should be case insensitive', () => {
      const provider = new WhisperProvider();
      expect(provider.supportsLanguage('FR')).toBe(true);
      expect(provider.supportsLanguage('En')).toBe(true);
    });
  });

  describe('supportsDiarization', () => {
    it('should return false (Whisper does not support diarization)', () => {
      const provider = new WhisperProvider();
      expect(provider.supportsDiarization()).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost at $0.006/minute', () => {
      const provider = new WhisperProvider();

      // 1 minute = $0.006
      expect(provider.estimateCost(60)).toBeCloseTo(0.006);

      // 10 minutes = $0.06
      expect(provider.estimateCost(600)).toBeCloseTo(0.06);

      // 5 minutes = $0.03
      expect(provider.estimateCost(300)).toBeCloseTo(0.03);
    });
  });

  describe('maxFileSizeMB', () => {
    it('should be 25MB', () => {
      const provider = new WhisperProvider();
      expect(provider.maxFileSizeMB).toBe(25);
    });
  });

  describe('maxDurationMinutes', () => {
    it('should be 120 minutes', () => {
      const provider = new WhisperProvider();
      expect(provider.maxDurationMinutes).toBe(120);
    });
  });
});

describe('STTError', () => {
  it('should create error with code and message', () => {
    const error = new STTError('Test error', 'RATE_LIMIT');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.retryable).toBe(true);
  });

  it('should mark rate limit errors as retryable', () => {
    const error = new STTError('Rate limited', 'RATE_LIMIT');
    expect(error.retryable).toBe(true);
  });

  it('should mark timeout errors as retryable', () => {
    const error = new STTError('Timeout', 'TIMEOUT');
    expect(error.retryable).toBe(true);
  });

  it('should mark invalid file errors as not retryable', () => {
    const error = new STTError('Invalid file', 'INVALID_FILE');
    expect(error.retryable).toBe(false);
  });

  it('should allow explicit retryable override', () => {
    const error = new STTError('Custom', 'INVALID_FILE', { retryable: true });
    expect(error.retryable).toBe(true);
  });

  it('should include provider name', () => {
    const error = new STTError('Test', 'UNKNOWN', { provider: 'whisper-openai' });
    expect(error.provider).toBe('whisper-openai');
  });
});

describe('mapToSegments', () => {
  it('should map STT segments to internal format', () => {
    const sttSegments = [
      { startMs: 0, endMs: 2000, text: 'Hello world', confidence: 0.95 },
      { startMs: 2500, endMs: 5000, text: 'How are you', confidence: 0.88 },
    ];

    const segments = mapToSegments(sttSegments);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      sequenceNum: 1,
      startMs: 0,
      endMs: 2000,
      text: 'Hello world',
      speaker: undefined,
      isSoundInfo: false,
    });
    expect(segments[1]).toEqual({
      sequenceNum: 2,
      startMs: 2500,
      endMs: 5000,
      text: 'How are you',
      speaker: undefined,
      isSoundInfo: false,
    });
  });

  it('should preserve speaker if provided', () => {
    const sttSegments = [
      { startMs: 0, endMs: 2000, text: 'Hello', speaker: 'Speaker 1' },
    ];

    const segments = mapToSegments(sttSegments);
    expect(segments[0]?.speaker).toBe('Speaker 1');
  });

  it('should handle empty array', () => {
    const segments = mapToSegments([]);
    expect(segments).toEqual([]);
  });
});

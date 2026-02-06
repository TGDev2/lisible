/**
 * DeepgramProvider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepgramProvider } from '../providers/deepgram';
import { STTError } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DeepgramProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEEPGRAM_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with API key from env', () => {
      const provider = new DeepgramProvider();
      expect(provider.name).toBe('deepgram');
    });

    it('should create provider with API key from config', () => {
      delete process.env.DEEPGRAM_API_KEY;
      const provider = new DeepgramProvider({ apiKey: 'custom-key' });
      expect(provider.name).toBe('deepgram');
    });

    it('should throw error if no API key provided', () => {
      delete process.env.DEEPGRAM_API_KEY;
      expect(() => new DeepgramProvider()).toThrow('Deepgram API key is required');
    });
  });

  describe('supportsLanguage', () => {
    it('should return true for supported languages', () => {
      const provider = new DeepgramProvider();
      expect(provider.supportsLanguage('fr')).toBe(true);
      expect(provider.supportsLanguage('en')).toBe(true);
      expect(provider.supportsLanguage('de')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      const provider = new DeepgramProvider();
      expect(provider.supportsLanguage('xyz')).toBe(false);
    });

    it('should handle language variants', () => {
      const provider = new DeepgramProvider();
      expect(provider.supportsLanguage('en-US')).toBe(true);
      expect(provider.supportsLanguage('fr-CA')).toBe(true);
      expect(provider.supportsLanguage('pt-BR')).toBe(true);
    });
  });

  describe('supportsDiarization', () => {
    it('should return true (Deepgram supports diarization)', () => {
      const provider = new DeepgramProvider();
      expect(provider.supportsDiarization()).toBe(true);
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost at $0.0043/minute', () => {
      const provider = new DeepgramProvider();

      // 1 minute = $0.0043
      expect(provider.estimateCost(60)).toBeCloseTo(0.0043);

      // 10 minutes = $0.043
      expect(provider.estimateCost(600)).toBeCloseTo(0.043);

      // 5 minutes = $0.0215
      expect(provider.estimateCost(300)).toBeCloseTo(0.0215);
    });
  });

  describe('maxFileSizeMB', () => {
    it('should be 2000MB', () => {
      const provider = new DeepgramProvider();
      expect(provider.maxFileSizeMB).toBe(2000);
    });
  });

  describe('maxDurationMinutes', () => {
    it('should be 480 minutes (8 hours)', () => {
      const provider = new DeepgramProvider();
      expect(provider.maxDurationMinutes).toBe(480);
    });
  });

  describe('transcribe', () => {
    it('should transcribe audio buffer successfully', async () => {
      const mockResponse = {
        metadata: {
          transaction_key: 'test-key',
          request_id: 'test-id',
          sha256: 'test-sha',
          created: '2024-01-01',
          duration: 10.5,
          channels: 1,
          models: ['nova-2'],
          model_info: {},
        },
        results: {
          channels: [],
          utterances: [
            {
              start: 0,
              end: 2.5,
              confidence: 0.95,
              channel: 0,
              transcript: 'Bonjour et bienvenue',
              words: [],
              id: '1',
            },
            {
              start: 3.0,
              end: 5.5,
              confidence: 0.88,
              channel: 0,
              transcript: 'dans ce module',
              words: [],
              id: '2',
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new DeepgramProvider();
      const buffer = Buffer.from('test audio data');
      const result = await provider.transcribe(buffer, 'test.mp3', { language: 'fr' });

      expect(result.provider).toBe('deepgram');
      expect(result.durationMs).toBe(10500);
      expect(result.language).toBe('fr');
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toEqual({
        startMs: 0,
        endMs: 2500,
        text: 'Bonjour et bienvenue',
        confidence: 0.95,
        speaker: undefined,
      });
    });

    it('should include diarization in request when enabled', async () => {
      const mockResponse = {
        metadata: { duration: 5, channels: 1, models: ['nova-2'], model_info: {} },
        results: {
          channels: [],
          utterances: [
            {
              start: 0,
              end: 2.5,
              confidence: 0.95,
              channel: 0,
              transcript: 'Hello',
              words: [],
              speaker: 0,
              id: '1',
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new DeepgramProvider();
      const buffer = Buffer.from('test audio data');
      await provider.transcribe(buffer, 'test.mp3', {
        language: 'fr',
        enableDiarization: true,
      });

      // Check that diarize=true was included in the request URL
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('diarize=true'),
        expect.any(Object)
      );
    });

    it('should map speaker from utterances', async () => {
      const mockResponse = {
        metadata: { duration: 5, channels: 1, models: ['nova-2'], model_info: {} },
        results: {
          channels: [],
          utterances: [
            {
              start: 0,
              end: 2.5,
              confidence: 0.95,
              channel: 0,
              transcript: 'Hello',
              words: [],
              speaker: 1,
              id: '1',
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new DeepgramProvider();
      const buffer = Buffer.from('test audio data');
      const result = await provider.transcribe(buffer, 'test.mp3', { language: 'fr' });

      expect(result.segments[0]?.speaker).toBe('Speaker 1');
    });

    it('should use nova-2 model and fr language by default', async () => {
      const mockResponse = {
        metadata: { duration: 5, channels: 1, models: ['nova-2'], model_info: {} },
        results: { channels: [], utterances: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new DeepgramProvider();
      const buffer = Buffer.from('test audio data');
      await provider.transcribe(buffer, 'test.mp3', {});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('model=nova-2'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('language=fr'),
        expect.any(Object)
      );
    });

    it('should throw STTError for API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      });

      const provider = new DeepgramProvider();
      const buffer = Buffer.from('test audio data');

      await expect(
        provider.transcribe(buffer, 'test.mp3', { language: 'fr' })
      ).rejects.toThrow(STTError);
    });

    it('should mark rate limit errors as retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      });

      const provider = new DeepgramProvider();
      const buffer = Buffer.from('test audio data');

      try {
        await provider.transcribe(buffer, 'test.mp3', { language: 'fr' });
      } catch (error) {
        expect(error).toBeInstanceOf(STTError);
        expect((error as STTError).code).toBe('RATE_LIMIT');
        expect((error as STTError).retryable).toBe(true);
      }
    });
  });

  describe('transcribeUrl', () => {
    it('should transcribe from pre-signed URL', async () => {
      const mockResponse = {
        metadata: { duration: 10.5, channels: 1, models: ['nova-2'], model_info: {} },
        results: {
          channels: [],
          utterances: [
            {
              start: 0,
              end: 2.5,
              confidence: 0.95,
              channel: 0,
              transcript: 'Bonjour',
              words: [],
              id: '1',
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new DeepgramProvider();
      const result = await provider.transcribeUrl(
        'https://storage.example.com/audio.mp3?token=xxx',
        { language: 'fr' }
      );

      expect(result.provider).toBe('deepgram');
      expect(result.segments).toHaveLength(1);

      // Verify the URL was passed in the request body
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('https://storage.example.com/audio.mp3'),
        })
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is accessible', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ projects: [] }),
      });

      const provider = new DeepgramProvider();
      const result = await provider.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.deepgram.com/v1/projects',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Token test-api-key',
          }),
        })
      );
    });

    it('should return false when API is not accessible', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const provider = new DeepgramProvider();
      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on authentication error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const provider = new DeepgramProvider();
      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });
  });
});

describe('DeepgramProvider segment mapping compatibility', () => {
  beforeEach(() => {
    process.env.DEEPGRAM_API_KEY = 'test-api-key';
    vi.clearAllMocks();
  });

  it('should produce segments compatible with Whisper format', async () => {
    // Deepgram response
    const deepgramResponse = {
      metadata: { duration: 5, channels: 1, models: ['nova-2'], model_info: {} },
      results: {
        channels: [],
        utterances: [
          {
            start: 0,
            end: 2.5,
            confidence: 0.95,
            channel: 0,
            transcript: 'Hello world',
            words: [],
            id: '1',
          },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(deepgramResponse),
    });

    const provider = new DeepgramProvider();
    const buffer = Buffer.from('test');
    const result = await provider.transcribe(buffer, 'test.mp3', { language: 'en' });

    // Verify segment format matches STTSegment interface
    const segment = result.segments[0];
    expect(segment).toHaveProperty('startMs');
    expect(segment).toHaveProperty('endMs');
    expect(segment).toHaveProperty('text');
    expect(segment).toHaveProperty('confidence');

    // Verify types
    expect(typeof segment?.startMs).toBe('number');
    expect(typeof segment?.endMs).toBe('number');
    expect(typeof segment?.text).toBe('string');
    expect(typeof segment?.confidence).toBe('number');
  });
});

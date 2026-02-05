import { describe, it, expect } from 'vitest';
import { parseSRT } from '../parse-srt';

describe('parseSRT', () => {
  describe('valid SRT files', () => {
    it('should parse a simple SRT file', () => {
      const content = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,000
This is a test`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(2);

      expect(segments[0]).toEqual({
        sequenceNum: 1,
        startMs: 1000,
        endMs: 4000,
        text: 'Hello world',
      });

      expect(segments[1]).toEqual({
        sequenceNum: 2,
        startMs: 5000,
        endMs: 8000,
        text: 'This is a test',
      });
    });

    it('should parse multi-line subtitles', () => {
      const content = `1
00:00:01,000 --> 00:00:04,000
First line
Second line`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('First line\nSecond line');
    });

    it('should handle CRLF line endings', () => {
      const content = `1\r\n00:00:01,000 --> 00:00:04,000\r\nHello world\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nTest`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(2);
    });

    it('should handle BOM at start of file', () => {
      const content = `\uFEFF1
00:00:01,000 --> 00:00:04,000
Hello world`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(1);
    });

    it('should handle extra blank lines', () => {
      const content = `

1
00:00:01,000 --> 00:00:04,000
Hello world


2
00:00:05,000 --> 00:00:08,000
Test

`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(2);
    });

    it('should extract speaker from text', () => {
      const content = `1
00:00:01,000 --> 00:00:04,000
[FORMATEUR] Bonjour à tous`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].speaker).toBe('[FORMATEUR]');
      expect(segments[0].text).toBe('Bonjour à tous');
    });

    it('should detect sound info segments', () => {
      const content = `1
00:00:01,000 --> 00:00:04,000
[Musique]`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].isSoundInfo).toBe(true);
    });

    it('should parse timecode with period instead of comma', () => {
      const content = `1
00:00:01.000 --> 00:00:04.000
Hello world`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments).toHaveLength(1);
      expect(segments[0].startMs).toBe(1000);
    });

    it('should handle single-digit hours in timecode', () => {
      const content = `1
1:00:01,000 --> 1:00:04,000
Hello world`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].startMs).toBe(3601000);
    });
  });

  describe('malformed SRT files (lenient mode)', () => {
    it('should handle missing sequence numbers in lenient mode', () => {
      const content = `00:00:01,000 --> 00:00:04,000
Hello world`;

      const { segments: _segments, errors } = parseSRT(content, { lenient: true });

      // Should report error but not crash
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should handle invalid timecode format', () => {
      const content = `1
invalid timecode
Hello world`;

      const { segments: _segments, errors } = parseSRT(content, { lenient: true });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Invalid timecode');
    });

    it('should continue parsing after error', () => {
      const content = `1
invalid
error

2
00:00:05,000 --> 00:00:08,000
Valid segment`;

      const { segments, errors } = parseSRT(content, { lenient: true });

      expect(errors.length).toBeGreaterThan(0);
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('Valid segment');
    });

    it('should report error for missing text', () => {
      const content = `1
00:00:01,000 --> 00:00:04,000

2
00:00:05,000 --> 00:00:08,000
Hello`;

      const { segments: _segments, errors } = parseSRT(content, { lenient: true });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Missing text'))).toBe(true);
    });
  });

  describe('strict mode', () => {
    it('should fail on invalid sequence number in strict mode', () => {
      const content = `abc
00:00:01,000 --> 00:00:04,000
Hello world`;

      const { segments, errors } = parseSRT(content, { lenient: false });

      expect(errors.length).toBeGreaterThan(0);
      expect(segments).toHaveLength(0);
    });
  });

  describe('encoding handling', () => {
    it('should handle UTF-8 characters', () => {
      const content = `1
00:00:01,000 --> 00:00:04,000
Éléphant français naïve`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].text).toBe('Éléphant français naïve');
    });

    it('should handle special characters', () => {
      const content = `1
00:00:01,000 --> 00:00:04,000
♪ ♫ € £ ¥ © ® ™`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].text).toContain('♪');
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const { segments, errors } = parseSRT('');

      expect(segments).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('should handle whitespace-only content', () => {
      const { segments, errors } = parseSRT('   \n\n   \n');

      expect(segments).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('should handle very long text', () => {
      const longText = 'A'.repeat(1000);
      const content = `1
00:00:01,000 --> 00:00:04,000
${longText}`;

      const { segments, errors } = parseSRT(content);

      expect(errors).toHaveLength(0);
      expect(segments[0].text).toBe(longText);
    });

    it('should preserve sequence numbers even if not sequential', () => {
      const content = `5
00:00:01,000 --> 00:00:04,000
First

10
00:00:05,000 --> 00:00:08,000
Second`;

      const { segments } = parseSRT(content);

      expect(segments[0].sequenceNum).toBe(5);
      expect(segments[1].sequenceNum).toBe(10);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { generateSRT, UTF8_BOM } from '../generate-srt';
import type { Segment } from '../types';

describe('generateSRT', () => {
  describe('format validation', () => {
    it('should generate valid SRT format', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 1000, endMs: 4000, text: 'Hello world' },
        { sequenceNum: 2, startMs: 5000, endMs: 8000, text: 'This is a test' },
      ];

      const result = generateSRT(segments);

      // Should contain UTF-8 BOM
      expect(result.startsWith(UTF8_BOM)).toBe(true);

      // Remove BOM for content validation
      const content = result.slice(1);

      // Should contain properly formatted blocks
      expect(content).toContain('1\r\n00:00:01,000 --> 00:00:04,000\r\nHello world');
      expect(content).toContain('2\r\n00:00:05,000 --> 00:00:08,000\r\nThis is a test');
    });

    it('should use CRLF line endings', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Test' },
      ];

      const result = generateSRT(segments);
      const content = result.slice(1); // Remove BOM

      // Should use CRLF
      expect(content).toContain('\r\n');
      // Should not have LF without CR (except within the CRLF)
      expect(content.replace(/\r\n/g, '')).not.toContain('\n');
    });

    it('should separate blocks with double line breaks', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'First' },
        { sequenceNum: 2, startMs: 2000, endMs: 3000, text: 'Second' },
      ];

      const result = generateSRT(segments);

      // Blocks should be separated by \r\n\r\n
      expect(result).toContain('First\r\n\r\n2\r\n');
    });
  });

  describe('UTF-8 BOM header', () => {
    it('should start with UTF-8 BOM', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Test' },
      ];

      const result = generateSRT(segments);

      expect(result.charCodeAt(0)).toBe(0xfeff);
    });

    it('should include BOM for empty segments', () => {
      const result = generateSRT([]);

      expect(result).toBe(UTF8_BOM);
      expect(result.charCodeAt(0)).toBe(0xfeff);
    });
  });

  describe('timecode format HH:MM:SS,mmm', () => {
    it('should format timecodes correctly', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 3661001, endMs: 3665999, text: 'Test' },
      ];

      const result = generateSRT(segments);

      // 3661001ms = 1h 1m 1s 1ms
      expect(result).toContain('01:01:01,001 --> 01:01:05,999');
    });

    it('should zero-pad timecode components', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 1, endMs: 61001, text: 'Test' },
      ];

      const result = generateSRT(segments);

      expect(result).toContain('00:00:00,001 --> 00:01:01,001');
    });

    it('should handle zero milliseconds', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Test' },
      ];

      const result = generateSRT(segments);

      expect(result).toContain('00:00:00,000 --> 00:00:01,000');
    });

    it('should handle large timecodes (hours > 9)', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 36000000, endMs: 36001000, text: 'Test' },
      ];

      const result = generateSRT(segments);

      // 36000000ms = 10 hours
      expect(result).toContain('10:00:00,000 --> 10:00:01,000');
    });
  });

  describe('sequential numbering', () => {
    it('should use 1-indexed sequential numbers', () => {
      const segments: Segment[] = [
        { sequenceNum: 99, startMs: 0, endMs: 1000, text: 'First' },
        { sequenceNum: 1, startMs: 2000, endMs: 3000, text: 'Second' },
        { sequenceNum: 50, startMs: 4000, endMs: 5000, text: 'Third' },
      ];

      const result = generateSRT(segments);
      const content = result.slice(1); // Remove BOM
      const lines = content.split('\r\n');

      // First segment should be numbered 1
      expect(lines[0]).toBe('1');
      // Second segment should be numbered 2
      expect(lines[4]).toBe('2');
      // Third segment should be numbered 3
      expect(lines[8]).toBe('3');
    });

    it('should sort segments by start time before numbering', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 5000, endMs: 6000, text: 'Second' },
        { sequenceNum: 2, startMs: 1000, endMs: 2000, text: 'First' },
      ];

      const result = generateSRT(segments);

      // 'First' should come before 'Second' in output
      const firstIndex = result.indexOf('First');
      const secondIndex = result.indexOf('Second');
      expect(firstIndex).toBeLessThan(secondIndex);
    });
  });

  describe('special characters handling', () => {
    it('should preserve UTF-8 characters', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Éléphant français naïve' },
      ];

      const result = generateSRT(segments);

      expect(result).toContain('Éléphant français naïve');
    });

    it('should preserve special symbols', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: '♪ ♫ € £ ¥ © ® ™' },
      ];

      const result = generateSRT(segments);

      expect(result).toContain('♪ ♫ € £ ¥ © ® ™');
    });

    it('should preserve Japanese/Chinese characters', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'こんにちは 你好' },
      ];

      const result = generateSRT(segments);

      expect(result).toContain('こんにちは 你好');
    });

    it('should preserve Arabic text', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'مرحبا بالعالم' },
      ];

      const result = generateSRT(segments);

      expect(result).toContain('مرحبا بالعالم');
    });
  });

  describe('edge cases', () => {
    it('should handle empty segments array', () => {
      const result = generateSRT([]);

      expect(result).toBe(UTF8_BOM);
    });

    it('should handle single segment', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Only one' },
      ];

      const result = generateSRT(segments);
      const content = result.slice(1);

      expect(content).toBe('1\r\n00:00:00,000 --> 00:00:01,000\r\nOnly one\r\n');
    });

    it('should handle multi-line text within segment', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Line 1\nLine 2' },
      ];

      const result = generateSRT(segments);

      expect(result).toContain('Line 1\nLine 2');
    });

    it('should handle empty text', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: '' },
      ];

      const result = generateSRT(segments);

      expect(result).toContain('00:00:00,000 --> 00:00:01,000\r\n');
    });

    it('should preserve speaker and soundInfo properties in text', () => {
      const segments: Segment[] = [
        {
          sequenceNum: 1,
          startMs: 0,
          endMs: 1000,
          text: '[FORMATEUR] Bonjour',
          speaker: '[FORMATEUR]',
          isSoundInfo: false,
        },
      ];

      const result = generateSRT(segments);

      // Text is preserved as-is
      expect(result).toContain('[FORMATEUR] Bonjour');
    });
  });

  describe('roundtrip compatibility', () => {
    it('should generate output that matches expected SRT structure', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 1000, endMs: 4000, text: 'First subtitle' },
        { sequenceNum: 2, startMs: 5000, endMs: 8000, text: 'Second subtitle' },
      ];

      const result = generateSRT(segments);
      const expected =
        UTF8_BOM +
        '1\r\n' +
        '00:00:01,000 --> 00:00:04,000\r\n' +
        'First subtitle\r\n' +
        '\r\n' +
        '2\r\n' +
        '00:00:05,000 --> 00:00:08,000\r\n' +
        'Second subtitle\r\n';

      expect(result).toBe(expected);
    });
  });
});

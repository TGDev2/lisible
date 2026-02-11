import { describe, it, expect } from 'vitest';
import { generateVTT } from '../generate-vtt';
import type { Segment } from '../types';

describe('generateVTT', () => {
  describe('WEBVTT header', () => {
    it('should start with WEBVTT header', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Test' },
      ];

      const result = generateVTT(segments);

      expect(result.startsWith('WEBVTT')).toBe(true);
    });

    it('should have blank line after WEBVTT header', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Test' },
      ];

      const result = generateVTT(segments);

      expect(result.startsWith('WEBVTT\n\n')).toBe(true);
    });

    it('should return WEBVTT header only for empty segments', () => {
      const result = generateVTT([]);

      expect(result).toBe('WEBVTT\n');
    });
  });

  describe('timecode format HH:MM:SS.mmm', () => {
    it('should use period (not comma) as decimal separator', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 1500, endMs: 3500, text: 'Test' },
      ];

      const result = generateVTT(segments);

      // VTT uses period, not comma
      expect(result).toContain('00:00:01.500 --> 00:00:03.500');
      expect(result).not.toContain(',');
    });

    it('should format timecodes correctly', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 3661001, endMs: 3665999, text: 'Test' },
      ];

      const result = generateVTT(segments);

      // 3661001ms = 1h 1m 1s 1ms
      expect(result).toContain('01:01:01.001 --> 01:01:05.999');
    });

    it('should zero-pad timecode components', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 1, endMs: 61001, text: 'Test' },
      ];

      const result = generateVTT(segments);

      expect(result).toContain('00:00:00.001 --> 00:01:01.001');
    });

    it('should handle zero milliseconds', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Test' },
      ];

      const result = generateVTT(segments);

      expect(result).toContain('00:00:00.000 --> 00:00:01.000');
    });

    it('should handle large timecodes (hours > 9)', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 36000000, endMs: 36001000, text: 'Test' },
      ];

      const result = generateVTT(segments);

      // 36000000ms = 10 hours
      expect(result).toContain('10:00:00.000 --> 10:00:01.000');
    });
  });

  describe('UTF-8 encoding', () => {
    it('should preserve UTF-8 characters', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Elephants' },
      ];

      const result = generateVTT(segments);

      expect(result).toContain('Elephants');
    });

    it('should preserve French accented characters', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'cafe francaise naive' },
      ];

      const result = generateVTT(segments);

      expect(result).toContain('cafe francaise naive');
    });

    it('should preserve special symbols', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'music euro pound yen' },
      ];

      const result = generateVTT(segments);

      expect(result).toContain('music euro pound yen');
    });

    it('should preserve Japanese/Chinese characters', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'konnichiha nihao' },
      ];

      const result = generateVTT(segments);

      expect(result).toContain('konnichiha nihao');
    });
  });

  describe('cue formatting', () => {
    it('should sort segments by start time', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 5000, endMs: 6000, text: 'Second' },
        { sequenceNum: 2, startMs: 1000, endMs: 2000, text: 'First' },
      ];

      const result = generateVTT(segments);

      const firstIndex = result.indexOf('First');
      const secondIndex = result.indexOf('Second');
      expect(firstIndex).toBeLessThan(secondIndex);
    });

    it('should separate cues with blank lines', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'First' },
        { sequenceNum: 2, startMs: 2000, endMs: 3000, text: 'Second' },
      ];

      const result = generateVTT(segments);

      // Cues should be separated by \n\n
      expect(result).toContain('First\n\n00:00:02.000');
    });

    it('should use LF line endings (not CRLF)', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Test' },
      ];

      const result = generateVTT(segments);

      // Should use LF
      expect(result).toContain('\n');
      // Should not have CRLF
      expect(result).not.toContain('\r\n');
    });
  });

  describe('edge cases', () => {
    it('should handle single segment', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Only one' },
      ];

      const result = generateVTT(segments);

      expect(result).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nOnly one\n');
    });

    it('should handle multi-line text within segment', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: 'Line 1\nLine 2' },
      ];

      const result = generateVTT(segments);

      expect(result).toContain('Line 1\nLine 2');
    });

    it('should handle empty text', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 0, endMs: 1000, text: '' },
      ];

      const result = generateVTT(segments);

      expect(result).toContain('00:00:00.000 --> 00:00:01.000\n');
    });

    it('should preserve speaker tags in text', () => {
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

      const result = generateVTT(segments);

      expect(result).toContain('[FORMATEUR] Bonjour');
    });
  });

  describe('browser compatibility', () => {
    it('should generate output parseable by browsers', () => {
      const segments: Segment[] = [
        { sequenceNum: 1, startMs: 1000, endMs: 4000, text: 'First subtitle' },
        { sequenceNum: 2, startMs: 5000, endMs: 8000, text: 'Second subtitle' },
      ];

      const result = generateVTT(segments);
      const expected =
        'WEBVTT\n\n' +
        '00:00:01.000 --> 00:00:04.000\n' +
        'First subtitle\n\n' +
        '00:00:05.000 --> 00:00:08.000\n' +
        'Second subtitle\n';

      expect(result).toBe(expected);
    });
  });
});

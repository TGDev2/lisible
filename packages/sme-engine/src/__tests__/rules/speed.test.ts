import { describe, it, expect } from 'vitest';
import { checkSpeed } from '../../rules/speed';
import type { Segment } from '../../types';

/**
 * Helper to create a test segment
 */
function createSegment(
  text: string,
  startMs: number,
  endMs: number
): Segment {
  return {
    sequenceNum: 1,
    startMs,
    endMs,
    text,
  };
}

describe('checkSpeed', () => {
  describe('critical alerts (> 20 char/s)', () => {
    it('should return critical alert for speed > 20 char/s', () => {
      // 25 characters in 1 second = 25 char/s
      const segment = createSegment('1234567890123456789012345', 0, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(25);
      expect(result.max).toBe(20);
    });

    it('should return critical alert for exactly 21 char/s', () => {
      // 21 characters in 1 second = 21 char/s
      const segment = createSegment('This is 21 characters', 0, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(21);
    });

    it('should count spaces in character count', () => {
      // "a b c d e" = 9 characters (5 letters + 4 spaces)
      // 9 characters in 0.4 seconds = 22.5 char/s
      const segment = createSegment('a b c d e', 0, 400);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(22.5);
    });
  });

  describe('warning alerts (> 18 and <= 20 char/s)', () => {
    it('should return warning alert for speed of 19 char/s', () => {
      // 19 characters in 1 second = 19 char/s
      const segment = createSegment('1234567890123456789', 0, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.actual).toBe(19);
      expect(result.max).toBe(20);
    });

    it('should return warning alert for exactly 20 char/s', () => {
      // 20 characters in 1 second = 20 char/s
      const segment = createSegment('12345678901234567890', 0, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.actual).toBe(20);
    });

    it('should return warning alert for speed just above 18 char/s', () => {
      // 19 characters in 1 second = 19 char/s
      const segment = createSegment('A'.repeat(19), 0, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.actual).toBe(19);
    });
  });

  describe('no alerts (<= 18 char/s)', () => {
    it('should return no alert for speed of 18 char/s', () => {
      // 18 characters in 1 second = 18 char/s
      const segment = createSegment('Eighteen chars !!!', 0, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.severity).toBeUndefined();
      expect(result.actual).toBe(18);
      expect(result.max).toBe(20);
    });

    it('should return no alert for speed of 5 char/s', () => {
      // 10 characters in 2 seconds = 5 char/s
      const segment = createSegment('Short text', 0, 2000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.actual).toBe(5);
    });

    it('should return no alert for very slow speed', () => {
      // 5 characters in 10 seconds = 0.5 char/s
      const segment = createSegment('Hello', 0, 10000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.actual).toBe(0.5);
    });
  });

  describe('edge cases', () => {
    it('should handle zero duration segment', () => {
      const segment = createSegment('Hello', 1000, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(Infinity);
    });

    it('should handle negative duration (endMs < startMs)', () => {
      const segment = createSegment('Hello', 2000, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(Infinity);
    });

    it('should handle empty text', () => {
      // 0 characters in 1 second = 0 char/s
      const segment = createSegment('', 0, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.actual).toBe(0);
    });

    it('should handle whitespace-only text (spaces are counted)', () => {
      // 5 spaces in 1 second = 5 char/s
      const segment = createSegment('     ', 0, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.actual).toBe(5);
    });

    it('should handle newlines in text (counted as characters)', () => {
      // "Hello\nWorld" = 11 characters in 1 second = 11 char/s
      const segment = createSegment('Hello\nWorld', 0, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.actual).toBe(11);
    });

    it('should handle very long text with fast speed', () => {
      // 100 characters in 2 seconds = 50 char/s
      const segment = createSegment('A'.repeat(100), 0, 2000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(50);
    });

    it('should handle non-zero start time', () => {
      // 20 characters from 5000ms to 6000ms = 1 second duration = 20 char/s
      const segment = createSegment('12345678901234567890', 5000, 6000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.actual).toBe(20);
    });

    it('should handle fractional char/s values', () => {
      // 10 characters in 3 seconds = 3.333... char/s
      const segment = createSegment('1234567890', 0, 3000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.actual).toBeCloseTo(3.333, 2);
    });
  });

  describe('DoD: Segment 25 car/s → alerte critical', () => {
    it('should return critical alert for segment with 25 char/s speed', () => {
      // 25 characters in 1 second = exactly 25 char/s
      const segment = createSegment('1234567890123456789012345', 0, 1000);

      const result = checkSpeed(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(25);
      expect(result.max).toBe(20);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { checkDuration } from '../../rules/duration';
import type { Segment } from '../../types';

/**
 * Helper to create a test segment with specific duration
 */
function createSegment(startMs: number, endMs: number): Segment {
  return {
    sequenceNum: 1,
    startMs,
    endMs,
    text: 'Test segment',
  };
}

describe('checkDuration', () => {
  describe('no alert (duration >= 1000ms)', () => {
    it('should return no alert for duration exactly 1000ms', () => {
      const segment = createSegment(0, 1000);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.severity).toBeUndefined();
      expect(result.actual).toBe(1000);
      expect(result.min).toBe(1000);
    });

    it('should return no alert for duration > 1000ms', () => {
      const segment = createSegment(0, 2000);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.actual).toBe(2000);
    });

    it('should return no alert for long duration (5000ms)', () => {
      const segment = createSegment(1000, 6000);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.actual).toBe(5000);
    });
  });

  describe('warning severity (500ms <= duration < 1000ms)', () => {
    it('should return warning alert for duration 999ms', () => {
      const segment = createSegment(0, 999);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.actual).toBe(999);
      expect(result.min).toBe(1000);
    });

    it('should return warning alert for duration exactly 500ms', () => {
      const segment = createSegment(0, 500);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.actual).toBe(500);
    });

    it('should return warning alert for duration 800ms', () => {
      const segment = createSegment(0, 800);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.actual).toBe(800);
    });

    it('should return warning alert for duration 750ms', () => {
      const segment = createSegment(1000, 1750);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.actual).toBe(750);
    });
  });

  describe('critical severity (duration < 500ms)', () => {
    it('should return critical alert for duration 499ms', () => {
      const segment = createSegment(0, 499);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(499);
      expect(result.min).toBe(1000);
    });

    it('should return critical alert for duration 250ms', () => {
      const segment = createSegment(0, 250);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(250);
    });

    it('should return critical alert for duration 100ms', () => {
      const segment = createSegment(5000, 5100);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(100);
    });

    it('should return critical alert for very short duration (1ms)', () => {
      const segment = createSegment(0, 1);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle zero duration', () => {
      const segment = createSegment(1000, 1000);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.actual).toBe(0);
    });

    it('should calculate duration correctly for non-zero start', () => {
      const segment = createSegment(5000, 5800);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.actual).toBe(800);
    });

    it('should handle large timecodes', () => {
      const segment = createSegment(3600000, 3601500);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.actual).toBe(1500);
    });
  });

  describe('DoD: Segment 800ms -> alerte warning', () => {
    it('should return warning alert for segment with 800ms duration', () => {
      const segment = createSegment(0, 800);

      const result = checkDuration(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.actual).toBe(800);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { checkOverlap } from '../../rules/overlap';
import type { Segment } from '../../types';

/**
 * Helper to create a test segment
 */
function createSegment(startMs: number, endMs: number): Segment {
  return {
    sequenceNum: 1,
    startMs,
    endMs,
    text: 'Test segment',
  };
}

describe('checkOverlap', () => {
  describe('no overlap (segments do not overlap)', () => {
    it('should return no alert when segments have a gap between them', () => {
      const segmentA = createSegment(0, 1000);
      const segmentB = createSegment(1500, 2500);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(false);
      expect(result.overlapMs).toBe(0);
      expect(result.severity).toBeUndefined();
    });

    it('should return no alert when segments are exactly consecutive (touching)', () => {
      const segmentA = createSegment(0, 1000);
      const segmentB = createSegment(1000, 2000);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(false);
      expect(result.overlapMs).toBe(0);
    });

    it('should return no alert when segmentB starts after segmentA ends', () => {
      const segmentA = createSegment(0, 1000);
      const segmentB = createSegment(1001, 2000);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(false);
      expect(result.overlapMs).toBe(0);
    });
  });

  describe('warning severity (overlap <= 500ms)', () => {
    it('should return warning alert for 1ms overlap', () => {
      const segmentA = createSegment(0, 1001);
      const segmentB = createSegment(1000, 2000);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.overlapMs).toBe(1);
    });

    it('should return warning alert for 200ms overlap', () => {
      const segmentA = createSegment(0, 1200);
      const segmentB = createSegment(1000, 2000);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.overlapMs).toBe(200);
    });

    it('should return warning alert for exactly 500ms overlap', () => {
      const segmentA = createSegment(0, 1500);
      const segmentB = createSegment(1000, 2000);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.overlapMs).toBe(500);
    });
  });

  describe('critical severity (overlap > 500ms)', () => {
    it('should return critical alert for 501ms overlap', () => {
      const segmentA = createSegment(0, 1501);
      const segmentB = createSegment(1000, 2000);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.overlapMs).toBe(501);
    });

    it('should return critical alert for 1000ms overlap', () => {
      const segmentA = createSegment(0, 2000);
      const segmentB = createSegment(1000, 2500);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.overlapMs).toBe(1000);
    });

    it('should return critical alert for large overlap (segmentA contains segmentB start)', () => {
      const segmentA = createSegment(0, 5000);
      const segmentB = createSegment(2000, 6000);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.overlapMs).toBe(3000);
    });
  });

  describe('edge cases', () => {
    it('should handle segments starting at 0', () => {
      const segmentA = createSegment(0, 100);
      const segmentB = createSegment(50, 150);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(true);
      expect(result.overlapMs).toBe(50);
    });

    it('should return correct overlap for segments with same start time', () => {
      const segmentA = createSegment(1000, 2000);
      const segmentB = createSegment(1000, 3000);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.overlapMs).toBe(1000);
    });

    it('should handle very short segments with overlap', () => {
      const segmentA = createSegment(100, 110);
      const segmentB = createSegment(105, 115);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.overlapMs).toBe(5);
    });
  });

  describe('DoD: Overlap 200ms detected with severity warning', () => {
    it('should detect 200ms overlap with warning severity', () => {
      // Segment A: 0 - 1200ms
      // Segment B: 1000 - 2000ms
      // Overlap: 1200 - 1000 = 200ms
      const segmentA = createSegment(0, 1200);
      const segmentB = createSegment(1000, 2000);

      const result = checkOverlap(segmentA, segmentB);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.overlapMs).toBe(200);
    });
  });
});

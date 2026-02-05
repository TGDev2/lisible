import { describe, it, expect } from 'vitest';
import { checkLength } from '../../rules/length';
import type { Segment } from '../../types';

/**
 * Helper to create a test segment
 */
function createSegment(text: string): Segment {
  return {
    sequenceNum: 1,
    startMs: 0,
    endMs: 1000,
    text,
  };
}

describe('checkLength', () => {
  describe('character count alerts (> 84 characters)', () => {
    it('should return warning alert for text > 84 characters on single line', () => {
      // 90 characters on one line
      const segment = createSegment('A'.repeat(90));

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.charCount.actual).toBe(90);
      expect(result.charCount.max).toBe(84);
      expect(result.charCount.exceeded).toBe(true);
      expect(result.lineCount.exceeded).toBe(false);
    });

    it('should return warning alert for exactly 85 characters', () => {
      const segment = createSegment('A'.repeat(85));

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.charCount.actual).toBe(85);
      expect(result.charCount.exceeded).toBe(true);
    });

    it('should return no alert for exactly 84 characters', () => {
      const segment = createSegment('A'.repeat(84));

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.charCount.actual).toBe(84);
      expect(result.charCount.exceeded).toBe(false);
    });
  });

  describe('line count alerts (> 2 lines)', () => {
    it('should return warning alert for 3 lines', () => {
      const segment = createSegment('Line 1\nLine 2\nLine 3');

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.lineCount.actual).toBe(3);
      expect(result.lineCount.max).toBe(2);
      expect(result.lineCount.exceeded).toBe(true);
      expect(result.charCount.exceeded).toBe(false);
    });

    it('should return warning alert for 4 lines', () => {
      const segment = createSegment('Line 1\nLine 2\nLine 3\nLine 4');

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.lineCount.actual).toBe(4);
      expect(result.lineCount.exceeded).toBe(true);
    });

    it('should return no alert for exactly 2 lines', () => {
      const segment = createSegment('Line 1\nLine 2');

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.lineCount.actual).toBe(2);
      expect(result.lineCount.exceeded).toBe(false);
    });

    it('should count empty lines as lines', () => {
      // 3 lines: "Line 1", "", "Line 3"
      const segment = createSegment('Line 1\n\nLine 3');

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.lineCount.actual).toBe(3);
      expect(result.lineCount.exceeded).toBe(true);
    });
  });

  describe('combined alerts (both thresholds exceeded)', () => {
    it('should return critical alert when both char and line thresholds exceeded', () => {
      // 90 characters spread across 3 lines
      const segment = createSegment('A'.repeat(30) + '\n' + 'B'.repeat(30) + '\n' + 'C'.repeat(28));

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.charCount.actual).toBe(90); // 30 + 30 + 28 + 2 newlines = 90
      expect(result.charCount.exceeded).toBe(true);
      expect(result.lineCount.actual).toBe(3);
      expect(result.lineCount.exceeded).toBe(true);
    });

    it('should return critical alert for many lines with many characters', () => {
      const segment = createSegment('A'.repeat(50) + '\n' + 'B'.repeat(50) + '\n' + 'C'.repeat(50));

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.charCount.exceeded).toBe(true);
      expect(result.lineCount.exceeded).toBe(true);
    });
  });

  describe('no alerts (within thresholds)', () => {
    it('should return no alert for short single line text', () => {
      const segment = createSegment('Hello World');

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.severity).toBeUndefined();
      expect(result.charCount.actual).toBe(11);
      expect(result.charCount.exceeded).toBe(false);
      expect(result.lineCount.actual).toBe(1);
      expect(result.lineCount.exceeded).toBe(false);
    });

    it('should return no alert for 2 lines within character limit', () => {
      const segment = createSegment('First line here\nSecond line here');

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.lineCount.actual).toBe(2);
    });

    it('should return no alert for exactly 84 chars on 2 lines', () => {
      // 84 characters total: 41 + 1 newline + 42 = 84
      const segment = createSegment('A'.repeat(41) + '\n' + 'B'.repeat(42));

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.charCount.actual).toBe(84);
      expect(result.lineCount.actual).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty text', () => {
      const segment = createSegment('');

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.charCount.actual).toBe(0);
      expect(result.lineCount.actual).toBe(1); // split('') returns ['']
    });

    it('should handle single newline (2 empty lines)', () => {
      const segment = createSegment('\n');

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.charCount.actual).toBe(1);
      expect(result.lineCount.actual).toBe(2);
    });

    it('should handle multiple newlines creating many empty lines', () => {
      const segment = createSegment('\n\n\n');

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.lineCount.actual).toBe(4);
      expect(result.lineCount.exceeded).toBe(true);
    });

    it('should count newline characters in total character count', () => {
      // "A\nB" = 3 characters (A, newline, B)
      const segment = createSegment('A\nB');

      const result = checkLength(segment);

      expect(result.charCount.actual).toBe(3);
    });

    it('should handle whitespace-only text', () => {
      const segment = createSegment('     ');

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(false);
      expect(result.charCount.actual).toBe(5);
      expect(result.lineCount.actual).toBe(1);
    });

    it('should handle text with trailing newline', () => {
      const segment = createSegment('Line 1\n');

      const result = checkLength(segment);

      expect(result.lineCount.actual).toBe(2);
    });
  });

  describe('DoD: Segment 90 caractères → alerte retournée', () => {
    it('should return alert for segment with 90 characters', () => {
      const segment = createSegment('A'.repeat(90));

      const result = checkLength(segment);

      expect(result.hasAlert).toBe(true);
      expect(result.charCount.actual).toBe(90);
      expect(result.charCount.exceeded).toBe(true);
    });
  });
});

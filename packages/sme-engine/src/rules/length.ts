import type { Segment, LengthCheckResult } from '../types';

/**
 * Maximum length thresholds for segments
 */
const MAX_CHARACTERS = 84;
const MAX_LINES = 2;

/**
 * Checks the length of a subtitle segment.
 *
 * A segment triggers an alert if:
 * - Character count > 84 characters
 * - Line count > 2 lines
 *
 * Lines are counted by splitting on '\n'.
 * Empty lines are counted as lines.
 *
 * Severity:
 * - critical: both thresholds exceeded
 * - warning: one threshold exceeded
 *
 * @param segment - The segment to check
 * @returns LengthCheckResult with alert status and length details
 */
export function checkLength(segment: Segment): LengthCheckResult {
  const charCount = segment.text.length;
  const lineCount = segment.text.split('\n').length;

  const charExceeded = charCount > MAX_CHARACTERS;
  const lineExceeded = lineCount > MAX_LINES;

  const hasAlert = charExceeded || lineExceeded;

  let severity: LengthCheckResult['severity'];
  if (hasAlert) {
    severity = charExceeded && lineExceeded ? 'critical' : 'warning';
  }

  return {
    hasAlert,
    severity,
    charCount: {
      actual: charCount,
      max: MAX_CHARACTERS,
      exceeded: charExceeded,
    },
    lineCount: {
      actual: lineCount,
      max: MAX_LINES,
      exceeded: lineExceeded,
    },
  };
}

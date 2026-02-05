import type { Segment, SpeedCheckResult } from '../types';

/**
 * Maximum reading speed thresholds (characters per second)
 */
const SPEED_THRESHOLD_CRITICAL = 20;
const SPEED_THRESHOLD_WARNING = 18;

/**
 * Checks reading speed for a subtitle segment.
 *
 * Reading speed = (number of characters) / (duration in seconds)
 *
 * Thresholds:
 * - > 20 char/s → critical alert
 * - > 18 char/s → warning alert
 * - ≤ 18 char/s → no alert
 *
 * Note: Spaces are counted in the character count.
 *
 * @param segment - The segment to check
 * @returns SpeedCheckResult with alert status and speed values
 */
export function checkSpeed(segment: Segment): SpeedCheckResult {
  const durationMs = segment.endMs - segment.startMs;

  // Edge case: zero or negative duration
  if (durationMs <= 0) {
    return {
      hasAlert: true,
      severity: 'critical',
      actual: Infinity,
      max: SPEED_THRESHOLD_CRITICAL,
    };
  }

  const durationSeconds = durationMs / 1000;
  const charCount = segment.text.length;
  const speed = charCount / durationSeconds;

  if (speed > SPEED_THRESHOLD_CRITICAL) {
    return {
      hasAlert: true,
      severity: 'critical',
      actual: speed,
      max: SPEED_THRESHOLD_CRITICAL,
    };
  }

  if (speed > SPEED_THRESHOLD_WARNING) {
    return {
      hasAlert: true,
      severity: 'warning',
      actual: speed,
      max: SPEED_THRESHOLD_CRITICAL,
    };
  }

  return {
    hasAlert: false,
    actual: speed,
    max: SPEED_THRESHOLD_CRITICAL,
  };
}

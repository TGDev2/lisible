import type { Segment, DurationCheckResult } from '../types';

/**
 * Minimum duration thresholds in milliseconds
 */
const MIN_DURATION_WARNING = 1000;
const MIN_DURATION_CRITICAL = 500;

/**
 * Checks the display duration of a subtitle segment.
 *
 * A segment triggers an alert if its duration is too short:
 * - duration < 1000ms = warning
 * - duration < 500ms = critical
 *
 * Duration is calculated as: endMs - startMs
 *
 * @param segment - The segment to check
 * @returns DurationCheckResult with alert status and duration details
 */
export function checkDuration(segment: Segment): DurationCheckResult {
  const duration = segment.endMs - segment.startMs;

  // Duration >= 1000ms is acceptable
  if (duration >= MIN_DURATION_WARNING) {
    return {
      hasAlert: false,
      actual: duration,
      min: MIN_DURATION_WARNING,
    };
  }

  // Duration < 500ms is critical
  if (duration < MIN_DURATION_CRITICAL) {
    return {
      hasAlert: true,
      severity: 'critical',
      actual: duration,
      min: MIN_DURATION_WARNING,
    };
  }

  // Duration >= 500ms and < 1000ms is warning
  return {
    hasAlert: true,
    severity: 'warning',
    actual: duration,
    min: MIN_DURATION_WARNING,
  };
}

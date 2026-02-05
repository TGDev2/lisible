import type { Segment, OverlapCheckResult } from '../types';

/**
 * Threshold for critical severity (in milliseconds)
 */
const OVERLAP_THRESHOLD_CRITICAL = 500;

/**
 * Checks for timecode overlap between two consecutive segments.
 *
 * Overlap is detected when segment A ends after segment B starts:
 * overlap = segmentA.endMs - segmentB.startMs
 *
 * If overlap > 0, an alert is triggered.
 *
 * Severity:
 * - critical: overlap > 500ms
 * - warning: overlap > 0ms and <= 500ms
 *
 * Note: Segments should be sorted by startMs before analysis.
 * This function assumes segmentA comes before segmentB in sequence.
 *
 * @param segmentA - The first segment (comes before segmentB)
 * @param segmentB - The second segment (comes after segmentA)
 * @returns OverlapCheckResult with alert status and overlap duration
 */
export function checkOverlap(segmentA: Segment, segmentB: Segment): OverlapCheckResult {
  const overlapMs = segmentA.endMs - segmentB.startMs;

  // No overlap if segmentA ends before or exactly when segmentB starts
  if (overlapMs <= 0) {
    return {
      hasAlert: false,
      overlapMs: 0,
    };
  }

  // Overlap detected - determine severity
  const severity = overlapMs > OVERLAP_THRESHOLD_CRITICAL ? 'critical' : 'warning';

  return {
    hasAlert: true,
    severity,
    overlapMs,
  };
}

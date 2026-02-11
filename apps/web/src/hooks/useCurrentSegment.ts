import { useMemo } from "react";
import type { SegmentWithAlerts } from "@/stores/useSegmentsStore";

/**
 * Hook to find the current segment based on video playback time.
 *
 * Synchronizes subtitle display with video currentTime.
 *
 * @param currentTimeSeconds - Current video time in seconds
 * @param segments - Array of segments with timecodes in milliseconds
 * @returns The segment that should be displayed at the current time, or null if none
 */
export function useCurrentSegment(
  currentTimeSeconds: number,
  segments: SegmentWithAlerts[]
): SegmentWithAlerts | null {
  return useMemo(() => {
    if (!segments || segments.length === 0) {
      return null;
    }

    // Convert currentTime from seconds to milliseconds
    const currentTimeMs = currentTimeSeconds * 1000;

    // Find the segment where currentTime is between startMs and endMs
    // Edge case: if no segment matches this timecode, return null (no display)
    for (const segment of segments) {
      if (currentTimeMs >= segment.startMs && currentTimeMs < segment.endMs) {
        return segment;
      }
    }

    return null;
  }, [currentTimeSeconds, segments]);
}

export default useCurrentSegment;

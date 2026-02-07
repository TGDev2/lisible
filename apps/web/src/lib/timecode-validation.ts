/**
 * Timecode validation utilities
 * Validates constraints for segment timecodes
 */

export interface TimecodeValidationResult {
  valid: boolean;
  errors: TimecodeValidationError[];
  warnings: TimecodeValidationWarning[];
}

export interface TimecodeValidationError {
  code: "out_before_in" | "invalid_timecode" | "negative_duration";
  message: string;
}

export interface TimecodeValidationWarning {
  code: "overlap_previous" | "overlap_next";
  message: string;
  overlapMs: number;
}

export interface SegmentTimecode {
  id: string;
  startMs: number;
  endMs: number;
  sequenceNum: number;
}

/**
 * Validate that endMs > startMs
 */
export function validateTimecodeOrder(startMs: number, endMs: number): TimecodeValidationError | null {
  if (endMs <= startMs) {
    return {
      code: "out_before_in",
      message: `Le timecode de fin (${formatMs(endMs)}) doit être postérieur au timecode de début (${formatMs(startMs)})`,
    };
  }
  return null;
}

/**
 * Check for overlap with adjacent segments
 */
export function checkOverlapWithAdjacent(
  segmentId: string,
  startMs: number,
  endMs: number,
  allSegments: SegmentTimecode[]
): TimecodeValidationWarning[] {
  const warnings: TimecodeValidationWarning[] = [];

  // Sort segments by sequenceNum
  const sortedSegments = [...allSegments].sort((a, b) => a.sequenceNum - b.sequenceNum);

  // Find the current segment index
  const currentIndex = sortedSegments.findIndex((s) => s.id === segmentId);
  if (currentIndex === -1) {
    return warnings;
  }

  // Check overlap with previous segment
  if (currentIndex > 0) {
    const prevSegment = sortedSegments[currentIndex - 1];
    if (prevSegment && prevSegment.endMs > startMs) {
      const overlapMs = prevSegment.endMs - startMs;
      warnings.push({
        code: "overlap_previous",
        message: `Chevauchement de ${overlapMs}ms avec le segment précédent (#${prevSegment.sequenceNum})`,
        overlapMs,
      });
    }
  }

  // Check overlap with next segment
  if (currentIndex < sortedSegments.length - 1) {
    const nextSegment = sortedSegments[currentIndex + 1];
    if (nextSegment && endMs > nextSegment.startMs) {
      const overlapMs = endMs - nextSegment.startMs;
      warnings.push({
        code: "overlap_next",
        message: `Chevauchement de ${overlapMs}ms avec le segment suivant (#${nextSegment.sequenceNum})`,
        overlapMs,
      });
    }
  }

  return warnings;
}

/**
 * Full validation of timecode changes
 */
export function validateTimecodeChange(
  segmentId: string,
  startMs: number,
  endMs: number,
  allSegments: SegmentTimecode[]
): TimecodeValidationResult {
  const errors: TimecodeValidationError[] = [];
  const warnings: TimecodeValidationWarning[] = [];

  // Validate order
  const orderError = validateTimecodeOrder(startMs, endMs);
  if (orderError) {
    errors.push(orderError);
  }

  // Check negative values
  if (startMs < 0 || endMs < 0) {
    errors.push({
      code: "negative_duration",
      message: "Les timecodes ne peuvent pas être négatifs",
    });
  }

  // Check overlap with adjacent segments
  const overlapWarnings = checkOverlapWithAdjacent(segmentId, startMs, endMs, allSegments);
  warnings.push(...overlapWarnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format milliseconds for display in error messages
 */
function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")},${milliseconds.toString().padStart(3, "0")}`;
}

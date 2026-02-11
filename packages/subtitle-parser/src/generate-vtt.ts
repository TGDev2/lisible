/**
 * VTT file generation from segments
 */

import type { Segment } from './types';
import { formatVttTimecode } from './timecode';

/**
 * Generate VTT content from segments
 *
 * Output format:
 * - WEBVTT header
 * - Timecodes in HH:MM:SS.mmm format (with period, not comma)
 * - UTF-8 encoding (no BOM required for VTT)
 * - LF line endings (VTT standard)
 *
 * @param segments - Array of subtitle segments
 * @returns VTT file content as string
 */
export function generateVTT(segments: Segment[]): string {
  // VTT always starts with WEBVTT header
  if (segments.length === 0) {
    return 'WEBVTT\n';
  }

  // Sort segments by start time to ensure proper ordering
  const sortedSegments = [...segments].sort((a, b) => a.startMs - b.startMs);

  const vttCues = sortedSegments.map((segment) => {
    // Timecode format HH:MM:SS.mmm (VTT uses period, not comma)
    const startTimecode = formatVttTimecode(segment.startMs);
    const endTimecode = formatVttTimecode(segment.endMs);

    // Build the VTT cue (no sequence number required in VTT)
    return `${startTimecode} --> ${endTimecode}\n${segment.text}`;
  });

  // WEBVTT header + blank line + cues with blank lines between them
  return 'WEBVTT\n\n' + vttCues.join('\n\n') + '\n';
}

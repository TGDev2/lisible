/**
 * SRT file generation from segments
 */

import type { Segment } from './types';
import { formatSrtTimecode } from './timecode';

/**
 * UTF-8 BOM (Byte Order Mark)
 * Required for proper encoding detection in many media players
 */
export const UTF8_BOM = '\ufeff';

/**
 * Generate SRT content from segments
 *
 * Output format:
 * - UTF-8 BOM header
 * - Sequential numbering (1-indexed)
 * - Timecodes in HH:MM:SS,mmm format
 * - CRLF line endings for maximum compatibility
 *
 * @param segments - Array of subtitle segments
 * @returns SRT file content as string with UTF-8 BOM
 */
export function generateSRT(segments: Segment[]): string {
  if (segments.length === 0) {
    return UTF8_BOM;
  }

  // Sort segments by start time to ensure proper ordering
  const sortedSegments = [...segments].sort((a, b) => a.startMs - b.startMs);

  const srtBlocks = sortedSegments.map((segment, index) => {
    // Sequential numbering (1-indexed)
    const sequenceNumber = index + 1;

    // Timecode format HH:MM:SS,mmm
    const startTimecode = formatSrtTimecode(segment.startMs);
    const endTimecode = formatSrtTimecode(segment.endMs);

    // Build the SRT block
    return [
      sequenceNumber.toString(),
      `${startTimecode} --> ${endTimecode}`,
      segment.text,
    ].join('\r\n');
  });

  // UTF-8 BOM header + content with double line breaks between blocks
  return UTF8_BOM + srtBlocks.join('\r\n\r\n') + '\r\n';
}

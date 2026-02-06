import { formatSrtTimecode } from '@sme-studio/subtitle-parser';
import type { STTSegment } from '@sme-studio/stt';

/**
 * Generate SRT content from STT segments
 * @param segments - Array of STT segments
 * @returns SRT file content as string
 */
export function generateSRT(segments: STTSegment[]): string {
  const lines: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) continue;

    // Sequence number (1-indexed)
    lines.push(String(i + 1));

    // Timecode line: start --> end
    const startTC = formatSrtTimecode(segment.startMs);
    const endTC = formatSrtTimecode(segment.endMs);
    lines.push(`${startTC} --> ${endTC}`);

    // Text content - prepend speaker if present
    let text = segment.text.trim();
    if (segment.speaker) {
      text = `[${segment.speaker}] ${text}`;
    }
    lines.push(text);

    // Empty line between segments
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate the S3 key for the SRT file based on the original video key
 * @param originalStorageKey - Original file storage key
 * @returns SRT storage key
 */
export function generateSrtStorageKey(originalStorageKey: string): string {
  // Replace the extension with .srt
  // e.g., "users/uuid/files/uuid/video.mp4" -> "users/uuid/files/uuid/video.srt"
  const lastDotIndex = originalStorageKey.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return `${originalStorageKey}.srt`;
  }
  return `${originalStorageKey.substring(0, lastDotIndex)}.srt`;
}

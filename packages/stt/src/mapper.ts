/**
 * Segment Mapper
 * Utilities to map STT results to internal Segment format
 */

import type { STTSegment, STTResult } from './types';

/**
 * Internal segment format (compatible with @sme-studio/subtitle-parser)
 */
export interface Segment {
  /** Sequence number (1-indexed) */
  sequenceNum: number;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Text content of the segment */
  text: string;
  /** Speaker identifier (e.g., "[FORMATEUR]", "[NARRATEUR]") */
  speaker?: string;
  /** Whether this is a sound info segment */
  isSoundInfo?: boolean;
}

/**
 * Map STT segments to internal Segment format
 * @param sttSegments - Segments from STT provider
 * @returns Segments in internal format
 */
export function mapToSegments(sttSegments: STTSegment[]): Segment[] {
  return sttSegments.map((segment, index) => ({
    sequenceNum: index + 1,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    speaker: segment.speaker,
    isSoundInfo: false,
  }));
}

/**
 * Map full STT result to internal Segment format
 * @param result - Full STT result
 * @returns Segments in internal format
 */
export function mapResultToSegments(result: STTResult): Segment[] {
  return mapToSegments(result.segments);
}

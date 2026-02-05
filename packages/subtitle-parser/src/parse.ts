import { ParseResult, ParseOptions, ParseError } from './types';
import { parseSRT } from './parse-srt';
import { parseVTT } from './parse-vtt';

/**
 * Detect subtitle format from content
 *
 * @param content - File content as string
 * @returns Detected format or null if unknown
 */
export function detectFormat(content: string): 'srt' | 'vtt' | null {
  // Normalize and get first meaningful line
  let normalized = content;

  // Remove BOM
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }

  // Normalize line endings
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Get first non-empty line
  const lines = normalized.split('\n');
  let firstLine = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed !== '') {
      firstLine = trimmed;
      break;
    }
  }

  // VTT always starts with WEBVTT
  if (firstLine.startsWith('WEBVTT')) {
    return 'vtt';
  }

  // SRT starts with a number (sequence number)
  if (/^\d+$/.test(firstLine)) {
    return 'srt';
  }

  // Additional heuristics: look for timecode patterns
  for (const line of lines.slice(0, 10)) {
    const trimmed = line.trim();

    // VTT timecode uses periods for milliseconds: 00:00:01.000 --> 00:00:02.000
    if (/\d{2}:\d{2}[:.]\d{3}\s*-->\s*\d{2}:\d{2}[:.]\d{3}/.test(trimmed)) {
      // Check if it uses comma (SRT) or period (VTT)
      if (trimmed.includes(',')) {
        return 'srt';
      }
      return 'vtt';
    }
  }

  return null;
}

/**
 * Parse subtitle content with auto format detection
 *
 * @param content - Subtitle file content as string
 * @param options - Parsing options
 * @returns ParseResult with format, segments, and errors
 */
export function parseSubtitle(
  content: string,
  options: ParseOptions = {}
): ParseResult {
  const format = detectFormat(content);

  if (format === null) {
    return {
      format: 'srt', // Default assumption
      segments: [],
      errors: [
        {
          line: 1,
          message: 'Unable to detect subtitle format. Expected SRT or VTT.',
        },
      ],
    };
  }

  if (format === 'vtt') {
    const { segments, errors } = parseVTT(content, options);
    return { format: 'vtt', segments, errors };
  }

  const { segments, errors } = parseSRT(content, options);
  return { format: 'srt', segments, errors };
}

/**
 * Parse subtitle content by explicit format
 *
 * @param content - Subtitle file content as string
 * @param format - Explicit format to use
 * @param options - Parsing options
 * @returns ParseResult
 */
export function parseByFormat(
  content: string,
  format: 'srt' | 'vtt',
  options: ParseOptions = {}
): ParseResult {
  if (format === 'vtt') {
    const { segments, errors } = parseVTT(content, options);
    return { format: 'vtt', segments, errors };
  }

  const { segments, errors } = parseSRT(content, options);
  return { format: 'srt', segments, errors };
}

/**
 * Validate that content can be parsed as a valid subtitle file
 *
 * @param content - Subtitle file content
 * @returns Object with isValid flag and any errors
 */
export function validateSubtitle(content: string): {
  isValid: boolean;
  format: 'srt' | 'vtt' | null;
  errors: ParseError[];
} {
  const format = detectFormat(content);

  if (format === null) {
    return {
      isValid: false,
      format: null,
      errors: [
        {
          line: 1,
          message: 'Unable to detect subtitle format',
        },
      ],
    };
  }

  const result = parseSubtitle(content, { lenient: false });

  return {
    isValid: result.errors.length === 0 && result.segments.length > 0,
    format: result.format,
    errors: result.errors,
  };
}

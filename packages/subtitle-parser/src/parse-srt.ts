import { Segment, ParseError, ParseOptions } from './types';
import { parseSrtTimecode } from './timecode';

/**
 * Parse SRT subtitle content into segments
 *
 * SRT format:
 * ```
 * 1
 * 00:00:01,000 --> 00:00:04,000
 * First subtitle line
 * Second line (optional)
 *
 * 2
 * 00:00:05,000 --> 00:00:08,000
 * Next subtitle
 * ```
 *
 * @param content - SRT file content as string
 * @param options - Parsing options
 * @returns Array of parsed segments and any errors encountered
 */
export function parseSRT(
  content: string,
  options: ParseOptions = {}
): { segments: Segment[]; errors: ParseError[] } {
  const { lenient = true } = options;

  const segments: Segment[] = [];
  const errors: ParseError[] = [];

  // Normalize line endings and split into lines
  const normalizedContent = normalizeContent(content);
  const lines = normalizedContent.split('\n');

  let currentLineNum = 0;
  let sequenceCounter = 0;

  while (currentLineNum < lines.length) {
    const currentLine = lines[currentLineNum];
    // Skip empty lines
    if (currentLine === undefined || currentLine.trim() === '') {
      currentLineNum++;
      continue;
    }

    // Try to parse a segment starting at current line
    const result = parseSegment(lines, currentLineNum, sequenceCounter + 1, lenient);

    if (result.segment) {
      segments.push(result.segment);
      sequenceCounter++;
    }

    if (result.errors.length > 0) {
      errors.push(...result.errors);
    }

    currentLineNum = result.nextLine;
  }

  return { segments, errors };
}

/**
 * Normalize content by handling different encodings and line endings
 */
function normalizeContent(content: string): string {
  // Remove BOM if present
  let normalized = content;
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }

  // Normalize line endings (CRLF -> LF, CR -> LF)
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  return normalized;
}

interface SegmentParseResult {
  segment: Segment | null;
  errors: ParseError[];
  nextLine: number;
}

/**
 * Parse a single segment from the lines array
 */
function parseSegment(
  lines: string[],
  startLine: number,
  expectedSequence: number,
  lenient: boolean
): SegmentParseResult {
  const errors: ParseError[] = [];
  let lineIndex = startLine;

  // Skip any leading empty lines
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line !== undefined && line.trim() !== '') {
      break;
    }
    lineIndex++;
  }

  if (lineIndex >= lines.length) {
    return { segment: null, errors, nextLine: lineIndex };
  }

  // Line 1: Sequence number
  const sequenceLine = lines[lineIndex];
  if (sequenceLine === undefined) {
    return { segment: null, errors, nextLine: lineIndex };
  }

  const sequenceLineContent = sequenceLine.trim();
  const sequenceNum = parseInt(sequenceLineContent, 10);

  if (isNaN(sequenceNum)) {
    // Not a valid sequence number, could be malformed
    errors.push({
      line: lineIndex + 1,
      message: `Invalid sequence number: expected a number, got "${sequenceLineContent}"`,
      content: sequenceLineContent,
    });

    if (!lenient) {
      // Skip to next empty line
      return {
        segment: null,
        errors,
        nextLine: skipToNextSegment(lines, lineIndex),
      };
    }
  }

  lineIndex++;

  if (lineIndex >= lines.length) {
    errors.push({
      line: lineIndex,
      message: 'Unexpected end of file: expected timecode line',
    });
    return { segment: null, errors, nextLine: lineIndex };
  }

  // Line 2: Timecode (00:00:01,000 --> 00:00:04,000)
  const timecodeLine = lines[lineIndex];
  if (timecodeLine === undefined) {
    return { segment: null, errors, nextLine: lineIndex };
  }

  const timecodeLineContent = timecodeLine.trim();
  const timecodeMatch = timecodeLineContent.match(
    /^(.+?)\s*-->\s*(.+?)(?:\s|$)/
  );

  if (!timecodeMatch) {
    errors.push({
      line: lineIndex + 1,
      message: `Invalid timecode format: "${timecodeLineContent}"`,
      content: timecodeLineContent,
    });

    if (!lenient) {
      return {
        segment: null,
        errors,
        nextLine: skipToNextSegment(lines, lineIndex),
      };
    }

    // Try to skip to next segment
    return {
      segment: null,
      errors,
      nextLine: skipToNextSegment(lines, lineIndex),
    };
  }

  const startTimecode = timecodeMatch[1];
  const endTimecode = timecodeMatch[2];

  if (!startTimecode || !endTimecode) {
    errors.push({
      line: lineIndex + 1,
      message: `Invalid timecode format: "${timecodeLineContent}"`,
      content: timecodeLineContent,
    });
    return {
      segment: null,
      errors,
      nextLine: skipToNextSegment(lines, lineIndex),
    };
  }

  const startMs = parseSrtTimecode(startTimecode);
  const endMs = parseSrtTimecode(endTimecode);

  if (startMs === null) {
    errors.push({
      line: lineIndex + 1,
      message: `Invalid start timecode: "${startTimecode}"`,
      content: startTimecode,
    });

    if (!lenient) {
      return {
        segment: null,
        errors,
        nextLine: skipToNextSegment(lines, lineIndex),
      };
    }
  }

  if (endMs === null) {
    errors.push({
      line: lineIndex + 1,
      message: `Invalid end timecode: "${endTimecode}"`,
      content: endTimecode,
    });

    if (!lenient) {
      return {
        segment: null,
        errors,
        nextLine: skipToNextSegment(lines, lineIndex),
      };
    }
  }

  lineIndex++;

  // Lines 3+: Text content (until empty line or end of file)
  const textLines: string[] = [];

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line === undefined || line.trim() === '') {
      break;
    }
    textLines.push(line);
    lineIndex++;
  }

  if (textLines.length === 0) {
    errors.push({
      line: lineIndex,
      message: 'Missing text content for segment',
    });

    if (!lenient) {
      return {
        segment: null,
        errors,
        nextLine: lineIndex,
      };
    }
  }

  // Join text lines and extract speaker/sound info
  const rawText = textLines.join('\n');
  const { text, speaker, isSoundInfo } = extractMetadata(rawText);

  // Skip trailing empty lines
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line !== undefined && line.trim() !== '') {
      break;
    }
    lineIndex++;
  }

  // Only create segment if we have valid timecodes (in lenient mode, we accept partial data)
  if (startMs === null || endMs === null) {
    return {
      segment: null,
      errors,
      nextLine: lineIndex,
    };
  }

  const segment: Segment = {
    sequenceNum: !isNaN(sequenceNum) ? sequenceNum : expectedSequence,
    startMs,
    endMs,
    text,
    ...(speaker && { speaker }),
    ...(isSoundInfo && { isSoundInfo }),
  };

  return {
    segment,
    errors,
    nextLine: lineIndex,
  };
}

/**
 * Skip to the next segment (past the next empty line)
 */
function skipToNextSegment(lines: string[], currentLine: number): number {
  let lineIndex = currentLine;

  // Skip to next empty line
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line === undefined || line.trim() === '') {
      break;
    }
    lineIndex++;
  }

  // Skip empty lines
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line !== undefined && line.trim() !== '') {
      break;
    }
    lineIndex++;
  }

  return lineIndex;
}

/**
 * Extract speaker and sound info metadata from text
 */
function extractMetadata(text: string): {
  text: string;
  speaker?: string;
  isSoundInfo?: boolean;
} {
  let processedText = text;
  let speaker: string | undefined;
  let isSoundInfo = false;

  // Check for speaker pattern at the start: [SPEAKER] or (SPEAKER)
  const speakerMatch = processedText.match(/^\[([^\]]+)\][\s:]*/);
  if (speakerMatch) {
    const potentialSpeaker = speakerMatch[1];

    if (potentialSpeaker) {
      // Check if this is a sound info (common patterns)
      const soundInfoPatterns = [
        /^musique?$/i,
        /^applaudissements?$/i,
        /^rires?$/i,
        /^silence$/i,
        /^bruit/i,
        /^son/i,
        /^music$/i,
        /^applause$/i,
        /^laughter$/i,
      ];

      if (soundInfoPatterns.some((pattern) => pattern.test(potentialSpeaker))) {
        isSoundInfo = true;
      } else {
        speaker = `[${potentialSpeaker}]`;
      }

      processedText = processedText.slice(speakerMatch[0].length).trim();
    }
  }

  // Check if entire text is a sound info indicator
  const fullSoundInfoMatch = text.match(/^\[([^\]]+)\]$/);
  if (fullSoundInfoMatch) {
    const content = fullSoundInfoMatch[1];
    if (content) {
      const contentLower = content.toLowerCase();
      const soundKeywords = [
        'musique',
        'music',
        'applaudissements',
        'applause',
        'rires',
        'rire',
        'laughter',
        'silence',
        'bruit',
        'noise',
      ];

      if (soundKeywords.some((keyword) => contentLower.includes(keyword))) {
        isSoundInfo = true;
      }
    }
  }

  return {
    text: processedText || text,
    speaker,
    isSoundInfo: isSoundInfo || undefined,
  };
}

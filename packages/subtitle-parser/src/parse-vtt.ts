import { Segment, ParseError, ParseOptions } from './types';
import { parseVttTimecode } from './timecode';

/**
 * Parse WebVTT subtitle content into segments
 *
 * VTT format:
 * ```
 * WEBVTT
 *
 * 1
 * 00:00:01.000 --> 00:00:04.000
 * First subtitle line
 *
 * 2
 * 00:00:05.000 --> 00:00:08.000
 * Next subtitle
 * ```
 *
 * @param content - VTT file content as string
 * @param options - Parsing options
 * @returns Array of parsed segments and any errors encountered
 */
export function parseVTT(
  content: string,
  options: ParseOptions = {}
): { segments: Segment[]; errors: ParseError[] } {
  const { lenient = true } = options;

  const segments: Segment[] = [];
  const errors: ParseError[] = [];

  // Normalize content
  const normalizedContent = normalizeContent(content);
  const lines = normalizedContent.split('\n');

  // Check for WEBVTT header
  let lineIndex = 0;

  // Skip BOM and empty lines at the beginning
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line !== undefined && line.trim() !== '') {
      break;
    }
    lineIndex++;
  }

  if (lineIndex >= lines.length) {
    errors.push({
      line: 1,
      message: 'Empty file: expected WEBVTT header',
    });
    return { segments, errors };
  }

  // Check WEBVTT header
  const headerLine = lines[lineIndex];
  if (headerLine === undefined) {
    errors.push({
      line: lineIndex + 1,
      message: 'Invalid VTT file: missing WEBVTT header',
    });
    return { segments, errors };
  }

  const headerContent = headerLine.trim();
  if (!headerContent.startsWith('WEBVTT')) {
    errors.push({
      line: lineIndex + 1,
      message: `Invalid VTT file: expected "WEBVTT" header, got "${headerContent}"`,
      content: headerContent,
    });

    if (!lenient) {
      return { segments, errors };
    }
  }

  lineIndex++;

  // Skip any header metadata (lines before first empty line after WEBVTT)
  // VTT can have metadata after WEBVTT like "Kind: captions"
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line === undefined || line.trim() === '') {
      break;
    }
    lineIndex++;
  }

  let sequenceCounter = 0;

  while (lineIndex < lines.length) {
    const currentLine = lines[lineIndex];
    // Skip empty lines
    if (currentLine === undefined || currentLine.trim() === '') {
      lineIndex++;
      continue;
    }

    // Skip NOTE blocks (comments in VTT)
    if (currentLine.trim().startsWith('NOTE')) {
      lineIndex++;
      // Skip until empty line
      while (lineIndex < lines.length) {
        const line = lines[lineIndex];
        if (line === undefined || line.trim() === '') {
          break;
        }
        lineIndex++;
      }
      continue;
    }

    // Skip STYLE blocks
    if (currentLine.trim() === 'STYLE') {
      lineIndex++;
      while (lineIndex < lines.length) {
        const line = lines[lineIndex];
        if (line === undefined || line.trim() === '') {
          break;
        }
        lineIndex++;
      }
      continue;
    }

    // Skip REGION blocks
    if (currentLine.trim().startsWith('REGION')) {
      lineIndex++;
      while (lineIndex < lines.length) {
        const line = lines[lineIndex];
        if (line === undefined || line.trim() === '') {
          break;
        }
        lineIndex++;
      }
      continue;
    }

    // Try to parse a cue
    const result = parseCue(lines, lineIndex, sequenceCounter + 1, lenient);

    if (result.segment) {
      segments.push(result.segment);
      sequenceCounter++;
    }

    if (result.errors.length > 0) {
      errors.push(...result.errors);
    }

    lineIndex = result.nextLine;
  }

  return { segments, errors };
}

/**
 * Normalize content by handling different encodings and line endings
 */
function normalizeContent(content: string): string {
  let normalized = content;

  // Remove BOM if present
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }

  // Normalize line endings
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  return normalized;
}

interface CueParseResult {
  segment: Segment | null;
  errors: ParseError[];
  nextLine: number;
}

/**
 * Parse a single VTT cue from the lines array
 */
function parseCue(
  lines: string[],
  startLine: number,
  expectedSequence: number,
  lenient: boolean
): CueParseResult {
  const errors: ParseError[] = [];
  let lineIndex = startLine;

  // Skip empty lines
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

  // Check if this line is a cue identifier (optional) or timecode
  let cueId: string | undefined;
  const firstLine = lines[lineIndex];
  if (firstLine === undefined) {
    return { segment: null, errors, nextLine: lineIndex };
  }

  let currentLine = firstLine.trim();

  // If it doesn't contain -->, it's a cue identifier
  if (!currentLine.includes('-->')) {
    cueId = currentLine;
    lineIndex++;

    if (lineIndex >= lines.length) {
      errors.push({
        line: lineIndex,
        message: 'Unexpected end of file after cue identifier',
      });
      return { segment: null, errors, nextLine: lineIndex };
    }

    const nextLine = lines[lineIndex];
    if (nextLine === undefined) {
      return { segment: null, errors, nextLine: lineIndex };
    }
    currentLine = nextLine.trim();
  }

  // Now we expect a timecode line
  const timecodeMatch = currentLine.match(/^(.+?)\s*-->\s*(.+?)(?:\s|$)/);

  if (!timecodeMatch) {
    errors.push({
      line: lineIndex + 1,
      message: `Invalid timecode format: "${currentLine}"`,
      content: currentLine,
    });

    return {
      segment: null,
      errors,
      nextLine: skipToNextCue(lines, lineIndex),
    };
  }

  const startTimecode = timecodeMatch[1];
  const endTimecodeWithSettings = timecodeMatch[2];

  if (!startTimecode || !endTimecodeWithSettings) {
    errors.push({
      line: lineIndex + 1,
      message: `Invalid timecode format: "${currentLine}"`,
      content: currentLine,
    });
    return {
      segment: null,
      errors,
      nextLine: skipToNextCue(lines, lineIndex),
    };
  }

  // Extract end timecode (may have settings after it)
  const endTimecode = endTimecodeWithSettings.split(/\s/)[0];
  if (!endTimecode) {
    errors.push({
      line: lineIndex + 1,
      message: `Invalid end timecode: "${endTimecodeWithSettings}"`,
      content: endTimecodeWithSettings,
    });
    return {
      segment: null,
      errors,
      nextLine: skipToNextCue(lines, lineIndex),
    };
  }

  const startMs = parseVttTimecode(startTimecode);
  const endMs = parseVttTimecode(endTimecode);

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
        nextLine: skipToNextCue(lines, lineIndex),
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
        nextLine: skipToNextCue(lines, lineIndex),
      };
    }
  }

  lineIndex++;

  // Read cue text (until empty line or end of file)
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
      message: 'Missing text content for cue',
    });

    if (!lenient) {
      return {
        segment: null,
        errors,
        nextLine: lineIndex,
      };
    }
  }

  // Join text lines and strip VTT formatting tags
  const rawText = textLines.join('\n');
  const cleanText = stripVttFormatting(rawText);
  const { text, speaker, isSoundInfo } = extractMetadata(cleanText);

  // Skip trailing empty lines
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line !== undefined && line.trim() !== '') {
      break;
    }
    lineIndex++;
  }

  if (startMs === null || endMs === null) {
    return {
      segment: null,
      errors,
      nextLine: lineIndex,
    };
  }

  // Try to extract sequence number from cue ID if it's numeric
  let sequenceNum = expectedSequence;
  if (cueId) {
    const parsedId = parseInt(cueId, 10);
    if (!isNaN(parsedId)) {
      sequenceNum = parsedId;
    }
  }

  const segment: Segment = {
    sequenceNum,
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
 * Skip to the next cue (past the next empty line)
 */
function skipToNextCue(lines: string[], currentLine: number): number {
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
 * Strip VTT formatting tags like <b>, <i>, <c.classname>, etc.
 */
function stripVttFormatting(text: string): string {
  // Remove VTT voice tags <v Speaker>
  let cleaned = text.replace(/<v\s+[^>]*>/gi, '');

  // Remove class tags <c.classname>
  cleaned = cleaned.replace(/<c[^>]*>/gi, '');

  // Remove common HTML-like tags: <b>, </b>, <i>, </i>, <u>, </u>
  cleaned = cleaned.replace(/<\/?[biu]>/gi, '');

  // Remove ruby annotations <ruby>, <rt>
  cleaned = cleaned.replace(/<\/?ruby>/gi, '');
  cleaned = cleaned.replace(/<\/?rt>/gi, '');

  // Remove lang tags <lang>
  cleaned = cleaned.replace(/<\/?lang[^>]*>/gi, '');

  // Remove any remaining tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  return cleaned;
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
      // Check if this is a sound info
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

/**
 * @sme-studio/subtitle-parser
 *
 * Package for parsing SRT and VTT subtitle files into segments
 */

// Types
export type { Segment, ParseResult, ParseError, ParseOptions } from './types';

// Main parsing functions
export { parseSubtitle, parseByFormat, detectFormat, validateSubtitle } from './parse';

// Format-specific parsers
export { parseSRT } from './parse-srt';
export { parseVTT } from './parse-vtt';

// Timecode utilities
export {
  parseSrtTimecode,
  parseVttTimecode,
  formatSrtTimecode,
  formatVttTimecode,
} from './timecode';

// SRT generation
export { generateSRT, UTF8_BOM } from './generate-srt';

// VTT generation
export { generateVTT } from './generate-vtt';

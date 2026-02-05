/**
 * Represents a parsed subtitle segment
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
  /** Whether this is a sound info segment (e.g., [musique], [applaudissements]) */
  isSoundInfo?: boolean;
}

/**
 * Result of parsing a subtitle file
 */
export interface ParseResult {
  /** Detected format of the input file */
  format: 'srt' | 'vtt';
  /** Parsed segments */
  segments: Segment[];
  /** Parsing errors encountered (non-fatal) */
  errors: ParseError[];
}

/**
 * Error encountered during parsing
 */
export interface ParseError {
  /** Line number where the error occurred (1-indexed) */
  line: number;
  /** Error message */
  message: string;
  /** The problematic content */
  content?: string;
}

/**
 * Options for parsing subtitle files
 */
export interface ParseOptions {
  /**
   * Whether to attempt best-effort parsing on malformed content
   * @default true
   */
  lenient?: boolean;
}

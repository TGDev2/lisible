import type { Segment } from '@sme-studio/subtitle-parser';

/**
 * Severity levels for SME alerts
 */
export type AlertSeverity = 'critical' | 'warning' | 'info';

/**
 * Rule codes for SME analysis
 */
export type RuleCode = 'speed' | 'length' | 'overlap' | 'duration' | 'proper_noun';

/**
 * Result of a speed check on a segment
 */
export interface SpeedCheckResult {
  /** Whether an alert was triggered */
  hasAlert: boolean;
  /** Severity of the alert (only set if hasAlert is true) */
  severity?: AlertSeverity;
  /** Actual reading speed in characters per second */
  actual: number;
  /** Maximum allowed reading speed (threshold) */
  max: number;
}

/**
 * Result of a length check on a segment
 */
export interface LengthCheckResult {
  /** Whether an alert was triggered */
  hasAlert: boolean;
  /** Severity of the alert (only set if hasAlert is true) */
  severity?: AlertSeverity;
  /** Character count details */
  charCount: {
    actual: number;
    max: number;
    exceeded: boolean;
  };
  /** Line count details */
  lineCount: {
    actual: number;
    max: number;
    exceeded: boolean;
  };
}

/**
 * Result of an overlap check between two consecutive segments
 */
export interface OverlapCheckResult {
  /** Whether an overlap was detected (alert triggered) */
  hasAlert: boolean;
  /** Severity of the alert (only set if hasAlert is true) */
  severity?: AlertSeverity;
  /** Overlap duration in milliseconds (0 if no overlap) */
  overlapMs: number;
}

/**
 * Result of a duration check on a segment
 */
export interface DurationCheckResult {
  /** Whether an alert was triggered */
  hasAlert: boolean;
  /** Severity of the alert (only set if hasAlert is true) */
  severity?: AlertSeverity;
  /** Actual duration in milliseconds */
  actual: number;
  /** Minimum required duration in milliseconds */
  min: number;
}

/**
 * A detected proper noun in text
 */
export interface DetectedProperNoun {
  /** The word detected as a potential proper noun */
  word: string;
  /** Position (character index) in the text */
  position: number;
}

/**
 * Result of a proper noun check on a segment
 */
export interface ProperNounCheckResult {
  /** Whether an alert was triggered (proper nouns detected) */
  hasAlert: boolean;
  /** Severity of the alert (always 'info' for verification suggestions) */
  severity?: AlertSeverity;
  /** List of detected potential proper nouns */
  detectedNouns: DetectedProperNoun[];
}

/**
 * Re-export Segment type for convenience
 */
export type { Segment };

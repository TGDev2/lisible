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
 * Re-export Segment type for convenience
 */
export type { Segment };

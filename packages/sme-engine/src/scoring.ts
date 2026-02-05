import type {
  AlertInput,
  AlertSeverity,
  RuleCode,
  ScoreBreakdown,
  ScoreBreakdownByRule,
  ScoreResult,
} from './types';

/**
 * Penalty points per severity level
 */
const SEVERITY_PENALTIES: Record<AlertSeverity, number> = {
  critical: 10,
  warning: 5,
  info: 1,
};

/**
 * Base score before penalties
 */
const BASE_SCORE = 100;

/**
 * All rule codes for initializing breakdown
 */
const ALL_RULE_CODES: RuleCode[] = ['speed', 'length', 'overlap', 'duration', 'proper_noun'];

/**
 * Creates an empty breakdown structure
 */
function createEmptyBreakdown(): ScoreBreakdown {
  const byRule = {} as Record<RuleCode, ScoreBreakdownByRule>;
  for (const ruleCode of ALL_RULE_CODES) {
    byRule[ruleCode] = { count: 0, penalty: 0 };
  }

  return {
    totalAlerts: 0,
    bySeverity: {
      critical: 0,
      warning: 0,
      info: 0,
    },
    byRule,
    totalPenalty: 0,
  };
}

/**
 * Calculates the SME score from a list of alerts.
 *
 * Scoring rules:
 * - Base score: 100 (no alerts)
 * - Penalties by severity:
 *   - critical: -10 points
 *   - warning: -5 points
 *   - info: -1 point
 * - Minimum score: 0
 *
 * @param alerts - Array of alerts to calculate score from
 * @returns ScoreResult with final score and detailed breakdown
 *
 * @example
 * ```ts
 * const result = calculateScore([
 *   { ruleCode: 'speed', severity: 'critical' },
 *   { ruleCode: 'length', severity: 'warning' },
 * ]);
 * // result.score === 85 (100 - 10 - 5)
 * ```
 */
export function calculateScore(alerts: AlertInput[]): ScoreResult {
  const breakdown = createEmptyBreakdown();

  for (const alert of alerts) {
    const penalty = SEVERITY_PENALTIES[alert.severity];

    // Update totals
    breakdown.totalAlerts++;
    breakdown.totalPenalty += penalty;

    // Update severity counts
    breakdown.bySeverity[alert.severity]++;

    // Update rule breakdown
    breakdown.byRule[alert.ruleCode].count++;
    breakdown.byRule[alert.ruleCode].penalty += penalty;
  }

  // Calculate final score (clamped to minimum 0)
  const score = Math.max(0, BASE_SCORE - breakdown.totalPenalty);

  return {
    score,
    breakdown,
  };
}

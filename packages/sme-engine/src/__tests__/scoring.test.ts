import { describe, it, expect } from 'vitest';
import { calculateScore } from '../scoring';
import type { AlertInput } from '../types';

describe('calculateScore', () => {
  describe('AC: Score 100 = aucune alerte', () => {
    it('should return score 100 with no alerts', () => {
      const result = calculateScore([]);

      expect(result.score).toBe(100);
      expect(result.breakdown.totalAlerts).toBe(0);
      expect(result.breakdown.totalPenalty).toBe(0);
    });

    it('should have all zeros in breakdown when no alerts', () => {
      const result = calculateScore([]);

      expect(result.breakdown.bySeverity.critical).toBe(0);
      expect(result.breakdown.bySeverity.warning).toBe(0);
      expect(result.breakdown.bySeverity.info).toBe(0);
      expect(result.breakdown.byRule.speed.count).toBe(0);
      expect(result.breakdown.byRule.length.count).toBe(0);
      expect(result.breakdown.byRule.overlap.count).toBe(0);
      expect(result.breakdown.byRule.duration.count).toBe(0);
      expect(result.breakdown.byRule.proper_noun.count).toBe(0);
    });
  });

  describe('AC: Pénalités par severity (critical -10, warning -5, info -1)', () => {
    it('should deduct 10 points for critical alert', () => {
      const alerts: AlertInput[] = [
        { ruleCode: 'speed', severity: 'critical' },
      ];

      const result = calculateScore(alerts);

      expect(result.score).toBe(90);
      expect(result.breakdown.totalPenalty).toBe(10);
    });

    it('should deduct 5 points for warning alert', () => {
      const alerts: AlertInput[] = [
        { ruleCode: 'length', severity: 'warning' },
      ];

      const result = calculateScore(alerts);

      expect(result.score).toBe(95);
      expect(result.breakdown.totalPenalty).toBe(5);
    });

    it('should deduct 1 point for info alert', () => {
      const alerts: AlertInput[] = [
        { ruleCode: 'proper_noun', severity: 'info' },
      ];

      const result = calculateScore(alerts);

      expect(result.score).toBe(99);
      expect(result.breakdown.totalPenalty).toBe(1);
    });

    it('should accumulate penalties for multiple alerts', () => {
      const alerts: AlertInput[] = [
        { ruleCode: 'speed', severity: 'critical' },   // -10
        { ruleCode: 'length', severity: 'warning' },   // -5
        { ruleCode: 'proper_noun', severity: 'info' }, // -1
      ];

      const result = calculateScore(alerts);

      expect(result.score).toBe(84); // 100 - 10 - 5 - 1
      expect(result.breakdown.totalPenalty).toBe(16);
    });

    it('should handle multiple alerts of same severity', () => {
      const alerts: AlertInput[] = [
        { ruleCode: 'speed', severity: 'critical' },
        { ruleCode: 'overlap', severity: 'critical' },
        { ruleCode: 'duration', severity: 'critical' },
      ];

      const result = calculateScore(alerts);

      expect(result.score).toBe(70); // 100 - 30
      expect(result.breakdown.totalPenalty).toBe(30);
      expect(result.breakdown.bySeverity.critical).toBe(3);
    });
  });

  describe('AC: Score minimum = 0', () => {
    it('should clamp score to 0 when penalties exceed 100', () => {
      // 11 critical alerts = 110 penalty points
      const alerts: AlertInput[] = Array(11).fill(null).map(() => ({
        ruleCode: 'speed' as const,
        severity: 'critical' as const,
      }));

      const result = calculateScore(alerts);

      expect(result.score).toBe(0);
      expect(result.breakdown.totalPenalty).toBe(110);
    });

    it('should clamp score to 0 with exactly 100 penalty points', () => {
      // 10 critical alerts = 100 penalty points
      const alerts: AlertInput[] = Array(10).fill(null).map(() => ({
        ruleCode: 'speed' as const,
        severity: 'critical' as const,
      }));

      const result = calculateScore(alerts);

      expect(result.score).toBe(0);
      expect(result.breakdown.totalPenalty).toBe(100);
    });

    it('should never return negative score', () => {
      // 100 warnings = 500 penalty points
      const alerts: AlertInput[] = Array(100).fill(null).map(() => ({
        ruleCode: 'length' as const,
        severity: 'warning' as const,
      }));

      const result = calculateScore(alerts);

      expect(result.score).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AC: Breakdown par type règle', () => {
    it('should track alerts by rule type', () => {
      const alerts: AlertInput[] = [
        { ruleCode: 'speed', severity: 'critical' },
        { ruleCode: 'speed', severity: 'warning' },
        { ruleCode: 'length', severity: 'warning' },
        { ruleCode: 'overlap', severity: 'critical' },
        { ruleCode: 'duration', severity: 'warning' },
        { ruleCode: 'proper_noun', severity: 'info' },
        { ruleCode: 'proper_noun', severity: 'info' },
      ];

      const result = calculateScore(alerts);

      expect(result.breakdown.byRule.speed.count).toBe(2);
      expect(result.breakdown.byRule.speed.penalty).toBe(15); // 10 + 5
      expect(result.breakdown.byRule.length.count).toBe(1);
      expect(result.breakdown.byRule.length.penalty).toBe(5);
      expect(result.breakdown.byRule.overlap.count).toBe(1);
      expect(result.breakdown.byRule.overlap.penalty).toBe(10);
      expect(result.breakdown.byRule.duration.count).toBe(1);
      expect(result.breakdown.byRule.duration.penalty).toBe(5);
      expect(result.breakdown.byRule.proper_noun.count).toBe(2);
      expect(result.breakdown.byRule.proper_noun.penalty).toBe(2); // 1 + 1
    });

    it('should track alerts by severity', () => {
      const alerts: AlertInput[] = [
        { ruleCode: 'speed', severity: 'critical' },
        { ruleCode: 'length', severity: 'critical' },
        { ruleCode: 'overlap', severity: 'warning' },
        { ruleCode: 'duration', severity: 'warning' },
        { ruleCode: 'duration', severity: 'warning' },
        { ruleCode: 'proper_noun', severity: 'info' },
      ];

      const result = calculateScore(alerts);

      expect(result.breakdown.bySeverity.critical).toBe(2);
      expect(result.breakdown.bySeverity.warning).toBe(3);
      expect(result.breakdown.bySeverity.info).toBe(1);
    });

    it('should track total alerts correctly', () => {
      const alerts: AlertInput[] = [
        { ruleCode: 'speed', severity: 'critical' },
        { ruleCode: 'length', severity: 'warning' },
        { ruleCode: 'proper_noun', severity: 'info' },
      ];

      const result = calculateScore(alerts);

      expect(result.breakdown.totalAlerts).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle large number of alerts (1000 alerts)', () => {
      // Simulating a file with many errors
      const alerts: AlertInput[] = [];
      for (let i = 0; i < 500; i++) {
        alerts.push({ ruleCode: 'speed', severity: 'warning' }); // 500 * 5 = 2500
      }
      for (let i = 0; i < 500; i++) {
        alerts.push({ ruleCode: 'length', severity: 'info' }); // 500 * 1 = 500
      }

      const result = calculateScore(alerts);

      expect(result.score).toBe(0); // Clamped to 0
      expect(result.breakdown.totalAlerts).toBe(1000);
      expect(result.breakdown.totalPenalty).toBe(3000);
      expect(result.breakdown.byRule.speed.count).toBe(500);
      expect(result.breakdown.byRule.length.count).toBe(500);
    });

    it('should handle all rule types with all severities', () => {
      const alerts: AlertInput[] = [
        { ruleCode: 'speed', severity: 'critical' },
        { ruleCode: 'speed', severity: 'warning' },
        { ruleCode: 'speed', severity: 'info' },
        { ruleCode: 'length', severity: 'critical' },
        { ruleCode: 'length', severity: 'warning' },
        { ruleCode: 'length', severity: 'info' },
        { ruleCode: 'overlap', severity: 'critical' },
        { ruleCode: 'overlap', severity: 'warning' },
        { ruleCode: 'overlap', severity: 'info' },
        { ruleCode: 'duration', severity: 'critical' },
        { ruleCode: 'duration', severity: 'warning' },
        { ruleCode: 'duration', severity: 'info' },
        { ruleCode: 'proper_noun', severity: 'critical' },
        { ruleCode: 'proper_noun', severity: 'warning' },
        { ruleCode: 'proper_noun', severity: 'info' },
      ];

      const result = calculateScore(alerts);

      // 5 critical (50) + 5 warning (25) + 5 info (5) = 80 penalty
      expect(result.score).toBe(20);
      expect(result.breakdown.totalAlerts).toBe(15);
      expect(result.breakdown.totalPenalty).toBe(80);
    });

    it('should return integer score', () => {
      const alerts: AlertInput[] = [
        { ruleCode: 'speed', severity: 'info' },
      ];

      const result = calculateScore(alerts);

      expect(Number.isInteger(result.score)).toBe(true);
    });
  });

  describe('DoD: Fichier test avec erreurs connues → score attendu', () => {
    it('should calculate expected score for typical file with known errors', () => {
      // Simulating a file with:
      // - 2 critical speed alerts
      // - 3 warning length alerts
      // - 1 critical overlap alert
      // - 5 info proper noun alerts
      const alerts: AlertInput[] = [
        { ruleCode: 'speed', severity: 'critical' },
        { ruleCode: 'speed', severity: 'critical' },
        { ruleCode: 'length', severity: 'warning' },
        { ruleCode: 'length', severity: 'warning' },
        { ruleCode: 'length', severity: 'warning' },
        { ruleCode: 'overlap', severity: 'critical' },
        { ruleCode: 'proper_noun', severity: 'info' },
        { ruleCode: 'proper_noun', severity: 'info' },
        { ruleCode: 'proper_noun', severity: 'info' },
        { ruleCode: 'proper_noun', severity: 'info' },
        { ruleCode: 'proper_noun', severity: 'info' },
      ];

      const result = calculateScore(alerts);

      // Expected: 100 - (3*10) - (3*5) - (5*1) = 100 - 30 - 15 - 5 = 50
      expect(result.score).toBe(50);
      expect(result.breakdown.totalAlerts).toBe(11);
      expect(result.breakdown.bySeverity.critical).toBe(3);
      expect(result.breakdown.bySeverity.warning).toBe(3);
      expect(result.breakdown.bySeverity.info).toBe(5);
      expect(result.breakdown.byRule.speed.count).toBe(2);
      expect(result.breakdown.byRule.speed.penalty).toBe(20);
      expect(result.breakdown.byRule.length.count).toBe(3);
      expect(result.breakdown.byRule.length.penalty).toBe(15);
      expect(result.breakdown.byRule.overlap.count).toBe(1);
      expect(result.breakdown.byRule.overlap.penalty).toBe(10);
      expect(result.breakdown.byRule.proper_noun.count).toBe(5);
      expect(result.breakdown.byRule.proper_noun.penalty).toBe(5);
    });

    it('should calculate score 87 for file with minimal errors', () => {
      // 1 critical + 1 info = 11 penalty → score 89
      const alerts: AlertInput[] = [
        { ruleCode: 'overlap', severity: 'critical' },
        { ruleCode: 'proper_noun', severity: 'info' },
      ];

      const result = calculateScore(alerts);

      expect(result.score).toBe(89);
    });

    it('should calculate score 75 for moderately problematic file', () => {
      // 2 critical + 1 warning = 25 penalty → score 75
      const alerts: AlertInput[] = [
        { ruleCode: 'speed', severity: 'critical' },
        { ruleCode: 'duration', severity: 'critical' },
        { ruleCode: 'length', severity: 'warning' },
      ];

      const result = calculateScore(alerts);

      expect(result.score).toBe(75);
    });
  });
});

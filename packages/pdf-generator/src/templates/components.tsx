import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { styles, categoryColors } from './styles';
import {
  type AlertSeverity,
  type ScoreBreakdown,
  type FileMetadata,
  type AlertData,
  type RuleCode,
  RULE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  getScoreColor,
  getScoreLabel,
} from '../types';

/**
 * Watermark overlay for free plan users
 */
export function Watermark(): React.ReactElement {
  return (
    <View style={styles.watermark} fixed>
      <Text>APERÇU</Text>
    </View>
  );
}

/**
 * Page footer with page numbers
 */
export function Footer({ generatedAt }: { generatedAt: Date }): React.ReactElement {
  return (
    <View style={styles.footer} fixed>
      <Text>Généré par SME Studio - {formatDate(generatedAt)}</Text>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

/**
 * Score gauge visualization
 */
export function ScoreGauge({ score }: { score: number }): React.ReactElement {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);

  return (
    <View style={styles.scoreContainer}>
      <View>
        <View
          style={[
            styles.scoreCircle,
            { borderColor: color },
          ]}
        >
          <Text style={[styles.scoreValue, { color }]}>{score}</Text>
        </View>
        <Text style={[styles.scoreLabel, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

/**
 * Linear gauge bar for score
 */
export function ScoreBar({ score }: { score: number }): React.ReactElement {
  const color = getScoreColor(score);

  return (
    <View style={styles.gaugeContainer}>
      <View style={styles.gaugeBackground}>
        <View
          style={[
            styles.gaugeFill,
            {
              width: `${score}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <View style={styles.gaugeLabels}>
        <Text>0</Text>
        <Text>50</Text>
        <Text>100</Text>
      </View>
    </View>
  );
}

/**
 * File metadata display
 */
export function MetadataSection({ file }: { file: FileMetadata }): React.ReactElement {
  return (
    <View style={styles.metadataContainer}>
      <View style={styles.metadataRow}>
        <Text style={styles.metadataLabel}>Nom du fichier :</Text>
        <Text style={styles.metadataValue}>{file.originalName}</Text>
      </View>
      <View style={styles.metadataRow}>
        <Text style={styles.metadataLabel}>Type :</Text>
        <Text style={styles.metadataValue}>{file.fileType.toUpperCase()}</Text>
      </View>
      {file.durationSeconds && (
        <View style={styles.metadataRow}>
          <Text style={styles.metadataLabel}>Durée :</Text>
          <Text style={styles.metadataValue}>{formatDuration(file.durationSeconds)}</Text>
        </View>
      )}
      <View style={styles.metadataRow}>
        <Text style={styles.metadataLabel}>Segments :</Text>
        <Text style={styles.metadataValue}>{file.segmentCount}</Text>
      </View>
      <View style={styles.metadataRow}>
        <Text style={styles.metadataLabel}>Analysé le :</Text>
        <Text style={styles.metadataValue}>{formatDateTime(file.analyzedAt)}</Text>
      </View>
    </View>
  );
}

/**
 * Alert summary by severity
 */
export function AlertSummary({ breakdown }: { breakdown: ScoreBreakdown }): React.ReactElement {
  const severities: AlertSeverity[] = ['critical', 'warning', 'info'];

  return (
    <View style={styles.alertSummary}>
      {severities.map((severity) => (
        <View
          key={severity}
          style={[
            styles.alertSummaryItem,
            { backgroundColor: categoryColors[severity].background },
          ]}
        >
          <Text
            style={[
              styles.alertSummaryCount,
              { color: categoryColors[severity].text },
            ]}
          >
            {breakdown.bySeverity[severity]}
          </Text>
          <Text style={styles.alertSummaryLabel}>{SEVERITY_LABELS[severity]}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Breakdown by rule chart
 */
export function BreakdownChart({ breakdown }: { breakdown: ScoreBreakdown }): React.ReactElement {
  const rules: RuleCode[] = ['speed', 'length', 'overlap', 'duration', 'proper_noun'];
  const maxCount = Math.max(
    ...rules.map((rule) => breakdown.byRule[rule].count),
    1 // Avoid division by zero
  );

  return (
    <View style={styles.chartContainer}>
      {rules.map((rule) => {
        const data = breakdown.byRule[rule];
        const percentage = (data.count / maxCount) * 100;
        const hasAlerts = data.count > 0;

        return (
          <View key={rule} style={styles.chartBar}>
            <Text style={styles.chartLabel}>{RULE_LABELS[rule]}</Text>
            <View style={styles.chartBarContainer}>
              {hasAlerts && (
                <View
                  style={[
                    styles.chartBarFill,
                    {
                      width: `${percentage}%`,
                      backgroundColor: data.count > 0 ? SEVERITY_COLORS.warning : '#10B981',
                    },
                  ]}
                />
              )}
            </View>
            <Text style={styles.chartValue}>{data.count}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Breakdown table
 */
export function BreakdownTable({ breakdown }: { breakdown: ScoreBreakdown }): React.ReactElement {
  const rules: RuleCode[] = ['speed', 'length', 'overlap', 'duration', 'proper_noun'];

  return (
    <View style={styles.breakdownTable}>
      <View style={[styles.breakdownRow, styles.breakdownHeader]}>
        <View style={styles.breakdownCell}>
          <Text style={styles.breakdownCellHeader}>Règle</Text>
        </View>
        <View style={styles.breakdownCell}>
          <Text style={styles.breakdownCellHeader}>Alertes</Text>
        </View>
        <View style={styles.breakdownCell}>
          <Text style={styles.breakdownCellHeader}>Pénalité</Text>
        </View>
      </View>
      {rules.map((rule) => {
        const data = breakdown.byRule[rule];
        return (
          <View key={rule} style={styles.breakdownRow}>
            <View style={styles.breakdownCell}>
              <Text style={styles.breakdownCellValue}>{RULE_LABELS[rule]}</Text>
            </View>
            <View style={styles.breakdownCell}>
              <Text style={styles.breakdownCellValue}>{data.count}</Text>
            </View>
            <View style={styles.breakdownCell}>
              <Text style={styles.breakdownCellValue}>-{data.penalty}</Text>
            </View>
          </View>
        );
      })}
      <View style={[styles.breakdownRow, { borderBottomWidth: 0 }]}>
        <View style={styles.breakdownCell}>
          <Text style={[styles.breakdownCellValue, { fontWeight: 'bold' }]}>Total</Text>
        </View>
        <View style={styles.breakdownCell}>
          <Text style={[styles.breakdownCellValue, { fontWeight: 'bold' }]}>
            {breakdown.totalAlerts}
          </Text>
        </View>
        <View style={styles.breakdownCell}>
          <Text style={[styles.breakdownCellValue, { fontWeight: 'bold' }]}>
            -{rules.reduce((sum, rule) => sum + breakdown.byRule[rule].penalty, 0)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Alerts grouped by rule type
 */
export function AlertsByType({ alerts }: { alerts: AlertData[] }): React.ReactElement {
  const rules: RuleCode[] = ['speed', 'length', 'overlap', 'duration', 'proper_noun'];

  // Group alerts by rule
  const groupedAlerts = rules.reduce(
    (acc, rule) => {
      acc[rule] = alerts.filter((a) => a.ruleCode === rule);
      return acc;
    },
    {} as Record<RuleCode, AlertData[]>
  );

  return (
    <View style={styles.alertList}>
      {rules.map((rule) => {
        const ruleAlerts = groupedAlerts[rule];
        if (ruleAlerts.length === 0) return null;

        return (
          <View key={rule} style={styles.alertGroup} wrap={false}>
            <Text style={styles.alertGroupTitle}>
              {RULE_LABELS[rule]} ({ruleAlerts.length})
            </Text>
            {ruleAlerts.slice(0, 20).map((alert, index) => (
              <AlertItem key={index} alert={alert} />
            ))}
            {ruleAlerts.length > 20 && (
              <Text style={styles.alertDetails}>
                ... et {ruleAlerts.length - 20} autres alertes
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Single alert item
 */
function AlertItem({ alert }: { alert: AlertData }): React.ReactElement {
  const colors = categoryColors[alert.severity];

  return (
    <View
      style={[
        styles.alertItem,
        { borderLeftColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <Text style={[styles.alertMessage, { color: colors.text }]}>{alert.message}</Text>
      {alert.details && (
        <Text style={styles.alertDetails}>
          {formatAlertDetails(alert)}
        </Text>
      )}
      {alert.segmentNum && (
        <Text style={styles.alertSegment}>Segment #{alert.segmentNum}</Text>
      )}
    </View>
  );
}

// Helper functions
function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins} min ${secs} sec`;
}

function formatAlertDetails(alert: AlertData): string {
  if (!alert.details) return '';

  const { actual, max, min, unit } = alert.details;
  const parts: string[] = [];

  if (actual !== undefined) {
    parts.push(`Valeur: ${actual}${unit || ''}`);
  }
  if (max !== undefined) {
    parts.push(`Max: ${max}${unit || ''}`);
  }
  if (min !== undefined) {
    parts.push(`Min: ${min}${unit || ''}`);
  }

  return parts.join(' | ');
}

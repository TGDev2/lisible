/**
 * Types for PDF proof document generation
 */

/**
 * User plan type
 */
export type UserPlan = 'free' | 'pro';

/**
 * Alert severity level
 */
export type AlertSeverity = 'critical' | 'warning' | 'info';

/**
 * Rule code for SME analysis
 */
export type RuleCode = 'speed' | 'length' | 'overlap' | 'duration' | 'proper_noun';

/**
 * Alert data for the PDF document
 */
export interface AlertData {
  /** Rule code that generated the alert */
  ruleCode: RuleCode;
  /** Severity of the alert */
  severity: AlertSeverity;
  /** Human-readable alert message */
  message: string;
  /** Segment sequence number (for reference) */
  segmentNum?: number;
  /** Additional details */
  details?: {
    actual?: number;
    max?: number;
    min?: number;
    unit?: string;
    term?: string;
  };
  /** Whether the alert has been resolved */
  resolved?: boolean;
}

/**
 * Score breakdown by severity
 */
export interface ScoreBreakdownBySeverity {
  critical: number;
  warning: number;
  info: number;
}

/**
 * Score breakdown by rule
 */
export interface ScoreBreakdownByRule {
  speed: { count: number; penalty: number };
  length: { count: number; penalty: number };
  overlap: { count: number; penalty: number };
  duration: { count: number; penalty: number };
  proper_noun: { count: number; penalty: number };
}

/**
 * Score breakdown for the PDF document
 */
export interface ScoreBreakdown {
  totalAlerts: number;
  bySeverity: ScoreBreakdownBySeverity;
  byRule: ScoreBreakdownByRule;
}

/**
 * File metadata for the PDF document
 */
export interface FileMetadata {
  /** File ID */
  id: string;
  /** Original file name */
  originalName: string;
  /** File type (srt, vtt, video, audio) */
  fileType: string;
  /** Duration in seconds (for video/audio) */
  durationSeconds?: number;
  /** Total number of segments */
  segmentCount: number;
  /** Date of SME analysis */
  analyzedAt: Date;
  /** Date the file was created/uploaded */
  createdAt: Date;
}

/**
 * Input data for generating the proof document
 */
export interface ProofDocumentData {
  /** File metadata */
  file: FileMetadata;
  /** SME score (0-100) */
  score: number;
  /** Score breakdown */
  breakdown: ScoreBreakdown;
  /** List of alerts */
  alerts: AlertData[];
  /** User plan (affects watermark) */
  userPlan: UserPlan;
  /** Optional project name */
  projectName?: string;
}

/**
 * Options for PDF generation
 */
export interface GenerateOptions {
  /** Include detailed breakdown chart (optional feature) */
  includeChart?: boolean;
}

/**
 * Label mappings for rule codes
 */
export const RULE_LABELS: Record<RuleCode, string> = {
  speed: 'Vitesse de lecture',
  length: 'Longueur du segment',
  overlap: 'Chevauchement',
  duration: "Durée d'affichage",
  proper_noun: 'Nom propre',
};

/**
 * Label mappings for severity levels
 */
export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: 'Critique',
  warning: 'Avertissement',
  info: 'Information',
};

/**
 * Color mappings for severity levels
 */
export const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: '#DC2626', // red-600
  warning: '#D97706', // amber-600
  info: '#2563EB', // blue-600
};

/**
 * Color mappings for score ranges
 */
export function getScoreColor(score: number): string {
  if (score >= 90) return '#16A34A'; // green-600
  if (score >= 70) return '#65A30D'; // lime-600
  if (score >= 50) return '#D97706'; // amber-600
  return '#DC2626'; // red-600
}

/**
 * Get score label based on value
 */
export function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Bon';
  if (score >= 50) return 'À améliorer';
  return 'Non conforme';
}

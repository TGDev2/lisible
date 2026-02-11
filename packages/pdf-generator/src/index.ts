/**
 * @sme-studio/pdf-generator
 *
 * PDF proof document generation for SME Studio.
 * Generates conformity reports with score, alerts, and file metadata.
 */

// Main generation functions
export {
  generateProofDocument,
  generateProofDocumentStream,
  generateProofDocumentSafe,
  validateProofDocumentData,
} from './generate';

// Types
export type {
  UserPlan,
  AlertSeverity,
  RuleCode,
  AlertData,
  ScoreBreakdownBySeverity,
  ScoreBreakdownByRule,
  ScoreBreakdown,
  FileMetadata,
  ProofDocumentData,
  GenerateOptions,
} from './types';

// Type utilities
export {
  RULE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  getScoreColor,
  getScoreLabel,
} from './types';

// Template components (for advanced customization)
export { ProofDocument } from './templates';

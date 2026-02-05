// Types
export type {
  Segment,
  AlertSeverity,
  RuleCode,
  SpeedCheckResult,
  LengthCheckResult,
  OverlapCheckResult,
  DurationCheckResult,
  ProperNounCheckResult,
  DetectedProperNoun,
  AlertInput,
  ScoreBreakdown,
  ScoreBreakdownByRule,
  ScoreResult,
} from './types';

// Rules
export { checkSpeed } from './rules/speed';
export { checkLength } from './rules/length';
export { checkOverlap } from './rules/overlap';
export { checkDuration } from './rules/duration';
export { checkProperNouns } from './rules/proper-nouns';

// Scoring
export { calculateScore } from './scoring';

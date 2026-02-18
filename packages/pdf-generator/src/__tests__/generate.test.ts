import { describe, it, expect } from 'vitest';
import {
  generateProofDocument,
  validateProofDocumentData,
  type ProofDocumentData,
} from '../index';

// Sample test data
const createTestData = (overrides?: Partial<ProofDocumentData>): ProofDocumentData => ({
  file: {
    id: 'test-file-id',
    originalName: 'test-video.srt',
    fileType: 'srt',
    segmentCount: 150,
    durationSeconds: 600,
    analyzedAt: new Date('2024-01-15T10:30:00Z'),
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  score: 85,
  breakdown: {
    totalAlerts: 5,
    bySeverity: {
      critical: 1,
      warning: 3,
      info: 1,
    },
    byRule: {
      speed: { count: 2, penalty: 15 },
      length: { count: 1, penalty: 5 },
      overlap: { count: 0, penalty: 0 },
      duration: { count: 1, penalty: 5 },
      proper_noun: { count: 1, penalty: 1 },
    },
  },
  alerts: [
    {
      ruleCode: 'speed',
      severity: 'critical',
      message: 'Vitesse de lecture trop élevée (25 car/s)',
      segmentNum: 12,
      details: { actual: 25, max: 20, unit: ' car/s' },
    },
    {
      ruleCode: 'speed',
      severity: 'warning',
      message: 'Vitesse de lecture élevée (19 car/s)',
      segmentNum: 45,
      details: { actual: 19, max: 20, unit: ' car/s' },
    },
    {
      ruleCode: 'length',
      severity: 'warning',
      message: 'Segment trop long (92 caractères)',
      segmentNum: 23,
      details: { actual: 92, max: 84, unit: ' car' },
    },
    {
      ruleCode: 'duration',
      severity: 'warning',
      message: "Durée d'affichage trop courte (800ms)",
      segmentNum: 67,
      details: { actual: 800, min: 1000, unit: 'ms' },
    },
    {
      ruleCode: 'proper_noun',
      severity: 'info',
      message: 'Nom propre potentiel détecté: "Durand"',
      segmentNum: 89,
      details: { term: 'Durand' },
    },
  ],
  userPlan: 'pro',
  projectName: 'Formation E-Learning 2024',
  ...overrides,
});

describe('validateProofDocumentData', () => {
  it('should pass with valid data', () => {
    const data = createTestData();
    expect(() => validateProofDocumentData(data)).not.toThrow();
  });

  it('should throw if file is missing', () => {
    const data = createTestData();
    (data as unknown as { file?: ProofDocumentData['file'] }).file = undefined;
    expect(() => validateProofDocumentData(data)).toThrow('File metadata is required');
  });

  it('should throw if file.originalName is missing', () => {
    const data = createTestData();
    data.file.originalName = '';
    expect(() => validateProofDocumentData(data)).toThrow('File original name is required');
  });

  it('should throw if score is out of range', () => {
    const data = createTestData({ score: 150 });
    expect(() => validateProofDocumentData(data)).toThrow(
      'Score must be a number between 0 and 100'
    );
  });

  it('should throw if score is negative', () => {
    const data = createTestData({ score: -10 });
    expect(() => validateProofDocumentData(data)).toThrow(
      'Score must be a number between 0 and 100'
    );
  });

  it('should throw if breakdown is missing', () => {
    const data = createTestData();
    (data as unknown as { breakdown?: ProofDocumentData['breakdown'] }).breakdown = undefined;
    expect(() => validateProofDocumentData(data)).toThrow('Score breakdown is required');
  });

  it('should throw if alerts is not an array', () => {
    const data = createTestData();
    (data as unknown as { alerts: unknown }).alerts = 'not an array';
    expect(() => validateProofDocumentData(data)).toThrow('Alerts must be an array');
  });

  it('should throw if userPlan is invalid', () => {
    const data = createTestData();
    (data as unknown as { userPlan: string }).userPlan = 'enterprise';
    expect(() => validateProofDocumentData(data)).toThrow('User plan must be "free" or "pro"');
  });

  it('should accept score of 0', () => {
    const data = createTestData({ score: 0 });
    expect(() => validateProofDocumentData(data)).not.toThrow();
  });

  it('should accept score of 100', () => {
    const data = createTestData({ score: 100 });
    expect(() => validateProofDocumentData(data)).not.toThrow();
  });

  it('should accept empty alerts array', () => {
    const data = createTestData({ alerts: [] });
    expect(() => validateProofDocumentData(data)).not.toThrow();
  });

  it('should accept free plan', () => {
    const data = createTestData({ userPlan: 'free' });
    expect(() => validateProofDocumentData(data)).not.toThrow();
  });
});

describe('generateProofDocument', () => {
  it('should generate a PDF buffer', async () => {
    const data = createTestData();
    const buffer = await generateProofDocument(data);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('should generate a valid PDF (check magic bytes)', async () => {
    const data = createTestData();
    const buffer = await generateProofDocument(data);

    // PDF magic bytes: %PDF-
    const pdfMagic = buffer.slice(0, 5).toString('ascii');
    expect(pdfMagic).toBe('%PDF-');
  });

  it('should generate PDF for free plan with watermark', async () => {
    const data = createTestData({ userPlan: 'free' });
    const buffer = await generateProofDocument(data);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('should generate PDF with no alerts', async () => {
    const data = createTestData({
      score: 100,
      alerts: [],
      breakdown: {
        totalAlerts: 0,
        bySeverity: { critical: 0, warning: 0, info: 0 },
        byRule: {
          speed: { count: 0, penalty: 0 },
          length: { count: 0, penalty: 0 },
          overlap: { count: 0, penalty: 0 },
          duration: { count: 0, penalty: 0 },
          proper_noun: { count: 0, penalty: 0 },
        },
      },
    });
    const buffer = await generateProofDocument(data);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('should generate PDF with many alerts (pagination test)', async () => {
    const alerts = Array.from({ length: 100 }, (_, i) => ({
      ruleCode: 'speed' as const,
      severity: 'warning' as const,
      message: `Alerte de test ${i + 1}`,
      segmentNum: i + 1,
      details: { actual: 22, max: 20, unit: ' car/s' },
    }));

    const data = createTestData({
      alerts,
      breakdown: {
        totalAlerts: 100,
        bySeverity: { critical: 0, warning: 100, info: 0 },
        byRule: {
          speed: { count: 100, penalty: 500 },
          length: { count: 0, penalty: 0 },
          overlap: { count: 0, penalty: 0 },
          duration: { count: 0, penalty: 0 },
          proper_noun: { count: 0, penalty: 0 },
        },
      },
    });
    const buffer = await generateProofDocument(data);

    expect(buffer).toBeInstanceOf(Buffer);
    // With many alerts, the PDF should be larger
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('should generate PDF without optional chart', async () => {
    const data = createTestData();
    const buffer = await generateProofDocument(data, { includeChart: false });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('should generate PDF without project name', async () => {
    const data = createTestData({ projectName: undefined });
    const buffer = await generateProofDocument(data);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('should generate PDF without duration', async () => {
    const data = createTestData();
    data.file.durationSeconds = undefined;
    const buffer = await generateProofDocument(data);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});

describe('type utilities', () => {
  it('should export RULE_LABELS', async () => {
    const { RULE_LABELS } = await import('../index');
    expect(RULE_LABELS.speed).toBe('Vitesse de lecture');
    expect(RULE_LABELS.length).toBe('Longueur du segment');
    expect(RULE_LABELS.overlap).toBe('Chevauchement');
    expect(RULE_LABELS.duration).toBe("Durée d'affichage");
    expect(RULE_LABELS.proper_noun).toBe('Nom propre');
  });

  it('should export SEVERITY_LABELS', async () => {
    const { SEVERITY_LABELS } = await import('../index');
    expect(SEVERITY_LABELS.critical).toBe('Critique');
    expect(SEVERITY_LABELS.warning).toBe('Avertissement');
    expect(SEVERITY_LABELS.info).toBe('Information');
  });

  it('should return correct score colors', async () => {
    const { getScoreColor } = await import('../index');
    expect(getScoreColor(95)).toBe('#16A34A'); // green
    expect(getScoreColor(75)).toBe('#65A30D'); // lime
    expect(getScoreColor(55)).toBe('#D97706'); // amber
    expect(getScoreColor(35)).toBe('#DC2626'); // red
  });

  it('should return correct score labels', async () => {
    const { getScoreLabel } = await import('../index');
    expect(getScoreLabel(95)).toBe('Excellent');
    expect(getScoreLabel(75)).toBe('Bon');
    expect(getScoreLabel(55)).toBe('À améliorer');
    expect(getScoreLabel(35)).toBe('Non conforme');
  });
});

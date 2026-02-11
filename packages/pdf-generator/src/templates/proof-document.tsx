import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './styles';
import {
  Watermark,
  Footer,
  ScoreGauge,
  ScoreBar,
  MetadataSection,
  AlertSummary,
  BreakdownChart,
  BreakdownTable,
  AlertsByType,
} from './components';
import { type ProofDocumentData, type GenerateOptions } from '../types';

interface ProofDocumentProps {
  data: ProofDocumentData;
  options?: GenerateOptions;
}

/**
 * SME Studio Proof Document
 *
 * Structure:
 * - Page 1: Title page with score, date, and alert summary
 * - Pages 2+: Detailed alerts grouped by category
 */
export function ProofDocument({
  data,
  options = {},
}: ProofDocumentProps): React.ReactElement {
  const { file, score, breakdown, alerts, userPlan, projectName } = data;
  const { includeChart = true } = options;
  const showWatermark = userPlan === 'free';
  const generatedAt = new Date();

  return (
    <Document
      title={`Dossier de preuves SME - ${file.originalName}`}
      author="SME Studio"
      subject="Rapport d'analyse de conformité SME"
      keywords="SME, sous-titres, conformité, accessibilité"
      creator="SME Studio"
      producer="SME Studio PDF Generator"
    >
      {/* Page 1: Title Page */}
      <Page size="A4" style={styles.page}>
        {showWatermark && <Watermark />}

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Dossier de Preuves SME</Text>
          <Text style={styles.headerSubtitle}>
            Rapport de conformité des sous-titres
          </Text>
        </View>

        {/* Project/File info */}
        {projectName && (
          <Text style={{ fontSize: 14, color: '#4B5563', marginBottom: 10 }}>
            Projet : {projectName}
          </Text>
        )}

        {/* Score Section */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Score SME</Text>
          <ScoreGauge score={score} />
          <ScoreBar score={score} />
          <Text
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: '#6B7280',
              marginTop: 10,
            }}
          >
            {getScoreDescription(score)}
          </Text>
        </View>

        {/* Alert Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Résumé des alertes</Text>
          <AlertSummary breakdown={breakdown} />

          {breakdown.totalAlerts === 0 ? (
            <View
              style={{
                padding: 20,
                backgroundColor: '#F0FDF4',
                borderRadius: 8,
                textAlign: 'center',
              }}
            >
              <Text style={{ color: '#166534', fontSize: 14, fontWeight: 'bold' }}>
                Aucune alerte ! Votre fichier est conforme SME.
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 10 }}>
              {breakdown.totalAlerts} alerte{breakdown.totalAlerts > 1 ? 's' : ''} détectée
              {breakdown.totalAlerts > 1 ? 's' : ''} lors de l'analyse.
              {breakdown.bySeverity.critical > 0 &&
                ` ${breakdown.bySeverity.critical} critique${breakdown.bySeverity.critical > 1 ? 's' : ''} à corriger.`}
            </Text>
          )}
        </View>

        {/* File Metadata */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Informations du fichier</Text>
          <MetadataSection file={file} />
        </View>

        <Footer generatedAt={generatedAt} />
      </Page>

      {/* Page 2: Score Breakdown */}
      {breakdown.totalAlerts > 0 && (
        <Page size="A4" style={styles.page}>
          {showWatermark && <Watermark />}

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Détail du Score</Text>
            <Text style={styles.headerSubtitle}>{file.originalName}</Text>
          </View>

          {/* Breakdown Chart (optional) */}
          {includeChart && (
            <View style={styles.summarySection}>
              <Text style={styles.sectionTitle}>Répartition par catégorie</Text>
              <BreakdownChart breakdown={breakdown} />
            </View>
          )}

          {/* Breakdown Table */}
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>Tableau récapitulatif</Text>
            <BreakdownTable breakdown={breakdown} />
          </View>

          {/* Score explanation */}
          <View
            style={{
              marginTop: 20,
              padding: 15,
              backgroundColor: '#F3F4F6',
              borderRadius: 8,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 8 }}>
              Méthode de calcul du score
            </Text>
            <Text style={{ fontSize: 9, color: '#4B5563', lineHeight: 1.5 }}>
              Le score SME est calculé sur une base de 100 points. Chaque alerte détectée
              entraîne une pénalité selon sa sévérité :{'\n'}
              • Critique : -10 points{'\n'}
              • Avertissement : -5 points{'\n'}
              • Information : -1 point{'\n'}
              Le score minimum est de 0.
            </Text>
          </View>

          <Footer generatedAt={generatedAt} />
        </Page>
      )}

      {/* Pages 3+: Detailed Alerts by Category */}
      {alerts.length > 0 && (
        <Page size="A4" style={styles.page}>
          {showWatermark && <Watermark />}

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Détail des alertes</Text>
            <Text style={styles.headerSubtitle}>
              Groupées par catégorie • {file.originalName}
            </Text>
          </View>

          <AlertsByType alerts={alerts} />

          <Footer generatedAt={generatedAt} />
        </Page>
      )}
    </Document>
  );
}

/**
 * Get description text based on score
 */
function getScoreDescription(score: number): string {
  if (score >= 90) {
    return 'Excellent ! Votre fichier est conforme aux standards SME et prêt pour la livraison.';
  }
  if (score >= 70) {
    return 'Bon niveau de conformité. Quelques ajustements mineurs sont recommandés.';
  }
  if (score >= 50) {
    return 'Des améliorations sont nécessaires pour atteindre les standards SME.';
  }
  return 'Le fichier nécessite des corrections importantes avant livraison.';
}

export default ProofDocument;

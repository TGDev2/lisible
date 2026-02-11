import { StyleSheet } from '@react-pdf/renderer';

/**
 * Shared styles for the proof document PDF
 */
export const styles = StyleSheet.create({
  // Page
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1F2937',
    position: 'relative',
  },

  // Header
  header: {
    marginBottom: 20,
    borderBottom: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 15,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },

  // Title page
  titlePage: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  titleMain: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center',
  },
  titleSub: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 40,
    textAlign: 'center',
  },

  // Score section
  scoreContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 30,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 8,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  scoreLabel: {
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },

  // Gauge visual
  gaugeContainer: {
    width: '100%',
    marginVertical: 15,
  },
  gaugeBackground: {
    height: 20,
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: 20,
    borderRadius: 10,
  },
  gaugeLabels: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    fontSize: 8,
    color: '#6B7280',
  },

  // Metadata
  metadataContainer: {
    backgroundColor: '#F9FAFB',
    padding: 15,
    borderRadius: 8,
    marginVertical: 20,
  },
  metadataRow: {
    display: 'flex',
    flexDirection: 'row',
    marginBottom: 8,
  },
  metadataLabel: {
    width: 140,
    fontWeight: 'bold',
    color: '#4B5563',
  },
  metadataValue: {
    flex: 1,
    color: '#1F2937',
  },

  // Summary section
  summarySection: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 15,
    borderBottom: 2,
    borderBottomColor: '#3B82F6',
    paddingBottom: 5,
  },

  // Alert summary
  alertSummary: {
    display: 'flex',
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
  },
  alertSummaryItem: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    textAlign: 'center',
  },
  alertSummaryCount: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  alertSummaryLabel: {
    fontSize: 10,
    color: '#6B7280',
  },

  // Alert list
  alertList: {
    marginTop: 10,
  },
  alertGroup: {
    marginBottom: 15,
  },
  alertGroupTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
  },
  alertItem: {
    padding: 10,
    marginBottom: 6,
    borderLeft: 3,
    backgroundColor: '#FAFAFA',
    borderRadius: 2,
  },
  alertMessage: {
    fontSize: 10,
    color: '#1F2937',
  },
  alertDetails: {
    fontSize: 8,
    color: '#6B7280',
    marginTop: 4,
  },
  alertSegment: {
    fontSize: 8,
    color: '#9CA3AF',
    marginTop: 2,
  },

  // Breakdown table
  breakdownTable: {
    marginTop: 15,
  },
  breakdownRow: {
    display: 'flex',
    flexDirection: 'row',
    borderBottom: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 8,
  },
  breakdownHeader: {
    backgroundColor: '#F3F4F6',
  },
  breakdownCell: {
    flex: 1,
    paddingHorizontal: 8,
  },
  breakdownCellHeader: {
    fontWeight: 'bold',
    fontSize: 9,
    color: '#4B5563',
  },
  breakdownCellValue: {
    fontSize: 10,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#9CA3AF',
  },
  pageNumber: {
    textAlign: 'right',
  },

  // Watermark
  watermark: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%) rotate(-45deg)',
    fontSize: 60,
    color: '#E5E7EB',
    opacity: 0.5,
    fontWeight: 'bold',
  },

  // Breakdown chart (simple bars)
  chartContainer: {
    marginVertical: 20,
  },
  chartBar: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  chartLabel: {
    width: 120,
    fontSize: 9,
    color: '#4B5563',
  },
  chartBarContainer: {
    flex: 1,
    height: 16,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginRight: 10,
  },
  chartBarFill: {
    height: 16,
    borderRadius: 4,
  },
  chartValue: {
    width: 40,
    fontSize: 9,
    textAlign: 'right',
    color: '#6B7280',
  },
});

/**
 * Colors for different alert categories
 */
export const categoryColors = {
  critical: {
    background: '#FEF2F2',
    border: '#DC2626',
    text: '#991B1B',
  },
  warning: {
    background: '#FFFBEB',
    border: '#D97706',
    text: '#92400E',
  },
  info: {
    background: '#EFF6FF',
    border: '#2563EB',
    text: '#1E40AF',
  },
};

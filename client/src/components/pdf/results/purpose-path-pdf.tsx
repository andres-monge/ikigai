/**
 * @file purpose-path-pdf.tsx
 * @description PDF component for a single Purpose Path card.
 * Matches the gradient-header card design from the app.
 */

import { View, Text, StyleSheet } from '@react-pdf/renderer';
import type { PurposePath } from '@/types/assessment';
import type { Language } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { IKIGAI_COLORS, PATH_COLORS, ALIGNMENT_COLORS } from '../shared/colors';
import { RetroCardWithHeader } from '../shared/retro-card';

const styles = StyleSheet.create({
  // Header content (white text on colored background)
  headerTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 16,
    color: IKIGAI_COLORS.white,
    marginBottom: 8,
  },
  headerDescription: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: IKIGAI_COLORS.white,
    opacity: 0.9,
    lineHeight: 1.4,
  },

  // Body sections
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: IKIGAI_COLORS.slate900,
    marginBottom: 10,
  },

  // Ikigai alignment rows
  alignmentContainer: {
    marginBottom: 16,
  },
  alignmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
    marginTop: 3,
  },
  alignmentText: {
    flex: 1,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: IKIGAI_COLORS.slate600,
    lineHeight: 1.4,
  },
  alignmentLabel: {
    fontFamily: 'Helvetica-Bold',
    color: IKIGAI_COLORS.slate700,
  },

  // Action strategy box
  strategyBox: {
    backgroundColor: IKIGAI_COLORS.beige,
    padding: 12,
    marginTop: 8,
  },
  strategyTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: IKIGAI_COLORS.slate900,
    marginBottom: 6,
  },
  strategyText: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: IKIGAI_COLORS.slate600,
    lineHeight: 1.5,
  },
});

// Alignment keys in display order
const ALIGNMENT_KEYS = ['love', 'meaning', 'goodAt', 'pay'] as const;

interface PurposePathPDFProps {
  path: PurposePath;
  index: number;
  language: Language;
}

export function PurposePathPDF({ path, index, language }: PurposePathPDFProps) {
  const headerColor = PATH_COLORS[index % 3];

  const headerContent = (
    <>
      <Text style={styles.headerTitle}>{path.title}</Text>
      <Text style={styles.headerDescription}>{path.description}</Text>
    </>
  );

  return (
    <RetroCardWithHeader headerColor={headerColor} headerContent={headerContent}>
      {/* Ikigai Alignment */}
      <Text style={styles.sectionTitle}>{t('ikigai.alignment', language)}</Text>
      <View style={styles.alignmentContainer}>
        {ALIGNMENT_KEYS.map((key) => (
          <View key={key} style={styles.alignmentRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: ALIGNMENT_COLORS[key] },
              ]}
            />
            <Text style={styles.alignmentText}>
              <Text style={styles.alignmentLabel}>
                {t(`ikigai.${key}`, language)}:
              </Text>{' '}
              {path.ikigaiAlignment[key]}
            </Text>
          </View>
        ))}
      </View>

      {/* Action Strategy */}
      <View style={styles.strategyBox}>
        <Text style={styles.strategyTitle}>
          {t('results.actionStrategy', language)}
        </Text>
        <Text style={styles.strategyText}>{path.actionStrategy}</Text>
      </View>
    </RetroCardWithHeader>
  );
}

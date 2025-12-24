/**
 * @file core-drivers-pdf.tsx
 * @description PDF component for the Core Drivers / Your Ikigai summary section.
 */

import { View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CoreDrivers } from '@/types/assessment';
import type { Language } from '@/lib/i18n';
import { IKIGAI_COLORS } from '../shared/colors';
import { RetroCard } from '../shared/retro-card';

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  statementSentence: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: IKIGAI_COLORS.slate800,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 1.4,
  },
  coreThreads: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: IKIGAI_COLORS.slate600,
    lineHeight: 1.6,
    textAlign: 'left',
  },
});

interface CoreDriversPDFProps {
  analysis: CoreDrivers;
  language: Language;
}

export function CoreDriversPDF({ analysis }: CoreDriversPDFProps) {
  return (
    <View style={styles.container}>
      <RetroCard padding={24}>
        <Text style={styles.statementSentence}>
          {analysis.statementSentence}
        </Text>
        <Text style={styles.coreThreads}>
          {analysis.coreThreads}
        </Text>
      </RetroCard>
    </View>
  );
}

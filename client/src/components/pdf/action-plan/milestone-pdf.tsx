/**
 * @file milestone-pdf.tsx
 * @description PDF component for a single milestone in the action plan.
 */

import { View, Text, StyleSheet } from '@react-pdf/renderer';
import type { Milestone } from '@/types/assessment';
import type { Language } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { IKIGAI_COLORS } from '../shared/colors';
import { RetroCard } from '../shared/retro-card';

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottom: `1px solid ${IKIGAI_COLORS.slate600}`,
  },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: IKIGAI_COLORS.slate900,
    flex: 1,
  },
  timeline: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: IKIGAI_COLORS.slate500,
    backgroundColor: IKIGAI_COLORS.beige,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  // Section containers
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: IKIGAI_COLORS.slate800,
    marginBottom: 6,
  },

  // Bullet list
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bullet: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: IKIGAI_COLORS.slate600,
    marginRight: 8,
    width: 12,
  },
  bulletText: {
    flex: 1,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: IKIGAI_COLORS.slate600,
    lineHeight: 1.4,
  },

  // Checkpoint box
  checkpointBox: {
    backgroundColor: IKIGAI_COLORS.beige,
    padding: 12,
    marginTop: 8,
  },
  checkpointTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: IKIGAI_COLORS.slate900,
    marginBottom: 4,
  },
  checkpointText: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: IKIGAI_COLORS.slate600,
    lineHeight: 1.4,
  },
});

interface MilestonePDFProps {
  milestone: Milestone;
  index: number;
  language: Language;
}

export function MilestonePDF({ milestone, index, language }: MilestonePDFProps) {
  return (
    <RetroCard padding={16}>
      {/* Header with title and timeline */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {index + 1}. {milestone.title}
        </Text>
        <Text style={styles.timeline}>{milestone.timeline}</Text>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('actionPlan.actions', language)}</Text>
        {milestone.actions.map((action, i) => (
          <View key={i} style={styles.bulletItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.bulletText}>{action}</Text>
          </View>
        ))}
      </View>

      {/* Skills (if available) */}
      {milestone.skills && milestone.skills.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('actionPlan.skills', language)}</Text>
          {milestone.skills.map((skill, i) => (
            <View key={i} style={styles.bulletItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{skill.skill}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Checkpoint (if available) */}
      {milestone.checkpoint && (
        <View style={styles.checkpointBox}>
          <Text style={styles.checkpointTitle}>
            {t('actionPlan.checkpoint', language)}
          </Text>
          <Text style={styles.checkpointText}>{milestone.checkpoint}</Text>
        </View>
      )}
    </RetroCard>
  );
}

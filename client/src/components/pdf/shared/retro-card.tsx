/**
 * @file retro-card.tsx
 * @description Reusable retro card component with shadow effect.
 * Recreates the shadow-retro CSS effect using layered Views.
 */

import { View, StyleSheet } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import { IKIGAI_COLORS } from './colors';

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: 16,
  },
  shadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: IKIGAI_COLORS.shadow,
  },
  card: {
    backgroundColor: IKIGAI_COLORS.white,
    border: `1px solid ${IKIGAI_COLORS.black}`,
    position: 'relative',
  },
});

interface RetroCardProps {
  children: ReactNode;
  /** Optional padding override (default: 16) */
  padding?: number;
}

export function RetroCard({ children, padding = 16 }: RetroCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.shadow} />
      <View style={[styles.card, { padding }]}>{children}</View>
    </View>
  );
}

// Variant with colored header
const headerCardStyles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: 16,
  },
  shadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: IKIGAI_COLORS.shadow,
  },
  card: {
    backgroundColor: IKIGAI_COLORS.white,
    border: `1px solid ${IKIGAI_COLORS.black}`,
    position: 'relative',
    overflow: 'hidden',
  },
  header: {
    padding: 16,
  },
  body: {
    padding: 16,
    backgroundColor: IKIGAI_COLORS.white,
  },
});

interface RetroCardWithHeaderProps {
  headerColor: string;
  headerContent: ReactNode;
  children: ReactNode;
}

export function RetroCardWithHeader({
  headerColor,
  headerContent,
  children,
}: RetroCardWithHeaderProps) {
  return (
    <View style={headerCardStyles.container}>
      <View style={headerCardStyles.shadow} />
      <View style={headerCardStyles.card}>
        <View style={[headerCardStyles.header, { backgroundColor: headerColor }]}>
          {headerContent}
        </View>
        <View style={headerCardStyles.body}>{children}</View>
      </View>
    </View>
  );
}

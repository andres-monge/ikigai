/**
 * @file styles.ts
 * @description Shared StyleSheet objects for PDF components.
 * Mirrors the app's retro-modern design system.
 */

import { StyleSheet } from '@react-pdf/renderer';
import { IKIGAI_COLORS } from './colors';

export const sharedStyles = StyleSheet.create({
  // Page layout
  page: {
    backgroundColor: IKIGAI_COLORS.beige,
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: IKIGAI_COLORS.slate700,
  },

  // Typography
  heading1: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 28,
    color: IKIGAI_COLORS.slate900,
    marginBottom: 8,
  },
  heading2: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 20,
    color: IKIGAI_COLORS.slate900,
    marginBottom: 12,
  },
  heading3: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 16,
    color: IKIGAI_COLORS.slate900,
    marginBottom: 8,
  },
  heading4: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: IKIGAI_COLORS.slate900,
    marginBottom: 6,
  },
  bodyText: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: IKIGAI_COLORS.slate600,
    lineHeight: 1.5,
  },
  boldText: {
    fontWeight: 'bold',
  },

  // Layout utilities
  flexRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  flexColumn: {
    flexDirection: 'column',
  },
  textCenter: {
    textAlign: 'center',
  },
  marginBottom: {
    marginBottom: 16,
  },
  marginBottomLarge: {
    marginBottom: 24,
  },

  // Section spacing
  section: {
    marginBottom: 20,
  },
});

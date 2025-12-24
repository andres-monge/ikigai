/**
 * @file fonts.ts
 * @description Font registration for react-pdf.
 *
 * Uses Helvetica (built-in) as a reliable fallback.
 * Custom fonts can be added later if needed.
 */

import { Font } from '@react-pdf/renderer';

// Disable hyphenation for cleaner text
Font.registerHyphenationCallback((word) => [word]);

// Font family constants for use in styles
// Using Helvetica (built-in) for reliable cross-platform rendering
export const FONT_FAMILY = {
  heading: 'Helvetica',
  body: 'Helvetica',
} as const;

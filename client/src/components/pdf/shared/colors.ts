/**
 * @file colors.ts
 * @description Ikigai color palette for PDF components.
 * HSL values converted to hex for react-pdf compatibility.
 */

export const IKIGAI_COLORS = {
  // Core ikigai colors
  teal: '#4DB6AC',      // hsl(174 45% 52%) - What you love
  pink: '#E91E63',      // hsl(340 82% 52%) - What the world needs
  yellow: '#FFC107',    // hsl(45 100% 51%) - What you're good at
  orange: '#FF6B35',    // hsl(16 100% 60%) - What you can be paid for
  cream: '#fff9f3',     // hsl(32 100% 97%) - Warm base
  beige: '#f6f4ed',     // hsl(32 15% 95%) - Warm background

  // Slate scale (from Tailwind)
  slate900: '#0f172a',
  slate800: '#1e293b',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',

  // Basics
  white: '#ffffff',
  black: '#000000',

  // Shadow color (matching shadow-retro)
  shadow: 'rgba(0, 0, 0, 0.65)',
} as const;

// Gradient colors for purpose path cards (indexed by card position)
export const PATH_COLORS = [
  IKIGAI_COLORS.teal,
  IKIGAI_COLORS.pink,
  IKIGAI_COLORS.orange,
] as const;

// Ikigai alignment indicator colors
export const ALIGNMENT_COLORS = {
  love: IKIGAI_COLORS.teal,
  worldNeeds: IKIGAI_COLORS.pink,
  goodAt: IKIGAI_COLORS.yellow,
  pay: IKIGAI_COLORS.orange,
} as const;

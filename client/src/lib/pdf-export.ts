/**
 * @file pdf-export.ts
 *
 * @description
 * This library exports application data to styled PDF format using @react-pdf/renderer.
 * PDFs are generated with visual styling that matches the app's design system.
 *
 * The functions use dynamic imports to lazy-load the PDF components (~400KB) only
 * when the user actually triggers an export, keeping the initial bundle size small.
 *
 * @dependencies
 * - @react-pdf/renderer: Core library for creating styled PDF documents.
 * - @/types/assessment: For the `FullAssessment` and `ActionPlan` types.
 * - @/lib/i18n: For the `Language` type.
 */

import type { FullAssessment } from '@/types/assessment';
import type { ActionPlan } from '@/types/assessment';
import type { Language } from '@/lib/i18n';

/**
 * Exports the Ikigai analysis results to a styled PDF.
 * The PDF includes the core drivers summary and all purpose path cards
 * with visual styling matching the app's design.
 *
 * @param results - The full assessment data to export
 * @param language - The language for localized text ('en' or 'es')
 */
export async function exportToPDF(
  results: FullAssessment,
  language: Language = 'en',
): Promise<void> {
  // Dynamic import to lazy-load PDF components
  const { generateResultsPDF } = await import(
    '@/components/pdf/results/results-pdf'
  );
  await generateResultsPDF(results, language);
}

/**
 * Exports the action plan to a styled PDF.
 * The PDF includes a header with the chosen path and all milestones
 * with their actions, skills, and checkpoints.
 *
 * @param actionPlan - The action plan object with milestones
 * @param chosenPathTitle - The title of the chosen purpose path
 * @param language - The language for localized text ('en' or 'es')
 */
export async function exportActionPlanToPDF(
  actionPlan: ActionPlan,
  chosenPathTitle: string,
  language: Language,
): Promise<void> {
  // Dynamic import to lazy-load PDF components
  const { generateActionPlanPDF } = await import(
    '@/components/pdf/action-plan/action-plan-pdf'
  );
  await generateActionPlanPDF(actionPlan, chosenPathTitle, language);
}

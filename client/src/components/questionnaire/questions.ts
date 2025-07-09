/**
 * @file questions.ts
 *
 * @description
 * Centralised catalogue of bilingual questions used by the Purpose Finder
 * assessment.  The object is intentionally kept **framework-agnostic** so it
 * can be imported by any layer – React components, unit tests or even backend
 * prompt builders – without pulling extra dependencies.
 *
 * Each entry has a stable `id` that encodes the logical section (passions,
 * skills, values, economic) followed by an ordinal.  We use this convention
 * to:  
 *  • Group answers per section when building the API payload.  
 *  • Keep the order predictable when the array is flattened.
 *
 * @note This file is introduced in Step 2 of the Implementation Plan to avoid
 *       duplicating question strings across multiple components.
 */

import type { Language } from '@/lib/i18n';

/* -------------------------------------------------------------------------- */
/* Public Types                                                               */
/* -------------------------------------------------------------------------- */

export interface QuestionEntry {
  /** Stable identifier – used as key in React lists & answer maps */
  id: string;
  /** English wording of the question */
  en: string;
  /** Spanish wording of the question */
  es: string;
}

/**
 * Grouped catalogue keyed by logical section.  Keeping the nested structure
 * allows us to rebuild the wizard flow if needed while still being able to
 * derive a flat list for the single-page questionnaire.
 */
export const QUESTIONS = {
  passions: [
    {
      id: 'passions.q1',
      en: "What specific activities make you forget to check the clock because you're so into them?",
      es: '¿Qué actividades te absorben tanto que pierdes la noción del tiempo?',
    },
    {
      id: 'passions.q2',
      en: "What topics or problems get you excited enough to talk someone's ear off?",
      es: '¿Qué temas o problemas te entusiasman tanto que podrías hablar sin parar de ellos?',
    },
  ],
  skills: [
    {
      id: 'skills.q1',
      en: 'Which skills or talents do people compliment you on?',
      es: '¿Qué habilidades o talentos te suelen destacar los demás?',
    },
    {
      id: 'skills.q2',
      en: 'Any experience with these skills? What\'s your job or school?',
      es: '¿Tienes experiencia con estas habilidades? ¿Cuál es tu trabajo o escuela?',
    },
  ],
  values: [
    {
      id: 'values.q1',
      en: "What issues in your community, industry, or the planet frustrate you so much you'd gladly tackle them?",
      es: '¿Qué problemas en tu comunidad, industria o el planeta te frustran tanto que estarías dispuesto a abordarlos?',
    },
    {
      id: 'values.q2',
      en: 'If you could fast-forward ten years, what meaningful change would you be proud you helped create?',
      es: 'Si pudieras avanzar diez años, ¿de qué cambio significativo te enorgullecería haber formado parte?',
    },
  ],
  economic: [
    {
      id: 'economic.q1',
      en: "What are your preferences on: where you'd like to live, hours of work per week, remote work, working for others versus being self-employed?",
      es: '¿Cuáles son tus preferencias en cuanto a dónde vivir, horas de trabajo por semana, teletrabajo y trabajar por cuenta ajena versus ser autónomo?',
    },
    {
      id: 'economic.q2',
      en: 'What are your main financial responsibilities or constraints we should consider? E.g. family, health, savings.',
      es: '¿Cuáles son tus principales responsabilidades o limitaciones financieras que deberíamos considerar? Ej. familia, salud, ahorros.',
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Utility Functions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns the eight questions flattened into a single array and translated to
 * the requested language.
 */
export const buildFlatQuestionList = (
  language: Language,
): Array<{ id: string; title: string }> => {
  return (
    Object.values(QUESTIONS) // 4 sections
      .flat() // → 8 entries
      .map(({ id, en, es }) => ({
        id,
        title: language === 'en' ? en : es,
      }))
  );
}; 
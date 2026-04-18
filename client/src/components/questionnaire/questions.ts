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
 * @note This file is introduced to avoid
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
      en: "What activities make you forget to check the clock because you're so into them?",
      es: '¿Qué actividades te absorben tanto que pierdes la noción del tiempo?',
    },
    {
      id: 'passions.q2',
      en: 'What topics do you find yourself watching, reading, or thinking about, even when no one is asking you to?',
      es: '¿Qué temas te encuentras viendo, leyendo o pensando, incluso cuando nadie te lo pide?',
    },
  ],
  values: [
    {
      id: 'values.q1',
      en: "What issues in your friend group, community, or country frustrate you so much you'd gladly tackle them?",
      es: '¿Qué problemas en tu grupo de amigos, comunidad o país te frustran tanto que estarías dispuesto a abordarlos?',
    },
    {
      id: 'values.q2',
      en: 'If you could fast-forward 10 years, what meaningful change would you be proud you helped create?',
      es: 'Imagínate dentro de 10 años, ¿de qué cambio significativo te enorgullecería haber formado parte?',
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
      en: 'Tell us a bit about yourself: your studies, hobbies or anything that shows these skills in action.',
      es: 'Cuéntanos un poco sobre ti: tus estudios, hobbies o cualquier experiencia que demuestre estas habilidades en acción.',
    },
  ],
  economic: [
    {
      id: 'economic.q1',
      en: "How much school do you have left, and what choices are coming up? Subject picks, university applications? Any deadlines we should know about?",
      es: '¿Cuánto te queda de instituto y qué decisiones se acercan? Elección de asignaturas, solicitudes de universidad... ¿Alguna fecha límite que debamos tener en cuenta?',
    },
    {
      id: 'economic.q2',
      en: "What's the thing you're most stuck on? It's fine if the answer is 'I don't even know what I want.'",
      es: "¿En qué estás más atascado/a? No pasa nada si la respuesta es 'ni siquiera sé lo que quiero.'",
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

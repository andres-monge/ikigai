/**
 * @file questionnaire.tsx
 *
 * @description
 * React page component that renders the multi-step questionnaire used in the
 * “Purpose Discovery” flow.  This version implements STEP 10.2 of the
 * implementation plan:
 *
 *   1. Replace the previous 10 + questions with a simplified set of *two* 
 *      open-ended questions per topic (Passions, Skills, Values, Economic),
 *      supplied verbatim by the product owner.
 *   2. Emit a *richer* answer payload that preserves the original wording of
 *      every question so downstream AI prompts can reference questions +
 *      answers together.
 *
 * The component remains fully bilingual (English / Spanish) by selecting the
 * correct text at runtime.  It keeps UI behaviour (stepper, validation, etc.)
 * unchanged so no other pages require updates.
 *
 * @dependencies
 * - React 18 (useState, useEffect)
 * - QuestionCard: shared UI wrapper that renders a step with multiple inputs.
 * - i18n.t: still used for step titles / descriptions.
 *
 * @notes
 * - A *local* `NewQuestionnaireResponses` interface is declared instead of
 *   touching the shared type, because Step 10.3 will overhaul the schemas for
 *   the entire stack.  A cast (`as unknown as QuestionnaireResponses`) is used
 *   when invoking `onComplete` so callers compile until that migration lands.
 * - All eight questions are plain <textarea> inputs.  If the design later
 *   calls for richer input types (checkboxes, radios, etc.), update the
 *   `type` field per question.
 */

import { useState } from 'react';
import { QuestionCard } from '@/components/questionnaire/question-card';
import { t, type Language } from '@/lib/i18n';
import type { QuestionnaireResponses } from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

/**
 * New shape required by Step 10.3.  Each topic (Passions, Skills, …) is an
 * array of { question, answer } pairs.
 */
interface NewQuestionnaireResponses {
  passions: QuestionAnswerPair[];
  skills: QuestionAnswerPair[];
  values: QuestionAnswerPair[];
  economic: QuestionAnswerPair[];
}

interface QuestionAnswerPair {
  /** The full question text as displayed to the user. */
  question: string;
  /** Free-text answer recorded from the form. */
  answer: string;
}

/**
 * Internal metadata for rendering a single survey question.
 *
 * NOTE: Only the subset of properties used by <QuestionCard> are included.
 * If QuestionCard evolves, extend this interface accordingly.
 */
interface RenderableQuestion {
  /** Unique field id.  Used as state key & form element `name`. */
  id: string;
  /** Input widget type expected by QuestionCard.  Free-text only for now. */
  type: 'textarea';
  /** Localised prompt. */
  title: string;
  /** Whether the answer is mandatory. */
  required: true;
}

/**
 * Data consumed by <QuestionCard> for each step of the wizard.
 */
interface StepDefinition {
  title: string;
  description: string;
  questions: RenderableQuestion[];
}

/**
 * Props accepted by the Questionnaire page.
 *
 * The `onComplete` callback continues to expect the legacy
 * `QuestionnaireResponses` type until Step 10.3 migrates upstream code.
 */
interface QuestionnaireProps {
  onComplete: (responses: QuestionnaireResponses) => void;
  language: Language;
}

/* -------------------------------------------------------------------------- */
/*                         One-stop catalogue of questions                    */
/* -------------------------------------------------------------------------- */
/**
 * All 8 questions with bilingual text.  Keeping them in a constant guarantees
 * a single source of truth for IDs, wording, and category mapping.
 *
 * ID convention: <category>.q<n>
 */
const QUESTIONS = {
  passions: [
    {
      id: 'passions.q1',
      en: 'What specific activities make you forget to check the clock because you’re so into them?',
      es: '¿Qué actividades te absorben tanto que pierdes la noción del tiempo?'
    },
    {
      id: 'passions.q2',
      en: 'What topics or problems get you excited enough to talk someone’s ear off?',
      es: '¿Qué temas o problemas te entusiasman tanto que podrías hablar sin parar de ellos?'
    }
  ],
  skills: [
    {
      id: 'skills.q1',
      en: 'Which skills or talents do people compliment you on?',
      es: '¿Qué habilidades o talentos te suelen destacar los demás?'
    },
    {
      id: 'skills.q2',
      en: 'Any track record of these skills —projects, jobs, experiences?',
      es: '¿Tienes historial demostrable de estas habilidades —proyectos, empleos, experiencias?'
    }
  ],
  values: [
    {
      id: 'values.q1',
      en: 'What issues in your community, industry, or the planet frustrate you so much you’d gladly tackle them?',
      es: '¿Qué problemas en tu comunidad, industria o el planeta te frustran tanto que estarías dispuesto a abordarlos?'
    },
    {
      id: 'values.q2',
      en: 'If you could fast-forward ten years, what meaningful change would you be proud you helped create?',
      es: 'Si pudieras avanzar diez años, ¿de qué cambio significativo te enorgullecería haber formado parte?'
    }
  ],
  economic: [
    {
      id: 'economic.q1',
      en: "What are your preferences on: where you'd like to live, hours of work per week, remote work, working for others versus being self-employed.",
      es: '¿Cuáles son tus preferencias en cuanto a dónde vivir, horas de trabajo por semana, teletrabajo y trabajar por cuenta ajena versus ser autónomo?'
    },
    {
      id: 'economic.q2',
      en: 'What are your main financial responsibilities or constraints we should consider? E.g. Family, health, savings.',
      es: '¿Cuáles son tus principales responsabilidades o limitaciones financieras que deberíamos considerar? Ej. Familia, salud, ahorros.'
    }
  ]
} as const;

/* -------------------------------------------------------------------------- */
/*                            Helper render functions                         */
/* -------------------------------------------------------------------------- */

/**
 * Turns an entry of QUESTIONS into the shape <QuestionCard> expects.
 */
const buildRenderableQuestions = (
  entries: readonly { id: string; en: string; es: string }[],
  language: Language
): RenderableQuestion[] =>
  entries.map(({ id, en, es }) => ({
    id,
    type: 'textarea',
    title: language === 'en' ? en : es,
    required: true
  }));

/* -------------------------------------------------------------------------- */
/*                           Questionnaire Component                          */
/* -------------------------------------------------------------------------- */

export function Questionnaire({
  onComplete,
  language
}: QuestionnaireProps) {
  /* ---------------------------------- state --------------------------------- */
  const [currentStep, setCurrentStep] = useState(1);

  /**
   * Key-value store of *raw* answers by question id.
   * Example: { 'passions.q1': 'I lose track of time when painting', … }
   */
  const [answers, setAnswers] = useState<Record<string, string>>({});

  /* ----------------------------- step metadata ------------------------------ */
  const steps: StepDefinition[] = [
    {
      title: t('step1.title', language),
      description: t('step1.description', language),
      questions: buildRenderableQuestions(QUESTIONS.passions, language)
    },
    {
      title: t('step2.title', language),
      description: t('step2.description', language),
      questions: buildRenderableQuestions(QUESTIONS.skills, language)
    },
    {
      title: t('step3.title', language),
      description: t('step3.description', language),
      questions: buildRenderableQuestions(QUESTIONS.values, language)
    },
    {
      title: t('step4.title', language),
      description: t('step4.description', language),
      questions: buildRenderableQuestions(QUESTIONS.economic, language)
    }
  ];

  const currentStepData = steps[currentStep - 1];

  /* ----------------------------- event handlers ----------------------------- */

  /**
   * Update local answer state whenever the user types.
   */
  const handleResponseChange = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  /**
   * Move to next step or submit the whole form when finished.
   */
  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(prev => prev + 1);
      return;
    }

    /* ---------- Build the rich { question, answer } payload ---------- */
    const buildSection = (
      section: 'passions' | 'skills' | 'values' | 'economic'
    ): QuestionAnswerPair[] =>
      QUESTIONS[section].map(({ id, en, es }) => ({
        question: language === 'en' ? en : es,
        answer: (answers[id] ?? '').trim()
      }));

    const formatted: NewQuestionnaireResponses = {
      passions: buildSection('passions'),
      skills: buildSection('skills'),
      values: buildSection('values'),
      economic: buildSection('economic')
    };

    // UNTIL Step 10.3 updates shared types, cast to keep compiler happy
    onComplete(formatted as unknown as QuestionnaireResponses);
  };

  /** Return to previous wizard step */
  const handlePrevious = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  /* --------------------------------- render --------------------------------- */
  return (
    <QuestionCard
      step={currentStep}
      totalSteps={steps.length}
      title={currentStepData.title}
      description={currentStepData.description}
      questions={currentStepData.questions}
      responses={answers}
      onResponseChange={handleResponseChange}
      onNext={handleNext}
      onPrevious={handlePrevious}
      language={language}
    />
  );
}

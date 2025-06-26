/**
 * @file questionnaire.tsx
 *
 * @description
 * React page component that renders the multi-step questionnaire used in the
 * “Purpose Discovery” flow.
 *
 * This version incorporates **Step 18** of the implementation plan:
 *
 *  ▸ Owns the `/api/analyze` mutation (Gemini chain) directly inside the page.
 *  ▸ Persists the AI result in `sessionStorage` so `/results` can fetch it.
 *  ▸ Navigates to `/results` on success via <wouter>.
 *  ▸ Shows a full-screen <LoadingOverlay> while waiting on the backend.
 *
 * It also preserves the earlier **Step 10.2** work:
 *
 *  ▸ Eight open-ended textarea questions (two per category).
 *  ▸ Payload keeps full `{ question, answer }` pairs to maximise AI context.
 *  ▸ Fully bilingual (English / Spanish) via the `t()` i18n helper.
 *
 * @dependencies
 * - TanStack Query (mutation)
 * - `apiRequest` abstraction for fetch with shared error handling
 * - `QuestionCard` shared component (UI for each wizard step)
 * - `LoadingOverlay` full-screen spinner
 * - `useSessionStorage` persistent browser storage hook
 * - `wouter` for navigation
 *
 * @notes
 * - Error handling is console-only for now; toast notifications can be added
 *   later if desired.
 * - The placeholder i18n keys `step<n>.*` and `actionPlan.*` must exist in
 *   `client/src/lib/i18n.ts` (or the helper will simply echo the key name).
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { QuestionCard } from '@/components/questionnaire/question-card';
import { LoadingOverlay } from '@/components/loading-overlay';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { t, type Language } from '@/lib/i18n';
import type {
  QuestionnaireResponses,
  AssessmentResults
} from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/*                                Data Types                                  */
/* -------------------------------------------------------------------------- */

/**
 * Local representation of the rich payload (question + answer pairs).
 * Once Step 10.3 updated shared schemas, the cast to `QuestionnaireResponses`
 * disappeared – both shapes now match.
 */
export interface QuestionAnswerPair {
  question: string;
  answer: string;
}

export interface NewQuestionnaireResponses {
  passions: QuestionAnswerPair[];
  skills: QuestionAnswerPair[];
  values: QuestionAnswerPair[];
  economic: QuestionAnswerPair[];
}

/**
 * Metadata for rendering a single textarea question in <QuestionCard>.
 */
interface RenderableQuestion {
  id: string;
  type: 'textarea';
  title: string;
  required: true;
}

/**
 * Metadata for one wizard step (title, description, and its questions).
 */
interface StepDefinition {
  title: string;
  description: string;
  questions: RenderableQuestion[];
}

/**
 * Props injected by the router / parent component.
 */
interface QuestionnaireProps {
  language: Language;
  sessionId: string;
  /** `navigate()` obtained from `useLocation` and passed down by <App>. */
  onNavigate: ReturnType<typeof useLocation>[1];
}

/* -------------------------------------------------------------------------- */
/*                          Catalogue of bilingual questions                  */
/* -------------------------------------------------------------------------- */

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
      en: 'Any track record of these skills — projects, jobs, experiences?',
      es: '¿Tienes historial demostrable de estas habilidades — proyectos, empleos, experiencias?'
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
      en: "What are your preferences on: where you'd like to live, hours of work per week, remote work, working for others versus being self-employed?",
      es: '¿Cuáles son tus preferencias en cuanto a dónde vivir, horas de trabajo por semana, teletrabajo y trabajar por cuenta ajena versus ser autónomo?'
    },
    {
      id: 'economic.q2',
      en: 'What are your main financial responsibilities or constraints we should consider? E.g. family, health, savings.',
      es: '¿Cuáles son tus principales responsabilidades o limitaciones financieras que deberíamos considerar? Ej. familia, salud, ahorros.'
    }
  ]
} as const;

/* -------------------------------------------------------------------------- */
/*                             Helper Functions                               */
/* -------------------------------------------------------------------------- */

/**
 * Converts a QUESTIONS subsection into the shape <QuestionCard> expects.
 */
const buildRenderableQuestions = (
  entries: readonly { id: string; en: string; es: string }[],
  language: Language
): RenderableQuestion[] =>
  entries.map(({ id, en, es }) => ({
    id,
    type: 'textarea',
    title: language === 'en' ? en : es,
    required: true as const
  }));

/* -------------------------------------------------------------------------- */
/*                           Questionnaire Component                          */
/* -------------------------------------------------------------------------- */

export function Questionnaire({
  language,
  sessionId,
  onNavigate
}: QuestionnaireProps) {
  /* ---------------------------- Local component state --------------------- */
  const [currentStep, setCurrentStep] = useState<number>(1);

  /**
   * Map of raw textarea values keyed by questionId
   * Example: { 'skills.q2': 'Built an open-source library …' }
   */
  const [answers, setAnswers] = useState<Record<string, string>>({});

  /* ----------------------------- Persisted Results ------------------------ */
  const [, setResults] = useSessionStorage<AssessmentResults | null>(
    'results',
    null
  );

  /* ------------------------- Build wizard step metadata ------------------- */
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

  /* ------------------------------ Mutations ------------------------------- */
  const analyzeMutation = useMutation({
    mutationFn: async (payload: QuestionnaireResponses) => {
      const res = await apiRequest('POST', '/api/analyze', {
        sessionId,
        responses: payload
      });
      return (await res.json()) as AssessmentResults;
    },
    onSuccess: (data) => {
      setResults(data); // Persist for Results + later Action-Plan
      onNavigate('/results');
    },
    onError: (err) => {
      console.error('Purpose Discovery failed', err);
      // TODO: toast notification
    }
  });

  /* --------------------------- Event Handlers ----------------------------- */

  /** Update answer map whenever the user types. */
  const handleResponseChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  /** Click “Next” or “Complete” */
  const handleNext = () => {
    // Intermediate step: simply increment
    if (currentStep < steps.length) {
      setCurrentStep((s) => s + 1);
      return;
    }

    // Last step – construct rich payload & call backend
    const buildSection = (
      section: keyof typeof QUESTIONS
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

    // Cast is safe (shapes match) – retained to satisfy shared type import
    analyzeMutation.mutate(formatted as unknown as QuestionnaireResponses);
  };

  /** “Previous” button */
  const handlePrevious = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  /* -------------------------------- Render -------------------------------- */
  return (
    <>
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

      {/* Full-screen loader while Gemini does its thing */}
      <LoadingOverlay isVisible={analyzeMutation.isPending} language={language} />
    </>
  );
}

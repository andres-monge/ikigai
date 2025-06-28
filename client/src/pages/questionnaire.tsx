/**
 * @file questionnaire.tsx
 *
 * @description
 * Multi-step questionnaire page for the Purpose Discovery flow. This component
 * manages the user's progress through the questions and submits the final
 * payload for AI analysis.
 *
 * ✨ **Updates post-Step 21** ✨
 * - Aligned with the new session management by using `useSessionStorage` with
 * the key 'session' and the type `FullAssessment`.
 * - The `useCreateAssessment` hook is now correctly called with the `language` prop.
 * - The `onSuccess` callback now persists the entire `FullAssessment` object.
 * - Added toast notifications for error handling during the API call.
 *
 * @dependencies
 * - wouter: For navigation.
 * - @/hooks/use-session-storage: To persist session data.
 * - @/hooks/use-create-assessment: For the `useCreateAssessment` mutation.
 * - @/hooks/use-toast: For displaying notifications.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { QuestionCard } from '@/components/questionnaire/question-card';
import { LoadingOverlay } from '@/components/loading-overlay';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useCreateAssessment } from '@/hooks/use-create-assessment';
import { useToast } from '@/hooks/use-toast';
import { t, type Language } from '@/lib/i18n';
import type {
  QuestionnaireResponses,
  FullAssessment,
} from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Data Types & Interfaces                                                  */
/* -------------------------------------------------------------------------- */

interface QuestionAnswerPair {
  question: string;
  answer: string;
}

interface NewQuestionnaireResponses {
  passions: QuestionAnswerPair[];
  skills: QuestionAnswerPair[];
  values: QuestionAnswerPair[];
  economic: QuestionAnswerPair[];
}

interface RenderableQuestion {
  id: string;
  type: 'textarea';
  title: string;
  required: true;
}

interface StepDefinition {
  title: string;
  description: string;
  questions: RenderableQuestion[];
}

interface QuestionnaireProps {
  language: Language;
  sessionId: string;
  onNavigate: ReturnType<typeof useLocation>[1];
}

/* -------------------------------------------------------------------------- */
/* Catalogue of bilingual questions                                         */
/* -------------------------------------------------------------------------- */

const QUESTIONS = {
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
      en: 'Any track record of these skills — projects, jobs, experiences?',
      es: '¿Tienes historial demostrable de estas habilidades — proyectos, empleos, experiencias?',
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
/* Helper Functions                                                         */
/* -------------------------------------------------------------------------- */

const buildRenderableQuestions = (
  entries: readonly { id: string; en: string; es: string }[],
  language: Language,
): RenderableQuestion[] =>
  entries.map(({ id, en, es }) => ({
    id,
    type: 'textarea',
    title: language === 'en' ? en : es,
    required: true as const,
  }));

/* -------------------------------------------------------------------------- */
/* Questionnaire Component                                                  */
/* -------------------------------------------------------------------------- */

export function Questionnaire({
  language,
  sessionId,
  onNavigate,
}: QuestionnaireProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const [, setSession] = useSessionStorage<FullAssessment | null>(
    'session',
    null,
  );

  /* Build wizard step metadata */
  const steps: StepDefinition[] = [
    {
      title: t('step1.title', language),
      description: t('step1.description', language),
      questions: buildRenderableQuestions(QUESTIONS.passions, language),
    },
    {
      title: t('step2.title', language),
      description: t('step2.description', language),
      questions: buildRenderableQuestions(QUESTIONS.skills, language),
    },
    {
      title: t('step3.title', language),
      description: t('step3.description', language),
      questions: buildRenderableQuestions(QUESTIONS.values, language),
    },
    {
      title: t('step4.title', language),
      description: t('step4.description', language),
      questions: buildRenderableQuestions(QUESTIONS.economic, language),
    },
  ];

  const currentStepData = steps[currentStep - 1];

  /* Mutation Hook */
  const { createAssessment, isPending } = useCreateAssessment({
    sessionId,
    language,
    onSuccess: (data) => {
      setSession(data);
      onNavigate('/results');
    },
    onError: (err) => {
      console.error('Purpose Discovery failed', err);
      toast({
        title: t('common.error', language),
        description:
          'Could not complete the analysis. Please try again later.',
        variant: 'destructive',
      });
    },
  });

  /* Event Handlers */
  const handleResponseChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep((s) => s + 1);
      return;
    }

    const buildSection = (
      section: keyof typeof QUESTIONS,
    ): QuestionAnswerPair[] =>
      QUESTIONS[section].map(({ id, en, es }) => ({
        question: language === 'en' ? en : es,
        answer: (answers[id] ?? '').trim(),
      }));

    const formatted: NewQuestionnaireResponses = {
      passions: buildSection('passions'),
      skills: buildSection('skills'),
      values: buildSection('values'),
      economic: buildSection('economic'),
    };

    // Shape matches shared schema; cast keeps compiler happy re: alias import.
    createAssessment(formatted as QuestionnaireResponses);
  };

  const handlePrevious = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  /* Render */
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

      <LoadingOverlay isVisible={isPending} language={language} />
    </>
  );
}
/**
 * @file single-page-questionnaire.tsx
 *
 * @description
 * React component that renders the **entire** Purpose Finder questionnaire on
 * a single page.  This is the streamlined alternative to the now-deprecated
 * multi-step wizard found in `pages/questionnaire.tsx`.
 *
 * Key features implemented in **Steps 2 & 4** of the Implementation Plan:
 *  • Uses `react-textarea-autosize` so every answer box grows with content.  
 *  • Renders all eight questions in one go – no pagination, no progress bar.  
 *  • Handles submission by calling `useCreateAssessment`, then navigates to
 *    `/results` on success.  
 *  • Persists the returned `FullAssessment` object to `sessionStorage` under
 *    the `session` key so downstream pages can access it instantly.
 *  • Implements **simple grid layout** for the questions (Step 4) – a single
 *      column on **all** screen sizes using `grid grid-cols-1 gap-6`.
 *  • Styles the submit button with the brand’s `gradient-primary` utility
 *    (Step 4) so it visually aligns with other primary calls-to-action.
 *
 * The component is deliberately **self-contained**: the only required props
 * are the `language` (for i18n) and the anonymous `sessionId` used by the
 * backend.  Navigation is performed internally via `wouter`.
 *
 * @example
 * <SinglePageQuestionnaire language={language} sessionId={sessionId} />
 */

import { useState, type ChangeEvent, useMemo } from 'react';
import { useLocation } from 'wouter';
import TextareaAutosize from 'react-textarea-autosize';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingOverlay } from '@/components/loading-overlay';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useCreateAssessment } from '@/hooks/use-create-assessment';
import { useToast } from '@/hooks/use-toast';
import { t, type Language } from '@/lib/i18n';
import { QUESTIONS, buildFlatQuestionList } from './questions';
import type {
  QuestionnaireResponses,
  FullAssessment,
} from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Shape of a single answer once transformed for the API.
 */
interface QuestionAnswerPair {
  question: string;
  answer: string;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface SinglePageQuestionnaireProps {
  /** UI language – controls both labels and backend localisation */
  language: Language;
  /** Anonymous session identifier generated at application start-up */
  sessionId: string;
}

export function SinglePageQuestionnaire({
  language,
  sessionId,
}: SinglePageQuestionnaireProps) {
  /* --------------------------------- State -------------------------------- */
  /** Holds user-typed answers keyed by the question id */
  const [answers, setAnswers] = useState<Record<string, string>>({});

  /** Persisted `FullAssessment` once the backend returns */
  const [, setSession] = useSessionStorage<FullAssessment | null>(
    'session',
    null,
  );

  const { toast } = useToast();
  const [, navigate] = useLocation();

  /* ------------------------------ Build UI list --------------------------- */
  const flatQuestions = useMemo(() => buildFlatQuestionList(language), [language]);

  /* ----------------------------- Mutation Hook --------------------------- */
  const { createAssessment, isPending } = useCreateAssessment({
    sessionId,
    language,
    onSuccess: (data) => {
      sessionStorage.setItem('session', JSON.stringify(data));
      setSession(data);
      navigate('/results');
    },
    onError: (error) => {
      console.error('Purpose Discovery failed', error);
      toast({
        title: t('common.error', language),
        description: 'Could not complete the analysis. Please try again later.',
        variant: 'destructive',
      });
    },
  });

  /* ---------------------------- Event Handlers --------------------------- */
  const handleTextareaChange = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = () => {
    // Basic validation: ensure every required field is filled.
    const unanswered = flatQuestions.find(({ id }) => !answers[id]?.trim());
    if (unanswered) {
      toast({
        title: t('common.error', language),
        description: 'Please answer all questions before submitting.',
        variant: 'destructive',
      });
      return;
    }

    /* Build structure expected by the backend schema */
    const buildSection = (
      section: keyof typeof QUESTIONS,
    ): QuestionAnswerPair[] =>
      QUESTIONS[section].map(({ id, en, es }) => ({
        question: language === 'en' ? en : es,
        answer: (answers[id] ?? '').trim(),
      }));

    const payload: QuestionnaireResponses = {
      passions: buildSection('passions'),
      skills: buildSection('skills'),
      values: buildSection('values'),
      economic: buildSection('economic'),
    } as QuestionnaireResponses; // Explicit to silence TS widening.

    createAssessment(payload);
  };

  /* --------------------------------- Render ------------------------------ */
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">
        {t('welcome.subtitle', language)}
      </h2>

      <div className="grid grid-cols-1 gap-6">
        {flatQuestions.map(({ id, title }) => (
          <div key={id}>
            <Label htmlFor={id} className="block text-lg font-medium text-slate-900 mb-3 text-left">
              {title}
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <TextareaAutosize
              id={id}
              value={answers[id] || ''}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                handleTextareaChange(id, e.target.value)
              }
              className="w-full resize-none border rounded-md p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              minRows={3}
              maxRows={10}
              required
            />
          </div>
        ))}
      </div>

      <Button
        onClick={handleSubmit}
        className="mt-8 px-8 py-4 font-semibold shadow-lg hover:shadow-xl transition-all duration-200 gradient-primary text-primary-foreground"
      >
        {t('questionnaire.complete', language)}
      </Button>

      <LoadingOverlay isVisible={isPending} language={language} />
    </div>
  );
} 
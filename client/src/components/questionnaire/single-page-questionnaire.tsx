/**
 * @file single-page-questionnaire.tsx
 *
 * @description
 * React component that renders the **entire** Purpose Finder questionnaire on
 * a single page.  This is the streamlined alternative to the now-deprecated
 * multi-step wizard found in `pages/questionnaire.tsx`.
 *
 *  • Uses `react-textarea-autosize` so every answer box grows with content.  
 *  • Renders all eight questions in one go – no pagination, no progress bar.  
 *  • Handles submission by calling `useCreateAssessment` save-only endpoint,
 *    then navigates immediately to `/results` for streaming AI generation.
 *  • Clears existing session data to trigger streaming detection on the
 *    Results page for real-time AI analysis.
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
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useCreateAssessment } from '@/hooks/use-create-assessment';
import { useToast } from '@/hooks/use-toast';
import { useSoundEffect } from '@/hooks/use-sound-effect';
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

  /** Session storage state - set to null after save to trigger streaming */
  const [, setSession] = useSessionStorage<FullAssessment | null>(
    'session',
    null,
  );

  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { play: playPrimarySound } = useSoundEffect('/sounds/click-primary.mp3');

  /* ------------------------------ Build UI list --------------------------- */
  const flatQuestions = useMemo(() => buildFlatQuestionList(language), [language]);

  /* ----------------------------- Mutation Hook --------------------------- */
  const { createAssessment, isPending } = useCreateAssessment({
    sessionId,
    language,
    onSuccess: (data) => {
      // Clear any existing session data to ensure streaming is triggered
      setSession(null);
      
      // Navigate immediately to results page - sessionId comes from props
      navigate('/results');
    },
    onError: (error) => {
      console.error('Questionnaire save failed', error);
      toast({
        title: t('common.error', language),
        description: 'Could not save your responses. Please try again.',
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
      <h2 className="text-2xl text-slate-600 mb-6 text-left">
        {t('home.questionnaireTitle', language)}
      </h2>

      <div className="grid grid-cols-1 gap-6">
        {flatQuestions.map(({ id, title }) => (
          <div key={id}>
            <Label htmlFor={id} className="block text-lg font-medium text-slate-900 mb-3 text-left">
              {title}
            </Label>
            <TextareaAutosize
              id={id}
              value={answers[id] || ''}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                handleTextareaChange(id, e.target.value)
              }
              className="w-full resize-none border rounded-md p-3 bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              minRows={3}
              maxRows={10}
              required
            />
          </div>
        ))}
      </div>

      <Button
        onPointerDown={playPrimarySound}
        onClick={handleSubmit}
        disabled={isPending}
        className="mt-8 px-8 py-4 font-semibold shadow-lg hover:shadow-xl transition-all duration-200 bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? t('questionnaire.saving', language) : t('questionnaire.complete', language)}
      </Button>
    </div>
  );
} 
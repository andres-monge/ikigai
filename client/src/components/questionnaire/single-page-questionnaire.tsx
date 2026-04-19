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

import { useState, useRef, useEffect, type ChangeEvent, useMemo } from 'react';
import { useLocation } from 'wouter';
import TextareaAutosize from 'react-textarea-autosize';
import { Mic, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useCreateAssessment } from '@/hooks/use-create-assessment';
import { useToast } from '@/hooks/use-toast';
import { useSoundEffect } from '@/hooks/use-sound-effect';
import { useSpeechToText } from '@/hooks/use-speech-to-text';
import { useAnalytics } from '@/hooks/use-analytics';
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

  /* ------------------------------ Analytics ------------------------------- */
  const { trackEvent } = useAnalytics();

  /** Ref to ensure we only fire the 'start' event once per session. */
  const hasTrackedStart = useRef(false);

  /** Ref to track which sections have already fired completion events. */
  const trackedSections = useRef<Set<string>>(new Set());

  /**
   * Check section completion and fire analytics events.
   * A section is complete when all its questions have non-empty answers.
   */
  useEffect(() => {
    const sectionNames = Object.keys(QUESTIONS) as Array<keyof typeof QUESTIONS>;

    for (const section of sectionNames) {
      // Skip if already tracked
      if (trackedSections.current.has(section)) {
        continue;
      }

      // Check if all questions in this section have non-empty answers
      const sectionQuestions = QUESTIONS[section];
      const isComplete = sectionQuestions.every(
        (q) => answers[q.id]?.trim()
      );

      if (isComplete) {
        trackEvent('section', {
          section: section as 'passions' | 'skills' | 'values' | 'economic',
        });
        trackedSections.current.add(section);
      }
    }
  }, [answers, trackEvent]);

  /* ------------------------------ Speech-to-Text -------------------------- */
  const stt = useSpeechToText({
    language,
    onTranscription: (textareaId, text) => {
      setAnswers((prev) => {
        const existing = prev[textareaId] ?? '';
        // Smart separator: add a space only if existing text doesn't end with whitespace
        const separator = existing.length > 0 && existing.trimEnd() === existing ? ' ' : '';
        const newValue = existing + separator + text;
        // Trigger the start analytics event if this is the first content
        if (!hasTrackedStart.current && newValue.trim()) {
          trackEvent('start');
          hasTrackedStart.current = true;
        }
        return { ...prev, [textareaId]: newValue };
      });
    },
    onEmptyTranscription: () => {
      toast({
        title: t('questionnaire.mic.error.empty', language),
      });
    },
    onError: (message) => {
      // Map known error patterns to localized messages
      const localizedMessage = message.includes('denied')
        ? t('questionnaire.mic.error.permission', language)
        : t('questionnaire.mic.error.failed', language);
      toast({
        title: localizedMessage,
        variant: 'destructive',
      });
    },
  });

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
    // Track 'start' event on first non-empty answer
    if (!hasTrackedStart.current && value.trim()) {
      trackEvent('start');
      hasTrackedStart.current = true;
    }

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
    <div className="bg-ikigai-beige px-10 pt-5 pb-10 md:px-12 md:pt-8 md:pb-12 border-0 rounded-none">
      <div className="max-w-7xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-8 text-center">
        {t('home.questionnaireTitle', language)}
        <br />
        {t('home.questionnaireTitle2', language)}
      </h2>

      <div className="grid grid-cols-1 gap-6">
        {flatQuestions.map(({ id, title }) => {
          const isRecordingThis = stt.activeTextareaId === id && stt.recordingState === 'recording';
          const isProcessingThis = stt.activeTextareaId === id && stt.recordingState === 'processing';

          // Mic button aria-label based on state
          const micLabel = isRecordingThis
            ? t('questionnaire.mic.stop', language)
            : isProcessingThis
              ? t('questionnaire.mic.processing', language)
              : t('questionnaire.mic.start', language);

          return (
            <div key={id}>
              <Label htmlFor={id} className="block text-lg font-medium text-slate-900 mb-3 text-left">
                {title}
              </Label>
              <div className="relative">
                <TextareaAutosize
                  id={id}
                  value={answers[id] || ''}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    handleTextareaChange(id, e.target.value)
                  }
                  className={`w-full resize-none border border-dashed border-gray-400 rounded-none p-3 bg-white text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ikigai-teal${stt.isSupported ? ' pr-12' : ''}`}
                  minRows={3}
                  required
                />
                {stt.isSupported && (
                  <button
                    type="button"
                    aria-label={micLabel}
                    disabled={isProcessingThis}
                    onClick={() => {
                      if (isRecordingThis) {
                        stt.stopRecording();
                      } else {
                        stt.startRecording(id);
                      }
                    }}
                    className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 min-w-[44px] min-h-[44px] rounded-full transition-colors hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessingThis ? (
                      <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                    ) : (
                      <Mic
                        className={`w-5 h-5 ${
                          isRecordingThis
                            ? 'text-red-500 animate-pulse'
                            : 'text-gray-400'
                        }`}
                      />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          data-testid="questionnaire-submit"
          onPointerDown={playPrimarySound}
          onClick={handleSubmit}
          disabled={isPending || stt.recordingState !== 'idle'}
          variant="retro-teal"
          className="px-12 py-5 text-xl"
        >
          {isPending ? t('questionnaire.saving', language) : t('questionnaire.complete', language)}
        </Button>
        <p className="text-sm text-gray-500">{t('welcome.noAccount', language)}</p>
      </div>
      </div>
    </div>
  );
} 
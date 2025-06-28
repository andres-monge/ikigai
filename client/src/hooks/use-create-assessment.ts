/**
 * @file use-create-assessment.ts
 *
 * React-Query mutation hook for kick-starting the Purpose Discovery flow.
 *
 * This file was extracted from the former `use-assessment.ts` monolith in
 * Step 6 of the Implementation Plan.  The goal is to have one hook per
 * concern so the file remains small, focused and easier to reason about.
 *
 * Responsibilities:
 *  • POST the user's questionnaire responses to `/api/analyze`.
 *  • Return the hydrated `FullAssessment` object coming from the backend.
 *  • Expose a typed `createAssessment` mutation and a boolean `isPending` flag
 *    for UI state.
 *
 * Edge cases & error handling:
 *  • Network / server errors are surfaced via the caller-provided `onError`.
 *  • The hook itself does not swallow errors—letting React-Query bubble them
 *    up keeps the behaviour predictable.
 *
 * @see {@link ../../_docs/implementation_plan.md} – Phase 2, Step 6
 */

import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type {
  QuestionnaireResponses,
  FullAssessment,
} from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Public Types                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Options accepted by {@link useCreateAssessment}.
 */
export interface UseCreateAssessmentOptions {
  /**
   * Anonymous session identifier generated at application start-up.
   */
  sessionId: string;
  /**
   * UI language – forwarded to the AI so it can generate localised output.
   */
  language: 'en' | 'es';
  /**
   * Callback invoked when the backend responds with the full session object.
   */
  onSuccess?: (data: FullAssessment) => void;
  /**
   * Callback invoked when the request or server-side processing fails.
   */
  onError?: (error: unknown) => void;
}

/* -------------------------------------------------------------------------- */
/* Hook Implementation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * React hook exposing a mutation that sends questionnaire answers to the
 * server and resolves with the complete `FullAssessment`.
 */
export function useCreateAssessment({
  sessionId,
  language,
  onSuccess,
  onError,
}: UseCreateAssessmentOptions) {
  const mutation = useMutation({
    mutationFn: async (payload: QuestionnaireResponses) => {
      // Make the API request.  The helper automatically adds headers & JSON.
      const res = await apiRequest('POST', '/api/analyze', {
        sessionId,
        language,
        responses: payload,
      });
      // The backend always returns the fully-hydrated session record.
      return (await res.json()) as FullAssessment;
    },
    onSuccess,
    onError,
  });

  return {
    /** Trigger the analysis. */
    createAssessment: mutation.mutate,
    /** `true` while the request and AI processing are ongoing. */
    isPending: mutation.isPending,
  } as const;
} 
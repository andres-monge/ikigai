/**
 * @file use-create-assessment.ts
 *
 * React-Query mutation hook for saving questionnaire responses without AI generation.
 *
 * This file was extracted from the former `use-assessment.ts` monolith in
 * Step 6 of the Implementation Plan. Updated in Step 13.2 to use the save-only
 * endpoint for instant navigation to streaming experience.
 *
 * Responsibilities:
 *  • POST the user's questionnaire responses to `/api/questionnaire/save`.
 *  • Return a minimal response `{ sessionId, success }` for immediate navigation.
 *  • Expose a typed `createAssessment` mutation and a boolean `isPending` flag
 *    for UI state.
 *
 * Edge cases & error handling:
 *  • Network / server errors are surfaced via the caller-provided `onError`.
 *  • The hook itself does not swallow errors—letting React-Query bubble them
 *    up keeps the behaviour predictable.
 *
 * @see {@link ../../_docs/implementation_plan.md} – Phase 3, Step 13.2
 */

import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import type {
  QuestionnaireResponses,
} from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Public Types                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Zod schema for validating the save-only endpoint response.
 */
const SaveAssessmentResponseSchema = z.object({
  sessionId: z.string(),
  success: z.boolean(),
});

/**
 * Minimal response from the save-only endpoint.
 */
interface SaveAssessmentResponse {
  sessionId: string;
  success: boolean;
}

/**
 * Options accepted by {@link useCreateAssessment}.
 */
export interface UseCreateAssessmentOptions {
  /**
   * Anonymous session identifier generated at application start-up.
   */
  sessionId: string;
  /**
   * UI language – saved with the questionnaire responses.
   */
  language: 'en' | 'es';
  /**
   * Callback invoked when the backend saves the questionnaire successfully.
   */
  onSuccess?: (data: SaveAssessmentResponse) => void;
  /**
   * Callback invoked when the request or server-side processing fails.
   */
  onError?: (error: unknown) => void;
}

/* -------------------------------------------------------------------------- */
/* Hook Implementation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * React hook exposing a mutation that saves questionnaire answers without
 * AI generation, enabling instant navigation to streaming pages.
 */
export function useCreateAssessment({
  sessionId,
  language,
  onSuccess,
  onError,
}: UseCreateAssessmentOptions) {
  const mutation = useMutation({
    mutationFn: async (payload: QuestionnaireResponses) => {
      // Make the API request to the save-only endpoint.
      const res = await apiRequest('POST', '/api/questionnaire/save', {
        sessionId,
        language,
        responses: payload,
      });
      // Parse and validate the backend response for instant navigation.
      const rawData = await res.json();
      return SaveAssessmentResponseSchema.parse(rawData);
    },
    onSuccess,
    onError,
  });

  return {
    /** Save the questionnaire responses. */
    createAssessment: mutation.mutate,
    /** `true` while the save request is ongoing. */
    isPending: mutation.isPending,
  } as const;
} 
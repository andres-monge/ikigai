/**
 * @file use-assessment.ts
 *
 * @description
 * React-Query hooks for the Assessment / Purpose-Discovery workflow.
 * Step 19 introduces `useCreateAssessment`, which encapsulates the POST
 * request to `/api/analyze`. Later steps (21+) will add more hooks
 * (`useCreateActionPlan`, `useGetActionPlan`, …) in this same module.
 *
 * The hook:
 *   • Accepts the caller’s anonymous `sessionId` plus optional `onSuccess`
 *     and `onError` callbacks so calling components can react to outcomes
 *     (e.g. navigate, toast, write to storage) without duplicating the
 *     fetch logic itself.
 *   • Uses the `apiRequest` helper (centralised fetch wrapper) to ensure
 *     consistent headers / error handling across the SPA.
 *   • Returns only the `createAssessment` mutate function and the
 *     `isPending` status, matching the Step 19 acceptance criteria.
 *
 * @dependencies
 * - @tanstack/react-query v5: data-fetching & mutations
 * - apiRequest (client/src/lib/queryClient.ts): shared fetch helper
 *
 * @notes
 * - The hook is intentionally minimal: it does not persist results or
 *   navigate. That flexibility is left to the consumer via callbacks.
 * - Future hooks will follow the same pattern for consistency.
 */

import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type {
  QuestionnaireResponses,
  AssessmentResults
} from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/*                              Hook Definition                               */
/* -------------------------------------------------------------------------- */

/**
 * Options accepted by {@link useCreateAssessment}.
 */
export interface UseCreateAssessmentOptions {
  /**
   * Anonymous session identifier generated at app start-up.
   */
  sessionId: string;
  /**
   * Callback invoked when the backend successfully returns the full
   * Purpose-Discovery result object.
   */
  onSuccess?: (data: AssessmentResults) => void;
  /**
   * Callback invoked when the request or backend processing fails.
   */
  onError?: (error: unknown) => void;
}

/**
 * @function useCreateAssessment
 *
 * @description
 * React hook that exposes a mutation for creating a new assessment session
 * (Purpose Discovery run).  Internally posts the user’s questionnaire
 * responses to `/api/analyze` and resolves with the structured AI output.
 *
 * @returns
 * ```ts
 * {
 *   createAssessment: (payload: QuestionnaireResponses) => void;
 *   isPending: boolean;
 * }
 * ```
 *
 * @example
 * ```tsx
 * const { createAssessment, isPending } = useCreateAssessment({
 *   sessionId,
 *   onSuccess: (data) => {
 *     setResults(data);
 *     navigate('/results');
 *   }
 * });
 *
 * // …
 * createAssessment(questionnairePayload);
 * ```
 */
export function useCreateAssessment({
  sessionId,
  onSuccess,
  onError
}: UseCreateAssessmentOptions) {
  /**
   * Single source-of-truth mutation for the Purpose Discovery “analyze” call.
   * Handles POST, JSON parsing, and error propagation.
   */
  const mutation = useMutation({
    mutationFn: async (payload: QuestionnaireResponses) => {
      const res = await apiRequest('POST', '/api/analyze', {
        sessionId,
        responses: payload
      });

      // If the server returns non-2xx, apiRequest throws; otherwise parse JSON.
      return (await res.json()) as AssessmentResults;
    },
    onSuccess,
    onError
  });

  return {
    /**
     * Triggers the backend analysis. Accepts the full questionnaire payload.
     */
    createAssessment: mutation.mutate,
    /**
     * Boolean flag the UI can use to show spinners / disable buttons.
     */
    isPending: mutation.isPending
  };
}


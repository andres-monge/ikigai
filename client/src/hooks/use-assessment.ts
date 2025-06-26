/**
 * @file use-assessment.ts
 *
 * @description
 * React-Query hooks for the Assessment / Purpose-Discovery workflow.
 * This module encapsulates all mutations related to creating and updating an
 * assessment session, including the initial analysis and the subsequent
 * action plan generation.
 *
 * ✨ **Updates in Step 21** ✨
 * - Added the `useCreateActionPlan` hook to handle the "Choose Path" flow.
 * - Updated `useCreateAssessment` to expect the full `FullAssessment`
 * object from the backend, ensuring complete session data is handled.
 * - Added `UseCreateActionPlanOptions` type for the new hook.
 *
 * @dependencies
 * - @tanstack/react-query v5: For data-fetching & mutations.
 * - apiRequest (client/src/lib/queryClient.ts): A shared fetch helper.
 * - @/types/assessment: For custom frontend data types.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type {
  QuestionnaireResponses,
  FullAssessment,
} from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* useCreateAssessment                             */
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
   * The UI language, passed to the AI for generating localized content.
   */
  language: 'en' | 'es';
  /**
   * Callback invoked when the backend successfully returns the full
   * Purpose-Discovery result object.
   */
  onSuccess?: (data: FullAssessment) => void;
  /**
   * Callback invoked when the request or backend processing fails.
   */
  onError?: (error: unknown) => void;
}

/**
 * @function useCreateAssessment
 * @description React hook that exposes a mutation for creating a new assessment session.
 * It posts the user’s questionnaire responses to `/api/analyze` and resolves
 * with the full, structured AI output and session data.
 *
 * @returns An object with the `createAssessment` mutate function and `isPending` status.
 */
export function useCreateAssessment({
  sessionId,
  language,
  onSuccess,
  onError,
}: UseCreateAssessmentOptions) {
  const mutation = useMutation({
    mutationFn: async (payload: QuestionnaireResponses) => {
      const res = await apiRequest('POST', '/api/analyze', {
        sessionId,
        language,
        responses: payload,
      });
      // The backend returns the entire hydrated session object.
      return (await res.json()) as FullAssessment;
    },
    onSuccess,
    onError,
  });

  return {
    /**
     * Triggers the backend analysis. Accepts the full questionnaire payload.
     */
    createAssessment: mutation.mutate,
    /**
     * Boolean flag the UI can use to show spinners / disable buttons.
     */
    isPending: mutation.isPending,
  };
}

/* -------------------------------------------------------------------------- */
/* useCreateActionPlan                            */
/* -------------------------------------------------------------------------- */

/**
 * Options accepted by {@link useCreateActionPlan}.
 */
export interface UseCreateActionPlanOptions {
  /**
   * Anonymous session identifier.
   */
  sessionId: string;
  /**
   * Callback invoked when the backend successfully returns the session
   * object now containing the generated action plan.
   */
  onSuccess?: (data: FullAssessment) => void;
  /**
   * Callback invoked when the request or action plan generation fails.
   */
  onError?: (error: unknown) => void;
}

/**
 * @function useCreateActionPlan
 * @description React hook that exposes a mutation for generating an action plan.
 * It posts the chosen `pathId` to `/api/action-plan`.
 *
 * @returns An object with the `createActionPlan` mutate function and `isPending` status.
 */
export function useCreateActionPlan({
  sessionId,
  onSuccess,
  onError,
}: UseCreateActionPlanOptions) {
  const mutation = useMutation({
    mutationFn: async (chosenPathId: number) => {
      const res = await apiRequest('POST', '/api/action-plan', {
        sessionId,
        chosenPathId,
      });
      // The backend returns the updated session, now with an action plan.
      return (await res.json()) as FullAssessment;
    },
    onSuccess,
    onError,
  });

  return {
    /**
     * Triggers the backend action plan generation.
     * @param chosenPathId The numeric ID of the user's selected purpose path.
     */
    createActionPlan: mutation.mutate,
    /**
     * Boolean flag for showing loading states in the UI.
     */
    isPending: mutation.isPending,
  };
}

/* -------------------------------------------------------------------------- */
/* useGetActionPlan                               */
/* -------------------------------------------------------------------------- */

/**
 * @function useGetActionPlan
 * @description React hook that fetches the current session data including
 * the action plan if it exists. Used by the action plan page to display
 * the generated plan.
 *
 * @param sessionId - The session identifier to fetch data for
 * @returns Query object with session data and loading states
 */
export function useGetActionPlan(sessionId: string) {
  return useQuery({
    queryKey: ['/api/session', sessionId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/session/${sessionId}`);
      return (await res.json()) as FullAssessment;
    },
    enabled: !!sessionId,
  });
}
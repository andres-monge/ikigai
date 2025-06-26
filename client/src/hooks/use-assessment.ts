/**
 * @file use-assessment.ts
 *
 * @description
 * React-Query hooks for the Assessment / Purpose-Discovery workflow.
 * Step 19 introduces `useCreateAssessment`, which encapsulates the POST
 * request to `/api/analyze`. Step 21 adds `useCreateActionPlan` for the
 * next phase of the user journey.
 *
 * The hooks:
 * • Accept the caller’s anonymous `sessionId` plus optional `onSuccess`
 * and `onError` callbacks so calling components can react to outcomes
 * (e.g. navigate, toast, write to storage) without duplicating the
 * fetch logic itself.
 * • Use the `apiRequest` helper (centralised fetch wrapper) to ensure
 * consistent headers / error handling across the SPA.
 * • Return a `mutate` function and an `isPending` status.
 *
 * @dependencies
 * - @tanstack/react-query v5: data-fetching & mutations
 * - apiRequest (client/src/lib/queryClient.ts): shared fetch helper
 *
 * @notes
 * - The hooks are intentionally minimal: they do not persist results or
 * navigate. That flexibility is left to the consumer via callbacks.
 */

import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type {
  QuestionnaireResponses,
  AssessmentResults,
} from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* USE CREATE ASSESSMENT                           */
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
 * createAssessment: (payload: QuestionnaireResponses) => void;
 * isPending: boolean;
 * }
 * ```
 */
export function useCreateAssessment({
  sessionId,
  onSuccess,
  onError,
}: UseCreateAssessmentOptions) {
  const mutation = useMutation({
    mutationFn: async (payload: QuestionnaireResponses) => {
      const res = await apiRequest('POST', '/api/analyze', {
        sessionId,
        responses: payload,
      });
      return (await res.json()) as AssessmentResults;
    },
    onSuccess,
    onError,
  });

  return {
    createAssessment: mutation.mutate,
    isPending: mutation.isPending,
  };
}

/* -------------------------------------------------------------------------- */
/* USE CREATE ACTION PLAN                          */
/* -------------------------------------------------------------------------- */

/**
 * Payload for creating an action plan.
 */
export interface CreateActionPlanPayload {
  /**
   * The database ID of the user's chosen Purpose Path.
   */
  chosenPathId: number;
}

/**
 * Options accepted by {@link useCreateActionPlan}.
 */
export interface UseCreateActionPlanOptions {
  /**
   * Anonymous session identifier generated at app start-up.
   */
  sessionId: string;
  /**
   * Callback invoked when the backend successfully generates and returns
   * the action plan.
   */
  onSuccess?: (data: AssessmentResults) => void;
  /**
   * Callback invoked when the request or backend processing fails.
   */
  onError?: (error: unknown) => void;
}

/**
 * @function useCreateActionPlan
 *
 * @description
 * React hook that exposes a mutation for generating a detailed Action Plan
 * for a user's chosen Purpose Path. Internally posts the chosen path ID
 * to `/api/action-plan`.
 *
 * @returns
 * ```ts
 * {
 * createActionPlan: (payload: CreateActionPlanPayload) => void;
 * isPending: boolean;
 * }
 * ```
 */
export function useCreateActionPlan({
  sessionId,
  onSuccess,
  onError,
}: UseCreateActionPlanOptions) {
  const mutation = useMutation({
    mutationFn: async (payload: CreateActionPlanPayload) => {
      const res = await apiRequest('POST', '/api/action-plan', {
        sessionId,
        chosenPathId: payload.chosenPathId,
      });
      return (await res.json()) as AssessmentResults;
    },
    onSuccess,
    onError,
  });

  return {
    /**
     * Triggers the backend action plan generation.
     */
    createActionPlan: mutation.mutate,
    /**
     * Boolean flag the UI can use to show spinners / disable buttons.
     */
    isPending: mutation.isPending,
  };
}
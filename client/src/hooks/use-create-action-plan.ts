/**
 * @file use-create-action-plan.ts
 *
 * React-Query mutation hook responsible for triggering the Action-Plan
 * generation once the user selects a Purpose Path.
 *
 * Extracted from `use-assessment.ts` during Phase 2 – Step 6 so that each hook
 * is independently testable and maintains a single responsibility.
 *
 * ✨ **Updates in Step 29** ✨
 * - The hook now returns `mutateAsync` instead of `mutate`. This allows the
 *   calling component to `await` the mutation and handle navigation logic
 *   only after the asynchronous operation is complete.
 * - On success, it now invalidates the `['actionPlan', sessionId]` query to
 *   ensure the client has the freshest data before navigating.
 *
 * Behaviour:
 *  • POST `{ sessionId, chosenPathId }` to `/api/action-plan`.
 *  • Resolves with the updated `FullAssessment` object which now contains the
 *    generated `actionPlan` payload.
 *
 * Error handling follows the same contract as `useCreateAssessment` and is
 * delegated to React-Query's callbacks.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { FullAssessment } from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Public Types                                                               */
/* -------------------------------------------------------------------------- */

export interface UseCreateActionPlanOptions {
  /** Active anonymous session identifier. */
  sessionId: string;
  /** Success callback receiving the full, updated session. */
  onSuccess?: (data: FullAssessment) => void;
  /** Error callback for network / server issues. */
  onError?: (error: unknown) => void;
}

/* -------------------------------------------------------------------------- */
/* Hook Implementation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * React hook exposing a mutation that spawns the Action-Plan generation.
 *
 * @returns A mutation object containing:
 * - `createActionPlan`: An async function that takes a `chosenPathId` and
 *   returns a Promise resolving with the updated `FullAssessment`.
 * - `isPending`: A boolean indicating if the mutation is in flight.
 */
export function useCreateActionPlan({
  sessionId,
  onSuccess,
  onError,
}: UseCreateActionPlanOptions) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (chosenPathId: number) => {
      const res = await apiRequest('POST', '/api/action-plan', {
        sessionId,
        chosenPathId,
      });
      
      // Handle session not found error (likely due to server hot-reload)
      if (res.status === 404) {
        const errorData = await res.json();
        if (errorData.error === 'Session not found') {
          // Clear the stale session data
          sessionStorage.removeItem('session');
          
          // Throw a specific error that the UI can handle
          throw new Error('SESSION_LOST');
        }
      }
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      return (await res.json()) as FullAssessment;
    },
    onSuccess: (data) => {
      // Set the query data directly first to ensure it's immediately available
      queryClient.setQueryData(['actionPlan', sessionId], data);
      
      // Then invalidate to ensure any future queries are fresh
      queryClient.invalidateQueries({ queryKey: ['actionPlan', sessionId] });
      
      onSuccess?.(data);
    },
    onError,
  });

  return {
    createActionPlan: mutation.mutateAsync,
    isPending: mutation.isPending,
  } as const;
} 
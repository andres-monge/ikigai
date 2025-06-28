/**
 * @file use-create-action-plan.ts
 *
 * React-Query mutation hook responsible for triggering the Action-Plan
 * generation once the user selects a Purpose Path.
 *
 * Extracted from `use-assessment.ts` during Phase 2 – Step 6 so that each hook
 * is independently testable and maintains a single responsibility.
 *
 * Behaviour:
 *  • POST `{ sessionId, chosenPathId }` to `/api/action-plan`.
 *  • Resolve with the updated `FullAssessment` object which now contains the
 *    generated `actionPlan` payload.
 *
 * Error handling follows the same contract as `useCreateAssessment` and is
 * delegated to React-Query's callbacks.
 */

import { useMutation } from '@tanstack/react-query';
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
      return (await res.json()) as FullAssessment;
    },
    onSuccess: (data) => {
      onSuccess?.(data);
    },
    onError,
  });

  return {
    createActionPlan: mutation.mutate,
    isPending: mutation.isPending,
  } as const;
} 
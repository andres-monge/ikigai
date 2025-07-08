/**
 * @file use-get-action-plan.ts
 *
 * React-Query wrapper for reading the generated Action Plan from
 * `sessionStorage`.  The data is persisted locally after the backend returns
 * the full `FullAssessment` object, so a network call is unnecessary in the
 * MVP.
 *
 * Keeping this in its own file improves discoverability and paves the way for
 * an easy switch to a remote `GET /api/action-plan` endpoint once the backend
 * persists data in a proper database.
 */

import { useQuery } from '@tanstack/react-query';
import type { FullAssessment } from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Hook Implementation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * React hook that returns the stored session (including `actionPlan`) for the
 * provided `sessionId`.
 */
export function useGetActionPlan(sessionId: string) {
  return useQuery({
    queryKey: ['actionPlan', sessionId],
    queryFn: async (): Promise<FullAssessment | null> => {
      const stored = sessionStorage.getItem('session');
      if (!stored) return null;

      const session = JSON.parse(stored) as FullAssessment;
      
      // Ensure the data belongs to the current session and contains a plan.
      return session.sessionId === sessionId && session.actionPlan
        ? session
        : null;
    },
    staleTime: Infinity, // Data is static unless a new plan is generated
    gcTime: 1000 * 60 * 60, // 1 hour – balances memory usage and UX
  });
} 
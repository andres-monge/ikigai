/**
 * @file use-get-session.ts
 *
 * React-Query wrapper for reading the session data from sessionStorage.
 * Returns the full session including purpose paths and action plan (if available).
 * 
 * This hook is used by the Action Plan page to get session data for validation
 * and to determine whether streaming is needed.
 *
 * Keeping this in its own file improves discoverability and paves the way for
 * an easy switch to a remote `GET /api/session` endpoint once the backend
 * persists data in a proper database.
 */

import { useQuery } from '@tanstack/react-query';
import type { FullAssessment } from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Hook Implementation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * React hook that returns the stored session data for the provided `sessionId`.
 * Returns the session even if no action plan exists, enabling streaming logic to work.
 */
export function useGetSession(sessionId: string) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: async (): Promise<FullAssessment | null> => {
      const stored = sessionStorage.getItem('session');
      if (!stored) return null;

      const session = JSON.parse(stored) as FullAssessment;
      
      // Return session if it belongs to the current sessionId (no actionPlan requirement)
      return session.sessionId === sessionId ? session : null;
    },
    staleTime: Infinity, // Data is static unless a new plan is generated
    gcTime: 1000 * 60 * 60, // 1 hour – balances memory usage and UX
  });
}
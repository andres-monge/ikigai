import { useCallback } from 'react';
import { useSessionStorage } from './use-session-storage';

/**
 * Analytics event types supported by the system.
 * - visit: App first loads
 * - start: User enters their first answer
 * - section: User completes a questionnaire section
 * - export: User exports results (copy or PDF)
 * - start_over: User clicks Start Over
 */
type AnalyticsEventType = 'visit' | 'start' | 'section' | 'export' | 'start_over';

/**
 * Custom hook for tracking analytics events.
 *
 * Provides a `trackEvent` function that sends analytics data to the backend.
 * The fetch is fire-and-forget from the UI perspective - it never blocks
 * user interactions and silently catches any errors.
 *
 * @returns Object with a `trackEvent` function
 *
 * @example
 * ```tsx
 * const { trackEvent } = useAnalytics();
 *
 * // Track a simple event
 * trackEvent('visit');
 *
 * // Track an event with metadata
 * trackEvent('export', { page: 'results', type: 'pdf' });
 * ```
 */
export function useAnalytics() {
  const [sessionId] = useSessionStorage<string>('sessionId', '');

  /**
   * Sends an analytics event to the backend.
   * Fire-and-forget: does not await the response or throw errors.
   *
   * @param eventType - The type of event to track
   * @param metadata - Optional additional data for the event
   */
  const trackEvent = useCallback(
    (eventType: AnalyticsEventType, metadata?: Record<string, unknown>) => {
      // Don't send events if we don't have a session ID
      if (!sessionId) {
        return;
      }

      // Fire-and-forget fetch - we don't await or handle the response
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          eventType,
          metadata: metadata ?? {},
        }),
      }).catch(() => {
        // Silently ignore errors - analytics should never block the user
      });
    },
    [sessionId]
  );

  return { trackEvent };
}

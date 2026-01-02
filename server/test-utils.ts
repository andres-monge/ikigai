/**
 * @description
 * Test utilities for handling eventual consistency and async operations.
 *
 * These utilities help tests handle timing issues that can occur when:
 * - Database writes happen after HTTP responses complete (streaming endpoints)
 * - WebSocket-based connections have higher latency than local pools
 * - Async operations complete in non-deterministic order
 */

/**
 * Retry a database read until a condition is met or timeout is reached.
 * Useful for streaming endpoints where DB writes happen after HTTP response ends.
 *
 * @param readFn - Async function that reads from the database
 * @param condition - Predicate that returns true when the expected data is present
 * @param options - Retry configuration
 * @returns The result of readFn when condition is met
 * @throws Error if timeout is reached before condition is met
 *
 * @example
 * ```typescript
 * const session = await waitForCondition(
 *   () => storage.getAssessmentSessionBySessionId(sessionId),
 *   (session) => session?.coreDriversAnalysis !== null
 * );
 * ```
 */
export async function waitForCondition<T>(
  readFn: () => Promise<T>,
  condition: (result: T) => boolean,
  options: { maxAttempts?: number; delayMs?: number; timeoutMessage?: string } = {}
): Promise<T> {
  const { maxAttempts = 10, delayMs = 100, timeoutMessage = 'Condition not met within timeout' } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await readFn();
    if (condition(result)) {
      return result;
    }
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`${timeoutMessage} after ${maxAttempts} attempts`);
}

/**
 * Wait for a session to have coreDriversAnalysis populated.
 * Convenience wrapper for the common streaming test pattern.
 *
 * @param storage - The storage instance to query
 * @param sessionId - The session ID to check
 * @returns The hydrated session with coreDriversAnalysis populated
 */
export async function waitForSessionAnalysis(
  storage: { getAssessmentSessionBySessionId: (id: string) => Promise<any> },
  sessionId: string
): Promise<any> {
  return waitForCondition(
    () => storage.getAssessmentSessionBySessionId(sessionId),
    (session) => session?.coreDriversAnalysis !== null && session?.coreDriversAnalysis !== undefined,
    { timeoutMessage: `Session ${sessionId} coreDriversAnalysis not populated` }
  );
}

/**
 * Wait for a session to have actionPlan populated.
 * Convenience wrapper for the action plan streaming test pattern.
 *
 * @param storage - The storage instance to query
 * @param sessionId - The session ID to check
 * @returns The hydrated session with actionPlan populated
 */
export async function waitForSessionActionPlan(
  storage: { getAssessmentSessionBySessionId: (id: string) => Promise<any> },
  sessionId: string
): Promise<any> {
  return waitForCondition(
    () => storage.getAssessmentSessionBySessionId(sessionId),
    (session) => session?.actionPlan !== null && session?.actionPlan !== undefined,
    { timeoutMessage: `Session ${sessionId} actionPlan not populated` }
  );
}
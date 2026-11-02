/**
 * @description
 * Enhanced AI error logging utility for capturing comprehensive context
 * when AI streaming operations fail. Provides structured logging to help
 * debug AI generation issues with minimal overhead.
 */

import type { Language, QuestionnaireResponses, PurposePath } from '../../shared/schema.js';

/**
 * Error phases to track where in the streaming process failures occur
 */
export type ErrorPhase = 'setup' | 'streaming' | 'enrichment' | 'persistence';

/**
 * Supported streaming endpoints
 */
export type StreamingEndpoint = 'purpose-discovery' | 'action-plan';

/**
 * Parameters for AI stream error logging
 */
export interface AIStreamErrorContext {
  error: unknown;
  sessionId: string;
  endpoint: StreamingEndpoint;
  phase: ErrorPhase;
  userInput?: QuestionnaireResponses | PurposePath;
  language?: Language;
  timestamp?: Date;
}

export function logAIStreamError(context: AIStreamErrorContext): void {
  const allowedErrors = new Set([
    'Error', 'ValidationError', 'TransactionError', 'APICallError',
    'RetryError', 'AbortError', 'TimeoutError', 'NoOutputGeneratedError',
  ]);
  const name = context.error instanceof Error ? context.error.name : 'Error';
  console.error(JSON.stringify({
    type: 'ai_stream_error',
    endpoint: context.endpoint,
    phase: context.phase,
    errorClass: allowedErrors.has(name) ? name : 'ExternalProviderError',
  }));
}

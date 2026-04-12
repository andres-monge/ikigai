/**
 * @description
 * Enhanced AI error logging utility for capturing comprehensive context
 * when AI streaming operations fail. Provides structured logging to help
 * debug AI generation issues with minimal overhead.
 */

import type { Language, QuestionnaireResponses, PurposePath } from '../../shared/schema.js';
import { env } from '../env.js';

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

/**
 * Sanitizes user input by truncating to 100 characters to prevent log bloat
 * while preserving enough context for debugging.
 */
function sanitizeInput(input: any): string {
  const str = JSON.stringify(input);
  return str.length > 100 ? str.slice(0, 100) + '...' : str;
}

/**
 * Extracts error details in a structured format
 */
function extractErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const errorWithModelOutput = error as Error & {
      finishReason?: string;
      text?: string;
    };

    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3), // First 3 lines of stack
      finishReason: errorWithModelOutput.finishReason,
      rawTextPreview:
        typeof errorWithModelOutput.text === 'string'
          ? errorWithModelOutput.text.slice(0, 500)
          : undefined,
    };
  }
  
  return {
    name: 'UnknownError',
    message: String(error),
    stack: undefined,
  };
}

/**
 * Logs AI streaming errors with comprehensive context for debugging.
 * Outputs structured JSON to console for easy parsing by log aggregators.
 * 
 * @param context - Error context including session, endpoint, phase, and user input
 */
export function logAIStreamError(context: AIStreamErrorContext): void {
  const {
    error,
    sessionId,
    endpoint,
    phase,
    userInput,
    language,
    timestamp = new Date(),
  } = context;

  const logEntry = {
    timestamp: timestamp.toISOString(),
    level: 'error',
    type: 'ai_stream_error',
    session: {
      sessionId,
      language,
    },
    endpoint: {
      name: endpoint,
      phase,
    },
    error: extractErrorDetails(error),
    input: userInput ? sanitizeInput(userInput) : undefined,
    model: {
      id: env.GEMINI_REASONING_MODEL,
      temperature: env.GEMINI_TEMPERATURE,
    },
  };

  // Output structured JSON for easy parsing
  console.error(JSON.stringify(logEntry, null, 2));
}

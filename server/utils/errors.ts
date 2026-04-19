/**
 * @description
 * Structured error handling utilities for the Revelio application.
 * Provides consistent error formatting while preserving debugging information
 * for development/test environments and protecting users in production.
 */

/**
 * Custom error class for transaction-related failures
 * Preserves debugging information in test/development while providing
 * user-friendly messages in production
 */
export class TransactionError extends Error {
  public readonly code: string;
  public readonly details: any;
  public readonly sessionId?: string;
  public readonly isTestMode: boolean;

  constructor(
    userMessage: string, 
    code: string, 
    details?: any, 
    sessionId?: string
  ) {
    super(userMessage);
    this.name = 'TransactionError';
    this.code = code;
    this.details = details;
    this.sessionId = sessionId;
    this.isTestMode = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  }

  /**
   * Returns error object appropriate for the current environment
   * In test mode: includes debugging details
   * In production: only user-safe information
   */
  toJSON() {
    const base = { 
      error: this.message, 
      code: this.code,
      ...(this.sessionId && { sessionId: this.sessionId })
    };
    
    return this.isTestMode 
      ? { ...base, details: this.details }
      : base;
  }

  /**
   * Returns a response object suitable for Express.js responses
   */
  toResponse() {
    return this.toJSON();
  }
}

/**
 * Custom error class for streaming-related failures
 */
export class StreamingError extends TransactionError {
  constructor(
    userMessage: string,
    details?: any,
    sessionId?: string
  ) {
    super(userMessage, ERROR_CODES.STREAMING_ERROR, details, sessionId);
    this.name = 'StreamingError';
  }
}

/**
 * Custom error class for validation failures
 */
export class ValidationError extends TransactionError {
  constructor(
    userMessage: string,
    details?: any,
    sessionId?: string
  ) {
    super(userMessage, ERROR_CODES.VALIDATION_ERROR, details, sessionId);
    this.name = 'ValidationError';
  }
}

/**
 * Error codes for consistent error categorization
 */
export const ERROR_CODES = {
  // Standardized error codes for self-verifying loop
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TRANSACTION_ERROR: 'TRANSACTION_ERROR',
  STREAMING_ERROR: 'STREAMING_ERROR',
  CONCURRENCY_LIMIT_REACHED: 'CONCURRENCY_LIMIT_REACHED',
  TRANSCRIPTION_ERROR: 'TRANSCRIPTION_ERROR',

  // Legacy codes (maintain backward compatibility)
  PURPOSE_PATH_UPDATE_FAILED: 'PURPOSE_PATH_UPDATE_FAILED',
  ACTION_PLAN_UPDATE_FAILED: 'ACTION_PLAN_UPDATE_FAILED',
  STREAMING_FAILED: 'STREAMING_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DATABASE_TRANSACTION_FAILED: 'DATABASE_TRANSACTION_FAILED'
} as const;

/**
 * Helper function to wrap database transaction errors
 */
export function wrapTransactionError(
  error: unknown,
  operation: string,
  sessionId?: string
): TransactionError {
  const originalError = error instanceof Error ? error : new Error(String(error));
  
  return new TransactionError(
    getMessageForOperation(operation),
    getCodeForOperation(operation),
    {
      originalError: originalError.message,
      operation,
      stack: originalError.stack?.split('\n').slice(0, 5), // First 5 lines of stack
      timestamp: new Date().toISOString()
    },
    sessionId
  );
}

/**
 * Get user-friendly message based on operation type
 */
function getMessageForOperation(operation: string): string {
  switch (operation) {
    case 'purpose_path_update':
    case 'purpose_discovery':
      return 'Failed to save your analysis. Please try again.';
    case 'action_plan_update':
    case 'action_plan_generation':
      return 'Failed to save your action plan. Please try again.';
    case 'session_update':
      return 'Failed to update your session. Please try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/**
 * Get error code based on operation type
 */
function getCodeForOperation(operation: string): string {
  switch (operation) {
    case 'purpose_path_update':
    case 'purpose_discovery':
      return ERROR_CODES.TRANSACTION_ERROR;
    case 'action_plan_update':
    case 'action_plan_generation':
      return ERROR_CODES.TRANSACTION_ERROR;
    default:
      return ERROR_CODES.TRANSACTION_ERROR;
  }
}
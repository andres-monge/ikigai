/**
 * @description
 * Runtime input validation utilities for the Ikigai Finder application.
 * Provides comprehensive validation of session data before expensive AI operations,
 * implementing a "fail-fast" strategy to catch malformed data early.
 * 
 * This module uses existing Zod schemas from shared/schema.ts and the structured
 * error handling system from server/utils/errors.ts for consistent error responses.
 */

import { questionnaireResponsesSchema, type QuestionnaireResponses } from "@shared/schema";
import type { HydratedAssessmentSession } from "../storage";
import { ValidationError } from "./errors";

/**
 * Validates questionnaire responses structure and completeness
 * 
 * @param responses - Unknown input that should be QuestionnaireResponses
 * @returns Validated and typed QuestionnaireResponses object
 * @throws ValidationError with detailed information about validation failures
 * 
 * @example
 * ```typescript
 * try {
 *   const validResponses = validateQuestionnaireResponses(session.responses);
 *   // Proceed with AI processing
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     return res.status(400).json(error.toResponse());
 *   }
 * }
 * ```
 */
export function validateQuestionnaireResponses(responses: unknown): QuestionnaireResponses {
  // First check for basic presence
  if (!responses) {
    throw new ValidationError(
      "Questionnaire responses are required before AI processing",
      {
        field: "responses",
        received: responses,
        expected: "QuestionnaireResponses object"
      }
    );
  }

  // Use Zod schema for comprehensive validation
  const validation = questionnaireResponsesSchema.safeParse(responses);
  
  if (!validation.success) {
    // Extract meaningful error information from Zod
    const errors = validation.error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code
    }));

    // Check for common error patterns to provide helpful messages
    const missingCategories = errors
      .filter(err => err.code === 'invalid_type' && err.path.match(/^(passions|skills|values|economic)$/))
      .map(err => err.path);

    const emptyCategories = errors
      .filter(err => err.code === 'too_small' && err.path.match(/^(passions|skills|values|economic)$/))
      .map(err => err.path);

    let userMessage = "Questionnaire responses are incomplete or invalid";
    
    if (missingCategories.length > 0) {
      userMessage = `Missing required questionnaire sections: ${missingCategories.join(', ')}`;
    } else if (emptyCategories.length > 0) {
      userMessage = `Empty questionnaire sections detected: ${emptyCategories.join(', ')}. Each section must have at least one question-answer pair.`;
    }

    throw new ValidationError(
      userMessage,
      {
        validationErrors: errors,
        missingCategories,
        emptyCategories,
        received: typeof responses === 'object' ? Object.keys(responses as any) : typeof responses
      }
    );
  }

  return validation.data;
}

/**
 * Validates that a session has all required data for AI processing
 * 
 * @param session - The hydrated assessment session to validate
 * @throws ValidationError if session is missing required fields or has invalid data
 * 
 * @example
 * ```typescript
 * try {
 *   validateSessionForAI(session);
 *   // Proceed with AI chain call
 *   const result = await getPurposeDiscoveryChain(session.responses, session.language);
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     return res.status(400).json(error.toResponse());
 *   }
 * }
 * ```
 */
export function validateSessionForAI(session: HydratedAssessmentSession): void {
  // Validate language is present and valid
  if (!session.language) {
    throw new ValidationError(
      "Session language is required before AI processing",
      {
        sessionId: session.sessionId,
        field: "language",
        received: session.language
      }
    );
  }

  if (!['en', 'es'].includes(session.language)) {
    throw new ValidationError(
      "Session language must be 'en' or 'es'",
      {
        sessionId: session.sessionId,
        field: "language", 
        received: session.language,
        expected: "en | es"
      }
    );
  }

  // Validate questionnaire responses using dedicated function
  // This will throw ValidationError if validation fails
  try {
    validateQuestionnaireResponses(session.responses);
  } catch (error) {
    if (error instanceof ValidationError) {
      // Re-throw with session context
      throw new ValidationError(
        error.message,
        error.details,
        session.sessionId
      );
    }
    throw error;
  }
}

/**
 * Validates that a session has the necessary data for action plan generation
 * 
 * @param session - The hydrated assessment session to validate
 * @throws ValidationError if session is missing required data for action plan generation
 * 
 * @example
 * ```typescript
 * try {
 *   validateSessionForActionPlan(session);
 *   // Proceed with action plan generation
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     return res.status(400).json(error.toResponse());
 *   }
 * }
 * ```
 */
export function validateSessionForActionPlan(session: HydratedAssessmentSession): void {
  // First validate basic AI requirements
  validateSessionForAI(session);

  // Additional validation specific to action plan generation
  if (!session.purposePaths || session.purposePaths.length === 0) {
    throw new ValidationError(
      "Session must have purpose paths before generating action plan",
      {
        sessionId: session.sessionId,
        field: "purposePaths",
        received: session.purposePaths?.length || 0,
        expected: "At least 1 purpose path"
      }
    );
  }

  if (!session.coreDriversAnalysis) {
    throw new ValidationError(
      "Session must have core drivers analysis before generating action plan", 
      {
        sessionId: session.sessionId,
        field: "coreDriversAnalysis",
        received: session.coreDriversAnalysis,
        expected: "Core drivers analysis object"
      }
    );
  }
}
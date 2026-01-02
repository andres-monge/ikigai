/**
 * @description
 * Purpose path discovery endpoints:
 *  • POST /api/analyze/stream - generates core drivers & purpose paths (streaming)
 *  • POST /api/questionnaire/save - saves responses without AI generation
 * 
 * These endpoints handle the initial analysis phase where users receive
 * their core drivers analysis and three potential career paths.
 */

import { Router } from 'express';
import { z } from 'zod';
import { storage, type HydratedAssessmentSession } from '../../storage.js';
import {
  analysisRequestSchema,
  type PurposePath,
  type QuestionnaireResponses,
  purposePaths,
  assessmentSessions,
} from '../../../shared/schema.js';
import { getPurposeDiscoveryStreamChain } from '../../ai/chains/index.js';
import { aiLimiter } from '../../ai/limiter.js';
import {
  activeStreams,
  setupStreamConcurrencyControl,
  atomicPurposePathUpdate
} from './utils.js';
import { TransactionError, ValidationError, wrapTransactionError, ERROR_CODES } from '../../utils/errors.js';
import { logAIStreamError } from '../../utils/ai-logger.js';
import { validateSessionForAI } from '../../utils/validation.js';
import { db } from '../../db.js';
import { eq, inArray } from 'drizzle-orm';

export const purposeDiscoveryRouter = Router();


/* ----------------------- POST /api/analyze/stream ------------------------ */

/**
 * @route POST /api/analyze/stream
 * @description Streams AI-generated purpose discovery analysis using Vercel AI SDK.
 * 
 * Error Response Strategy:
 * - VALIDATION_ERROR: Request validation, session not found, invalid session data
 * - STREAMING_ERROR: AI generation failures, streaming interruptions
 * - CONCURRENCY_LIMIT_REACHED: Multiple streams for same session (handled by utils)
 * 
 * All error responses include structured metadata for frontend error handling.
 */
purposeDiscoveryRouter.post("/analyze/stream", async (req, res) => {
  // Validate request body
  const bodyValidation = z.object({ sessionId: z.string() }).safeParse(req.body);
  if (!bodyValidation.success) {
    return res.status(400).json({ 
      error: "Invalid request body",
      code: ERROR_CODES.VALIDATION_ERROR,
      details: bodyValidation.error.errors 
    });
  }
  
  const { sessionId } = bodyValidation.data;

  // Check for concurrent streams and set up concurrency control
  if (!setupStreamConcurrencyControl(sessionId, res)) {
    return; // Response already sent by setupStreamConcurrencyControl
  }

  let session: HydratedAssessmentSession | null = null;
  
  try {
    // Get the session data
    const sessionData = await storage.getAssessmentSessionBySessionId(sessionId);
    session = sessionData || null;
    if (!session) {
      return res.status(404).json({ 
        error: "Session not found",
        code: ERROR_CODES.VALIDATION_ERROR
      });
    }

    // Validate session data before expensive AI processing
    // ValidationError will bubble up to main catch block for consistent handling
    validateSessionForAI(session);

    // Start streaming with AI SDK
    try {
      // Get streamObject result with concurrency limiting
      const result = await aiLimiter(() => 
        getPurposeDiscoveryStreamChain(session!.responses as QuestionnaireResponses, session!.language!)
      );

      // Stream to client using AI SDK's text stream protocol
      result.pipeTextStreamToResponse(res);

      // Concurrently wait for the final validated object and save to database
      const finalObject = await result.object;

      if (finalObject) {
        // Save to database using atomic transaction (includes both paths and analysis)
        await atomicPurposePathUpdate(
          sessionId,
          session,
          finalObject.purposePaths,
          finalObject.coreDriversAnalysis
        );
      } else {
        throw new Error('Failed to get final object from stream');
      }

    } catch (error) {
      if (error instanceof TransactionError) {
        console.error('Streaming or database transaction error:', error.toJSON());
      } else {
        logAIStreamError({
          error,
          sessionId,
          endpoint: 'purpose-discovery',
          phase: 'streaming',
          userInput: session.responses as QuestionnaireResponses,
          language: session.language!,
        });
      }
      // Don't send additional responses - streaming may have already started
      throw error;
    }

  } catch (error) {
    // Check if response has already been sent to prevent headers error
    if (!res.headersSent) {
      if (error instanceof ValidationError) {
        console.error('Validation error during stream setup:', error.toJSON());
        res.status(400).json(error.toResponse());
      } else {
        logAIStreamError({
          error,
          sessionId,
          endpoint: 'purpose-discovery',
          phase: 'setup',
          language: session?.language,
        });
        res.status(500).json({ 
          error: 'Failed to start stream',
          code: ERROR_CODES.STREAMING_ERROR
        });
      }
    } else {
      // If headers already sent (streaming started), just log the error
      logAIStreamError({
        error,
        sessionId,
        endpoint: 'purpose-discovery',
        phase: 'streaming',
        userInput: session?.responses as QuestionnaireResponses,
        language: session?.language,
      });
    }
  } finally {
    // Always clean up the active stream marker
    activeStreams.delete(sessionId);
  }
});

/* ------------------------ POST /api/questionnaire/save ------------------------ */

/**
 * @route POST /api/questionnaire/save
 * @description Saves questionnaire responses without triggering AI generation.
 * This enables instant navigation to streaming pages by persisting user data
 * and clearing any existing AI-generated content to force fresh streaming.
 * 
 * @param {string} sessionId - Unique session identifier
 * @param {QuestionnaireResponses} responses - User's questionnaire responses
 * @param {Language} language - User's preferred language ('en' | 'es')
 * 
 * @returns {Object} Minimal response with sessionId and success status
 * @throws {ValidationError} When request data is invalid
 * @throws {TransactionError} When database operations fail
 */
purposeDiscoveryRouter.post("/questionnaire/save", async (req, res, next) => {
  try {
    const validation = analysisRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request data",
        code: ERROR_CODES.VALIDATION_ERROR,
        details: validation.error.errors,
      });
    }
    const { sessionId, responses, language } = validation.data;

    // Use database transaction for atomic operation
    await db.transaction(async (tx) => {
      // Check if session exists (within transaction to avoid race conditions)
      const [existingSession] = await tx.select()
        .from(assessmentSessions)
        .where(eq(assessmentSessions.sessionId, sessionId))
        .limit(1);
      
      if (existingSession) {
        // Get existing purpose paths for this session to delete them
        const existingPaths = await tx.select({ id: purposePaths.id })
          .from(purposePaths)
          .where(eq(purposePaths.assessmentId, existingSession.id));
        // Update existing session and clear ALL AI-generated data
        
        // Step 1: Delete all purpose paths for this assessment
        if (existingPaths.length > 0) {
          const oldPathIds = existingPaths.map(p => p.id);
          await tx.delete(purposePaths)
            .where(inArray(purposePaths.id, oldPathIds));
        }
        
        // Step 2: Update session with new responses and clear AI fields
        await tx.update(assessmentSessions)
          .set({
            responses: responses satisfies QuestionnaireResponses as unknown,
            language: language,
            coreDriversAnalysis: null,
            chosenPathId: null,
            actionPlan: null,
            updatedAt: new Date()
          })
          .where(eq(assessmentSessions.sessionId, sessionId));
          
      } else {
        // Create new session without any AI data
        await tx.insert(assessmentSessions)
          .values({
            sessionId,
            language,
            responses: responses satisfies QuestionnaireResponses as unknown,
            coreDriversAnalysis: null,
            chosenPathId: null,
            actionPlan: null,
            createdAt: new Date(),
            updatedAt: new Date()
          });
      }
    });

    // Return minimal response to avoid bypassing streaming detection
    res.json({ sessionId, success: true });
    
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json(err.toResponse());
    }
    if (err instanceof TransactionError) {
      return res.status(500).json(err.toResponse());
    }
    // Wrap database transaction errors with structured error handling
    // Extract sessionId from validated data if available
    const sessionIdForError = req.body?.sessionId || 'unknown';
    const wrappedError = wrapTransactionError(err, 'session_update', sessionIdForError);
    return res.status(500).json(wrappedError.toResponse());
  }
});
/**
 * @description
 * Purpose path discovery endpoints:
 *  • POST /api/analyze - generates core drivers & purpose paths (non-streaming)
 *  • GET /api/analyze/stream - generates core drivers & purpose paths (streaming)
 * 
 * These endpoints handle the initial analysis phase where users receive
 * their core drivers analysis and three potential career paths.
 */

import { Router } from "express";
import { storage, type HydratedAssessmentSession } from "../../storage";
import {
  analysisRequestSchema,
  type PurposePath,
  type QuestionnaireResponses,
  purposePaths,
  assessmentSessions,
} from "@shared/schema";
import { getPurposeDiscoveryChain, getPurposeDiscoveryStreamChain } from "../../ai/chains";
import { aiLimiter } from "../../ai/limiter";
import { parsePurposeDiscoveryStreamedText } from "../../ai/parsers/purpose-discovery.parser";
import { setSseHeaders, writeSseData, writeSseEvent, setupSseCleanup, writeSseError, SSE_EVENTS } from "../../utils/sse";
import { 
  activeStreams, 
  validateSessionForStreaming, 
  setupStreamConcurrencyControl, 
  atomicPurposePathUpdate 
} from "./utils";
import { TransactionError, ValidationError, wrapTransactionError } from "../../utils/errors";
import { validateSessionForAI } from "../../utils/validation";
import { db } from "../../db";
import { eq, inArray } from "drizzle-orm";
// Vercel AI SDK imports for streamObject
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamObject } from 'ai';
import { purposeDiscoveryResultSchema } from '../../ai/schemas';
import { getPurposeDiscoverySystemPrompt } from '../../ai/prompts';
import { env } from '../../env';

export const purposeDiscoveryRouter = Router();

/* --------------------------- POST /api/analyze --------------------------- */

purposeDiscoveryRouter.post("/analyze", async (req, res, next) => {
  try {
    const validation = analysisRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: validation.error.errors,
      });
    }
    const { sessionId, responses, language } = validation.data;

    // Upsert session
    let session = await storage.getAssessmentSessionBySessionId(sessionId);
    if (!session) {
      session = await storage.createAssessmentSession({
        sessionId,
        language,
        responses,
      });
    } else {
      await storage.updateAssessmentSession(sessionId, { responses, language });
      // Refresh session to get updated data
      session = await storage.getAssessmentSessionBySessionId(sessionId);
    }

    // Validate session data before expensive AI processing
    validateSessionForAI(session!);

    // AI orchestration (with concurrency limiting)
    const analysisResult = await aiLimiter(() => 
      getPurposeDiscoveryChain(responses, language)
    );

    // Atomic operation: create new paths, delete old ones, and save analysis
    await atomicPurposePathUpdate(
      sessionId, 
      session!, 
      analysisResult.purposePaths,
      analysisResult.coreDriversAnalysis
    );

    // Return hydrated session
    const fullSession = await storage.getAssessmentSessionBySessionId(sessionId);
    res.json(fullSession);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json(err.toResponse());
    }
    if (err instanceof TransactionError) {
      return res.status(500).json(err.toResponse());
    }
    next(err);
  }
});

/* ----------------------- GET /api/analyze/stream ------------------------ */

purposeDiscoveryRouter.get("/analyze/stream", async (req, res) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  // Check for concurrent streams and set up concurrency control
  if (!setupStreamConcurrencyControl(sessionId, res)) {
    return; // Response already sent by setupStreamConcurrencyControl
  }

  try {
    // Get the session data
    const session = await storage.getAssessmentSessionBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Validate session data before expensive AI processing
    // ValidationError will bubble up to main catch block for consistent handling
    validateSessionForAI(session);

    // Streaming-specific try-catch for AI operations
    try {

    // Set up Server-Sent Events headers
    setSseHeaders(res);

    // Send initial connection confirmation
    writeSseEvent(res, SSE_EVENTS.STREAM_START);

    // Handle client disconnect
    setupSseCleanup(req, res, sessionId, activeStreams);

    try {
      // Initialize Google provider for Vercel AI SDK
      const google = createGoogleGenerativeAI({
        apiKey: env.GEMINI_API_KEY,
      });

      // Start streaming with concurrency limiting using streamObject
      const result = await aiLimiter(() => 
        streamObject({
          model: google(env.GEMINI_REASONING_MODEL),
          schema: purposeDiscoveryResultSchema,
          prompt: getPurposeDiscoverySystemPrompt(
            session.responses as QuestionnaireResponses, 
            session.language!
          ),
          temperature: 0.3, // Lower temperature for more stable object generation
        })
      );

      // Stream JSON objects to the client as they arrive
      // Note: Frontend expects delimiter format but we're now sending JSON
      // This will be fixed in Step 16 when frontend migrates to useObject
      console.log(`[Step 15] Streaming JSON objects for session ${sessionId} - Frontend temporarily incompatible until Step 16`);
      
      for await (const partialObject of result.partialObjectStream) {
        // Send partial object as JSON through SSE
        writeSseData(res, JSON.stringify(partialObject));
      }

      // Stream completed successfully - now get final object and save to database
      writeSseEvent(res, SSE_EVENTS.STREAM_END);
      
      // Get the complete validated object from streamObject
      const finalObject = await result.object;
      
      if (finalObject) {
        // Save to database using atomic transaction (includes both paths and analysis)
        await atomicPurposePathUpdate(
          sessionId, 
          session, 
          finalObject.purposePaths,
          finalObject.coreDriversAnalysis
        );
        
        writeSseEvent(res, SSE_EVENTS.SAVE_SUCCESS);
      } else {
        throw new Error('Failed to generate complete object from streamObject');
      }

    } catch (error) {
      if (error instanceof TransactionError) {
        console.error('Streaming or database transaction error:', error.toJSON());
        writeSseError(res, error.message);
      } else {
        // Enhanced error logging for AI SDK streamObject
        console.error('StreamObject error:', {
          sessionId,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          // Log any additional context that might be helpful for debugging
          timestamp: new Date().toISOString(),
          model: env.GEMINI_REASONING_MODEL
        });
        writeSseError(res, 'Failed to generate or save your analysis. Please try again.');
      }
    }

    res.end();
    } catch (streamingError) {
      // Handle streaming-specific errors
      if (streamingError instanceof TransactionError) {
        console.error('Streaming transaction error:', streamingError.toJSON());
        writeSseError(res, streamingError.message);
      } else {
        console.error('General streaming error:', {
          sessionId,
          error: streamingError instanceof Error ? streamingError.message : streamingError,
          stack: streamingError instanceof Error ? streamingError.stack : undefined
        });
        writeSseError(res, 'Failed to complete streaming. Please try again.');
      }
      res.end();
    }

  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('Validation error during stream setup:', error.toJSON());
      res.status(400).json(error.toResponse());
    } else {
      console.error('Stream setup error:', error);
      res.status(500).json({ error: 'Failed to start stream' });
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
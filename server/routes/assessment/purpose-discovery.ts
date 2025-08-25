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
import { TransactionError } from "../../utils/errors";

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
    }

    // AI orchestration (with concurrency limiting)
    const analysisResult = await aiLimiter(() => 
      getPurposeDiscoveryChain(responses, language)
    );

    // Atomic operation: create new paths, delete old ones, and save analysis
    await atomicPurposePathUpdate(
      sessionId, 
      session, 
      analysisResult.purposePaths,
      analysisResult.coreDriversAnalysis
    );

    // Return hydrated session
    const fullSession = await storage.getAssessmentSessionBySessionId(sessionId);
    res.json(fullSession);
  } catch (err) {
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

    if (!session.responses || !session.language) {
      return res.status(400).json({ 
        error: "Session must have responses and language before streaming" 
      });
    }

    // Validate responses structure
    if (typeof session.responses !== 'object') {
      throw new Error('Invalid session responses format');
    }

    // Set up Server-Sent Events headers
    setSseHeaders(res);

    // Send initial connection confirmation
    writeSseEvent(res, SSE_EVENTS.STREAM_START);

    let fullText = '';

    // Handle client disconnect
    setupSseCleanup(req, res, sessionId, activeStreams);

    try {
      // Start streaming with concurrency limiting
      const streamGenerator = await aiLimiter(() => 
        getPurposeDiscoveryStreamChain(session.responses as QuestionnaireResponses, session.language!)
      );

      // Stream each chunk to the client while buffering for database
      for await (const chunk of streamGenerator) {
        fullText += chunk;
        
        // Send chunk to client using SSE format
        writeSseData(res, chunk);
      }

      // Stream completed successfully - now parse and save to database
      writeSseEvent(res, SSE_EVENTS.STREAM_END);
      
      // Parse the complete streamed text
      const parsedData = parsePurposeDiscoveryStreamedText(fullText);
      
      if (parsedData) {
        // Save to database using atomic transaction (includes both paths and analysis)
        await atomicPurposePathUpdate(
          sessionId, 
          session, 
          parsedData.purposePaths,
          parsedData.coreDriversAnalysis
        );
        
        writeSseEvent(res, SSE_EVENTS.SAVE_SUCCESS);
      } else {
        throw new Error('Failed to parse streamed response');
      }

    } catch (error) {
      if (error instanceof TransactionError) {
        console.error('Streaming or database transaction error:', error.toJSON());
        writeSseError(res, error.message);
      } else {
        console.error('Streaming error:', {
          sessionId,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });
        writeSseError(res, 'Failed to save your analysis. Please try again.');
      }
    }

    res.end();
  } catch (error) {
    console.error('Stream setup error:', error);
    res.status(500).json({ error: 'Failed to start stream' });
  } finally {
    // Always clean up the active stream marker
    activeStreams.delete(sessionId);
  }
});
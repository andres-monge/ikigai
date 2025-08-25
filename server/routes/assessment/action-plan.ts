/**
 * @description
 * Action plan generation endpoints:
 *  • POST /api/action-plan - generates step-by-step plan (non-streaming)
 *  • GET /api/action-plan/stream - generates step-by-step plan (streaming)
 * 
 * These endpoints handle the second phase where users receive detailed
 * milestone-based action plans for their chosen career path, including
 * YouTube video recommendations for skill development.
 */

import { Router } from "express";
import { storage, type HydratedAssessmentSession } from "../../storage";
import {
  actionPlanRequestSchema,
  type PurposePath,
} from "@shared/schema";
import { getActionPlanChain, getActionPlanStreamChain } from "../../ai/chains";
import { aiLimiter } from "../../ai/limiter";
import { getYoutubeVideosForSkills } from "../../services/youtube";
import { parseActionPlanStreamedText } from "../../ai/parsers/action-plan.parser";
import { setSseHeaders, writeSseData, writeSseEvent, setupSseCleanup, writeSseError, SSE_EVENTS } from "../../utils/sse";
import { 
  activeStreams, 
  setupStreamConcurrencyControl,
  atomicActionPlanUpdate 
} from "./utils";
import { TransactionError, ValidationError } from "../../utils/errors";
import { validateSessionForActionPlan } from "../../utils/validation";

export const actionPlanRouter = Router();

/* ------------------------ POST /api/action-plan ------------------------- */

actionPlanRouter.post("/action-plan", async (req, res, next) => {
  try {
    const validation = actionPlanRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: validation.error.errors,
      });
    }
    const { sessionId, chosenPathId } = validation.data;

    /* Retrieve fully-hydrated session */
    const session = await storage.getAssessmentSessionBySessionId(
      sessionId,
    ) as HydratedAssessmentSession | undefined;

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    /* Validate session data before expensive AI processing */
    validateSessionForActionPlan(session);

    /* Identify the chosen path by database ID */
    const chosenPath = session.purposePaths.find((p) => p.id === chosenPathId);
    
    if (!chosenPath) {
      return res
        .status(404)
        .json({ error: "Chosen path not found for this session" });
    }

    /* Generate action plan & persist atomically (with concurrency limiting) */
    const actionPlan = await aiLimiter(() => 
      getActionPlanChain(chosenPath as PurposePath, session.language)
    );
    
    // Use atomic function for consistent transaction handling
    await atomicActionPlanUpdate(sessionId, actionPlan, chosenPath.id);

    const updatedSession = await storage.getAssessmentSessionBySessionId(
      sessionId,
    );
    res.json(updatedSession);
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

/* --------------------- GET /api/action-plan/stream ---------------------- */

actionPlanRouter.get("/action-plan/stream", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const chosenPathId = req.query.chosenPathId as string;
  
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
    
    if (!session.language) {
      return res.status(400).json({ 
        error: "Session must have language set before streaming" 
      });
    }
    
    // Resolve the chosen path
    let chosenPath: PurposePath | undefined;
    
    // Use session's chosenPathId if available, otherwise require it in query
    if (session.chosenPathId) {
      chosenPath = session.purposePaths.find((p) => p.id === session.chosenPathId);
    } else if (chosenPathId) {
      const pathId = parseInt(chosenPathId, 10);
      if (isNaN(pathId)) {
        return res.status(400).json({ error: "chosenPathId must be a valid number" });
      }
      chosenPath = session.purposePaths.find((p) => p.id === pathId);
      
      // Note: chosenPathId will be persisted only after successful streaming
    } else {
      return res.status(400).json({ 
        error: "chosenPathId is required when not previously set in session" 
      });
    }
    
    if (!chosenPath) {
      return res.status(404).json({ 
        error: "Chosen path not found for this session" 
      });
    }
    
    // Validate session data before expensive AI processing
    // ValidationError will bubble up to main catch block for consistent handling
    validateSessionForActionPlan(session);
    
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
        getActionPlanStreamChain(chosenPath as PurposePath, session.language!)
      );
      
      // Stream each chunk to the client while buffering for database
      for await (const chunk of streamGenerator) {
        fullText += chunk;
        
        // Send chunk to client using SSE format
        writeSseData(res, chunk);
      }
      
      // Stream completed successfully
      writeSseEvent(res, SSE_EVENTS.STREAM_END);
      
      // Parse the complete streamed text
      const parsedData = parseActionPlanStreamedText(fullText);
      
      if (parsedData) {
        // Start enrichment phase - fetch YouTube videos
        writeSseEvent(res, SSE_EVENTS.ENRICH_START);
        
        // Extract all unique skills across milestones
        const allSkills = new Set<string>();
        parsedData.milestones.forEach(milestone => {
          milestone.skills.forEach(skillObj => {
            allSkills.add(skillObj.skill);
          });
        });
        
        // Fetch YouTube videos for all skills in one batch
        const skillsArray = Array.from(allSkills);
        const youtubeData = await getYoutubeVideosForSkills(skillsArray, session.language!);
        
        // Create a map for easy lookup
        const youtubeMap = new Map(
          youtubeData.map(item => [item.skill, item.videos])
        );
        
        // Enrich the parsed data with YouTube videos
        const enrichedData = {
          ...parsedData,
          milestones: parsedData.milestones.map(milestone => ({
            ...milestone,
            skills: milestone.skills.map(skillObj => ({
              skill: skillObj.skill,
              youtubeLinks: youtubeMap.get(skillObj.skill) || [],
            })),
          })),
        };
        
        // Save the enriched action plan to database atomically
        await atomicActionPlanUpdate(sessionId, enrichedData, chosenPath.id);
        
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
        writeSseError(res, 'Failed to save your action plan. Please try again.');
      }
    }
    
    res.end();
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
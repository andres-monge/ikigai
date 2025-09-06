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
import { z } from "zod";
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

/* --------------------- POST /api/action-plan/stream ---------------------- */

actionPlanRouter.post("/action-plan/stream", async (req, res) => {
  // Validate request body
  const bodyValidation = z.object({
    sessionId: z.string(),
    pathId: z.number().optional(),
  }).safeParse(req.body);
  
  if (!bodyValidation.success) {
    return res.status(400).json({
      error: "Invalid request body",
      code: "VALIDATION_ERROR",
      details: bodyValidation.error.errors 
    });
  }
  
  const { sessionId, pathId } = bodyValidation.data;

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
    validateSessionForActionPlan(session);
    
    // Resolve the chosen path
    let chosenPath: PurposePath | undefined;
    
    // Use provided pathId or fallback to session's chosenPathId
    const effectivePathId = pathId || session.chosenPathId;
    if (!effectivePathId) {
      return res.status(400).json({ 
        error: "pathId is required when not previously set in session" 
      });
    }
    
    chosenPath = session.purposePaths.find((p) => p.id === effectivePathId);
    if (!chosenPath) {
      return res.status(404).json({ 
        error: "Chosen path not found for this session" 
      });
    }

    // Start streaming with AI SDK
    try {
      // Get streamObject result with concurrency limiting
      const result = await aiLimiter(() => 
        getActionPlanStreamChain(chosenPath as PurposePath, session.language!)
      );

      // Stream to client using AI SDK's text stream protocol
      result.pipeTextStreamToResponse(res);

      // Concurrently wait for the final validated object
      const finalObject = await result.object;
      
      if (finalObject) {
        // YouTube enrichment post-processing
        let enrichedData = finalObject;
        
        try {
          // Extract all unique skills across milestones
          const allSkills = new Set<string>();
          finalObject.milestones.forEach(milestone => {
            if (milestone.skills) {
              milestone.skills.forEach(skillObj => {
                allSkills.add(skillObj.skill);
              });
            }
          });
          
          // Fetch YouTube videos for all skills in one batch
          if (allSkills.size > 0) {
            const skillsArray = Array.from(allSkills);
            const youtubeData = await getYoutubeVideosForSkills(skillsArray, session.language!);
            
            // Create a map for easy lookup
            const youtubeMap = new Map(
              youtubeData.map(item => [item.skill, item.videos])
            );
            
            // Enrich the validated data with YouTube videos
            enrichedData = {
              ...finalObject,
              milestones: finalObject.milestones.map(milestone => ({
                ...milestone,
                skills: milestone.skills?.map(skillObj => ({
                  skill: skillObj.skill,
                  youtubeLinks: youtubeMap.get(skillObj.skill) || [],
                })) || [],
              })),
            };
          }
        } catch (enrichmentError) {
          // If YouTube enrichment fails, use the base action plan without videos
          console.error('YouTube enrichment failed, saving base plan:', enrichmentError);
          enrichedData = finalObject;
        }
        
        // Save the enriched (or base) action plan to database atomically
        await atomicActionPlanUpdate(sessionId, enrichedData, chosenPath.id);
      } else {
        throw new Error('Failed to get final object from stream');
      }

    } catch (error) {
      if (error instanceof TransactionError) {
        console.error('Streaming or database transaction error:', error.toJSON());
      } else {
        console.error('Streaming error:', {
          sessionId,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
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
        console.error('Stream setup error:', error);
        res.status(500).json({ error: 'Failed to start stream' });
      }
    } else {
      // If headers already sent (streaming started), just log the error
      console.error('Error after streaming started:', error);
    }
  } finally {
    // Always clean up the active stream marker
    activeStreams.delete(sessionId);
  }
});
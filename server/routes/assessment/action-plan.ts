/**
 * @description
 * Action plan generation endpoints:
 *  • POST /api/action-plan/stream - generates step-by-step plan (streaming)
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
import { getActionPlanStreamChain } from "../../ai/chains";
import { aiLimiter } from "../../ai/limiter";
import { getYoutubeVideosForSkills } from "../../services/youtube";
import { 
  activeStreams, 
  setupStreamConcurrencyControl,
  atomicActionPlanUpdate 
} from "./utils";
import { TransactionError, ValidationError, YouTubeEnrichmentError, ERROR_CODES } from "../../utils/errors";
import { logAIStreamError } from "../../utils/ai-logger";
import { validateSessionForActionPlan } from "../../utils/validation";

export const actionPlanRouter = Router();


/* --------------------- POST /api/action-plan/stream ---------------------- */

/**
 * @route POST /api/action-plan/stream
 * @description Streams AI-generated action plan with YouTube video enrichment.
 * 
 * Error Response Strategy:
 * - VALIDATION_ERROR: Request validation, session not found, pathId issues, chosen path not found
 * - STREAMING_ERROR: AI generation failures, streaming interruptions
 * - CONCURRENCY_LIMIT_REACHED: Multiple streams for same session (handled by utils)
 * - YOUTUBE_ENRICHMENT_FAILED: YouTube API failures (graceful degradation, not sent to client)
 * 
 * All error responses include structured metadata for frontend error handling.
 */
actionPlanRouter.post("/action-plan/stream", async (req, res) => {
  // Validate request body
  const bodyValidation = z.object({
    sessionId: z.string(),
    pathId: z.number().optional(),
  }).safeParse(req.body);
  
  if (!bodyValidation.success) {
    return res.status(400).json({
      error: "Invalid request body",
      code: ERROR_CODES.VALIDATION_ERROR,
      details: bodyValidation.error.errors 
    });
  }
  
  const { sessionId, pathId } = bodyValidation.data;

  // Check for concurrent streams and set up concurrency control
  if (!setupStreamConcurrencyControl(sessionId, res)) {
    return; // Response already sent by setupStreamConcurrencyControl
  }

  let session: HydratedAssessmentSession | null = null;
  let chosenPath: PurposePath | undefined;

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
    validateSessionForActionPlan(session);
    
    // Resolve the chosen path
    
    // Use provided pathId or fallback to session's chosenPathId
    const effectivePathId = pathId || session.chosenPathId;
    if (!effectivePathId) {
      return res.status(400).json({ 
        error: "pathId is required when not previously set in session",
        code: ERROR_CODES.VALIDATION_ERROR
      });
    }
    
    chosenPath = session.purposePaths.find((p) => p.id === effectivePathId);
    if (!chosenPath) {
      return res.status(404).json({ 
        error: "Chosen path not found for this session",
        code: ERROR_CODES.VALIDATION_ERROR
      });
    }

    // Start streaming with AI SDK
    try {
      // Get streamObject result with concurrency limiting
      const result = await aiLimiter(() => 
        getActionPlanStreamChain(chosenPath as PurposePath, session!.language!)
      );

      // Stream to client using AI SDK's text stream protocol
      try {
        result.pipeTextStreamToResponse(res);
      } catch (streamError) {
        console.error('Text streaming failed:', {
          sessionId,
          error: streamError instanceof Error ? streamError.message : streamError,
          stack: streamError instanceof Error ? streamError.stack : undefined
        });
        // If streaming fails before starting, we can still send an error response
        if (!res.headersSent) {
          return res.status(500).json({ 
            error: 'Failed to start streaming',
            code: ERROR_CODES.STREAMING_ERROR
          });
        }
        // If streaming already started, we can't send JSON response
        throw streamError;
      }

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
          // Handle specific YouTube enrichment errors with detailed logging
          if (enrichmentError instanceof YouTubeEnrichmentError) {
            console.error('YouTube API enrichment failed:', enrichmentError.toJSON());
          } else if (enrichmentError instanceof Error && enrichmentError.message.includes('YouTube')) {
            console.error('YouTube service error during enrichment:', {
              sessionId,
              error: enrichmentError.message,
              stack: enrichmentError.stack?.split('\n').slice(0, 3),
              timestamp: new Date().toISOString()
            });
          } else {
            logAIStreamError({
              error: enrichmentError,
              sessionId,
              endpoint: 'action-plan',
              phase: 'enrichment',
              userInput: chosenPath,
              language: session.language!,
            });
          }
          
          // Graceful degradation: use the base action plan without videos
          enrichedData = finalObject;
        }
        
        // Save the enriched (or base) action plan to database atomically
        // Cast to ActionPlan type to handle optional skills difference
        const actionPlanData = {
          milestones: enrichedData.milestones.map(milestone => ({
            ...milestone,
            skills: milestone.skills || []
          }))
        };
        await atomicActionPlanUpdate(sessionId, actionPlanData, chosenPath.id);
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
          endpoint: 'action-plan',
          phase: 'streaming',
          userInput: chosenPath,
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
          endpoint: 'action-plan',
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
        endpoint: 'action-plan',
        phase: 'streaming',
        userInput: chosenPath,
        language: session?.language,
      });
    }
  } finally {
    // Always clean up the active stream marker
    activeStreams.delete(sessionId);
  }
});
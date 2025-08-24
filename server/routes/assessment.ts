/**
 * @description
 * Assessment-related HTTP endpoints:
 *  • /api/analyze   – generates core drivers & purpose paths
 *  • /api/action-plan – produces a step-by-step plan for the chosen path
 *
 *  ✨ Updates in Step 20 ✨
 *  ──────────────────────
 *  • Replaced unsafe `(session as any)` cast with the new
 *    `HydratedAssessmentSession` type imported from `storage.ts`.
 *  • The route now leverages strong typing to access `purposePaths`.
 *
 * @notes
 * All business logic remains the same; only types got stricter.
 */

import { Router } from "express";
import { storage, type HydratedAssessmentSession } from "../storage";
import {
  analysisRequestSchema,
  actionPlanRequestSchema,
  type PurposePath,
  type QuestionnaireResponses,
} from "@shared/schema";
import { getPurposeDiscoveryChain, getPurposeDiscoveryStreamChain, getActionPlanChain, getActionPlanStreamChain } from "../ai/chains";
import { aiLimiter } from "../ai/limiter";
import { getYoutubeVideosForSkills } from "../services/youtube";
import { parsePurposeDiscoveryStreamedText } from "../ai/parsers/purpose-discovery.parser";
import { parseActionPlanStreamedText, parseMilestoneSection } from "../ai/parsers/action-plan.parser";
import { setSseHeaders, writeSseData, writeSseEvent, setupSseCleanup, writeSseError, SSE_EVENTS } from "../utils/sse";

export const assessmentRouter = Router();

// Track active streaming sessions to prevent concurrent streams per session
const activeStreams = new Map<string, boolean>();

/* --------------------------- POST /api/analyze --------------------------- */

assessmentRouter.post("/analyze", async (req, res, next) => {
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

    // Atomic operation: track old paths, create new ones, then delete old ones
    const oldPathIds = session.purposePaths.map(p => p.id);
    const newPaths: PurposePath[] = [];
    try {
      // Create all new paths first (store in memory)
      for (const path of analysisResult.purposePaths) {
        const createdPath = await storage.createPurposePath({
          assessmentId: session.id,
          title: path.title,
          description: path.description,
          ikigaiAlignment: path.ikigaiAlignment,
          actionStrategy: path.actionStrategy,
        });
        newPaths.push(createdPath);
      }
      
      // Delete ONLY the old paths by their specific IDs
      for (const oldId of oldPathIds) {
        await storage.deletePurposePathById(oldId);
      }
    } catch (error) {
      // If path creation fails, clean up any paths we did create
      for (const createdPath of newPaths) {
        try {
          await storage.deletePurposePathById(createdPath.id);
        } catch (cleanupError) {
          console.error('Failed to cleanup created path during rollback:', cleanupError);
        }
      }
      throw error; // Re-throw the original error
    }

    // Save core-driver summary
    await storage.updateAssessmentSession(sessionId, {
      coreDriversAnalysis: analysisResult.coreDriversAnalysis,
    });

    // Return hydrated session
    const fullSession = await storage.getAssessmentSessionBySessionId(sessionId);
    res.json(fullSession);
  } catch (err) {
    next(err);
  }
});

/* ----------------------- GET /api/analyze/stream ------------------------ */

assessmentRouter.get("/analyze/stream", async (req, res) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  // Check for concurrent streams for this session
  if (activeStreams.get(sessionId)) {
    return res.status(429).json({ 
      error: "A stream is already in progress for this session" 
    });
  }

  // Mark this session as having an active stream
  activeStreams.set(sessionId, true);

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

    // Set up Server-Sent Events headers
    setSseHeaders(res);

    // Send initial connection confirmation
    writeSseEvent(res, SSE_EVENTS.STREAM_START);

    let fullText = '';

    // Handle client disconnect
    setupSseCleanup(req, res, sessionId, activeStreams);

    try {
      // Validate that responses has the correct structure
      if (!session.responses || typeof session.responses !== 'object') {
        throw new Error('Invalid session responses format');
      }

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
        // Save to database using atomic operations (same as non-streaming)
        const oldPathIds = session.purposePaths.map(p => p.id);
        const newPaths: PurposePath[] = [];
        
        try {
          // Create all new paths first
          for (const path of parsedData.purposePaths) {
            const createdPath = await storage.createPurposePath({
              assessmentId: session.id,
              title: path.title,
              description: path.description,
              ikigaiAlignment: path.ikigaiAlignment,
              actionStrategy: path.actionStrategy,
            });
            newPaths.push(createdPath);
          }
          
          // Delete old paths
          for (const oldId of oldPathIds) {
            await storage.deletePurposePathById(oldId);
          }
          
          // Save core drivers analysis
          await storage.updateAssessmentSession(sessionId, {
            coreDriversAnalysis: parsedData.coreDriversAnalysis,
          });
          
          writeSseEvent(res, SSE_EVENTS.SAVE_SUCCESS);
        } catch (saveError) {
          // Rollback any created paths
          for (const createdPath of newPaths) {
            try {
              await storage.deletePurposePathById(createdPath.id);
            } catch (cleanupError) {
              console.error('Failed to cleanup created path during rollback:', cleanupError);
            }
          }
          throw saveError;
        }
      } else {
        throw new Error('Failed to parse streamed response');
      }

    } catch (error) {
      console.error('Streaming error:', error);
      writeSseError(res, error instanceof Error ? error : 'Unknown error');
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


/* ------------------------ POST /api/action-plan ------------------------- */

assessmentRouter.post("/action-plan", async (req, res, next) => {
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

    /* Identify the chosen path by database ID */
    const chosenPath = session.purposePaths.find((p) => p.id === chosenPathId);
    
    if (!chosenPath) {
      return res
        .status(404)
        .json({ error: "Chosen path not found for this session" });
    }

    /* Generate action plan & persist (with concurrency limiting) */
    const actionPlan = await aiLimiter(() => 
      getActionPlanChain(chosenPath as PurposePath, session.language)
    );
    await storage.updateAssessmentSession(sessionId, {
      actionPlan,
      chosenPathId: chosenPath.id,
    });

    const updatedSession = await storage.getAssessmentSessionBySessionId(
      sessionId,
    );
    res.json(updatedSession);
  } catch (err) {
    next(err);
  }
});

/* --------------------- GET /api/action-plan/stream ---------------------- */
assessmentRouter.get("/action-plan/stream", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const chosenPathId = req.query.chosenPathId as string;
  
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }
  
  // Check for concurrent streams for this session
  if (activeStreams.get(sessionId)) {
    return res.status(429).json({ 
      error: "A stream is already in progress for this session" 
    });
  }
  
  // Mark this session as having an active stream
  activeStreams.set(sessionId, true);
  
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
        
        // Save the enriched action plan to database
        await storage.updateAssessmentSession(sessionId, {
          actionPlan: enrichedData,
          chosenPathId: chosenPath.id,
        });
        
        writeSseEvent(res, SSE_EVENTS.SAVE_SUCCESS);
      } else {
        throw new Error('Failed to parse streamed response');
      }
    } catch (error) {
      console.error('Streaming error:', error);
      writeSseError(res, error instanceof Error ? error : 'Unknown error');
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


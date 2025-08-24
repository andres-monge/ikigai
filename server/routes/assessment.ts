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
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Send initial connection confirmation
    res.write('data: [STREAM_START]\n\n');

    let fullText = '';

    // Handle client disconnect
    const cleanup = () => {
      activeStreams.delete(sessionId);
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('close', cleanup);

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
        res.write(`data: ${chunk}\n\n`);
      }

      // Stream completed successfully - now parse and save to database
      res.write('data: [STREAM_END]\n\n');
      
      // Parse the complete streamed text
      const parsedData = parseStreamedText(fullText);
      
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
          
          res.write('data: [SAVE_SUCCESS]\n\n');
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
      res.write(`data: [ERROR] ${error instanceof Error ? error.message : 'Unknown error'}\n\n`);
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

/**
 * Parses the streamed delimited text into structured data for database storage.
 * Returns null if parsing fails.
 */
function parseStreamedText(text: string) {
  try {
    const result = {
      coreDriversAnalysis: {
        statementSentence: '',
        coreThreads: '',
      },
      purposePaths: [] as Array<{
        title: string;
        description: string;
        ikigaiAlignment: {
          love: string;
          goodAt: string;
          worldNeeds: string;
          pay: string;
        };
        actionStrategy: string;
      }>,
    };

    // Parse Core Drivers section
    const coreDriversMatch = text.match(/\[SECTION:CORE_DRIVERS\]([\s\S]*?)\[END_SECTION\]/);
    if (coreDriversMatch) {
      const coreSection = coreDriversMatch[1];
      
      const statementMatch = coreSection.match(/\[STATEMENT\]([\s\S]*?)\[\/STATEMENT\]/);
      if (statementMatch) {
        result.coreDriversAnalysis.statementSentence = statementMatch[1].trim();
      }
      
      const threadsMatch = coreSection.match(/\[THREADS\]([\s\S]*?)\[\/THREADS\]/);
      if (threadsMatch) {
        result.coreDriversAnalysis.coreThreads = threadsMatch[1].trim();
      }
    }

    // Parse each path section
    for (let i = 1; i <= 3; i++) {
      const pathRegex = new RegExp(`\\[SECTION:PATH_${i}\\]([\\s\\S]*?)\\[END_SECTION\\]`);
      const pathMatch = text.match(pathRegex);
      
      if (pathMatch) {
        const pathSection = pathMatch[1];
        
        const titleMatch = pathSection.match(/\[TITLE\]([\s\S]*?)\[\/TITLE\]/);
        const descriptionMatch = pathSection.match(/\[DESCRIPTION\]([\s\S]*?)\[\/DESCRIPTION\]/);
        const actionStrategyMatch = pathSection.match(/\[ACTION_STRATEGY\]([\s\S]*?)\[\/ACTION_STRATEGY\]/);
        
        // Parse ikigai alignment
        const ikigaiMatch = pathSection.match(/\[IKIGAI\]([\s\S]*?)\[\/IKIGAI\]/);
        let ikigaiAlignment = {
          love: '',
          goodAt: '',
          worldNeeds: '',
          pay: '',
        };
        
        if (ikigaiMatch) {
          const ikigaiSection = ikigaiMatch[1];
          const loveMatch = ikigaiSection.match(/\[LOVE\]([\s\S]*?)\[\/LOVE\]/);
          const goodAtMatch = ikigaiSection.match(/\[GOOD_AT\]([\s\S]*?)\[\/GOOD_AT\]/);
          const worldNeedsMatch = ikigaiSection.match(/\[WORLD_NEEDS\]([\s\S]*?)\[\/WORLD_NEEDS\]/);
          const payMatch = ikigaiSection.match(/\[PAY\]([\s\S]*?)\[\/PAY\]/);
          
          if (loveMatch) ikigaiAlignment.love = loveMatch[1].trim();
          if (goodAtMatch) ikigaiAlignment.goodAt = goodAtMatch[1].trim();
          if (worldNeedsMatch) ikigaiAlignment.worldNeeds = worldNeedsMatch[1].trim();
          if (payMatch) ikigaiAlignment.pay = payMatch[1].trim();
        }
        
        if (titleMatch && descriptionMatch && actionStrategyMatch) {
          result.purposePaths.push({
            title: titleMatch[1].trim(),
            description: descriptionMatch[1].trim(),
            ikigaiAlignment,
            actionStrategy: actionStrategyMatch[1].trim(),
          });
        }
      }
    }

    // Validate that we got all required data
    if (result.coreDriversAnalysis.statementSentence && 
        result.coreDriversAnalysis.coreThreads && 
        result.purposePaths.length === 3) {
      return result;
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing streamed text:', error);
    return null;
  }
}

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
      
      // Persist the chosen path ID for future use
      if (chosenPath) {
        await storage.updateAssessmentSession(sessionId, {
          chosenPathId: pathId,
        });
      }
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
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });
    
    // Send initial connection confirmation
    res.write('data: [STREAM_START]\n\n');
    
    let fullText = '';
    
    // Handle client disconnect
    const cleanup = () => {
      activeStreams.delete(sessionId);
    };
    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('close', cleanup);
    
    try {
      // Start streaming with concurrency limiting
      const streamGenerator = await aiLimiter(() => 
        getActionPlanStreamChain(chosenPath as PurposePath, session.language!)
      );
      
      // Stream each chunk to the client while buffering for database
      for await (const chunk of streamGenerator) {
        fullText += chunk;
        
        // Send chunk to client using SSE format
        res.write(`data: ${chunk}\n\n`);
      }
      
      // Stream completed successfully
      res.write('data: [STREAM_END]\n\n');
      
      // Parse the complete streamed text
      const parsedData = parseActionPlanStreamedText(fullText);
      
      if (parsedData) {
        // Start enrichment phase - fetch YouTube videos
        res.write('data: [ENRICH_START]\n\n');
        
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
        
        res.write('data: [SAVE_SUCCESS]\n\n');
      } else {
        throw new Error('Failed to parse streamed response');
      }
    } catch (error) {
      console.error('Streaming error:', error);
      res.write(`data: [ERROR] ${error instanceof Error ? error.message : 'Unknown error'}\n\n`);
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

/**
 * Parses individual milestone sections from delimited text.
 */
function parseMilestoneSection(milestoneSection: string) {
  const titleMatch = milestoneSection.match(/\[TITLE\]([\s\S]*?)\[\/TITLE\]/);
  const timelineMatch = milestoneSection.match(/\[TIMELINE\]([\s\S]*?)\[\/TIMELINE\]/);
  const actionsMatch = milestoneSection.match(/\[ACTIONS\]([\s\S]*?)\[\/ACTIONS\]/);
  const skillsMatch = milestoneSection.match(/\[SKILLS\]([\s\S]*?)\[\/SKILLS\]/);
  
  if (!titleMatch || !timelineMatch || !actionsMatch) {
    return null; // Required fields missing
  }
  
  // Parse actions - split by bullet points and clean up
  const actionsText = actionsMatch[1].trim();
  const actions = actionsText
    .split('\n')
    .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
    .filter(line => line.length > 0);
  
  // Parse skills
  const skills: Array<{ skill: string; youtubeLinks: any[] }> = [];
  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    const skillMatches = skillsText.matchAll(/\[SKILL\]([\s\S]*?)\[\/SKILL\]/g);
    
    for (const skillMatch of skillMatches) {
      const skill = skillMatch[1].trim();
      if (skill) {
        skills.push({
          skill,
          youtubeLinks: [], // Will be populated during enrichment
        });
      }
    }
  }
  
  return {
    title: titleMatch[1].trim(),
    timeline: timelineMatch[1].trim(),
    actions,
    skills,
  };
}

/**
 * Parses the streamed delimited text into structured ActionPlan data for database storage.
 * Returns null if parsing fails.
 */
function parseActionPlanStreamedText(text: string) {
  try {
    const result = {
      milestones: [] as Array<{
        title: string;
        timeline: string;
        actions: string[];
        skills: Array<{
          skill: string;
          youtubeLinks: Array<{
            title: string;
            url: string;
            thumbnailUrl: string;
          }>;
        }>;
      }>,
    };
    
    // Parse each milestone section
    let milestoneIndex = 1;
    while (true) {
      const milestoneRegex = new RegExp(`\\[SECTION:MILESTONE_${milestoneIndex}\\]([\\s\\S]*?)\\[END_SECTION\\]`);
      const milestoneMatch = text.match(milestoneRegex);
      
      if (!milestoneMatch) {
        break; // No more milestones found
      }
      
      const milestone = parseMilestoneSection(milestoneMatch[1]);
      if (milestone) {
        result.milestones.push(milestone);
      } else {
        console.warn(`Failed to parse milestone ${milestoneIndex}, skipping`);
      }
      
      milestoneIndex++;
    }
    
    // Validate that we got at least one milestone
    if (result.milestones.length > 0) {
      return result;
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing action plan streamed text:', error);
    return null;
  }
}

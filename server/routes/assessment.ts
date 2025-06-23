/**
 * @description
 * This file defines the API routes for the assessment-related features of the Purpose Finder application.
 * It includes routes for submitting questionnaire responses and generating the core
 * purpose-path analysis, as well as generating a detailed action plan.
 * It acts as a simple orchestrator, calling the appropriate AI chain and storage methods.
 *
 * @dependencies
 * - express: For creating and managing the router.
 * - @shared/schema: Provides Zod schemas for request validation and TypeScript types.
 * - ../storage: The storage interface for database interactions.
 * - ../ai/chains: The high-level AI orchestration logic for analysis and action plans.
 */

import { Router } from "express";
import { storage } from "../storage";
import {
  analysisRequestSchema,
  actionPlanRequestSchema,
  type AssessmentSession,
  type PurposePath,
} from "@shared/schema";
import { getPurposeDiscoveryChain, getActionPlanChain } from "../ai/chains";

// Create a new router instance for assessment-related endpoints
export const assessmentRouter = Router();

/**
 * @endpoint POST /api/analyze
 * @description Triggers the main AI analysis to generate core drivers and purpose paths.
 * This endpoint is the orchestrator for the "Purpose Discovery" workflow.
 * It validates the user's input, calls the `getPurposeDiscoveryChain` which encapsulates
 * all the complex AI logic (including the two-call chain with function calling),
 * and then persists the complete, structured results to the in-memory storage.
 *
 * @body {AnalysisRequest} The request containing the sessionId, questionnaire responses, and language.
 *
 * @response {AssessmentSession} The updated session object with full analysis results, including
 * the core drivers summary, three purpose paths, and their associated salary data.
 */
assessmentRouter.post("/analyze", async (req, res, next) => {
  try {
    // 1. Validate the incoming request body against the Zod schema.
    const validation = analysisRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: validation.error.errors,
      });
    }
    const { sessionId, responses, language } = validation.data;

    // 2. Get existing session or create a new one to persist data.
    let session = await storage.getAssessmentSessionBySessionId(sessionId);
    if (!session) {
      session = await storage.createAssessmentSession({
        sessionId,
        language,
        responses,
      });
    } else {
      // If the user is re-submitting, update the session with the latest responses.
      await storage.updateAssessmentSession(sessionId, { responses, language });
    }

    // 3. Call the main AI orchestration chain.
    const analysisResult = await getPurposeDiscoveryChain(responses, language);

    // 4. Before storing new data, clear any previous analysis results for this session.
    await storage.deletePurposePathsByAssessmentId(session.id);

    // 5. Persist the new, validated AI-generated data to storage.
    for (const path of analysisResult.purposePaths) {
      const createdPath = await storage.createPurposePath({
        assessmentId: session.id,
        title: path.title,
        description: path.description,
        ikigaiAlignment: path.ikigaiAlignment,
        actionStrategy: path.actionStrategy,
      });

      const pathSalaryData = analysisResult.salaryData.find(
        (salary) => salary.title.toLowerCase() === path.title.toLowerCase(),
      );

      if (pathSalaryData) {
        await storage.createSalaryData({
          pathId: createdPath.id,
          entryLevel: pathSalaryData.entryLevel,
          midLevel: pathSalaryData.midLevel,
          seniorLevel: pathSalaryData.seniorLevel,
          location: pathSalaryData.location,
          sources: pathSalaryData.sources,
        });
      }
    }

    // 6. Update the main session object with the Core Drivers Analysis summary.
    await storage.updateAssessmentSession(sessionId, {
      coreDriversAnalysis: analysisResult.coreDriversAnalysis,
    });

    // 7. Retrieve the complete, hydrated session data and send it back to the client.
    const fullSessionData =
      await storage.getAssessmentSessionBySessionId(sessionId);

    res.json(fullSessionData);
  } catch (error) {
    // If any part of the chain fails, pass the error to the global error handler.
    next(error);
  }
});

/**
 * @endpoint POST /api/action-plan
 * @description Generates a detailed action plan for a user's chosen purpose path.
 *
 * @body {ActionPlanRequest} The request containing sessionId and chosenPathId.
 *
 * @response {AssessmentSession} The updated session object with the generated action plan.
 */
assessmentRouter.post("/action-plan", async (req, res, next) => {
  try {
    // 1. Validate the request body
    const validation = actionPlanRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: validation.error.errors,
      });
    }
    const { sessionId, chosenPathId } = validation.data;

    // 2. Fetch the session and all its related data (including purpose paths)
    const session = await storage.getAssessmentSessionBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // In MemStorage, purposePaths are hydrated directly onto the session object.
    const purposePaths = (session as any).purposePaths as (PurposePath & { salaryData: any[] })[];

    // 3. Find the specific path the user chose from the session's paths
    const chosenPath = purposePaths?.find((p) => p.id === chosenPathId);
    if (!chosenPath) {
      return res
        .status(404)
        .json({ error: "Chosen path not found for this session" });
    }

    // 4. Call the Action Plan AI chain with the chosen path details.
    const actionPlan = await getActionPlanChain(chosenPath, session.language);

    // 5. Save the generated plan and the chosen path ID to the session.
    await storage.updateAssessmentSession(sessionId, {
      actionPlan,
      chosenPathId: chosenPath.id,
    });

    // 6. Retrieve the latest, fully updated session data.
    const updatedSession =
      await storage.getAssessmentSessionBySessionId(sessionId);

    // 7. Return the updated session to the client.
    res.json(updatedSession);
  } catch (error) {
    // Forward any errors to the global error handler.
    next(error);
  }
});
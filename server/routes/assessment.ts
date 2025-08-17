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
} from "@shared/schema";
import { getPurposeDiscoveryChain, getActionPlanChain } from "../ai/chains";

export const assessmentRouter = Router();

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

    // AI orchestration
    const analysisResult = await getPurposeDiscoveryChain(responses, language);

    // Clear old paths & persist fresh ones
    await storage.deletePurposePathsByAssessmentId(session.id);
    for (const path of analysisResult.purposePaths) {
      const createdPath = await storage.createPurposePath({
        assessmentId: session.id,
        title: path.title,
        description: path.description,
        ikigaiAlignment: path.ikigaiAlignment,
        actionStrategy: path.actionStrategy,
      });
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

    /* Generate action plan & persist */
    const actionPlan = await getActionPlanChain(
      chosenPath as PurposePath,
      session.language,
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

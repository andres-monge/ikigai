/**
* @description
* This file defines the API routes for the assessment-related features of the Purpose Finder application.
* It includes routes for session management, submitting questionnaire responses, generating the core
* purpose-path analysis, and generating a detailed action plan. It orchestrates calls to the
* storage layer and the AI grounding wrapper.
*
* @dependencies
* - express: For creating and managing the router.
* - @shared/schema: Provides Zod schemas for request validation and TypeScript types.
* - ../storage: The storage interface for database interactions (currently in-memory).
* - ../grounding: The centralized wrapper for all Gemini API interactions.
*/

import { Router } from "express";
import { storage } from "../storage";
import { analysisRequestSchema, actionPlanRequestSchema } from "@shared/schema";
import {
generateAnalysisAndPaths,
fetchSalaryDataForPaths,
} from "../grounding";

// Create a new router instance for assessment-related endpoints
export const assessmentRouter = Router();

/**
* @endpoint POST /api/analyze
* @description Triggers the main AI analysis to generate core drivers and purpose paths.
* It coordinates getting a session, calling the Gemini wrapper for analysis, fetching
* salary data, and storing all results.
*
* @body {AnalysisRequest} The request containing the sessionId and questionnaire responses.
*
* @response {AssessmentSession} The updated session object with full analysis results.
*/
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

// 1. Get existing session or create a new one.
let session = await storage.getAssessmentSessionBySessionId(sessionId);
if (!session) {
session = await storage.createAssessmentSession({
sessionId,
language,
responses,
});
} else {
// Update session with latest responses if it already exists
await storage.updateAssessmentSession(sessionId, { responses, language });
}

// 2. Call the Gemini wrapper to get the core analysis and purpose paths.
const analysisResult = await generateAnalysisAndPaths(responses, language);

// 3. Clear any previous paths/salaries for this session before adding new ones.
await storage.deletePurposePathsByAssessmentId(session.id);

// 4. Store the new Purpose Paths and get their IDs.
const createdPaths = [];
for (const path of analysisResult.purposePaths) {
const createdPath = await storage.createPurposePath({
assessmentId: session.id,
...path,
});
createdPaths.push(createdPath);
}

// 5. Fetch salary data for the newly created paths using the grounding wrapper.
const salaryResults = await fetchSalaryDataForPaths(createdPaths, language);

// 6. Store salary data.
for (const salary of salaryResults) {
await storage.createSalaryData(salary);
}

// 7. Update the session with the core drivers analysis.
const updatedSession = await storage.updateAssessmentSession(sessionId, {
coreDriversAnalysis: analysisResult.coreDriversAnalysis,
});

if (!updatedSession) {
return res.status(404).json({ error: "Session not found after update" });
}

// 8. Retrieve the full session data with all relations (paths, salaries).
const fullSessionData =
await storage.getAssessmentSessionBySessionId(sessionId);

res.json(fullSessionData);
} catch (error) {
// Forward the error to the global error handler
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
const validation = actionPlanRequestSchema.safeParse(req.body);
if (!validation.success) {
return res
.status(400)
.json({
error: "Invalid request data",
details: validation.error.errors,
});
}
// const { sessionId, chosenPathId } = validation.data;

// This endpoint will be fully implemented in a future step (Step 8).
// The logic will be similar to /analyze, orchestrating calls to:
// 1. `storage` to get session and chosen path.
// 2. `grounding.generateActionPlanForPath` to get the plan from the AI.
// 3. `storage` to save the generated plan to the session.
// 4. Return the updated session.

res.status(501).json({ message: "Not Implemented" });
} catch (error) {
// Forward the error to the global error handler
next(error);
}
});
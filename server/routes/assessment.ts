/**
 * @description
 * This file defines the API routes for the assessment-related features of the Purpose Finder application.
 * It includes routes for session management, submitting questionnaire responses, and generating the core
 * purpose-path analysis.
 *
 * @dependencies
 * - express: For creating and managing the router.
 * - @shared/schema: Provides Zod schemas for request validation.
 * - ../storage: The storage interface for database interactions (currently in-memory).
 */

import { Router } from "express";
import { storage } from "../storage";
import {
  analysisRequestSchema,
  actionPlanRequestSchema,
  questionnaireResponsesSchema,
} from "@shared/schema";
import type { AnalysisRequest, QuestionnaireResponses } from "@shared/schema";

// Create a new router instance for assessment-related endpoints
export const assessmentRouter = Router();

// A simple utility to generate a new session ID.
function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * @endpoint POST /api/sessions
 * @description Creates a new assessment session or retrieves an existing one.
 * This is typically the first endpoint called by the client to initialize the process.
 *
 * @body { sessionId?: string } - An optional existing session ID.
 *
 * @response {AssessmentSession} The created or retrieved session object.
 */
assessmentRouter.post("/sessions", async (req, res) => {
  try {
    const sessionId = req.body.sessionId || generateSessionId();

    let session = await storage.getAssessmentSessionBySessionId(sessionId);
    if (!session) {
      session = await storage.createAssessmentSession({
        sessionId,
        language: req.body.language || "en", // Default to 'en' if not provided
      });
    }

    res.json(session);
  } catch (error) {
    console.error("Failed to create or get session:", error);
    res.status(500).json({ error: "Failed to create or get session" });
  }
});

/**
 * @endpoint POST /api/responses
 * @description Saves the user's questionnaire responses to their session.
 *
 * @body {AnalysisRequest} The request containing the sessionId and questionnaire responses.
 *
 * @response {AssessmentSession} The updated session object.
 */
assessmentRouter.post("/responses", async (req, res) => {
  try {
    const validation = analysisRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: validation.error.errors,
      });
    }

    const { sessionId, responses } = validation.data;

    const session = await storage.updateAssessmentSession(sessionId, {
      responses,
    });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json(session);
  } catch (error) {
    console.error("Failed to save responses:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @endpoint POST /api/analyze
 * @description Triggers the main AI analysis to generate core drivers and purpose paths.
 *
 * @body {AnalysisRequest} The request containing the sessionId and questionnaire responses.
 *
 * @response {AssessmentSession} The updated session object with analysis results.
 */
assessmentRouter.post("/analyze", async (req, res) => {
  try {
    const validation = analysisRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: validation.error.errors,
      });
    }
    const { sessionId, responses, language } = validation.data;

    // 1. Get existing session
    let session = await storage.getAssessmentSessionBySessionId(sessionId);
    if (!session) {
      // Or create if it doesn't exist (e.g., user starts on a deep link)
      session = await storage.createAssessmentSession({
        sessionId,
        language,
        responses,
      });
    } else {
       // Update session with latest responses
      await storage.updateAssessmentSession(sessionId, { responses, language });
    }

    // 2. Call Gemini API for analysis
    const analysisResult = await generateAnalysis(responses, language);

    // 3. Clear any previous paths/salaries for this session before adding new ones
    await storage.deletePurposePathsByAssessmentId(session.id);

    // 4. Store the new Purpose Paths and get their IDs
    const createdPaths = [];
    for (const path of analysisResult.purposePaths) {
      const createdPath = await storage.createPurposePath({
        assessmentId: session.id,
        ...path,
      });
      createdPaths.push(createdPath);
    }

    // 5. Fetch salary data for the newly created paths
    const salaryResults = await fetchSalaryData(createdPaths);

    // 6. Store salary data
    for (const salary of salaryResults) {
        await storage.createSalaryData(salary);
    }

    // 7. Update the session with the core drivers analysis
    const updatedSession = await storage.updateAssessmentSession(sessionId, {
        coreDriversAnalysis: analysisResult.coreDriversAnalysis,
    });

    if (!updatedSession) {
      return res.status(404).json({ error: "Session not found after update" });
    }

    // 8. Retrieve the full session data with all relations
    const fullSessionData = await storage.getAssessmentSessionBySessionId(sessionId);

    res.json(fullSessionData);
  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).json({ error: "Failed to generate analysis" });
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
assessmentRouter.post("/action-plan", async (req, res) => {
    // This endpoint will be fully implemented in a future step.
    try {
        const validation = actionPlanRequestSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Invalid request data', details: validation.error.errors });
        }
        // const { sessionId, chosenPathId } = validation.data;

        // In the future:
        // 1. Get session and chosen path from storage.
        // 2. Call Gemini wrapper with a prompt to generate the action plan.
        // 3. Use search tool for YouTube resources.
        // 4. Store the result in the assessment_sessions table.
        // 5. Return the updated session.

        res.status(501).json({ message: "Not Implemented" });
    } catch (error) {
        console.error("Action Plan error:", error);
        res.status(500).json({ error: "Failed to generate action plan" });
    }
});


// ================== HELPER FUNCTIONS ==================
// Note: These will be moved to a dedicated `grounding.ts` wrapper in a future step.

async function generateAnalysis(responses: QuestionnaireResponses, language: 'en' | 'es') {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || "models/gemini-1.5-flash-preview-0514";

  if (!geminiApiKey) {
    throw new Error("Gemini API key not configured");
  }

  const langInstruction = language === 'es' 
    ? "IMPORTANT: The user has selected Spanish. All output, including analysis and path details, must be in Spanish."
    : "IMPORTANT: The user has selected English. All output must be in English.";

  const prompt = `
You are Nami, an AI career guide inspired by Paul Graham's wisdom and stoic principles.
${langInstruction}
Analyze the following questionnaire responses and provide:

1.  A "Core Drivers" summary with four keys: 'energy' (what they love), 'edge' (what they are good at), 'impact' (what the world needs that they can provide), and 'economic' (their financial reality). Each should be a concise paragraph.
2.  Three distinct "Purpose Paths" aligned with ikigai principles. For each path, provide a 'title', a 'description', a high-level 'actionStrategy', and an 'ikigaiAlignment' object with four keys ('love', 'goodAt', 'worldNeeds', 'pay').

User Responses: ${JSON.stringify(responses, null, 2)}

Please respond ONLY with a valid JSON object in the following format. Do not include markdown ticks or any other text outside the JSON structure.
{
  "coreDriversAnalysis": {
    "energy": "...",
    "edge": "...",
    "impact": "...",
    "economic": "..."
  },
  "purposePaths": [
    {
      "title": "Path Title 1",
      "description": "...",
      "ikigaiAlignment": {
        "love": "...",
        "goodAt": "...",
        "worldNeeds": "...",
        "pay": "..."
      },
      "actionStrategy": "..."
    }
  ]
}
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Gemini API Error Response:", errorBody);
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error("No content received from Gemini API");
  }
  return JSON.parse(content);
}

async function fetchSalaryData(purposePaths: any[]) {
    // In a real implementation, this would use web search APIs to get current salary data.
    // For now, return structured placeholder data linked to the created path IDs.
    return purposePaths.map(path => ({
        pathId: path.id, // Link to the newly created path
        entryLevel: "Entry level salary range (placeholder)",
        midLevel: "Mid level salary range (placeholder)",
        seniorLevel: "Senior level salary range (placeholder)",
        location: "Global (Remote)",
        sources: [
            "https://glassdoor.com/salaries",
            "https://levels.fyi",
            "https://indeed.com/salaries"
        ]
    }));
}
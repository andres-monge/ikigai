/**
 * @description
 * This file defines the API routes for the chat-related features of the Purpose Finder application.
 * It allows users to interact with the AI assistant, "Nami," to refine their results.
 *
 * @dependencies
 * - express: For creating and managing the router.
 * - @shared/schema: Provides Zod schemas for request validation.
 * - ../storage: The storage interface for database interactions.
 */

import { Router } from "express";
import { storage } from "../storage";
import { chatRequestSchema } from "@shared/schema";
import type { ChatRequest } from "@shared/schema";

// Create a new router instance for chat-related endpoints
export const chatRouter = Router();

/**
 * @endpoint GET /api/chat/:sessionId
 * @description Retrieves the chat message history for a given session.
 *
 * @param {string} sessionId - The ID of the user's session.
 *
 * @response {ChatMessage[]} An array of chat message objects.
 */
chatRouter.get("/chat/:sessionId", async (req, res) => {
  try {
    const session = await storage.getAssessmentSessionBySessionId(
      req.params.sessionId,
    );
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    const messages = await storage.getChatMessages(session.id);
    res.json(messages);
  } catch (error) {
    console.error("Failed to get chat messages:", error);
    res.status(500).json({ error: "Failed to get chat messages" });
  }
});

/**
 * @endpoint POST /api/chat
 * @description Handles an incoming chat message from the user, generates an AI response,
 * and saves both to the database. This endpoint will be updated later to support SSE streaming.
 *
 * @body {ChatRequest} The request containing sessionId, message, and context.
 *
 * @response {ChatMessage} The newly created AI assistant message object.
 */
chatRouter.post("/chat", async (req, res) => {
  try {
    const validation = chatRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: validation.error.errors,
      });
    }

    const { sessionId, message, context } = validation.data;

    const session = await storage.getAssessmentSessionBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Save user message
    await storage.createChatMessage({
      assessmentId: session.id,
      role: "user",
      content: message,
      context,
    });

    // Get AI response
    const aiResponseContent = await getChatResponse(session.id, message, context);

    // Save AI response
    const aiMessage = await storage.createChatMessage({
      assessmentId: session.id,
      role: "assistant",
      content: aiResponseContent,
      context,
    });

    res.json(aiMessage);
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to process chat message" });
  }
});


// ================== HELPER FUNCTIONS ==================
// Note: This will be moved to a dedicated `grounding.ts` wrapper in a future step.

async function getChatResponse(assessmentId: number, message: string, context: 'discovery' | 'action_plan'): Promise<string> {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || "models/gemini-1.5-flash-preview-0514";

    if (!geminiApiKey) {
        throw new Error("Gemini API key not configured");
    }

    // Fetch context data from storage
    const sessionData = await storage.getAssessmentSessionById(assessmentId);
    const chatHistory = await storage.getChatMessages(assessmentId);

    if (!sessionData) {
        throw new Error(`Session with id ${assessmentId} not found.`);
    }

    const language = sessionData.language;
    const langInstruction = language === 'es' 
        ? "The user is communicating in Spanish. Your response must be in Spanish."
        : "The user is communicating in English. Your response must be in English.";

    // Tailor the system prompt based on the chat context
    let contextPrompt = "";
    if (context === 'discovery') {
        contextPrompt = `
You are helping the user refine their initial three "Purpose Paths".
Here is their data:
Core Drivers Analysis: ${JSON.stringify(sessionData.coreDriversAnalysis, null, 2)}
Generated Purpose Paths: ${JSON.stringify(sessionData.purposePaths, null, 2)}
        `;
    } else { // context === 'action_plan'
        contextPrompt = `
You are helping the user refine the detailed "Action Plan" for their chosen career path.
Here is their chosen path and action plan:
Action Plan: ${JSON.stringify(sessionData.actionPlan, null, 2)}
        `;
    }

    const systemPrompt = `You are Nami, an AI career guide with a personality inspired by Paul Graham's essays and stoic principles. You are encouraging, wise, and action-oriented. ${langInstruction}

${contextPrompt}

PREVIOUS CONVERSATION HISTORY:
${chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Based on all this context, respond helpfully and conversationally to the user's latest message.
User Message: "${message}"
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                { role: "user", parts: [{ text: systemPrompt }] },
            ],
            generationConfig: {
                temperature: 0.8,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
            }
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini Chat API Error Response:", errorBody);
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response right now. Please try again.";
}
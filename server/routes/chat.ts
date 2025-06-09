/**
 * @description
 * This file defines the API routes for the chat-related features of the Purpose Finder application.
 * It allows users to interact with the AI assistant, "Nami," to refine their results.
 * It orchestrates calls to the storage layer and the AI grounding wrapper.
 *
 * @dependencies
 * - express: For creating and managing the router.
 * - @shared/schema: Provides Zod schemas for request validation.
 * - ../storage: The storage interface for database interactions.
 * - ../grounding: The centralized wrapper for all Gemini API interactions.
 */

import { Router } from "express";
import { storage } from "../storage";
import { chatRequestSchema } from "@shared/schema";
import { generateChatResponse } from "../grounding";

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
chatRouter.get("/chat/:sessionId", async (req, res, next) => {
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
    // Forward the error to the global error handler
    next(error);
  }
});

/**
 * @endpoint POST /api/chat
 * @description Handles an incoming chat message from the user, generates an AI response,
 * and saves both to the database. This endpoint will be updated in a future step to support SSE streaming.
 *
 * @body {ChatRequest} The request containing sessionId, message, and context.
 *
 * @response {ChatMessage} The newly created AI assistant message object.
 */
chatRouter.post("/chat", async (req, res, next) => {
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

    // 1. Save user's message to storage
    await storage.createChatMessage({
      assessmentId: session.id,
      role: "user",
      content: message,
      context,
    });

    // 2. Delegate to the grounding wrapper to get the AI's response
    const aiResponseContent = await generateChatResponse(
      session.id,
      message,
      context,
    );

    // 3. Save AI's response to storage
    const aiMessage = await storage.createChatMessage({
      assessmentId: session.id,
      role: "assistant",
      content: aiResponseContent,
      context,
    });

    // 4. Send the AI's message back to the client
    res.json(aiMessage);
  } catch (error) {
    // Forward the error to the global error handler
    next(error);
  }
});

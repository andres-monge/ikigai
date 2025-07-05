/**
 * @description
 * This file defines the API routes for the chat-related features of the Purpose Finder application.
 * It allows users to interact with the AI assistant, "Nami," to refine their results.
 *
 * @dependencies
 * - express: For creating and managing the router.
 * - @shared/schema: Provides Zod schemas for request validation.
 * - ../storage: The storage interface for database interactions.
 * - ../ai/chains: The centralized wrapper for all Gemini API interactions.
 */

import { Router } from 'express';
import { storage } from '../storage';
import { chatRequestSchema } from '@shared/schema';
import { getChatRefinementChain } from '../ai/chains';

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
chatRouter.get('/chat/:sessionId', async (req, res, next) => {
  try {
    const session = await storage.getAssessmentSessionBySessionId(
      req.params.sessionId,
    );
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
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
 * @description Handles an incoming chat message and returns the full AI response
 * as JSON.  Streaming via SSE has been removed for reliability.
 *
 * @body {ChatRequest} The request containing sessionId, message, and context.
 *
 * @response `{ "content": string }` JSON containing the assistant reply.
 */
chatRouter.post('/chat', async (req, res, next) => {
  try {
    // 1. Validate the incoming request body
    const validation = chatRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validation.error.errors,
      });
    }

    const { sessionId, message, context, pathId } = validation.data;

    // 2. Retrieve the session from storage
    const session = await storage.getAssessmentSessionBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // 3. Persist the user's message
    await storage.createChatMessage({
      assessmentId: session.id,
      role: 'user',
      content: message,
      context,
    });

    // 4. Get the full AI response (non-streaming)
    const aiResponse = await getChatRefinementChain(
      sessionId,
      message,
      context,
      pathId ?? null,
    );

    // 5. Persist the assistant's reply
    await storage.createChatMessage({
      assessmentId: session.id,
      role: 'assistant',
      content: aiResponse,
      context,
    });

    // 6. Return the response to the client
    res.json({ content: aiResponse });
  } catch (error) {
    next(error);
  }
});
/**
 * @description
 * This file defines the API routes for the chat-related features of the Purpose Finder application.
 * It allows users to interact with the AI assistant, "Nami," to refine their results.
 *
 * 🔄 **2025-06-25 UPDATE (Step 12)**
 * - Upgraded the `POST /api/chat` endpoint to use Server-Sent Events (SSE) for real-time streaming.
 * - The handler now sets SSE-specific headers (`Content-Type: text/event-stream`, etc.).
 * - It iterates through the async generator returned by `getChatRefinementChain`.
 * - Each chunk received from the AI is immediately sent to the client in the SSE `data:` format.
 * - The full response is accumulated and saved to storage only after the stream completes.
 * - Added a `data: [DONE]` message to signal the end of the stream to the client.
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
 * @description Handles an incoming chat message and streams the AI's response back
 * to the client using Server-Sent Events (SSE).
 *
 * @body {ChatRequest} The request containing sessionId, message, and context.
 *
 * @response A `text/event-stream` response. Each event is a JSON object
 * `{ "content": "..." }`. The stream is terminated by a `data: [DONE]` message.
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

    // 3. Save the user's message to storage immediately
    await storage.createChatMessage({
      assessmentId: session.id,
      role: 'user',
      content: message,
      context,
    });

    // 4. Set headers for the Server-Sent Events (SSE) stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Send headers to the client to establish the connection

    // 5. Get the streaming response from the AI chain
    const stream = getChatRefinementChain(sessionId, message, context, pathId ?? null);

    let fullAiResponse = '';

    // 6. Stream the response chunks to the client and accumulate the full response
    for await (const chunk of stream) {
      fullAiResponse += chunk;
      // Format as an SSE message: `data: { "content": "..." }\n\n`
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    // 7. Once the stream is finished, save the complete AI response to storage
    if (fullAiResponse) {
      await storage.createChatMessage({
        assessmentId: session.id,
        role: 'assistant',
        content: fullAiResponse,
        context,
      });
    }

    // 8. Signal the end of the stream to the client and close the connection
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    // If an error occurs, we might have already sent headers.
    // We can't send a normal JSON error response.
    // Log the error on the server and ensure the stream is closed.
    console.error('Error in chat stream route:', error);
    if (!res.headersSent) {
      // If headers haven't been sent, we can still use the standard error handler.
      next(error);
    } else {
      res.end(); // Gracefully end the stream on error
    }
  }
});
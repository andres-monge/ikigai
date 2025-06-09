
/**
 * @description 
 * This module handles all chat-related API routes for the Purpose Finder application.
 * It is responsible for managing conversations with Nami AI for refining analysis and action plans.
 * 
 * Key features:
 * - GET /api/chat/:sessionId: Retrieves chat message history
 * - POST /api/chat: Handles new chat messages and AI responses
 * - Context-aware conversations (discovery vs action_plan)
 * - Integration with storage for message persistence
 * 
 * @dependencies
 * - Express: Web framework for route handling
 * - Storage: In-memory storage interface for chat messages
 * - Zod schemas: Request validation from shared schema
 * 
 * @notes
 * - Chat context determines which data (purpose paths vs action plan) is included in AI prompts
 * - SSE streaming will be implemented in Step 9
 * - Error responses follow { error: string } format
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { 
  chatRequestSchema,
  insertChatMessageSchema
} from "@shared/schema";

/**
 * Registers chat-related routes with the Express application
 * @param app - Express application instance
 */
export function registerChatRoutes(app: Express): void {
  
  // Get chat messages for a session
  app.get("/api/chat/:sessionId", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }
      
      const messages = await storage.getChatMessages(sessionId);
      res.json(messages);
    } catch (error) {
      console.error("Get chat messages error:", error);
      res.status(500).json({ error: "Failed to get chat messages" });
    }
  });

  // Send chat message and get AI response
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const { sessionId, message } = chatRequestSchema.parse(req.body);
      
      // Save user message to storage
      await storage.createChatMessage({
        sessionId,
        role: "user",
        content: message,
        timestamp: new Date().toISOString()
      });
      
      // TODO: Get AI response using Gemini API (will be implemented in Step 6 & 9)
      // For now, return a mock response to maintain functionality
      const aiResponse = await getMockChatResponse(sessionId, message);
      
      // Save AI response to storage
      const aiMessage = await storage.createChatMessage({
        sessionId,
        role: "assistant",
        content: aiResponse,
        timestamp: new Date().toISOString()
      });
      
      res.json(aiMessage);
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });
}

/**
 * Temporary mock function for chat responses
 * This will be replaced with actual Gemini API integration in Step 6 & 9
 * @param sessionId - User session identifier
 * @param message - User's chat message
 * @returns Mock AI response
 */
async function getMockChatResponse(sessionId: string, message: string): Promise<string> {
  // Mock implementation to maintain current functionality during refactoring
  // This ensures the chat interface continues to work while we build the real integration
  
  // Get session context for more relevant responses
  const session = await storage.getAssessmentSession(sessionId);
  
  // Simple keyword-based responses for common inquiries
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('salary') || lowerMessage.includes('pay')) {
    return "I understand you're curious about compensation. The salary ranges I provided are based on current market data, but they can vary significantly based on your location, experience, and specific company. Would you like me to help you think about which factors matter most to you in terms of compensation?";
  }
  
  if (lowerMessage.includes('skill') || lowerMessage.includes('learn')) {
    return "Building the right skills is crucial for your career transition. Based on your responses, I'd recommend focusing on both technical skills specific to your chosen path and soft skills like communication and project management. What specific skill area would you like to explore further?";
  }
  
  if (lowerMessage.includes('change') || lowerMessage.includes('different')) {
    return "I can help you refine these recommendations! What specifically would you like to adjust? Are you looking for different types of roles, different industries, or perhaps paths that better align with a particular aspect of your values or goals?";
  }
  
  if (lowerMessage.includes('timeline') || lowerMessage.includes('time')) {
    return "Career transitions take time, and everyone's journey is unique. Generally, I recommend planning for 6-18 months depending on how dramatic the change is and how much preparation is needed. What timeline feels realistic given your current situation and constraints?";
  }
  
  // Default response that acknowledges the context
  if (session?.analysis) {
    return "That's a great question! Based on your ikigai analysis, I can see that you value meaningful work that aligns with your core drivers. Let me think about how we can refine these recommendations to better fit what you're looking for. Could you tell me more about what specifically resonates or doesn't resonate with the paths I've suggested?";
  }
  
  return "I'm here to help you explore and refine your career path! Feel free to ask me anything about the analysis, the suggested paths, or how to move forward with your career transition. What would you like to discuss?";
}

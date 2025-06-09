/**
 * @description 
 * This module serves as the main router registry for the Purpose Finder application.
 * It is responsible for importing and registering all feature-based route modules with the Express application.
 * 
 * Key features:
 * - Centralized route registration
 * - Feature-based route organization
 * - HTTP server creation and configuration
 * - Clean separation of concerns between different API domains
 * 
 * @dependencies
 * - Express: Web framework for HTTP server
 * - Assessment routes: Handles analysis and action plan endpoints
 * - Chat routes: Handles conversation and refinement endpoints
 * 
 * @notes
 * - This file acts as the main entry point for all API routes
 * - Individual route logic is now organized in feature-specific modules
 * - Maintains backward compatibility with existing API structure
 */

import type { Express } from "express";
import { createServer, type Server } from "http";
import { registerAssessmentRoutes } from "./routes/assessment";
import { registerChatRoutes } from "./routes/chat";

/**
 * Registers all application routes with the Express app and creates HTTP server
 * @param app - Express application instance
 * @returns HTTP server instance
 */
export async function registerRoutes(app: Express): Promise<Server> {

  // Register feature-based route modules
  registerAssessmentRoutes(app);
  registerChatRoutes(app);

  // Create and return HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
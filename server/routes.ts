/**
 * @description
 * This file acts as the central router for the Express application.
 * It imports feature-specific routers (e.g., for assessment) and
 * registers them with the main application instance. This modular approach
 * keeps the routing organized and scalable.
 *
 * @dependencies
 * - express: For creating and managing the router.
 * - ./routes/assessment: The router for assessment-related endpoints.
 */

import type { Express } from "express";
import { Router } from "express";
import { assessmentRouter } from "./routes/assessment";

/**
 * Registers all API routes with the provided Express application instance.
 * @param {Express} app - The main Express application instance.
 */
export function registerRoutes(app: Express): void {
  const apiRouter = Router();

  // Mount feature-specific routers
  apiRouter.use(assessmentRouter);

  // Mount the main API router under the /api prefix
  app.use("/api", apiRouter);
}
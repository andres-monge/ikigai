import type { Express } from 'express';
import { Router } from 'express';
import { agentRouter } from './routes/agent.js';

/**
 * Registers all API routes with the provided Express application instance.
 * @param {Express} app - The main Express application instance.
 */
export function registerRoutes(app: Express): void {
  const apiRouter = Router();

  apiRouter.use('/agent', agentRouter);
  apiRouter.use((_request, response) => {
    response.status(404).json({ error: 'API route not found' });
  });

  // Mount the main API router under the /api prefix
  app.use("/api", apiRouter);
}

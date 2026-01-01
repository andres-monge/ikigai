/**
 * @description
 * Express application builder module for serverless deployment.
 * This module creates and configures the Express app with all middleware,
 * routes, and error handling - but does NOT bind to a port or start listening.
 *
 * This separation allows:
 * - Vercel Functions to import and use the app directly (via default export)
 * - Local development to wrap it in an HTTP server with Vite integration
 *
 * @dependencies
 * - express: The web framework
 * - ./routes: API route registration
 * - ./vite: Logging utility
 */

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { log } from "./vite";

/**
 * Creates and configures the Express application with all middleware and routes.
 * Does NOT call listen() - the caller is responsible for that.
 *
 * @returns Configured Express application ready for use
 */
export function createApp() {
  const app = express();

  // ========= Middleware Setup =========
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Custom logging middleware for API requests
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;

    // We don't log non-API routes for cleaner logs
    if (!path.startsWith("/api")) {
      return next();
    }

    // Capture response body for logging
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;
    const originalResJson = res.json;
    res.json = function (bodyJson) {
      capturedJsonResponse = bodyJson;
      // @ts-ignore - we're intentionally wrapping the original method
      return originalResJson.apply(res, arguments);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      if (capturedJsonResponse && Object.keys(capturedJsonResponse).length > 0) {
        const responseLog = JSON.stringify(capturedJsonResponse);
        // Truncate long responses to keep logs readable
        const truncatedResponse =
          responseLog.length > 120
            ? responseLog.slice(0, 119) + "…"
            : responseLog;
        logLine += ` :: ${truncatedResponse}`;
      }

      log(logLine);
    });

    next();
  });

  // ========= API Routes =========
  registerRoutes(app);

  // ========= Error Handling Middleware =========
  // Must be registered after routes
  app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled Error:", err.stack || err);
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ error: message });
  });

  return app;
}

/**
 * Pre-configured Express app instance for direct import.
 * Use this when you need the app without additional configuration.
 */
export const app = createApp();

export default app;

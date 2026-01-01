/**
 * @description
 * Express application builder module for serverless deployment.
 * This module creates and configures the Express app with all middleware,
 * routes, and error handling - but does NOT bind to a port or start listening.
 *
 * This separation allows:
 * - Vercel Functions to call createApp() and default-export the result
 * - Local development to wrap it in an HTTP server with Vite integration
 *
 * @dependencies
 * - express: The web framework
 * - ./routes: API route registration
 * - ./vite: Logging utility
 */

import express, { type Express, type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { log } from "./vite";

/**
 * Creates and configures the Express application with all middleware and routes.
 * Does NOT call listen() - the caller is responsible for that.
 *
 * @returns Configured Express application ready for use
 */
export function createApp(): Express {
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
    const originalResJson = res.json.bind(res);
    res.json = function (bodyJson: Record<string, unknown>) {
      capturedJsonResponse = bodyJson;
      return originalResJson(bodyJson);
    } as Response["json"];

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
  // Must be registered after routes. Uses defensive type checking for serverless safety.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled Error:", err);

    // Safely extract status code with type guards
    const status =
      err && typeof err === "object" && "status" in err && typeof err.status === "number"
        ? err.status
        : err && typeof err === "object" && "statusCode" in err && typeof err.statusCode === "number"
          ? err.statusCode
          : 500;

    // Safely extract error message with type guard
    const message =
      err && typeof err === "object" && "message" in err && typeof err.message === "string"
        ? err.message
        : "Internal Server Error";

    res.status(status).json({ error: message });
  });

  return app;
}

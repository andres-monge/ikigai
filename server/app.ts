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
 * - ./utils/log: Logging utility
 */

import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from 'express';
import path from 'path';
import fs from 'fs';
import { toNodeHandler } from 'better-auth/node';
import { registerRoutes } from './routes.js';
import {
  AuthConfigurationError,
  getAuth,
  INTERNAL_CLIENT_IP_HEADER,
  resolveTrustedClientIp,
} from './auth.js';
import { env } from './env.js';
import { log } from './utils/log.js';

/**
 * Regex to match asset file extensions (with optional query parameters).
 * Used to skip serving index.html for static asset requests.
 */
const ASSET_EXTENSIONS =
  /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp3|mp4|webm|webp|json|map|txt|html)(\?.*)?$/i;

/**
 * Creates the SPA catch-all middleware for deep-link refresh support.
 * This middleware serves index.html for client-side routes (e.g., /results, /action-plan)
 * while skipping API routes and static asset requests.
 *
 * @param publicDir - Path to the public directory containing index.html
 * @returns Express middleware function
 */
export function createSPACatchAll(publicDir: string): RequestHandler {
  const indexPath = path.join(publicDir, "index.html");

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip API routes - they're handled by registerRoutes
    if (req.originalUrl.startsWith("/api")) {
      return next();
    }

    // Skip asset requests (files with extensions) - CDN or express.static serves these
    if (ASSET_EXTENSIONS.test(req.originalUrl)) {
      return next();
    }

    // For SPA routes (e.g., /results, /action-plan), serve index.html
    // This enables client-side routing to work on hard refresh
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    // If index.html doesn't exist (build not run), pass to next handler
    next();
  };
}

/**
 * Creates and configures the Express application with all middleware and routes.
 * Does NOT call listen() - the caller is responsible for that.
 *
 * @returns Configured Express application ready for use
 */
export function createApp(): Express {
  const app = express();

  // ========= Middleware Setup =========
  // Better Auth's Express v4 handler MUST remain before body parsers. The
  // handler consumes the raw request stream for OAuth and session endpoints.
  app.all('/api/auth/*', (req, res, next) => {
    req.headers[INTERNAL_CLIENT_IP_HEADER] = resolveTrustedClientIp(req, env.NODE_ENV);

    try {
      const handler = toNodeHandler(getAuth());
      Promise.resolve(handler(req, res)).catch(next);
    } catch (error) {
      if (error instanceof AuthConfigurationError) {
        res.status(503).json({ error: 'Authentication is unavailable' });
        return;
      }
      next(error);
    }
  });

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

  // NOTE: SPA catch-all is NOT registered here.
  // - For Vercel: index.ts registers it after createApp()
  // - For local prod: serveStatic() registers it after express.static()
  // - For local dev: setupVite() handles it via Vite middleware
  // This ensures correct middleware order in all environments.

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

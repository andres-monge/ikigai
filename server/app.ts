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
import { randomUUID } from 'node:crypto';
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

export function createApiRequestLogger(
  writeLog: (message: string) => void = log,
): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    const requestPath = req.path;

    if (!requestPath.startsWith('/api')) return next();

    // The protected Method namespace owns a metadata-only logger. Its
    // responses can contain private map/history content or streamed assistant
    // text, so the legacy response-prefix logger must never observe it.
    if (requestPath === '/api/agent' || requestPath.startsWith('/api/agent/')) {
      return next();
    }

    let capturedJsonResponse: Record<string, unknown> | undefined;
    const originalResJson = res.json.bind(res);
    res.json = function (bodyJson: Record<string, unknown>) {
      capturedJsonResponse = bodyJson;
      return originalResJson(bodyJson);
    } as Response['json'];

    res.on('finish', () => {
      const duration = Date.now() - start;
      let logLine = `${req.method} ${requestPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && Object.keys(capturedJsonResponse).length > 0) {
        const responseLog = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${responseLog.length > 120 ? `${responseLog.slice(0, 119)}…` : responseLog}`;
      }
      writeLog(logLine);
    });

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
  let authHandler: ReturnType<typeof toNodeHandler> | undefined;

  // ========= Middleware Setup =========
  // Better Auth's Express v4 handler MUST remain before body parsers. The
  // handler consumes the raw request stream for OAuth and session endpoints.
  app.all('/api/auth/*', (req, res) => {
    req.headers[INTERNAL_CLIENT_IP_HEADER] = resolveTrustedClientIp(req, env.NODE_ENV);

    const respondToAuthFailure = (error: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof AuthConfigurationError) {
        res.status(503).json({ error: 'Authentication is unavailable' });
        return;
      }
      console.error('Authentication request failed');
      res.status(500).json({ error: 'Authentication request failed' });
    };

    try {
      authHandler ??= toNodeHandler(getAuth());
      Promise.resolve(authHandler(req, res)).catch(respondToAuthFailure);
    } catch (error) {
      respondToAuthFailure(error);
    }
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Custom logging middleware for API requests
  app.use(createApiRequestLogger());

  // ========= API Routes =========
  registerRoutes(app);

  // NOTE: SPA catch-all is NOT registered here.
  // - For Vercel: index.ts registers it after createApp()
  // - For local prod: serveStatic() registers it after express.static()
  // - For local dev: setupVite() handles it via Vite middleware
  // This ensures correct middleware order in all environments.

  // ========= Error Handling Middleware =========
  // Must be registered after routes. Uses defensive type checking for serverless safety.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const isProtectedMethodRoute = req.path === '/api/agent' || req.path.startsWith('/api/agent/');
    if (isProtectedMethodRoute) {
      const requestId = typeof res.getHeader('x-request-id') === 'string'
        ? String(res.getHeader('x-request-id'))
        : randomUUID();
      res.setHeader('x-request-id', requestId);
      const protectedErrorName = err instanceof Error
        && new Set(['PayloadTooLargeError', 'SyntaxError', 'TypeError']).has(err.name)
        ? err.name
        : 'Error';
      console.error('Protected Method request failed', {
        requestId,
        route: req.path,
        status: err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? err.status
          : 500,
        errorClass: protectedErrorName,
      });
    } else {
      console.error("Unhandled Error:", err);
    }

    // Safely extract status code with type guards
    const status =
      err && typeof err === "object" && "status" in err && typeof err.status === "number"
        ? err.status
        : err && typeof err === "object" && "statusCode" in err && typeof err.statusCode === "number"
          ? err.statusCode
          : 500;

    // Safely extract error message with type guard
    const message = isProtectedMethodRoute
      ? 'Agent request failed'
      :
      err && typeof err === "object" && "message" in err && typeof err.message === "string"
        ? err.message
        : "Internal Server Error";

    res.status(status).json({ error: message });
  });

  return app;
}

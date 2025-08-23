// Environment variables are now loaded by env-loader.js before this file runs

/**
 * @description
 * This is the main entry point for the Express server. It sets up the Express application,
 * configures middleware, registers API routes, and starts the HTTP server. It also handles
 * the integration of the Vite development server in development mode.
 *
 * @dependencies
 * - express: The web framework.
 * - http: For creating the HTTP server.
 * - ./routes: The function to register all API routes.
 * - ./vite: Helper functions for Vite integration and static file serving.
 */

import express, { type Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { env } from "./env.js";

const app = express();
const httpServer = createServer(app);

// Set server timeout to 3 minutes to accommodate queued AI requests
httpServer.timeout = 3 * 60 * 1000; // 3 minutes in milliseconds

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
  let capturedJsonResponse: Record<string, any> | undefined = undefined;
  const originalResJson = res.json;
  res.json = function (bodyJson) {
    capturedJsonResponse = bodyJson;
    // @ts-ignore
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

// ========= Main Application Logic =========
(async () => {
  // Register all the /api routes
  registerRoutes(app);

  // Generic error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled Error:", err.stack || err);
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ error: message });
  });

  // In development, hook into Vite's dev server. In production, serve static files.
  if (env.NODE_ENV === "development") {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }

  // ========= Server Startup =========
  const port = 5000;

  httpServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      log(`Port ${port} is busy, retrying in 2 seconds...`, "server");
      setTimeout(() => {
        httpServer.close();
        httpServer.listen(port, "0.0.0.0", () => {
          log(`serving on port ${port}`, "server");
        });
      }, 2000);
    } else {
      console.error("Server startup error:", err);
    }
  });

  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`, "server");
  });
})();

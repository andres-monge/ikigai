// Environment variables are now loaded by env-loader.js before this file runs

/**
 * @description
 * Local development and production server entry point.
 * This file is ONLY used when running the app locally (npm run dev / npm start).
 * It imports the configured Express app and wraps it in an HTTP server with
 * Vite integration for development.
 *
 * For Vercel deployment, the app is imported directly from server/app.ts
 * via the repo-root entry file (index.ts) - this file is not used.
 *
 * @dependencies
 * - http: For creating the HTTP server
 * - ./app: The configured Express application
 * - ./vite: Vite dev server integration and static file serving
 * - ./env: Environment configuration
 */

import { createServer } from "http";
import { app } from "./app";
import { setupVite, serveStatic, log } from "./vite";
import { env } from "./env.js";

// Create HTTP server wrapping the Express app
const httpServer = createServer(app);

// Set server timeout to 3 minutes to accommodate queued AI requests
httpServer.timeout = 3 * 60 * 1000; // 3 minutes in milliseconds

// ========= Main Application Logic =========
(async () => {
  // In development, hook into Vite's dev server for HMR.
  // In production (local), serve static files from the build output.
  if (env.NODE_ENV === "development") {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }

  // ========= Server Startup =========
  const port = 5000;

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
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

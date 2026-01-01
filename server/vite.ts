/**
 * @description
 * This file contains utility functions for integrating the Vite development server with the
 * main Express application. It handles setting up Vite's middleware in development mode
 * and serving the static, built client files in production.
 *
 * Key features:
 * - Dynamically hooks into Vite's dev server for Hot Module Replacement (HMR).
 * - Serves the main `index.html` file for all non-API routes, enabling client-side routing.
 * - Provides a fallback to serve the static build from the `dist/public` directory in production.
 * - Includes a standardized logging function for consistent server output.
 *
 * @dependencies
 * - express: Used to define middleware and routing.
 * - vite: The core Vite server instance is created and used here.
 * - fs, path: Node.js modules for file system access and path manipulation.
 * - http: Used to link the HMR server to the main application server.
 * - nanoid: Used to generate unique IDs to bust the cache for `index.html` during development.
 */

import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import fs from "fs";
import path from "path";
import {
  createServer as createViteServer,
  createLogger,
  type ServerOptions, // Import the ServerOptions type
} from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { createSPACatchAll } from "./app";

// Create a logger instance based on Vite's logger for consistent formatting.
const viteLogger = createLogger();

/**
 * A standardized logging utility to ensure consistent timestamped output.
 * @param {string} message - The message to log to the console.
 * @param {string} [source="express"] - The source of the log message (e.g., 'vite', 'server').
 */
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Configures and attaches the Vite development server middleware to the Express app.
 * This enables Hot Module Replacement (HMR) and serves the client-side application
 * directly from source files during development.
 *
 * @param {Express} app - The Express application instance.
 * @param {Server} server - The core HTTP server instance for HMR.
 */
export async function setupVite(app: Express, server: Server) {
  // *** THE FIX IS HERE ***
  // Explicitly type the serverOptions object with Vite's `ServerOptions` type.
  // This resolves the error where `allowedHosts: true` was inferred as `boolean`
  // instead of the required literal type `true`.
  const serverOptions: ServerOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  // Create a Vite server instance in middleware mode.
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false, // We're passing the config directly.
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        // Custom error handling to exit on critical Vite errors.
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions, // This object is now correctly typed.
    appType: "custom", // We are integrating it into our own Express server.
  });

  // Use Vite's middlewares to handle transforming and serving client-side assets.
  app.use(vite.middlewares);

  // This wildcard middleware is crucial for Single Page Applications (SPAs).
  // It catches all requests that haven't been handled by a previous middleware
  // (like our API routes) and serves the main `index.html` file.
  app.use("*", async (req: Request, res: Response, next: NextFunction) => {
    // This condition checks if the request is for an API endpoint.
    // If it is, we call `next()` to immediately pass control to the next
    // middleware in the chain, which would be an error handler or a 404.
    // This prevents this middleware from incorrectly serving the HTML page for API calls.
    if (req.originalUrl.startsWith("/api")) {
      return next();
    }

    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // Always reload the index.html file from disk in case it changes.
      let template = await fs.promises.readFile(clientTemplate, "utf-8");

      // Add a unique query parameter to the script tag to bust the cache,
      // ensuring the browser always gets the latest version during development.
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );

      // Let Vite process the HTML file to inject its specific client-side scripts for HMR.
      const page = await vite.transformIndexHtml(url, template);

      // Send the transformed HTML as the response.
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      // If an error occurs, pass it to Vite's SSR stack trace fixer
      // and then to Express's next error-handling middleware.
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

/**
 * Configures the Express app to serve static files from the build output directory.
 * This function is used in production environments after running `npm run build`.
 *
 * Middleware order (correct for production):
 * 1. express.static() - serves actual static files
 * 2. SPA catch-all - serves index.html for client-side routes
 *
 * @param {Express} app - The Express application instance.
 */
export function serveStatic(app: Express) {
  // Define the path to the production build's output directory (repo-root public/).
  const distPath = path.resolve(import.meta.dirname, "..", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // 1. Serve static files (like CSS, JS, images) from the `public` directory.
  app.use(express.static(distPath));

  // 2. SPA catch-all: serves index.html for client-side routes (e.g., /results)
  // Registered AFTER express.static() so static files are served first.
  app.use("*", createSPACatchAll(distPath));
}

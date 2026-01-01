/**
 * @description
 * Vercel Function entry point for the Express application.
 *
 * This file lives in api/ so Vercel's `functions` config applies to it.
 *
 * IMPORTANT: The explicit `import express from 'express'` is required for
 * Vercel's detection, even though createApp() uses Express internally.
 * Vercel performs static analysis looking for this import statement.
 *
 * This file does NOT call listen() - Vercel handles that.
 *
 * Middleware order for Vercel:
 * 1. API routes (registered in createApp)
 * 2. SPA catch-all (registered here, after createApp)
 *
 * Note: Vercel ignores express.static() - static assets in public/ are
 * served directly by Vercel's CDN, not by this Express function.
 */

import express from "express"; // Required for Vercel detection
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const runId = "pre-fix";
const hereDir = path.dirname(fileURLToPath(import.meta.url));

// #region agent log H1/H2/H4
fetch("http://127.0.0.1:7242/ingest/9fb7aaec-4f13-4d3c-a65f-166721cf0ea1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "debug-session", runId, hypothesisId: "H1/H2/H4", location: "api/index.ts:MODULE_INIT", message: "Function module loaded", data: { cwd: process.cwd(), hereDir, node: process.version, isVercel: Boolean(process.env.VERCEL), vercelEnv: process.env.VERCEL_ENV ?? null }, timestamp: Date.now() }) }).catch(() => {});
// #endregion

let app: express.Express;

try {
  const serverAppNoExt = path.resolve(hereDir, "..", "server", "app");
  const serverAppTs = `${serverAppNoExt}.ts`;
  const serverAppJs = `${serverAppNoExt}.js`;

  // #region agent log H1/H2
  fetch("http://127.0.0.1:7242/ingest/9fb7aaec-4f13-4d3c-a65f-166721cf0ea1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "debug-session", runId, hypothesisId: "H1/H2", location: "api/index.ts:PRE_IMPORT", message: "Checking server/app file presence before import()", data: { serverAppNoExt, existsNoExt: fs.existsSync(serverAppNoExt), existsTs: fs.existsSync(serverAppTs), existsJs: fs.existsSync(serverAppJs), serverDirExists: fs.existsSync(path.resolve(hereDir, "..", "server")) }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion

  // NOTE: Use `.js` specifiers in TS for ESM compatibility after transpilation.
  // - `vercel dev` (ts-node) can still resolve this to the TS source.
  // - Vercel production runs compiled JS, where `../server/app.js` exists.
  const mod = await import("../server/app.js");

  // #region agent log H1/H2
  fetch("http://127.0.0.1:7242/ingest/9fb7aaec-4f13-4d3c-a65f-166721cf0ea1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "debug-session", runId, hypothesisId: "H1/H2", location: "api/index.ts:IMPORT_OK", message: "Imported ../server/app successfully", data: { hasCreateApp: typeof (mod as any).createApp === "function", hasCreateSPACatchAll: typeof (mod as any).createSPACatchAll === "function" }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion

  const { createApp, createSPACatchAll } = mod as unknown as {
    createApp: () => express.Express;
    createSPACatchAll: (publicDir: string) => express.RequestHandler;
  };

  app = createApp();

  // Register SPA catch-all for deep-link refresh support (e.g., /results, /action-plan)
  // Vercel CDN serves static assets from public/, this only handles client-side routes.
  const publicDir = path.resolve(hereDir, "..", "public");
  app.use("*", createSPACatchAll(publicDir));
} catch (error) {
  // #region agent log H1/H2/H3/H5
  fetch("http://127.0.0.1:7242/ingest/9fb7aaec-4f13-4d3c-a65f-166721cf0ea1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "debug-session", runId, hypothesisId: "H1/H2/H3/H5", location: "api/index.ts:IMPORT_FAIL", message: "Failed to import and initialize app", data: { errorMessage: error instanceof Error ? error.message : String(error), errorName: error instanceof Error ? error.name : null }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion

  console.error("[api/index.ts] INIT FAILED:", error);
  app = express();
  app.use("*", (_req, res) => {
    res.status(500).json({
      error: "Function initialization failed",
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

export default app;
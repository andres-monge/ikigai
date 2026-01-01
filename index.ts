/**
 * @description
 * Vercel Function entry point for the Express application.
 *
 * This file exists at the repo root so Vercel's static analysis can detect it
 * as an Express application and deploy it as a single Function.
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

import express from 'express';  // Required for Vercel detection
import path from 'path';
import { createApp, createSPACatchAll } from './server/app';

const app = createApp();

// Register SPA catch-all for deep-link refresh support (e.g., /results, /action-plan)
// Vercel CDN serves static assets from public/, this only handles client-side routes.
const publicDir = path.resolve(import.meta.dirname, 'public');
app.use('*', createSPACatchAll(publicDir));

export default app;
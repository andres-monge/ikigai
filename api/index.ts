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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import express from 'express'; // Required for Vercel static detection - do not remove
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp, createSPACatchAll } from '../server/app.js';

const hereDir = path.dirname(fileURLToPath(import.meta.url));
const app = createApp();

// Register SPA catch-all for deep-link refresh support (e.g., /results, /action-plan)
// Vercel CDN serves static assets from public/, this only handles client-side routes.
const publicDir = path.resolve(hereDir, '..', 'public');
app.use('*', createSPACatchAll(publicDir));

export default app;
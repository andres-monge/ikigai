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

import express from 'express';  // Required for Vercel detection
import path from 'path';

console.log('[Vercel Function] Starting initialization...');

let app: express.Express;

try {
  console.log('[Vercel Function] Importing createApp...');
  const { createApp, createSPACatchAll: createCatchAll } = await import('../server/app');

  console.log('[Vercel Function] Creating Express app...');
  app = createApp();

  console.log('[Vercel Function] Registering SPA catch-all...');
  const publicDir = path.resolve(import.meta.dirname, '..', 'public');
  app.use('*', createCatchAll(publicDir));

  console.log('[Vercel Function] Initialization complete!');
} catch (error) {
  console.error('[Vercel Function] INIT ERROR:', error);
  // Create a minimal app that returns the error
  app = express();
  app.use('*', (_req, res) => {
    res.status(500).json({
      error: 'Function initialization failed',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  });
}

export default app;
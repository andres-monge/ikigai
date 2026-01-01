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
 */

import express from 'express';  // Required for Vercel detection
import { createApp } from './server/app';

const app = createApp();

export default app;
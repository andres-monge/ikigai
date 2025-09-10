/**
 * @description
 * Test utilities for creating Express applications in integration tests.
 * 
 * This module provides reusable functions for creating test Express applications
 * with proper error handling for assessment route testing.
 */

import express from 'express';
import { assessmentRouter } from '../routes/assessment/index.js';

/**
 * Creates a test Express app with the assessment router for testing.
 * Includes proper error handling for test scenarios.
 */
export function createTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use('/api', assessmentRouter);
  
  // Add error handler for test app
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ 
      error: err.message || 'Internal server error',
      details: err.stack 
    });
  });
  
  return app;
}
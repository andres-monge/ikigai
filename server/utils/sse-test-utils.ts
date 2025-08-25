/**
 * @description
 * Shared utilities for testing Server-Sent Events (SSE) streaming endpoints.
 * 
 * This module provides reusable functions for parsing SSE responses and creating
 * test Express applications across multiple streaming test files.
 */

import express from 'express';
import { assessmentRouter } from '../routes/assessment/index.js';

/**
 * Parses Server-Sent Events (SSE) response text into individual events.
 * SSE format: "data: <content>\n\n" for each event.
 * 
 * @param responseText - Raw response text from the SSE endpoint
 * @returns Array of event data (without "data: " prefix)
 */
export function parseSSEEvents(responseText: string): string[] {
  return responseText
    .split('\n\n')
    .filter(line => line.startsWith('data: '))
    .map(line => line.substring(6)); // Remove "data: " prefix
}

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
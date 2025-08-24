/**
 * @description Server-Sent Events (SSE) utilities for streaming endpoints
 * 
 * This module provides type-safe utilities for handling SSE communications
 * in streaming API endpoints. It centralizes SSE header configuration,
 * message formatting, and connection cleanup to eliminate code duplication.
 */

import type { Request, Response } from 'express';

/**
 * SSE event constants used across streaming endpoints
 * Using const assertion for better type safety and tree-shaking
 */
export const SSE_EVENTS = {
  STREAM_START: '[STREAM_START]',
  STREAM_END: '[STREAM_END]',
  ENRICH_START: '[ENRICH_START]',
  SAVE_SUCCESS: '[SAVE_SUCCESS]',
  ERROR: '[ERROR]'
} as const;

/**
 * Sets up proper headers for Server-Sent Events streaming
 * 
 * @param res Express Response object
 */
export function setSseHeaders(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });
}

/**
 * Writes a text chunk to the SSE stream in proper format
 * 
 * @param res Express Response object
 * @param chunk Text content to stream to client
 */
export function writeSseData(res: Response, chunk: string): void {
  res.write(`data: ${chunk}\n\n`);
}

/**
 * Writes an SSE event message (like status updates)
 * 
 * @param res Express Response object  
 * @param event Event string to send (typically from SSE_EVENTS)
 */
export function writeSseEvent(res: Response, event: string): void {
  res.write(`data: ${event}\n\n`);
}

/**
 * Sets up connection cleanup handlers for SSE streams
 * 
 * Prevents memory leaks by properly cleaning up active stream tracking
 * when clients disconnect, connections are aborted, or responses close.
 * 
 * @param req Express Request object
 * @param res Express Response object
 * @param sessionId Session ID to clean up from active streams
 * @param activeStreams Map tracking active streaming sessions
 * @returns Cleanup function that can be called manually if needed
 */
export function setupSseCleanup(
  req: Request, 
  res: Response, 
  sessionId: string, 
  activeStreams: Map<string, boolean>
): () => void {
  const cleanup = () => {
    activeStreams.delete(sessionId);
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);

  return cleanup;
}

/**
 * Writes an error event to the SSE stream with consistent formatting
 * 
 * @param res Express Response object
 * @param error Error object or string message
 */
export function writeSseError(res: Response, error: Error | string): void {
  const message = error instanceof Error ? error.message : error;
  writeSseEvent(res, `${SSE_EVENTS.ERROR} ${message}`);
}
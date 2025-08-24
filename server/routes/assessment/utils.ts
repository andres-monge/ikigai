/**
 * @description
 * Shared utilities for assessment route handlers.
 * Contains common patterns for session validation, concurrency control,
 * and database operations used across multiple assessment endpoints.
 */

import type { Response } from "express";
import { storage, type HydratedAssessmentSession } from "../../storage";
import type { PurposePath } from "@shared/schema";

/**
 * Track active streaming sessions to prevent concurrent streams per session
 * Shared across all streaming endpoints to enforce one stream per session
 */
export const activeStreams = new Map<string, boolean>();

/**
 * Validates that a session exists and has required fields for streaming
 * 
 * @param sessionId The session ID to validate
 * @returns The session if valid, or null if not found/invalid
 */
export async function validateSessionForStreaming(sessionId: string): Promise<HydratedAssessmentSession | null> {
  const session = await storage.getAssessmentSessionBySessionId(sessionId);
  
  if (!session) {
    return null;
  }

  // Validate session has required fields for streaming
  if (!session.responses || !session.language) {
    return null;
  }

  // Validate responses structure
  if (typeof session.responses !== 'object') {
    return null;
  }

  return session;
}

/**
 * Checks for concurrent streaming sessions and sets up concurrency control
 * 
 * @param sessionId The session ID to check
 * @param res Express response object for error responses
 * @returns true if stream can proceed, false if concurrent stream detected
 */
export function setupStreamConcurrencyControl(sessionId: string, res: Response): boolean {
  if (activeStreams.get(sessionId)) {
    res.status(429).json({ 
      error: "A stream is already in progress for this session" 
    });
    return false;
  }

  // Mark this session as having an active stream
  activeStreams.set(sessionId, true);
  return true;
}

/**
 * Performs atomic database operations for purpose path updates
 * Creates new paths, deletes old ones, with rollback on failure
 * 
 * @param sessionId The session ID
 * @param session The current session data
 * @param newPaths Array of new purpose paths to create
 * @returns Array of created purpose paths
 */
export async function atomicPurposePathUpdate(
  sessionId: string,
  session: HydratedAssessmentSession,
  newPaths: Array<{
    title: string;
    description: string;
    ikigaiAlignment: any;
    actionStrategy: string;
  }>
): Promise<PurposePath[]> {
  const oldPathIds = session.purposePaths.map(p => p.id);
  const createdPaths: PurposePath[] = [];
  
  try {
    // Create all new paths first (store in memory)
    for (const path of newPaths) {
      const createdPath = await storage.createPurposePath({
        assessmentId: session.id,
        title: path.title,
        description: path.description,
        ikigaiAlignment: path.ikigaiAlignment,
        actionStrategy: path.actionStrategy,
      });
      createdPaths.push(createdPath);
    }
    
    // Delete ONLY the old paths by their specific IDs
    for (const oldId of oldPathIds) {
      await storage.deletePurposePathById(oldId);
    }
    
    return createdPaths;
  } catch (error) {
    // If path creation fails, clean up any paths we did create
    for (const createdPath of createdPaths) {
      try {
        await storage.deletePurposePathById(createdPath.id);
      } catch (cleanupError) {
        console.error('Failed to cleanup created path during rollback:', cleanupError);
      }
    }
    throw error; // Re-throw the original error
  }
}
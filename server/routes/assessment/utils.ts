/**
 * @description
 * Shared utilities for assessment route handlers.
 * Contains common patterns for session validation, concurrency control,
 * and database operations used across multiple assessment endpoints.
 */

import type { Response } from "express";
import { storage, type HydratedAssessmentSession } from "../../storage";
import type { PurposePath } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { purposePaths, assessmentSessions } from "@shared/schema";
import { wrapTransactionError } from "../../utils/errors";
import { inArray } from "drizzle-orm";

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
 * Performs atomic database operations for purpose path updates using database transactions
 * Creates new paths, deletes old ones, and updates session analysis atomically
 * 
 * @param sessionId The session ID
 * @param session The current session data
 * @param newPaths Array of new purpose paths to create
 * @param coreDriversAnalysis Optional core drivers analysis to save
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
  }>,
  coreDriversAnalysis?: any
): Promise<PurposePath[]> {
  try {
    return await db.transaction(async (tx) => {
      // Step 1: Delete old paths first (within transaction) - optimized batch delete
      const oldPathIds = session.purposePaths.map(p => p.id);
      if (oldPathIds.length > 0) {
        await tx.delete(purposePaths)
          .where(inArray(purposePaths.id, oldPathIds));
      }
      
      // Step 2: Create new paths (within same transaction)
      const createdPaths: PurposePath[] = [];
      for (const path of newPaths) {
        const [created] = await tx.insert(purposePaths)
          .values({
            assessmentId: session.id,
            title: path.title,
            description: path.description ?? null,
            actionStrategy: path.actionStrategy ?? null,
            ikigaiAlignment: path.ikigaiAlignment ?? {},
          })
          .returning();
        createdPaths.push(created as PurposePath);
      }
      
      // Step 3: Update session with core drivers analysis if provided (within same transaction)
      if (coreDriversAnalysis) {
        await tx.update(assessmentSessions)
          .set({ 
            coreDriversAnalysis: coreDriversAnalysis as unknown,
            updatedAt: new Date()
          })
          .where(eq(assessmentSessions.sessionId, sessionId));
      }
      
      return createdPaths;
    });
    // If ANY operation fails, PostgreSQL automatically rolls back everything
  } catch (error) {
    // Wrap with structured error for consistent handling and test debugging
    throw wrapTransactionError(error, 'purpose_path_update', sessionId);
  }
}

/**
 * Performs atomic database operations for action plan updates using database transactions
 * Updates session with action plan and chosen path ID atomically
 * 
 * @param sessionId The session ID
 * @param actionPlan The action plan data to save
 * @param chosenPathId The ID of the chosen purpose path
 * @returns void
 */
export async function atomicActionPlanUpdate(
  sessionId: string,
  actionPlan: any,
  chosenPathId: number
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.update(assessmentSessions)
        .set({ 
          actionPlan: actionPlan as unknown,
          chosenPathId: chosenPathId,
          updatedAt: new Date()
        })
        .where(eq(assessmentSessions.sessionId, sessionId));
    });
  } catch (error) {
    throw wrapTransactionError(error, 'action_plan_update', sessionId);
  }
}
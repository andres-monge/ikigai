/**
 * @description
 * PostgreSQL storage layer for the Purpose Finder application.
 *
 * ✨ Step 5 Implementation ✨
 * ──────────────────────────
 * • Replaced in-memory storage with persistent PostgreSQL implementation
 * • Uses Drizzle ORM's relational query API for automatic hydration
 * • Provides atomic operations with .returning() for efficiency
 * • Maintains the same IStorage interface for drop-in compatibility
 *
 * @dependencies
 * - server/db.js for the Drizzle client instance
 * - @shared/schema for table definitions and types
 * - drizzle-orm for query operators
 *
 * @notes
 * - All methods return HydratedAssessmentSession with eager-loaded purposePaths
 * - Uses PostgreSQL's RETURNING clause for atomic create/update operations
 * - Leverages foreign key CASCADE for automatic cleanup
 */

import { db } from './db.js';
import { eq } from 'drizzle-orm';
import {
  type AssessmentSession,
  type InsertAssessmentSession,
  type PurposePath,
  type InsertPurposePath,
  assessmentSessions,
  purposePaths,
} from "@shared/schema";

/* ------------------------------------------------------------------ */
/*                          Helper - New Types                        */
/* ------------------------------------------------------------------ */

/**
 * @interface HydratedAssessmentSession
 * A fully-resolved session that contains:
 *  • the base `AssessmentSession` columns
 *  • an array of all `PurposePath` rows belonging to the session
 */
export interface HydratedAssessmentSession extends AssessmentSession {
  /** All purpose paths for this session */
  purposePaths: PurposePath[];
}

/* ------------------------------------------------------------------ */
/*                         Storage Interface                          */
/* ------------------------------------------------------------------ */

/**
 * @interface IStorage
 * Contract all storage back-ends must follow.
 *
 *  • Return types that previously pointed to `AssessmentSession` are now
 *    `HydratedAssessmentSession` so the caller always receives the
 *    fully-joined data graph.
 */
export interface IStorage {
  // === Assessment Session Methods ===
  getAssessmentSessionById(
    id: number,
  ): Promise<HydratedAssessmentSession | undefined>;
  getAssessmentSessionBySessionId(
    sessionId: string,
  ): Promise<HydratedAssessmentSession | undefined>;
  createAssessmentSession(
    session: Omit<InsertAssessmentSession, "id">,
  ): Promise<HydratedAssessmentSession>;
  updateAssessmentSession(
    sessionId: string,
    updates: Partial<InsertAssessmentSession>,
  ): Promise<HydratedAssessmentSession | undefined>;

  // === Purpose Path Methods ===
  createPurposePath(path: Omit<InsertPurposePath, "id">): Promise<PurposePath>;
  deletePurposePathsByAssessmentId(assessmentId: number): Promise<void>;
  deletePurposePathById(id: number): Promise<boolean>;

  // === Session Management Methods ===
  deleteAssessmentSessionBySessionId(sessionId: string): Promise<boolean>;
}

/* ------------------------------------------------------------------ */
/*                         PostgresStorage Implementation             */
/* ------------------------------------------------------------------ */

export class PostgresStorage implements IStorage {
  /* ---------------- Assessment Session CRUD ---------------- */

  async getAssessmentSessionById(
    id: number,
  ): Promise<HydratedAssessmentSession | undefined> {
    const session = await db.query.assessmentSessions.findFirst({
      where: eq(assessmentSessions.id, id),
      with: { purposePaths: true }
    });
    return session as HydratedAssessmentSession | undefined;
  }

  async getAssessmentSessionBySessionId(
    sessionId: string,
  ): Promise<HydratedAssessmentSession | undefined> {
    const session = await db.query.assessmentSessions.findFirst({
      where: eq(assessmentSessions.sessionId, sessionId),
      with: { purposePaths: true }
    });
    return session as HydratedAssessmentSession | undefined;
  }

  async createAssessmentSession(
    insertSession: Omit<InsertAssessmentSession, "id">,
  ): Promise<HydratedAssessmentSession> {
    const now = new Date();
    const insertData: any = {
      sessionId: insertSession.sessionId,
      language: insertSession.language ?? 'en',
      responses: insertSession.responses ?? null,
      coreDriversAnalysis: insertSession.coreDriversAnalysis ?? null,
      chosenPathId: insertSession.chosenPathId ?? null,
      actionPlan: insertSession.actionPlan ?? null,
      createdAt: now,
      updatedAt: now,
    };
    
    const [created] = await db.insert(assessmentSessions)
      .values(insertData)
      .returning();

    // Return hydrated session by fetching with relations
    const hydrated = await this.getAssessmentSessionById(created.id);
    if (!hydrated) {
      throw new Error('Failed to create assessment session');
    }
    return hydrated;
  }

  async updateAssessmentSession(
    sessionId: string,
    updates: Partial<InsertAssessmentSession>,
  ): Promise<HydratedAssessmentSession | undefined> {
    const updateData: any = {
      ...updates,
      updatedAt: new Date(),
    };
    
    const [updated] = await db.update(assessmentSessions)
      .set(updateData)
      .where(eq(assessmentSessions.sessionId, sessionId))
      .returning();

    if (!updated) return undefined;

    // Return hydrated session by fetching with relations
    return this.getAssessmentSessionById(updated.id);
  }

  /* ---------------- Purpose Path CRUD ---------------- */

  async createPurposePath(
    insertPath: Omit<InsertPurposePath, "id">,
  ): Promise<PurposePath> {
    const [created] = await db.insert(purposePaths)
      .values({
        assessmentId: insertPath.assessmentId,
        title: insertPath.title,
        description: insertPath.description ?? null,
        actionStrategy: insertPath.actionStrategy ?? null,
        ikigaiAlignment: insertPath.ikigaiAlignment ?? {},
      })
      .returning();

    return created as PurposePath;
  }

  async deletePurposePathsByAssessmentId(assessmentId: number): Promise<void> {
    await db.delete(purposePaths)
      .where(eq(purposePaths.assessmentId, assessmentId));
  }

  async deletePurposePathById(id: number): Promise<boolean> {
    const [deleted] = await db.delete(purposePaths)
      .where(eq(purposePaths.id, id))
      .returning({ id: purposePaths.id });

    return !!deleted;
  }

  /* ---------------- Session Management ---------------- */

  async deleteAssessmentSessionBySessionId(sessionId: string): Promise<boolean> {
    const [deleted] = await db.delete(assessmentSessions)
      .where(eq(assessmentSessions.sessionId, sessionId))
      .returning({ id: assessmentSessions.id });

    return !!deleted;
  }
}

/* ------------------------------------------------------------------ */
/*                         Export Singleton Store                      */
/* ------------------------------------------------------------------ */

export const storage: IStorage = new PostgresStorage();

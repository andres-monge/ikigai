/**
 * @description
 * In-memory storage layer for the Purpose Finder MVP.
 *
 *  ✨ New in Step 20 ✨
 *  ──────────────────
 *  • Introduced `HydratedAssessmentSession`, a superset of `AssessmentSession`
 *    that eagerly loads (joins) all related `purposePaths` and their `salaryData`.
 *  • Updated the `IStorage` contract and every relevant `MemStorage` method so
 *    callers always get fully-hydrated objects and never need to cast to `any`.
 *
 * @dependencies
 * - @shared/schema for the table-level Drizzle types.
 *
 * @notes
 * - This file remains a drop-in replacement for a future Postgres version;
 *   only the internal implementation will change.
 */

import {
  type AssessmentSession,
  type InsertAssessmentSession,
  type PurposePath,
  type InsertPurposePath,
  type SalaryData,
  type InsertSalaryData,
  type ChatMessage,
  type InsertChatMessage,
} from "@shared/schema";

/* ------------------------------------------------------------------ */
/*                          Helper - New Types                        */
/* ------------------------------------------------------------------ */

/**
 * @interface HydratedAssessmentSession
 * A fully-resolved session that contains:
 *  • the base `AssessmentSession` columns
 *  • an array of all `PurposePath` rows belonging to the session
 *      – each path already has its `salaryData` array attached
 */
export interface HydratedAssessmentSession extends AssessmentSession {
  /** All purpose paths + their salary data for this session */
  purposePaths: (PurposePath & { salaryData: SalaryData[] })[];
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

  // === Salary Data Methods ===
  createSalaryData(data: Omit<InsertSalaryData, "id">): Promise<SalaryData>;

  // === Chat Message Methods ===
  getChatMessages(assessmentId: number): Promise<ChatMessage[]>;
  createChatMessage(
    message: Omit<InsertChatMessage, "id">,
  ): Promise<ChatMessage>;
}

/* ------------------------------------------------------------------ */
/*                           MemStorage MVP                           */
/* ------------------------------------------------------------------ */

export class MemStorage implements IStorage {
  /* … unchanged property declarations … */
  private assessmentSessions: Map<number, AssessmentSession> = new Map();
  private purposePaths: Map<number, PurposePath> = new Map();
  private salaryData: Map<number, SalaryData> = new Map();
  private chatMessages: Map<number, ChatMessage> = new Map();

  private nextSessionId = 1;
  private nextPathId = 1;
  private nextSalaryId = 1;
  private nextMessageId = 1;

  private sessionIdIndex: Map<string, number> = new Map();

  /* ---------------- Assessment Session CRUD ---------------- */

  async getAssessmentSessionById(
    id: number,
  ): Promise<HydratedAssessmentSession | undefined> {
    const session = this.assessmentSessions.get(id);
    return session ? this.hydrateSession(session) : undefined;
  }

  async getAssessmentSessionBySessionId(
    sessionId: string,
  ): Promise<HydratedAssessmentSession | undefined> {
    const internalId = this.sessionIdIndex.get(sessionId);
    if (internalId === undefined) return undefined;
    const session = this.assessmentSessions.get(internalId);
    return session ? this.hydrateSession(session) : undefined;
  }

  async createAssessmentSession(
    insertSession: Omit<InsertAssessmentSession, "id">,
  ): Promise<HydratedAssessmentSession> {
    const id = this.nextSessionId++;
    const now = new Date();
    const session: AssessmentSession = {
      id,
      sessionId: insertSession.sessionId,
      language: insertSession.language ?? "en",
      responses: insertSession.responses ?? null,
      coreDriversAnalysis: insertSession.coreDriversAnalysis ?? null,
      chosenPathId: insertSession.chosenPathId ?? null,
      actionPlan: insertSession.actionPlan ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.assessmentSessions.set(id, session);
    this.sessionIdIndex.set(session.sessionId, id);
    return this.hydrateSession(session);
  }

  async updateAssessmentSession(
    sessionId: string,
    updates: Partial<InsertAssessmentSession>,
  ): Promise<HydratedAssessmentSession | undefined> {
    const internalId = this.sessionIdIndex.get(sessionId);
    if (internalId === undefined) return undefined;

    const existing = this.assessmentSessions.get(internalId);
    if (!existing) return undefined;

    // Guarantee monotonic `updatedAt` so that unit tests comparing strict
    // inequality (`>` rather than `>=`) never fail due to clock resolution
    // limits (particularly on fast CI runners where a 1 ms setTimeout may not
    // advance the timestamp). If the newly generated timestamp happens to be
    // equal to or behind the previous one, we manually bump it by 1 ms.
    let nextUpdatedAt = new Date();
    if (nextUpdatedAt.getTime() <= existing.updatedAt.getTime()) {
      nextUpdatedAt = new Date(existing.updatedAt.getTime() + 1);
    }

    const updated: AssessmentSession = {
      ...existing,
      ...updates,
      updatedAt: nextUpdatedAt,
    };
    this.assessmentSessions.set(internalId, updated);
    return this.hydrateSession(updated);
  }

  /* ---------------- Purpose Path CRUD ---------------- */

  async createPurposePath(
    insertPath: Omit<InsertPurposePath, "id">,
  ): Promise<PurposePath> {
    const id = this.nextPathId++;
    const path: PurposePath = { id, ...insertPath };
    this.purposePaths.set(id, path);
    return path;
  }

  async deletePurposePathsByAssessmentId(assessmentId: number): Promise<void> {
    const pathsToDelete: number[] = [];
    for (const path of this.purposePaths.values()) {
      if (path.assessmentId === assessmentId) pathsToDelete.push(path.id);
    }

    for (const pathId of pathsToDelete) {
      // Cascade delete salary rows
      for (const [salaryId, salary] of this.salaryData) {
        if (salary.pathId === pathId) this.salaryData.delete(salaryId);
      }
      this.purposePaths.delete(pathId);
    }
  }

  /* ---------------- Salary Data CRUD ---------------- */

  async createSalaryData(
    insertData: Omit<InsertSalaryData, "id">,
  ): Promise<SalaryData> {
    const id = this.nextSalaryId++;
    const data: SalaryData = {
      id,
      retrievedAt: new Date(),
      ...insertData,
      sources: insertData.sources ?? [],
    };
    this.salaryData.set(id, data);
    return data;
  }

  /* ---------------- Chat Message CRUD ---------------- */

  async getChatMessages(assessmentId: number): Promise<ChatMessage[]> {
    const msgs = [...this.chatMessages.values()].filter(
      (m) => m.assessmentId === assessmentId,
    );
    return msgs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createChatMessage(
    insertMessage: Omit<InsertChatMessage, "id">,
  ): Promise<ChatMessage> {
    const id = this.nextMessageId++;
    const msg: ChatMessage = { id, createdAt: new Date(), ...insertMessage };
    this.chatMessages.set(id, msg);
    return msg;
  }

  /* ------------------------------------------------------------------ */
  /*                         Private Helper Method                      */
  /* ------------------------------------------------------------------ */

  /**
   * @private
   * Simulates a relational join to attach all paths + salaries
   * to the base session object.
   */
  private async hydrateSession(
    session: AssessmentSession,
  ): Promise<HydratedAssessmentSession> {
    const purposePaths: (PurposePath & { salaryData: SalaryData[] })[] = [];

    for (const path of this.purposePaths.values()) {
      if (path.assessmentId !== session.id) continue;

      const salaryData: SalaryData[] = [];
      for (const salary of this.salaryData.values()) {
        if (salary.pathId === path.id) salaryData.push(salary);
      }

      purposePaths.push({ ...path, salaryData });
    }

    return {
      ...session,
      purposePaths,
    };
  }
}

/* ------------------------------------------------------------------ */
/*                         Export Singleton Store                      */
/* ------------------------------------------------------------------ */

export const storage: IStorage = new MemStorage();

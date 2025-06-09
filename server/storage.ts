/**
 * @description
 * This file provides the data storage layer for the application. For the MVP, it uses
 * an in-memory storage solution (`MemStorage`) to simulate a database. This allows for
 * rapid development without requiring a live database connection.
 *
 * The `IStorage` interface defines the contract that any storage implementation must follow,
 * making it easy to swap `MemStorage` with a real Postgres implementation in the future.
 * All backend services should interact with this module through the exported `storage`
 * singleton, not by instantiating `MemStorage` directly.
 *
 * @dependencies
 * - @shared/schema: Provides Drizzle schema types (`AssessmentSession`, `PurposePath`, etc.)
 * for data consistency across the application.
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

/**
 * @interface IStorage
 * @description Defines the contract for all storage operations. Any storage implementation,
 * whether in-memory or a persistent database, must adhere to this interface. This ensures
 * that the application's business logic is decoupled from the storage implementation.
 */
export interface IStorage {
  // === Assessment Session Methods ===
  getAssessmentSessionById(id: number): Promise<AssessmentSession | undefined>;
  getAssessmentSessionBySessionId(
    sessionId: string,
  ): Promise<AssessmentSession | undefined>;
  createAssessmentSession(
    session: Omit<InsertAssessmentSession, "id">,
  ): Promise<AssessmentSession>;
  updateAssessmentSession(
    sessionId: string,
    updates: Partial<InsertAssessmentSession>,
  ): Promise<AssessmentSession | undefined>;

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

/**
 * @class MemStorage
 * @description An in-memory implementation of the IStorage interface.
 * It uses TypeScript Maps to simulate database tables.
 *
 * @notes
 * - This is for development and MVP purposes only. Data is not persisted
 * across server restarts.
 * - It uses a simple auto-incrementing number for primary keys.
 * - It includes a `sessionIdIndex` for efficient lookups by the non-PK `sessionId`.
 * - The `hydrateSession` method simulates a relational database `JOIN` operation.
 */
export class MemStorage implements IStorage {
  // Simulate database tables using Maps
  private assessmentSessions: Map<number, AssessmentSession> = new Map();
  private purposePaths: Map<number, PurposePath> = new Map();
  private salaryData: Map<number, SalaryData> = new Map();
  private chatMessages: Map<number, ChatMessage> = new Map();

  // Simple auto-incrementing ID counters to simulate `serial` primary keys
  private nextSessionId = 1;
  private nextPathId = 1;
  private nextSalaryId = 1;
  private nextMessageId = 1;

  // Index for quick lookup of session's internal ID by the public sessionId string
  private sessionIdIndex: Map<string, number> = new Map();

  /**
   * Retrieves a full assessment session by its internal numeric ID.
   * @param id The numeric ID of the session.
   * @returns A promise resolving to the full, hydrated session object or undefined if not found.
   */
  async getAssessmentSessionById(
    id: number,
  ): Promise<AssessmentSession | undefined> {
    const session = this.assessmentSessions.get(id);
    if (!session) return undefined;
    // Hydrate with related data before returning
    return this.hydrateSession(session);
  }

  /**
   * Retrieves a full assessment session by its public string `sessionId`.
   * @param sessionId The public session ID string.
   * @returns A promise resolving to the full, hydrated session object or undefined if not found.
   */
  async getAssessmentSessionBySessionId(
    sessionId: string,
  ): Promise<AssessmentSession | undefined> {
    const internalId = this.sessionIdIndex.get(sessionId);
    if (internalId === undefined) return undefined;
    const session = this.assessmentSessions.get(internalId);
    return session ? this.hydrateSession(session) : undefined;
  }

  /**
   * Creates a new assessment session.
   * @param insertSession - The session data to insert, excluding the 'id'.
   * @returns A promise resolving to the newly created, hydrated session object.
   */
  async createAssessmentSession(
    insertSession: Omit<InsertAssessmentSession, "id">,
  ): Promise<AssessmentSession> {
    const id = this.nextSessionId++;
    const now = new Date();
    const session: AssessmentSession = {
      id,
      sessionId: insertSession.sessionId!, // `sessionId` is required by the logic
      language: insertSession.language || "en",
      responses: insertSession.responses || null,
      coreDriversAnalysis: insertSession.coreDriversAnalysis || null,
      chosenPathId: insertSession.chosenPathId || null,
      actionPlan: insertSession.actionPlan || null,
      createdAt: now,
      updatedAt: now,
    };
    this.assessmentSessions.set(id, session);
    this.sessionIdIndex.set(session.sessionId, id);
    return this.hydrateSession(session);
  }

  /**
   * Updates an existing assessment session identified by its public `sessionId`.
   * @param sessionId The public session ID of the session to update.
   * @param updates A partial object of session fields to update.
   * @returns The updated, hydrated session object, or undefined if not found.
   */
  async updateAssessmentSession(
    sessionId: string,
    updates: Partial<InsertAssessmentSession>,
  ): Promise<AssessmentSession | undefined> {
    const internalId = this.sessionIdIndex.get(sessionId);
    if (internalId === undefined) return undefined;

    const existing = this.assessmentSessions.get(internalId);
    if (!existing) return undefined;

    const updated: AssessmentSession = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.assessmentSessions.set(internalId, updated);
    return this.hydrateSession(updated);
  }

  /**
   * Creates a new purpose path linked to an assessment.
   * @param insertPath - The path data to insert, excluding the 'id'.
   * @returns A promise resolving to the newly created path object.
   */
  async createPurposePath(
    insertPath: Omit<InsertPurposePath, "id">,
  ): Promise<PurposePath> {
    const id = this.nextPathId++;
    const path: PurposePath = { id, ...insertPath };
    this.purposePaths.set(id, path);
    return path;
  }

  /**
   * Deletes all purpose paths (and their associated salary data) for a given assessment ID.
   * This is used to clear old results before generating new ones.
   * @param assessmentId - The ID of the parent assessment session.
   */
  async deletePurposePathsByAssessmentId(assessmentId: number): Promise<void> {
    const pathsToDelete: number[] = [];
    for (const path of this.purposePaths.values()) {
      if (path.assessmentId === assessmentId) {
        pathsToDelete.push(path.id);
      }
    }

    // Cascade delete to salary data first
    for (const pathId of pathsToDelete) {
      const salariesToDelete: number[] = [];
      for (const salary of this.salaryData.values()) {
        if (salary.pathId === pathId) {
          salariesToDelete.push(salary.id);
        }
      }
      salariesToDelete.forEach((id) => this.salaryData.delete(id));
      // Then delete the path itself
      this.purposePaths.delete(pathId);
    }
  }

  /**
   * Creates new salary data linked to a purpose path.
   * @param insertData - The salary data to insert, excluding the 'id'.
   * @returns A promise resolving to the newly created salary data object.
   */
  async createSalaryData(
    insertData: Omit<InsertSalaryData, "id">,
  ): Promise<SalaryData> {
    const id = this.nextSalaryId++;
    const data: SalaryData = {
      id,
      retrievedAt: new Date(),
      ...insertData,
      sources: insertData.sources || [],
    };
    this.salaryData.set(id, data);
    return data;
  }

  /**
   * Retrieves all chat messages for a specific assessment, ordered by creation time.
   * @param assessmentId - The ID of the assessment session.
   * @returns A promise resolving to an array of chat messages.
   */
  async getChatMessages(assessmentId: number): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];
    for (const msg of this.chatMessages.values()) {
      if (msg.assessmentId === assessmentId) {
        messages.push(msg);
      }
    }
    // Sort messages chronologically to reconstruct the conversation
    return messages.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  /**
   * Creates a new chat message.
   * @param insertMessage - The message data to insert, excluding the 'id'.
   * @returns A promise resolving to the newly created chat message object.
   */
  async createChatMessage(
    insertMessage: Omit<InsertChatMessage, "id">,
  ): Promise<ChatMessage> {
    const id = this.nextMessageId++;
    const message: ChatMessage = {
      id,
      createdAt: new Date(),
      ...insertMessage,
    };
    this.chatMessages.set(id, message);
    return message;
  }

  /**
   * @private
   * Simulates a relational query (JOIN) to assemble a complete session object
   * with its related purpose paths and salary data. This mimics what Drizzle-ORM's
   * relational queries will do with a real database.
   * @param session The base session object to hydrate.
   * @returns A promise that resolves to the fully populated session object.
   */
  private async hydrateSession(
    session: AssessmentSession,
  ): Promise<AssessmentSession> {
    const purposePaths: (PurposePath & { salaryData: SalaryData[] })[] = [];
    // Find all paths related to this session
    for (const path of this.purposePaths.values()) {
      if (path.assessmentId === session.id) {
        const salaries: SalaryData[] = [];
        // Find all salaries related to this path
        for (const salary of this.salaryData.values()) {
          if (salary.pathId === path.id) {
            salaries.push(salary);
          }
        }
        // Attach the salaries to the path
        purposePaths.push({
          ...path,
          salaryData: salaries,
        } as PurposePath & { salaryData: SalaryData[] });
      }
    }
    // Attach the hydrated paths to the session and return
    return { ...session, purposePaths } as AssessmentSession & {
      purposePaths: (PurposePath & { salaryData: SalaryData[] })[];
    };
  }
}

/**
 * Singleton instance of the storage class.
 * All parts of the application should use this instance to interact with storage.
 */
export const storage: IStorage = new MemStorage();

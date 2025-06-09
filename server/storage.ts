/**
 * @description
 * This file provides the data storage layer for the application. For the MVP, it uses
 * an in-memory storage solution (`MemStorage`) to simulate a database. This allows for
 * rapid development without requiring a live database connection.
 *
 * The `IStorage` interface defines the contract that any storage implementation must follow,
 * making it easy to swap `MemStorage` with a real Postgres implementation in the future.
 *
 * @dependencies
 * - @shared/schema: Provides Drizzle schema types for data consistency.
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

export interface IStorage {
  // Assessment sessions
  getAssessmentSessionById(id: number): Promise<AssessmentSession | undefined>;
  getAssessmentSessionBySessionId(sessionId: string): Promise<AssessmentSession | undefined>;
  createAssessmentSession(session: Omit<InsertAssessmentSession, 'id'>): Promise<AssessmentSession>;
  updateAssessmentSession(sessionId: string, updates: Partial<InsertAssessmentSession>): Promise<AssessmentSession | undefined>;

  // Purpose Paths
  createPurposePath(path: Omit<InsertPurposePath, 'id'>): Promise<PurposePath>;
  deletePurposePathsByAssessmentId(assessmentId: number): Promise<void>;

  // Salary Data
  createSalaryData(data: Omit<InsertSalaryData, 'id'>): Promise<SalaryData>;

  // Chat messages
  getChatMessages(assessmentId: number): Promise<ChatMessage[]>;
  createChatMessage(message: Omit<InsertChatMessage, 'id'>): Promise<ChatMessage>;
}

/**
 * @class MemStorage
 * @description An in-memory implementation of the IStorage interface.
 * It uses Maps to simulate database tables.
 * NOTE: This is for development and MVP purposes only. Data is not persisted.
 */
export class MemStorage implements IStorage {
  private assessmentSessions: Map<number, AssessmentSession> = new Map();
  private purposePaths: Map<number, PurposePath> = new Map();
  private salaryData: Map<number, SalaryData> = new Map();
  private chatMessages: Map<number, ChatMessage> = new Map();

  // Simple auto-incrementing ID counters
  private nextSessionId = 1;
  private nextPathId = 1;
  private nextSalaryId = 1;
  private nextMessageId = 1;

  // Index for quick lookup of session by sessionId string
  private sessionIdIndex: Map<string, number> = new Map();

  async getAssessmentSessionById(id: number): Promise<AssessmentSession | undefined> {
    const session = this.assessmentSessions.get(id);
    if (!session) return undefined;
    return this.hydrateSession(session);
  }

  async getAssessmentSessionBySessionId(sessionId: string): Promise<AssessmentSession | undefined> {
    const internalId = this.sessionIdIndex.get(sessionId);
    if (internalId === undefined) return undefined;
    const session = this.assessmentSessions.get(internalId);
    return session ? this.hydrateSession(session) : undefined;
  }

  async createAssessmentSession(insertSession: Omit<InsertAssessmentSession, 'id'>): Promise<AssessmentSession> {
    const id = this.nextSessionId++;
    const now = new Date();
    const session: AssessmentSession = {
      id,
      sessionId: insertSession.sessionId!,
      language: insertSession.language || 'en',
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

  async updateAssessmentSession(sessionId: string, updates: Partial<InsertAssessmentSession>): Promise<AssessmentSession | undefined> {
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

  async createPurposePath(insertPath: Omit<InsertPurposePath, 'id'>): Promise<PurposePath> {
    const id = this.nextPathId++;
    const path: PurposePath = { id, ...insertPath };
    this.purposePaths.set(id, path);
    return path;
  }

  async deletePurposePathsByAssessmentId(assessmentId: number): Promise<void> {
      const pathsToDelete: number[] = [];
      for (const path of this.purposePaths.values()) {
          if (path.assessmentId === assessmentId) {
              pathsToDelete.push(path.id);
          }
      }

      for (const pathId of pathsToDelete) {
          // also delete related salary data
          const salariesToDelete: number[] = [];
          for (const salary of this.salaryData.values()) {
              if (salary.pathId === pathId) {
                  salariesToDelete.push(salary.id);
              }
          }
          salariesToDelete.forEach(id => this.salaryData.delete(id));
          this.purposePaths.delete(pathId);
      }
  }

  async createSalaryData(insertData: Omit<InsertSalaryData, 'id'>): Promise<SalaryData> {
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

  async getChatMessages(assessmentId: number): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];
    for (const msg of this.chatMessages.values()) {
      if (msg.assessmentId === assessmentId) {
        messages.push(msg);
      }
    }
    return messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createChatMessage(insertMessage: Omit<InsertChatMessage, 'id'>): Promise<ChatMessage> {
    const id = this.nextMessageId++;
    const message: ChatMessage = {
      id,
      createdAt: new Date(),
      ...insertMessage,
    };
    this.chatMessages.set(id, message);
    return message;
  }

  // Helper to simulate relational queries
  private async hydrateSession(session: AssessmentSession): Promise<AssessmentSession> {
      const purposePaths: (PurposePath & { salaryData: SalaryData[] })[] = [];
      for(const path of this.purposePaths.values()){
          if(path.assessmentId === session.id){
              const salaries: SalaryData[] = [];
              for(const salary of this.salaryData.values()){
                  if(salary.pathId === path.id){
                      salaries.push(salary);
                  }
              }
              purposePaths.push({ ...path, salaryData: salaries } as PurposePath & { salaryData: SalaryData[] });
          }
      }
      return { ...session, purposePaths } as AssessmentSession & { purposePaths: (PurposePath & { salaryData: SalaryData[] })[] };
  }
}

// Export a singleton instance of the storage class.
export const storage: IStorage = new MemStorage();
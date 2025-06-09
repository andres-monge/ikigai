
/**
 * @description 
 * In-memory storage implementation that mimics the database schema structure.
 * This module provides a temporary storage solution for the MVP that can be easily
 * replaced with actual database operations when moving to production.
 * 
 * Key features:
 * - Multi-table structure matching the Postgres schema
 * - CRUD operations for assessment sessions, purpose paths, salary data, and chat messages
 * - Relationship management between tables via foreign keys
 * - Auto-incrementing IDs and timestamp management
 * 
 * @dependencies
 * - shared/schema: Database types and validation schemas
 * 
 * @notes
 * - All data is stored in memory and will be lost on server restart
 * - Foreign key relationships are maintained manually
 * - This implementation is designed for easy migration to Postgres later
 * - Session IDs are trusted from client requests (no authentication in MVP)
 */

import { 
  type AssessmentSession, 
  type InsertAssessmentSession,
  type PurposePath,
  type InsertPurposePath,
  type SalaryData,
  type InsertSalaryData,
  type ChatMessage,
  type InsertChatMessage
} from "@shared/schema";

/**
 * Storage interface defining all CRUD operations for the application.
 * This interface ensures consistency between the in-memory implementation
 * and future database implementations.
 */
export interface IStorage {
  // Assessment sessions operations
  getAssessmentSession(sessionId: string): Promise<AssessmentSession | undefined>;
  createAssessmentSession(session: InsertAssessmentSession): Promise<AssessmentSession>;
  updateAssessmentSession(sessionId: string, updates: Partial<InsertAssessmentSession>): Promise<AssessmentSession | undefined>;
  
  // Purpose paths operations
  getPurposePathsBySessionId(sessionId: string): Promise<PurposePath[]>;
  createPurposePath(path: InsertPurposePath): Promise<PurposePath>;
  updatePurposePath(id: number, updates: Partial<InsertPurposePath>): Promise<PurposePath | undefined>;
  deletePurposePathsBySessionId(sessionId: string): Promise<void>;
  
  // Salary data operations
  getSalaryDataByPathId(pathId: number): Promise<SalaryData | undefined>;
  createSalaryData(salaryData: InsertSalaryData): Promise<SalaryData>;
  updateSalaryData(id: number, updates: Partial<InsertSalaryData>): Promise<SalaryData | undefined>;
  
  // Chat messages operations
  getChatMessages(sessionId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  deleteChatMessagesBySessionId(sessionId: string): Promise<void>;
}

/**
 * In-memory storage implementation that mimics the database structure.
 * Uses Map objects to store data for each "table" with auto-incrementing IDs.
 */
export class MemStorage implements IStorage {
  // Storage maps for each "table"
  private assessmentSessions: Map<string, AssessmentSession>; // Key: sessionId
  private purposePaths: Map<number, PurposePath>; // Key: id
  private salaryData: Map<number, SalaryData>; // Key: id
  private chatMessages: Map<string, ChatMessage[]>; // Key: sessionId
  
  // Auto-incrementing ID counters
  private assessmentSessionIdCounter: number;
  private purposePathIdCounter: number;
  private salaryDataIdCounter: number;
  private chatMessageIdCounter: number;

  constructor() {
    // Initialize storage maps
    this.assessmentSessions = new Map();
    this.purposePaths = new Map();
    this.salaryData = new Map();
    this.chatMessages = new Map();
    
    // Initialize ID counters
    this.assessmentSessionIdCounter = 1;
    this.purposePathIdCounter = 1;
    this.salaryDataIdCounter = 1;
    this.chatMessageIdCounter = 1;
  }

  // ===== ASSESSMENT SESSIONS =====

  /**
   * Retrieves an assessment session by session ID.
   * @param sessionId - The unique session identifier
   * @returns The assessment session or undefined if not found
   */
  async getAssessmentSession(sessionId: string): Promise<AssessmentSession | undefined> {
    return this.assessmentSessions.get(sessionId);
  }

  /**
   * Creates a new assessment session with auto-generated ID and timestamps.
   * @param insertSession - The session data to insert
   * @returns The created assessment session with generated fields
   */
  async createAssessmentSession(insertSession: InsertAssessmentSession): Promise<AssessmentSession> {
    const id = this.assessmentSessionIdCounter++;
    const now = new Date().toISOString();
    
    const session: AssessmentSession = { 
      id,
      sessionId: insertSession.sessionId,
      language: insertSession.language,
      responses: insertSession.responses ?? null,
      coreDriversAnalysis: insertSession.coreDriversAnalysis ?? null,
      chosenPathId: insertSession.chosenPathId ?? null,
      actionPlan: insertSession.actionPlan ?? null,
      createdAt: now,
      updatedAt: now
    };
    
    this.assessmentSessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Updates an existing assessment session with new data.
   * @param sessionId - The session ID to update
   * @param updates - Partial data to update
   * @returns The updated session or undefined if not found
   */
  async updateAssessmentSession(sessionId: string, updates: Partial<InsertAssessmentSession>): Promise<AssessmentSession | undefined> {
    const existing = this.assessmentSessions.get(sessionId);
    if (!existing) return undefined;

    const updated: AssessmentSession = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this.assessmentSessions.set(sessionId, updated);
    return updated;
  }

  // ===== PURPOSE PATHS =====

  /**
   * Retrieves all purpose paths for a given session.
   * @param sessionId - The session ID to find paths for
   * @returns Array of purpose paths for the session
   */
  async getPurposePathsBySessionId(sessionId: string): Promise<PurposePath[]> {
    // Find the assessment session to get its internal ID
    const session = await this.getAssessmentSession(sessionId);
    if (!session) return [];

    // Filter purpose paths by session ID
    const paths: PurposePath[] = [];
    for (const path of this.purposePaths.values()) {
      if (path.sessionId === session.id) {
        paths.push(path);
      }
    }
    
    return paths;
  }

  /**
   * Creates a new purpose path linked to a session.
   * @param insertPath - The path data to insert
   * @returns The created purpose path with generated ID
   */
  async createPurposePath(insertPath: InsertPurposePath): Promise<PurposePath> {
    const id = this.purposePathIdCounter++;
    
    const path: PurposePath = {
      id,
      sessionId: insertPath.sessionId,
      title: insertPath.title,
      description: insertPath.description ?? null,
      ikigaiAlignment: insertPath.ikigaiAlignment ?? null,
      actionStrategy: insertPath.actionStrategy ?? null
    };
    
    this.purposePaths.set(id, path);
    return path;
  }

  /**
   * Updates an existing purpose path.
   * @param id - The path ID to update
   * @param updates - Partial data to update
   * @returns The updated path or undefined if not found
   */
  async updatePurposePath(id: number, updates: Partial<InsertPurposePath>): Promise<PurposePath | undefined> {
    const existing = this.purposePaths.get(id);
    if (!existing) return undefined;

    const updated: PurposePath = {
      ...existing,
      ...updates
    };
    
    this.purposePaths.set(id, updated);
    return updated;
  }

  /**
   * Deletes all purpose paths for a given session.
   * Used when regenerating paths during refinement.
   * @param sessionId - The session ID to delete paths for
   */
  async deletePurposePathsBySessionId(sessionId: string): Promise<void> {
    const session = await this.getAssessmentSession(sessionId);
    if (!session) return;

    // Find and delete all paths for this session
    const pathsToDelete: number[] = [];
    for (const [id, path] of this.purposePaths.entries()) {
      if (path.sessionId === session.id) {
        pathsToDelete.push(id);
        
        // Also delete associated salary data
        for (const [salaryId, salary] of this.salaryData.entries()) {
          if (salary.pathId === id) {
            this.salaryData.delete(salaryId);
          }
        }
      }
    }
    
    // Delete the paths
    for (const id of pathsToDelete) {
      this.purposePaths.delete(id);
    }
  }

  // ===== SALARY DATA =====

  /**
   * Retrieves salary data for a specific purpose path.
   * @param pathId - The purpose path ID
   * @returns The salary data or undefined if not found
   */
  async getSalaryDataByPathId(pathId: number): Promise<SalaryData | undefined> {
    for (const salary of this.salaryData.values()) {
      if (salary.pathId === pathId) {
        return salary;
      }
    }
    return undefined;
  }

  /**
   * Creates new salary data linked to a purpose path.
   * @param insertSalaryData - The salary data to insert
   * @returns The created salary data with generated ID and timestamp
   */
  async createSalaryData(insertSalaryData: InsertSalaryData): Promise<SalaryData> {
    const id = this.salaryDataIdCounter++;
    const now = new Date().toISOString();
    
    const salaryData: SalaryData = {
      id,
      pathId: insertSalaryData.pathId,
      entryLevel: insertSalaryData.entryLevel ?? null,
      midLevel: insertSalaryData.midLevel ?? null,
      seniorLevel: insertSalaryData.seniorLevel ?? null,
      location: insertSalaryData.location ?? null,
      sources: insertSalaryData.sources ?? null,
      retrievedAt: now
    };
    
    this.salaryData.set(id, salaryData);
    return salaryData;
  }

  /**
   * Updates existing salary data.
   * @param id - The salary data ID to update
   * @param updates - Partial data to update
   * @returns The updated salary data or undefined if not found
   */
  async updateSalaryData(id: number, updates: Partial<InsertSalaryData>): Promise<SalaryData | undefined> {
    const existing = this.salaryData.get(id);
    if (!existing) return undefined;

    const updated: SalaryData = {
      ...existing,
      ...updates
    };
    
    this.salaryData.set(id, updated);
    return updated;
  }

  // ===== CHAT MESSAGES =====

  /**
   * Retrieves all chat messages for a session, ordered by creation time.
   * @param sessionId - The session ID to get messages for
   * @returns Array of chat messages ordered by creation time
   */
  async getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    const messages = this.chatMessages.get(sessionId) || [];
    // Sort by creation time to ensure proper order
    return messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /**
   * Creates a new chat message and adds it to the session's message history.
   * @param insertMessage - The message data to insert
   * @returns The created message with generated ID and timestamp
   */
  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = this.chatMessageIdCounter++;
    const now = new Date().toISOString();
    
    const message: ChatMessage = { 
      id,
      sessionId: insertMessage.sessionId,
      role: insertMessage.role,
      content: insertMessage.content,
      context: insertMessage.context ?? null,
      createdAt: now
    };
    
    // Get existing messages for this session or create new array
    const existing = this.chatMessages.get(insertMessage.sessionId) || [];
    existing.push(message);
    this.chatMessages.set(insertMessage.sessionId, existing);
    
    return message;
  }

  /**
   * Deletes all chat messages for a given session.
   * Used for cleanup operations.
   * @param sessionId - The session ID to delete messages for
   */
  async deleteChatMessagesBySessionId(sessionId: string): Promise<void> {
    this.chatMessages.delete(sessionId);
  }

  // ===== UTILITY METHODS =====

  /**
   * Gets basic statistics about the storage contents.
   * Useful for debugging and monitoring.
   * @returns Object containing counts of each data type
   */
  getStats() {
    return {
      assessmentSessions: this.assessmentSessions.size,
      purposePaths: this.purposePaths.size,
      salaryData: this.salaryData.size,
      chatSessions: this.chatMessages.size,
      totalChatMessages: Array.from(this.chatMessages.values()).reduce((sum, messages) => sum + messages.length, 0)
    };
  }

  /**
   * Clears all data from storage.
   * Useful for testing and development.
   */
  clear() {
    this.assessmentSessions.clear();
    this.purposePaths.clear();
    this.salaryData.clear();
    this.chatMessages.clear();
    
    // Reset ID counters
    this.assessmentSessionIdCounter = 1;
    this.purposePathIdCounter = 1;
    this.salaryDataIdCounter = 1;
    this.chatMessageIdCounter = 1;
  }
}

// Export singleton instance
export const storage = new MemStorage();

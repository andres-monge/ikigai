import { 
  assessmentSessions, 
  chatMessages,
  type AssessmentSession, 
  type InsertAssessmentSession,
  type ChatMessage,
  type InsertChatMessage
} from "@shared/schema";

export interface IStorage {
  // Assessment sessions
  getAssessmentSession(sessionId: string): Promise<AssessmentSession | undefined>;
  createAssessmentSession(session: InsertAssessmentSession): Promise<AssessmentSession>;
  updateAssessmentSession(sessionId: string, updates: Partial<InsertAssessmentSession>): Promise<AssessmentSession | undefined>;
  
  // Chat messages
  getChatMessages(sessionId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
}

export class MemStorage implements IStorage {
  private assessmentSessions: Map<string, AssessmentSession>;
  private chatMessages: Map<string, ChatMessage[]>;
  private currentId: number;

  constructor() {
    this.assessmentSessions = new Map();
    this.chatMessages = new Map();
    this.currentId = 1;
  }

  async getAssessmentSession(sessionId: string): Promise<AssessmentSession | undefined> {
    return this.assessmentSessions.get(sessionId);
  }

  async createAssessmentSession(insertSession: InsertAssessmentSession): Promise<AssessmentSession> {
    const id = this.currentId++;
    const now = new Date().toISOString();
    const session: AssessmentSession = { 
      ...insertSession, 
      id,
      createdAt: now,
      updatedAt: now
    };
    this.assessmentSessions.set(session.sessionId, session);
    return session;
  }

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

  async getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.chatMessages.get(sessionId) || [];
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = this.currentId++;
    const message: ChatMessage = { ...insertMessage, id };
    
    const existing = this.chatMessages.get(message.sessionId) || [];
    existing.push(message);
    this.chatMessages.set(message.sessionId, existing);
    
    return message;
  }
}

export const storage = new MemStorage();

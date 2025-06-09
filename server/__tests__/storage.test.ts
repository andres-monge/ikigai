
import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../storage';
import type { 
  InsertAssessmentSession, 
  InsertPurposePath, 
  InsertSalaryData,
  InsertChatMessage 
} from '@shared/schema';

describe('MemStorage', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  describe('Assessment Sessions', () => {
    it('should create and retrieve an assessment session', async () => {
      const sessionData: Omit<InsertAssessmentSession, 'id'> = {
        sessionId: 'test-session-123',
        language: 'en',
        responses: { question1: 'answer1', question2: 'answer2' },
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      };

      const created = await storage.createAssessmentSession(sessionData);
      
      expect(created.id).toBe(1);
      expect(created.sessionId).toBe('test-session-123');
      expect(created.language).toBe('en');
      expect(created.responses).toEqual({ question1: 'answer1', question2: 'answer2' });
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it('should retrieve session by internal ID', async () => {
      const sessionData: Omit<InsertAssessmentSession, 'id'> = {
        sessionId: 'test-session-456',
        language: 'es',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      };

      const created = await storage.createAssessmentSession(sessionData);
      const retrieved = await storage.getAssessmentSessionById(created.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.sessionId).toBe('test-session-456');
      expect(retrieved!.language).toBe('es');
    });

    it('should retrieve session by sessionId string', async () => {
      const sessionData: Omit<InsertAssessmentSession, 'id'> = {
        sessionId: 'test-session-789',
        language: 'fr',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      };

      const created = await storage.createAssessmentSession(sessionData);
      const retrieved = await storage.getAssessmentSessionBySessionId('test-session-789');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.sessionId).toBe('test-session-789');
    });

    it('should update an existing session', async () => {
      const sessionData: Omit<InsertAssessmentSession, 'id'> = {
        sessionId: 'test-session-update',
        language: 'en',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      };

      const created = await storage.createAssessmentSession(sessionData);
      
      const updates = {
        responses: { updated: 'data' },
        coreDriversAnalysis: 'Updated analysis'
      };
      
      const updated = await storage.updateAssessmentSession('test-session-update', updates);
      
      expect(updated).toBeDefined();
      expect(updated!.responses).toEqual({ updated: 'data' });
      expect(updated!.coreDriversAnalysis).toBe('Updated analysis');
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    });

    it('should return undefined for non-existent sessions', async () => {
      const byId = await storage.getAssessmentSessionById(999);
      const bySessionId = await storage.getAssessmentSessionBySessionId('non-existent');
      
      expect(byId).toBeUndefined();
      expect(bySessionId).toBeUndefined();
    });
  });

  describe('Purpose Paths', () => {
    it('should create purpose paths linked to an assessment', async () => {
      const sessionData: Omit<InsertAssessmentSession, 'id'> = {
        sessionId: 'test-session-paths',
        language: 'en',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      };

      const session = await storage.createAssessmentSession(sessionData);
      
      const pathData: Omit<InsertPurposePath, 'id'> = {
        assessmentId: session.id,
        title: 'Software Engineer',
        description: 'Build amazing software',
        whyGoodFit: 'You love coding',
        suggestedActions: ['Learn React', 'Practice algorithms'],
        experienceLevel: 'mid'
      };

      const created = await storage.createPurposePath(pathData);
      
      expect(created.id).toBe(1);
      expect(created.assessmentId).toBe(session.id);
      expect(created.title).toBe('Software Engineer');
      expect(created.suggestedActions).toEqual(['Learn React', 'Practice algorithms']);
    });

    it('should delete purpose paths by assessment ID', async () => {
      const sessionData: Omit<InsertAssessmentSession, 'id'> = {
        sessionId: 'test-session-delete',
        language: 'en',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      };

      const session = await storage.createAssessmentSession(sessionData);
      
      // Create multiple paths
      await storage.createPurposePath({
        assessmentId: session.id,
        title: 'Path 1',
        description: 'Description 1',
        whyGoodFit: 'Fit 1',
        suggestedActions: ['Action 1'],
        experienceLevel: 'entry'
      });
      
      await storage.createPurposePath({
        assessmentId: session.id,
        title: 'Path 2',
        description: 'Description 2',
        whyGoodFit: 'Fit 2',
        suggestedActions: ['Action 2'],
        experienceLevel: 'senior'
      });

      // Delete all paths for this assessment
      await storage.deletePurposePathsByAssessmentId(session.id);
      
      // Verify the session still exists but has no paths
      const retrieved = await storage.getAssessmentSessionById(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.purposePaths).toHaveLength(0);
    });
  });

  describe('Salary Data', () => {
    it('should create salary data linked to a purpose path', async () => {
      const sessionData: Omit<InsertAssessmentSession, 'id'> = {
        sessionId: 'test-session-salary',
        language: 'en',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      };

      const session = await storage.createAssessmentSession(sessionData);
      
      const path = await storage.createPurposePath({
        assessmentId: session.id,
        title: 'Data Scientist',
        description: 'Analyze data',
        whyGoodFit: 'You love numbers',
        suggestedActions: ['Learn Python'],
        experienceLevel: 'mid'
      });

      const salaryData: Omit<InsertSalaryData, 'id'> = {
        pathId: path.id,
        location: 'San Francisco, CA',
        experienceLevel: 'mid',
        averageSalary: 120000,
        salaryRange: { min: 100000, max: 140000 },
        sources: ['glassdoor.com', 'levels.fyi']
      };

      const created = await storage.createSalaryData(salaryData);
      
      expect(created.id).toBe(1);
      expect(created.pathId).toBe(path.id);
      expect(created.location).toBe('San Francisco, CA');
      expect(created.averageSalary).toBe(120000);
      expect(created.salaryRange).toEqual({ min: 100000, max: 140000 });
      expect(created.sources).toEqual(['glassdoor.com', 'levels.fyi']);
      expect(created.retrievedAt).toBeInstanceOf(Date);
    });
  });

  describe('Chat Messages', () => {
    it('should create and retrieve chat messages', async () => {
      const sessionData: Omit<InsertAssessmentSession, 'id'> = {
        sessionId: 'test-session-chat',
        language: 'en',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      };

      const session = await storage.createAssessmentSession(sessionData);
      
      const messageData: Omit<InsertChatMessage, 'id'> = {
        assessmentId: session.id,
        role: 'user',
        content: 'Hello, can you help me?'
      };

      const created = await storage.createChatMessage(messageData);
      
      expect(created.id).toBe(1);
      expect(created.assessmentId).toBe(session.id);
      expect(created.role).toBe('user');
      expect(created.content).toBe('Hello, can you help me?');
      expect(created.createdAt).toBeInstanceOf(Date);
    });

    it('should retrieve chat messages ordered by creation time', async () => {
      const sessionData: Omit<InsertAssessmentSession, 'id'> = {
        sessionId: 'test-session-chat-order',
        language: 'en',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      };

      const session = await storage.createAssessmentSession(sessionData);
      
      // Create messages with slight delays to ensure different timestamps
      const msg1 = await storage.createChatMessage({
        assessmentId: session.id,
        role: 'user',
        content: 'First message'
      });
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const msg2 = await storage.createChatMessage({
        assessmentId: session.id,
        role: 'assistant',
        content: 'Second message'
      });

      const messages = await storage.getChatMessages(session.id);
      
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('First message');
      expect(messages[1].content).toBe('Second message');
      expect(messages[0].createdAt.getTime()).toBeLessThanOrEqual(messages[1].createdAt.getTime());
    });
  });

  describe('Data Relationships', () => {
    it('should properly hydrate session with related data', async () => {
      // Create session
      const session = await storage.createAssessmentSession({
        sessionId: 'test-relationships',
        language: 'en',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      });

      // Create purpose path
      const path = await storage.createPurposePath({
        assessmentId: session.id,
        title: 'Full Stack Developer',
        description: 'Build web applications',
        whyGoodFit: 'You enjoy problem solving',
        suggestedActions: ['Learn TypeScript', 'Build projects'],
        experienceLevel: 'mid'
      });

      // Create salary data for the path
      await storage.createSalaryData({
        pathId: path.id,
        location: 'New York, NY',
        experienceLevel: 'mid',
        averageSalary: 110000,
        salaryRange: { min: 90000, max: 130000 },
        sources: ['indeed.com']
      });

      // Retrieve the session and verify relationships
      const retrieved = await storage.getAssessmentSessionById(session.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.purposePaths).toHaveLength(1);
      expect(retrieved!.purposePaths[0].title).toBe('Full Stack Developer');
      expect(retrieved!.purposePaths[0].salaryData).toHaveLength(1);
      expect(retrieved!.purposePaths[0].salaryData[0].location).toBe('New York, NY');
    });
  });

  describe('Auto-incrementing IDs', () => {
    it('should generate sequential IDs for different entity types', async () => {
      // Create multiple sessions
      const session1 = await storage.createAssessmentSession({
        sessionId: 'session-1',
        language: 'en',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      });

      const session2 = await storage.createAssessmentSession({
        sessionId: 'session-2',
        language: 'en',
        responses: null,
        coreDriversAnalysis: null,
        chosenPathId: null,
        actionPlan: null
      });

      expect(session1.id).toBe(1);
      expect(session2.id).toBe(2);

      // Create multiple paths
      const path1 = await storage.createPurposePath({
        assessmentId: session1.id,
        title: 'Path 1',
        description: 'Description',
        whyGoodFit: 'Fit',
        suggestedActions: [],
        experienceLevel: 'entry'
      });

      const path2 = await storage.createPurposePath({
        assessmentId: session2.id,
        title: 'Path 2',
        description: 'Description',
        whyGoodFit: 'Fit',
        suggestedActions: [],
        experienceLevel: 'mid'
      });

      expect(path1.id).toBe(1);
      expect(path2.id).toBe(2);
    });
  });
});

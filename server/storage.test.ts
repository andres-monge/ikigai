/**
 * @description
 * Integration tests for PostgresStorage class.
 * 
 * These tests connect to the development database to verify that all
 * PostgresStorage methods correctly interact with PostgreSQL through Drizzle ORM.
 * 
 * The tests provide a self-verifying loop - when they fail, they show exactly
 * what's broken, allowing AI agents and developers to quickly identify and fix issues.
 * 
 * @dependencies
 * - Development database must be running and accessible via DATABASE_URL
 * - Tests will clean up their own data to avoid pollution
 */

import { beforeEach, afterAll, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db.js';
import { PostgresStorage } from './storage.js';
import { assessmentSessions, purposePaths } from '../shared/schema.js';
import type { QuestionnaireResponses } from '../shared/schema.js';

// Test instance
const storage = new PostgresStorage();

/* ------------------------------------------------------------------ */
/*                         Test Setup & Cleanup                      */
/* ------------------------------------------------------------------ */

beforeEach(async () => {
  // Clean tables in correct order (foreign keys first)
  await db.delete(purposePaths);
  await db.delete(assessmentSessions);
});

afterAll(async () => {
  // Clean up and close database connections to prevent hanging tests
  await db.delete(purposePaths);
  await db.delete(assessmentSessions);
  
  // Close the PostgreSQL connection pool
  await db.$client.end();
});

/* ------------------------------------------------------------------ */
/*                         Test Data Fixtures                        */
/* ------------------------------------------------------------------ */

const testSessionData = {
  sessionId: 'test-session-123',
  language: 'en' as const,
  responses: {
    passions: [
      { question: "What activities make you lose track of time?", answer: "Building software applications" },
      { question: "What energizes you most?", answer: "Solving complex technical problems" }
    ],
    skills: [
      { question: "What are you naturally good at?", answer: "Programming and system design" },
      { question: "What do others ask for your help with?", answer: "Debugging and code reviews" }
    ],
    values: [
      { question: "What principles guide your decisions?", answer: "Innovation and helping others" },
      { question: "What kind of impact do you want to make?", answer: "Creating tools that improve people's lives" }
    ],
    economic: [
      { question: "How do you prefer to earn money?", answer: "Through technology startups" },
      { question: "What financial goals motivate you?", answer: "Building sustainable passive income" }
    ]
  } as QuestionnaireResponses
};

const testPurposePathData = {
  title: "Software Engineering Leader",
  description: "Lead technical teams to build innovative products",
  actionStrategy: "Focus on developing both technical and leadership skills",
  ikigaiAlignment: {
    passion: "Building software that solves real problems",
    mission: "Creating technology that improves people's lives",
    profession: "Senior Software Engineer / Tech Lead",
    vocation: "Innovation through technology"
  }
};

/* ------------------------------------------------------------------ */
/*                         Assessment Session Tests                   */
/* ------------------------------------------------------------------ */

describe('PostgresStorage - Assessment Sessions', () => {
  
  it('should create a new assessment session with minimal data', async () => {
    const minimalData = {
      sessionId: 'minimal-session',
      language: 'en' as const
    };
    
    const created = await storage.createAssessmentSession(minimalData);
    
    expect(created).toBeDefined();
    expect(created.sessionId).toBe('minimal-session');
    expect(created.language).toBe('en');
    expect(created.id).toBeTypeOf('number');
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
    expect(created.purposePaths).toEqual([]);
    expect(created.responses).toBeNull();
    expect(created.coreDriversAnalysis).toBeNull();
    expect(created.chosenPathId).toBeNull();
    expect(created.actionPlan).toBeNull();
  });

  it('should create a new assessment session with full data', async () => {
    const created = await storage.createAssessmentSession(testSessionData);
    
    expect(created).toBeDefined();
    expect(created.sessionId).toBe(testSessionData.sessionId);
    expect(created.language).toBe(testSessionData.language);
    expect(created.responses).toEqual(testSessionData.responses);
    expect(created.purposePaths).toEqual([]);
    expect(created.id).toBeTypeOf('number');
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });

  it('should retrieve assessment session by ID with hydrated purpose paths', async () => {
    const created = await storage.createAssessmentSession(testSessionData);
    
    const retrieved = await storage.getAssessmentSessionById(created.id);
    
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.sessionId).toBe(testSessionData.sessionId);
    expect(retrieved!.purposePaths).toEqual([]);
  });

  it('should retrieve assessment session by sessionId with hydrated purpose paths', async () => {
    const created = await storage.createAssessmentSession(testSessionData);
    
    const retrieved = await storage.getAssessmentSessionBySessionId(testSessionData.sessionId);
    
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.sessionId).toBe(testSessionData.sessionId);
    expect(retrieved!.purposePaths).toEqual([]);
  });

  it('should return undefined for non-existent session ID', async () => {
    const retrieved = await storage.getAssessmentSessionById(99999);
    expect(retrieved).toBeUndefined();
  });

  it('should return undefined for non-existent sessionId', async () => {
    const retrieved = await storage.getAssessmentSessionBySessionId('non-existent');
    expect(retrieved).toBeUndefined();
  });

  it('should update assessment session and return hydrated result', async () => {
    const created = await storage.createAssessmentSession(testSessionData);
    const originalUpdatedAt = created.updatedAt;
    
    // Wait a small amount to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const updates = {
      coreDriversAnalysis: { 
        strengths: ["Technical expertise", "Problem-solving"],
        motivations: ["Innovation", "Impact"]
      },
      chosenPathId: 1
    };
    
    const updated = await storage.updateAssessmentSession(testSessionData.sessionId, updates);
    
    expect(updated).toBeDefined();
    expect(updated!.coreDriversAnalysis).toEqual(updates.coreDriversAnalysis);
    expect(updated!.chosenPathId).toBe(updates.chosenPathId);
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    expect(updated!.responses).toEqual(testSessionData.responses); // Should preserve existing data
  });

  it('should return undefined when updating non-existent session', async () => {
    const updated = await storage.updateAssessmentSession('non-existent', { 
      coreDriversAnalysis: { test: true } 
    });
    
    expect(updated).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*                         Purpose Path Tests                        */
/* ------------------------------------------------------------------ */

describe('PostgresStorage - Purpose Paths', () => {
  
  it('should create a purpose path linked to an assessment', async () => {
    const session = await storage.createAssessmentSession(testSessionData);
    
    const pathData = {
      ...testPurposePathData,
      assessmentId: session.id
    };
    
    const created = await storage.createPurposePath(pathData);
    
    expect(created).toBeDefined();
    expect(created.id).toBeTypeOf('number');
    expect(created.assessmentId).toBe(session.id);
    expect(created.title).toBe(testPurposePathData.title);
    expect(created.description).toBe(testPurposePathData.description);
    expect(created.actionStrategy).toBe(testPurposePathData.actionStrategy);
    expect(created.ikigaiAlignment).toEqual(testPurposePathData.ikigaiAlignment);
  });

  it('should delete all purpose paths for a specific assessment', async () => {
    const session1 = await storage.createAssessmentSession({
      sessionId: 'session-1',
      language: 'en' as const
    });
    
    const session2 = await storage.createAssessmentSession({
      sessionId: 'session-2', 
      language: 'en' as const
    });
    
    // Create paths for both sessions
    await storage.createPurposePath({
      ...testPurposePathData,
      assessmentId: session1.id,
      title: "Path 1A"
    });
    
    await storage.createPurposePath({
      ...testPurposePathData,
      assessmentId: session1.id,
      title: "Path 1B"
    });
    
    await storage.createPurposePath({
      ...testPurposePathData,
      assessmentId: session2.id,
      title: "Path 2A"
    });
    
    // Delete paths for session1 only
    await storage.deletePurposePathsByAssessmentId(session1.id);
    
    // Verify session1 has no paths, session2 still has its path
    const session1Updated = await storage.getAssessmentSessionById(session1.id);
    const session2Updated = await storage.getAssessmentSessionById(session2.id);
    
    expect(session1Updated!.purposePaths).toHaveLength(0);
    expect(session2Updated!.purposePaths).toHaveLength(1);
    expect(session2Updated!.purposePaths[0].title).toBe("Path 2A");
  });

  it('should handle deletion when no purpose paths exist', async () => {
    const session = await storage.createAssessmentSession(testSessionData);
    
    // Should not throw error when deleting non-existent paths
    await expect(storage.deletePurposePathsByAssessmentId(session.id)).resolves.not.toThrow();
    
    const retrieved = await storage.getAssessmentSessionById(session.id);
    expect(retrieved!.purposePaths).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*                         Hydration & Relationships Tests           */
/* ------------------------------------------------------------------ */

describe('PostgresStorage - Hydration & Relationships', () => {
  
  it('should properly hydrate sessions with their purpose paths', async () => {
    const session = await storage.createAssessmentSession(testSessionData);
    
    // Add multiple purpose paths
    const path1 = await storage.createPurposePath({
      ...testPurposePathData,
      assessmentId: session.id,
      title: "Software Engineer"
    });
    
    const path2 = await storage.createPurposePath({
      ...testPurposePathData,
      assessmentId: session.id,
      title: "Technical Product Manager"
    });
    
    // Retrieve and verify hydration
    const hydrated = await storage.getAssessmentSessionBySessionId(testSessionData.sessionId);
    
    expect(hydrated).toBeDefined();
    expect(hydrated!.purposePaths).toHaveLength(2);
    
    const titles = hydrated!.purposePaths.map(p => p.title).sort();
    expect(titles).toEqual(["Software Engineer", "Technical Product Manager"]);
    
    // Verify each path has correct data
    hydrated!.purposePaths.forEach(path => {
      expect(path.assessmentId).toBe(session.id);
      expect(path.ikigaiAlignment).toEqual(testPurposePathData.ikigaiAlignment);
    });
  });

  it('should maintain referential integrity with foreign key constraints', async () => {
    const session = await storage.createAssessmentSession(testSessionData);
    
    const path = await storage.createPurposePath({
      ...testPurposePathData,
      assessmentId: session.id
    });
    
    // Delete the session (should cascade delete the purpose path due to FK constraint)
    await db.delete(assessmentSessions).where(eq(assessmentSessions.id, session.id));
    
    // Verify the purpose path was automatically deleted
    const remainingPaths = await db.select().from(purposePaths);
    expect(remainingPaths).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*                         Concurrent Operations Tests               */
/* ------------------------------------------------------------------ */

describe('PostgresStorage - Concurrent Operations', () => {
  
  it('should handle concurrent session creation without conflicts', async () => {
    const sessionPromises = Array.from({ length: 5 }, (_, i) => 
      storage.createAssessmentSession({
        sessionId: `concurrent-session-${i}`,
        language: 'en' as const,
        responses: testSessionData.responses
      })
    );
    
    const sessions = await Promise.all(sessionPromises);
    
    // Verify all sessions were created successfully
    expect(sessions).toHaveLength(5);
    sessions.forEach((session, i) => {
      expect(session.sessionId).toBe(`concurrent-session-${i}`);
      expect(session.id).toBeTypeOf('number');
      expect(session.responses).toEqual(testSessionData.responses);
    });
    
    // Verify unique IDs were assigned
    const ids = sessions.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5);
  });

  it('should handle concurrent purpose path creation for same assessment', async () => {
    const session = await storage.createAssessmentSession({
      sessionId: 'concurrent-paths-session',
      language: 'en' as const
    });
    
    const pathPromises = Array.from({ length: 3 }, (_, i) =>
      storage.createPurposePath({
        ...testPurposePathData,
        assessmentId: session.id,
        title: `Concurrent Path ${i + 1}`
      })
    );
    
    const paths = await Promise.all(pathPromises);
    
    // Verify all paths were created successfully
    expect(paths).toHaveLength(3);
    paths.forEach((path, i) => {
      expect(path.title).toBe(`Concurrent Path ${i + 1}`);
      expect(path.assessmentId).toBe(session.id);
      expect(path.id).toBeTypeOf('number');
    });
    
    // Verify the session correctly hydrates all paths
    const hydrated = await storage.getAssessmentSessionById(session.id);
    expect(hydrated!.purposePaths).toHaveLength(3);
  });

  it('should handle concurrent reads while updates are happening', async () => {
    const session = await storage.createAssessmentSession({
      sessionId: 'concurrent-read-write-session',
      language: 'en' as const,
      responses: testSessionData.responses
    });
    
    // Start concurrent operations: multiple reads and one update
    const readPromises = Array.from({ length: 4 }, () =>
      storage.getAssessmentSessionBySessionId('concurrent-read-write-session')
    );
    
    const updatePromise = storage.updateAssessmentSession(
      'concurrent-read-write-session',
      {
        coreDriversAnalysis: {
          strengths: ["Concurrent testing"],
          motivations: ["Data consistency"]
        }
      }
    );
    
    // Execute all operations concurrently
    const [readResults, updateResult] = await Promise.all([
      Promise.all(readPromises),
      updatePromise
    ]);
    
    // Verify reads were successful
    readResults.forEach(result => {
      expect(result).toBeDefined();
      expect(result!.sessionId).toBe('concurrent-read-write-session');
      expect(result!.responses).toEqual(testSessionData.responses);
    });
    
    // Verify update was successful
    expect(updateResult).toBeDefined();
    expect(updateResult!.coreDriversAnalysis).toEqual({
      strengths: ["Concurrent testing"],
      motivations: ["Data consistency"]
    });
  });

  it('should handle concurrent updates to different sessions safely', async () => {
    // Create multiple sessions
    const sessionPromises = Array.from({ length: 3 }, (_, i) =>
      storage.createAssessmentSession({
        sessionId: `concurrent-update-session-${i}`,
        language: 'en' as const
      })
    );
    
    const sessions = await Promise.all(sessionPromises);
    
    // Perform concurrent updates to different sessions
    const updatePromises = sessions.map((session, i) =>
      storage.updateAssessmentSession(session.sessionId, {
        coreDriversAnalysis: {
          sessionIndex: i,
          timestamp: Date.now()
        }
      })
    );
    
    const updatedSessions = await Promise.all(updatePromises);
    
    // Verify each update was applied correctly
    updatedSessions.forEach((updated, i) => {
      expect(updated).toBeDefined();
      expect(updated!.coreDriversAnalysis).toEqual({
        sessionIndex: i,
        timestamp: expect.any(Number)
      });
    });
    
    // Verify isolation: each session has only its own update
    for (let i = 0; i < sessions.length; i++) {
      const retrieved = await storage.getAssessmentSessionById(sessions[i].id);
      expect(retrieved!.coreDriversAnalysis).toEqual({
        sessionIndex: i,
        timestamp: expect.any(Number)
      });
    }
  });

  it('should handle race conditions in purpose path deletion', async () => {
    const session = await storage.createAssessmentSession({
      sessionId: 'race-condition-session',
      language: 'en' as const
    });
    
    // Create multiple purpose paths
    const pathPromises = Array.from({ length: 5 }, (_, i) =>
      storage.createPurposePath({
        ...testPurposePathData,
        assessmentId: session.id,
        title: `Race Path ${i + 1}`
      })
    );
    
    await Promise.all(pathPromises);
    
    // Verify paths were created
    const beforeDeletion = await storage.getAssessmentSessionById(session.id);
    expect(beforeDeletion!.purposePaths).toHaveLength(5);
    
    // Attempt concurrent deletions (should be idempotent)
    const deletionPromises = Array.from({ length: 3 }, () =>
      storage.deletePurposePathsByAssessmentId(session.id)
    );
    
    await Promise.all(deletionPromises);
    
    // Verify all paths were deleted without errors
    const afterDeletion = await storage.getAssessmentSessionById(session.id);
    expect(afterDeletion!.purposePaths).toHaveLength(0);
  });
});
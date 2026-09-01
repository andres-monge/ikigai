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
import { eq, like } from 'drizzle-orm';
import {
  cleanupStorageTestDatabases,
  storageTestDatabase as db,
} from './storage.test-database.js';
import { PostgresStorage } from './storage.js';
import { assessmentSessions, purposePaths } from '../shared/schema.js';
import type { QuestionnaireResponses } from '../shared/schema.js';

const legacyRunPrefix = `legacy-storage-${process.pid}-${Date.now()}-`;
const legacyId = (suffix: string) => `${legacyRunPrefix}${suffix}`;

// Test instance
const storage = new PostgresStorage({ database: db });

/* ------------------------------------------------------------------ */
/*                         Test Setup & Cleanup                      */
/* ------------------------------------------------------------------ */

beforeEach(async () => {
  // Remove only this run's unique fixtures; never clear shared legacy data.
  await db.delete(assessmentSessions)
    .where(like(assessmentSessions.sessionId, `${legacyRunPrefix}%`));
});

afterAll(async () => {
  try {
    await db.delete(assessmentSessions)
      .where(like(assessmentSessions.sessionId, `${legacyRunPrefix}%`));
  } finally {
    await cleanupStorageTestDatabases();
  }
});

/* ------------------------------------------------------------------ */
/*                         Test Data Fixtures                        */
/* ------------------------------------------------------------------ */

const testSessionData = {
  sessionId: legacyId('test-session-123'),
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
      sessionId: legacyId('minimal-session'),
      language: 'en' as const
    };
    
    const created = await storage.createAssessmentSession(minimalData);
    
    expect(created).toBeDefined();
    expect(created.sessionId).toBe(minimalData.sessionId);
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

  it('should delete assessment session by sessionId and return true when session exists', async () => {
    const created = await storage.createAssessmentSession(testSessionData);
    
    // Verify it exists
    const beforeDelete = await storage.getAssessmentSessionBySessionId(testSessionData.sessionId);
    expect(beforeDelete).toBeDefined();
    
    // Delete it
    const wasDeleted = await storage.deleteAssessmentSessionBySessionId(testSessionData.sessionId);
    expect(wasDeleted).toBe(true);
    
    // Verify it's gone
    const afterDelete = await storage.getAssessmentSessionBySessionId(testSessionData.sessionId);
    expect(afterDelete).toBeUndefined();
  });

  it('should return false when deleting non-existent session', async () => {
    const wasDeleted = await storage.deleteAssessmentSessionBySessionId('non-existent-session');
    expect(wasDeleted).toBe(false);
  });
});

describe('PostgresStorage - Conversation provisioning cleanup fencing', () => {
  function methodTurnInput(suffix: string) {
    return {
      userId: legacyId(`provisioning-owner-${suffix}`),
      clientMessageId: legacyId(`provisioning-message-${suffix}`),
      requestFingerprint: legacyId(`provisioning-fingerprint-${suffix}`),
      turnId: legacyId(`provisioning-turn-${suffix}`),
      leaseId: legacyId(`provisioning-lease-${suffix}`),
      leaseDurationMs: 360_000,
    };
  }

  it('never claims a live pending turn marker and atomically resolves it once mapped', async () => {
    const clock = new Date('2030-01-01T00:00:00.000Z');
    const fencedStorage = new PostgresStorage({ database: db, now: () => clock });
    const input = methodTurnInput('live-before-bind');
    const conversationId = legacyId('conversation-live-before-bind');
    await fencedStorage.getOrCreateCareerMap(input.userId);
    const begun = await fencedStorage.beginAgentTurn(input);
    expect(begun.status).toBe('started');
    await fencedStorage.recordConversationProvisioning({
      userId: input.userId,
      turnId: input.turnId,
      leaseId: input.leaseId,
      conversationId,
    });

    expect(await fencedStorage.claimConversationProvisioningCleanup(
      input.userId,
      legacyId('cleanup-claim-live'),
    )).toBeUndefined();
    expect(await fencedStorage.listPendingConversationProvisioning(input.userId)).toEqual([{
      userId: input.userId,
      turnId: input.turnId,
      conversationId,
    }]);

    await fencedStorage.setConversationMapping(input.userId, input.leaseId, conversationId);
    expect(await fencedStorage.claimConversationProvisioningCleanup(
      input.userId,
      legacyId('cleanup-claim-after-bind'),
    )).toBeUndefined();
    expect(await fencedStorage.getConversationMapping(input.userId)).toBe(conversationId);
    expect(await fencedStorage.listPendingConversationProvisioning(input.userId)).toEqual([]);
  });

  it('marks only an unmapped live agent turn conflict as a waitable provisioning handoff', async () => {
    const clock = new Date('2030-01-01T00:00:00.000Z');
    const fencedStorage = new PostgresStorage({ database: db, now: () => clock });
    const active = methodTurnInput('waitable-conflict-active');
    const waiting = methodTurnInput('waitable-conflict-waiting');
    waiting.userId = active.userId;
    await fencedStorage.getOrCreateCareerMap(active.userId);
    expect((await fencedStorage.beginAgentTurn(active)).status).toBe('started');

    const unmappedConflict = await fencedStorage.beginAgentTurn(waiting);
    expect(unmappedConflict).toMatchObject({
      status: 'conflict',
      activeTurnId: active.turnId,
      waitReason: 'conversation-provisioning',
    });

    await fencedStorage.setConversationMapping(
      active.userId,
      active.leaseId,
      legacyId('waitable-conflict-conversation'),
    );
    const mappedConflict = await fencedStorage.beginAgentTurn({
      ...waiting,
      turnId: legacyId('waitable-conflict-mapped-turn'),
      leaseId: legacyId('waitable-conflict-mapped-lease'),
    });
    expect(mappedConflict).toMatchObject({ status: 'conflict', activeTurnId: active.turnId });
    expect(mappedConflict).not.toHaveProperty('waitReason');
  });

  it('serializes concurrent mapping and cleanup claims so a live Conversation is never orphaned', async () => {
    const clock = new Date('2030-01-01T00:00:00.000Z');
    const fencedStorage = new PostgresStorage({ database: db, now: () => clock });
    const input = methodTurnInput('concurrent-bind-claim');
    const conversationId = legacyId('conversation-concurrent-bind-claim');
    await fencedStorage.getOrCreateCareerMap(input.userId);
    expect((await fencedStorage.beginAgentTurn(input)).status).toBe('started');
    await fencedStorage.recordConversationProvisioning({
      userId: input.userId,
      turnId: input.turnId,
      leaseId: input.leaseId,
      conversationId,
    });

    const [mappingResult, cleanupClaim] = await Promise.all([
      fencedStorage.setConversationMapping(input.userId, input.leaseId, conversationId),
      fencedStorage.claimConversationProvisioningCleanup(
        input.userId,
        legacyId('cleanup-claim-concurrent-bind'),
      ),
    ]);

    expect(mappingResult).toBeUndefined();
    expect(cleanupClaim).toBeUndefined();
    expect(await fencedStorage.getConversationMapping(input.userId)).toBe(conversationId);
    expect(await fencedStorage.listPendingConversationProvisioning(input.userId)).toEqual([]);
  });

  it('claims only abandoned markers and fences completion and retry by claim identity', async () => {
    let clock = new Date('2030-01-01T00:00:00.000Z');
    const fencedStorage = new PostgresStorage({ database: db, now: () => clock });
    const input = methodTurnInput('expired');
    const conversationId = legacyId('conversation-expired');
    await fencedStorage.getOrCreateCareerMap(input.userId);
    expect((await fencedStorage.beginAgentTurn(input)).status).toBe('started');
    await fencedStorage.recordConversationProvisioning({
      userId: input.userId,
      turnId: input.turnId,
      leaseId: input.leaseId,
      conversationId,
    });

    clock = new Date(clock.getTime() + input.leaseDurationMs + 1);
    const firstClaimId = legacyId('cleanup-claim-expired-1');
    const firstClaim = await fencedStorage.claimConversationProvisioningCleanup(
      input.userId,
      firstClaimId,
    );
    expect(firstClaim).toEqual({
      userId: input.userId,
      turnId: input.turnId,
      conversationId,
      claimId: firstClaimId,
    });
    expect(await fencedStorage.claimConversationProvisioningCleanup(
      input.userId,
      legacyId('cleanup-competing-claim'),
    )).toBeUndefined();

    await fencedStorage.completeConversationProvisioningCleanup({
      ...firstClaim!,
      claimId: legacyId('cleanup-wrong-claim'),
    });
    expect(await fencedStorage.listPendingConversationProvisioning(input.userId)).toEqual([]);
    await fencedStorage.releaseConversationProvisioningCleanup(firstClaim!);
    expect(await fencedStorage.listPendingConversationProvisioning(input.userId)).toEqual([{
      userId: input.userId,
      turnId: input.turnId,
      conversationId,
    }]);

    const secondClaimId = legacyId('cleanup-claim-expired-2');
    const secondClaim = await fencedStorage.claimConversationProvisioningCleanup(
      input.userId,
      secondClaimId,
    );
    expect(secondClaim).toEqual({
      userId: input.userId,
      turnId: input.turnId,
      conversationId,
      claimId: secondClaimId,
    });
    await fencedStorage.completeConversationProvisioningCleanup(secondClaim!);
    expect(await fencedStorage.listPendingConversationProvisioning(input.userId)).toEqual([]);
  });

  it('keeps a provisioning identity discoverable when releasing its turn, then claims it as terminal', async () => {
    const clock = new Date('2030-01-01T00:00:00.000Z');
    const fencedStorage = new PostgresStorage({ database: db, now: () => clock });
    const input = methodTurnInput('released');
    const conversationId = legacyId('conversation-released');
    await fencedStorage.getOrCreateCareerMap(input.userId);
    expect((await fencedStorage.beginAgentTurn(input)).status).toBe('started');
    await fencedStorage.recordConversationProvisioning({
      userId: input.userId,
      turnId: input.turnId,
      leaseId: input.leaseId,
      conversationId,
    });

    expect(await fencedStorage.releaseTurnLease(
      input.userId,
      input.turnId,
      input.leaseId,
    )).toBe(true);
    expect(await fencedStorage.listPendingConversationProvisioning(input.userId)).toEqual([{
      userId: input.userId,
      turnId: input.turnId,
      conversationId,
    }]);
    const claimId = legacyId('cleanup-claim-released');
    expect(await fencedStorage.claimConversationProvisioningCleanup(input.userId, claimId)).toEqual({
      userId: input.userId,
      turnId: input.turnId,
      conversationId,
      claimId,
    });
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
      sessionId: legacyId('session-1'),
      language: 'en' as const
    });
    
    const session2 = await storage.createAssessmentSession({
      sessionId: legacyId('session-2'),
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
    const remainingPaths = await db.select().from(purposePaths)
      .where(eq(purposePaths.assessmentId, session.id));
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
        sessionId: legacyId(`concurrent-session-${i}`),
        language: 'en' as const,
        responses: testSessionData.responses
      })
    );
    
    const sessions = await Promise.all(sessionPromises);
    
    // Verify all sessions were created successfully
    expect(sessions).toHaveLength(5);
    sessions.forEach((session, i) => {
      expect(session.sessionId).toBe(legacyId(`concurrent-session-${i}`));
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
      sessionId: legacyId('concurrent-paths-session'),
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
      sessionId: legacyId('concurrent-read-write-session'),
      language: 'en' as const,
      responses: testSessionData.responses
    });
    
    // Start concurrent operations: multiple reads and one update
    const readPromises = Array.from({ length: 4 }, () =>
      storage.getAssessmentSessionBySessionId(legacyId('concurrent-read-write-session'))
    );
    
    const updatePromise = storage.updateAssessmentSession(
      legacyId('concurrent-read-write-session'),
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
      expect(result!.sessionId).toBe(legacyId('concurrent-read-write-session'));
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
        sessionId: legacyId(`concurrent-update-session-${i}`),
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
      sessionId: legacyId('race-condition-session'),
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

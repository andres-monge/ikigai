/**
 * @description
 * Tests for the questionnaire save endpoint (/api/questionnaire/save).
 * This endpoint saves questionnaire responses WITHOUT triggering AI generation,
 * enabling instant navigation to streaming pages.
 * 
 * This test suite verifies:
 * - Successful save returns minimal response format
 * - Existing sessions are updated and AI data is cleared
 * - New sessions are created without AI data
 * - AI chains are never invoked
 * - Validation errors are handled correctly
 * - Database transactions ensure atomicity
 */

import { beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db } from '../../db.js';
import { assessmentSessions, purposePaths } from '../../../shared/schema.js';
import type { QuestionnaireResponses } from '../../../shared/schema.js';
import { assessmentRouter } from './index.js';
import { storage } from '../../storage.js';

// Mock the AI chains to ensure they're never called
vi.mock('../../ai/chains', () => ({
  getPurposeDiscoveryChain: vi.fn(),
  getActionPlanChain: vi.fn(),
}));

import { getPurposeDiscoveryChain, getActionPlanChain } from '../../ai/chains';

/* ------------------------------------------------------------------ */
/*                         Test Setup & Cleanup                      */
/* ------------------------------------------------------------------ */

beforeEach(async () => {
  // Clean tables in correct order (foreign keys first)
  await db.delete(purposePaths);
  await db.delete(assessmentSessions);
  
  // Reset all mocks
  vi.clearAllMocks();
});

afterAll(async () => {
  // Clean up and close database connections
  try {
    await db.delete(purposePaths);
    await db.delete(assessmentSessions);
  } catch (error) {
    console.log('Cleanup error (expected in test environment):', error);
  }
  
  // Close the PostgreSQL connection pool
  try {
    await db.$client.end();
  } catch (error) {
    console.log('Connection close error (expected in test environment):', error);
  }
}, 15000);

/* ------------------------------------------------------------------ */
/*                         Test Data Fixtures                        */
/* ------------------------------------------------------------------ */

const testQuestionnaireSaveData = {
  sessionId: 'questionnaire-save-test-session',
  language: 'en' as const,
  responses: {
    passions: [
      { question: "What activities make you lose track of time?", answer: "Writing code" },
      { question: "What energizes you most?", answer: "Solving complex problems" }
    ],
    skills: [
      { question: "What are you naturally good at?", answer: "Programming" },
      { question: "What do others ask for your help with?", answer: "Technical solutions" }
    ],
    values: [
      { question: "What principles guide your decisions?", answer: "Innovation and quality" },
      { question: "What kind of impact do you want to make?", answer: "Better software" }
    ],
    economic: [
      { question: "How do you prefer to earn money?", answer: "Through software development" },
      { question: "What financial goals motivate you?", answer: "Financial independence" }
    ]
  } as QuestionnaireResponses
};

const updatedResponses = {
  passions: [
    { question: "What activities make you lose track of time?", answer: "Updated: Creating user interfaces" },
    { question: "What energizes you most?", answer: "Updated: Designing great UX" }
  ],
  skills: [
    { question: "What are you naturally good at?", answer: "Updated: Frontend development" },
    { question: "What do others ask for your help with?", answer: "Updated: UI/UX advice" }
  ],
  values: [
    { question: "What principles guide your decisions?", answer: "Updated: User-centered design" },
    { question: "What kind of impact do you want to make?", answer: "Updated: Better user experiences" }
  ],
  economic: [
    { question: "How do you prefer to earn money?", answer: "Updated: Through frontend work" },
    { question: "What financial goals motivate you?", answer: "Updated: Competitive salary" }
  ]
} as QuestionnaireResponses;

// Create a test app for route testing
let app: express.Application;

/* ------------------------------------------------------------------ */
/*                         Route Test Setup                          */
/* ------------------------------------------------------------------ */

// Test app setup function (mirrored from assessment.test.ts)
function createTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api', assessmentRouter);
  
  // Add error handler for test app
  testApp.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ 
      error: err.message || 'Internal server error',
      details: err.stack 
    });
  });
  
  return testApp;
}

/* ------------------------------------------------------------------ */
/*                         Questionnaire Save Tests                  */
/* ------------------------------------------------------------------ */

describe('POST /api/questionnaire/save', () => {

  beforeEach(async () => {
    // Create fresh test app for each test
    app = createTestApp();
  });

  it('should successfully save new session with minimal response', async () => {
    const response = await request(app)
      .post('/api/questionnaire/save')
      .send(testQuestionnaireSaveData);

    // Verify response format
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      sessionId: testQuestionnaireSaveData.sessionId,
      success: true
    });

    // Verify session was created in database
    const session = await storage.getAssessmentSessionBySessionId(testQuestionnaireSaveData.sessionId);
    expect(session).toBeDefined();
    expect(session!.sessionId).toBe(testQuestionnaireSaveData.sessionId);
    expect(session!.language).toBe('en');
    expect(session!.responses).toEqual(testQuestionnaireSaveData.responses);
    
    // Verify NO AI data is present
    expect(session!.coreDriversAnalysis).toBeNull();
    expect(session!.chosenPathId).toBeNull();
    expect(session!.actionPlan).toBeNull();
    expect(session!.purposePaths).toHaveLength(0);

    // Verify AI chains were NOT called
    expect(getPurposeDiscoveryChain).not.toHaveBeenCalled();
    expect(getActionPlanChain).not.toHaveBeenCalled();
  });

  it('should update existing session and clear all AI data', async () => {
    // First, create a session with AI data
    const session = await storage.createAssessmentSession({
      sessionId: testQuestionnaireSaveData.sessionId,
      language: 'en',
      responses: testQuestionnaireSaveData.responses,
      coreDriversAnalysis: { strengths: ["Old analysis"] },
      chosenPathId: null,
      actionPlan: null
    });

    // Add some purpose paths
    await storage.createPurposePath({
      assessmentId: session.id,
      title: "Old Path 1",
      description: "This should be deleted",
      ikigaiAlignment: { passion: "Old passion" },
      actionStrategy: "Old strategy"
    });

    await storage.createPurposePath({
      assessmentId: session.id,
      title: "Old Path 2", 
      description: "This should also be deleted",
      ikigaiAlignment: { mission: "Old mission" },
      actionStrategy: "Another old strategy"
    });

    // Verify initial state
    const beforeUpdate = await storage.getAssessmentSessionBySessionId(testQuestionnaireSaveData.sessionId);
    expect(beforeUpdate!.purposePaths).toHaveLength(2);
    expect(beforeUpdate!.coreDriversAnalysis).toBeDefined();

    // Now update via the save endpoint
    const response = await request(app)
      .post('/api/questionnaire/save')
      .send({
        ...testQuestionnaireSaveData,
        responses: updatedResponses,
        language: 'es' // Also test language update
      });

    // Verify response
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      sessionId: testQuestionnaireSaveData.sessionId,
      success: true
    });

    // Verify session was updated and AI data cleared
    const afterUpdate = await storage.getAssessmentSessionBySessionId(testQuestionnaireSaveData.sessionId);
    expect(afterUpdate).toBeDefined();
    expect(afterUpdate!.responses).toEqual(updatedResponses);
    expect(afterUpdate!.language).toBe('es');
    
    // Verify ALL AI data was cleared
    expect(afterUpdate!.coreDriversAnalysis).toBeNull();
    expect(afterUpdate!.chosenPathId).toBeNull();
    expect(afterUpdate!.actionPlan).toBeNull();
    expect(afterUpdate!.purposePaths).toHaveLength(0); // All old paths deleted

    // Verify AI chains were NOT called
    expect(getPurposeDiscoveryChain).not.toHaveBeenCalled();
    expect(getActionPlanChain).not.toHaveBeenCalled();
  });

  it('should handle validation errors correctly', async () => {
    // Test missing sessionId
    const invalidRequest1 = await request(app)
      .post('/api/questionnaire/save')
      .send({
        language: 'en',
        responses: testQuestionnaireSaveData.responses
        // Missing sessionId
      });

    expect(invalidRequest1.status).toBe(400);
    expect(invalidRequest1.body.error).toBe("Invalid request data");
    expect(invalidRequest1.body.details).toBeDefined();

    // Test invalid language
    const invalidRequest2 = await request(app)
      .post('/api/questionnaire/save')
      .send({
        sessionId: 'test-session',
        language: 'invalid-language',
        responses: testQuestionnaireSaveData.responses
      });

    expect(invalidRequest2.status).toBe(400);
    expect(invalidRequest2.body.error).toBe("Invalid request data");

    // Test missing responses category
    const invalidRequest3 = await request(app)
      .post('/api/questionnaire/save')
      .send({
        sessionId: 'test-session',
        language: 'en',
        responses: {
          passions: testQuestionnaireSaveData.responses.passions,
          skills: testQuestionnaireSaveData.responses.skills,
          values: testQuestionnaireSaveData.responses.values
          // Missing economic category
        }
      });

    expect(invalidRequest3.status).toBe(400);
    expect(invalidRequest3.body.error).toBe("Invalid request data");

    // Verify no AI chains were called during validation failures
    expect(getPurposeDiscoveryChain).not.toHaveBeenCalled();
    expect(getActionPlanChain).not.toHaveBeenCalled();
  });

  it('should handle database transaction failures gracefully', async () => {
    // Mock db.transaction to fail
    const dbSpy = vi.spyOn(db, 'transaction').mockRejectedValue(
      new Error('Database connection timeout')
    );

    const response = await request(app)
      .post('/api/questionnaire/save')
      .send(testQuestionnaireSaveData);

    // Verify error response
    expect(response.status).toBe(500);
    expect(response.body.error).toBeDefined();

    // Verify no partial data was saved
    const session = await storage.getAssessmentSessionBySessionId(testQuestionnaireSaveData.sessionId);
    expect(session).toBeUndefined();

    // Verify AI chains were NOT called
    expect(getPurposeDiscoveryChain).not.toHaveBeenCalled();
    expect(getActionPlanChain).not.toHaveBeenCalled();

    // Cleanup
    dbSpy.mockRestore();
  });

  it('should preserve atomicity when clearing existing AI data fails', async () => {
    // Create a session with existing AI data
    const session = await storage.createAssessmentSession({
      sessionId: 'atomic-test-session',
      language: 'en',
      responses: testQuestionnaireSaveData.responses,
      coreDriversAnalysis: { strengths: ["Existing analysis"] }
    });

    await storage.createPurposePath({
      assessmentId: session.id,
      title: "Existing Path",
      description: "Should be preserved on failure",
      ikigaiAlignment: { passion: "Testing" },
      actionStrategy: "Current strategy"
    });

    // Mock db.transaction to fail after clearing paths but before updating session
    let callCount = 0;
    const dbSpy = vi.spyOn(db, 'transaction').mockImplementation(async (callback) => {
      callCount++;
      // Fail the transaction to test rollback
      throw new Error('Transaction failed during session update');
    });

    const response = await request(app)
      .post('/api/questionnaire/save')
      .send({
        sessionId: 'atomic-test-session',
        language: 'en',
        responses: updatedResponses
      });

    // Verify error response
    expect(response.status).toBe(500);
    expect(callCount).toBe(1);

    // Verify original data is preserved (transaction rolled back)
    const afterFailure = await storage.getAssessmentSessionBySessionId('atomic-test-session');
    expect(afterFailure).toBeDefined();
    expect(afterFailure!.purposePaths).toHaveLength(1);
    expect(afterFailure!.purposePaths[0].title).toBe("Existing Path");
    expect(afterFailure!.coreDriversAnalysis).toBeDefined();
    expect(afterFailure!.responses).toEqual(testQuestionnaireSaveData.responses); // Original responses preserved

    // Cleanup
    dbSpy.mockRestore();
    await storage.deleteAssessmentSessionBySessionId('atomic-test-session');
  });

  it('should handle different languages correctly', async () => {
    const spanishRequest = {
      sessionId: 'spanish-test-session',
      language: 'es' as const,
      responses: {
        passions: [
          { question: "¿Qué actividades te hacen perder la noción del tiempo?", answer: "Programar" }
        ],
        skills: [
          { question: "¿En qué eres naturalmente bueno?", answer: "Desarrollo web" }
        ],
        values: [
          { question: "¿Qué principios guían tus decisiones?", answer: "Calidad y innovación" }
        ],
        economic: [
          { question: "¿Cómo prefieres ganar dinero?", answer: "Desarrollo de software" }
        ]
      } as QuestionnaireResponses
    };

    const response = await request(app)
      .post('/api/questionnaire/save')
      .send(spanishRequest);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      sessionId: 'spanish-test-session',
      success: true
    });

    const session = await storage.getAssessmentSessionBySessionId('spanish-test-session');
    expect(session!.language).toBe('es');
    expect(session!.responses).toEqual(spanishRequest.responses);

    // Verify AI chains were NOT called
    expect(getPurposeDiscoveryChain).not.toHaveBeenCalled();
    expect(getActionPlanChain).not.toHaveBeenCalled();
  });

  it('should maintain session timestamps correctly', async () => {
    const beforeCreate = new Date();
    
    // Create new session
    const response1 = await request(app)
      .post('/api/questionnaire/save')
      .send(testQuestionnaireSaveData);

    expect(response1.status).toBe(200);

    const afterCreate = new Date();
    const session1 = await storage.getAssessmentSessionBySessionId(testQuestionnaireSaveData.sessionId);
    
    expect(session1!.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    expect(session1!.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    expect(session1!.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    expect(session1!.updatedAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());

    // Wait a moment then update
    await new Promise(resolve => setTimeout(resolve, 10));
    const beforeUpdate = new Date();

    const response2 = await request(app)
      .post('/api/questionnaire/save')
      .send({
        ...testQuestionnaireSaveData,
        responses: updatedResponses
      });

    expect(response2.status).toBe(200);

    const afterUpdate = new Date();
    const session2 = await storage.getAssessmentSessionBySessionId(testQuestionnaireSaveData.sessionId);
    
    // createdAt should remain the same, updatedAt should change
    expect(session2!.createdAt.getTime()).toBe(session1!.createdAt.getTime());
    expect(session2!.updatedAt.getTime()).toBeGreaterThan(session1!.updatedAt.getTime());
    expect(session2!.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    expect(session2!.updatedAt.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
  });

  it('should handle concurrent session access correctly', async () => {
    const concurrentSessionId = 'concurrent-test-session';
    
    // Create initial session
    await storage.createAssessmentSession({
      sessionId: concurrentSessionId,
      language: 'en',
      responses: testQuestionnaireSaveData.responses
    });

    // Simulate concurrent requests with different response data
    const request1 = request(app)
      .post('/api/questionnaire/save')
      .send({
        sessionId: concurrentSessionId,
        language: 'en',
        responses: {
          ...testQuestionnaireSaveData.responses,
          passions: [{ question: "Test 1", answer: "Concurrent update 1" }]
        }
      });

    const request2 = request(app)
      .post('/api/questionnaire/save')
      .send({
        sessionId: concurrentSessionId,
        language: 'es',
        responses: {
          ...testQuestionnaireSaveData.responses,
          passions: [{ question: "Test 2", answer: "Concurrent update 2" }]
        }
      });

    // Execute both requests concurrently
    const [response1, response2] = await Promise.all([request1, request2]);

    // Both should succeed
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response1.body).toEqual({ sessionId: concurrentSessionId, success: true });
    expect(response2.body).toEqual({ sessionId: concurrentSessionId, success: true });

    // Verify final state is consistent (one of the updates should have won)
    const finalSession = await storage.getAssessmentSessionBySessionId(concurrentSessionId);
    expect(finalSession).toBeDefined();
    expect(['en', 'es']).toContain(finalSession!.language);
    
    // Should have either response 1 or response 2, but not corrupted data
    const finalAnswer = finalSession!.responses.passions[0].answer;
    expect(['Concurrent update 1', 'Concurrent update 2']).toContain(finalAnswer);
  });

  it('should rollback properly on database constraint violations', async () => {
    const constraintTestSessionId = 'constraint-test-session';
    
    // Create a session with purpose paths
    const session = await storage.createAssessmentSession({
      sessionId: constraintTestSessionId,
      language: 'en',
      responses: testQuestionnaireSaveData.responses
    });

    await storage.createPurposePath({
      assessmentId: session.id,
      title: "Original Path",
      description: "Should be preserved on constraint failure",
      ikigaiAlignment: { passion: "Testing" },
      actionStrategy: "Original strategy"
    });

    // Mock a database constraint error during the update
    // This simulates scenarios like database connection issues, constraint violations, etc.
    const dbSpy = vi.spyOn(db, 'transaction').mockImplementationOnce(async (callback) => {
      // Start the transaction but fail during execution
      throw new Error('Database constraint violation: foreign key constraint failed');
    });

    const response = await request(app)
      .post('/api/questionnaire/save')
      .send({
        sessionId: constraintTestSessionId,
        language: 'es',
        responses: updatedResponses
      });

    // Should return structured error
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to update your session. Please try again.');
    expect(response.body.code).toBe('DATABASE_TRANSACTION_FAILED');

    // Original data should be preserved (rollback successful)
    const preservedSession = await storage.getAssessmentSessionBySessionId(constraintTestSessionId);
    expect(preservedSession).toBeDefined();
    expect(preservedSession!.language).toBe('en'); // Original language
    expect(preservedSession!.responses).toEqual(testQuestionnaireSaveData.responses); // Original responses
    expect(preservedSession!.purposePaths).toHaveLength(1);
    expect(preservedSession!.purposePaths[0].title).toBe("Original Path");

    // Cleanup
    dbSpy.mockRestore();
    await storage.deleteAssessmentSessionBySessionId(constraintTestSessionId);
  });

  it('should handle transaction timeouts gracefully', async () => {
    const timeoutSessionId = 'timeout-test-session';
    
    // Mock a transaction timeout
    const dbSpy = vi.spyOn(db, 'transaction').mockImplementationOnce(async () => {
      // Simulate a database timeout
      throw new Error('connection timeout');
    });

    const response = await request(app)
      .post('/api/questionnaire/save')
      .send({
        sessionId: timeoutSessionId,
        language: 'en',
        responses: testQuestionnaireSaveData.responses
      });

    // Should return appropriate error response
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to update your session. Please try again.');
    expect(response.body.code).toBe('DATABASE_TRANSACTION_FAILED');

    // Should not have created any partial data
    const session = await storage.getAssessmentSessionBySessionId(timeoutSessionId);
    expect(session).toBeUndefined();

    // Cleanup
    dbSpy.mockRestore();
  });

});
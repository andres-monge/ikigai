/**
 * @description
 * Integration tests for session management endpoints.
 * 
 * ✨ Step 8 Implementation ✨
 * ──────────────────────────
 * Tests both GET /api/session/:sessionId and POST /api/session/start-over
 * endpoints to ensure they work correctly with the PostgreSQL database.
 * 
 * @dependencies
 * - Development database must be running and accessible via DATABASE_URL
 * - Tests create and clean up their own test data
 * - Uses supertest for HTTP endpoint testing
 */

import { beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { sessionRouter } from './session.js';
import { assessmentSessions, purposePaths } from '../../shared/schema.js';
import type { QuestionnaireResponses } from '../../shared/schema.js';

// Create a test app
let app: express.Application;

// Test data helpers with unique identifiers per test run
const testSessionId = 'session-test-' + Math.random().toString(36) + '-' + Date.now();
const testSessionId2 = 'session-test-2-' + Math.random().toString(36) + '-' + Date.now();

const sampleQuestionnaireResponses: QuestionnaireResponses = {
  passions: [
    { question: "What activities make you lose track of time?", answer: "Programming and solving complex problems" }
  ],
  skills: [
    { question: "What are you naturally good at?", answer: "Logical thinking and communication" }
  ],
  values: [
    { question: "What matters most to you in work?", answer: "Making a positive impact" }
  ],
  economic: [
    { question: "What are your financial goals?", answer: "Comfortable living with growth potential" }
  ]
};

/* ------------------------------------------------------------------ */
/*                         Test Setup & Cleanup                      */
/* ------------------------------------------------------------------ */

beforeEach(async () => {
  // Only clean up our specific test sessions to avoid interfering with other tests
  try {
    await db.delete(assessmentSessions).where(eq(assessmentSessions.sessionId, testSessionId));
    await db.delete(assessmentSessions).where(eq(assessmentSessions.sessionId, testSessionId2));
  } catch (error) {
    // Ignore cleanup errors for non-existent data
  }
  
  // Create a minimal test app with just the session routes
  app = express();
  app.use(express.json());
  app.use('/api', sessionRouter);
});

afterAll(async () => {
  // Final cleanup of our test data only
  try {
    await db.delete(assessmentSessions).where(eq(assessmentSessions.sessionId, testSessionId));
    await db.delete(assessmentSessions).where(eq(assessmentSessions.sessionId, testSessionId2));
  } catch (error) {
    // Ignore cleanup errors
  }
  
  // Don't close the database connection as other tests might be using it
});

/* ------------------------------------------------------------------ */
/*                         GET /api/session/:sessionId Tests         */
/* ------------------------------------------------------------------ */

describe('GET /api/session/:sessionId', () => {
  it('should return 404 for non-existent session', async () => {
    const response = await request(app)
      .get('/api/session/non-existent-session')
      .expect(404);

    expect(response.body).toEqual({
      error: "Session not found",
      message: "No session found with id: non-existent-session"
    });
  });

  it('should return 400 for empty sessionId parameter', async () => {
    // Test with URL-encoded empty string
    const response = await request(app)
      .get('/api/session/%20%20%20') // URL-encoded spaces
      .expect(400);

    expect(response.body.error).toBe("Invalid sessionId parameter");
  });

  it('should return hydrated session data when session exists', async () => {
    // Create a test session with purpose paths
    const session = await storage.createAssessmentSession({
      sessionId: testSessionId,
      language: 'en',
      responses: sampleQuestionnaireResponses,
      coreDriversAnalysis: {
        summary: "Test user values impact and logical thinking.",
        strengthsAnalysis: "Strong analytical and communication skills."
      }
    });

    // Add some purpose paths
    await storage.createPurposePath({
      assessmentId: session.id,
      title: "Software Engineer",
      description: "Build impactful software solutions",
      ikigaiAlignment: {
        passion: "Programming and problem-solving",
        mission: "Creating useful software",
        profession: "Software development",
        pay: "Competitive salary with growth potential"
      },
      actionStrategy: "Focus on full-stack development skills"
    });

    await storage.createPurposePath({
      assessmentId: session.id,
      title: "Technical Writer",
      description: "Communicate complex technical concepts",
      ikigaiAlignment: {
        passion: "Writing and explaining",
        mission: "Making technology accessible",
        profession: "Technical communication",
        pay: "Good salary with remote opportunities"
      },
      actionStrategy: "Build a portfolio of technical writing"
    });

    // Test the GET endpoint
    const response = await request(app)
      .get(`/api/session/${testSessionId}`)
      .expect(200);

    // Verify response structure
    expect(response.body).toMatchObject({
      id: session.id,
      sessionId: testSessionId,
      language: 'en',
      responses: sampleQuestionnaireResponses,
      coreDriversAnalysis: {
        summary: "Test user values impact and logical thinking.",
        strengthsAnalysis: "Strong analytical and communication skills."
      },
      purposePaths: expect.arrayContaining([
        expect.objectContaining({
          title: "Software Engineer",
          description: "Build impactful software solutions"
        }),
        expect.objectContaining({
          title: "Technical Writer", 
          description: "Communicate complex technical concepts"
        })
      ])
    });

    expect(response.body.purposePaths).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*                    POST /api/session/start-over Tests             */
/* ------------------------------------------------------------------ */

describe('POST /api/session/start-over', () => {
  it('should return 400 for invalid request body', async () => {
    const response = await request(app)
      .post('/api/session/start-over')
      .send({}) // Missing sessionId
      .expect(400);

    expect(response.body.error).toBe("Invalid request data");
    expect(response.body.details).toBeDefined();
  });

  it('should return 400 for empty sessionId', async () => {
    const response = await request(app)
      .post('/api/session/start-over')
      .send({ sessionId: "" })
      .expect(400);

    expect(response.body.error).toBe("Invalid request data");
  });

  it('should return success for non-existent session (idempotent)', async () => {
    const response = await request(app)
      .post('/api/session/start-over')
      .send({ sessionId: 'non-existent-session' })
      .expect(200);

    expect(response.body.message).toBe("Session was already cleared or did not exist");
  });

  it('should delete session and cascade delete purpose paths', async () => {
    // Create a test session with purpose paths
    const session = await storage.createAssessmentSession({
      sessionId: testSessionId2,
      language: 'en',
      responses: sampleQuestionnaireResponses,
      coreDriversAnalysis: {
        summary: "Test user for deletion.",
        strengthsAnalysis: "Will be deleted."
      }
    });

    // Add purpose paths
    const path1 = await storage.createPurposePath({
      assessmentId: session.id,
      title: "Test Path 1",
      description: "Will be deleted",
      ikigaiAlignment: {},
      actionStrategy: "Test strategy"
    });

    const path2 = await storage.createPurposePath({
      assessmentId: session.id,
      title: "Test Path 2", 
      description: "Will also be deleted",
      ikigaiAlignment: {},
      actionStrategy: "Another test strategy"
    });

    // Verify data exists before deletion
    const beforeSession = await storage.getAssessmentSessionBySessionId(testSessionId2);
    expect(beforeSession).toBeTruthy();
    expect(beforeSession!.purposePaths).toHaveLength(2);

    // Call start-over endpoint
    const response = await request(app)
      .post('/api/session/start-over')
      .send({ sessionId: testSessionId2 })
      .expect(200);

    expect(response.body.message).toBe("Session data cleared successfully");

    // Verify session is deleted
    const afterSession = await storage.getAssessmentSessionBySessionId(testSessionId2);
    expect(afterSession).toBeUndefined();

    // Verify purpose paths are cascade deleted
    const remainingPaths = await db.select()
      .from(purposePaths)
      .where(eq(purposePaths.assessmentId, session.id));
    expect(remainingPaths).toHaveLength(0);
  });

  it('should be idempotent - second call also returns success', async () => {
    // Create and delete session
    const session = await storage.createAssessmentSession({
      sessionId: testSessionId,
      language: 'en',
      responses: sampleQuestionnaireResponses
    });

    // First deletion call
    const response1 = await request(app)
      .post('/api/session/start-over')
      .send({ sessionId: testSessionId })
      .expect(200);

    expect(response1.body.message).toBe("Session data cleared successfully");

    // Second deletion call should also succeed
    const response2 = await request(app)
      .post('/api/session/start-over')
      .send({ sessionId: testSessionId })
      .expect(200);

    expect(response2.body.message).toBe("Session was already cleared or did not exist");
  });
});

/* ------------------------------------------------------------------ */
/*                         Integration Flow Tests                     */
/* ------------------------------------------------------------------ */

describe('Session lifecycle integration', () => {
  it('should handle full lifecycle: create → retrieve → delete → verify deletion', async () => {
    const lifecycleSessionId = 'lifecycle-test-' + Math.random().toString(36) + '-' + Date.now();
    
    // 1. Create session
    const session = await storage.createAssessmentSession({
      sessionId: lifecycleSessionId,
      language: 'en',
      responses: sampleQuestionnaireResponses
    });

    // 2. Add purpose path
    await storage.createPurposePath({
      assessmentId: session.id,
      title: "Lifecycle Test Path",
      description: "Test path for full lifecycle",
      ikigaiAlignment: { passion: "Testing" },
      actionStrategy: "Run tests"
    });

    // 3. Retrieve via GET endpoint
    const getResponse = await request(app)
      .get(`/api/session/${lifecycleSessionId}`)
      .expect(200);

    expect(getResponse.body.sessionId).toBe(lifecycleSessionId);
    expect(getResponse.body.purposePaths).toHaveLength(1);

    // 4. Delete via POST endpoint
    const deleteResponse = await request(app)
      .post('/api/session/start-over')
      .send({ sessionId: lifecycleSessionId })
      .expect(200);

    expect(deleteResponse.body.message).toBe("Session data cleared successfully");

    // 5. Verify deletion via GET endpoint
    const getAfterDeleteResponse = await request(app)
      .get(`/api/session/${lifecycleSessionId}`)
      .expect(404);

    expect(getAfterDeleteResponse.body.error).toBe("Session not found");

    // Cleanup
    await db.delete(assessmentSessions).where(eq(assessmentSessions.sessionId, lifecycleSessionId));
  });
});
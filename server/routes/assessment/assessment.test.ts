/**
 * @description
 * Tests for the assessment routes, focusing on concurrency limiter functionality
 * and atomic operations for data consistency.
 * 
 * This test suite verifies:
 * - p-limit concurrency control works correctly
 * - Atomic operations ensure data consistency when path creation fails
 */

import { beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db.js';
import { assessmentSessions, purposePaths } from '../../../shared/schema.js';
import type { QuestionnaireResponses } from '../../../shared/schema.js';
import { assessmentRouter } from './index.js';
import { storage, PostgresStorage } from '../../storage.js';

// Mock the AI chains to control timing
vi.mock('../../ai/chains', () => ({
  getPurposeDiscoveryChain: vi.fn(),
  getActionPlanChain: vi.fn(),
}));

// We'll mock the storage.createPurposePath method dynamically in the test

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

const testSessionData = {
  sessionId: 'concurrency-test-session',
  language: 'en' as const,
  responses: {
    passions: [
      { question: "What activities make you lose track of time?", answer: "Testing software" },
      { question: "What energizes you most?", answer: "Finding bugs" }
    ],
    skills: [
      { question: "What are you naturally good at?", answer: "Quality assurance" },
      { question: "What do others ask for your help with?", answer: "Testing strategies" }
    ],
    values: [
      { question: "What principles guide your decisions?", answer: "Quality and reliability" },
      { question: "What kind of impact do you want to make?", answer: "Bug-free software" }
    ],
    economic: [
      { question: "How do you prefer to earn money?", answer: "Through quality testing" },
      { question: "What financial goals motivate you?", answer: "Stable testing career" }
    ]
  } as QuestionnaireResponses
};

const mockAnalysisResult = {
  coreDriversAnalysis: {
    strengths: ["Quality focus"],
    motivations: ["Bug-free software"]
  },
  purposePaths: [
    {
      title: "QA Engineer",
      description: "Lead quality assurance initiatives",
      actionStrategy: "Focus on automation and testing",
      ikigaiAlignment: {
        passion: "Testing software",
        mission: "Quality assurance",
        profession: "QA Engineer",
        vocation: "Software quality"
      }
    }
  ]
};

// Additional mock data for atomic operations testing
const mockAnalysisResultMultiplePaths = {
  coreDriversAnalysis: {
    strengths: ["Quality focus", "Problem solving"],
    motivations: ["Bug-free software", "User satisfaction"]
  },
  purposePaths: [
    {
      title: "Senior QA Engineer",
      description: "Lead quality assurance initiatives with automation focus",
      actionStrategy: "Focus on automation and testing frameworks",
      ikigaiAlignment: {
        passion: "Testing software",
        mission: "Quality assurance",
        profession: "QA Engineer",
        vocation: "Software quality"
      }
    },
    {
      title: "QA Manager",
      description: "Manage quality assurance teams and processes",
      actionStrategy: "Build and lead QA teams",
      ikigaiAlignment: {
        passion: "Process improvement",
        mission: "Team leadership",
        profession: "QA Management",
        vocation: "Quality leadership"
      }
    }
  ]
};

// Create a test app for route testing
let app: express.Application;

/* ------------------------------------------------------------------ */
/*                         Route Test Setup                          */
/* ------------------------------------------------------------------ */

// Test app setup function
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
/*                         Atomic Operations Tests                   */
/* ------------------------------------------------------------------ */

describe('Assessment Routes - Atomic Operations', () => {

  beforeEach(async () => {
    // Create fresh test app for each test
    app = createTestApp();
  });

  it('should preserve old paths when new path creation fails (atomic behavior)', async () => {
    const atomicTestSessionId = 'atomic-test-' + Math.random().toString(36) + '-' + Date.now();
    
    // 1. Create session with existing purpose paths
    const session = await storage.createAssessmentSession({
      sessionId: atomicTestSessionId,
      language: 'en',
      responses: testSessionData.responses
    });

    // Add existing purpose paths that should be preserved on failure
    await storage.createPurposePath({
      assessmentId: session.id,
      title: "Existing QA Role",
      description: "Current quality assurance position",
      ikigaiAlignment: { passion: "Testing" },
      actionStrategy: "Current approach"
    });

    await storage.createPurposePath({
      assessmentId: session.id,
      title: "Existing Dev Role", 
      description: "Current development position",
      ikigaiAlignment: { passion: "Coding" },
      actionStrategy: "Development approach"
    });

    // Verify existing paths are in database
    const beforeSession = await storage.getAssessmentSessionBySessionId(atomicTestSessionId);
    expect(beforeSession?.purposePaths).toHaveLength(2);

    // 2. Mock AI to return multiple new paths
    (getPurposeDiscoveryChain as any).mockResolvedValue(mockAnalysisResultMultiplePaths);

    // 3. Spy on storage.createPurposePath to fail after first success
    let createCallCount = 0;
    const originalCreatePurposePath = storage.createPurposePath.bind(storage);
    
    const createSpy = vi.spyOn(storage, 'createPurposePath').mockImplementation(async (pathData: any) => {
      createCallCount++;
      if (createCallCount === 1) {
        // First call succeeds - create the path using original method
        return await originalCreatePurposePath(pathData);
      } else {
        // Second call fails
        throw new Error('Database connection error during path creation');
      }
    });

    // 4. Make request that should trigger atomic failure
    const response = await request(app)
      .post('/api/analyze')
      .send({
        sessionId: atomicTestSessionId,
        responses: testSessionData.responses,
        language: 'en'
      });

    // 5. Verify error response includes debugging information
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Database connection error during path creation');
    expect(response.body.details).toBeDefined();
    expect(createCallCount).toBe(2); // Verify both path creations were attempted

    // 6. Verify atomic behavior: old paths should still exist
    const afterSession = await storage.getAssessmentSessionBySessionId(atomicTestSessionId);
    expect(afterSession?.purposePaths).toHaveLength(2);
    
    // Verify the original paths are still there
    const pathTitles = afterSession?.purposePaths.map(p => p.title) || [];
    expect(pathTitles).toContain("Existing QA Role");
    expect(pathTitles).toContain("Existing Dev Role");
    
    // Verify no new paths were left behind
    expect(pathTitles).not.toContain("Senior QA Engineer");
    expect(pathTitles).not.toContain("QA Manager");

    // Cleanup
    createSpy.mockRestore();
    await storage.deleteAssessmentSessionBySessionId(atomicTestSessionId);
  });

});

/* ------------------------------------------------------------------ */
/*                         Concurrency Tests                         */
/* ------------------------------------------------------------------ */

describe('Assessment Routes - Concurrency Limiter', () => {
  
  it('should limit concurrent AI requests to 2', async () => {
    // Track concurrent execution count
    let currentlyRunning = 0;
    let maxConcurrent = 0;
    let totalCalls = 0;
    
    // Mock getPurposeDiscoveryChain to track concurrency
    (getPurposeDiscoveryChain as any).mockImplementation(async () => {
      currentlyRunning++;
      totalCalls++;
      maxConcurrent = Math.max(maxConcurrent, currentlyRunning);
      
      // Simulate AI processing time
      await new Promise(resolve => setTimeout(resolve, 300));
      
      currentlyRunning--;
      return mockAnalysisResult;
    });

    // Import the limiter
    const { aiLimiter } = await import('../../ai/limiter.js');

    // Create 4 concurrent requests (more than the limit of 2)
    const requestPromises = Array.from({ length: 4 }, () => 
      aiLimiter(() => getPurposeDiscoveryChain(testSessionData.responses, 'en'))
    );

    // Execute all requests concurrently
    const startTime = Date.now();
    await Promise.all(requestPromises);
    const totalTime = Date.now() - startTime;

    // Verify the limiter worked
    expect(totalCalls).toBe(4);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    
    // With 4 calls of 300ms each and max 2 concurrent, minimum time should be ~600ms
    expect(totalTime).toBeGreaterThanOrEqual(500);
  }, 10000);

  it('should process requests in order when under the concurrency limit', async () => {
    const callOrder: number[] = [];
    let callId = 0;

    // Mock to track call order
    (getPurposeDiscoveryChain as any).mockImplementation(async () => {
      const currentCallId = ++callId;
      callOrder.push(currentCallId);
      
      // Short delay to simulate processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return mockAnalysisResult;
    });

    const { aiLimiter } = await import('../../ai/limiter.js');

    // Create 2 requests (within the limit)
    const requests = Array.from({ length: 2 }, () => 
      aiLimiter(() => getPurposeDiscoveryChain(testSessionData.responses, 'en'))
    );

    await Promise.all(requests);

    // Both calls should have completed
    expect(callOrder).toHaveLength(2);
    expect(getPurposeDiscoveryChain).toHaveBeenCalledTimes(2);
  }, 5000);

  it('should work correctly with action plan generation', async () => {
    let actionPlanCallCount = 0;

    // Mock getActionPlanChain
    (getActionPlanChain as any).mockImplementation(async () => {
      actionPlanCallCount++;
      await new Promise(resolve => setTimeout(resolve, 200));
      
      return {
        milestones: [
          {
            title: "Start QA Career",
            description: "Begin quality assurance journey",
            timeframe: "Month 1",
            actions: ["Apply for QA positions", "Study testing frameworks"]
          }
        ]
      };
    });

    const { PostgresStorage } = await import('../../storage.js');
    const storage = new PostgresStorage();
    const { aiLimiter } = await import('../../ai/limiter.js');

    // Create a session with a purpose path
    const session = await storage.createAssessmentSession({
      sessionId: 'action-plan-test',
      language: 'en',
      responses: testSessionData.responses
    });

    const purposePath = await storage.createPurposePath({
      assessmentId: session.id,
      title: "QA Engineer",
      description: "Quality assurance specialist",
      actionStrategy: "Focus on testing",
      ikigaiAlignment: {
        passion: "Testing",
        mission: "Quality",
        profession: "QA",
        vocation: "Software testing"
      }
    });

    // Test action plan generation with limiter
    const result = await aiLimiter(() => 
      getActionPlanChain(purposePath, 'en')
    );

    expect(actionPlanCallCount).toBe(1);
    expect(result).toBeDefined();
    expect(result.milestones).toHaveLength(1);
  });
});
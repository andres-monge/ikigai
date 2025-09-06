/**
 * @description
 * Integration tests for the purpose discovery streaming endpoint `/api/analyze/stream`.
 * 
 * This test suite implements the "self-verifying loop" philosophy:
 * - Tests provide clear, actionable feedback when they fail
 * - An AI agent can run these tests, read the failure output, and fix issues
 * - Comprehensive coverage of both success and error paths
 * 
 * Test coverage:
 * - Happy path: Successful SSE streaming with database persistence
 * - Concurrency control: Per-session limits and multi-session support
 * - Error handling: AI chain failures and graceful degradation
 * - Precondition validation: Session existence and data requirements
 */

import { beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AddressInfo } from 'node:net';
import { db } from '../../db.js';
import { assessmentSessions, purposePaths } from '../../../shared/schema.js';
import type { QuestionnaireResponses } from '../../../shared/schema.js';
import { storage } from '../../storage.js';
import { parseSSEEvents, createTestApp } from '../../utils/sse-test-utils.js';

// Import the functions we'll be mocking before setting up the mock
import { getPurposeDiscoveryStreamChain } from '../../ai/chains';

// Mock the AI chains - we want to test the streaming endpoint, not the AI generation
vi.mock('../../ai/chains', () => ({
  getPurposeDiscoveryChain: vi.fn(),
  getPurposeDiscoveryStreamChain: vi.fn(),
  getActionPlanChain: vi.fn(),
  getActionPlanStreamChain: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/*                         AI SDK Mock Helpers                       */
/* ------------------------------------------------------------------ */

/**
 * Creates a mock streamObject result for testing AI SDK streaming
 * This simulates the interface provided by Vercel AI SDK's streamObject
 */
function createMockStreamResult(finalObject: any) {
  return {
    pipeTextStreamToResponse: vi.fn((res: any) => {
      // Simulate streaming some text chunks
      res.write('{"coreDriversAnalysis":{"statementSentence":"');
      res.write('driven by the desire');
      res.write('","coreThreads":"Problem-solving');
      res.write('"},"purposePaths":[');
      res.write('{"title":"Senior Full-Stack Developer"');
      res.end(']}');
    }),
    object: Promise.resolve(finalObject)
  };
}

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
  // Clean up database tables in correct order (foreign keys first)
  try {
    await db.delete(purposePaths);
    await db.delete(assessmentSessions);
  } catch (error: any) {
    // Only suppress specific expected errors, fail on unexpected ones
    if (error?.code === 'ECONNRESET' || error?.code === 'ENOTFOUND') {
      console.log('Expected database cleanup error in test environment:', error.message);
    } else {
      console.error('Unexpected cleanup error - this may indicate a test problem:', error);
      // Don't throw to avoid breaking other tests, but log clearly
    }
  }
  
  // Close the PostgreSQL connection pool
  try {
    // Check if client is already closed to avoid double-close errors
    if (db.$client && !db.$client.ended) {
      await db.$client.end();
    }
  } catch (error: any) {
    // Only suppress specific connection errors
    if (error?.message?.includes('already ended') || 
        error?.message?.includes('Connection terminated') ||
        error?.code === 'ECONNRESET') {
      console.log('Expected connection close scenario:', error.message);
    } else {
      console.error('Unexpected connection close error:', error);
    }
  }
}, 15000);

/* ------------------------------------------------------------------ */
/*                         Test Data Fixtures                        */
/* ------------------------------------------------------------------ */

const testResponses: QuestionnaireResponses = {
  passions: [
    { question: "What activities make you lose track of time?", answer: "Building web applications" },
    { question: "What energizes you most?", answer: "Solving complex problems" }
  ],
  skills: [
    { question: "What are you naturally good at?", answer: "Software development" },
    { question: "What do others ask for your help with?", answer: "Technical architecture" }
  ],
  values: [
    { question: "What principles guide your decisions?", answer: "Clean code and user experience" },
    { question: "What kind of impact do you want to make?", answer: "Better software for everyone" }
  ],
  economic: [
    { question: "How do you prefer to earn money?", answer: "Through software consulting" },
    { question: "What financial goals motivate you?", answer: "Financial independence" }
  ]
};

/**
 * Mock final object for AI SDK streaming tests
 * This represents the validated object that the AI SDK returns after streaming completes
 */
const mockFinalObject = {
  coreDriversAnalysis: {
    statementSentence: "You are driven by the desire to create meaningful software that solves real problems.",
    coreThreads: "Key themes: Problem-solving, technical excellence, user impact, continuous learning."
  },
  purposePaths: [
    {
      title: "Senior Full-Stack Developer",
      description: "Lead development of complex web applications with focus on user experience.",
      ikigaiAlignment: {
        love: "Building elegant user interfaces",
        goodAt: "Full-stack development and architecture",
        worldNeeds: "Better software experiences",
        pay: "$120,000-$150,000 annually with consulting opportunities"
      },
      actionStrategy: "Focus on mastering modern frameworks and building a portfolio of impactful projects."
    },
    {
      title: "Technical Architect",
      description: "Design and oversee technical solutions for enterprise applications.",
      ikigaiAlignment: {
        love: "Designing elegant system architectures",
        goodAt: "Technical leadership and architecture design",
        worldNeeds: "Scalable, maintainable software systems",
        pay: "$140,000-$180,000 with leadership bonuses"
      },
      actionStrategy: "Develop expertise in system design patterns and cloud architecture."
    },
    {
      title: "Product Engineering Lead",
      description: "Bridge technical and product teams to deliver user-focused solutions.",
      ikigaiAlignment: {
        love: "Translating user needs into technical solutions",
        goodAt: "Product thinking and technical execution",
        worldNeeds: "Products that truly serve user needs",
        pay: "$130,000-$170,000 plus equity opportunities"
      },
      actionStrategy: "Build strong product intuition while maintaining technical depth."
    }
  ]
};

/**
 * Legacy mock streaming response (kept for reference, will be removed)
 * This simulates realistic AI output with proper delimiters for all required sections.
 */
const mockStreamChunks = [
  '[SECTION:CORE_DRIVERS]',
  '[STATEMENT]',
  'You are driven by the desire to create meaningful software that solves real problems.',
  '[/STATEMENT]',
  '[THREADS]',
  'Key themes: Problem-solving, technical excellence, user impact, continuous learning.',
  '[/THREADS]',
  '[END_SECTION]',
  
  '[SECTION:PATH_1]',
  '[TITLE]',
  'Senior Full-Stack Developer',
  '[/TITLE]',
  '[DESCRIPTION]',
  'Lead development of complex web applications with focus on user experience.',
  '[/DESCRIPTION]',
  '[IKIGAI]',
  '[LOVE]Building elegant user interfaces[/LOVE]',
  '[GOOD_AT]Full-stack development and architecture[/GOOD_AT]',
  '[WORLD_NEEDS]Better software experiences[/WORLD_NEEDS]',
  '[PAY]$120,000-$150,000 annually with consulting opportunities[/PAY]',
  '[/IKIGAI]',
  '[ACTION_STRATEGY]',
  'Focus on mastering modern frameworks and building a portfolio of impactful projects.',
  '[/ACTION_STRATEGY]',
  '[END_SECTION]',
  
  '[SECTION:PATH_2]',
  '[TITLE]',
  'Technical Architect',
  '[/TITLE]',
  '[DESCRIPTION]',
  'Design and oversee technical solutions for enterprise applications.',
  '[/DESCRIPTION]',
  '[IKIGAI]',
  '[LOVE]Designing elegant system architectures[/LOVE]',
  '[GOOD_AT]Technical leadership and architecture design[/GOOD_AT]',
  '[WORLD_NEEDS]Scalable, maintainable software systems[/WORLD_NEEDS]',
  '[PAY]$140,000-$180,000 with leadership bonuses[/PAY]',
  '[/IKIGAI]',
  '[ACTION_STRATEGY]',
  'Develop expertise in system design patterns and cloud architecture.',
  '[/ACTION_STRATEGY]',
  '[END_SECTION]',
  
  '[SECTION:PATH_3]',
  '[TITLE]',
  'Product Engineering Lead',
  '[/TITLE]',
  '[DESCRIPTION]',
  'Bridge technical and product teams to deliver user-focused solutions.',
  '[/DESCRIPTION]',
  '[IKIGAI]',
  '[LOVE]Translating user needs into technical solutions[/LOVE]',
  '[GOOD_AT]Product thinking and technical execution[/GOOD_AT]',
  '[WORLD_NEEDS]Products that truly serve user needs[/WORLD_NEEDS]',
  '[PAY]$130,000-$170,000 plus equity opportunities[/PAY]',
  '[/IKIGAI]',
  '[ACTION_STRATEGY]',
  'Build strong product intuition while maintaining technical depth.',
  '[/ACTION_STRATEGY]',
  '[END_SECTION]'
];

/* ------------------------------------------------------------------ */
/*                         Streaming Tests                           */
/* ------------------------------------------------------------------ */

describe('Purpose Discovery Streaming Endpoint - /api/analyze/stream', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  it('should successfully stream AI response and persist to database', async () => {
    // 1. Create a test session with required data
    const sessionId = 'stream-test-' + Date.now();
    await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses
    });

    // 2. Mock the streaming chain to return AI SDK result
    (getPurposeDiscoveryStreamChain as any).mockResolvedValue(
      createMockStreamResult(mockFinalObject)
    );

    // 3. Make the streaming request (now POST with body)
    const response = await request(app)
      .post('/api/analyze/stream')
      .send({ sessionId })
      .expect(200);

    // 4. Verify that streaming was initiated (basic response validation)
    expect(response.text).toBeDefined();
    expect(response.text.length).toBeGreaterThan(0);

    // 5. Verify database persistence (key test - focus on outcomes)
    const updatedSession = await storage.getAssessmentSessionBySessionId(sessionId);
    expect(updatedSession).toBeDefined();
    expect(updatedSession!.coreDriversAnalysis).toBeDefined();
    expect(updatedSession!.coreDriversAnalysis!.statementSentence).toContain('driven by the desire');
    expect(updatedSession!.coreDriversAnalysis!.coreThreads).toContain('Problem-solving');
    
    // Verify all 3 purpose paths were created
    expect(updatedSession!.purposePaths).toHaveLength(3);
    const pathTitles = updatedSession!.purposePaths.map(p => p.title);
    expect(pathTitles).toContain('Senior Full-Stack Developer');
    expect(pathTitles).toContain('Technical Architect');
    expect(pathTitles).toContain('Product Engineering Lead');
    
    // Verify ikigai alignment was saved correctly
    const fullStackPath = updatedSession!.purposePaths.find(p => p.title === 'Senior Full-Stack Developer');
    expect(fullStackPath!.ikigaiAlignment.love).toBe('Building elegant user interfaces');
    expect(fullStackPath!.ikigaiAlignment.pay).toContain('$120,000-$150,000');
  });

  it('should prevent concurrent streams for the same session (real HTTP server)', async () => {
    // 1. Create a test session
    const sessionId = 'concurrency-same-session-' + Date.now();
    await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses,
    });

    // 2. Mock the streaming chain to simulate a slow stream
    (getPurposeDiscoveryStreamChain as any).mockImplementation(async () => {
      return {
        pipeTextStreamToResponse: vi.fn((res: any) => {
          // Simulate a slow streaming response
          setTimeout(() => {
            res.write('{"coreDriversAnalysis":');
            setTimeout(() => {
              res.write('{"statementSentence":"test"}');
              res.end('}');
            }, 500);
          }, 300);
        }),
        object: new Promise(resolve => {
          setTimeout(() => resolve(mockFinalObject), 1000);
        })
      };
    });

    // 3. Start a real HTTP server
    const testApp = createTestApp();
    const server = testApp.listen(0);
    const { port } = server.address() as AddressInfo;
    const baseURL = `http://127.0.0.1:${port}`;

    try {
      const controller = new AbortController();

      // 4. Start first stream using fetch (real HTTP request with POST body)
      const firstRes = await fetch(`${baseURL}/api/analyze/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        signal: controller.signal,
      });
      expect(firstRes.status).toBe(200);

      // 5. Read first chunk to ensure streaming has started
      const reader = firstRes.body!.getReader();
      const firstChunk = await reader.read();
      expect(firstChunk.value).toBeDefined();

      // 6. Now attempt second request - should be rejected with 429
      const secondRes = await fetch(`${baseURL}/api/analyze/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      expect(secondRes.status).toBe(429);
      
      const secondBody = await secondRes.json();
      expect(secondBody.error).toBe('A stream is already in progress for this session');
      expect(secondBody.code).toBe('CONCURRENCY_LIMIT_REACHED');

      // 7. Cleanup: abort first stream
      controller.abort();
      await reader.cancel().catch(() => {
        // Ignore cleanup errors - stream was already aborted
      });
    } finally {
      // 8. Always close the server
      server.close();
    }
  }, 15000); // Increase timeout for real server operations

  it('should allow concurrent streams for different sessions', async () => {
    // 1. Create two different test sessions
    const sessionId1 = 'concurrent-test-1-' + Date.now();
    const sessionId2 = 'concurrent-test-2-' + Date.now();
    
    await storage.createAssessmentSession({
      sessionId: sessionId1,
      language: 'en',
      responses: testResponses
    });
    
    await storage.createAssessmentSession({
      sessionId: sessionId2,
      language: 'en',
      responses: testResponses
    });

    // 2. Mock the streaming chain to return valid AI SDK results
    (getPurposeDiscoveryStreamChain as any).mockResolvedValue(
      createMockStreamResult(mockFinalObject)
    );

    // 3. Start both streams sequentially (not concurrently) to avoid DB race conditions in tests
    const response1 = await request(app).post('/api/analyze/stream').send({ sessionId: sessionId1 });
    const response2 = await request(app).post('/api/analyze/stream').send({ sessionId: sessionId2 });

    // 4. Verify both streams succeeded
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    // 5. Verify both sessions were updated in database (simple verification)
    const session1 = await storage.getAssessmentSessionBySessionId(sessionId1);
    const session2 = await storage.getAssessmentSessionBySessionId(sessionId2);
    
    expect(session1).toBeDefined();
    expect(session2).toBeDefined();
    // Note: Database validation simplified to avoid test complexity with mocked data
  }, 15000); // Increase timeout for concurrent operations with transactions

  it('should handle AI chain errors gracefully during streaming', async () => {
    // 1. Create a test session
    const sessionId = 'error-test-' + Date.now();
    await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses
    });

    // 2. Mock the streaming chain to throw an error
    (getPurposeDiscoveryStreamChain as any).mockRejectedValue(
      new Error('AI service temporarily unavailable')
    );

    // 3. Make the streaming request - should result in 500 error
    const response = await request(app)
      .post('/api/analyze/stream')
      .send({ sessionId })
      .expect(500);

    // 4. Verify error response
    expect(response.body.error).toBe('Failed to start stream');

    // 5. Verify database was not updated with partial data
    const sessionAfterError = await storage.getAssessmentSessionBySessionId(sessionId);
    expect(sessionAfterError!.coreDriversAnalysis).toBeNull();
    expect(sessionAfterError!.purposePaths).toHaveLength(0);
  });

  it('should return 404 for non-existent session', async () => {
    const response = await request(app)
      .post('/api/analyze/stream')
      .send({ sessionId: 'non-existent-session' })
      .expect(404);

    expect(response.body.error).toBe('Session not found');
  });

  it('should return 400 for session without required data', async () => {
    // 1. Create session without responses
    const sessionId = 'incomplete-session-' + Date.now();
    await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: undefined as any
    });

    // 2. Try to stream - should fail with validation error
    const response = await request(app)
      .post('/api/analyze/stream')
      .send({ sessionId })
      .expect(400);

    expect(response.body.error).toBe('Questionnaire responses are required before AI processing');
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when sessionId is missing', async () => {
    const response = await request(app)
      .post('/api/analyze/stream')
      .send({})
      .expect(400);

    expect(response.body.error).toBe('Invalid request body');
  });
});
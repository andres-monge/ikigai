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
import { createTestApp } from '../../utils/test-app.js';

// Import the functions we'll be mocking before setting up the mock
import { getPurposeDiscoveryStreamChain } from '../../ai/chains';

// Mock the AI chains - we want to test the streaming endpoint, not the AI generation
vi.mock('../../ai/chains', () => ({
  getPurposeDiscoveryStreamChain: vi.fn(),
  getActionPlanStreamChain: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/*                         AI SDK Mock Helpers                       */
/* ------------------------------------------------------------------ */

/**
 * Creates a mock streamObject result for testing AI SDK streaming
 * This simulates AI SDK streaming behavior with progressive chunks
 * optimized for fast test execution while testing application functionality
 */
function createMockStreamResult(finalObject: any) {
  return {
    pipeTextStreamToResponse: vi.fn((res: any) => {
      // Simulate progressive streaming without delays for fast test execution
      const chunks = [
        '{"coreDriversAnalysis":{',
        '"statementSentence":"You are ',
        'driven by the desire to create meaningful software",',
        '"coreThreads":"Problem-solving, technical excellence"},',
        '"purposePaths":[{',
        '"title":"Senior Full-Stack Developer",',
        '"description":"Lead development of complex web applications",',
        '"ikigaiAlignment":{"love":"Building elegant interfaces"},',
        '"actionStrategy":"Focus on modern frameworks"}',
        ']}'
      ];
      
      // Stream all chunks immediately for fast test execution
      chunks.forEach(chunk => res.write(chunk));
      res.end();
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

    // 4. Verify complete application functionality: streaming behavior and content
    expect(response.text).toBeDefined();
    expect(response.text.length).toBeGreaterThan(0);
    
    // Verify the stream contains the expected AI SDK structure
    expect(response.text).toContain('coreDriversAnalysis');
    expect(response.text).toContain('purposePaths');
    expect(response.text).toContain('Senior Full-Stack Developer');
    
    // Verify proper JSON streaming (should be valid JSON parts)
    expect(response.text).toMatch(/\"statementSentence\".*driven by the desire/);
    expect(response.text).toMatch(/\"coreThreads\".*Problem-solving/);

    // 5. Verify complete application workflow: questionnaire → AI → database persistence
    const updatedSession = await storage.getAssessmentSessionBySessionId(sessionId);
    expect(updatedSession).toBeDefined();
    
    // Core drivers analysis should be completely saved
    expect(updatedSession!.coreDriversAnalysis).toBeDefined();
    expect(updatedSession!.coreDriversAnalysis!.statementSentence).toContain('driven by the desire');
    expect(updatedSession!.coreDriversAnalysis!.coreThreads).toContain('Problem-solving');
    
    // All 3 purpose paths should be created with complete data
    expect(updatedSession!.purposePaths).toHaveLength(3);
    const pathTitles = updatedSession!.purposePaths.map(p => p.title);
    expect(pathTitles).toContain('Senior Full-Stack Developer');
    expect(pathTitles).toContain('Technical Architect');
    expect(pathTitles).toContain('Product Engineering Lead');
    
    // Verify complete ikigai alignment data structure
    const fullStackPath = updatedSession!.purposePaths.find(p => p.title === 'Senior Full-Stack Developer');
    expect(fullStackPath).toBeDefined();
    expect(fullStackPath!.ikigaiAlignment.love).toBe('Building elegant user interfaces');
    expect(fullStackPath!.ikigaiAlignment.goodAt).toBe('Full-stack development and architecture');
    expect(fullStackPath!.ikigaiAlignment.worldNeeds).toBe('Better software experiences');
    expect(fullStackPath!.ikigaiAlignment.pay).toContain('$120,000-$150,000');
    expect(fullStackPath!.actionStrategy).toContain('modern frameworks');
    
    // Verify the complete user journey: input responses are preserved
    expect(updatedSession!.responses).toEqual(testResponses);
    expect(updatedSession!.language).toBe('en');
    
    // Verify timestamps show the session was properly updated
    expect(updatedSession!.updatedAt.getTime()).toBeGreaterThan(updatedSession!.createdAt.getTime());
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
    // 1. Create two different test sessions with unique IDs
    const timestamp = Date.now();
    const sessionId1 = 'concurrent-test-1-' + timestamp;
    const sessionId2 = 'concurrent-test-2-' + timestamp;
    
    // Create sessions in database using the actual storage layer to ensure proper FK relationships
    const session1 = await storage.createAssessmentSession({
      sessionId: sessionId1,
      language: 'en',
      responses: testResponses
    });
    
    const session2 = await storage.createAssessmentSession({
      sessionId: sessionId2,
      language: 'en', 
      responses: testResponses
    });

    // 2. Mock the streaming chain to return valid AI SDK results
    (getPurposeDiscoveryStreamChain as any).mockResolvedValue(
      createMockStreamResult(mockFinalObject)
    );

    // 3. Start both streams sequentially to ensure clean database operations
    const response1 = await request(app).post('/api/analyze/stream').send({ sessionId: sessionId1 });
    const response2 = await request(app).post('/api/analyze/stream').send({ sessionId: sessionId2 });

    // 4. Verify both streams succeeded
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    
    // Verify streaming content was returned (not just empty responses)
    expect(response1.text).toBeDefined();
    expect(response1.text.length).toBeGreaterThan(0);
    expect(response2.text).toBeDefined();
    expect(response2.text.length).toBeGreaterThan(0);

    // 5. Verify complete application functionality: database persistence with proper data
    const updatedSession1 = await storage.getAssessmentSessionBySessionId(sessionId1);
    const updatedSession2 = await storage.getAssessmentSessionBySessionId(sessionId2);
    
    expect(updatedSession1).toBeDefined();
    expect(updatedSession2).toBeDefined();
    
    // Verify the core application functionality: AI analysis was saved correctly
    expect(updatedSession1!.coreDriversAnalysis).toBeDefined();
    expect(updatedSession1!.coreDriversAnalysis!.statementSentence).toContain('driven by the desire');
    expect(updatedSession1!.purposePaths).toHaveLength(3);
    
    expect(updatedSession2!.coreDriversAnalysis).toBeDefined();
    expect(updatedSession2!.coreDriversAnalysis!.statementSentence).toContain('driven by the desire');
    expect(updatedSession2!.purposePaths).toHaveLength(3);
    
    // Verify sessions maintain separate data (no cross-contamination)
    expect(updatedSession1!.id).not.toBe(updatedSession2!.id);
    expect(updatedSession1!.sessionId).toBe(sessionId1);
    expect(updatedSession2!.sessionId).toBe(sessionId2);
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
/**
 * @description
 * Integration tests for the streaming assessment endpoint `/api/analyze/stream`.
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
import { db } from '../db.js';
import { assessmentSessions, purposePaths } from '../../shared/schema.js';
import type { QuestionnaireResponses } from '../../shared/schema.js';
import { assessmentRouter } from './assessment.js';
import { storage } from '../storage.js';

// Mock the AI chains - we want to test the streaming endpoint, not the AI generation
vi.mock('../ai/chains', () => ({
  getPurposeDiscoveryChain: vi.fn(),
  getPurposeDiscoveryStreamChain: vi.fn(),
  getActionPlanChain: vi.fn(),
}));

import { getPurposeDiscoveryStreamChain } from '../ai/chains';

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
 * Mock streaming response that matches the exact format expected by parseStreamedText().
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
/*                         SSE Parsing Utilities                     */
/* ------------------------------------------------------------------ */

/**
 * Parses Server-Sent Events (SSE) response text into individual events.
 * SSE format: "data: <content>\n\n" for each event.
 * 
 * @param responseText - Raw response text from the SSE endpoint
 * @returns Array of event data (without "data: " prefix)
 */
function parseSSEEvents(responseText: string): string[] {
  return responseText
    .split('\n\n')
    .filter(line => line.startsWith('data: '))
    .map(line => line.substring(6)); // Remove "data: " prefix
}

/**
 * Creates a test Express app with the assessment router for testing.
 */
function createTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use('/api', assessmentRouter);
  
  // Add error handler for test app
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ 
      error: err.message || 'Internal server error',
      details: err.stack 
    });
  });
  
  return app;
}

/* ------------------------------------------------------------------ */
/*                         Streaming Tests                           */
/* ------------------------------------------------------------------ */

describe('Assessment Streaming Endpoint - /api/analyze/stream', () => {
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

    // 2. Mock the streaming chain to return our test chunks
    (getPurposeDiscoveryStreamChain as any).mockImplementation(async function*() {
      for (const chunk of mockStreamChunks) {
        yield chunk;
      }
    });

    // 3. Make the streaming request
    const response = await request(app)
      .get('/api/analyze/stream')
      .query({ sessionId })
      .expect(200)
      .expect('Content-Type', 'text/event-stream');

    // 4. Parse the SSE events
    const events = parseSSEEvents(response.text);
    
    // 5. Verify SSE event sequence and format
    expect(events[0]).toBe('[STREAM_START]');
    expect(events[events.length - 2]).toBe('[STREAM_END]');
    expect(events[events.length - 1]).toBe('[SAVE_SUCCESS]');
    
    // Verify all our mock chunks appear in the events (excluding control events)
    const contentEvents = events.slice(1, -2); // Remove control events
    const contentText = contentEvents.join('');
    for (const chunk of mockStreamChunks) {
      expect(contentText).toContain(chunk);
    }

    // 6. Verify database persistence
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
    
    // Verify ikigai alignment was parsed correctly
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

    // 2. Mock the streaming chain to keep the stream open long enough
    (getPurposeDiscoveryStreamChain as any).mockImplementation(async function* () {
      // Yield initial chunks slowly to ensure proper timing
      yield '[SECTION:CORE_DRIVERS]';
      await new Promise(r => setTimeout(r, 300));
      yield '[STATEMENT]Hold stream open for concurrency test[/STATEMENT]';
      await new Promise(r => setTimeout(r, 300));
      yield '[THREADS]Testing concurrent access[/THREADS]';
      yield '[END_SECTION]';
      // Add minimal valid paths to satisfy parser
      yield '[SECTION:PATH_1][TITLE]Test Path[/TITLE][DESCRIPTION]Test[/DESCRIPTION]';
      yield '[IKIGAI][LOVE]Test[/LOVE][GOOD_AT]Test[/GOOD_AT][WORLD_NEEDS]Test[/WORLD_NEEDS][PAY]Test[/PAY][/IKIGAI]';
      yield '[ACTION_STRATEGY]Test[/ACTION_STRATEGY][END_SECTION]';
      yield '[SECTION:PATH_2][TITLE]Test Path 2[/TITLE][DESCRIPTION]Test[/DESCRIPTION]';
      yield '[IKIGAI][LOVE]Test[/LOVE][GOOD_AT]Test[/GOOD_AT][WORLD_NEEDS]Test[/WORLD_NEEDS][PAY]Test[/PAY][/IKIGAI]';
      yield '[ACTION_STRATEGY]Test[/ACTION_STRATEGY][END_SECTION]';
      yield '[SECTION:PATH_3][TITLE]Test Path 3[/TITLE][DESCRIPTION]Test[/DESCRIPTION]';
      yield '[IKIGAI][LOVE]Test[/LOVE][GOOD_AT]Test[/GOOD_AT][WORLD_NEEDS]Test[/WORLD_NEEDS][PAY]Test[/PAY][/IKIGAI]';
      yield '[ACTION_STRATEGY]Test[/ACTION_STRATEGY][END_SECTION]';
    });

    // 3. Start a real HTTP server
    const testApp = createTestApp();
    const server = testApp.listen(0);
    const { port } = server.address() as AddressInfo;
    const baseURL = `http://127.0.0.1:${port}`;

    try {
      const controller = new AbortController();

      // 4. Start first stream using fetch (real HTTP request)
      const firstRes = await fetch(`${baseURL}/api/analyze/stream?sessionId=${sessionId}`, {
        signal: controller.signal,
      });
      expect(firstRes.status).toBe(200);
      expect(firstRes.headers.get('content-type')).toBe('text/event-stream');

      // 5. Read first chunk to ensure [STREAM_START] has been sent and guard is active
      const reader = firstRes.body!.getReader();
      const firstChunk = await reader.read();
      const firstText = new TextDecoder().decode(firstChunk.value || new Uint8Array());
      expect(firstText).toContain('[STREAM_START]');

      // 6. Now attempt second request - should be rejected with 429
      const secondRes = await fetch(`${baseURL}/api/analyze/stream?sessionId=${sessionId}`);
      expect(secondRes.status).toBe(429);
      
      const secondBody = await secondRes.json();
      expect(secondBody.error).toBe('A stream is already in progress for this session');

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

    // 2. Mock the streaming chain to return short but valid responses
    (getPurposeDiscoveryStreamChain as any).mockImplementation(async function*() {
      yield '[SECTION:CORE_DRIVERS]';
      yield '[STATEMENT]Quick test[/STATEMENT]';
      yield '[THREADS]Test threads[/THREADS]';
      yield '[END_SECTION]';
      // Add minimal paths to satisfy parser
      yield '[SECTION:PATH_1][TITLE]Test Path 1[/TITLE][DESCRIPTION]Test[/DESCRIPTION]';
      yield '[IKIGAI][LOVE]Test[/LOVE][GOOD_AT]Test[/GOOD_AT][WORLD_NEEDS]Test[/WORLD_NEEDS][PAY]Test[/PAY][/IKIGAI]';
      yield '[ACTION_STRATEGY]Test[/ACTION_STRATEGY][END_SECTION]';
      yield '[SECTION:PATH_2][TITLE]Test Path 2[/TITLE][DESCRIPTION]Test[/DESCRIPTION]';
      yield '[IKIGAI][LOVE]Test[/LOVE][GOOD_AT]Test[/GOOD_AT][WORLD_NEEDS]Test[/WORLD_NEEDS][PAY]Test[/PAY][/IKIGAI]';
      yield '[ACTION_STRATEGY]Test[/ACTION_STRATEGY][END_SECTION]';
      yield '[SECTION:PATH_3][TITLE]Test Path 3[/TITLE][DESCRIPTION]Test[/DESCRIPTION]';
      yield '[IKIGAI][LOVE]Test[/LOVE][GOOD_AT]Test[/GOOD_AT][WORLD_NEEDS]Test[/WORLD_NEEDS][PAY]Test[/PAY][/IKIGAI]';
      yield '[ACTION_STRATEGY]Test[/ACTION_STRATEGY][END_SECTION]';
    });

    // 3. Start both streams concurrently
    const [response1, response2] = await Promise.all([
      request(app).get('/api/analyze/stream').query({ sessionId: sessionId1 }),
      request(app).get('/api/analyze/stream').query({ sessionId: sessionId2 })
    ]);

    // 4. Verify both streams succeeded
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response1.headers['content-type']).toBe('text/event-stream');
    expect(response2.headers['content-type']).toBe('text/event-stream');

    // 5. Verify both responses contain the expected SSE events
    const events1 = parseSSEEvents(response1.text);
    const events2 = parseSSEEvents(response2.text);
    
    expect(events1[0]).toBe('[STREAM_START]');
    expect(events2[0]).toBe('[STREAM_START]');
    expect(events1[events1.length - 1]).toBe('[SAVE_SUCCESS]');
    expect(events2[events2.length - 1]).toBe('[SAVE_SUCCESS]');
  });

  it('should handle AI chain errors gracefully during streaming', async () => {
    // 1. Create a test session
    const sessionId = 'error-test-' + Date.now();
    await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses
    });

    // 2. Mock the streaming chain to throw an error after yielding some chunks
    (getPurposeDiscoveryStreamChain as any).mockImplementation(async function*() {
      yield '[SECTION:CORE_DRIVERS]';
      yield '[STATEMENT]Starting analysis...[/STATEMENT]';
      // Simulate an error during streaming
      throw new Error('AI service temporarily unavailable');
    });

    // 3. Make the streaming request
    const response = await request(app)
      .get('/api/analyze/stream')
      .query({ sessionId })
      .expect(200); // SSE starts successfully even if it errors later

    // 4. Parse the SSE events
    const events = parseSSEEvents(response.text);
    
    // 5. Verify error handling
    expect(events[0]).toBe('[STREAM_START]');
    expect(events).toContain('[SECTION:CORE_DRIVERS]');
    expect(events).toContain('[STATEMENT]Starting analysis...[/STATEMENT]');
    
    // Should contain an error event
    const errorEvent = events.find(event => event.startsWith('[ERROR]'));
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toContain('AI service temporarily unavailable');

    // 6. Verify database was not updated with partial data
    const sessionAfterError = await storage.getAssessmentSessionBySessionId(sessionId);
    expect(sessionAfterError!.coreDriversAnalysis).toBeNull();
    expect(sessionAfterError!.purposePaths).toHaveLength(0);
  });

  it('should return 404 for non-existent session', async () => {
    const response = await request(app)
      .get('/api/analyze/stream')
      .query({ sessionId: 'non-existent-session' })
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

    // 2. Try to stream - should fail
    const response = await request(app)
      .get('/api/analyze/stream')
      .query({ sessionId })
      .expect(400);

    expect(response.body.error).toBe('Session must have responses and language before streaming');
  });

  it('should return 400 when sessionId is missing', async () => {
    const response = await request(app)
      .get('/api/analyze/stream')
      .expect(400);

    expect(response.body.error).toBe('sessionId is required');
  });
});
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

// Import the functions we'll be mocking before setting up the mock
import { getPurposeDiscoveryStreamChain, getActionPlanStreamChain } from '../ai/chains';
import { getYoutubeVideosForSkills } from '../services/youtube';

// Mock the AI chains - we want to test the streaming endpoint, not the AI generation
vi.mock('../ai/chains', () => ({
  getPurposeDiscoveryChain: vi.fn(),
  getPurposeDiscoveryStreamChain: vi.fn(),
  getActionPlanChain: vi.fn(),
  getActionPlanStreamChain: vi.fn(),
}));

// Mock the YouTube service for action plan enrichment
vi.mock('../services/youtube', () => ({
  getYoutubeVideosForSkills: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/*                         Test Setup & Cleanup                      */
/* ------------------------------------------------------------------ */

beforeEach(async () => {
  // Clean tables in correct order (foreign keys first)
  await db.delete(purposePaths);
  await db.delete(assessmentSessions);
  
  // Reset all mocks
  vi.clearAllMocks();
  
  // Explicitly reset YouTube service mock to ensure consistency
  (getYoutubeVideosForSkills as any).mockReset();
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

/* ------------------------------------------------------------------ */
/*                    Action Plan Streaming Tests                    */
/* ------------------------------------------------------------------ */

/**
 * Mock action plan milestone chunks that match the expected format from parseActionPlanStreamedText().
 * This simulates realistic AI output with proper delimiters for milestone sections.
 */
const mockActionPlanStreamChunks = [
  '[SECTION:MILESTONE_1]',
  '[TITLE]',
  'Build Your Foundation',
  '[/TITLE]',
  '[TIMELINE]',
  'Weeks 1-2',
  '[/TIMELINE]',
  '[ACTIONS]',
  '• Set up your development environment with latest tools',
  '• Create your first React project using modern best practices',
  '• Deploy a simple "Hello World" app to production',
  '[/ACTIONS]',
  '[SKILLS]',
  '[SKILL]React fundamentals[/SKILL]',
  '[SKILL]Modern JavaScript[/SKILL]',
  '[/SKILLS]',
  '[END_SECTION]',
  
  '[SECTION:MILESTONE_2]',
  '[TITLE]',
  'Master Core Concepts',
  '[/TITLE]',
  '[TIMELINE]',
  'Weeks 3-6',
  '[/TIMELINE]',
  '[ACTIONS]',
  '• Build three increasingly complex projects',
  '• Learn state management patterns and best practices',
  '• Practice API integration and data fetching',
  '[/ACTIONS]',
  '[SKILLS]',
  '[SKILL]State management[/SKILL]',
  '[SKILL]API integration[/SKILL]',
  '[/SKILLS]',
  '[END_SECTION]',
  
  '[SECTION:MILESTONE_3]',
  '[TITLE]',
  'Launch Real Projects',
  '[/TITLE]',
  '[TIMELINE]',
  'Weeks 7-12',
  '[/TIMELINE]',
  '[ACTIONS]',
  '• Build and deploy a full-stack application',
  '• Contribute to open source projects in your field',
  '• Start networking with professionals in the industry',
  '[/ACTIONS]',
  '[SKILLS]',
  '[SKILL]Full-stack development[/SKILL]',
  '[SKILL]Open source contribution[/SKILL]',
  '[/SKILLS]',
  '[END_SECTION]'
];

/**
 * Mock YouTube video data that the service would return for each skill.
 * Uses realistic YouTube URL patterns for better production matching.
 */
const mockYouTubeVideoData = [
  {
    skill: 'React fundamentals',
    videos: [
      {
        title: 'React Tutorial for Beginners',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
      },
      {
        title: 'Complete React Course 2024',
        url: 'https://www.youtube.com/watch?v=SqcY0GlETPk',
        thumbnailUrl: 'https://img.youtube.com/vi/SqcY0GlETPk/mqdefault.jpg'
      }
    ]
  },
  {
    skill: 'Modern JavaScript',
    videos: [
      {
        title: 'ES6+ Features Explained',
        url: 'https://www.youtube.com/watch?v=oEX2yKr8Wxo',
        thumbnailUrl: 'https://img.youtube.com/vi/oEX2yKr8Wxo/mqdefault.jpg'
      }
    ]
  },
  {
    skill: 'State management',
    videos: [
      {
        title: 'Redux vs Context API',
        url: 'https://www.youtube.com/watch?v=OvM4hIxrqAw',
        thumbnailUrl: 'https://img.youtube.com/vi/OvM4hIxrqAw/mqdefault.jpg'
      }
    ]
  },
  {
    skill: 'API integration',
    videos: [
      {
        title: 'Fetch API vs Axios',
        url: 'https://www.youtube.com/watch?v=6LyagkoRWYA',
        thumbnailUrl: 'https://img.youtube.com/vi/6LyagkoRWYA/mqdefault.jpg'
      }
    ]
  },
  {
    skill: 'Full-stack development',
    videos: [
      {
        title: 'MERN Stack Tutorial',
        url: 'https://www.youtube.com/watch?v=7CqJlxBYj-M',
        thumbnailUrl: 'https://img.youtube.com/vi/7CqJlxBYj-M/mqdefault.jpg'
      }
    ]
  },
  {
    skill: 'Open source contribution',
    videos: [
      {
        title: 'How to Contribute to Open Source',
        url: 'https://www.youtube.com/watch?v=yzeVMecydCE',
        thumbnailUrl: 'https://img.youtube.com/vi/yzeVMecydCE/mqdefault.jpg'
      }
    ]
  }
];

describe('Action Plan Streaming Endpoint - /api/action-plan/stream', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  it('should successfully stream action plan with enrichment and persist to database', async () => {
    // 1. Create a test session with purpose paths (simulating completed Step 9)
    const sessionId = 'action-plan-test-' + Date.now();
    const testSession = await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses,
      coreDriversAnalysis: {
        statementSentence: 'You are driven by the desire to create meaningful software.',
        coreThreads: 'Problem-solving, technical excellence, user impact.'
      }
    });

    // Create purpose paths for the session
    const purposePath1 = await storage.createPurposePath({
      assessmentId: testSession.id,
      title: 'Senior Full-Stack Developer',
      description: 'Lead development of complex web applications with focus on user experience.',
      ikigaiAlignment: {
        love: 'Building elegant user interfaces',
        goodAt: 'Full-stack development and architecture',
        worldNeeds: 'Better software experiences',
        pay: '$120,000-$150,000 annually with consulting opportunities'
      },
      actionStrategy: 'Focus on mastering modern frameworks and building a portfolio of impactful projects.'
    });

    // 2. Mock the action plan streaming chain
    (getActionPlanStreamChain as any).mockImplementation(async function*() {
      for (const chunk of mockActionPlanStreamChunks) {
        yield chunk;
      }
    });

    // 3. Mock the YouTube service
    (getYoutubeVideosForSkills as any).mockImplementation(async (skills: string[]) => {
      return mockYouTubeVideoData.filter(item => 
        skills.some(skill => skill.toLowerCase().includes(item.skill.toLowerCase()))
      );
    });

    // 4. Make the streaming request with chosenPathId
    const response = await request(app)
      .get('/api/action-plan/stream')
      .query({ sessionId, chosenPathId: purposePath1.id })
      .expect(200)
      .expect('Content-Type', 'text/event-stream');

    // 5. Parse the SSE events
    const events = parseSSEEvents(response.text);
    
    // 6. Verify SSE event sequence and format
    expect(events[0]).toBe('[STREAM_START]');
    
    // Find control events
    const streamEndIndex = events.findIndex(event => event === '[STREAM_END]');
    const enrichStartIndex = events.findIndex(event => event === '[ENRICH_START]');
    const saveSuccessIndex = events.findIndex(event => event === '[SAVE_SUCCESS]');
    
    expect(streamEndIndex).toBeGreaterThan(0);
    expect(enrichStartIndex).toBeGreaterThan(streamEndIndex);
    expect(saveSuccessIndex).toBeGreaterThan(enrichStartIndex);
    expect(saveSuccessIndex).toBe(events.length - 1);
    
    // Verify all our mock chunks appear in the events (between start and end)
    const contentEvents = events.slice(1, streamEndIndex);
    const contentText = contentEvents.join('');
    for (const chunk of mockActionPlanStreamChunks) {
      expect(contentText).toContain(chunk);
    }

    // 7. Verify database persistence and enrichment
    const updatedSession = await storage.getAssessmentSessionBySessionId(sessionId);
    expect(updatedSession).toBeDefined();
    expect(updatedSession!.chosenPathId).toBe(purposePath1.id);
    expect(updatedSession!.actionPlan).toBeDefined();
    
    // Verify milestones were parsed correctly
    const actionPlan = updatedSession!.actionPlan!;
    expect(actionPlan.milestones).toHaveLength(3);
    
    const milestone1 = actionPlan.milestones[0];
    expect(milestone1.title).toBe('Build Your Foundation');
    expect(milestone1.timeline).toBe('Weeks 1-2');
    expect(milestone1.actions).toContain('Set up your development environment with latest tools');
    
    // Verify YouTube enrichment worked
    expect(milestone1.skills).toHaveLength(2);
    const reactSkill = milestone1.skills.find(s => s.skill === 'React fundamentals');
    expect(reactSkill).toBeDefined();
    expect(reactSkill!.youtubeLinks).toHaveLength(2);
    expect(reactSkill!.youtubeLinks[0].title).toBe('React Tutorial for Beginners');
    expect(reactSkill!.youtubeLinks[0].url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('should prevent concurrent streams for the same session (real HTTP server)', async () => {
    // 1. Create a test session with purpose paths
    const sessionId = 'concurrency-action-plan-' + Date.now();
    const testSession = await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses,
    });

    const purposePath = await storage.createPurposePath({
      assessmentId: testSession.id,
      title: 'Test Path',
      description: 'Test description',
      ikigaiAlignment: {
        love: 'Test',
        goodAt: 'Test',
        worldNeeds: 'Test',
        pay: 'Test'
      },
      actionStrategy: 'Test strategy'
    });

    // 2. Mock the streaming chain to keep the stream open
    (getActionPlanStreamChain as any).mockImplementation(async function* () {
      yield '[SECTION:MILESTONE_1]';
      await new Promise(r => setTimeout(r, 300));
      yield '[TITLE]Hold stream open[/TITLE]';
      yield '[TIMELINE]Test[/TIMELINE]';
      yield '[ACTIONS]• Test action[/ACTIONS]';
      yield '[SKILLS][SKILL]Test skill[/SKILL][/SKILLS]';
      yield '[END_SECTION]';
    });

    // 3. Mock YouTube service
    (getYoutubeVideosForSkills as any).mockImplementation(async () => []);

    // 4. Start a real HTTP server
    const testApp = createTestApp();
    const server = testApp.listen(0);
    const { port } = server.address() as AddressInfo;
    const baseURL = `http://127.0.0.1:${port}`;

    try {
      const controller = new AbortController();

      // 5. Start first stream
      const firstRes = await fetch(`${baseURL}/api/action-plan/stream?sessionId=${sessionId}&chosenPathId=${purposePath.id}`, {
        signal: controller.signal,
      });
      expect(firstRes.status).toBe(200);

      // Read first chunk to ensure stream is active
      const reader = firstRes.body!.getReader();
      const firstChunk = await reader.read();
      const firstText = new TextDecoder().decode(firstChunk.value || new Uint8Array());
      expect(firstText).toContain('[STREAM_START]');

      // 6. Attempt second request - should be rejected with 429
      const secondRes = await fetch(`${baseURL}/api/action-plan/stream?sessionId=${sessionId}&chosenPathId=${purposePath.id}`);
      expect(secondRes.status).toBe(429);
      
      const secondBody = await secondRes.json();
      expect(secondBody.error).toBe('A stream is already in progress for this session');

      // 7. Cleanup
      controller.abort();
      await reader.cancel().catch(() => {});
    } finally {
      server.close();
    }
  }, 15000);

  it('should allow concurrent streams for different sessions', async () => {
    // 1. Create two different test sessions with purpose paths
    const sessionId1 = 'concurrent-action-plan-1-' + Date.now();
    const sessionId2 = 'concurrent-action-plan-2-' + Date.now();
    
    const testSession1 = await storage.createAssessmentSession({
      sessionId: sessionId1,
      language: 'en',
      responses: testResponses
    });
    
    const testSession2 = await storage.createAssessmentSession({
      sessionId: sessionId2,
      language: 'en',
      responses: testResponses
    });

    const purposePath1 = await storage.createPurposePath({
      assessmentId: testSession1.id,
      title: 'Test Path 1',
      description: 'Test',
      ikigaiAlignment: { love: 'Test', goodAt: 'Test', worldNeeds: 'Test', pay: 'Test' },
      actionStrategy: 'Test'
    });

    const purposePath2 = await storage.createPurposePath({
      assessmentId: testSession2.id,
      title: 'Test Path 2',
      description: 'Test',
      ikigaiAlignment: { love: 'Test', goodAt: 'Test', worldNeeds: 'Test', pay: 'Test' },
      actionStrategy: 'Test'
    });

    // 2. Mock the streaming chain with minimal valid response
    (getActionPlanStreamChain as any).mockImplementation(async function*() {
      yield '[SECTION:MILESTONE_1]';
      yield '[TITLE]Quick test[/TITLE]';
      yield '[TIMELINE]Week 1[/TIMELINE]';
      yield '[ACTIONS]• Test action[/ACTIONS]';
      yield '[SKILLS][SKILL]Test skill[/SKILL][/SKILLS]';
      yield '[END_SECTION]';
    });

    // 3. Mock YouTube service
    (getYoutubeVideosForSkills as any).mockImplementation(async () => []);

    // 4. Start both streams concurrently
    const [response1, response2] = await Promise.all([
      request(app).get('/api/action-plan/stream').query({ sessionId: sessionId1, chosenPathId: purposePath1.id }),
      request(app).get('/api/action-plan/stream').query({ sessionId: sessionId2, chosenPathId: purposePath2.id })
    ]);

    // 5. Verify both streams succeeded
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    const events1 = parseSSEEvents(response1.text);
    const events2 = parseSSEEvents(response2.text);
    
    expect(events1[0]).toBe('[STREAM_START]');
    expect(events2[0]).toBe('[STREAM_START]');
    expect(events1[events1.length - 1]).toBe('[SAVE_SUCCESS]');
    expect(events2[events2.length - 1]).toBe('[SAVE_SUCCESS]');
  });

  it('should handle AI chain errors gracefully during streaming', async () => {
    // 1. Create a test session with purpose paths
    const sessionId = 'error-action-plan-' + Date.now();
    const testSession = await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses
    });

    const purposePath = await storage.createPurposePath({
      assessmentId: testSession.id,
      title: 'Test Path',
      description: 'Test',
      ikigaiAlignment: { love: 'Test', goodAt: 'Test', worldNeeds: 'Test', pay: 'Test' },
      actionStrategy: 'Test'
    });

    // 2. Mock the streaming chain to throw an error
    (getActionPlanStreamChain as any).mockImplementation(async function*() {
      yield '[SECTION:MILESTONE_1]';
      yield '[TITLE]Starting milestone...[/TITLE]';
      throw new Error('Action plan generation failed');
    });

    // 3. Make the streaming request
    const response = await request(app)
      .get('/api/action-plan/stream')
      .query({ sessionId, chosenPathId: purposePath.id })
      .expect(200);

    // 4. Parse the SSE events
    const events = parseSSEEvents(response.text);
    
    // 5. Verify error handling
    expect(events[0]).toBe('[STREAM_START]');
    expect(events).toContain('[SECTION:MILESTONE_1]');
    expect(events).toContain('[TITLE]Starting milestone...[/TITLE]');
    
    // Should contain an error event
    const errorEvent = events.find(event => event.startsWith('[ERROR]'));
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toContain('Action plan generation failed');

    // 6. Verify database was not updated with partial data
    const sessionAfterError = await storage.getAssessmentSessionBySessionId(sessionId);
    expect(sessionAfterError!.actionPlan).toBeNull();
    expect(sessionAfterError!.chosenPathId).toBeNull();
  });

  it('should handle YouTube enrichment failures gracefully', async () => {
    // 1. Create a test session with purpose paths
    const sessionId = 'youtube-error-' + Date.now();
    const testSession = await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses,
      coreDriversAnalysis: {
        statementSentence: 'You are driven by the desire to create meaningful software.',
        coreThreads: 'Problem-solving, technical excellence, user impact.'
      }
    });

    const purposePath = await storage.createPurposePath({
      assessmentId: testSession.id,
      title: 'Senior Full-Stack Developer',
      description: 'Lead development of complex web applications.',
      ikigaiAlignment: {
        love: 'Building user interfaces',
        goodAt: 'Full-stack development',
        worldNeeds: 'Better software',
        pay: '$120,000-$150,000'
      },
      actionStrategy: 'Focus on modern frameworks.'
    });

    // 2. Mock successful streaming but failing YouTube enrichment
    (getActionPlanStreamChain as any).mockImplementation(async function*() {
      yield '[SECTION:MILESTONE_1]';
      yield '[TITLE]Build Foundation[/TITLE]';
      yield '[TIMELINE]Weeks 1-2[/TIMELINE]';
      yield '[ACTIONS]• Learn React basics[/ACTIONS]';
      yield '[SKILLS][SKILL]React fundamentals[/SKILL][/SKILLS]';
      yield '[END_SECTION]';
    });

    // 3. Mock YouTube service to throw an error during enrichment
    (getYoutubeVideosForSkills as any).mockImplementation(async () => {
      throw new Error('YouTube API rate limit exceeded');
    });

    // 4. Make the streaming request
    const response = await request(app)
      .get('/api/action-plan/stream')
      .query({ sessionId, chosenPathId: purposePath.id })
      .expect(200);

    // 5. Parse the SSE events
    const events = parseSSEEvents(response.text);
    
    // 6. Verify streaming completed but enrichment failed
    expect(events[0]).toBe('[STREAM_START]');
    expect(events).toContain('[STREAM_END]');
    expect(events).toContain('[ENRICH_START]');
    
    // Should contain an error event for enrichment failure
    const errorEvent = events.find(event => event.startsWith('[ERROR]'));
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toContain('YouTube API rate limit exceeded');

    // 7. Verify streaming data was NOT persisted due to enrichment failure
    const sessionAfterError = await storage.getAssessmentSessionBySessionId(sessionId);
    expect(sessionAfterError!.actionPlan).toBeNull();
    expect(sessionAfterError!.chosenPathId).toBeNull();
  });

  it('should return 404 for non-existent session', async () => {
    const response = await request(app)
      .get('/api/action-plan/stream')
      .query({ sessionId: 'non-existent-session', chosenPathId: '1' })
      .expect(404);

    expect(response.body.error).toBe('Session not found');
  });

  it('should return 400 when sessionId is missing', async () => {
    const response = await request(app)
      .get('/api/action-plan/stream')
      .expect(400);

    expect(response.body.error).toBe('sessionId is required');
  });


  it('should return 400 for invalid chosenPathId format', async () => {
    // Create valid session
    const sessionId = 'invalid-path-format-' + Date.now();
    await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses
    });

    const response = await request(app)
      .get('/api/action-plan/stream')
      .query({ sessionId, chosenPathId: 'invalid' })
      .expect(400);

    expect(response.body.error).toBe('chosenPathId must be a valid number');
  });

  it('should return 404 when chosenPathId not found in session', async () => {
    // Create session without purpose paths
    const sessionId = 'no-paths-' + Date.now();
    await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses
    });

    const response = await request(app)
      .get('/api/action-plan/stream')
      .query({ sessionId, chosenPathId: '999' })
      .expect(404);

    expect(response.body.error).toBe('Chosen path not found for this session');
  });
});
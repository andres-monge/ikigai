/**
 * @description
 * Integration tests for the action plan streaming endpoint `/api/action-plan/stream`.
 * 
 * This test suite covers the complete action plan streaming flow including:
 * - AI-generated milestone streaming
 * - YouTube enrichment for skills
 * - Database persistence with transactions
 * - Error handling and graceful degradation
 * - Concurrency control between sessions
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
import { getActionPlanStreamChain } from '../../ai/chains';
import { getYoutubeVideosForSkills } from '../../services/youtube';

// Mock the AI chains
vi.mock('../../ai/chains', () => ({
  getPurposeDiscoveryChain: vi.fn(),
  getPurposeDiscoveryStreamChain: vi.fn(),
  getActionPlanChain: vi.fn(),
  getActionPlanStreamChain: vi.fn(),
}));

// Mock the YouTube service for action plan enrichment
vi.mock('../../services/youtube', () => ({
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

/* ------------------------------------------------------------------ */
/*                    Action Plan Streaming Tests                    */
/* ------------------------------------------------------------------ */

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
      coreDriversAnalysis: {
        statementSentence: 'Test core drivers analysis.',
        coreThreads: 'Test threads for concurrency test.'
      }
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
      responses: testResponses,
      coreDriversAnalysis: {
        statementSentence: 'Test core drivers analysis for session 1.',
        coreThreads: 'Test threads for concurrent test 1.'
      }
    });
    
    const testSession2 = await storage.createAssessmentSession({
      sessionId: sessionId2,
      language: 'en',
      responses: testResponses,
      coreDriversAnalysis: {
        statementSentence: 'Test core drivers analysis for session 2.',
        coreThreads: 'Test threads for concurrent test 2.'
      }
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
  }, 15000); // Increase timeout for concurrent operations with transactions

  it('should handle AI chain errors gracefully during streaming', async () => {
    // 1. Create a test session with purpose paths
    const sessionId = 'error-action-plan-' + Date.now();
    const testSession = await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses,
      coreDriversAnalysis: {
        statementSentence: 'Test core drivers analysis for error test.',
        coreThreads: 'Test threads for error handling test.'
      }
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
    expect(errorEvent).toContain('Failed to save your action plan. Please try again.');

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
    expect(errorEvent).toContain('Failed to save your action plan. Please try again.');

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
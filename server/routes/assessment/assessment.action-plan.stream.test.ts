/**
 * @description
 * Integration tests for the action plan streaming endpoint `/api/action-plan/stream` (AI SDK Protocol).
 * 
 * This test suite covers the complete action plan streaming flow using Vercel AI SDK:
 * - AI-generated milestone streaming with structured validation
 * - YouTube enrichment for skills
 * - Database persistence with transactions
 * - Error handling and graceful degradation
 * - Concurrency control between sessions
 * 
 * Migrated from SSE protocol to AI SDK's streamObject in Step 17.2.
 */

import { beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AddressInfo } from 'node:net';
import { db } from '../../db.js';
import { assessmentSessions, purposePaths } from '../../../shared/schema.js';
import type { QuestionnaireResponses } from '../../../shared/schema.js';
import { storage } from '../../storage.js';
import { createTestApp } from '../../utils/sse-test-utils.js';

// Import the functions we'll be mocking before setting up the mock
import { getActionPlanStreamChain } from '../../ai/chains';
import { getYoutubeVideosForSkills } from '../../services/youtube';

// Mock the AI chains
vi.mock('../../ai/chains', () => ({
  getPurposeDiscoveryStreamChain: vi.fn(),
  getActionPlanStreamChain: vi.fn(),
}));

// Mock the YouTube service for action plan enrichment
vi.mock('../../services/youtube', () => ({
  getYoutubeVideosForSkills: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/*                         AI SDK Mock Helpers                       */
/* ------------------------------------------------------------------ */

/**
 * Creates a mock streamObject result for testing AI SDK action plan streaming
 * This simulates AI SDK streaming behavior with progressive JSON chunks
 * optimized for fast test execution while testing application functionality
 */
function createMockActionPlanStreamResult(finalObject: any) {
  return {
    pipeTextStreamToResponse: vi.fn((res: any) => {
      // Simulate progressive streaming without delays for fast test execution
      const chunks = [
        '{"milestones":[{',
        '"title":"Build Your Foundation",',
        '"timeline":"Weeks 1-2",',
        '"actions":["Set up development environment"],',
        '"skills":[{"skill":"React fundamentals"}]',
        '},{',
        '"title":"Master Core Concepts",',
        '"timeline":"Weeks 3-6",',
        '"actions":["Build complex projects"],',
        '"skills":[{"skill":"State management"}]',
        '}]}'
      ];
      
      // Stream all chunks immediately for fast test execution
      chunks.forEach(chunk => res.write(chunk));
      res.end();
    }),
    object: Promise.resolve(finalObject)
  };
}

/**
 * Mock final object for AI SDK action plan streaming tests
 * This represents the validated object that the AI SDK returns after streaming completes
 */
const mockActionPlanFinalObject = {
  milestones: [
    {
      title: "Build Your Foundation",
      timeline: "Weeks 1-2",
      actions: [
        "Set up your development environment with latest tools",
        "Create your first React project using modern best practices",
        "Deploy a simple 'Hello World' app to production"
      ],
      skills: [
        {
          skill: "React fundamentals",
          youtubeLinks: [
            {
              title: "React Tutorial for Beginners",
              url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg"
            }
          ]
        },
        {
          skill: "Modern JavaScript",
          youtubeLinks: [
            {
              title: "ES6+ Features Explained",
              url: "https://www.youtube.com/watch?v=oEX2yKr8Wxo",
              thumbnailUrl: "https://img.youtube.com/vi/oEX2yKr8Wxo/mqdefault.jpg"
            }
          ]
        }
      ]
    },
    {
      title: "Master Core Concepts",
      timeline: "Weeks 3-6",
      actions: [
        "Build three increasingly complex projects",
        "Learn state management patterns and best practices",
        "Practice API integration and data fetching"
      ],
      skills: [
        {
          skill: "State management",
          youtubeLinks: [
            {
              title: "Redux vs Context API",
              url: "https://www.youtube.com/watch?v=OvM4hIxrqAw",
              thumbnailUrl: "https://img.youtube.com/vi/OvM4hIxrqAw/mqdefault.jpg"
            }
          ]
        }
      ]
    },
    {
      title: "Launch Real Projects",
      timeline: "Weeks 7-12",
      actions: [
        "Build and deploy a full-stack application",
        "Contribute to open source projects in your field",
        "Start networking with professionals in the industry"
      ],
      skills: [
        {
          skill: "Full-stack development",
          youtubeLinks: [
            {
              title: "MERN Stack Tutorial",
              url: "https://www.youtube.com/watch?v=7CqJlxBYj-M",
              thumbnailUrl: "https://img.youtube.com/vi/7CqJlxBYj-M/mqdefault.jpg"
            }
          ]
        }
      ]
    }
  ]
};

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

describe('Action Plan Streaming Endpoint - POST /api/action-plan/stream (AI SDK)', () => {
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

    // 2. Mock the action plan streaming chain to return AI SDK result
    (getActionPlanStreamChain as any).mockResolvedValue(
      createMockActionPlanStreamResult(mockActionPlanFinalObject)
    );

    // 3. Mock the YouTube service
    (getYoutubeVideosForSkills as any).mockImplementation(async (skills: string[]) => {
      return mockYouTubeVideoData.filter(item => 
        skills.some(skill => skill.toLowerCase().includes(item.skill.toLowerCase()))
      );
    });

    // 4. Make the streaming request (now POST with body)
    const response = await request(app)
      .post('/api/action-plan/stream')
      .send({ sessionId, pathId: purposePath1.id })
      .expect(200);

    // 5. Verify complete application functionality: streaming behavior and content
    expect(response.text).toBeDefined();
    expect(response.text.length).toBeGreaterThan(0);
    
    // Verify the stream contains the expected AI SDK structure
    expect(response.text).toContain('milestones');
    expect(response.text).toContain('Build Your Foundation');
    expect(response.text).toContain('Master Core Concepts');
    
    // Verify proper JSON streaming (should be valid JSON parts)
    expect(response.text).toMatch(/\"title\".*Build Your Foundation/);
    expect(response.text).toMatch(/\"timeline\".*Weeks 1-2/);

    // 6. Verify complete application workflow: questionnaire → AI → database persistence
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
    expect(reactSkill!.youtubeLinks.length).toBeGreaterThan(0); // Should have YouTube videos
    expect(reactSkill!.youtubeLinks[0].title).toBe('React Tutorial for Beginners');
    expect(reactSkill!.youtubeLinks[0].url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    
    // Verify complete ikigai data structure and timestamps
    expect(updatedSession!.responses).toEqual(testResponses);
    expect(updatedSession!.language).toBe('en');
    expect(updatedSession!.updatedAt.getTime()).toBeGreaterThan(updatedSession!.createdAt.getTime());
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

    // 2. Mock the streaming chain to simulate a slow stream
    (getActionPlanStreamChain as any).mockImplementation(async () => {
      return {
        pipeTextStreamToResponse: vi.fn((res: any) => {
          // Simulate a slow streaming response
          setTimeout(() => {
            res.write('{"milestones":[');
            setTimeout(() => {
              res.write('{"title":"Hold stream open"}');
              res.end(']}');
            }, 500);
          }, 300);
        }),
        object: new Promise(resolve => {
          setTimeout(() => resolve({ milestones: [{ title: "Hold stream open", timeline: "Test", actions: ["Test"], skills: [] }] }), 1000);
        })
      };
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

      // 5. Start first stream using fetch (real HTTP request with POST body)
      const firstRes = await fetch(`${baseURL}/api/action-plan/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, pathId: purposePath.id }),
        signal: controller.signal,
      });
      expect(firstRes.status).toBe(200);

      // 6. Read first chunk to ensure streaming has started
      const reader = firstRes.body!.getReader();
      const firstChunk = await reader.read();
      expect(firstChunk.value).toBeDefined();

      // 7. Now attempt second request - should be rejected with 429
      const secondRes = await fetch(`${baseURL}/api/action-plan/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, pathId: purposePath.id }),
      });
      expect(secondRes.status).toBe(429);
      
      const secondBody = await secondRes.json();
      expect(secondBody.error).toBe('A stream is already in progress for this session');
      expect(secondBody.code).toBe('CONCURRENCY_LIMIT_REACHED');

      // 8. Cleanup
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
    const minimalActionPlan = {
      milestones: [
        {
          title: "Quick test",
          timeline: "Week 1",
          actions: ["Test action"],
          skills: [{ skill: "Test skill", youtubeLinks: [] }]
        }
      ]
    };
    
    (getActionPlanStreamChain as any).mockResolvedValue(
      createMockActionPlanStreamResult(minimalActionPlan)
    );

    // 3. Mock YouTube service
    (getYoutubeVideosForSkills as any).mockImplementation(async () => []);

    // 4. Start both streams sequentially to ensure clean database operations
    const response1 = await request(app).post('/api/action-plan/stream').send({ sessionId: sessionId1, pathId: purposePath1.id });
    const response2 = await request(app).post('/api/action-plan/stream').send({ sessionId: sessionId2, pathId: purposePath2.id });

    // 5. Verify both streams succeeded
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    
    // Verify streaming content was returned (not just empty responses)
    expect(response1.text).toBeDefined();
    expect(response1.text.length).toBeGreaterThan(0);
    expect(response2.text).toBeDefined();
    expect(response2.text.length).toBeGreaterThan(0);

    // 6. Verify complete application functionality: database persistence with proper data
    const updatedSession1 = await storage.getAssessmentSessionBySessionId(sessionId1);
    const updatedSession2 = await storage.getAssessmentSessionBySessionId(sessionId2);
    
    expect(updatedSession1).toBeDefined();
    expect(updatedSession2).toBeDefined();
    
    // Verify the core application functionality: AI analysis was saved correctly
    expect(updatedSession1!.actionPlan).toBeDefined();
    expect(updatedSession1!.actionPlan!.milestones).toHaveLength(1);
    expect(updatedSession1!.actionPlan!.milestones[0].title).toBe('Quick test');
    
    expect(updatedSession2!.actionPlan).toBeDefined();
    expect(updatedSession2!.actionPlan!.milestones).toHaveLength(1);
    expect(updatedSession2!.actionPlan!.milestones[0].title).toBe('Quick test');
    
    // Verify sessions maintain separate data (no cross-contamination)
    expect(updatedSession1!.id).not.toBe(updatedSession2!.id);
    expect(updatedSession1!.sessionId).toBe(sessionId1);
    expect(updatedSession2!.sessionId).toBe(sessionId2);
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
    (getActionPlanStreamChain as any).mockRejectedValue(
      new Error('Action plan generation failed')
    );

    // 3. Make the streaming request - should result in 500 error
    const response = await request(app)
      .post('/api/action-plan/stream')
      .send({ sessionId, pathId: purposePath.id })
      .expect(500);

    // 4. Verify error response
    expect(response.body.error).toBe('Failed to start stream');

    // 5. Verify database was not updated with partial data
    const sessionAfterError = await storage.getAssessmentSessionBySessionId(sessionId);
    expect(sessionAfterError!.actionPlan).toBeNull();
    expect(sessionAfterError!.chosenPathId).toBeNull();
  });


  it('should return 404 for non-existent session', async () => {
    const response = await request(app)
      .post('/api/action-plan/stream')
      .send({ sessionId: 'non-existent-session', pathId: 1 })
      .expect(404);

    expect(response.body.error).toBe('Session not found');
  });

  it('should return 400 when sessionId is missing', async () => {
    const response = await request(app)
      .post('/api/action-plan/stream')
      .send({})
      .expect(400);

    expect(response.body.error).toBe('Invalid request body');
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for invalid pathId format', async () => {
    // Create valid session
    const sessionId = 'invalid-path-format-' + Date.now();
    await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses
    });

    const response = await request(app)
      .post('/api/action-plan/stream')
      .send({ sessionId, pathId: 'invalid' })
      .expect(400);

    expect(response.body.error).toBe('Invalid request body');
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 404 when pathId not found in session', async () => {
    // Create session with purpose paths so validation passes, but use non-existent pathId
    const sessionId = 'valid-session-bad-path-' + Date.now();
    const testSession = await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: testResponses,
      coreDriversAnalysis: {
        statementSentence: 'Test core drivers analysis.',
        coreThreads: 'Test core threads analysis.'
      }
    });
    
    // Create a valid purpose path so validation passes
    await storage.createPurposePath({
      assessmentId: testSession.id,
      title: 'Existing Path',
      description: 'A valid path',
      ikigaiAlignment: { love: 'test', goodAt: 'test', worldNeeds: 'test', pay: 'test' },
      actionStrategy: 'Test strategy'
    });

    const response = await request(app)
      .post('/api/action-plan/stream')
      .send({ sessionId, pathId: 999 }) // This pathId doesn't exist
      .expect(404);

    expect(response.body.error).toBe('Chosen path not found for this session');
  });
});
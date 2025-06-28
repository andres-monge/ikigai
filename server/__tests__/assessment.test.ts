/*
 * @file assessment.test.ts
 *
 * Integration tests for the `/api/action-plan` endpoint. The test spins up an
 * in-memory Express application that mounts the real router tree but stubs
 * the expensive AI chain so we avoid hitting external services. We then
 * create an assessment session + purpose path via the shared storage layer
 * and ensure the endpoint returns a `200 OK` along with the updated session
 * object containing the generated action plan.
 */

import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeAll, vi } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Stub the heavy AI chain *before* any route modules are imported so the
// real implementation is never executed.
// ────────────────────────────────────────────────────────────────────────────

// The mock factory is hoisted, so we must define everything it needs within
// the factory itself. We also expose the stub so the test assertions can
// import it later without hitting the TDZ (Temporal Dead Zone).

vi.mock('../ai/chains', () => {
  const stubActionPlan = {
    sideProjectIdeas: ['Start a technical blog about the field'],
    skillsToLearn: [
      {
        skill: 'TypeScript',
        youtubeLinks: [
          {
            title: 'TypeScript in 100 Seconds',
            url: 'https://www.youtube.com/watch?v=BCg4U1FzODs',
          },
        ],
      },
    ],
    peopleToNetworkWith: ['Local JS meetup'],
  } as const;

  return {
    getActionPlanChain: vi.fn().mockResolvedValue(stubActionPlan),
    getPurposeDiscoveryChain: vi.fn(),
    __stubActionPlan: stubActionPlan, // re-export for test assertions
  };
});

// Now that the dependency is mocked, we can safely import the rest of the
// application modules.

// Storage singleton used by the real route implementation
import { storage } from '../storage';

// The router registration utility
import { registerRoutes } from '../routes';

// This is the payload we expect the mocked chain to resolve with. We duplicate
// the object (rather than importing from the mock) to avoid TypeScript
// complaining about missing exports on the real module.
const expectedActionPlan = {
  sideProjectIdeas: ['Start a technical blog about the field'],
  skillsToLearn: [
    {
      skill: 'TypeScript',
      youtubeLinks: [
        {
          title: 'TypeScript in 100 Seconds',
          url: 'https://www.youtube.com/watch?v=BCg4U1FzODs',
        },
      ],
    },
  ],
  peopleToNetworkWith: ['Local JS meetup'],
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Test Setup
// ────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
registerRoutes(app);

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('POST /api/action-plan', () => {
  let sessionId: string;
  let pathId: number;

  beforeAll(async () => {
    // 1. Seed storage with a session and one purpose path.
    sessionId = 'sess-integration-test';

    const session = await storage.createAssessmentSession({
      sessionId,
      language: 'en',
      responses: null,
      coreDriversAnalysis: null,
      chosenPathId: null,
      actionPlan: null,
    }) as any;

    const path = await storage.createPurposePath({
      assessmentId: (session as any).id,
      title: 'Software Engineer',
      description: 'Build and ship software products',
      ikigaiAlignment: null,
      actionStrategy: 'Learn by building',
    } as any);

    pathId = path.id;
  });

  it('returns 200 OK and a JSON body containing the generated action plan', async () => {
    const res = await request(app)
      .post('/api/action-plan')
      .send({
        sessionId,
        chosenPathId: pathId,
      });

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();

    // Basic shape checks
    expect(res.body.actionPlan).toEqual(expectedActionPlan);
    expect(res.body.chosenPathId).toBe(pathId);
  });
}); 
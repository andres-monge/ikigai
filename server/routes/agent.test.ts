import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import {
  applyCareerMapOperation,
  createCareerMap,
  type CareerMap,
  type CareerMapOperation,
} from '../../shared/career-map/index.js';
import type {
  AgentTurnRecord,
  BeginAgentTurnResult,
  IStorage,
  PersistCareerMapResult,
} from '../storage.js';
import { MethodOwnerBusyError } from '../storage.js';
import { createAgentRouter } from './agent.js';

const USER_ID = 'opaque-user-1';
const SENTINEL = 'private-prompt-map-history-source-provider-sentinel';
const timestamp = (second: number) => `2030-01-01T00:00:${String(second).padStart(2, '0')}.000Z`;

function usage() {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
}

function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: text },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage() },
      ] as never,
    }),
  };
}

function errorStream(error: unknown) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'error', error },
      ] as never,
    }),
  };
}

function pendingWhy(): CareerMap {
  const proposed = applyCareerMapOperation(createCareerMap(USER_ID), {
    type: 'propose-why',
    sourceId: 'prior-proposal-call',
    expectedRevision: 0,
    occurredAt: timestamp(1),
    payload: {
      why: {
        id: 'why-1',
        revision: 1,
        statement: SENTINEL,
        serves: 'People testing career directions',
        pointOfView: 'Useful clarity comes from action.',
      },
      presentation: {
        kind: 'model-presentation',
        assistantTurnId: 'prior-assistant-turn',
        turnSequence: 1,
        completed: true,
        presentedAt: timestamp(1),
      },
    },
  });
  if (proposed.status !== 'committed') throw new Error('Why fixture did not commit.');
  return proposed.map;
}

function turn(origin: AgentTurnRecord['origin'], status: AgentTurnRecord['status'] = 'pending'): AgentTurnRecord {
  return {
    turnId: `${origin}-turn`,
    userId: USER_ID,
    clientMessageId: 'client-message-1',
    requestFingerprint: 'fingerprint-1',
    origin,
    leaseId: `${origin}-lease`,
    status,
    terminalResult: status === 'completed' ? { completed: true, refetch: true } : null,
    createdAt: new Date(timestamp(2)),
    updatedAt: new Date(timestamp(2)),
    terminalAt: status === 'pending' ? null : new Date(timestamp(2)),
  };
}

function createStorage(overrides: Record<string, unknown> = {}) {
  let map = pendingWhy();
  const storage = {
    loadCareerMap: vi.fn(async (_userId: string) => ({ status: 'ready' as const, map })),
    getOrCreateCareerMap: vi.fn(async (_userId: string) => ({ status: 'ready' as const, map })),
    persistCareerMapOperation: vi.fn(async (input: { userId: string; operation: CareerMapOperation }): Promise<PersistCareerMapResult> => {
      const result = applyCareerMapOperation(map, input.operation);
      if (result.status === 'committed' || result.status === 'replayed') map = result.map;
      return result;
    }),
    beginWorkspaceActionTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
      status: 'started',
      shouldInvokeModel: true,
      turn: turn('workspace-action'),
    })),
    beginAgentTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
      status: 'started',
      shouldInvokeModel: true,
      turn: turn('agent-turn'),
    })),
    completeAgentTurn: vi.fn(async () => turn('agent-turn', 'completed')),
    cancelAgentTurn: vi.fn(async () => turn('agent-turn', 'cancelled')),
    failAgentTurn: vi.fn(async () => turn('agent-turn', 'failed')),
    releaseTurnLease: vi.fn(async () => true),
    getConversationMapping: vi.fn(async () => undefined as string | undefined),
    setConversationMapping: vi.fn(async () => undefined),
    recordResearchAttempt: vi.fn(async () => undefined),
    ...overrides,
  };
  return storage as typeof storage & IStorage;
}

const authenticated: RequestHandler = (_request, response, next) => {
  response.locals.auth = Object.freeze({
    userId: USER_ID,
    email: 'explorer@example.com',
    name: 'Explorer',
    image: null,
  });
  next();
};

const unauthenticated: RequestHandler = (_request, response) => {
  response.status(401).json({ error: 'Authentication required' });
};

function testApp(input: Parameters<typeof createAgentRouter>[0]) {
  const app = express();
  app.use(express.json());
  app.use('/api/agent', createAgentRouter(input));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(413).json({ error: 'Agent request failed', errorClass: error instanceof Error ? error.name : 'Error' });
  });
  return app;
}

describe('protected Method routes', () => {
  it('requires a server session before reading or mutating Method state', async () => {
    const storage = createStorage();
    const app = testApp({ storage, requireAuth: unauthenticated, agentEnabled: true, operationalLog: vi.fn() });

    const responses = await Promise.all([
      request(app).get('/api/agent/workspace'),
      request(app).get('/api/agent/history'),
      request(app).post('/api/agent').send({ id: 'message', message: 'hello' }),
      request(app).post('/api/agent/workspace/operations').send({}),
      request(app).post('/api/agent/audio/transcribe').set('content-type', 'audio/webm').send(Buffer.from('audio')),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
    expect(storage.loadCareerMap).not.toHaveBeenCalled();
    expect(storage.beginAgentTurn).not.toHaveBeenCalled();
    expect(storage.beginWorkspaceActionTurn).not.toHaveBeenCalled();
  });

  it('fails closed while preserving authenticated read-only map and empty history', async () => {
    const storage = createStorage();
    const transcribeAudio = vi.fn();
    const app = testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: false,
      transcribeAudio,
      operationalLog: vi.fn(),
      conversationClient: { listItems: vi.fn() },
    });

    const workspace = await request(app).get('/api/agent/workspace');
    const history = await request(app).get('/api/agent/history');
    const agent = await request(app).post('/api/agent').send({ id: 'message', message: SENTINEL });
    const operation = await request(app).post('/api/agent/workspace/operations').send({
      operationId: 'operation-1',
      clientMessageId: 'message-1',
      operation: { type: 'confirm-why', input: {} },
    });
    const audio = await request(app)
      .post('/api/agent/audio/transcribe')
      .set('content-type', 'audio/webm')
      .send(Buffer.from('audio'));

    expect(workspace.status).toBe(200);
    expect(history.body).toEqual({ status: 'empty', messages: [] });
    expect([agent.status, operation.status, audio.status]).toEqual([503, 503, 503]);
    expect(storage.getOrCreateCareerMap).not.toHaveBeenCalled();
    expect(storage.beginAgentTurn).not.toHaveBeenCalled();
    expect(storage.beginWorkspaceActionTurn).not.toHaveBeenCalled();
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
    expect(storage.recordResearchAttempt).not.toHaveBeenCalled();
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it('returns an empty workspace bootstrap and enforces the bounded agent message schema before storage', async () => {
    const storage = createStorage({ loadCareerMap: vi.fn(async () => ({ status: 'not-found' as const })) });
    const app = testApp({ storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn() });
    const workspace = await request(app).get('/api/agent/workspace');
    const oversized = await request(app).post('/api/agent').send({
      id: 'client-message-1', message: 'x'.repeat(12_001),
    });
    expect(workspace.body).toEqual({ status: 'empty', map: null });
    expect(oversized.status).toBe(400);
    expect(storage.getOrCreateCareerMap).not.toHaveBeenCalled();
    expect(storage.beginAgentTurn).not.toHaveBeenCalled();
  });

  it('executes workspace operations through the shared reducer with server provenance', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const storage = createStorage();
    const app = testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      id: (() => {
        const ids = ['request-1', 'workspace-turn', 'workspace-lease'];
        return () => ids.shift() ?? 'extra-id';
      })(),
      now: () => new Date(timestamp(3)),
      operationalLog: (entry) => logs.push(entry),
    });
    const response = await request(app)
      .post('/api/agent/workspace/operations')
      .set('x-user-id', 'spoofed-user')
      .send({
        operationId: 'operation-1',
        clientMessageId: 'client-message-1',
        operation: {
          type: 'confirm-why',
          input: {
            whyId: 'why-1',
            whyRevision: 1,
            presentedInTurnId: 'prior-assistant-turn',
            sourceMessageId: 'client-message-1',
          },
        },
      });

    expect(response.status, JSON.stringify({ body: response.body, logs })).toBe(200);
    expect(response.body).toMatchObject({
      status: 'committed',
      operation: 'confirm-why',
      authoritativeRevision: 2,
      derivedModule: 'create-purpose-paths',
      pendingDecision: null,
    });
    expect(storage.persistCareerMapOperation).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }));
    expect(storage.completeAgentTurn).toHaveBeenCalledOnce();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
    expect(logs.at(-1)).toMatchObject({
      route: '/workspace/operations',
      status: 200,
      operationId: 'operation-1',
      revision: 2,
    });
  });

  it.each([
    ['attached', { status: 'attached', shouldInvokeModel: false, turn: turn('agent-turn') }],
    ['terminal', { status: 'terminal', shouldInvokeModel: false, turn: turn('agent-turn', 'completed') }],
  ] as const)('returns a %s replay outcome without re-invoking the provider', async (_label, begun) => {
    const storage = createStorage({ beginAgentTurn: vi.fn(async () => begun) });
    const model = new MockLanguageModelV4({
      doGenerate: { content: [{ type: 'text', text: 'must-not-run' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(), warnings: [] } as never,
    });
    const response = await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) },
      operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

    expect(response.status).toBe(begun.status === 'attached' ? 409 : 200);
    expect(response.body.status).toBe(begun.status === 'attached' ? 'in-flight' : 'completed-replay');
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(storage.getConversationMapping).not.toHaveBeenCalled();
  });

  it('uses only the server-owned Conversation mapping and completes a natural no-write turn', async () => {
    const storage = createStorage({ getConversationMapping: vi.fn(async () => 'conversation-for-authenticated-owner') });
    const model = new MockLanguageModelV4({
      doStream: textStream('A normal reflective response without a write.') as never,
    });
    const response = await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) },
      operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'Help me think this through.' });

    expect(response.status, JSON.stringify({ body: response.body, failed: storage.failAgentTurn.mock.calls })).toBe(200);
    expect(response.text).toContain('A normal reflective response');
    expect(model.doStreamCalls[0]?.providerOptions?.openai).toMatchObject({
      conversation: 'conversation-for-authenticated-owner',
      store: true,
    });
    expect(storage.completeAgentTurn).toHaveBeenCalledOnce();
    expect(storage.cancelAgentTurn).not.toHaveBeenCalled();
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
  });

  it('keeps protected audio bounded and returns payload-free provider failures', async () => {
    const failure = new Error(SENTINEL);
    failure.name = 'AudioProviderFailure';
    const logs: Array<Record<string, unknown>> = [];
    const app = testApp({
      storage: createStorage(),
      requireAuth: authenticated,
      agentEnabled: true,
      transcribeAudio: vi.fn(async () => { throw failure; }),
      operationalLog: (entry) => logs.push(entry),
    });
    const failed = await request(app)
      .post('/api/agent/audio/transcribe?language=es')
      .set('content-type', 'audio/webm')
      .send(Buffer.from('audio'));
    const invalid = await request(app)
      .post('/api/agent/audio/transcribe?language=fr')
      .set('content-type', 'audio/webm')
      .send(Buffer.from('audio'));
    const oversized = await request(app)
      .post('/api/agent/audio/transcribe')
      .set('content-type', 'audio/webm')
      .send(Buffer.alloc(2 * 1024 * 1024 + 1));

    expect(failed.status).toBe(502);
    expect(invalid.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(JSON.stringify(failed.body)).not.toContain(SENTINEL);
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
  });

  it('fails and releases exactly once on a payload-bearing agent provider error', async () => {
    const storage = createStorage({ getConversationMapping: vi.fn(async () => 'server-conversation') });
    const providerError = new Error(SENTINEL);
    providerError.name = SENTINEL;
    const logs: Array<Record<string, unknown>> = [];
    const model = new MockLanguageModelV4({ doStream: errorStream(providerError) as never });
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) },
      operationalLog: (entry) => logs.push(entry),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

    expect(response.text).not.toContain(SENTINEL);
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
    expect(logs.at(-1)).toMatchObject({ errorClass: 'ExternalProviderError' });
    expect(response.text).toContain('The agent request failed.');
    expect(storage.failAgentTurn).toHaveBeenCalledOnce();
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.cancelAgentTurn).not.toHaveBeenCalled();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
  });

  it('rejects client owner and Conversation fields rather than trusting them', async () => {
    const storage = createStorage();
    const response = await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      operationalLog: vi.fn(),
    })).post('/api/agent').send({
      id: 'client-message-1',
      message: 'hello',
      ownerId: 'another-user',
      conversationId: 'client-controlled-conversation',
    });
    expect(response.status).toBe(400);
    expect(storage.getOrCreateCareerMap).not.toHaveBeenCalled();
  });

  it.each(['agent', 'workspace'] as const)('returns a retryable lease conflict on the %s mutation surface', async (surface) => {
    const conflict = {
      status: 'conflict' as const,
      activeTurnId: 'opaque-active-turn',
      retryAfter: new Date(timestamp(9)),
    };
    const storage = createStorage(surface === 'agent'
      ? { beginAgentTurn: vi.fn(async () => conflict) }
      : { beginWorkspaceActionTurn: vi.fn(async () => conflict) });
    const app = testApp({ storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn() });
    const response = surface === 'agent'
      ? await request(app).post('/api/agent').send({ id: 'client-message-1', message: 'hello' })
      : await request(app).post('/api/agent/workspace/operations').send({
        operationId: 'operation-1', clientMessageId: 'client-message-1',
        operation: {
          type: 'confirm-why',
          input: {
            whyId: 'why-1', whyRevision: 1,
            presentedInTurnId: 'prior-assistant-turn', sourceMessageId: 'client-message-1',
          },
        },
      });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ status: 'conflict', retryable: true });
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
    expect(storage.getConversationMapping).not.toHaveBeenCalled();
  });

  it('returns empty history for a deleted mapping and redacts mapped-provider failures', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const emptyStorage = createStorage({ getConversationMapping: vi.fn(async () => undefined) });
    const emptyClient = { listItems: vi.fn() };
    const empty = await request(testApp({
      storage: emptyStorage, requireAuth: authenticated, agentEnabled: true,
      conversationClient: emptyClient, operationalLog: vi.fn(),
    })).get('/api/agent/history');
    expect(empty.body).toEqual({ status: 'empty', messages: [] });
    expect(emptyClient.listItems).not.toHaveBeenCalled();

    const successLogs: Array<Record<string, unknown>> = [];
    const ready = await request(testApp({
      storage: createStorage({ getConversationMapping: vi.fn(async () => 'server-conversation') }),
      requireAuth: authenticated,
      agentEnabled: true,
      conversationClient: {
        listItems: vi.fn(async () => ({
          data: [{ id: 'message-1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: SENTINEL }] }],
          hasMore: false,
        })),
      },
      operationalLog: (entry) => successLogs.push(entry),
    })).get('/api/agent/history');
    expect(ready.body.messages[0].parts[0].text).toBe(SENTINEL);
    expect(JSON.stringify(successLogs)).not.toContain(SENTINEL);

    const failed = await request(testApp({
      storage: createStorage({ getConversationMapping: vi.fn(async () => 'server-conversation') }),
      requireAuth: authenticated,
      agentEnabled: true,
      conversationClient: { listItems: vi.fn(async () => { throw new Error(SENTINEL); }) },
      operationalLog: (entry) => logs.push(entry),
    })).get('/api/agent/history');
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.body)).not.toContain(SENTINEL);
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
  });

  it('maps a bounded owner-lock miss to a typed retryable 409', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const response = await request(testApp({
      storage: createStorage({ loadCareerMap: vi.fn(async () => { throw new MethodOwnerBusyError(); }) }),
      requireAuth: authenticated,
      agentEnabled: true,
      operationalLog: (entry) => logs.push(entry),
    })).get('/api/agent/workspace');
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ errorClass: 'MethodOwnerBusyError', retryable: true });
    expect(logs.at(-1)).toMatchObject({ errorClass: 'MethodOwnerBusyError', status: 409 });
  });

  it('does not acquire a turn or dispatch a provider after request abort wins the pre-begin race', async () => {
    let releaseMap!: () => void;
    const mapGate = new Promise<void>((resolve) => { releaseMap = resolve; });
    const storage = createStorage({
      getOrCreateCareerMap: vi.fn(async () => {
        await mapGate;
        return { status: 'ready' as const, map: pendingWhy() };
      }),
    });
    const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });
    const outbound = request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) }, operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });
    const settled = Promise.resolve(outbound).catch(() => undefined);
    await vi.waitFor(() => expect(storage.getOrCreateCareerMap).toHaveBeenCalledOnce());
    outbound.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseMap();
    await settled;
    await vi.waitFor(() => expect(storage.beginAgentTurn).not.toHaveBeenCalled());
    expect(storage.getConversationMapping).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('cancels and releases exactly once when abort wins after turn acquisition but before provider dispatch', async () => {
    let releaseMapping!: () => void;
    const mappingGate = new Promise<void>((resolve) => { releaseMapping = resolve; });
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => {
        await mappingGate;
        return 'server-conversation';
      }),
    });
    const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });
    const outbound = request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) }, operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });
    const settled = Promise.resolve(outbound).catch(() => undefined);
    await vi.waitFor(() => expect(storage.getConversationMapping).toHaveBeenCalledOnce());
    outbound.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseMapping();
    await settled;
    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    expect(model.doStreamCalls).toHaveLength(0);
  });
});

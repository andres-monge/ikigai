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
import { createDisplayRecovery } from '../ai/history.js';
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
    listAgentTurns: vi.fn(async () => []),
    backfillAgentTurnDisplayProjection: vi.fn(async () => undefined),
    getConversationMapping: vi.fn(async () => undefined as string | undefined),
    setConversationMapping: vi.fn(async () => undefined),
    recordConversationProvisioning: vi.fn(async () => undefined),
    listPendingConversationProvisioning: vi.fn(async () => []),
    resolveConversationProvisioning: vi.fn(async () => undefined),
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

function testApp(
  input: Parameters<typeof createAgentRouter>[0],
  routerFactory: typeof createAgentRouter = createAgentRouter,
) {
  const app = express();
  app.use(express.json());
  app.use('/api/agent', routerFactory({
    classifyTurn: async () => 'method',
    ...input,
  }));
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

  it.each([
    ['missing', undefined],
    ['false', 'false'],
  ] as const)('fails closed when AGENT_ENABLED is %s while authenticated read paths stay available', async (_label, flag) => {
    const previous = process.env.AGENT_ENABLED;
    if (flag === undefined) delete process.env.AGENT_ENABLED;
    else process.env.AGENT_ENABLED = flag;
    vi.resetModules();

    try {
      const { createAgentRouter: createFreshAgentRouter } = await import('./agent.js');
      const storage = createStorage();
      const transcribeAudio = vi.fn();
      const conversationClient = {
        createConversation: vi.fn(),
        deleteConversation: vi.fn(),
        listItems: vi.fn(),
      };
      const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });
      const app = testApp({
        storage,
        requireAuth: authenticated,
        transcribeAudio,
        conversationClient,
        model,
        operationalLog: vi.fn(),
      }, createFreshAgentRouter);

      const workspace = await request(app).get('/api/agent/workspace');
      const history = await request(app).get('/api/agent/history');
      const agent = await request(app).post('/api/agent').send({ id: 'message', message: SENTINEL });
      const operation = await request(app).post('/api/agent/workspace/operations').send({
        operationId: 'operation-disabled-flag', clientMessageId: 'message-disabled-flag',
        operation: { type: 'confirm-why', input: {} },
      });
      const audio = await request(app).post('/api/agent/audio/transcribe')
        .set('content-type', 'audio/webm').send(Buffer.from('audio'));

      expect(workspace.status).toBe(200);
      expect(workspace.body).toMatchObject({ status: 'ready' });
      expect(history.body).toEqual({ status: 'empty', messages: [] });
      expect([agent.status, operation.status, audio.status]).toEqual([503, 503, 503]);
      expect(storage.loadCareerMap).toHaveBeenCalledWith(USER_ID);
      expect(storage.getConversationMapping).toHaveBeenCalledWith(USER_ID);
      expect(storage.getOrCreateCareerMap).not.toHaveBeenCalled();
      expect(storage.beginAgentTurn).not.toHaveBeenCalled();
      expect(storage.beginWorkspaceActionTurn).not.toHaveBeenCalled();
      expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
      expect(storage.recordResearchAttempt).not.toHaveBeenCalled();
      expect(storage.setConversationMapping).not.toHaveBeenCalled();
      expect(storage.recordConversationProvisioning).not.toHaveBeenCalled();
      expect(storage.listPendingConversationProvisioning).not.toHaveBeenCalled();
      expect(storage.resolveConversationProvisioning).not.toHaveBeenCalled();
      expect(conversationClient.createConversation).not.toHaveBeenCalled();
      expect(conversationClient.deleteConversation).not.toHaveBeenCalled();
      expect(conversationClient.listItems).not.toHaveBeenCalled();
      expect(transcribeAudio).not.toHaveBeenCalled();
      expect(model.doStreamCalls).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env.AGENT_ENABLED;
      else process.env.AGENT_ENABLED = previous;
    }
  });

  it('keeps disabled mapped history read-only while still returning safe recoverable items', async () => {
    const userText = 'Safe repeated prompt';
    const assistantText = 'Safe completed answer';
    const completed = {
      ...turn('agent-turn', 'completed'),
      terminalResult: {
        kind: 'completed', refetch: true,
        displayRecovery: createDisplayRecovery(userText, assistantText, false),
      },
    };
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'mapped-conversation'),
      listAgentTurns: vi.fn(async () => [completed]),
    });
    const conversationClient = {
      createConversation: vi.fn(), deleteConversation: vi.fn(),
      listItems: vi.fn(async () => ({
        data: [
          { id: 'mapped-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: userText }] },
          { id: 'mapped-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: assistantText }] },
        ],
        hasMore: false,
      })),
    };

    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: false, conversationClient, operationalLog: vi.fn(),
    })).get('/api/agent/history');

    expect(response.status).toBe(200);
    expect(response.body.messages.map((message: { id: string }) => message.id))
      .toEqual(['mapped-user', 'mapped-assistant']);
    expect(conversationClient.listItems).toHaveBeenCalledOnce();
    expect(storage.backfillAgentTurnDisplayProjection).not.toHaveBeenCalled();
    expect(storage.listPendingConversationProvisioning).not.toHaveBeenCalled();
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
      operationId: expect.stringMatching(/^op_[a-f0-9]{16}$/),
      revision: 2,
    });
  });

  it('returns the durable failed turn when completion loses its lease instead of claiming workspace success', async () => {
    const failedTurn = {
      ...turn('workspace-action', 'failed'),
      terminalResult: { kind: 'failed', refetch: true, errorClass: 'TurnLeaseLostError' },
    };
    const storage = createStorage({ completeAgentTurn: vi.fn(async () => failedTurn) });
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true,
      now: () => new Date(timestamp(3)), operationalLog: vi.fn(),
    })).post('/api/agent/workspace/operations').send({
      operationId: 'operation-completion-race', clientMessageId: 'client-message-1',
      operation: {
        type: 'confirm-why', input: {
          whyId: 'why-1', whyRevision: 1,
          presentedInTurnId: 'prior-assistant-turn', sourceMessageId: 'client-message-1',
        },
      },
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      status: 'failed-replay', terminal: 'failed',
      result: { kind: 'failed', refetch: true, errorClass: 'TurnLeaseLostError' },
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

  it.each([
    ['completed', 200, { kind: 'completed', refetch: true, revision: 2 }],
    ['cancelled', 409, { kind: 'cancelled', refetch: true, revision: 2 }],
    ['failed', 409, { kind: 'failed', refetch: true, errorClass: 'ExternalProviderError' }],
  ] as const)('preserves the real %s terminal status and safe replay marker', async (status, expectedStatus, terminalResult) => {
    const terminalTurn = { ...turn('agent-turn', status), terminalResult };
    const storage = createStorage({
      beginAgentTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'terminal', shouldInvokeModel: false, turn: terminalTurn,
      })),
    });
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'retry' });

    expect(response.status).toBe(expectedStatus);
    expect(response.body).toEqual({
      status: `${status}-replay`, terminal: status, result: terminalResult,
      ...(status === 'completed' ? {} : { retryable: false }),
    });
    expect(storage.getConversationMapping).not.toHaveBeenCalled();
  });

  it('reports a recovered display projection as ready without also reporting it pending', async () => {
    const terminalTurn = {
      ...turn('agent-turn', 'completed'),
      terminalResult: {
        kind: 'completed', refetch: true,
        displayProjection: { userItemId: 'provider-user', assistantItemIds: ['provider-assistant'] },
        displayRecovery: {
          status: 'pending', userTextDigest: 'a'.repeat(64),
          assistantTextDigest: 'b'.repeat(64), assistantTextLength: 10, retainPartial: false,
        },
      },
    };
    const storage = createStorage({
      beginAgentTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'terminal', shouldInvokeModel: false, turn: terminalTurn,
      })),
    });

    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'retry' });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({ kind: 'completed', displayReady: true });
    expect(response.body.result).not.toHaveProperty('historyProjection');
  });

  it('replays the stored workspace operation envelope without converting it to a generic completion', async () => {
    const operationEnvelope = {
      status: 'committed', operation: 'confirm-why', authoritativeRevision: 2,
      derivedModule: 'create-purpose-paths', pendingDecision: null,
    };
    const storage = createStorage({
      beginWorkspaceActionTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'terminal', shouldInvokeModel: false,
        turn: { ...turn('workspace-action', 'completed'), terminalResult: { kind: 'workspace-result', refetch: true, operationEnvelope } },
      })),
    });
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    })).post('/api/agent/workspace/operations').send({
      operationId: 'operation-replay', clientMessageId: 'client-message-1',
      operation: { type: 'confirm-why', input: {} },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...operationEnvelope, turnStatus: 'completed', replay: true });
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', 409, 'revision-conflict', true],
    ['rejected', 422, 'operation-unavailable', false],
  ] as const)('preserves stored workspace %s HTTP semantics', async (status, httpStatus, errorClass, retryable) => {
    const operationEnvelope = {
      status, operation: 'confirm-why', authoritativeRevision: 2,
      derivedModule: 'create-purpose-paths', pendingDecision: null,
      errorClass, ...(retryable ? { retryable: true } : {}),
    };
    const storage = createStorage({
      beginWorkspaceActionTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'terminal', shouldInvokeModel: false,
        turn: {
          ...turn('workspace-action', 'completed'),
          terminalResult: { kind: 'workspace-result', refetch: true, operationEnvelope },
        },
      })),
    });
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    })).post('/api/agent/workspace/operations').send({
      operationId: 'operation-replay', clientMessageId: 'client-message-1',
      operation: { type: 'confirm-why', input: {} },
    });

    expect(response.status).toBe(httpStatus);
    expect(response.body).toEqual({ ...operationEnvelope, turnStatus: 'completed', replay: true });
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
  });

  it('fails closed when a stored workspace replay envelope is malformed instead of spreading its payload', async () => {
    const terminalSentinel = 'PRIVATE-STORED-TERMINAL-PAYLOAD';
    const storage = createStorage({
      beginWorkspaceActionTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'terminal', shouldInvokeModel: false,
        turn: {
          ...turn('workspace-action', 'completed'),
          terminalResult: {
            kind: 'workspace-result',
            operationEnvelope: { status: 'committed', leaked: terminalSentinel },
          },
        },
      })),
    });
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    })).post('/api/agent/workspace/operations').send({
      operationId: 'operation-replay', clientMessageId: 'client-message-1',
      operation: { type: 'confirm-why', input: {} },
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ status: 'failed-replay', terminal: 'failed' });
    expect(JSON.stringify(response.body)).not.toContain(terminalSentinel);
  });

  it('uses only the server-owned Conversation mapping and completes a natural no-write turn', async () => {
    const storage = createStorage({ getConversationMapping: vi.fn(async () => 'conversation-for-authenticated-owner') });
    const conversationClient = {
      listItems: vi.fn(async () => ({
        data: [
          { id: 'provider-user-item', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Help me think this through.' }] },
          { id: 'provider-assistant-item', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'A normal reflective response without a write.' }] },
        ],
        hasMore: false,
      })),
    };
    const model = new MockLanguageModelV4({
      doStream: textStream('A normal reflective response without a write.') as never,
    });
    const response = await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      conversationClient,
      classifyTurn: async () => 'conversation',
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
    expect(storage.completeAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({
        kind: 'completed',
        displayProjection: {
          userItemId: 'provider-user-item',
          assistantItemIds: ['provider-assistant-item'],
        },
      }),
    }));
  });

  it('bounds Conversation creation with a request-scoped provisioning timeout', async () => {
    const timeoutController = new AbortController();
    timeoutController.abort(new DOMException('Conversation provisioning timed out.', 'TimeoutError'));
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);
    let provisioningSignal: AbortSignal | undefined;
    const storage = createStorage();
    const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });
    const conversationClient = {
      createConversation: vi.fn(async (signal?: AbortSignal) => {
        provisioningSignal = signal;
        if (!signal) throw new Error('Conversation creation was not bounded.');
        if (signal.aborted) throw signal.reason;
        return 'provider-conversation-must-not-be-created';
      }),
      deleteConversation: vi.fn(),
      listItems: vi.fn(),
    };

    try {
      const response = await request(testApp({
        storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
        researchProvider: { search: vi.fn(async () => ({ candidates: [] })) }, operationalLog: vi.fn(),
      })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({ errorClass: 'TimeoutError' });
      expect(timeout).toHaveBeenCalledWith(5_000);
      expect(conversationClient.createConversation).toHaveBeenCalledWith(expect.any(AbortSignal));
      expect(provisioningSignal?.aborted).toBe(true);
      expect(storage.recordConversationProvisioning).not.toHaveBeenCalled();
      expect(storage.setConversationMapping).not.toHaveBeenCalled();
      expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({ errorClass: 'TimeoutError' }));
      expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
      expect(model.doStreamCalls).toHaveLength(0);
    } finally {
      timeout.mockRestore();
    }
  });

  it('durably records a provider Conversation before binding it and resolves the marker after mapping', async () => {
    const providerConversationId = 'provider-conversation-success-sentinel';
    const logs: Array<Record<string, unknown>> = [];
    const storage = createStorage();
    const conversationClient = {
      createConversation: vi.fn(async (_signal?: AbortSignal) => providerConversationId),
      deleteConversation: vi.fn(),
      listItems: vi.fn(async () => ({ data: [], hasMore: false })),
    };
    const model = new MockLanguageModelV4({ doStream: textStream('Safe reply.') as never });
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) },
      operationalLog: (entry) => logs.push(entry),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

    expect(response.status).toBe(200);
    expect(conversationClient.createConversation).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(storage.recordConversationProvisioning).toHaveBeenCalledWith({
      userId: USER_ID,
      turnId: 'agent-turn-turn',
      leaseId: 'agent-turn-lease',
      conversationId: providerConversationId,
    });
    expect(storage.setConversationMapping).toHaveBeenCalledWith(
      USER_ID, 'agent-turn-lease', providerConversationId,
    );
    expect(storage.resolveConversationProvisioning).toHaveBeenCalledWith({
      userId: USER_ID,
      turnId: 'agent-turn-turn',
      conversationId: providerConversationId,
    });
    expect(storage.recordConversationProvisioning.mock.invocationCallOrder[0])
      .toBeLessThan(storage.setConversationMapping.mock.invocationCallOrder[0]!);
    expect(storage.setConversationMapping.mock.invocationCallOrder[0])
      .toBeLessThan(storage.resolveConversationProvisioning.mock.invocationCallOrder[0]!);
    expect(conversationClient.deleteConversation).not.toHaveBeenCalled();
    expect(JSON.stringify([response.body, response.text, logs])).not.toContain(providerConversationId);
  });

  it('keeps a successfully bound Conversation when marker resolution is temporarily unavailable', async () => {
    const providerConversationId = 'provider-conversation-bound-before-marker-resolution';
    let mapped: string | undefined;
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => mapped),
      setConversationMapping: vi.fn(async (_userId: string, _leaseId: string, id: string) => { mapped = id; }),
      resolveConversationProvisioning: vi.fn()
        .mockRejectedValueOnce(new Error('marker-resolution-temporary-failure'))
        .mockResolvedValue(undefined),
    });
    const conversationClient = {
      createConversation: vi.fn(async () => providerConversationId),
      deleteConversation: vi.fn(async () => undefined),
      listItems: vi.fn(async () => ({ data: [], hasMore: false })),
    };
    const model = new MockLanguageModelV4({ doStream: textStream('Safe reply.') as never });

    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) }, operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

    expect(response.status).toBe(200);
    expect(mapped).toBe(providerConversationId);
    expect(conversationClient.deleteConversation).not.toHaveBeenCalled();
    expect(storage.completeAgentTurn).toHaveBeenCalledOnce();
  });

  it('resolves a pending provisioning marker already bound to the user without deleting it', async () => {
    const providerConversationId = 'provider-conversation-already-bound';
    const marker = { userId: USER_ID, turnId: 'prior-turn', conversationId: providerConversationId };
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => providerConversationId),
      listPendingConversationProvisioning: vi.fn(async () => [marker]),
    });
    const conversationClient = {
      createConversation: vi.fn(),
      deleteConversation: vi.fn(async () => undefined),
      listItems: vi.fn(async () => ({ data: [], hasMore: false })),
    };

    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, conversationClient, operationalLog: vi.fn(),
    })).get('/api/agent/history');

    expect(response.status).toBe(200);
    expect(storage.resolveConversationProvisioning).toHaveBeenCalledWith(marker);
    expect(conversationClient.deleteConversation).not.toHaveBeenCalled();
  });

  it('records a newly created Conversation and resolves it after compensating for mapping failure', async () => {
    const storage = createStorage({
      setConversationMapping: vi.fn(async () => { throw new Error('binding-failed-sentinel'); }),
    });
    const cleanupSignals: Array<Record<string, unknown>> = [];
    const conversationClient = {
      createConversation: vi.fn(async () => 'conversation-created-before-bind'),
      deleteConversation: vi.fn(async () => undefined),
      listItems: vi.fn(),
    };
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, conversationClient,
      conversationCleanupSignal: (entry) => cleanupSignals.push(entry),
      operationalLog: vi.fn(),
    } as never)).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

    expect(response.status).toBe(502);
    expect(conversationClient.createConversation).toHaveBeenCalledOnce();
    expect(storage.recordConversationProvisioning).toHaveBeenCalledWith({
      userId: USER_ID,
      turnId: 'agent-turn-turn',
      leaseId: 'agent-turn-lease',
      conversationId: 'conversation-created-before-bind',
    });
    expect(storage.setConversationMapping).toHaveBeenCalledWith(
      USER_ID, 'agent-turn-lease', 'conversation-created-before-bind',
    );
    expect(conversationClient.deleteConversation).toHaveBeenCalledWith(
      'conversation-created-before-bind', expect.any(AbortSignal),
    );
    expect(storage.resolveConversationProvisioning).toHaveBeenCalledWith({
      userId: USER_ID,
      turnId: 'agent-turn-turn',
      conversationId: 'conversation-created-before-bind',
    });
    expect(cleanupSignals).toEqual([expect.objectContaining({
      type: 'conversation_provisioning_compensated', cleanupRequired: false,
    })]);
    expect(JSON.stringify(cleanupSignals)).not.toContain('conversation-created-before-bind');
  });

  it('compensates a created Conversation when the first durable marker write fails', async () => {
    const providerConversationId = 'conversation-marker-write-failed';
    const storage = createStorage({
      recordConversationProvisioning: vi.fn()
        .mockRejectedValueOnce(new Error('marker-write-failed'))
        .mockResolvedValue(undefined),
    });
    const conversationClient = {
      createConversation: vi.fn(async () => providerConversationId),
      deleteConversation: vi.fn(async () => { throw new Error('delete-also-failed'); }),
      listItems: vi.fn(),
    };

    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, conversationClient, operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

    expect(response.status).toBe(502);
    expect(conversationClient.deleteConversation).toHaveBeenCalledWith(
      providerConversationId, expect.any(AbortSignal),
    );
    expect(storage.recordConversationProvisioning).toHaveBeenCalledTimes(2);
    expect(storage.setConversationMapping).not.toHaveBeenCalled();
    expect(JSON.stringify([response.body, response.text])).not.toContain(providerConversationId);
  });

  it('propagates request abort during Conversation provisioning without mapping or provider dispatch', async () => {
    let provisioningSignal: AbortSignal | undefined;
    let rejectCreate!: (error: unknown) => void;
    const storage = createStorage();
    const conversationClient = {
      createConversation: vi.fn((signal?: AbortSignal) => {
        provisioningSignal = signal;
        return new Promise<string>((_resolve, reject) => {
          rejectCreate = reject;
          const rejectForAbort = () => reject(
            signal?.reason ?? new DOMException('Conversation provisioning aborted.', 'AbortError'),
          );
          if (signal?.aborted) rejectForAbort();
          else signal?.addEventListener('abort', rejectForAbort, { once: true });
        });
      }),
      deleteConversation: vi.fn(async () => undefined),
      listItems: vi.fn(),
    };
    const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });
    const outbound = request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) },
      operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });
    const settled = Promise.resolve(outbound).catch(() => undefined);
    await vi.waitFor(() => expect(conversationClient.createConversation).toHaveBeenCalledOnce());
    outbound.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (!provisioningSignal?.aborted) {
      rejectCreate(new DOMException('Test cleanup for missing provider abort.', 'AbortError'));
    }
    await settled;

    expect(conversationClient.createConversation).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(provisioningSignal?.aborted).toBe(true);
    expect(storage.recordConversationProvisioning).not.toHaveBeenCalled();
    expect(storage.setConversationMapping).not.toHaveBeenCalled();
    expect(conversationClient.deleteConversation).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('records and binds a Conversation returned by a provider that ignores request abort', async () => {
    const providerConversationId = 'provider-conversation-returned-after-abort';
    let provisioningSignal: AbortSignal | undefined;
    let resolveCreate!: (id: string) => void;
    const createGate = new Promise<string>((resolve) => { resolveCreate = resolve; });
    const storage = createStorage();
    const conversationClient = {
      createConversation: vi.fn((signal?: AbortSignal) => {
        provisioningSignal = signal;
        return createGate;
      }),
      deleteConversation: vi.fn(async () => undefined),
      listItems: vi.fn(),
    };
    const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });
    const outbound = request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) }, operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });
    const settled = Promise.resolve(outbound).catch(() => undefined);
    await vi.waitFor(() => expect(conversationClient.createConversation).toHaveBeenCalledOnce());

    outbound.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    resolveCreate(providerConversationId);
    await settled;

    expect(conversationClient.createConversation).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(provisioningSignal?.aborted).toBe(true);
    await vi.waitFor(() => expect(storage.resolveConversationProvisioning).toHaveBeenCalledWith({
      userId: USER_ID,
      turnId: 'agent-turn-turn',
      conversationId: providerConversationId,
    }));
    expect(storage.recordConversationProvisioning).toHaveBeenCalledWith({
      userId: USER_ID,
      turnId: 'agent-turn-turn',
      leaseId: 'agent-turn-lease',
      conversationId: providerConversationId,
    });
    expect(storage.setConversationMapping).toHaveBeenCalledWith(
      USER_ID, 'agent-turn-lease', providerConversationId,
    );
    expect(storage.recordConversationProvisioning.mock.invocationCallOrder[0])
      .toBeLessThan(storage.setConversationMapping.mock.invocationCallOrder[0]!);
    expect(conversationClient.deleteConversation).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('persists failed compensation for default-router reconciliation without exposing provider ids', async () => {
    const providerConversationId = 'provider-orphan-conversation-sentinel';
    const cleanupFailure = `delete-failed-for-${providerConversationId}`;
    const logs: Array<Record<string, unknown>> = [];
    let pending: { userId: string; turnId: string; conversationId: string } | undefined;
    const recordConversationProvisioning = vi.fn(async (input: {
      userId: string; turnId: string; leaseId: string; conversationId: string;
    }) => {
      pending = {
        userId: input.userId,
        turnId: input.turnId,
        conversationId: input.conversationId,
      };
    });
    const listPendingConversationProvisioning = vi.fn(async (userId: string) => (
      pending?.userId === userId ? [pending] : []
    ));
    const resolveConversationProvisioning = vi.fn(async (input: {
      userId: string; turnId: string; conversationId: string;
    }) => {
      if (pending
        && input.userId === pending.userId
        && input.turnId === pending.turnId
        && input.conversationId === pending.conversationId
      ) pending = undefined;
    });
    const storage = createStorage({
      setConversationMapping: vi.fn(async () => { throw new Error(`mapping-failed-for-${providerConversationId}`); }),
      recordConversationProvisioning,
      listPendingConversationProvisioning,
      resolveConversationProvisioning,
    });
    const conversationClient = {
      createConversation: vi.fn(async (_signal?: AbortSignal) => providerConversationId),
      deleteConversation: vi.fn()
        .mockRejectedValueOnce(new Error(cleanupFailure))
        .mockResolvedValueOnce(undefined),
      listItems: vi.fn(),
    };
    const app = testApp({
      storage, requireAuth: authenticated, agentEnabled: true, conversationClient,
      operationalLog: (entry) => logs.push(entry),
    });

    const failed = await request(app)
      .post('/api/agent')
      .send({ id: 'client-message-1', message: 'hello' });
    expect(failed.status).toBe(502);
    expect(recordConversationProvisioning).toHaveBeenCalledWith({
      userId: USER_ID,
      turnId: 'agent-turn-turn',
      leaseId: 'agent-turn-lease',
      conversationId: providerConversationId,
    });
    expect(pending).toEqual({
      userId: USER_ID,
      turnId: 'agent-turn-turn',
      conversationId: providerConversationId,
    });
    expect(resolveConversationProvisioning).not.toHaveBeenCalled();

    const history = await request(app).get('/api/agent/history');

    expect(history.status).toBe(200);
    expect(history.body).toEqual({ status: 'empty', messages: [] });
    expect(listPendingConversationProvisioning).toHaveBeenCalledWith(USER_ID);
    expect(conversationClient.deleteConversation).toHaveBeenNthCalledWith(
      2, providerConversationId, expect.any(AbortSignal),
    );
    expect(resolveConversationProvisioning).toHaveBeenCalledWith({
      userId: USER_ID,
      turnId: 'agent-turn-turn',
      conversationId: providerConversationId,
    });
    expect(pending).toBeUndefined();
    expect(JSON.stringify([failed.body, failed.text, history.body, logs]))
      .not.toContain(providerConversationId);
    expect(JSON.stringify([failed.body, failed.text, history.body, logs]))
      .not.toContain(cleanupFailure);
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
      storage: createStorage({
        getConversationMapping: vi.fn(async () => 'server-conversation'),
        listAgentTurns: vi.fn(async () => [{
          ...turn('agent-turn', 'completed'),
          terminalResult: {
            kind: 'completed', refetch: true,
            displayProjection: { userItemId: 'user-message-1', assistantItemIds: ['message-1'] },
          },
        }]),
      }),
      requireAuth: authenticated,
      agentEnabled: true,
      conversationClient: {
        listItems: vi.fn(async () => ({
          data: [
            { id: 'user-message-1', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'safe user text' }] },
            { id: 'message-1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: SENTINEL }] },
          ],
          hasMore: false,
        })),
      },
      operationalLog: (entry) => successLogs.push(entry),
    })).get('/api/agent/history');
    expect(ready.body.messages[1].parts[0].text).toBe(SENTINEL);
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

  it('hashes client operation ids in operational logs', async () => {
    const rawOperationId = 'operation-PRIVATE-IDENTIFIER-sentinel';
    const logs: Array<Record<string, unknown>> = [];
    const response = await request(testApp({
      storage: createStorage(), requireAuth: authenticated, agentEnabled: true,
      now: () => new Date(timestamp(3)), operationalLog: (entry) => logs.push(entry),
    })).post('/api/agent/workspace/operations').send({
      operationId: rawOperationId, clientMessageId: 'client-message-1',
      operation: {
        type: 'confirm-why',
        input: {
          whyId: 'why-1', whyRevision: 1,
          presentedInTurnId: 'prior-assistant-turn', sourceMessageId: 'client-message-1',
        },
      },
    });
    expect(response.status).toBe(200);
    expect(JSON.stringify(logs)).not.toContain(rawOperationId);
    expect(logs.at(-1)?.operationId).toMatch(/^op_[a-f0-9]{16}$/);
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

  it('records abort-after-commit recovery markers and replays cancellation without invoking the workspace operation twice', async () => {
    const storage = createStorage();
    const persist = storage.persistCareerMapOperation;
    let releasePersist!: () => void;
    const persistGate = new Promise<void>((resolve) => { releasePersist = resolve; });
    let committed!: () => void;
    const committedSignal = new Promise<void>((resolve) => { committed = resolve; });
    persist.mockImplementationOnce(async (input) => {
      const result = await createStorage().persistCareerMapOperation(input);
      // Reflect the durable commit in the canonical load used by recovery.
      if ('map' in result) {
        storage.loadCareerMap.mockResolvedValue({ status: 'ready', map: result.map });
      }
      committed();
      await persistGate;
      return result;
    });
    const app = testApp({
      storage, requireAuth: authenticated, agentEnabled: true,
      now: () => new Date(timestamp(3)), operationalLog: vi.fn(),
    });
    const body = {
      operationId: 'operation-abort-after-commit', clientMessageId: 'client-message-1',
      operation: {
        type: 'confirm-why',
        input: {
          whyId: 'why-1', whyRevision: 1,
          presentedInTurnId: 'prior-assistant-turn', sourceMessageId: 'client-message-1',
        },
      },
    };
    const outbound = request(app).post('/api/agent/workspace/operations').send(body);
    const settled = Promise.resolve(outbound).catch(() => undefined);
    await committedSignal;
    outbound.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    releasePersist();
    await settled;
    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());

    const cancellation = storage.cancelAgentTurn.mock.calls[0]?.[0]?.result;
    expect(cancellation).toMatchObject({
      kind: 'cancelled', stopped: true, refetch: true, revision: 2, operationCommitted: true,
    });
    storage.beginWorkspaceActionTurn.mockResolvedValueOnce({
      status: 'terminal', shouldInvokeModel: false,
      turn: { ...turn('workspace-action', 'cancelled'), terminalResult: cancellation },
    });
    const replay = await request(app).post('/api/agent/workspace/operations').send(body);

    expect(replay.status).toBe(409);
    expect(replay.body).toMatchObject({
      status: 'cancelled-replay', terminal: 'cancelled',
      result: { kind: 'cancelled', stopped: true, refetch: true, revision: 2, operationCommitted: true },
    });
    expect(persist).toHaveBeenCalledOnce();
  });
});

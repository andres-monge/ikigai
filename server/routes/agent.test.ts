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
import { NATURAL_CONVERSATION_TOOL_NAME } from '../ai/agent.js';
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
    claimConversationProvisioningCleanup: vi.fn(async () => undefined),
    completeConversationProvisioningCleanup: vi.fn(async () => undefined),
    releaseConversationProvisioningCleanup: vi.fn(async () => undefined),
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

  it('rejects newline-bearing client message ids before the durable turn or provider boundary', async () => {
    const clientIdSentinel = 'PRIVATE_CLIENT_ID_SENTINEL';
    const logs: Array<Record<string, unknown>> = [];
    const storage = createStorage();
    const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      operationalLog: (entry) => logs.push(entry),
    })).post('/api/agent').send({
      id: `message-safe\n${clientIdSentinel}`,
      message: 'A normal reflection.',
    });

    expect(response.status).toBe(400);
    expect(storage.beginAgentTurn).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toHaveLength(0);
    expect(JSON.stringify([response.body, logs])).not.toContain(clientIdSentinel);
  });

  it('collapses attacker-controlled unmatched Method paths to a static log label', async () => {
    const pathSentinel = 'PRIVATE_LOG_PATH_SENTINEL';
    const logs: Array<Record<string, unknown>> = [];
    const response = await request(testApp({
      storage: createStorage(), requireAuth: authenticated, agentEnabled: true,
      operationalLog: (entry) => logs.push(entry),
    })).get(`/api/agent/${pathSentinel}`);

    expect(response.status).toBe(404);
    expect(logs.at(-1)).toMatchObject({ route: 'method-unmatched', status: 404 });
    expect(JSON.stringify(logs)).not.toContain(pathSentinel);
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
      route: 'workspace-operation',
      status: 200,
      operationId: expect.stringMatching(/^op_[a-f0-9]{16}$/),
      revision: 2,
    });
  });

  it('derives a workspace action sequence after the canonical presentation despite clock skew', async () => {
    const skewed = pendingWhy();
    const pending = skewed.foundation.whyRevisions.at(-1)!;
    pending.presentation.turnSequence = new Date(timestamp(9)).getTime();
    let map = skewed;
    const storage = createStorage({
      loadCareerMap: vi.fn(async () => ({ status: 'ready' as const, map })),
      getOrCreateCareerMap: vi.fn(async () => ({ status: 'ready' as const, map })),
      persistCareerMapOperation: vi.fn(async (input: { operation: CareerMapOperation }) => {
        const result = applyCareerMapOperation(map, input.operation);
        if (result.status === 'committed' || result.status === 'replayed') map = result.map;
        return result;
      }),
      beginWorkspaceActionTurn: vi.fn(async (input: {
        clientMessageId: string; requestFingerprint: string; turnId: string; leaseId: string;
      }): Promise<BeginAgentTurnResult> => ({
        status: 'started', shouldInvokeModel: true,
        turn: {
          ...turn('workspace-action'),
          clientMessageId: input.clientMessageId,
          requestFingerprint: input.requestFingerprint,
          turnId: input.turnId,
          leaseId: input.leaseId,
        },
      })),
    });

    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true,
      now: () => new Date(timestamp(1)), operationalLog: vi.fn(),
    })).post('/api/agent/workspace/operations').send({
      operationId: 'operation-clock-skew-confirm',
      clientMessageId: 'message-clock-skew-confirm',
      operation: {
        type: 'confirm-why',
        input: {
          whyId: pending.id,
          whyRevision: pending.revision,
          presentedInTurnId: pending.presentation.assistantTurnId,
          sourceMessageId: 'message-clock-skew-confirm',
        },
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'committed', authoritativeRevision: 2 });
    expect(map.foundation.whyRevisions.at(-1)?.status).toBe('confirmed');
  });

  it('derives an agent turn sequence after a same-millisecond canonical presentation', async () => {
    const fixedNow = new Date(timestamp(2));
    const sameTime = pendingWhy();
    const pending = sameTime.foundation.whyRevisions.at(-1)!;
    pending.presentation.turnSequence = fixedNow.getTime();
    let map = sameTime;
    const storage = createStorage({
      loadCareerMap: vi.fn(async () => ({ status: 'ready' as const, map })),
      getOrCreateCareerMap: vi.fn(async () => ({ status: 'ready' as const, map })),
      persistCareerMapOperation: vi.fn(async (input: { operation: CareerMapOperation }) => {
        const result = applyCareerMapOperation(map, input.operation);
        if (result.status === 'committed' || result.status === 'replayed') map = result.map;
        return result;
      }),
      beginAgentTurn: vi.fn(async (input: {
        clientMessageId: string; requestFingerprint: string; turnId: string; leaseId: string;
      }): Promise<BeginAgentTurnResult> => ({
        status: 'started', shouldInvokeModel: true,
        turn: {
          ...turn('agent-turn'),
          clientMessageId: input.clientMessageId,
          requestFingerprint: input.requestFingerprint,
          turnId: input.turnId,
          leaseId: input.leaseId,
        },
      })),
      getConversationMapping: vi.fn(async () => 'server-conversation-same-time'),
    });
    let providerCall = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        providerCall += 1;
        if (providerCall === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                {
                  type: 'tool-call', toolCallId: 'same-time-confirm-call', toolName: 'confirm_why',
                  input: JSON.stringify({
                    whyId: pending.id,
                    whyRevision: pending.revision,
                    presentedInTurnId: pending.presentation.assistantTurnId,
                    sourceMessageId: 'message-same-time-confirm',
                  }),
                },
                { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
              ] as never,
            }),
          };
        }
        return textStream('Confirmed from the authoritative revision.');
      },
    });
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      now: () => fixedNow,
      classifyTurn: async () => 'conversation',
      authorizeTurn: async () => ({
        operation: 'confirm-why', targetId: pending.id, targetRevision: pending.revision,
      }),
      conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) }, operationalLog: vi.fn(),
    })).post('/api/agent').send({
      id: 'message-same-time-confirm',
      message: 'That is exactly right; confirm it.',
    });

    expect(response.status).toBe(200);
    expect(map.foundation.whyRevisions.at(-1)?.status).toBe('confirmed');
    expect(storage.persistCareerMapOperation).toHaveBeenCalledOnce();
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
    let providerStep = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        providerStep += 1;
        if (providerStep === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                {
                  type: 'tool-call', toolCallId: 'natural-route-call',
                  toolName: NATURAL_CONVERSATION_TOOL_NAME, input: JSON.stringify({}),
                },
                { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
              ] as never,
            }),
          };
        }
        return textStream('A normal reflective response without a write.');
      },
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
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[0]?.toolChoice).toEqual({ type: 'required' });
    expect(model.doStreamCalls[0]?.tools?.map((definition) => definition.name))
      .toContain(NATURAL_CONVERSATION_TOOL_NAME);
    expect(model.doStreamCalls[1]?.toolChoice).toEqual({ type: 'none' });
    expect(model.doStreamCalls[1]?.tools).toBeUndefined();
    expect(model.doStreamCalls[1]?.providerOptions?.openai).toMatchObject({
      conversation: 'conversation-for-authenticated-owner',
      store: true,
      instructions: expect.any(String),
    });
    expect((model.doStreamCalls[0]?.providerOptions?.openai as Record<string, unknown>).contextManagement)
      .toBeDefined();
    expect((model.doStreamCalls[1]?.providerOptions?.openai as Record<string, unknown>).contextManagement)
      .toBeUndefined();
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

  it('keeps the terminal stream boundary behind durable completion so immediate history and the next turn see committed state', async () => {
    const providerConversationId = 'conversation-durable-before-terminal';
    const firstTurn = {
      ...turn('agent-turn'),
      turnId: 'durability-turn-1',
      clientMessageId: 'durability-message-1',
      leaseId: 'durability-lease-1',
    };
    const secondTurn = {
      ...turn('agent-turn'),
      turnId: 'durability-turn-2',
      clientMessageId: 'durability-message-2',
      leaseId: 'durability-lease-2',
    };
    let durableFirstTurn = firstTurn;
    let leaseHeld = true;
    let beginCount = 0;
    let completionStarted!: () => void;
    const completionStartedGate = new Promise<void>((resolve) => { completionStarted = resolve; });
    let releaseCompletion!: () => void;
    const completionGate = new Promise<void>((resolve) => { releaseCompletion = resolve; });
    let completionResolved = false;
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => providerConversationId),
      beginAgentTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => {
        beginCount += 1;
        if (beginCount === 1) {
          return { status: 'started', shouldInvokeModel: true, turn: firstTurn };
        }
        if (leaseHeld) {
          return {
            status: 'conflict',
            activeTurnId: firstTurn.turnId,
            retryAfter: new Date(timestamp(59)),
          };
        }
        leaseHeld = true;
        return { status: 'started', shouldInvokeModel: true, turn: secondTurn };
      }),
      completeAgentTurn: vi.fn(async (input: {
        userId: string; turnId: string; leaseId: string; result?: Record<string, unknown>;
      }) => {
        if (input.turnId === firstTurn.turnId) {
          completionStarted();
          await completionGate;
          durableFirstTurn = {
            ...firstTurn,
            status: 'completed',
            terminalResult: input.result ?? null,
            terminalAt: new Date(timestamp(3)),
            updatedAt: new Date(timestamp(3)),
          };
          completionResolved = true;
          return durableFirstTurn;
        }
        return {
          ...secondTurn,
          status: 'completed',
          terminalResult: input.result ?? null,
          terminalAt: new Date(timestamp(4)),
          updatedAt: new Date(timestamp(4)),
        };
      }),
      releaseTurnLease: vi.fn(async (_userId: string, turnId: string) => {
        if (turnId === firstTurn.turnId || turnId === secondTurn.turnId) leaseHeld = false;
        return true;
      }),
      listAgentTurns: vi.fn(async () => [durableFirstTurn]),
    });
    const conversationClient = {
      listItems: vi.fn(async () => ({
        data: [
          {
            id: 'durability-provider-user', type: 'message', role: 'user',
            content: [{ type: 'input_text', text: 'First durable message.' }],
          },
          {
            id: 'durability-provider-assistant', type: 'message', role: 'assistant',
            content: [{ type: 'output_text', text: 'Safe progressive reply.' }],
          },
        ],
        hasMore: false,
      })),
    };
    const model = new MockLanguageModelV4({
      doStream: async () => textStream('Safe progressive reply.') as never,
    });
    const app = testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      classifyTurn: async () => 'conversation',
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) },
      operationalLog: vi.fn(),
    });
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a TCP test server.');
      const firstResponse = await fetch(`http://127.0.0.1:${address.port}/api/agent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: firstTurn.clientMessageId, message: 'First durable message.' }),
      });
      if (!firstResponse.body) throw new Error('Expected a streamed response body.');
      const reader = firstResponse.body.getReader();
      const decoder = new TextDecoder();
      let received = '';
      let safeDeltaBeforeCompletion = false;
      let terminalEnded = false;
      const terminalBoundary = (async () => {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          received += decoder.decode(chunk.value, { stream: true });
          if (received.includes('Safe progressive reply.') && !completionResolved) {
            safeDeltaBeforeCompletion = true;
          }
        }
        received += decoder.decode();
        terminalEnded = true;
      })();
      const immediateHistory = terminalBoundary.then(() => request(app).get('/api/agent/history'));
      const immediateNextTurn = terminalBoundary.then(() => request(app)
        .post('/api/agent')
        .send({ id: secondTurn.clientMessageId, message: 'Immediate next message.' }));

      await completionStartedGate;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const terminalEndedBeforeDurableCompletion = terminalEnded;
      releaseCompletion();
      const [history, nextResponse] = await Promise.all([immediateHistory, immediateNextTurn]);

      expect(firstResponse.status).toBe(200);
      expect(safeDeltaBeforeCompletion).toBe(true);
      expect(terminalEndedBeforeDurableCompletion).toBe(false);
      expect(history.status).toBe(200);
      expect(history.body).toEqual({
        status: 'ready',
        messages: [
          {
            id: 'durability-provider-user', role: 'user',
            parts: [{ type: 'text', text: 'First durable message.' }],
          },
          {
            id: 'durability-provider-assistant', role: 'assistant',
            parts: [{ type: 'text', text: 'Safe progressive reply.' }],
          },
        ],
      });
      expect(nextResponse.status).toBe(200);
      expect(storage.cancelAgentTurn).not.toHaveBeenCalled();
      expect(storage.failAgentTurn).not.toHaveBeenCalled();
      expect(model.doStreamCalls).toHaveLength(2);
    } finally {
      releaseCompletion();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('does not emit a success finish when durable completion loses the turn lease', async () => {
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'server-conversation'),
      completeAgentTurn: vi.fn(async () => undefined),
    });
    const model = new MockLanguageModelV4({ doStream: textStream('Safe narration before terminalization.') as never });
    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) }, operationalLog: vi.fn(),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

    expect(response.text).not.toContain('"type":"finish"');
    expect(storage.completeAgentTurn).toHaveBeenCalledOnce();
    expect(storage.failAgentTurn).toHaveBeenCalledOnce();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
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
    const resolveConversationProvisioning = vi.fn(async () => undefined);
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => providerConversationId),
      listPendingConversationProvisioning: vi.fn(async () => [marker]),
      resolveConversationProvisioning,
      claimConversationProvisioningCleanup: vi.fn(async () => {
        await resolveConversationProvisioning(marker);
        return undefined;
      }),
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
    expect(storage.claimConversationProvisioningCleanup).toHaveBeenCalledWith(
      USER_ID, expect.any(String),
    );
    expect(resolveConversationProvisioning).toHaveBeenCalledWith(marker);
    expect(conversationClient.deleteConversation).not.toHaveBeenCalled();
  });

  it('does not reconcile a live provisioning marker before its valid lease binds the Conversation', async () => {
    const providerConversationId = 'provider-conversation-live-provisioning';
    const activeTurn = turn('agent-turn');
    let mappedConversationId: string | undefined;
    let pendingMarker: { userId: string; turnId: string; conversationId: string } | undefined;
    let bindingStarted!: () => void;
    const bindingStartedGate = new Promise<void>((resolve) => { bindingStarted = resolve; });
    let releaseBinding!: () => void;
    const bindingGate = new Promise<void>((resolve) => { releaseBinding = resolve; });
    let deletedBeforeBinding = false;
    let resolvedBeforeBinding = false;
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => mappedConversationId),
      recordConversationProvisioning: vi.fn(async (input: {
        userId: string; turnId: string; leaseId: string; conversationId: string;
      }) => {
        pendingMarker = {
          userId: input.userId,
          turnId: input.turnId,
          conversationId: input.conversationId,
        };
      }),
      listPendingConversationProvisioning: vi.fn(async () => pendingMarker ? [pendingMarker] : []),
      getTurnLease: vi.fn(async () => ({
        userId: USER_ID,
        turnId: activeTurn.turnId,
        leaseId: activeTurn.leaseId,
        acquiredAt: new Date(timestamp(1)),
        expiresAt: new Date(timestamp(59)),
      })),
      listAgentTurns: vi.fn(async () => [activeTurn]),
      setConversationMapping: vi.fn(async (_userId: string, _leaseId: string, conversationId: string) => {
        bindingStarted();
        await bindingGate;
        mappedConversationId = conversationId;
      }),
      resolveConversationProvisioning: vi.fn(async () => {
        if (!mappedConversationId) resolvedBeforeBinding = true;
        pendingMarker = undefined;
      }),
    });
    const conversationClient = {
      createConversation: vi.fn(async () => providerConversationId),
      deleteConversation: vi.fn(async () => {
        if (!mappedConversationId) deletedBeforeBinding = true;
      }),
      listItems: vi.fn(async () => ({ data: [], hasMore: false })),
    };
    const model = new MockLanguageModelV4({ doStream: textStream('Safe reply.') as never });
    const app = testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) },
      now: () => new Date(timestamp(3)), operationalLog: vi.fn(),
    });
    const activeProvisioning = Promise.resolve(request(app)
      .post('/api/agent')
      .send({ id: 'client-message-1', message: 'hello' }));
    await bindingStartedGate;

    const history = await Promise.resolve(request(app).get('/api/agent/history'))
      .finally(() => releaseBinding());
    const response = await activeProvisioning;

    expect(history.status).toBe(200);
    expect(history.body).toEqual({ status: 'empty', messages: [] });
    expect(deletedBeforeBinding).toBe(false);
    expect(resolvedBeforeBinding).toBe(false);
    expect(response.status).toBe(200);
    expect(mappedConversationId).toBe(providerConversationId);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]?.providerOptions?.openai).toMatchObject({
      conversation: providerConversationId,
      store: true,
    });
    expect(storage.completeAgentTurn).toHaveBeenCalledOnce();
  });

  it('retains a newly created Conversation marker after an acknowledgement-ambiguous mapping failure', async () => {
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
    expect(conversationClient.deleteConversation).not.toHaveBeenCalled();
    expect(storage.resolveConversationProvisioning).not.toHaveBeenCalled();
    expect(cleanupSignals).toEqual([expect.objectContaining({
      type: 'conversation_provisioning_compensated', cleanupRequired: true,
    })]);
    expect(JSON.stringify(cleanupSignals)).not.toContain('conversation-created-before-bind');
  });

  it('never deletes a Conversation when mapping commits before its acknowledgement throws', async () => {
    const providerConversationId = 'conversation-mapped-before-ack-error';
    let mapped: string | undefined;
    let pending: { userId: string; turnId: string; conversationId: string } | undefined;
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => mapped),
      recordConversationProvisioning: vi.fn(async (input: {
        userId: string; turnId: string; conversationId: string;
      }) => { pending = input; }),
      setConversationMapping: vi.fn(async (_userId: string, _leaseId: string, conversationId: string) => {
        mapped = conversationId;
        throw new Error('mapping-acknowledgement-lost');
      }),
      claimConversationProvisioningCleanup: vi.fn(async () => {
        if (pending?.conversationId === mapped) pending = undefined;
        return undefined;
      }),
    });
    const conversationClient = {
      createConversation: vi.fn(async () => providerConversationId),
      deleteConversation: vi.fn(async () => undefined),
      listItems: vi.fn(async () => ({ data: [], hasMore: false })),
    };
    const app = testApp({
      storage, requireAuth: authenticated, agentEnabled: true, conversationClient, operationalLog: vi.fn(),
    });

    const failed = await request(app)
      .post('/api/agent')
      .send({ id: 'client-message-1', message: 'hello' });
    expect(failed.status).toBe(502);
    expect(mapped).toBe(providerConversationId);
    expect(pending).toMatchObject({ conversationId: providerConversationId });
    expect(conversationClient.deleteConversation).not.toHaveBeenCalled();

    const history = await request(app).get('/api/agent/history');
    expect(history.status).toBe(200);
    expect(mapped).toBe(providerConversationId);
    expect(pending).toBeUndefined();
    expect(conversationClient.deleteConversation).not.toHaveBeenCalled();
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

  it('finishes bounded Conversation creation after request abort so the returned id can be compensated', async () => {
    let provisioningSignal: AbortSignal | undefined;
    let resolveCreate!: (id: string) => void;
    const storage = createStorage();
    const conversationClient = {
      createConversation: vi.fn((signal?: AbortSignal) => {
        provisioningSignal = signal;
        return new Promise<string>((resolve) => { resolveCreate = resolve; });
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
    expect(provisioningSignal?.aborted).toBe(false);
    resolveCreate('provider-conversation-after-client-abort');
    await settled;

    expect(conversationClient.createConversation).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(storage.recordConversationProvisioning).toHaveBeenCalledOnce();
    expect(storage.setConversationMapping).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(conversationClient.deleteConversation).toHaveBeenCalledWith(
      'provider-conversation-after-client-abort', expect.any(AbortSignal),
    ));
    await vi.waitFor(() => expect(storage.resolveConversationProvisioning).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('returns the normal conflict as soon as a healthy first turn binds its Conversation under a live lease', async () => {
    const activeTurnId = 'healthy-provisioning-turn';
    const retryAfter = new Date('2100-01-01T00:00:00.000Z');
    let mapping: string | undefined;
    let leaseReads = 0;
    const handoffDelays: number[] = [];
    const storage = createStorage({
      beginAgentTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'conflict', activeTurnId, retryAfter,
        waitReason: 'conversation-provisioning',
      })),
      getConversationMapping: vi.fn(async () => mapping),
      getTurnLease: vi.fn(async () => {
        leaseReads += 1;
        return {
          userId: USER_ID,
          turnId: leaseReads >= 4 ? 'fallback-release-for-baseline' : activeTurnId,
          leaseId: 'healthy-provisioning-lease',
          acquiredAt: new Date(timestamp(1)),
          expiresAt: retryAfter,
        };
      }),
    });
    const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });

    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      provisioningHandoffTiming: {
        now: () => Date.now(),
        delay: async (milliseconds: number) => {
          handoffDelays.push(milliseconds);
          mapping = 'healthy-bound-conversation';
        },
      },
      operationalLog: vi.fn(),
    } as never)).post('/api/agent').send({
      id: 'message-during-healthy-provisioning',
      message: 'Do not start concurrently with the healthy first turn.',
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ status: 'conflict', retryable: true });
    expect(storage.beginAgentTurn).toHaveBeenCalledOnce();
    expect(storage.getTurnLease).toHaveBeenCalledOnce();
    expect(storage.getConversationMapping).toHaveBeenCalledTimes(2);
    expect(handoffDelays).toEqual([25]);
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('bounds provisioning handoff reads with deterministic exponential backoff', async () => {
    const activeTurnId = 'bounded-provisioning-turn';
    const retryAfter = new Date('2100-01-01T00:00:00.000Z');
    let monotonicNow = 0;
    let leaseReads = 0;
    const handoffDelays: number[] = [];
    const storage = createStorage({
      beginAgentTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'conflict', activeTurnId, retryAfter,
        waitReason: 'conversation-provisioning',
      })),
      getConversationMapping: vi.fn(async () => undefined),
      getTurnLease: vi.fn(async () => {
        leaseReads += 1;
        if (handoffDelays.length === 0 && leaseReads >= 7) return undefined;
        return {
          userId: USER_ID, turnId: activeTurnId, leaseId: 'bounded-provisioning-lease',
          acquiredAt: new Date(timestamp(1)), expiresAt: retryAfter,
        };
      }),
    });
    const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });

    const response = await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      provisioningHandoffTiming: {
        now: () => monotonicNow,
        delay: async (milliseconds: number) => {
          handoffDelays.push(milliseconds);
          monotonicNow += milliseconds;
        },
      },
      operationalLog: vi.fn(),
    } as never)).post('/api/agent').send({
      id: 'message-during-bounded-provisioning',
      message: 'Return a normal conflict after the bounded handoff window.',
    });

    expect(response.status).toBe(409);
    expect(storage.beginAgentTurn).toHaveBeenCalledOnce();
    expect(handoffDelays.slice(0, 7)).toEqual([25, 50, 100, 200, 400, 800, 1_000]);
    expect(handoffDelays.at(-1)).toBeLessThanOrEqual(1_000);
    expect(storage.getConversationMapping.mock.calls.length).toBeLessThanOrEqual(20);
    expect(storage.getTurnLease.mock.calls.length).toBeLessThanOrEqual(20);
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('waits for aborted first-time provisioning to settle before starting the next message', async () => {
    const firstTurn = {
      ...turn('agent-turn'),
      turnId: 'provisioning-stop-turn-1',
      clientMessageId: 'provisioning-stop-message-1',
      leaseId: 'provisioning-stop-lease-1',
    };
    const secondTurn = {
      ...turn('agent-turn'),
      turnId: 'provisioning-stop-turn-2',
      clientMessageId: 'provisioning-stop-message-2',
      leaseId: 'provisioning-stop-lease-2',
    };
    let activeTurn: typeof firstTurn | typeof secondTurn | undefined = firstTurn;
    let beginCount = 0;
    let mappedConversation: string | undefined;
    const storage = createStorage({
      beginAgentTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => {
        beginCount += 1;
        if (beginCount === 1) return { status: 'started', shouldInvokeModel: true, turn: firstTurn };
        if (activeTurn?.turnId === firstTurn.turnId) {
          return {
            status: 'conflict',
            activeTurnId: firstTurn.turnId,
            retryAfter: new Date(timestamp(59)),
            waitReason: 'conversation-provisioning',
          };
        }
        activeTurn = secondTurn;
        return { status: 'started', shouldInvokeModel: true, turn: secondTurn };
      }),
      getTurnLease: vi.fn(async () => activeTurn ? ({
        userId: USER_ID,
        turnId: activeTurn.turnId,
        leaseId: activeTurn.leaseId,
        acquiredAt: new Date(timestamp(1)),
        expiresAt: new Date(timestamp(59)),
      }) : undefined),
      getConversationMapping: vi.fn(async () => mappedConversation),
      setConversationMapping: vi.fn(async (_userId: string, _leaseId: string, id: string) => {
        mappedConversation = id;
      }),
      releaseTurnLease: vi.fn(async (_userId: string, turnId: string, leaseId: string) => {
        if (activeTurn?.turnId === turnId && activeTurn.leaseId === leaseId) {
          activeTurn = undefined;
        }
        return true;
      }),
    });
    let resolveFirstCreate!: (id: string) => void;
    const firstCreate = new Promise<string>((resolve) => { resolveFirstCreate = resolve; });
    const conversationClient = {
      createConversation: vi.fn()
        .mockImplementationOnce((_signal?: AbortSignal) => firstCreate)
        .mockResolvedValueOnce('provider-conversation-after-stop'),
      deleteConversation: vi.fn(async () => undefined),
      listItems: vi.fn(async () => ({ data: [], hasMore: false })),
    };
    const model = new MockLanguageModelV4({ doStream: textStream('Safe next reply.') as never });
    const app = testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      classifyTurn: async () => 'method', authorizeTurn: async () => undefined,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) }, operationalLog: vi.fn(),
    });

    const first = request(app).post('/api/agent').send({
      id: firstTurn.clientMessageId,
      message: 'Start while the Conversation is being provisioned.',
    });
    const firstSettled = Promise.resolve(first).catch(() => undefined);
    await vi.waitFor(() => expect(conversationClient.createConversation).toHaveBeenCalledOnce());
    first.abort();

    const secondResponsePromise = Promise.resolve(request(app).post('/api/agent').send({
      id: secondTurn.clientMessageId,
      message: 'Start only after the stopped turn has settled.',
    }));
    await vi.waitFor(() => expect(storage.beginAgentTurn).toHaveBeenCalledTimes(2));
    expect(conversationClient.createConversation).toHaveBeenCalledOnce();

    resolveFirstCreate('provider-conversation-returned-after-stop');
    await firstSettled;
    const secondResponse = await secondResponsePromise;

    expect(secondResponse.status).toBe(200);
    expect(storage.beginAgentTurn).toHaveBeenCalledTimes(3);
    expect(conversationClient.createConversation).toHaveBeenCalledTimes(2);
    expect(conversationClient.deleteConversation).toHaveBeenCalledWith(
      'provider-conversation-returned-after-stop', expect.any(AbortSignal),
    );
    expect(mappedConversation).toBe('provider-conversation-after-stop');
    expect(model.doStreamCalls).toHaveLength(1);
    expect(storage.cancelAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      turnId: firstTurn.turnId,
      leaseId: firstTurn.leaseId,
    }));
    expect(storage.releaseTurnLease).toHaveBeenCalledWith(
      USER_ID, firstTurn.turnId, firstTurn.leaseId,
    );
  });

  it('records and compensates a Conversation returned after request abort without poisoning the mapping', async () => {
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
    expect(provisioningSignal?.aborted).toBe(false);
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
    expect(storage.setConversationMapping).not.toHaveBeenCalled();
    expect(conversationClient.deleteConversation).toHaveBeenCalledWith(
      providerConversationId, expect.any(AbortSignal),
    );
    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('cleans up failed compensation after its provisioning turn is provably abandoned without exposing provider ids', async () => {
    const providerConversationId = 'provider-orphan-conversation-sentinel';
    const cleanupFailure = `delete-failed-for-${providerConversationId}`;
    const logs: Array<Record<string, unknown>> = [];
    let provisioningTurn = turn('agent-turn');
    let pending: { userId: string; turnId: string; conversationId: string } | undefined;
    let cleanupClaimed = false;
    const recordConversationProvisioning = vi.fn(async (input: {
      userId: string; turnId: string; leaseId: string; conversationId: string;
    }) => {
      pending = {
        userId: input.userId,
        turnId: input.turnId,
        conversationId: input.conversationId,
      };
    });
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
      resolveConversationProvisioning,
      getTurnLease: vi.fn(async () => provisioningTurn.status === 'pending' ? {
        userId: USER_ID,
        turnId: provisioningTurn.turnId,
        leaseId: provisioningTurn.leaseId,
        acquiredAt: new Date(timestamp(1)),
        expiresAt: new Date(timestamp(59)),
      } : undefined),
      listAgentTurns: vi.fn(async () => [provisioningTurn]),
      claimConversationProvisioningCleanup: vi.fn(async (userId: string, claimId: string) => {
        if (provisioningTurn.status === 'pending' || !pending || cleanupClaimed || pending.userId !== userId) {
          return undefined;
        }
        cleanupClaimed = true;
        return { ...pending, claimId };
      }),
      completeConversationProvisioningCleanup: vi.fn(async (claim: {
        userId: string; turnId: string; conversationId: string; claimId: string;
      }) => {
        await resolveConversationProvisioning(claim);
        cleanupClaimed = false;
      }),
      releaseConversationProvisioningCleanup: vi.fn(async () => { cleanupClaimed = false; }),
      failAgentTurn: vi.fn(async () => {
        provisioningTurn = {
          ...turn('agent-turn', 'failed'),
          terminalResult: {
            conversationProvisioning: { status: 'pending', conversationId: providerConversationId },
          },
        };
        return provisioningTurn;
      }),
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
    expect(provisioningTurn.status).toBe('failed');
    expect(resolveConversationProvisioning).not.toHaveBeenCalled();

    const firstHistory = await request(app).get('/api/agent/history');
    expect(firstHistory.status).toBe(200);
    expect(firstHistory.body).toEqual({ status: 'empty', messages: [] });
    expect(storage.releaseConversationProvisioningCleanup).toHaveBeenCalledOnce();
    expect(pending).toBeDefined();

    const history = await request(app).get('/api/agent/history');

    expect(history.status).toBe(200);
    expect(history.body).toEqual({ status: 'empty', messages: [] });
    expect(storage.claimConversationProvisioningCleanup).toHaveBeenCalledWith(
      USER_ID, expect.any(String),
    );
    expect(conversationClient.deleteConversation).toHaveBeenNthCalledWith(
      2, providerConversationId, expect.any(AbortSignal),
    );
    expect(storage.completeConversationProvisioningCleanup).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID, turnId: 'agent-turn-turn', conversationId: providerConversationId,
      claimId: expect.any(String),
    }));
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
    let failStarted!: () => void;
    const failStartedGate = new Promise<void>((resolve) => { failStarted = resolve; });
    let releaseFailure!: () => void;
    const failureGate = new Promise<void>((resolve) => { releaseFailure = resolve; });
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'server-conversation'),
      failAgentTurn: vi.fn(async () => {
        failStarted();
        await failureGate;
        return turn('agent-turn', 'failed');
      }),
    });
    const providerError = new Error(SENTINEL);
    providerError.name = SENTINEL;
    const logs: Array<Record<string, unknown>> = [];
    const model = new MockLanguageModelV4({ doStream: errorStream(providerError) as never });
    const responsePromise = Promise.resolve(request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) },
      operationalLog: (entry) => logs.push(entry),
    })).post('/api/agent').send({ id: 'client-message-1', message: 'hello' }));
    let responseSettled = false;
    void responsePromise.finally(() => { responseSettled = true; });
    await failStartedGate;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(responseSettled).toBe(false);
    expect(storage.releaseTurnLease).not.toHaveBeenCalled();
    releaseFailure();
    const response = await responsePromise;

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

  it('aborts provider projection promptly, terminalizes cancellation, and releases before the next turn', async () => {
    let projectionStarted!: () => void;
    const projectionStartedGate = new Promise<void>((resolve) => { projectionStarted = resolve; });
    let projectionSignal: AbortSignal | undefined;
    let listCall = 0;
    const conversationClient = {
      listItems: vi.fn(async (input: { abortSignal?: AbortSignal }) => {
        listCall += 1;
        if (listCall > 1) return { data: [], hasMore: false };
        projectionSignal = input.abortSignal;
        projectionStarted();
        return new Promise<never>((_resolve, reject) => {
          input.abortSignal?.addEventListener('abort', () => reject(input.abortSignal?.reason), { once: true });
        });
      }),
    };
    const storage = createStorage({ getConversationMapping: vi.fn(async () => 'server-conversation') });
    const model = new MockLanguageModelV4({ doStream: textStream('Safe partial reflection.') as never });
    const app = testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      classifyTurn: async () => 'conversation',
      researchProvider: { search: vi.fn(async () => ({ candidates: [] })) }, operationalLog: vi.fn(),
    });
    const outbound = request(app)
      .post('/api/agent')
      .send({ id: 'client-message-1', message: 'Help me reflect.' });
    const settled = Promise.resolve(outbound).catch(() => undefined);
    await projectionStartedGate;
    outbound.abort();
    await settled;

    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());
    expect(projectionSignal?.aborted).toBe(true);
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();

    const next = await request(app)
      .post('/api/agent')
      .send({ id: 'client-message-2', message: 'Continue.' });
    expect(next.status).toBe(200);
    expect(storage.beginAgentTurn).toHaveBeenCalledTimes(2);
    expect(storage.releaseTurnLease).toHaveBeenCalledTimes(2);
  });

  it('captures the cancellation baseline after lease acquisition so a foreign commit is not attributed to this turn', async () => {
    const beforeLease = pendingWhy();
    const foreign = applyCareerMapOperation(beforeLease, {
      type: 'append-foundation-evidence',
      sourceId: 'foreign-operation',
      expectedRevision: beforeLease.revision,
      occurredAt: timestamp(2),
      payload: {
        evidence: {
          id: 'foreign-evidence', revision: 1, category: 'fascination',
          content: 'A separately committed signal.',
          provenance: {
            kind: 'user-message', actionId: 'foreign-message', turnId: 'foreign-turn',
            turnSequence: 2, occurredAt: timestamp(2),
          },
        },
      },
    });
    if (foreign.status !== 'committed') throw new Error('Foreign commit fixture failed.');
    let canonical = beforeLease;
    let persistStarted!: () => void;
    const persistStartedGate = new Promise<void>((resolve) => { persistStarted = resolve; });
    let releasePersist!: () => void;
    const persistGate = new Promise<void>((resolve) => { releasePersist = resolve; });
    const storage = createStorage({
      getOrCreateCareerMap: vi.fn(async () => ({ status: 'ready' as const, map: beforeLease })),
      beginWorkspaceActionTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => {
        canonical = foreign.map;
        return { status: 'started', shouldInvokeModel: true, turn: turn('workspace-action') };
      }),
      loadCareerMap: vi.fn(async () => ({ status: 'ready' as const, map: canonical })),
      persistCareerMapOperation: vi.fn(async () => {
        persistStarted();
        await persistGate;
        return { status: 'rejected' as const, map: canonical, error: { code: 'operation-unavailable' as const } };
      }),
    });
    const outbound = request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true,
      now: () => new Date(timestamp(3)), operationalLog: vi.fn(),
    })).post('/api/agent/workspace/operations').send({
      operationId: 'operation-after-foreign-commit', clientMessageId: 'client-message-1',
      operation: {
        type: 'confirm-why',
        input: {
          whyId: 'why-1', whyRevision: 1,
          presentedInTurnId: 'prior-assistant-turn', sourceMessageId: 'client-message-1',
        },
      },
    });
    const settled = Promise.resolve(outbound).catch(() => undefined);
    await persistStartedGate;
    outbound.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    releasePersist();
    await settled;
    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());

    expect(storage.cancelAgentTurn.mock.calls[0]?.[0]?.result).toMatchObject({
      kind: 'cancelled', revision: foreign.map.revision, operationCommitted: false,
    });
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

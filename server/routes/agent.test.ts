import { readFileSync } from 'node:fs';
import express, { type RequestHandler } from 'express';
import rawRequest from '../test-fixtures/loopback-http.js';
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
import { PURPOSE_PATHS_OFFER_ENGLISH } from '../ai/method/base-instructions.js';
import { OpenAITranscriptionError } from '../ai/transcription.js';
import { createAgentRouter } from './agent.js';

const USER_ID = 'opaque-user-1';
const SENTINEL = 'private-prompt-map-history-source-provider-sentinel';
const METHOD_REQUEST_ORIGIN = 'https://revelio.test';
const WEBM_AUDIO = Buffer.from('1a45dfa39f4286810142f7810142f2810442f381084282847765626d4287810442858102', 'hex');
const MP4_AUDIO = Buffer.from('00000018667479706d7034320000000069736f6d6d703432', 'hex');
const GUARDED_METHOD_POST_PATHS = new Set([
  '/api/agent',
  '/api/agent/workspace/operations',
  '/api/agent/audio/transcribe',
]);
type SupertestRequest = ReturnType<ReturnType<typeof rawRequest>['post']>;
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

function confirmWhyThenTextModel(input: {
  pending: CareerMap['foundation']['whyRevisions'][number];
  callId: string;
  sourceMessageId: string;
  text?: string;
}) {
  let providerCall = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      providerCall += 1;
      if (providerCall === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call', toolCallId: input.callId, toolName: 'confirm_why',
                input: JSON.stringify({
                  whyId: input.pending.id,
                  whyRevision: input.pending.revision,
                  presentedInTurnId: input.pending.presentation.assistantTurnId,
                  sourceMessageId: input.sourceMessageId,
                }),
              },
              { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
            ] as never,
          }),
        };
      }
      return textStream(input.text ?? 'Continued from authoritative state.');
    },
  });
}

const DIRECT_CONTINUATION_TEXT = 'Here is one first project to test this path.';

function proposeFirstProjectThenTextModel(text = DIRECT_CONTINUATION_TEXT) {
  let providerCall = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      providerCall += 1;
      if (providerCall === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call', toolCallId: 'direct-first-project-call', toolName: 'propose_first_project',
                input: JSON.stringify({
                  id: 'direct-project-1', revision: 1, briefFormat: 'simple-v1',
                  title: 'Test the selected path',
                  learningGoal: 'Learn whether this work creates voluntary pull',
                  firstVersion: 'One small useful version',
                  firstStep: 'Ask one person what would help most',
                }),
              },
              { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
            ] as never,
          }),
        };
      }
      return textStream(text);
    },
  });
}

function directContinuationProvider(text = DIRECT_CONTINUATION_TEXT) {
  return {
    model: proposeFirstProjectThenTextModel(text),
    conversationClient: {
      listItems: vi.fn(async () => ({
        data: [{
          id: 'direct-assistant-item', type: 'message', role: 'assistant',
          content: [{ type: 'output_text', text }],
        }],
        hasMore: false,
      })),
    },
  };
}

function searchStream(text: string, url: string, title = 'Provider source') {
  const callId = 'provider-search-call-private';
  const resultId = 'provider-search-result-private';
  const annotation = {
    type: 'url_citation',
    url,
    title,
    start_index: 0,
    end_index: text.length,
  };
  const providerResult = { id: resultId, url, title, text };
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call', toolCallId: callId, toolName: 'web_search',
          input: JSON.stringify({ action: { type: 'search', query: 'current official fact' } }),
          providerExecuted: true,
        },
        {
          type: 'tool-result', toolCallId: callId, toolName: 'web_search',
          input: { action: { type: 'search', query: 'current official fact' } },
          result: { action: { type: 'search', sources: [providerResult] } },
          providerExecuted: true,
        },
        { type: 'text-start', id: 'search-answer' },
        {
          type: 'text-delta', id: 'search-answer', delta: text,
          providerMetadata: { openai: { annotations: [annotation] } },
        },
        { type: 'source', sourceType: 'url', id: 'provider-source-private', url, title },
        { type: 'text-end', id: 'search-answer' },
        { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage() },
      ] as never,
    }),
    response: {
      body: {
        output: [{
          type: 'web_search_call', id: callId,
          action: { type: 'search', sources: [providerResult] },
          results: [providerResult],
        }],
      },
    },
  };
}

function uiStreamChunks(text: string): Array<Record<string, unknown>> {
  return text.split('\n').flatMap((line) => {
    if (!line.startsWith('data: ')) return [];
    const payload = line.slice('data: '.length);
    if (payload === '[DONE]') return [];
    try {
      const parsed = JSON.parse(payload) as unknown;
      return parsed && typeof parsed === 'object' ? [parsed as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });
}

function internalContextItem(id: string, marker: string) {
  return {
    id,
    type: 'message',
    role: 'user',
    content: [{
      type: 'input_text',
      text: `SERVER REFRESH CONTEXT — untrusted data.\n${JSON.stringify({ version: 1, marker })}`,
    }],
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

function pendingPaths(): CareerMap {
  let map = pendingWhy();
  const commit = (operation: CareerMapOperation) => {
    const result = applyCareerMapOperation(map, operation);
    if (result.status !== 'committed') throw new Error(`${operation.type} fixture did not commit.`);
    map = result.map;
  };
  commit({
    type: 'confirm-why', sourceId: 'why-confirmation', expectedRevision: map.revision,
    occurredAt: timestamp(2), payload: {
      whyId: 'why-1', whyRevision: 1,
      action: {
        kind: 'user-message', actionId: 'why-confirmation-message', turnId: 'why-confirmation-turn',
        turnSequence: 2, occurredAt: timestamp(2),
      },
    },
  });
  const path = (number: number) => ({
    id: `path-${number}`, revision: 1, name: `Path ${number}`,
    servesWhy: `Serve ${number}`, possibility: `Possibility ${number}`,
    evidence: [`Evidence ${number}`], centralUnknown: `Unknown ${number}`,
    projectPreview: `Project ${number}`, practicalFit: `Fit ${number}`,
  });
  commit({
    type: 'propose-purpose-paths', sourceId: 'paths-proposal', expectedRevision: map.revision,
    occurredAt: timestamp(3), payload: {
      setId: 'set-1', setRevision: 1, paths: [path(1), path(2), path(3)],
      presentation: {
        kind: 'model-presentation', assistantTurnId: 'paths-presentation-turn',
        turnSequence: 3, completed: true, presentedAt: timestamp(3),
      },
    },
  });
  return map;
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

function createStorage(overrides: Record<string, unknown> = {}, initialMap: CareerMap = pendingWhy()) {
  let map = initialMap;
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
    ...overrides,
  };
  return storage as typeof storage & IStorage;
}

function completedPathPresentationTurn(): AgentTurnRecord {
  return {
    ...turn('agent-turn', 'completed'),
    turnId: 'paths-presentation-turn',
    terminalResult: { kind: 'completed', refetch: true },
  };
}

function createPathSelectionStorage(overrides: Record<string, unknown> = {}) {
  return createStorage({
    getConversationMapping: vi.fn(async () => 'conversation-for-authenticated-owner'),
    listAgentTurns: vi.fn(async () => [completedPathPresentationTurn()]),
    ...overrides,
  }, pendingPaths());
}

function selectPurposePathRequest(input: {
  operationId: string;
  clientMessageId?: string;
  expectedRevision?: number;
}) {
  const clientMessageId = input.clientMessageId ?? 'client-message-1';
  return {
    operationId: input.operationId,
    clientMessageId,
    expectedRevision: input.expectedRevision ?? 3,
    operation: {
      type: 'select-purpose-path',
      input: {
        setId: 'set-1', setRevision: 1,
        pathId: 'path-1', pathRevision: 1,
        presentedInTurnId: 'paths-presentation-turn', sourceMessageId: clientMessageId,
      },
    },
  };
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
  const defaultMarker = (responseIndex: number) => `test-context-${responseIndex}`;
  const marker = input.internalContextMarker ?? defaultMarker;
  const conversationClient = input.conversationClient && !input.internalContextMarker
    ? {
        ...input.conversationClient,
        listItems: async (request: Parameters<typeof input.conversationClient.listItems>[0]) => {
          const page = await input.conversationClient!.listItems(request);
          if (request.order !== 'desc' || request.limit !== 100) return page;
          return {
            ...page,
            data: [
              ...page.data,
              ...Array.from({ length: 20 }, (_, index) => (
                internalContextItem(`test-internal-context-${index}`, defaultMarker(index))
              )),
            ],
          };
        },
      }
    : input.conversationClient;
  app.use(express.json());
  app.use('/api/agent', routerFactory({
    methodRequestOrigin: METHOD_REQUEST_ORIGIN,
    ...input,
    internalContextMarker: marker,
    ...(conversationClient ? { conversationClient } : {}),
  }));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(413).json({ error: 'Agent request failed', errorClass: error instanceof Error ? error.name : 'Error' });
  });
  return app;
}

/**
 * Successful custom Method POSTs always exercise the browser integrity
 * contract. Security-negative cases use rawRequest so each missing or invalid
 * header remains explicit at the call site.
 */
async function request(app: express.Express) {
  const client = (await rawRequest(app));
  return {
    get: (path: string) => client.get(path),
    post: (path: string) => {
      const pending = client.post(path);
      return GUARDED_METHOD_POST_PATHS.has(path.split('?')[0] ?? path)
        ? pending
            .set('Origin', METHOD_REQUEST_ORIGIN)
            .set('X-Revelio-Request', '1')
            .set('Content-Type', path.includes('/audio/transcribe') ? 'audio/webm' : 'application/json')
        : pending;
    },
  };
}

describe('protected Method routes', () => {
  it('emits opt-in numeric latency data without private request or provider text', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('REVELIO_LATENCY_TRACE', '1');
    try {
      const logs: Array<Record<string, unknown>> = [];
      const response = await (await request(testApp({
        storage: createStorage({ getConversationMapping: vi.fn(async () => 'latency-conversation') }),
        requireAuth: authenticated,
        agentEnabled: true,
        model: new MockLanguageModelV4({ doStream: textStream(SENTINEL) as never }),
        conversationClient: {
          listItems: vi.fn(async () => ({
            data: [internalContextItem('latency-context', 'latency-marker')],
            hasMore: false,
          })),
        },
        internalContextMarker: () => 'latency-marker',
        operationalLog: (entry) => logs.push(entry),
      }))).post('/api/agent').send({ id: 'latency-client-message', message: SENTINEL });

      expect(response.status).toBe(200);
      const latency = logs.at(-1)?.latency as Record<string, unknown>;
      expect(latency).toMatchObject({
        mapReadyMs: expect.any(Number),
        leaseReadyMs: expect.any(Number),
        providerStartMs: expect.any(Number),
        safeTextMs: expect.any(Number),
        terminalStartMs: expect.any(Number),
        terminalDoneMs: expect.any(Number),
        steps: expect.any(Array),
      });
      expect(JSON.stringify(logs)).not.toContain(SENTINEL);
      expect(JSON.stringify(logs)).not.toContain('latency-conversation');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('binds a revised path offer to its concise provider acknowledgement', async () => {
    const map = pendingPaths();
    const original = map.pathSets[0].paths;
    const toInput = ({ selection: _selection, equalWeight: _equalWeight, possibility: _legacyPossibility, ...path }: typeof original[number]) => path;
    const rawReply = 'I revised the paths. Which one would you choose?';
    const userText = 'Revise paths one and three, and show the full set.';
    let providerCall = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        providerCall += 1;
        if (providerCall === 1) return {
          stream: simulateReadableStream({ chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'tool-call', toolCallId: 'revise-two-paths', toolName: 'revise_purpose_paths', input: JSON.stringify({
              replacementSetId: 'set-2', replacementSetRevision: 1,
              paths: [
                { ...toInput(original[0]), id: 'path-4', name: 'RL research' },
                toInput(original[1]),
                { ...toInput(original[2]), id: 'path-5', name: 'Interactive AI art' },
              ],
            }) },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
          ] as never }),
        };
        return textStream(rawReply);
      },
    });
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'revised-paths-conversation'),
      listAgentTurns: vi.fn(async () => [completedPathPresentationTurn()]),
    }, map);
    const conversationClient = { listItems: vi.fn(async () => ({
      data: [
        { id: 'revision-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: rawReply }] },
        { id: 'revision-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: userText }] },
      ],
      hasMore: false,
    })) };
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      now: () => new Date(timestamp(4)), operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: userText });

    expect(response.status).toBe(200);
    expect(response.text).not.toContain(PURPOSE_PATHS_OFFER_ENGLISH);
    expect(response.text).toContain(rawReply);
    expect(storage.completeAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({
        canonicalPurposePathsOffer: true,
        displayProjection: { userItemId: 'revision-user', assistantItemIds: ['revision-assistant'] },
      }),
    }));
    expect((await storage.loadCareerMap(USER_ID)).map.pathSets).toHaveLength(2);
  });

  it('fails a truncated path offer after saving cards without completing or showing partial prose', async () => {
    const map = pendingPaths();
    const original = map.pathSets[0].paths;
    const toInput = ({ selection: _selection, equalWeight: _equalWeight, possibility: _legacyPossibility, ...path }: typeof original[number]) => path;
    const partialReply = 'Here are the revised paths, and the first';
    let providerCall = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        providerCall += 1;
        if (providerCall === 1) return {
          stream: simulateReadableStream({ chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'tool-call', toolCallId: 'revise-truncated-paths', toolName: 'revise_purpose_paths', input: JSON.stringify({
              replacementSetId: 'set-2', replacementSetRevision: 1,
              paths: [
                { ...toInput(original[0]), id: 'path-4', name: 'RL research' },
                toInput(original[1]),
                { ...toInput(original[2]), id: 'path-5', name: 'Interactive AI art' },
              ],
            }) },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
          ] as never }),
        };
        return { stream: simulateReadableStream({ chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'partial' },
          { type: 'text-delta', id: 'partial', delta: partialReply },
          { type: 'text-end', id: 'partial' },
          { type: 'finish', finishReason: { unified: 'length', raw: 'max_output_tokens' }, usage: usage() },
        ] as never }) };
      },
    });
    const storage = createStorage({ getConversationMapping: vi.fn(async () => 'truncated-paths-conversation') }, map);
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
      now: () => new Date(timestamp(4)), operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'Revise paths one and three.' });

    expect(response.status).toBe(200);
    expect(uiStreamChunks(response.text)).toContainEqual(expect.objectContaining({ type: 'error' }));
    expect(response.text).not.toContain(partialReply);
    expect(response.text).not.toContain(PURPOSE_PATHS_OFFER_ENGLISH);
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ operationCommitted: true }),
    }));
    expect((await storage.loadCareerMap(USER_ID)).map.pathSets).toHaveLength(2);
  });

  it('does not construct or persist a research ledger for ordinary cited conversation', () => {
    const source = readFileSync(new URL('./agent.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/createNativeSearchEvidenceLedger|recordResearchAttempt/);
  });

  describe('custom POST request integrity', () => {
    const agentBody = { id: 'client-message-1', message: 'hello' };
    const operationBody = selectPurposePathRequest({ operationId: 'operation-1' });

    it.each([
      ['agent', '/api/agent', agentBody],
      ['workspace operation', '/api/agent/workspace/operations', operationBody],
    ] as const)('rejects invalid browser integrity metadata before auth on the %s route', async (_label, path, body) => {
      const cases = [
        {
          label: 'missing origin',
          apply: (pending: SupertestRequest) => pending,
        },
        {
          label: 'malformed origin',
          apply: (pending: SupertestRequest) => pending.set('Origin', 'not-an-origin'),
        },
        {
          label: 'origin with a path',
          apply: (pending: SupertestRequest) => pending.set('Origin', `${METHOD_REQUEST_ORIGIN}/not-an-origin`),
        },
        {
          label: 'cross origin',
          apply: (pending: SupertestRequest) => pending.set('Origin', 'https://attacker.example'),
        },
        {
          label: 'sibling Vercel origin',
          apply: (pending: SupertestRequest) => pending.set('Origin', 'https://revelio-me-git-feature.vercel.app'),
        },
        {
          label: 'missing custom header',
          apply: (pending: SupertestRequest) => pending.set('Origin', METHOD_REQUEST_ORIGIN),
        },
        {
          label: 'invalid custom header',
          apply: (pending: SupertestRequest) => pending
            .set('Origin', METHOD_REQUEST_ORIGIN)
            .set('X-Revelio-Request', 'true'),
        },
      ];

      for (const testCase of cases) {
        const requireAuth = vi.fn((_request: express.Request, response: express.Response) => {
          response.status(401).json({ error: 'Authentication required' });
        });
        const operationalLog = vi.fn();
        const storage = createStorage();
        const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });
        const app = testApp({
          storage,
          requireAuth,
          agentEnabled: true,
          model,
          operationalLog,
        });
        const pending = testCase.apply((await rawRequest(app))
          .post(path)
          .set('Content-Type', 'application/json'));
        const response = await pending.send(body);

        expect(response.status, testCase.label).toBe(403);
        expect(requireAuth, testCase.label).not.toHaveBeenCalled();
        expect(operationalLog, testCase.label).not.toHaveBeenCalled();
        expect(storage.getOrCreateCareerMap, testCase.label).not.toHaveBeenCalled();
        expect(storage.beginAgentTurn, testCase.label).not.toHaveBeenCalled();
        expect(storage.beginWorkspaceActionTurn, testCase.label).not.toHaveBeenCalled();
        expect(storage.persistCareerMapOperation, testCase.label).not.toHaveBeenCalled();
        expect(model.doStreamCalls, testCase.label).toHaveLength(0);
      }
    });

    it.each([
      ['missing origin', (pending: SupertestRequest) => pending
        .set('X-Revelio-Request', '1').set('Content-Type', 'audio/webm'), 403],
      ['malformed origin', (pending: SupertestRequest) => pending
        .set('Origin', 'not-an-origin').set('X-Revelio-Request', '1').set('Content-Type', 'audio/webm'), 403],
      ['origin path', (pending: SupertestRequest) => pending
        .set('Origin', `${METHOD_REQUEST_ORIGIN}/path`).set('X-Revelio-Request', '1').set('Content-Type', 'audio/webm'), 403],
      ['sibling origin', (pending: SupertestRequest) => pending
        .set('Origin', 'https://revelio-me-git-feature.vercel.app').set('X-Revelio-Request', '1').set('Content-Type', 'audio/webm'), 403],
      ['cross origin', (pending: SupertestRequest) => pending
        .set('Origin', 'https://attacker.example').set('X-Revelio-Request', '1').set('Content-Type', 'audio/webm'), 403],
      ['missing Method header', (pending: SupertestRequest) => pending
        .set('Origin', METHOD_REQUEST_ORIGIN).set('Content-Type', 'audio/webm'), 403],
      ['invalid Method header', (pending: SupertestRequest) => pending
        .set('Origin', METHOD_REQUEST_ORIGIN).set('X-Revelio-Request', 'true').set('Content-Type', 'audio/webm'), 403],
      ['unsupported media', (pending: SupertestRequest) => pending
        .set('Origin', METHOD_REQUEST_ORIGIN).set('X-Revelio-Request', '1').set('Content-Type', 'audio/mpeg'), 400],
      ['unsupported WebM codec', (pending: SupertestRequest) => pending
        .set('Origin', METHOD_REQUEST_ORIGIN).set('X-Revelio-Request', '1').set('Content-Type', 'audio/webm; codecs=vorbis'), 400],
    ] as const)('rejects %s audio metadata before auth, logging, parsing, or provider work', async (
      _label, apply, status,
    ) => {
      const requireAuth = vi.fn();
      const operationalLog = vi.fn();
      const transcribeAudio = vi.fn();
      const app = testApp({
        storage: createStorage(), requireAuth, agentEnabled: true, transcribeAudio, operationalLog,
      });
      const response = await apply((await rawRequest(app)).post('/api/agent/audio/transcribe')).send(WEBM_AUDIO);

      expect(response.status).toBe(status);
      expect(requireAuth).not.toHaveBeenCalled();
      expect(operationalLog).not.toHaveBeenCalled();
      expect(transcribeAudio).not.toHaveBeenCalled();
    });

    it('exposes no credentialed preflight on the audio route', async () => {
      const requireAuth = vi.fn();
      const operationalLog = vi.fn();
      const transcribeAudio = vi.fn();
      const app = testApp({
        storage: createStorage(), requireAuth, agentEnabled: true, transcribeAudio, operationalLog,
      });
      const preflight = await (await rawRequest(app))
        .options('/api/agent/audio/transcribe')
        .set('Origin', METHOD_REQUEST_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');
      expect(preflight.status).toBe(405);
      expect(requireAuth).not.toHaveBeenCalled();
      expect(operationalLog).not.toHaveBeenCalled();
      expect(transcribeAudio).not.toHaveBeenCalled();
    });

    it.each([
      '/api/agent/workspace/operations/',
      '/api/agent/WORKSPACE/OPERATIONS',
    ])('does not allow Express path normalization to bypass the POST guard for %s', async (path) => {
      const requireAuth = vi.fn((_request: express.Request, response: express.Response) => {
        response.status(401).end();
      });
      const storage = createStorage();
      const response = await (await rawRequest(testApp({
        storage,
        requireAuth,
        agentEnabled: true,
        operationalLog: vi.fn(),
      })))
        .post(path)
        .set('Content-Type', 'application/json')
        .send(operationBody);

      expect(response.status).toBe(403);
      expect(requireAuth).not.toHaveBeenCalled();
      expect(storage.beginWorkspaceActionTurn).not.toHaveBeenCalled();
      expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
    });

    it.each([
      ['agent', '/api/agent', agentBody],
      ['workspace operation', '/api/agent/workspace/operations', operationBody],
    ] as const)('rejects non-JSON bodies before auth on the %s route', async (_label, path, body) => {
      const requireAuth = vi.fn((_request: express.Request, response: express.Response) => {
        response.status(401).json({ error: 'Authentication required' });
      });
      const operationalLog = vi.fn();
      const storage = createStorage();
      const response = await (await rawRequest(testApp({
        storage,
        requireAuth,
        agentEnabled: true,
        operationalLog,
      })))
        .post(path)
        .set('Origin', METHOD_REQUEST_ORIGIN)
        .set('X-Revelio-Request', '1')
        .type('form')
        .send(body);

      expect(response.status).toBe(415);
      expect(requireAuth).not.toHaveBeenCalled();
      expect(operationalLog).not.toHaveBeenCalled();
      expect(storage.getOrCreateCareerMap).not.toHaveBeenCalled();
      expect(storage.beginAgentTurn).not.toHaveBeenCalled();
      expect(storage.beginWorkspaceActionTurn).not.toHaveBeenCalled();
      expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
    });

    it.each([
      ['agent', '/api/agent'],
      ['workspace operation', '/api/agent/workspace/operations'],
    ] as const)('exposes no credentialed CORS preflight on the %s route', async (_label, path) => {
      const requireAuth = vi.fn((_request: express.Request, response: express.Response) => {
        response.status(401).end();
      });
      const operationalLog = vi.fn();
      const storage = createStorage();
      const response = await (await rawRequest(testApp({
        storage,
        requireAuth,
        agentEnabled: true,
        operationalLog,
      })))
        .options(path)
        .set('Origin', 'https://revelio-me-git-feature.vercel.app')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-revelio-request')
        .set('Cookie', 'better-auth.session_token=opaque');

      expect(response.status).toBe(405);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
      expect(requireAuth).not.toHaveBeenCalled();
      expect(operationalLog).not.toHaveBeenCalled();
      expect(storage.getOrCreateCareerMap).not.toHaveBeenCalled();
      expect(storage.beginAgentTurn).not.toHaveBeenCalled();
      expect(storage.beginWorkspaceActionTurn).not.toHaveBeenCalled();
    });
  });

  it('requires a server session before reading or mutating Method state', async () => {
    const storage = createStorage();
    const app = testApp({ storage, requireAuth: unauthenticated, agentEnabled: true, operationalLog: vi.fn() });

    const responses = await Promise.all([
      (await request(app)).get('/api/agent/workspace'),
      (await request(app)).get('/api/agent/history'),
      (await request(app)).post('/api/agent').send({ id: 'message', message: 'hello' }),
      (await request(app)).post('/api/agent/workspace/operations').send({}),
      (await request(app)).post('/api/agent/audio/transcribe').send(WEBM_AUDIO),
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

      const workspace = await (await request(app)).get('/api/agent/workspace');
      const history = await (await request(app)).get('/api/agent/history');
      const agent = await (await request(app)).post('/api/agent').send({ id: 'message', message: SENTINEL });
      const operation = await (await request(app)).post('/api/agent/workspace/operations').send(
        selectPurposePathRequest({
          operationId: 'operation-disabled-flag', clientMessageId: 'message-disabled-flag',
        }),
      );
      const audio = await (await request(app)).post('/api/agent/audio/transcribe').send(WEBM_AUDIO);

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
          { id: 'mapped-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: assistantText }] },
          { id: 'mapped-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: userText }] },
        ],
        hasMore: false,
      })),
    };

    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: false, conversationClient, operationalLog: vi.fn(),
    }))).get('/api/agent/history');

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
    const workspace = await (await request(app)).get('/api/agent/workspace');
    const oversized = await (await request(app)).post('/api/agent').send({
      id: 'client-message-1', message: 'x'.repeat(12_001),
    });
    expect(workspace.body).toEqual({ status: 'empty', map: null });
    expect(oversized.status).toBe(400);
    expect(storage.getOrCreateCareerMap).not.toHaveBeenCalled();
    expect(storage.beginAgentTurn).not.toHaveBeenCalled();
  });

  it('processes a complete parsed request when Node marks only the consumed request stream destroyed', async () => {
    const storage = createStorage({
      beginAgentTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'terminal',
        shouldInvokeModel: false,
        turn: turn('agent-turn', 'completed'),
      })),
    });
    const consumedBodyAuthenticated: RequestHandler = (request, response, next) => {
      Object.defineProperty(request, 'destroyed', { configurable: true, value: true });
      authenticated(request, response, next);
    };

    const response = await (await request(testApp({
      storage,
      requireAuth: consumedBodyAuthenticated,
      agentEnabled: true,
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed-replay');
    expect(storage.getOrCreateCareerMap).toHaveBeenCalledOnce();
    expect(storage.beginAgentTurn).toHaveBeenCalledOnce();
  });

  it('processes a workspace operation when Node marks only the consumed request stream destroyed', async () => {
    const operationEnvelope = {
      status: 'committed', operation: 'select-purpose-path', authoritativeRevision: 4,
      derivedModule: 'design-path-project', pendingDecision: null,
    };
    const storage = createPathSelectionStorage({
      beginWorkspaceActionTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'terminal', shouldInvokeModel: false,
        turn: {
          ...turn('workspace-action', 'completed'),
          terminalResult: { kind: 'workspace-result', refetch: true, operationEnvelope },
        },
      })),
    });
    const consumedBodyAuthenticated: RequestHandler = (request, response, next) => {
      Object.defineProperty(request, 'destroyed', { configurable: true, value: true });
      authenticated(request, response, next);
    };

    const response = await (await request(testApp({
      storage,
      requireAuth: consumedBodyAuthenticated,
      agentEnabled: true,
      operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send(
      selectPurposePathRequest({ operationId: 'operation-replay' }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...operationEnvelope, turnStatus: 'completed', replay: true });
    expect(storage.getOrCreateCareerMap).toHaveBeenCalledOnce();
    expect(storage.beginWorkspaceActionTurn).toHaveBeenCalledOnce();
  });

  it.each(['request-aborted', 'response-destroyed'] as const)(
    'does not begin agent work for a genuinely disconnected %s request',
    async (disconnectState) => {
      const storage = createStorage();
      const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });
      const disconnectedAuthenticated: RequestHandler = (request, response, next) => {
        if (disconnectState === 'request-aborted') {
          Object.defineProperty(request, 'aborted', { configurable: true, value: true });
          authenticated(request, response, next);
          setImmediate(() => response.destroy());
          return;
        }
        response.destroy();
        authenticated(request, response, next);
      };

      await Promise.resolve((await request(testApp({
        storage,
        requireAuth: disconnectedAuthenticated,
        agentEnabled: true,
        model,
        operationalLog: vi.fn(),
      }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' })).catch(() => undefined);

      expect(storage.getOrCreateCareerMap).not.toHaveBeenCalled();
      expect(storage.beginAgentTurn).not.toHaveBeenCalled();
      expect(model.doStreamCalls).toHaveLength(0);
    },
  );

  it('rejects newline-bearing client message ids before the durable turn or provider boundary', async () => {
    const clientIdSentinel = 'PRIVATE_CLIENT_ID_SENTINEL';
    const logs: Array<Record<string, unknown>> = [];
    const storage = createPathSelectionStorage();
    const model = new MockLanguageModelV4({ doStream: textStream('must not run') as never });
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      operationalLog: (entry) => logs.push(entry),
    }))).post('/api/agent').send({
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
    const response = await (await request(testApp({
      storage: createStorage(), requireAuth: authenticated, agentEnabled: true,
      operationalLog: (entry) => logs.push(entry),
    }))).get(`/api/agent/${pathSentinel}`);

    expect(response.status).toBe(404);
    expect(logs.at(-1)).toMatchObject({ route: 'method-unmatched', status: 404 });
    expect(JSON.stringify(logs)).not.toContain(pathSentinel);
  });

  it('executes workspace operations through the shared reducer with server provenance', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const storage = createPathSelectionStorage();
    const continuation = directContinuationProvider('Aquí tienes un primer proyecto para probar este camino.');
    const app = testApp({
      storage,
      ...continuation,
      requireAuth: authenticated,
      agentEnabled: true,
      id: (() => {
        const ids = ['request-1', 'workspace-turn', 'workspace-lease'];
        return () => ids.shift() ?? 'extra-id';
      })(),
      now: () => new Date(timestamp(3)),
      operationalLog: (entry) => logs.push(entry),
    });
    const response = await (await request(app))
      .post('/api/agent/workspace/operations')
      .set('x-user-id', 'spoofed-user')
      .send(selectPurposePathRequest({ operationId: 'operation-1' }));

    expect(response.status, JSON.stringify({ body: response.body, logs })).toBe(200);
    expect(response.text).toContain('Aquí tienes un primer proyecto');
    expect(continuation.model.doStreamCalls).toHaveLength(2);
    expect(continuation.model.doStreamCalls.every((call) => (
      call.providerOptions?.openai?.conversation === 'conversation-for-authenticated-owner'
    ))).toBe(true);
    const providerPrompt = JSON.stringify(continuation.model.doStreamCalls.map((call) => call.prompt));
    expect(providerPrompt).not.toContain('SERVER DIRECT CONTINUATION SEED');
    expect(providerPrompt).not.toContain('Start this path');
    expect(storage.persistCareerMapOperation).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }));
    expect(storage.completeAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({
        kind: 'workspace-result',
        operationEnvelope: expect.objectContaining({
          status: 'committed', operation: 'select-purpose-path', authoritativeRevision: 4,
        }),
        assistantDisplayProjection: { assistantItemIds: ['direct-assistant-item'] },
      }),
    }));
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
    expect(logs.at(-1)).toMatchObject({
      route: 'workspace-operation',
      status: 200,
      operationId: expect.stringMatching(/^op_[a-f0-9]{16}$/),
      revision: 5,
    });
  });

  it('keeps the selected path authoritative when its streamed project reply fails', async () => {
    const providerFailure = new Error('private direct continuation failure');
    const model = new MockLanguageModelV4({ doStream: errorStream(providerFailure) as never });
    const storage = createPathSelectionStorage();
    const response = await (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      conversationClient: {
        listItems: vi.fn(async () => ({ data: [], hasMore: false })),
      },
      operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send(
      selectPurposePathRequest({ operationId: 'operation-reply-failure' }),
    );

    expect(response.status).toBe(200);
    expect(response.text).toContain('The agent request failed.');
    expect(model.doStreamCalls).toHaveLength(1);
    expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ operationCommitted: true, revision: 4 }),
    }));
    expect((await storage.loadCareerMap(USER_ID)).status).toBe('ready');
    const canonical = await storage.loadCareerMap(USER_ID);
    expect(canonical.status === 'ready' ? canonical.map.pathSets.at(-1)?.paths[0]?.selection : null)
      .toBe('active');
  });

  it('retries direct-continuation lease release after a transient release error', async () => {
    const storage = createPathSelectionStorage({
      releaseTurnLease: vi.fn()
        .mockRejectedValueOnce(new Error('transient release failure'))
        .mockResolvedValueOnce(true),
    });
    const continuation = directContinuationProvider('Here is a first project for this path.');
    const response = await (await request(testApp({
      storage,
      ...continuation,
      requireAuth: authenticated,
      agentEnabled: true,
      operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send(
      selectPurposePathRequest({ operationId: 'operation-release-retry' }),
    );

    expect(response.status).toBe(200);
    expect(storage.releaseTurnLease).toHaveBeenCalledTimes(2);
  });

  it('keeps first-project framing and acceptance conversation-only at the workspace route boundary', async () => {
    const storage = createPathSelectionStorage();
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send({
      operationId: 'workspace-project-acceptance',
      clientMessageId: 'client-message-1',
      expectedRevision: 1,
      operation: {
        type: 'accept-first-project',
        input: {
          projectId: 'project-1', projectRevision: 1,
          presentedInTurnId: 'prior-assistant-turn', sourceMessageId: 'client-message-1',
        },
      },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ errorClass: 'ValidationError' });
    expect(storage.beginWorkspaceActionTurn).not.toHaveBeenCalled();
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
  });

  it('rejects a stale workspace revision before persisting the operation', async () => {
    const storage = createPathSelectionStorage();
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true,
      now: () => new Date(timestamp(3)), operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send(selectPurposePathRequest({
      operationId: 'operation-stale-revision',
      clientMessageId: 'message-stale-revision',
      expectedRevision: 2,
    }));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      status: 'conflict', authoritativeRevision: 3,
      errorClass: 'revision-conflict', retryable: true,
    });
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
    expect(storage.completeAgentTurn).toHaveBeenCalledOnce();
  });

  it('derives a workspace action sequence after the canonical presentation despite clock skew', async () => {
    const skewed = pendingPaths();
    const pending = skewed.pathSets.at(-1)!;
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
      listAgentTurns: vi.fn(async () => [completedPathPresentationTurn()]),
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
      getConversationMapping: vi.fn(async () => 'conversation-for-authenticated-owner'),
    });

    const response = await (await request(testApp({
      storage, ...directContinuationProvider(), requireAuth: authenticated, agentEnabled: true,
      now: () => new Date(timestamp(1)), operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send(selectPurposePathRequest({
      operationId: 'operation-clock-skew-select',
      clientMessageId: 'message-clock-skew-select',
      expectedRevision: skewed.revision,
    }));

    expect(response.status).toBe(200);
    expect(response.text).toContain(DIRECT_CONTINUATION_TEXT);
    expect(map.pathSets.at(-1)?.paths[0]?.selection).toBe('active');
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
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      now: () => fixedNow,
      conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({
      id: 'message-same-time-confirm',
      message: 'That feels exactly right.',
    });

    expect(response.status).toBe(200);
    expect(map.foundation.whyRevisions.at(-1)?.status).toBe('confirmed');
    expect(storage.persistCareerMapOperation).toHaveBeenCalledOnce();
    const statuses = uiStreamChunks(response.text)
      .filter((chunk) => chunk.type === 'data-operation-status')
      .map((chunk) => chunk.data);
    expect(statuses).toEqual([
      expect.objectContaining({ status: 'Saving', sequence: 0, authoritativeRevision: null }),
      expect.objectContaining({ status: 'Saved', sequence: 1, authoritativeRevision: 2 }),
    ]);
    expect(response.text).not.toContain('same-time-confirm-call');
  });

  it('scopes reused provider tool-call ids to their exact durable turns', async () => {
    const rawProviderCallId = 'provider-reused-call-id';
    const pending = pendingWhy().foundation.whyRevisions.at(-1)!;
    const storage = createStorage({
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
      getConversationMapping: vi.fn(async () => 'server-conversation-reused-call-id'),
    });
    const path = (number: number) => ({
      id: `reused-path-${number}`, revision: 1, name: `Path ${number}`,
      servesWhy: `Serve ${number}`,
      evidence: [`Evidence ${number}`], centralUnknown: `Unknown ${number}`,
      projectPreview: `Project ${number}`, practicalFit: `Fit ${number}`,
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
                  type: 'tool-call', toolCallId: rawProviderCallId, toolName: 'confirm_why',
                  input: JSON.stringify({
                    whyId: pending.id, whyRevision: pending.revision,
                    presentedInTurnId: pending.presentation.assistantTurnId,
                    sourceMessageId: 'correlation-message-1',
                  }),
                },
                { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
              ] as never,
            }),
          };
        }
        if (providerCall === 2) return textStream('Your North Star is confirmed.');
        if (providerCall === 3) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                {
                  type: 'tool-call', toolCallId: rawProviderCallId, toolName: 'propose_purpose_paths',
                  input: JSON.stringify({
                    setId: 'reused-set-1', setRevision: 1,
                    paths: [path(1), path(2), path(3)],
                  }),
                },
                { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
              ] as never,
            }),
          };
        }
        return textStream('Three paths are ready.');
      },
    });
    let idSequence = 0;
    const app = testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      id: () => `correlation-id-${++idSequence}`,
      conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
      operationalLog: vi.fn(),
    });

    const first = await (await request(app)).post('/api/agent').send({
      id: 'correlation-message-1', message: 'That feels exactly right.',
    });
    const second = await (await request(app)).post('/api/agent').send({
      id: 'correlation-message-2', message: 'Now propose three Purpose Paths.',
    });
    const lifecycleFor = (response: typeof first) => uiStreamChunks(response.text)
      .filter((chunk) => chunk.type === 'data-operation-status')
      .map((chunk) => chunk.data as Record<string, unknown>);
    const firstLifecycle = lifecycleFor(first);
    const secondLifecycle = lifecycleFor(second);
    const firstOperationId = firstLifecycle[0]?.operationId;
    const secondOperationId = secondLifecycle[0]?.operationId;
    const [firstBegin, secondBegin] = storage.beginAgentTurn.mock.calls.map((call) => call[0]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstLifecycle).toHaveLength(2);
    expect(secondLifecycle).toHaveLength(2);
    expect(firstLifecycle).toEqual(firstLifecycle.map((event) => expect.objectContaining({
      turnId: firstBegin?.turnId, messageId: 'correlation-message-1', operationId: firstOperationId,
    })));
    expect(secondLifecycle).toEqual(secondLifecycle.map((event) => expect.objectContaining({
      turnId: secondBegin?.turnId, messageId: 'correlation-message-2', operationId: secondOperationId,
    })));
    expect(secondBegin?.turnId).not.toBe(firstBegin?.turnId);
    expect(firstOperationId).toMatch(/^op_[a-f0-9]{16}$/);
    expect(secondOperationId).toMatch(/^op_[a-f0-9]{16}$/);
    expect(secondOperationId).not.toBe(firstOperationId);
    expect(storage.persistCareerMapOperation.mock.calls.map((call) => call[0].operation.sourceId))
      .toEqual([firstOperationId, secondOperationId]);
    expect(`${first.text}${second.text}`).not.toContain(rawProviderCallId);
  });

  it('keeps Saved while a later narration failure persists canonical recovery and internal item ids', async () => {
    const fixedNow = new Date(timestamp(2));
    const pending = pendingWhy().foundation.whyRevisions.at(-1)!;
    let failedTurn: AgentTurnRecord | undefined;
    let beginCount = 0;
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'saved-failure-conversation'),
    });
    storage.beginAgentTurn.mockImplementation(async () => {
      beginCount += 1;
      return beginCount === 1
        ? { status: 'started', shouldInvokeModel: true, turn: turn('agent-turn') }
        : { status: 'terminal', shouldInvokeModel: false, turn: failedTurn! };
    });
    storage.failAgentTurn.mockImplementation(async (input: {
      errorClass: string;
      result?: Record<string, unknown>;
    }) => {
      failedTurn = {
        ...turn('agent-turn', 'failed'),
        terminalResult: {
          ...(input.result ?? {}),
          kind: 'failed',
          refetch: true,
          errorClass: input.errorClass,
        },
      };
      return failedTurn;
    });
    let providerCall = 0;
    const providerFailure = new Error('private provider reply failure');
    providerFailure.name = 'NoOutputGeneratedError';
    const model = new MockLanguageModelV4({
      doStream: async () => {
        providerCall += 1;
        if (providerCall === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: 'stream-start', warnings: [] },
                {
                  type: 'tool-call', toolCallId: 'saved-operation-provider-id', toolName: 'confirm_why',
                  input: JSON.stringify({
                    whyId: pending.id,
                    whyRevision: pending.revision,
                    presentedInTurnId: pending.presentation.assistantTurnId,
                    sourceMessageId: 'client-message-1',
                  }),
                },
                { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
              ] as never,
            }),
          };
        }
        return errorStream(providerFailure);
      },
    });
    let listCall = 0;
    const conversationClient = {
      listItems: vi.fn(async () => {
        listCall += 1;
        return {
          data: listCall === 1 ? [] : [
            internalContextItem('internal-context-1', 'saved-failure-context-1'),
            internalContextItem('internal-context-0', 'saved-failure-context-0'),
          ],
          hasMore: false,
        };
      }),
    };
    const logs: Array<Record<string, unknown>> = [];
    const app = testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      conversationClient,
      internalContextMarker: (index) => `saved-failure-context-${index}`,
      now: () => fixedNow,
      operationalLog: (entry) => logs.push(entry),
    });
    const body = { id: 'client-message-1', message: 'That feels exactly right.' };
    const response = await (await request(app)).post('/api/agent').send(body);

    const statuses = uiStreamChunks(response.text)
      .filter((chunk) => chunk.type === 'data-operation-status')
      .map((chunk) => chunk.data as Record<string, unknown>);
    expect(statuses.map((status) => status.status), JSON.stringify({
      body: response.body,
      text: response.text,
      logs,
      failCalls: storage.failAgentTurn.mock.calls,
      persistCalls: storage.persistCareerMapOperation.mock.calls.length,
      modelCalls: model.doStreamCalls.length,
    })).toEqual(['Saving', 'Saved']);
    expect(statuses).not.toContainEqual(expect.objectContaining({ status: 'Failed' }));
    expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      errorClass: 'NoOutputGeneratedError',
      result: expect.objectContaining({
        revision: 2,
        operationCommitted: true,
        internalContextItemIds: ['internal-context-0', 'internal-context-1'],
        displayRecovery: expect.objectContaining({
          status: 'pending', retainPartial: true,
        }),
      }),
    }));
    expect(conversationClient.listItems).toHaveBeenCalledTimes(2);
    expect(response.text).not.toContain('saved-operation-provider-id');
    expect(response.text).not.toContain('private provider reply failure');

    const replay = await (await request(app)).post('/api/agent').send(body);
    expect(replay.status).toBe(409);
    expect(replay.body).toMatchObject({
      status: 'failed-replay',
      result: { revision: 2, operationCommitted: true, errorClass: 'NoOutputGeneratedError' },
    });
    expect(model.doStreamCalls).toHaveLength(2);
    expect(storage.persistCareerMapOperation).toHaveBeenCalledOnce();
  });

  it.each(['committed', 'idempotent-replay'] as const)(
    'preserves %s Saved truth when durable completion loses its lease',
    async (outcome) => {
      let map = pendingWhy();
      const pending = map.foundation.whyRevisions.at(-1)!;
      const storage = createStorage({
        loadCareerMap: vi.fn(async () => ({ status: 'ready' as const, map })),
        getOrCreateCareerMap: vi.fn(async () => ({ status: 'ready' as const, map })),
        persistCareerMapOperation: vi.fn(async (input: { operation: CareerMapOperation }) => {
          if (outcome === 'idempotent-replay') {
            return { status: 'replayed' as const, map, receipt: map.operationHistory[0]! };
          }
          const result = applyCareerMapOperation(map, input.operation);
          if (result.status === 'committed') map = result.map;
          return result;
        }),
        completeAgentTurn: vi.fn(async () => undefined),
        getConversationMapping: vi.fn(async () => `completion-race-${outcome}`),
      });
      const model = confirmWhyThenTextModel({
        pending,
        callId: `completion-race-${outcome}`,
        sourceMessageId: 'client-message-1',
      });

      const response = await (await request(testApp({
        storage,
        requireAuth: authenticated,
        agentEnabled: true,
        model,
        conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
        operationalLog: vi.fn(),
      }))).post('/api/agent').send({
        id: 'client-message-1',
        message: 'That feels exactly right.',
      });

      const statuses = uiStreamChunks(response.text)
        .filter((chunk) => chunk.type === 'data-operation-status')
        .map((chunk) => (chunk.data as Record<string, unknown>).status);
      expect(statuses).toEqual(['Saving', 'Saved']);
      expect(response.text).not.toContain('"type":"finish"');
      expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
        errorClass: 'TurnLeaseLostError',
        result: expect.objectContaining({
          revision: outcome === 'committed' ? 2 : 1,
          operationCommitted: true,
        }),
      }));
      expect(storage.cancelAgentTurn).not.toHaveBeenCalled();
      expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    },
  );

  it.each(['committed', 'idempotent-replay'] as const)(
    'preserves %s Saved truth when abort races durable completion',
    async (outcome) => {
      let map = pendingWhy();
      const pending = map.foundation.whyRevisions.at(-1)!;
      let completionStarted!: () => void;
      const completionStartedGate = new Promise<void>((resolve) => { completionStarted = resolve; });
      const storage = createStorage({
        loadCareerMap: vi.fn(async () => ({ status: 'ready' as const, map })),
        getOrCreateCareerMap: vi.fn(async () => ({ status: 'ready' as const, map })),
        persistCareerMapOperation: vi.fn(async (input: { operation: CareerMapOperation }) => {
          if (outcome === 'idempotent-replay') {
            return { status: 'replayed' as const, map, receipt: map.operationHistory[0]! };
          }
          const result = applyCareerMapOperation(map, input.operation);
          if (result.status === 'committed') map = result.map;
          return result;
        }),
        completeAgentTurn: vi.fn(async (input: { abortSignal?: AbortSignal }) => {
          completionStarted();
          return new Promise<never>((_resolve, reject) => {
            input.abortSignal?.addEventListener('abort', () => reject(input.abortSignal?.reason), { once: true });
          });
        }),
        getConversationMapping: vi.fn(async () => `abort-race-${outcome}`),
      });
      const model = confirmWhyThenTextModel({
        pending,
        callId: `abort-race-${outcome}`,
        sourceMessageId: 'client-message-1',
      });
      const outbound = (await request(testApp({
        storage,
        requireAuth: authenticated,
        agentEnabled: true,
        model,
        conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
        operationalLog: vi.fn(),
      }))).post('/api/agent').send({
        id: 'client-message-1',
        message: 'That feels exactly right.',
      });
      const settled = Promise.resolve(outbound).catch(() => undefined);

      await completionStartedGate;
      outbound.abort();
      await settled;

      await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());
      expect(storage.cancelAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
        result: expect.objectContaining({
          revision: outcome === 'committed' ? 2 : 1,
          operationCommitted: true,
        }),
      }));
      expect(storage.failAgentTurn).not.toHaveBeenCalled();
      expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    },
  );

  it('returns the durable failed turn when completion loses its lease instead of claiming workspace success', async () => {
    const failedTurn = {
      ...turn('workspace-action', 'failed'),
      terminalResult: { kind: 'failed', refetch: true, errorClass: 'TurnLeaseLostError' },
    };
    const storage = createPathSelectionStorage({ completeAgentTurn: vi.fn(async () => failedTurn) });
    const response = await (await request(testApp({
      storage, ...directContinuationProvider(), requireAuth: authenticated, agentEnabled: true,
      now: () => new Date(timestamp(3)), operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send(
      selectPurposePathRequest({ operationId: 'operation-completion-race' }),
    );

    expect(response.status).toBe(200);
    expect(response.text).toContain('The agent request failed.');
    expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      errorClass: 'TurnLeaseLostError',
      result: expect.objectContaining({ operationCommitted: true }),
    }));
  });

  it.each([
    ['attached', { status: 'attached', shouldInvokeModel: false, turn: turn('agent-turn') }],
    ['terminal', { status: 'terminal', shouldInvokeModel: false, turn: turn('agent-turn', 'completed') }],
  ] as const)('returns a %s replay outcome without re-invoking the provider', async (_label, begun) => {
    const storage = createStorage({ beginAgentTurn: vi.fn(async () => begun) });
    const model = new MockLanguageModelV4({
      doGenerate: { content: [{ type: 'text', text: 'must-not-run' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(), warnings: [] } as never,
    });
    const response = await (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

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
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'retry' });

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

    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'retry' });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({ kind: 'completed', displayReady: true });
    expect(response.body.result).not.toHaveProperty('historyProjection');
  });

  it.each([
    ['design-path-project', null],
    ['guide-path-project', null],
    ['design-path-project', { kind: 'project-revision-confirmation', targetId: 'project-2', targetRevision: 2 }],
    ['design-path-project', { kind: 'follow-on-project-selection', targetId: 'options-2', targetRevision: 1 }],
    ['interpret-path-project', { kind: 'continue-choice', targetId: 'reflection-2', targetRevision: 1 }],
    ['interpret-path-project', { kind: 'next-move', targetId: 'choice-2', targetRevision: 1 }],
  ])('replays the stored workspace envelope for %s and %j without converting it to generic completion', async (derivedModule, pendingDecision) => {
    const operationEnvelope = {
      status: 'committed', operation: 'select-purpose-path', authoritativeRevision: 4,
      derivedModule, pendingDecision,
    };
    const storage = createPathSelectionStorage({
      beginWorkspaceActionTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'terminal', shouldInvokeModel: false,
        turn: { ...turn('workspace-action', 'completed'), terminalResult: { kind: 'workspace-result', refetch: true, operationEnvelope } },
      })),
    });
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send(
      selectPurposePathRequest({ operationId: 'operation-replay' }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...operationEnvelope, turnStatus: 'completed', replay: true });
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', 409, 'revision-conflict', true],
    ['rejected', 422, 'operation-unavailable', false],
  ] as const)('preserves stored workspace %s HTTP semantics', async (status, httpStatus, errorClass, retryable) => {
    const operationEnvelope = {
      status, operation: 'select-purpose-path', authoritativeRevision: 4,
      derivedModule: 'design-path-project', pendingDecision: null,
      errorClass, ...(retryable ? { retryable: true } : {}),
    };
    const storage = createPathSelectionStorage({
      beginWorkspaceActionTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => ({
        status: 'terminal', shouldInvokeModel: false,
        turn: {
          ...turn('workspace-action', 'completed'),
          terminalResult: { kind: 'workspace-result', refetch: true, operationEnvelope },
        },
      })),
    });
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send(
      selectPurposePathRequest({ operationId: 'operation-replay' }),
    );

    expect(response.status).toBe(httpStatus);
    expect(response.body).toEqual({ ...operationEnvelope, turnStatus: 'completed', replay: true });
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
  });

  it('fails closed when a stored workspace replay envelope is malformed instead of spreading its payload', async () => {
    const terminalSentinel = 'PRIVATE-STORED-TERMINAL-PAYLOAD';
    const storage = createPathSelectionStorage({
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
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send(
      selectPurposePathRequest({ operationId: 'operation-replay' }),
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ status: 'failed-replay', terminal: 'failed' });
    expect(JSON.stringify(response.body)).not.toContain(terminalSentinel);
  });

  it('uses only the server-owned Conversation mapping and completes a natural no-write turn', async () => {
    const storage = createStorage({ getConversationMapping: vi.fn(async () => 'conversation-for-authenticated-owner') });
    const conversationClient = {
      listItems: vi.fn(async () => ({
        data: [
          { id: 'provider-assistant-item', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'A normal reflective response without a write.' }] },
          { id: 'provider-user-item', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Help me think this through.' }] },
        ],
        hasMore: false,
      })),
    };
    const model = new MockLanguageModelV4({
      doStream: async () => textStream('A normal reflective response without a write.') as never,
    });
    const response = await (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      conversationClient,
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'Help me think this through.' });

    expect(response.status, JSON.stringify({ body: response.body, failed: storage.failAgentTurn.mock.calls })).toBe(200);
    expect(response.text).toContain('A normal reflective response');
    expect(model.doStreamCalls[0]?.providerOptions?.openai).toMatchObject({
      conversation: 'conversation-for-authenticated-owner',
      store: true,
    });
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]?.toolChoice).toEqual({ type: 'auto' });
    expect(model.doStreamCalls[0]?.tools?.map((definition) => definition.name))
      .toContain('web_search');
    expect((model.doStreamCalls[0]?.providerOptions?.openai as Record<string, unknown>).contextManagement)
      .toBeDefined();
    expect(storage.completeAgentTurn).toHaveBeenCalledOnce();
    expect(storage.cancelAgentTurn).not.toHaveBeenCalled();
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
    expect(uiStreamChunks(response.text).some((chunk) => chunk.type === 'data-operation-status')).toBe(false);
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    expect(conversationClient.listItems).toHaveBeenCalledOnce();
    expect(conversationClient.listItems).toHaveBeenCalledWith({
      conversationId: 'conversation-for-authenticated-owner',
      limit: 100,
      order: 'desc',
      abortSignal: expect.any(AbortSignal),
    });
    expect(storage.completeAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      assistantText: 'A normal reflective response without a write.',
      result: expect.objectContaining({
        kind: 'completed',
        internalContextItemIds: ['test-internal-context-0'],
        displayProjection: {
          userItemId: 'provider-user-item',
          assistantItemIds: ['provider-assistant-item'],
        },
      }),
    }));
  });

  it('retries bounded provider projection until delayed internal context becomes visible', async () => {
    const marker = 'delayed-context-0';
    let listCall = 0;
    const conversationClient = {
      listItems: vi.fn(async () => {
        listCall += 1;
        return {
          data: [
            {
              id: 'delayed-assistant', type: 'message', role: 'assistant',
              content: [{ type: 'output_text', text: 'A safely projected reply.' }],
            },
            ...(listCall >= 3 ? [internalContextItem('delayed-internal-context', marker)] : []),
            {
              id: 'delayed-user', type: 'message', role: 'user',
              content: [{ type: 'input_text', text: 'Help me reflect.' }],
            },
          ],
          hasMore: false,
        };
      }),
    };
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'delayed-context-conversation'),
    });
    const response = await (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model: new MockLanguageModelV4({ doStream: textStream('A safely projected reply.') as never }),
      conversationClient,
      internalContextMarker: () => marker,
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'Help me reflect.' });

    expect(response.status).toBe(200);
    expect(conversationClient.listItems).toHaveBeenCalledTimes(3);
    expect(storage.completeAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({
        kind: 'completed',
        internalContextItemIds: ['delayed-internal-context'],
        displayProjection: {
          userItemId: 'delayed-user',
          assistantItemIds: ['delayed-assistant'],
        },
      }),
    }));
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
  });

  it.each(['missing', 'duplicate'] as const)(
    'fails closed when internal context remains %s after bounded visibility retries',
    async (markerFailure) => {
      const marker = 'never-unambiguous-context-0';
      const conversationClient = {
        listItems: vi.fn(async () => ({
          data: [
            {
              id: 'unbound-assistant', type: 'message', role: 'assistant',
              content: [{ type: 'output_text', text: 'Unbound reply.' }],
            },
            {
              id: 'unbound-user', type: 'message', role: 'user',
              content: [{ type: 'input_text', text: 'Help me reflect.' }],
            },
            ...(markerFailure === 'duplicate' ? [
              internalContextItem('duplicate-internal-context-1', marker),
              internalContextItem('duplicate-internal-context-2', marker),
            ] : []),
          ],
          hasMore: false,
        })),
      };
      const storage = createStorage({
        getConversationMapping: vi.fn(async () => 'incomplete-context-conversation'),
      });
      const response = await (await request(testApp({
        storage,
        requireAuth: authenticated,
        agentEnabled: true,
        model: new MockLanguageModelV4({ doStream: textStream('Unbound reply.') as never }),
        conversationClient,
        internalContextMarker: () => marker,
        operationalLog: vi.fn(),
      }))).post('/api/agent').send({ id: 'client-message-1', message: 'Help me reflect.' });

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('"type":"finish"');
      expect(response.text).toContain('The agent request failed.');
      expect(conversationClient.listItems).toHaveBeenCalledTimes(5);
      expect(storage.completeAgentTurn).not.toHaveBeenCalled();
      expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
        errorClass: 'InternalContextBindingError',
      }));
      const failureResult = storage.failAgentTurn.mock.calls[0]?.[0]?.result;
      expect(failureResult).not.toHaveProperty('displayProjection');
      expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    },
  );

  it('bounds failure recovery even when provider item listing ignores its abort signal', async () => {
    const providerFailure = new Error('private provider failure');
    providerFailure.name = 'APICallError';
    const conversationClient = {
      listItems: vi.fn(() => new Promise<never>(() => undefined)),
    };
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'hanging-failure-conversation'),
    });
    const response = await (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model: new MockLanguageModelV4({ doStream: errorStream(providerFailure) as never }),
      conversationClient,
      internalContextMarker: () => 'hanging-failure-context-0',
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'Help me reflect.' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('The agent request failed.');
    expect(conversationClient.listItems).toHaveBeenCalledOnce();
    expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({
        internalContextMarkers: ['hanging-failure-context-0'],
      }),
    }));
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
  }, 2_000);

  it('cancels promptly when provider item listing ignores the request abort signal', async () => {
    let listingStarted!: () => void;
    const listingStartedGate = new Promise<void>((resolve) => { listingStarted = resolve; });
    const conversationClient = {
      listItems: vi.fn(() => {
        listingStarted();
        return new Promise<never>(() => undefined);
      }),
    };
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'hanging-cancel-conversation'),
    });
    const outbound = (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model: new MockLanguageModelV4({ doStream: textStream('Safe partial reply.') as never }),
      conversationClient,
      internalContextMarker: () => 'hanging-cancel-context-0',
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'Help me reflect.' });
    const settled = Promise.resolve(outbound).catch(() => undefined);

    await listingStartedGate;
    outbound.abort();
    await settled;

    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());
    expect(storage.cancelAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({
        internalContextMarkers: ['hanging-cancel-context-0'],
      }),
    }));
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
  }, 2_000);

  it('streams a search-only answer with paired sanitized citation data and no save status', async () => {
    const userText = 'What does the current official registry say?';
    const claim = 'The current registry lists application/json.';
    const url = 'https://example.com/current-registry';
    const model = new MockLanguageModelV4({
      doStream: async () => searchStream(claim, url, 'Official registry') as never,
    });
    const conversationClient = {
      listItems: vi.fn(async () => ({
        data: [
          {
            id: 'search-provider-assistant', type: 'message', role: 'assistant',
            content: [{
              type: 'output_text', text: claim,
              annotations: [{
                type: 'url_citation', start_index: 0, end_index: claim.length,
                url, title: 'Official registry',
              }],
            }],
          },
          internalContextItem('search-internal-context', 'search-context-0'),
          { id: 'search-provider-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: userText }] },
        ],
        hasMore: false,
      })),
    };
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'search-conversation'),
    });
    const response = await (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      conversationClient,
      internalContextMarker: () => 'search-context-0',
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: userText });

    expect(response.status).toBe(200);
    const chunks = uiStreamChunks(response.text);
    expect(chunks.some((chunk) => chunk.type === 'data-operation-status')).toBe(false);
    const citation = chunks.find((chunk) => chunk.type === 'data-claim-citation');
    expect(citation?.data).toMatchObject({
      turnId: 'agent-turn-turn',
      messageId: 'agent-turn-turn',
      exactClaim: claim,
      url,
      title: 'Official registry',
      support: 'cited-provenance',
    });
    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'source-url',
      url,
    }));
    expect(response.text).toContain(claim);
    expect(response.text).not.toMatch(/provider-search-(?:call|result)-private|provider-source-private/);
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
    expect(storage.completeAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({
        internalContextItemIds: ['search-internal-context'],
        displayProjection: {
          userItemId: 'search-provider-user',
          assistantItemIds: ['search-provider-assistant'],
        },
      }),
    }));
  });

  it('fails a hosted-search outage safely without a retry or durable research record', async () => {
    const privateProviderError = new Error('private search provider payload');
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            {
              type: 'tool-call', toolCallId: 'outage-search-call', toolName: 'web_search',
              input: JSON.stringify({ action: { type: 'search', query: 'current official fact' } }),
              providerExecuted: true,
            },
            {
              type: 'tool-error', toolCallId: 'outage-search-call', toolName: 'web_search',
              input: { action: { type: 'search', query: 'current official fact' } },
              error: privateProviderError,
              providerExecuted: true,
            },
            { type: 'finish', finishReason: { unified: 'error', raw: 'error' }, usage: usage() },
          ] as never,
        }),
      }),
    });
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'search-outage-conversation'),
    });
    const conversationClient = {
      listItems: vi.fn(async () => ({
        data: [internalContextItem('outage-internal-context', 'outage-context-0')],
        hasMore: false,
      })),
    };
    const response = await (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      conversationClient,
      internalContextMarker: () => 'outage-context-0',
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({
      id: 'client-message-1',
      message: 'Check the current official fact.',
    });

    expect(response.status).toBe(200);
    expect(response.text).not.toContain(privateProviderError.message);
    const chunks = uiStreamChunks(response.text);
    expect(chunks.some((chunk) => chunk.type === 'data-operation-status')).toBe(false);
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'error' }));
    expect(model.doStreamCalls).toHaveLength(1);
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      errorClass: 'NoOutputGeneratedError',
    }));
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
  });

  it('fails a completed provider turn with no reply so the explorer can retry their message', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'finish', finishReason: { unified: 'length', raw: 'max_output_tokens' }, usage: {
              inputTokens: { total: undefined }, outputTokens: { total: undefined },
            } },
          ] as never,
        }),
      }),
    });
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'silent-turn-conversation'),
    });
    const response = await (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      conversationClient: {
        listItems: vi.fn(async () => ({
          data: [internalContextItem('silent-internal-context', 'silent-context-0')],
          hasMore: false,
        })),
      },
      internalContextMarker: () => 'silent-context-0',
      operationalLog: (entry) => logs.push(entry),
    }))).post('/api/agent').send({
      id: 'client-message-silent',
      message: 'Please change one of the Purpose Paths.',
    });

    expect(response.status).toBe(200);
    expect(uiStreamChunks(response.text)).toContainEqual(expect.objectContaining({ type: 'error' }));
    expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      errorClass: 'NoOutputGeneratedError',
    }));
    expect(storage.completeAgentTurn).not.toHaveBeenCalled();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
    expect(logs.at(-1)).toMatchObject({
      route: 'agent-turn', errorClass: 'NoOutputGeneratedError',
      agentFinishReason: 'length', agentStepCount: 1, agentVisibleOutput: false,
      agentUsageReported: false,
    });
    expect(logs.at(-1)).not.toHaveProperty('agentInputTokens');
    expect(logs.at(-1)).not.toHaveProperty('agentOutputTokens');
    expect(logs.at(-1)).not.toHaveProperty('agentReasoningTokens');
    expect(JSON.stringify(logs)).not.toContain('Please change one of the Purpose Paths.');
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
            id: 'durability-provider-assistant', type: 'message', role: 'assistant',
            content: [{ type: 'output_text', text: 'Safe progressive reply.' }],
          },
          {
            id: 'durability-provider-user', type: 'message', role: 'user',
            content: [{ type: 'input_text', text: 'First durable message.' }],
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
        headers: {
          'content-type': 'application/json',
          origin: METHOD_REQUEST_ORIGIN,
          'x-revelio-request': '1',
        },
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
      const immediateHistory = terminalBoundary.then(async () => (await request(app)).get('/api/agent/history'));
      const immediateNextTurn = terminalBoundary.then(async () => (await request(app))
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
            turn: { turnId: 'durability-turn-1', status: 'completed' },
          },
          {
            id: 'durability-provider-assistant', role: 'assistant',
            parts: [{ type: 'text', text: 'Safe progressive reply.' }],
            turn: { turnId: 'durability-turn-1', status: 'completed' },
            isFinalAssistantItem: true,
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
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

    expect(response.text).not.toContain('"type":"finish"');
    expect(storage.completeAgentTurn).toHaveBeenCalledOnce();
    expect(storage.failAgentTurn).toHaveBeenCalledOnce();
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
  });

  it('fails the turn when completed framing text cannot be atomically delivered', async () => {
    const deliveryError = new Error('Malformed framing reply.');
    deliveryError.name = 'FramingDeliveryError';
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'server-conversation'),
      completeAgentTurn: vi.fn(async () => { throw deliveryError; }),
    });
    const assistantText = 'Extra preface before a framing response.';
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true,
      model: new MockLanguageModelV4({ doStream: textStream(assistantText) as never }),
      conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'Show the framing.' });

    expect(storage.completeAgentTurn).toHaveBeenCalledWith(expect.objectContaining({ assistantText }));
    expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      errorClass: 'FramingDeliveryError',
    }));
    expect(response.text).not.toContain('"type":"finish"');
    expect(response.text).toContain('The agent request failed.');
  });

  it.each([true, false])('terminalizes natural project framing from the actual displayed reply (framing included: %s)', async (includesFraming) => {
    let map = pendingPaths();
    const commit = (operation: CareerMapOperation) => {
      const result = applyCareerMapOperation(map, operation);
      expect(result.status).toBe('committed');
      if (result.status === 'committed') map = result.map;
    };
    commit({
      type: 'select-purpose-path', sourceId: 'select-path', expectedRevision: map.revision,
      occurredAt: timestamp(4), payload: {
        setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1,
        action: { kind: 'user-message', actionId: 'select-message', turnId: 'select-turn', turnSequence: 4, occurredAt: timestamp(4) },
      },
    });
    commit({
      type: 'propose-first-project', sourceId: 'project-proposal', expectedRevision: map.revision,
      occurredAt: timestamp(5), payload: {
        project: { id: 'project-1', revision: 1, briefFormat: 'simple-v1', title: 'Build one useful aid', learningGoal: 'Notice how it feels', firstVersion: 'One rough page', firstStep: 'Sketch the page' },
        presentation: { kind: 'model-presentation', assistantTurnId: 'project-proposal-turn', turnSequence: 5, completed: true, presentedAt: timestamp(5) },
      },
    });
    const presentation = { kind: 'model-presentation' as const, assistantTurnId: 'agent-turn-turn', turnSequence: 6, completed: true as const, presentedAt: timestamp(6) };
    const framingText = 'Try this and notice what you learn.';
    commit({
      type: 'present-first-project-framing', sourceId: 'natural-framing', expectedRevision: map.revision,
      occurredAt: timestamp(6), payload: { projectId: 'project-1', projectRevision: 1, locale: 'en', framingFormat: 'natural-v1', framingText, moduleVersion: '2.0.0', presentation },
    });
    let delivery: ReturnType<typeof applyCareerMapOperation> | undefined;
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'server-conversation'),
      completeAgentTurn: vi.fn(async (input: { assistantText: string }) => {
        delivery = applyCareerMapOperation(map, {
          type: 'deliver-first-project-framing', sourceId: 'framing-delivery', expectedRevision: map.revision,
          occurredAt: timestamp(6), payload: { projectId: 'project-1', projectRevision: 1, assistantText: input.assistantText, presentation },
        });
        if (delivery.status !== 'committed') {
          const error = new Error('Framing was not displayed.');
          error.name = 'FramingDeliveryError';
          throw error;
        }
        map = delivery.map;
        return turn('agent-turn', 'completed');
      }),
    }, map);
    const assistantText = includesFraming
      ? `Here is a manageable start. ${framingText} Let me know how it feels.`
      : 'Here is a manageable start. Let me know how it feels.';
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true,
      model: new MockLanguageModelV4({ doStream: textStream(assistantText) as never }),
      conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'Show the project.' });

    const displayedText = uiStreamChunks(response.text).filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.delta).join('');
    expect(displayedText).toBe(assistantText);
    expect(storage.completeAgentTurn).toHaveBeenCalledWith(expect.objectContaining({ assistantText: displayedText }));
    expect(delivery?.status).toBe(includesFraming ? 'committed' : 'rejected');
    expect(map.projects[0].acceptanceFraming?.status).toBe(includesFraming ? 'delivered' : 'pending');
    if (includesFraming) {
      expect(storage.failAgentTurn).not.toHaveBeenCalled();
      expect(response.text).toContain('"type":"finish"');
    } else {
      expect(storage.failAgentTurn).toHaveBeenCalledWith(expect.objectContaining({ errorClass: 'FramingDeliveryError' }));
      expect(response.text).not.toContain('"type":"finish"');
    }
  });

  it('proposes and displays natural project support in one turn, then accepts on later semantic assent', async () => {
    let map = pendingPaths();
    const selected = applyCareerMapOperation(map, {
      type: 'select-purpose-path', sourceId: 'selected-before-project', expectedRevision: map.revision,
      occurredAt: timestamp(4), payload: {
        setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1,
        action: { kind: 'user-message', actionId: 'prior-selection-message', turnId: 'prior-selection-turn', turnSequence: 4, occurredAt: timestamp(4) },
      },
    });
    expect(selected.status).toBe('committed');
    if (selected.status !== 'committed') throw new Error('Prior selection did not commit.');
    map = selected.map;
    const framingText = 'This is a small experiment to notice what you enjoy learning.';
    const reply = `Here is one useful starting point. ${framingText} We can adapt it as you go.`;
    let activeTurn: AgentTurnRecord;
    const completedTurns: AgentTurnRecord[] = [];
    const storage = createStorage({
      loadCareerMap: vi.fn(async () => ({ status: 'ready' as const, map })),
      getOrCreateCareerMap: vi.fn(async () => ({ status: 'ready' as const, map })),
      getConversationMapping: vi.fn(async () => 'server-conversation'),
      beginAgentTurn: vi.fn(async (input: { clientMessageId: string; requestFingerprint: string; turnId: string; leaseId: string }): Promise<BeginAgentTurnResult> => {
        activeTurn = { ...turn('agent-turn'), ...input };
        return { status: 'started', shouldInvokeModel: true, turn: activeTurn };
      }),
      persistCareerMapOperation: vi.fn(async (input: { operation: CareerMapOperation }) => {
        const result = applyCareerMapOperation(map, input.operation);
        expect(result.status, JSON.stringify(result)).toBe('committed');
        if (result.status === 'committed' || result.status === 'replayed') map = result.map;
        return result;
      }),
      listAgentTurns: vi.fn(async () => completedTurns),
      completeAgentTurn: vi.fn(async (input: { assistantText: string; result: Record<string, unknown> }) => {
        const project = map.projects.at(-1);
        if (project?.acceptanceFraming?.status === 'pending') {
          const framing = project.acceptanceFraming;
          const delivered = applyCareerMapOperation(map, {
            type: 'deliver-first-project-framing', sourceId: `delivery-${activeTurn.turnId}`, expectedRevision: map.revision,
            occurredAt: timestamp(8), payload: {
              projectId: project.id, projectRevision: project.revision, assistantText: input.assistantText,
              presentation: { kind: 'model-presentation', assistantTurnId: activeTurn.turnId, turnSequence: framing.turnSequence, completed: true, presentedAt: timestamp(8) },
            },
          });
          expect(delivered.status).toBe('committed');
          if (delivered.status !== 'committed') throw new Error('Natural project support was not delivered.');
          map = delivered.map;
        }
        const completed = { ...activeTurn, status: 'completed' as const, terminalResult: input.result };
        completedTurns.push(completed);
        return completed;
      }),
    }, map);
    let providerCall = 0;
    const call = (toolName: string, input: Record<string, unknown>) => ({
      stream: simulateReadableStream({ chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: `project-chain-${providerCall}`, toolName, input: JSON.stringify(input) },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
      ] as never }),
    });
    const model = new MockLanguageModelV4({ doStream: async () => {
      providerCall += 1;
      if (providerCall === 1) return call('propose_first_project', {
        id: 'simple-project', revision: 1, briefFormat: 'simple-v1', title: 'Build one useful aid',
        learningGoal: 'Notice how making it feels', firstVersion: 'One rough page', firstStep: 'Sketch the page',
      });
      if (providerCall === 2) return call('present_first_project_framing', {
        projectId: 'simple-project', projectRevision: 1, locale: 'en', framingText,
      });
      if (providerCall === 3) return textStream(reply);
      if (providerCall === 4) return call('accept_first_project', {
        projectId: 'simple-project', projectRevision: 1,
        presentedInTurnId: completedTurns[0]?.turnId, sourceMessageId: 'later-assent',
      });
      return textStream('Start with a quick sketch of that page.');
    } });
    let id = 0;
    const app = testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, now: () => new Date(timestamp(9)),
      id: () => `natural-chain-${++id}`,
      conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) }, operationalLog: vi.fn(),
    });
    const first = await (await request(app)).post('/api/agent').send({ id: 'project-request', message: 'Show me a small project for this path.' });
    const displayed = uiStreamChunks(first.text).filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.delta).join('');
    expect(displayed).toBe(reply);
    expect(first.text).toContain('"type":"finish"');
    const deliveredFraming = map.projects.at(-1)?.acceptanceFraming;
    expect(deliveredFraming?.status).toBe('delivered');
    expect(deliveredFraming?.presentation?.assistantTurnId).toBe(completedTurns[0]?.turnId);
    expect(map.projects.at(-1)?.presentation.assistantTurnId).toBe(completedTurns[0]?.turnId);
    const later = await (await request(app)).post('/api/agent').send({ id: 'later-assent', message: 'Yes, that sounds useful. I want to try it.' });
    expect(later.text).toContain('"type":"finish"');
    expect(map.projects.at(-1)?.agreementStatus).toBe('accepted');
    expect(map.projects.at(-1)?.confirmation?.confirmedBy.turnId).toBe(completedTurns[1]?.turnId);
    expect(completedTurns[1]?.turnId).not.toBe(deliveredFraming?.presentation?.assistantTurnId);
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
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
      const response = await (await request(testApp({
        storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
        operationalLog: vi.fn(),
      }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

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
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      operationalLog: (entry) => logs.push(entry),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

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

    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

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

    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, conversationClient, operationalLog: vi.fn(),
    }))).get('/api/agent/history');

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
      now: () => new Date(timestamp(3)), operationalLog: vi.fn(),
    });
    const activeProvisioning = Promise.resolve((await request(app))
      .post('/api/agent')
      .send({ id: 'client-message-1', message: 'hello' }));
    await bindingStartedGate;

    const history = await Promise.resolve((await request(app)).get('/api/agent/history'))
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
    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, conversationClient,
      conversationCleanupSignal: (entry) => cleanupSignals.push(entry),
      operationalLog: vi.fn(),
    } as never))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

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

    const failed = await (await request(app))
      .post('/api/agent')
      .send({ id: 'client-message-1', message: 'hello' });
    expect(failed.status).toBe(502);
    expect(mapped).toBe(providerConversationId);
    expect(pending).toMatchObject({ conversationId: providerConversationId });
    expect(conversationClient.deleteConversation).not.toHaveBeenCalled();

    const history = await (await request(app)).get('/api/agent/history');
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

    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, conversationClient, operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });

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
    const outbound = (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });
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

    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      provisioningHandoffTiming: {
        now: () => Date.now(),
        delay: async (milliseconds: number) => {
          handoffDelays.push(milliseconds);
          mapping = 'healthy-bound-conversation';
        },
      },
      operationalLog: vi.fn(),
    } as never))).post('/api/agent').send({
      id: 'message-during-healthy-provisioning',
      message: 'Do not start concurrently with the healthy first turn.',
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ status: 'conflict', retryable: true });
    expect(storage.beginAgentTurn).toHaveBeenCalledTimes(2);
    expect(storage.getTurnLease).toHaveBeenCalledOnce();
    expect(storage.getConversationMapping).toHaveBeenCalledTimes(2);
    expect(handoffDelays).toEqual([25]);
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('retries authoritatively when a mapping appears after the provisioning lease settles', async () => {
    const activeTurnId = 'settled-provisioning-turn';
    const retryAfter = new Date('2100-01-01T00:00:00.000Z');
    const resumedTurn = {
      ...turn('agent-turn'),
      turnId: 'resumed-after-provisioning-turn',
      clientMessageId: 'message-after-settled-provisioning',
      leaseId: 'resumed-after-provisioning-lease',
    };
    let mapping: string | undefined;
    let leaseSettled = false;
    let beginCount = 0;
    const storage = createStorage({
      beginAgentTurn: vi.fn(async (): Promise<BeginAgentTurnResult> => {
        beginCount += 1;
        if (beginCount === 1 || !leaseSettled) {
          return {
            status: 'conflict', activeTurnId, retryAfter,
            waitReason: 'conversation-provisioning',
          };
        }
        return { status: 'started', shouldInvokeModel: true, turn: resumedTurn };
      }),
      getConversationMapping: vi.fn(async () => mapping),
      getTurnLease: vi.fn(async () => ({
        userId: USER_ID,
        turnId: activeTurnId,
        leaseId: 'settling-provisioning-lease',
        acquiredAt: new Date(timestamp(1)),
        expiresAt: retryAfter,
      })),
    });
    const model = new MockLanguageModelV4({
      doStream: async () => textStream('Reply after the provisioning owner settled.') as never,
    });
    const conversationClient = {
      createConversation: vi.fn(async () => 'must-not-create-a-new-conversation'),
      listItems: vi.fn(async () => ({ data: [], hasMore: false })),
    };

    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      provisioningHandoffTiming: {
        now: () => Date.now(),
        delay: async () => {
          mapping = 'already-bound-provider-conversation';
          leaseSettled = true;
        },
      },
      operationalLog: vi.fn(),
    } as never))).post('/api/agent').send({
      id: resumedTurn.clientMessageId,
      message: 'Continue after the first provisioning turn settled.',
    });

    expect(response.status).toBe(200);
    expect(storage.beginAgentTurn).toHaveBeenCalledTimes(2);
    expect(conversationClient.createConversation).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]?.providerOptions?.openai).toMatchObject({
      conversation: 'already-bound-provider-conversation',
      store: true,
    });
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

    const response = await (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      provisioningHandoffTiming: {
        now: () => monotonicNow,
        delay: async (milliseconds: number) => {
          handoffDelays.push(milliseconds);
          monotonicNow += milliseconds;
        },
      },
      operationalLog: vi.fn(),
    } as never))).post('/api/agent').send({
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
      operationalLog: vi.fn(),
    });

    const first = (await request(app)).post('/api/agent').send({
      id: firstTurn.clientMessageId,
      message: 'Start while the Conversation is being provisioned.',
    });
    const firstSettled = Promise.resolve(first).catch(() => undefined);
    await vi.waitFor(() => expect(conversationClient.createConversation).toHaveBeenCalledOnce());
    first.abort();

    const secondResponsePromise = Promise.resolve((await request(app)).post('/api/agent').send({
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
    const outbound = (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model, conversationClient,
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });
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

    const failed = await (await request(app))
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

    const firstHistory = await (await request(app)).get('/api/agent/history');
    expect(firstHistory.status).toBe(200);
    expect(firstHistory.body).toEqual({ status: 'empty', messages: [] });
    expect(storage.releaseConversationProvisioningCleanup).toHaveBeenCalledOnce();
    expect(pending).toBeDefined();

    const history = await (await request(app)).get('/api/agent/history');

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

  it.each([
    ['audio/webm', WEBM_AUDIO],
    ['audio/webm; codecs=opus', WEBM_AUDIO],
    ['audio/mp4', MP4_AUDIO],
  ] as const)('validates and forwards one normalized %s upload', async (contentType, audio) => {
    const transcribeAudio = vi.fn(async () => 'bounded transcript');
    const logs: Array<Record<string, unknown>> = [];
    const app = testApp({
      storage: createStorage(), requireAuth: authenticated, agentEnabled: true,
      transcribeAudio, operationalLog: (entry) => logs.push(entry),
    });

    const response = await (await request(app))
      .post('/api/agent/audio/transcribe?language=fr')
      .set('content-type', contentType)
      .send(audio);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ text: 'bounded transcript' });
    expect(transcribeAudio).toHaveBeenCalledOnce();
    expect(transcribeAudio).toHaveBeenCalledWith({
      audio,
      mediaType: contentType.startsWith('audio/mp4') ? 'audio/mp4' : 'audio/webm',
      abortSignal: expect.any(AbortSignal),
    });
    expect(logs).toEqual([expect.objectContaining({
      provider: 'openai', model: 'gpt-transcribe', status: 200,
    })]);
  });

  it('maps provider silence to one successful empty response and one privacy-safe log', async () => {
    const transcribeAudio = vi.fn(async () => {
      throw new OpenAITranscriptionError('empty-transcript');
    });
    const logs: Array<Record<string, unknown>> = [];
    const app = testApp({
      storage: createStorage(),
      requireAuth: authenticated,
      agentEnabled: true,
      transcribeAudio,
      operationalLog: (entry) => logs.push(entry),
    });

    const response = await (await request(app))
      .post('/api/agent/audio/transcribe')
      .send(WEBM_AUDIO);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ text: '' });
    expect(transcribeAudio).toHaveBeenCalledOnce();
    expect(logs).toEqual([expect.objectContaining({
      provider: 'openai',
      model: 'gpt-transcribe',
      status: 200,
      errorClass: 'OpenAITranscriptionError',
    })]);
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
  });

  it('rejects empty, unsupported, mismatched, and oversized audio before provider dispatch', async () => {
    const transcribeAudio = vi.fn();
    const app = testApp({
      storage: createStorage(), requireAuth: authenticated, agentEnabled: true,
      transcribeAudio, operationalLog: vi.fn(),
    });
    const send = async (contentType: string, body: Buffer) => (await request(app))
      .post('/api/agent/audio/transcribe')
      .set('content-type', contentType)
      .send(body);

    expect((await send('audio/webm', Buffer.alloc(0))).status).toBe(400);
    expect((await send('audio/webm', MP4_AUDIO)).status).toBe(400);
    expect((await send('audio/mp4', WEBM_AUDIO)).status).toBe(400);
    expect((await send('audio/mpeg', WEBM_AUDIO)).status).toBe(400);
    expect((await send('audio/webm', Buffer.from('1a45dfa3a34286810142f7810142f2810442f381084282886d6174726f736b614287810442858102', 'hex'))).status).toBe(400);
    expect((await send('audio/webm', Buffer.from('1a45dfa39f4286810142f7810142f2810442f381084282847765626d42878104', 'hex'))).status).toBe(400);
    expect((await send('audio/mp4', Buffer.from('00000018667479706d70343200000000', 'hex'))).status).toBe(400);
    expect((await send('audio/mp4', Buffer.from('000000186674797068656963000000006865696368656978', 'hex'))).status).toBe(400);
    expect((await send('audio/webm', Buffer.concat([
      WEBM_AUDIO, Buffer.alloc(11 * 1024 * 1024 - WEBM_AUDIO.length + 1),
    ]))).status).toBe(413);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it('accepts the exact 11 MiB raw-body boundary', async () => {
    const transcribeAudio = vi.fn(async () => 'boundary transcript');
    const audio = Buffer.alloc(11 * 1024 * 1024);
    WEBM_AUDIO.copy(audio);
    const response = await (await request(testApp({
      storage: createStorage(), requireAuth: authenticated, agentEnabled: true,
      transcribeAudio, operationalLog: vi.fn(),
    }))).post('/api/agent/audio/transcribe').send(audio);

    expect(response.status).toBe(200);
    expect(transcribeAudio).toHaveBeenCalledOnce();
    expect(transcribeAudio.mock.calls[0]?.[0].audio).toHaveLength(11 * 1024 * 1024);
  });

  it('returns 503 for a missing OpenAI key without breaking authenticated Method reads', async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = '';
    vi.resetModules();
    try {
      const { createAgentRouter: createFreshAgentRouter } = await import('./agent.js');
      const app = testApp({
        storage: createStorage(), requireAuth: authenticated, agentEnabled: true,
        operationalLog: vi.fn(),
      }, createFreshAgentRouter);

      const workspace = await (await request(app)).get('/api/agent/workspace');
      const audio = await (await request(app)).post('/api/agent/audio/transcribe').send(WEBM_AUDIO);

      expect(workspace.status).toBe(200);
      expect(audio.status).toBe(503);
      expect(audio.body).toEqual({
        error: 'Transcription is unavailable', errorClass: 'OpenAITranscriptionError',
      });
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
      vi.resetModules();
    }
  });

  it('maps unavailable and provider failures without leaking payloads or retrying', async () => {
    const failure = new Error(SENTINEL);
    failure.name = 'AudioProviderFailure';
    const logs: Array<Record<string, unknown>> = [];
    const transcribeAudio = vi.fn()
      .mockRejectedValueOnce(new OpenAITranscriptionError('unavailable'))
      .mockRejectedValueOnce(failure);
    const app = testApp({
      storage: createStorage(),
      requireAuth: authenticated,
      agentEnabled: true,
      transcribeAudio,
      operationalLog: (entry) => logs.push(entry),
    });
    const unavailable = await (await request(app)).post('/api/agent/audio/transcribe').send(WEBM_AUDIO);
    const failed = await (await request(app)).post('/api/agent/audio/transcribe').send(WEBM_AUDIO);

    expect(unavailable.status).toBe(503);
    expect(failed.status).toBe(502);
    expect(transcribeAudio).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([unavailable.body, failed.body])).not.toContain(SENTINEL);
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
  });

  it('aborts the single provider dispatch at the 90-second deadline', async () => {
    vi.useFakeTimers();
    try {
      let providerSignal: AbortSignal | undefined;
      let providerStarted!: () => void;
      const started = new Promise<void>((resolve) => { providerStarted = resolve; });
      const transcribeAudio = vi.fn((input: { abortSignal?: AbortSignal }) => {
        providerSignal = input.abortSignal;
        providerStarted();
        return new Promise<string>((_resolve, reject) => {
          input.abortSignal?.addEventListener('abort', () => reject(input.abortSignal?.reason), { once: true });
        });
      });
      const responsePromise = Promise.resolve((await request(testApp({
        storage: createStorage(), requireAuth: authenticated, agentEnabled: true,
        transcribeAudio, operationalLog: vi.fn(),
      }))).post('/api/agent/audio/transcribe').send(WEBM_AUDIO));
      await started;
      await vi.advanceTimersByTimeAsync(90_000);
      const response = await responsePromise;

      expect(response.status).toBe(502);
      expect(providerSignal?.aborted).toBe(true);
      expect(transcribeAudio).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
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
    const responsePromise = Promise.resolve((await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      operationalLog: (entry) => logs.push(entry),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' }));
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
    const response = await (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({
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
    const storage = surface === 'agent'
      ? createStorage({ beginAgentTurn: vi.fn(async () => conflict) })
      : createPathSelectionStorage({ beginWorkspaceActionTurn: vi.fn(async () => conflict) });
    const app = testApp({ storage, requireAuth: authenticated, agentEnabled: true, operationalLog: vi.fn() });
    const response = surface === 'agent'
      ? await (await request(app)).post('/api/agent').send({ id: 'client-message-1', message: 'hello' })
      : await (await request(app)).post('/api/agent/workspace/operations').send(
        selectPurposePathRequest({ operationId: 'operation-1' }),
      );
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ status: 'conflict', retryable: true });
    expect(storage.persistCareerMapOperation).not.toHaveBeenCalled();
    expect(storage.getConversationMapping).not.toHaveBeenCalled();
  });

  it('returns empty history for a deleted mapping and redacts mapped-provider failures', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const emptyStorage = createStorage({ getConversationMapping: vi.fn(async () => undefined) });
    const emptyClient = { listItems: vi.fn() };
    const empty = await (await request(testApp({
      storage: emptyStorage, requireAuth: authenticated, agentEnabled: true,
      conversationClient: emptyClient, operationalLog: vi.fn(),
    }))).get('/api/agent/history');
    expect(empty.body).toEqual({ status: 'empty', messages: [] });
    expect(emptyClient.listItems).not.toHaveBeenCalled();

    const successLogs: Array<Record<string, unknown>> = [];
    const ready = await (await request(testApp({
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
            { id: 'message-1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: SENTINEL }] },
            { id: 'user-message-1', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'safe user text' }] },
          ],
          hasMore: false,
        })),
      },
      operationalLog: (entry) => successLogs.push(entry),
    }))).get('/api/agent/history');
    expect(ready.body.messages[1].parts[0].text).toBe(SENTINEL);
    expect(JSON.stringify(successLogs)).not.toContain(SENTINEL);

    const failed = await (await request(testApp({
      storage: createStorage({ getConversationMapping: vi.fn(async () => 'server-conversation') }),
      requireAuth: authenticated,
      agentEnabled: true,
      conversationClient: { listItems: vi.fn(async () => { throw new Error(SENTINEL); }) },
      operationalLog: (entry) => logs.push(entry),
    }))).get('/api/agent/history');
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.body)).not.toContain(SENTINEL);
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
  });

  it('maps a bounded owner-lock miss to a typed retryable 409', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const response = await (await request(testApp({
      storage: createStorage({ loadCareerMap: vi.fn(async () => { throw new MethodOwnerBusyError(); }) }),
      requireAuth: authenticated,
      agentEnabled: true,
      operationalLog: (entry) => logs.push(entry),
    }))).get('/api/agent/workspace');
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ errorClass: 'MethodOwnerBusyError', retryable: true });
    expect(logs.at(-1)).toMatchObject({ errorClass: 'MethodOwnerBusyError', status: 409 });
  });

  it('hashes client operation ids in operational logs', async () => {
    const rawOperationId = 'operation-PRIVATE-IDENTIFIER-sentinel';
    const logs: Array<Record<string, unknown>> = [];
    const response = await (await request(testApp({
      storage: createPathSelectionStorage(), ...directContinuationProvider(),
      requireAuth: authenticated, agentEnabled: true,
      now: () => new Date(timestamp(3)), operationalLog: (entry) => logs.push(entry),
    }))).post('/api/agent/workspace/operations').send(
      selectPurposePathRequest({ operationId: rawOperationId }),
    );
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
    const outbound = (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });
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
    const outbound = (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true, model,
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'hello' });
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
      operationalLog: vi.fn(),
    });
    const outbound = (await request(app))
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

    const next = await (await request(app))
      .post('/api/agent')
      .send({ id: 'client-message-2', message: 'Continue.' });
    expect(next.status).toBe(200);
    expect(storage.beginAgentTurn).toHaveBeenCalledTimes(2);
    expect(storage.releaseTurnLease).toHaveBeenCalledTimes(2);
  });

  it('routes an abort during durable completion through canonical cancellation recovery', async () => {
    let completionStarted!: () => void;
    const completionStartedGate = new Promise<void>((resolve) => { completionStarted = resolve; });
    const storage = createStorage({
      getConversationMapping: vi.fn(async () => 'server-conversation'),
      completeAgentTurn: vi.fn(async (input: { abortSignal?: AbortSignal }) => {
        completionStarted();
        return new Promise<never>((_resolve, reject) => {
          input.abortSignal?.addEventListener('abort', () => reject(input.abortSignal?.reason), { once: true });
        });
      }),
    });
    const model = new MockLanguageModelV4({ doStream: textStream('Safe reply before completion.') as never });
    const outbound = (await request(testApp({
      storage,
      requireAuth: authenticated,
      agentEnabled: true,
      model,
      conversationClient: { listItems: vi.fn(async () => ({ data: [], hasMore: false })) },
      operationalLog: vi.fn(),
    }))).post('/api/agent').send({ id: 'client-message-1', message: 'Help me reflect.' });
    const settled = Promise.resolve(outbound).catch(() => undefined);
    await completionStartedGate;
    outbound.abort();
    await settled;

    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());
    expect(storage.failAgentTurn).not.toHaveBeenCalled();
    expect(storage.cancelAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({
        kind: 'cancelled',
        stopped: true,
        refetch: true,
        revision: 1,
        operationCommitted: false,
        displayRecovery: expect.objectContaining({
          status: 'pending',
          retainPartial: true,
          assistantTextLength: 'Safe reply before completion.'.length,
        }),
      }),
    }));
    expect(storage.releaseTurnLease).toHaveBeenCalledOnce();
  });

  it('captures the cancellation baseline after lease acquisition so a foreign commit is not attributed to this turn', async () => {
    const beforeLease = pendingPaths();
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
            turnSequence: 4, occurredAt: timestamp(2),
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
    const storage = createPathSelectionStorage({
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
    const outbound = (await request(testApp({
      storage, requireAuth: authenticated, agentEnabled: true,
      now: () => new Date(timestamp(3)), operationalLog: vi.fn(),
    }))).post('/api/agent/workspace/operations').send(selectPurposePathRequest({
      operationId: 'operation-after-foreign-commit',
      expectedRevision: foreign.map.revision,
    }));
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
    const storage = createPathSelectionStorage();
    const persist = storage.persistCareerMapOperation;
    let releasePersist!: () => void;
    const persistGate = new Promise<void>((resolve) => { releasePersist = resolve; });
    let committed!: () => void;
    const committedSignal = new Promise<void>((resolve) => { committed = resolve; });
    persist.mockImplementationOnce(async (input) => {
      const result = await createPathSelectionStorage().persistCareerMapOperation(input);
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
    const body = selectPurposePathRequest({ operationId: 'operation-abort-after-commit' });
    const outbound = (await request(app)).post('/api/agent/workspace/operations').send(body);
    const settled = Promise.resolve(outbound).catch(() => undefined);
    await committedSignal;
    outbound.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    releasePersist();
    await settled;
    await vi.waitFor(() => expect(storage.cancelAgentTurn).toHaveBeenCalledOnce());

    const cancellation = storage.cancelAgentTurn.mock.calls[0]?.[0]?.result;
    expect(cancellation).toMatchObject({
      kind: 'cancelled', stopped: true, refetch: true, revision: 4, operationCommitted: true,
    });
    storage.beginWorkspaceActionTurn.mockResolvedValueOnce({
      status: 'terminal', shouldInvokeModel: false,
      turn: { ...turn('workspace-action', 'cancelled'), terminalResult: cancellation },
    });
    const replay = await (await request(app)).post('/api/agent/workspace/operations').send(body);

    expect(replay.status).toBe(409);
    expect(replay.body).toMatchObject({
      status: 'cancelled-replay', terminal: 'cancelled',
      result: { kind: 'cancelled', stopped: true, refetch: true, revision: 4, operationCommitted: true },
    });
    expect(persist).toHaveBeenCalledOnce();
  });
});

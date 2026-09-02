import { readFileSync } from 'node:fs';
import { openai } from '@ai-sdk/openai';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import {
  applyCareerMapOperation,
  createCareerMap,
  type CareerMap,
  type CareerMapOperation,
} from '../../shared/career-map/index.js';
import type { IStorage, PersistCareerMapResult } from '../storage.js';
import {
  createMethodAgent,
  METHOD_AGENT_RESPONSE_BUDGET,
  METHOD_INTERNAL_CONTEXT_MARKER,
  type MethodAgentTurnStreamResult,
} from './agent.js';
import { createMethodModuleLoader } from './method/loader.js';
import {
  NativeSearchEvidenceLedger,
  type NativeSearchClaimBinding,
  type NativeSearchEvidenceCaptureContext,
  type NativeSearchEvidenceManifestEntry,
  type NativeSearchStep,
  type ResearchSourceReference,
} from './research.js';

const explorerMessage = 'I lose track of time when I make complicated information useful.';
const timestamp = '2030-01-01T00:00:00.000Z';

function usage() {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
}

function textChunks(text: string) {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'answer' },
    { type: 'text-delta', id: 'answer', delta: text },
    { type: 'text-end', id: 'answer' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage() },
  ] as never;
}

function operationChunks(input: {
  callId: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  prematureText?: string;
}) {
  return [
    { type: 'stream-start', warnings: [] },
    ...(input.prematureText ? [
      { type: 'text-start', id: `pre-${input.callId}` },
      { type: 'text-delta', id: `pre-${input.callId}`, delta: input.prematureText },
      { type: 'text-end', id: `pre-${input.callId}` },
    ] : []),
    {
      type: 'tool-call', toolCallId: input.callId,
      toolName: input.toolName ?? 'append_foundation_evidence',
      input: JSON.stringify(input.toolInput ?? {
        id: `evidence-${input.callId}`, revision: 1,
        category: 'fascination', content: explorerMessage,
      }),
    },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
  ] as never;
}

function streamModel(responses: unknown[][] | ((index: number) => unknown[])) {
  let index = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const chunks = typeof responses === 'function' ? responses(index) : responses[index];
      index += 1;
      if (!chunks) throw new Error(`Unexpected provider Response ${index}.`);
      return { stream: simulateReadableStream({ chunks: chunks as never }) };
    },
  });
}

class InMemoryMethodStorage {
  constructor(public map: CareerMap = createCareerMap('explorer-1')) {}

  async loadCareerMap() {
    return { status: 'ready' as const, map: this.map };
  }

  async persistCareerMapOperation(input: { operation: CareerMapOperation }): Promise<PersistCareerMapResult> {
    const result = applyCareerMapOperation(this.map, input.operation);
    if (result.status === 'committed' || result.status === 'replayed') this.map = result.map;
    return result;
  }
}

function confirmedWhyMap(): CareerMap {
  const proposed = applyCareerMapOperation(createCareerMap('explorer-1'), {
    type: 'propose-why', sourceId: 'why-proposal', expectedRevision: 0, occurredAt: timestamp,
    payload: {
      why: {
        id: 'why-1', revision: 1, statement: 'Make evidence useful.',
        serves: 'People facing consequential choices',
        pointOfView: 'Small experiments should create agency.',
      },
      presentation: {
        kind: 'model-presentation', assistantTurnId: 'why-presentation',
        turnSequence: 1, completed: true, presentedAt: timestamp,
      },
    },
  });
  if (proposed.status !== 'committed') throw new Error('Why proposal fixture failed.');
  const confirmed = applyCareerMapOperation(proposed.map, {
    type: 'confirm-why', sourceId: 'why-confirmation', expectedRevision: 1, occurredAt: timestamp,
    payload: {
      whyId: 'why-1', whyRevision: 1,
      action: {
        kind: 'user-message', actionId: 'why-confirmation-message', turnId: 'why-confirmation-turn',
        turnSequence: 2, occurredAt: timestamp,
      },
    },
  });
  if (confirmed.status !== 'committed') throw new Error('Why confirmation fixture failed.');
  return confirmed.map;
}

class EvidenceLedgerFixture {
  readonly captures: Array<{
    step: NativeSearchStep;
    bindings: readonly NativeSearchClaimBinding[];
    context: NativeSearchEvidenceCaptureContext;
  }> = [];
  readonly failedAttempts: Array<{
    targets: ReadonlyArray<{ targetId: string; targetRevision: number }>;
    context: NativeSearchEvidenceCaptureContext;
  }> = [];
  private entries: NativeSearchEvidenceManifestEntry[] = [];

  async captureSettledStep(
    step: NativeSearchStep,
    bindings: readonly NativeSearchClaimBinding[],
    context: NativeSearchEvidenceCaptureContext,
  ) {
    this.captures.push({ step, bindings, context });
    if (bindings.length > 0) {
      this.entries = bindings.map((binding, index) => ({
        handle: `ev_current_turn_${index}`,
        ...binding,
        support: 'cited-provenance' as const,
        authority: 'none' as const,
      }));
    }
    return {
      status: this.entries.length ? 'succeeded' as const : 'ignored' as const,
      events: [], rejections: [], attempts: [], minted: this.entries,
    };
  }

  async recordFailedAttempt(
    targets: ReadonlyArray<{ targetId: string; targetRevision: number }>,
    context: NativeSearchEvidenceCaptureContext,
  ) {
    this.failedAttempts.push({ targets, context });
    return {
      status: 'failed' as const,
      events: [], rejections: [], attempts: [], minted: [],
    };
  }

  manifest() { return this.entries; }

  resolveSources(references: readonly ResearchSourceReference[], context: {
    targetId: string;
    targetRevision: number;
  }) {
    return references.map((reference) => {
      const entry = this.entries.find((candidate) => candidate.handle === reference.handle);
      if (!entry
        || entry.targetId !== context.targetId
        || entry.targetRevision !== context.targetRevision
        || entry.canonicalField !== reference.canonicalField
        || entry.exactClaim !== reference.exactClaim
      ) {
        const error = new Error('No current evidence handle.');
        error.name = 'NativeSearchEvidenceError';
        throw error;
      }
      return {
        kind: 'cited-research' as const,
        bindingVersion: 2 as const,
        sourceHandle: entry.handle,
        providerCallId: 'provider-call', providerResultId: `provider-result-${entry.handle}`,
        targetId: entry.targetId, targetRevision: entry.targetRevision,
        canonicalField: entry.canonicalField, exactClaim: entry.exactClaim,
        url: `https://example.com/${entry.handle}`, retrievedAt: timestamp,
        support: 'cited-provenance' as const,
        citation: {
          start: 0, end: entry.exactClaim.length,
          exactClaimStart: 0, exactClaimEnd: entry.exactClaim.length,
          textHash: 'a'.repeat(64),
        },
      };
    });
  }
}

async function collect(result: MethodAgentTurnStreamResult) {
  const parts: Array<Record<string, unknown>> = [];
  for await (const part of result.stream as never) parts.push(part as Record<string, unknown>);
  return parts;
}

async function makeAgent(input: {
  model: MockLanguageModelV4;
  storage?: InMemoryMethodStorage;
  evidence?: Parameters<typeof createMethodAgent>[0]['evidence'];
  abortSignal?: AbortSignal;
  onPreparedStep?: Parameters<typeof createMethodAgent>[0]['onPreparedStep'];
  onOperationStatus?: Parameters<typeof createMethodAgent>[0]['onOperationStatus'];
  onError?: (error: unknown) => void;
}) {
  const storage = input.storage ?? new InMemoryMethodStorage();
  const evidence = input.evidence ?? new EvidenceLedgerFixture();
  return {
    storage,
    evidence,
    agent: createMethodAgent({
      model: input.model,
      nativeWebSearchTool: openai.tools.webSearch({ searchContextSize: 'low' }),
      storage: storage as unknown as Pick<IStorage, 'loadCareerMap' | 'persistCareerMapOperation'>,
      loader: await createMethodModuleLoader(), evidence,
      userId: 'explorer-1', conversationId: 'conversation-server-owned',
      turn: {
        turnId: 'turn-1', leaseId: 'lease-1', clientMessageId: 'message-1',
        requestFingerprint: 'request-1', origin: 'agent-turn',
      },
      turnSequence: 1, occurredAt: timestamp, currentMessage: explorerMessage,
      abortSignal: input.abortSignal, onError: input.onError,
      onPreparedStep: input.onPreparedStep,
      onOperationStatus: input.onOperationStatus,
      internalContextMarker: (responseIndex) => `context-${responseIndex}`,
    }),
  };
}

describe('amended Method agent core loop', () => {
  it('has no preliminary classifier or internal no-write architecture', () => {
    const source = readFileSync(new URL('./agent.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/classifyMethodTurn|classifyConsequentialAuthorization|MethodTurnRoute/);
    expect(source).not.toMatch(/continue_natural_conversation|NATURAL_CONVERSATION_TOOL_NAME/);
    expect(source).not.toMatch(/\bgenerateText\b/);
  });

  it('uses one automatic-choice Response for natural conversation with no operation status', async () => {
    const model = streamModel([textChunks('Small experiments turn uncertainty into evidence.')]);
    const statuses = vi.fn();
    const { agent, storage } = await makeAgent({ model, onOperationStatus: statuses });
    const output = await collect(await agent.stream({ prompt: explorerMessage }));

    expect(JSON.stringify(output)).toContain('Small experiments turn uncertainty into evidence.');
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(statuses).not.toHaveBeenCalled();
    expect(storage.map.revision).toBe(0);
    expect(model.doStreamCalls[0]?.toolChoice).toEqual({ type: 'auto' });
    expect(model.doStreamCalls[0]?.tools?.map((candidate) => candidate.name)).toContain('web_search');
    expect(model.doStreamCalls[0]?.tools?.map((candidate) => candidate.name))
      .not.toContain('continue_natural_conversation');
    expect(model.doStreamCalls[0]?.providerOptions?.openai).toMatchObject({
      conversation: 'conversation-server-owned', store: true,
      parallelToolCalls: false, reasoningEffort: 'low',
      include: ['web_search_call.results'],
    });
  });

  it.each(['committed', 'idempotent-replay', 'conflict', 'rejected'] as const)(
    'withholds premature %s prose and releases only later authoritative narration',
    async (status) => {
      const model = streamModel([
        operationChunks({ callId: `${status}-call`, prematureText: `Premature ${status} claim.` }),
        textChunks(`Meaningful ${status} next step.`),
      ]);
      const storage = new InMemoryMethodStorage();
      if (status !== 'committed') {
        storage.persistCareerMapOperation = vi.fn(async (input: { operation: CareerMapOperation }) => {
          if (status === 'idempotent-replay') {
            const first = applyCareerMapOperation(storage.map, input.operation);
            if (first.status !== 'committed') return first;
            storage.map = first.map;
            return { status: 'replayed' as const, map: storage.map, receipt: first.receipt };
          }
          return {
            status: 'rejected' as const, map: storage.map,
            error: {
              code: status === 'conflict' ? 'revision-conflict' as const : 'illegal-transition' as const,
              message: 'synthetic',
            },
          };
        }) as never;
      }
      const statuses: Array<Record<string, unknown>> = [];
      const { agent } = await makeAgent({
        model,
        storage,
        onOperationStatus: (event) => { statuses.push(event); },
      });
      const output = await collect(await agent.stream({ prompt: explorerMessage }));

      expect(JSON.stringify(output)).not.toContain(`Premature ${status} claim.`);
      expect(JSON.stringify(output)).toContain(`Meaningful ${status} next step.`);
      expect(model.doStreamCalls).toHaveLength(2);
      expect(statuses).toEqual([
        expect.objectContaining({ phase: 'saving', operationId: `${status}-call` }),
        expect.objectContaining({
          phase: 'terminal', operationId: `${status}-call`,
          status: status === 'committed' || status === 'idempotent-replay'
            ? 'saved'
            : status,
        }),
      ]);
    },
  );

  it('reuses one ToolLoopAgent and Conversation while refreshing lower-priority state', async () => {
    const model = streamModel([
      operationChunks({ callId: 'write-1', prematureText: 'Saved already.' }),
      textChunks('The new evidence gives us a concrete pattern to examine.'),
    ]);
    const traces: Array<Record<string, unknown>> = [];
    const { agent } = await makeAgent({ model, onPreparedStep: (trace) => traces.push(trace) });
    const originalAgent = agent.toolLoopAgent;
    await collect(await agent.stream({ prompt: explorerMessage }));

    expect(agent.toolLoopAgent).toBe(originalAgent);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(traces.map((trace) => trace.mapRevision)).toEqual([0, 1]);
    expect(traces.every((trace) => (trace.activeTools as string[]).includes('web_search'))).toBe(true);
    const requestPrompts = model.doStreamCalls.map((call) => call.prompt as Array<{
      role?: string;
      content?: unknown;
    }>);
    const explorerInputs = requestPrompts.flat().filter((message) => (
      message.role === 'user'
      && Array.isArray(message.content)
      && message.content.length === 1
      && (message.content[0] as { type?: string; text?: string }).type === 'text'
      && (message.content[0] as { text?: string }).text === explorerMessage
    ));
    const requests = requestPrompts.map((prompt) => JSON.stringify(prompt));
    expect(explorerInputs).toHaveLength(1);
    expect(requests[0]).toContain(METHOD_INTERNAL_CONTEXT_MARKER);
    expect(requests[1]).toContain(METHOD_INTERNAL_CONTEXT_MARKER);
    expect(requestPrompts[1]).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: [expect.objectContaining({ type: 'text', text: explorerMessage })],
      }),
    ]));
    expect(requests[1]).toContain('tool-result');
    const instructions = model.doStreamCalls.map((call) => String(call.providerOptions?.openai?.instructions));
    expect(instructions.every((value) => !value.includes(explorerMessage))).toBe(true);
    expect(instructions.every((value) => !value.includes('Focused Career Map'))).toBe(true);
    expect(model.doStreamCalls[0]?.providerOptions?.openai).toHaveProperty('contextManagement');
    expect(model.doStreamCalls[1]?.providerOptions?.openai).not.toHaveProperty('contextManagement');
  });

  it('captures prospective same-Response bindings before exposing the refreshed manifest', async () => {
    const claim = 'A small public explainer can test whether this work is useful.';
    const evidence = new EvidenceLedgerFixture();
    const storage = new InMemoryMethodStorage();
    const model = streamModel([
      operationChunks({
        callId: 'premature', toolName: 'propose_purpose_paths',
        toolInput: {
          setId: 'set-1', setRevision: 1,
          paths: [{
            id: 'path-1', possibility: claim,
            researchSources: [{
              handle: 'not-yet-minted',
              canonicalField: 'purposePath.possibility',
              exactClaim: claim,
            }],
          }],
        },
      }),
      textChunks('The evidence handle is available only after the settled boundary.'),
    ]);
    const { agent } = await makeAgent({ model, storage, evidence });
    const output = await collect(await agent.stream({ prompt: 'Research one exact claim.' }));

    expect(evidence.captures[0]?.bindings).toEqual([expect.objectContaining({ exactClaim: claim })]);
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain('ev_current_turn_0');
    expect(JSON.stringify(output)).toContain('available only after the settled boundary');
  });

  it('marks native search before same-Response custom execution and rejects missing handles', async () => {
    const storage = new InMemoryMethodStorage(confirmedWhyMap());
    const path = (number: number) => ({
      id: `path-${number}`, revision: 1, name: `Path ${number}`,
      servesWhy: `Serve ${number}`, possibility: `Possibility ${number}`,
      evidence: [`Evidence ${number}`], centralUnknown: `Unknown ${number}`,
      projectPreview: `Project ${number}`, practicalFit: `Fit ${number}`,
      researchSources: null, userSources: null,
    });
    const model = streamModel([
      [
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call', toolCallId: 'search-then-write', toolName: 'web_search',
          input: JSON.stringify({ action: { type: 'search', query: 'current evidence' } }),
          providerExecuted: true,
        },
        {
          type: 'tool-result', toolCallId: 'search-then-write', toolName: 'web_search',
          input: { action: { type: 'search', query: 'current evidence' } },
          output: { type: 'json', value: { type: 'computer_initialize_state', id: 'result-1', os_type: 'computer' } },
          providerExecuted: true,
        },
        {
          type: 'tool-call', toolCallId: 'unsupported-same-response', toolName: 'propose_purpose_paths',
          input: JSON.stringify({ setId: 'set-1', setRevision: 1, paths: [path(1), path(2), path(3)] }),
        },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
      ],
      textChunks('I need claim-linked evidence before proposing those paths.'),
    ]);
    const { agent } = await makeAgent({ model, storage });
    await expect(collect(await agent.stream({ prompt: 'Research and propose three paths.' })))
      .rejects.toMatchObject({ name: 'NativeSearchResolutionError' });

    expect(storage.map.revision).toBe(2);
    expect(model.doStreamCalls).toHaveLength(2);
  });

  it('keeps cited same-Response writes unresolved and continues after an ungrounded retry rejects', async () => {
    const storage = new InMemoryMethodStorage(confirmedWhyMap());
    const path = (number: number) => ({
      id: `path-${number}`, revision: 1, name: `Path ${number}`,
      servesWhy: `Serve ${number}`, possibility: `Possibility ${number}`,
      evidence: [`Evidence ${number}`], centralUnknown: `Unknown ${number}`,
      projectPreview: `Project ${number}`, practicalFit: `Fit ${number}`,
      researchSources: null, userSources: null,
    });
    const citedText = 'Current evidence supports a bounded experiment.';
    const url = 'https://example.com/current-evidence';
    const model = streamModel([
      [
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call', toolCallId: 'cited-search', toolName: 'web_search',
          input: JSON.stringify({ action: { type: 'search', query: 'current evidence' } }),
          providerExecuted: true,
        },
        {
          type: 'tool-result', toolCallId: 'cited-search', toolName: 'web_search',
          input: { action: { type: 'search', query: 'current evidence' } },
          result: { action: { type: 'search', sources: [{ id: 'result-1', url, text: citedText }] } },
          providerExecuted: true,
        },
        { type: 'text-start', id: 'cited-answer' },
        {
          type: 'text-delta', id: 'cited-answer', delta: citedText,
          providerMetadata: {
            openai: {
              annotations: [{
                type: 'url_citation', url, start_index: 0, end_index: citedText.length,
              }],
            },
          },
        },
        { type: 'text-end', id: 'cited-answer' },
        {
          type: 'tool-call', toolCallId: 'unbound-write', toolName: 'propose_purpose_paths',
          input: JSON.stringify({ setId: 'set-1', setRevision: 1, paths: [path(1), path(2), path(3)] }),
        },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
      ],
      operationChunks({
        callId: 'unbound-retry', toolName: 'propose_purpose_paths',
        toolInput: { setId: 'set-1', setRevision: 1, paths: [path(1), path(2), path(3)] },
      }),
      textChunks('I could not ground that proposal, so let us refine the next research step.'),
    ]);
    const { agent, evidence } = await makeAgent({ model, storage });

    const output = await collect(await agent.stream({ prompt: 'Research and propose current paths.' }));

    expect(storage.map.revision).toBe(2);
    expect(evidence.manifest()).toEqual([]);
    expect(model.doStreamCalls).toHaveLength(3);
    expect(JSON.stringify(output)).toContain('could not ground that proposal');
  });

  it('ledgers settled search before a strict retry commits and releases only later authoritative prose', async () => {
    const storage = new InMemoryMethodStorage(confirmedWhyMap());
    const attempts: unknown[] = [];
    const evidence = new NativeSearchEvidenceLedger({
      storage: {
        recordResearchAttempt: vi.fn(async (_userId, _leaseId, attempt) => {
          attempts.push(attempt);
          return attempt;
        }),
      } as never,
      userId: 'explorer-1', turnId: 'turn-1', leaseId: 'lease-1',
      now: () => new Date(timestamp), handleSecret: new Uint8Array(32).fill(9),
    });
    const claims = [1, 2, 3].map((number) => `Current evidence supports bounded experiment ${number}.`);
    const researchText = claims.join(' ');
    const url = 'https://example.com/current-experiments';
    const path = (number: number, handle: string) => ({
      id: `path-${number}`, revision: 1, name: `Path ${number}`,
      servesWhy: `Serve ${number}`, possibility: `Possibility ${number}`,
      evidence: [`Evidence ${number}`], centralUnknown: `Unknown ${number}`,
      projectPreview: `Project ${number}`, practicalFit: claims[number - 1],
      researchSources: [{
        handle, canonicalField: 'purposePath.practicalFit', exactClaim: claims[number - 1],
      }],
      userSources: null,
    });
    let responseIndex = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        const index = responseIndex;
        responseIndex += 1;
        if (index === 0) {
          const providerResult = { id: 'provider-result', url, text: researchText };
          return {
            stream: simulateReadableStream({ chunks: [
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call', toolCallId: 'provider-search', toolName: 'web_search',
                input: JSON.stringify({ action: { type: 'search', query: 'current bounded experiments' } }),
                providerExecuted: true,
              },
              {
                type: 'tool-result', toolCallId: 'provider-search', toolName: 'web_search',
                input: { action: { type: 'search', query: 'current bounded experiments' } },
                result: { action: { type: 'search', sources: [providerResult] } },
                providerExecuted: true,
              },
              { type: 'text-start', id: 'premature-research' },
              {
                type: 'text-delta', id: 'premature-research', delta: researchText,
                providerMetadata: {
                  openai: {
                    annotations: claims.map((claim) => ({
                      type: 'url_citation', url,
                      start_index: researchText.indexOf(claim),
                      end_index: researchText.indexOf(claim) + claim.length,
                    })),
                  },
                },
              },
              { type: 'text-end', id: 'premature-research' },
              {
                type: 'tool-call', toolCallId: 'premature-write', toolName: 'propose_purpose_paths',
                input: JSON.stringify({
                  setId: 'set-1', setRevision: 1,
                  paths: [path(1, 'not-minted-1'), path(2, 'not-minted-2'), path(3, 'not-minted-3')],
                }),
              },
              { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
            ] as never }),
            response: {
              body: {
                output: [{
                  type: 'web_search_call', id: 'provider-search',
                  action: { type: 'search', sources: [providerResult] },
                  results: [providerResult],
                }],
              },
            },
          };
        }
        if (index === 1) {
          const handles = evidence.manifest();
          if (handles.length !== 3) throw new Error('Settled evidence manifest was not ready before retry.');
          return {
            stream: simulateReadableStream({ chunks: operationChunks({
              callId: 'strict-retry', toolName: 'propose_purpose_paths',
              toolInput: {
                setId: 'set-1', setRevision: 1,
                paths: handles.map((entry, handleIndex) => path(handleIndex + 1, entry.handle)),
              },
            }) }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: textChunks('These three experiments now give us concrete choices to discuss.'),
          }),
        };
      },
    });
    const statuses: Array<Record<string, unknown>> = [];
    const { agent } = await makeAgent({
      model, storage, evidence,
      onOperationStatus: (event) => { statuses.push(event); },
    });
    const output = await collect(await agent.stream({ prompt: 'Research and propose three current paths.' }));

    expect(storage.map.revision).toBe(3);
    expect(attempts).toHaveLength(3);
    expect(evidence.manifest()).toHaveLength(3);
    expect(model.doStreamCalls).toHaveLength(3);
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain(evidence.manifest()[0]!.handle);
    expect(JSON.stringify(output)).not.toContain(researchText);
    expect(JSON.stringify(output)).toContain('concrete choices to discuss');
    expect(statuses.map((event) => [event.phase, 'status' in event ? event.status : undefined])).toEqual([
      ['saving', undefined], ['terminal', 'rejected'],
      ['saving', undefined], ['terminal', 'saved'],
    ]);
  });

  it.each([
    ['conflict', 'conflict'],
    ['rejected', 'rejected'],
    ['failed', 'failed'],
  ] as const)(
    'leaves strict research resolution after an authoritative %s retry result',
    async (outcome, expectedStatus) => {
      const storage = new InMemoryMethodStorage(confirmedWhyMap());
      const evidence = new EvidenceLedgerFixture();
      const claims = [1, 2, 3].map((number) => `Current evidence supports bounded experiment ${number}.`);
      const path = (number: number, handle: string) => ({
        id: `path-${number}`, revision: 1, name: `Path ${number}`,
        servesWhy: `Serve ${number}`, possibility: `Possibility ${number}`,
        evidence: [`Evidence ${number}`], centralUnknown: `Unknown ${number}`,
        projectPreview: `Project ${number}`, practicalFit: claims[number - 1],
        researchSources: [{
          handle,
          canonicalField: 'purposePath.practicalFit',
          exactClaim: claims[number - 1],
        }],
        userSources: null,
      });
      if (outcome === 'conflict') {
        storage.persistCareerMapOperation = vi.fn(async () => ({
          status: 'rejected' as const,
          map: storage.map,
          error: { code: 'revision-conflict' as const, message: 'The prepared revision is stale.' },
        }));
      } else if (outcome === 'failed') {
        storage.persistCareerMapOperation = vi.fn(async () => {
          throw new Error('Storage unavailable.');
        });
      }
      let responseIndex = 0;
      const model = new MockLanguageModelV4({
        doStream: async () => {
          const index = responseIndex;
          responseIndex += 1;
          if (index === 0) {
            return {
              stream: simulateReadableStream({ chunks: [
                { type: 'stream-start', warnings: [] },
                {
                  type: 'tool-call', toolCallId: 'provider-search', toolName: 'web_search',
                  input: JSON.stringify({ action: { type: 'search', query: 'bounded experiments' } }),
                  providerExecuted: true,
                },
                {
                  type: 'tool-result', toolCallId: 'provider-search', toolName: 'web_search',
                  input: { action: { type: 'search', query: 'bounded experiments' } },
                  result: { action: { type: 'search', sources: [] } },
                  providerExecuted: true,
                },
                {
                  type: 'tool-call', toolCallId: 'premature-write', toolName: 'propose_purpose_paths',
                  input: JSON.stringify({
                    setId: 'set-1', setRevision: 1,
                    paths: [1, 2, 3].map((number) => path(number, `premature-${number}`)),
                  }),
                },
                { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: usage() },
              ] as never }),
            };
          }
          if (index === 1) {
            const handles = evidence.manifest();
            const retryHandles = outcome === 'rejected'
              ? handles.map((entry) => `stale-${entry.handle}`)
              : handles.map((entry) => entry.handle);
            return {
              stream: simulateReadableStream({ chunks: operationChunks({
                callId: 'strict-retry',
                toolName: 'propose_purpose_paths',
                toolInput: {
                  setId: 'set-1', setRevision: 1,
                  paths: retryHandles.map((handle, handleIndex) => path(handleIndex + 1, handle)),
                },
              }) }),
            };
          }
          return {
            stream: simulateReadableStream({
              chunks: textChunks('The authoritative result is clear, so we can choose the next step.'),
            }),
          };
        },
      });
      const statuses: Array<Record<string, unknown>> = [];
      const { agent } = await makeAgent({
        model,
        storage,
        evidence,
        onOperationStatus: (event) => { statuses.push(event); },
      });

      const output = await collect(await agent.stream({ prompt: 'Research and propose current paths.' }));

      expect(model.doStreamCalls).toHaveLength(3);
      expect(JSON.stringify(output)).toContain('authoritative result is clear');
      expect(statuses.filter((event) => event.phase === 'terminal').at(-1)).toMatchObject({
        status: expectedStatus,
      });
    },
  );

  it('stops after one search-only Response that has no display-eligible citation', async () => {
    const model = streamModel(() => [
      { type: 'stream-start', warnings: [] },
      {
        type: 'tool-call', toolCallId: 'uncited-search', toolName: 'web_search',
        input: JSON.stringify({ action: { type: 'search', query: 'current registry' } }),
        providerExecuted: true,
      },
      {
        type: 'tool-result', toolCallId: 'uncited-search', toolName: 'web_search',
        input: { action: { type: 'search', query: 'current registry' } },
        result: { action: { type: 'search', sources: [] } },
        providerExecuted: true,
      },
      { type: 'text-start', id: 'uncited-answer' },
      { type: 'text-delta', id: 'uncited-answer', delta: 'An unsupported current claim.' },
      { type: 'text-end', id: 'uncited-answer' },
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage() },
    ]);
    const { agent } = await makeAgent({ model });

    await expect(collect(await agent.stream({ prompt: 'What does the current registry say?' })))
      .rejects.toMatchObject({ name: 'NativeSearchResolutionError' });
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it('records a source-free failed attempt against the exact current map when search fails before a claim exists', async () => {
    const evidence = new EvidenceLedgerFixture();
    const model = streamModel([
      [
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call', toolCallId: 'failed-search', toolName: 'web_search',
          input: JSON.stringify({ action: { type: 'search', query: 'current evidence' } }),
          providerExecuted: true,
        },
        {
          type: 'tool-error', toolCallId: 'failed-search', toolName: 'web_search',
          input: { action: { type: 'search', query: 'current evidence' } },
          error: new Error('private provider detail'),
          providerExecuted: true,
        },
        { type: 'finish', finishReason: { unified: 'error', raw: 'error' }, usage: usage() },
      ],
    ]);
    const { agent } = await makeAgent({ model, evidence });
    await expect(collect(await agent.stream({ prompt: 'Check what is current.' })))
      .rejects.toMatchObject({ name: 'NativeSearchUnavailableError' });

    expect(model.doStreamCalls).toHaveLength(1);
    expect(evidence.failedAttempts).toEqual([{
      targets: [{ targetId: 'explorer-1', targetRevision: 0 }],
      context: expect.objectContaining({ checkpoint: 'form-foundation' }),
    }]);
    expect(evidence.captures).toEqual([]);
  });

  it('stops at the hard 20-Response budget without releasing dependent prose', async () => {
    const model = streamModel((index) => operationChunks({
      callId: `write-${index}`, prematureText: `Premature response ${index}.`,
    }));
    const { agent } = await makeAgent({ model });
    const result = await agent.stream({ prompt: explorerMessage });
    const output = await collect(result);

    expect(await result.responseCount).toBe(METHOD_AGENT_RESPONSE_BUDGET);
    expect(model.doStreamCalls).toHaveLength(METHOD_AGENT_RESPONSE_BUDGET);
    expect(JSON.stringify(output)).not.toContain('Premature response');
  });

  it('drops buffered content and starts no later Response after abort', async () => {
    const controller = new AbortController();
    const model = streamModel([
      operationChunks({ callId: 'aborted-call', prematureText: 'Must not escape.' }),
      textChunks('Must never be requested.'),
    ]);
    const { agent } = await makeAgent({
      model, abortSignal: controller.signal,
      onOperationStatus: (event) => {
        if (event.phase === 'saving') controller.abort(new DOMException('Stopped', 'AbortError'));
      },
    });
    const output = await collect(await agent.stream({ prompt: explorerMessage, abortSignal: controller.signal }));

    expect(model.doStreamCalls).toHaveLength(1);
    expect(JSON.stringify(output)).not.toContain('Must not escape');
    expect(output.some((part) => part.type === 'abort')).toBe(true);
  });

  it('retains privacy-safe retry behavior without exposing provider payloads', async () => {
    const sentinel = 'PRIVATE-RETRY-SENTINEL';
    let attempt = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        attempt += 1;
        if (attempt === 1) {
          const error = new Error(sentinel) as Error & { statusCode: number; isRetryable: boolean };
          Object.assign(error, { name: 'AI_APICallError', statusCode: 503, isRetryable: true });
          throw error;
        }
        return { stream: simulateReadableStream({ chunks: textChunks('Safe after retry.') }) };
      },
    });
    const observedErrors: unknown[] = [];
    const { agent } = await makeAgent({ model, onError: (error) => observedErrors.push(error) });
    const output = await collect(await agent.stream({ prompt: explorerMessage }));

    expect(attempt).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify({ output, observedErrors })).not.toContain(sentinel);
  });

  it('does not write prepareStep failures through the SDK default console logger', async () => {
    const sentinel = 'PRIVATE-PREPARE-STEP-SENTINEL';
    const storage = new InMemoryMethodStorage();
    storage.loadCareerMap = vi.fn(async () => {
      throw new Error(sentinel);
    });
    const observedErrors: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { agent } = await makeAgent({
        model: streamModel([textChunks('Must never be requested.')]),
        storage,
        onError: (error) => { observedErrors.push(error); },
      });

      await expect(collect(await agent.stream({ prompt: explorerMessage }))).rejects.toBeDefined();
      expect(observedErrors).toHaveLength(1);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sentinel);
    } finally {
      consoleError.mockRestore();
    }
  });
});

import { createOpenAI } from '@ai-sdk/openai';
import { describe, expect, it } from 'vitest';
import { applyCareerMapOperation, createCareerMap, type CareerMap, type CareerMapOperation } from '../../shared/career-map/index.js';
import type { IStorage, PersistCareerMapResult } from '../storage.js';
import { createMethodAgent, REVELIO_AGENT_MODEL } from './agent.js';
import { createMethodModuleLoader } from './method/loader.js';

const timestamp = '2030-01-01T00:00:00.000Z';

class InMemoryMethodStorage {
  constructor(public map: CareerMap) {}
  async listAgentTurns() {
    return this.map.pathSets.map((set) => ({ turnId: set.presentation.assistantTurnId,
      origin: 'agent-turn', status: 'completed', terminalResult: { kind: 'completed' } }));
  }
  async loadCareerMap() { return { status: 'ready' as const, map: this.map }; }
  async persistCareerMapOperation(input: { operation: CareerMapOperation }): Promise<PersistCareerMapResult> {
    const result = applyCareerMapOperation(this.map, input.operation);
    if (result.status === 'committed' || result.status === 'replayed') this.map = result.map;
    return result;
  }
}

function pendingWhyMap(): CareerMap {
  const result = applyCareerMapOperation(createCareerMap('explorer-1'), {
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
  if (result.status !== 'committed') throw new Error('Why proposal fixture failed.');
  return result.map;
}

function confirmedWhyMap(): CareerMap {
  const map = pendingWhyMap();
  const result = applyCareerMapOperation(map, {
    type: 'confirm-why', sourceId: 'why-confirmation', expectedRevision: map.revision,
    occurredAt: timestamp,
    payload: {
      whyId: 'why-1', whyRevision: 1,
      action: {
        kind: 'user-message', actionId: 'why-confirmation-message', turnId: 'why-confirmation-turn',
        turnSequence: 2, occurredAt: timestamp,
      },
    },
  });
  if (result.status !== 'committed') throw new Error('Why confirmation fixture failed.');
  return result.map;
}

function pendingPathsMap(): CareerMap {
  let map = confirmedWhyMap();
  const commit = (operation: CareerMapOperation) => {
    const result = applyCareerMapOperation(map, operation);
    if (result.status !== 'committed') throw new Error(`${operation.type} fixture failed.`);
    map = result.map;
  };
  const path = (number: number) => ({
    id: `path-${number}`, revision: 1, name: `Path ${number}`,
    servesWhy: `Serve ${number}`, possibility: `Possibility ${number}`,
    evidence: [`Evidence ${number}`], centralUnknown: `Unknown ${number}`,
    projectPreview: `Project ${number}`, practicalFit: `Fit ${number}`,
  });
  commit({
    type: 'propose-purpose-paths', sourceId: 'paths-proposal', expectedRevision: map.revision,
    occurredAt: timestamp, payload: {
      setId: 'set-1', setRevision: 1, paths: [path(1), path(2), path(3)],
      presentation: {
        kind: 'model-presentation', assistantTurnId: 'paths-presentation',
        turnSequence: 3, completed: true, presentedAt: timestamp,
      },
    },
  });
  return map;
}

function selectedPathMap(): CareerMap {
  const map = pendingPathsMap();
  const result = applyCareerMapOperation(map, {
    type: 'select-purpose-path', sourceId: 'direct-path-selection', expectedRevision: map.revision,
    occurredAt: timestamp, payload: {
      setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1,
      action: {
        kind: 'ui-action', actionId: 'workspace-message-1', turnId: 'workspace-turn-1',
        turnSequence: 4, occurredAt: timestamp,
      },
    },
  });
  if (result.status !== 'committed') throw new Error('Direct path selection fixture failed.');
  return result.map;
}

type WireRequest = {
  model: string; reasoning: { effort: string }; conversation: string; store: boolean;
  parallel_tool_calls: boolean; tools: Array<{ type: string; name?: string }>;
  instructions: string; context_management?: unknown;
};
type ToolReply = { name: string; input: Record<string, unknown> };

// Exercise the real SDK serializer and stream parser while keeping every HTTP call local.
function responseStream(index: number, reply?: ToolReply): Response {
  const id = `response-${index}`;
  const item = reply
    ? { type: 'function_call', id: `item-${index}`, call_id: `call-${index}`,
      name: reply.name, arguments: JSON.stringify(reply.input), status: 'completed' }
    : { type: 'message', id: `item-${index}` };
  const events = [
    { type: 'response.created', response: { id, created_at: 1, model: REVELIO_AGENT_MODEL } },
    { type: 'response.output_item.added', output_index: 0, item },
    ...(!reply ? [{ type: 'response.output_text.delta', item_id: item.id,
      output_index: 0, delta: 'What would you like to make next?' }] : []),
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 1 } } },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function run(map: CareerMap, message = 'Help me explore.', firstReply?: ToolReply, replayReasoningEffort?: 'low' | 'high') {
  const requests: WireRequest[] = [];
  const storage = new InMemoryMethodStorage(map);
  const provider = createOpenAI({ apiKey: 'local-test-key', fetch: async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)) as WireRequest);
    if (requests.length > (firstReply ? 2 : 1)) throw new Error('Unexpected extra provider request.');
    return responseStream(requests.length, requests.length === 1 ? firstReply : undefined);
  } });
  const agent = createMethodAgent({
    model: provider.responses(REVELIO_AGENT_MODEL), nativeWebSearchTool: provider.tools.webSearch(),
    storage: storage as unknown as Pick<IStorage, 'loadCareerMap' | 'persistCareerMapOperation' | 'listAgentTurns'>,
    loader: await createMethodModuleLoader(), userId: 'explorer-1', conversationId: 'conv_local_test',
    turn: { turnId: 'current-turn', leaseId: 'lease', clientMessageId: 'current-message',
      requestFingerprint: 'request', origin: 'agent-turn' },
    turnSequence: 4, occurredAt: timestamp, currentMessage: message, replayReasoningEffort,
  });
  const result = await agent.stream({ prompt: message });
  const reader = result.stream.getReader();
  while (!(await reader.read()).done) { /* Finish all tool execution and refreshed provider requests. */ }
  return { requests, map: storage.map };
}

function expectControls(request: WireRequest) {
  expect(request.model).toBe(REVELIO_AGENT_MODEL);
  expect(request.conversation).toBe('conv_local_test');
  expect(request.store).toBe(true);
  expect(request.parallel_tool_calls).toBe(false);
  expect(request.tools.some((tool) => tool.type === 'web_search')).toBe(true);
}

describe('production effort at the outgoing Responses HTTP boundary', () => {
  it.each([
    ['Foundation', () => createCareerMap('explorer-1'), 'low'],
    ['Paths creation', confirmedWhyMap, 'high'],
    ['Paths revision, replacement and combination', pendingPathsMap, 'high'],
    ['Project development', selectedPathMap, 'medium'],
  ] as const)('uses the canonical checkpoint for %s', async (_label, fixture, effort) => {
    const { requests } = await run(fixture());
    expect(requests).toHaveLength(1);
    expect(requests[0].reasoning.effort).toBe(effort);
    expectControls(requests[0]);
    if (_label === 'Paths revision, replacement and combination') {
      const names = requests[0].tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining(['revise_purpose_paths', 'combine_purpose_paths', 'select_purpose_path']));
    }
  });

  it('keeps the trusted replay LOW override on a Paths checkpoint', async () => {
    const { requests } = await run(pendingPathsMap(), 'Help me explore.', undefined, 'low');
    expect(requests).toHaveLength(1);
    expect(requests[0].reasoning.effort).toBe('low');
    expectControls(requests[0]);
  });

  it('switches HIGH to MEDIUM immediately after selecting a path in the same turn', async () => {
    const { requests, map } = await run(pendingPathsMap(), '1', {
      name: 'select_purpose_path', input: { setId: 'set-1', setRevision: 1,
        pathId: 'path-1', pathRevision: 1, presentedInTurnId: 'paths-presentation',
        sourceMessageId: 'current-message' },
    });
    expect(map.pathSets.at(-1)?.paths[0].selection).toBe('active');
    expect(requests.map((request) => request.reasoning.effort)).toEqual(['high', 'medium']);
    for (const request of requests) expectControls(request);
    expect(requests[1].tools.map((tool) => tool.name)).toContain('propose_first_project');
    expect(requests[1].tools.map((tool) => tool.name)).not.toContain('select_purpose_path');
  });

  it('switches LOW to HIGH immediately after confirming the North Star in the same turn', async () => {
    const { requests, map } = await run(pendingWhyMap(), 'That captures my North Star. Go ahead.', {
      name: 'confirm_why', input: { whyId: 'why-1', whyRevision: 1,
        presentedInTurnId: 'why-presentation', sourceMessageId: 'current-message' },
    });
    expect(map.foundation.whyRevisions.at(-1)?.status).toBe('confirmed');
    expect(requests.map((request) => request.reasoning.effort)).toEqual(['low', 'high']);
    for (const request of requests) expectControls(request);
    expect(requests[1].tools.map((tool) => tool.name)).toContain('propose_purpose_paths');
  });
});

import { simulateReadableStream } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { APICallError } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import {
  applyCareerMapOperation,
  createCareerMap,
  deriveMethodCheckpoint,
  type CareerMap,
  type CareerMapOperation,
} from '../../shared/career-map/index.js';
import type { IStorage, PersistCareerMapResult } from '../storage.js';
import { createMethodModuleLoader } from './method/loader.js';
import {
  classifyConsequentialAuthorization,
  classifyMethodTurn,
  createMethodAgent,
  createResultBarrierTransform,
  projectMethodStreamForDisplay,
} from './agent.js';
import { refreshMethodState } from './tools.js';

const timestamp = (second: number) => `2030-01-01T00:00:${String(second).padStart(2, '0')}.000Z`;

function usage() {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
}

function modelResult(content: Array<Record<string, unknown>>, finish: 'stop' | 'tool-calls') {
  return {
    content,
    finishReason: { unified: finish, raw: finish },
    usage: usage(),
    warnings: [],
  } as never;
}

function expectOpenAIStrictObjectSchemas(schema: unknown): void {
  if (Array.isArray(schema)) {
    for (const item of schema) expectOpenAIStrictObjectSchemas(item);
    return;
  }
  if (!schema || typeof schema !== 'object') return;
  const value = schema as Record<string, unknown>;
  if (value.type === 'object' && value.properties && typeof value.properties === 'object') {
    expect(new Set(value.required as string[] | undefined)).toEqual(
      new Set(Object.keys(value.properties as Record<string, unknown>)),
    );
  }
  for (const child of Object.values(value)) expectOpenAIStrictObjectSchemas(child);
}

function action(sequence: number, turnId = `user-turn-${sequence}`) {
  return {
    kind: 'user-message' as const,
    actionId: `message-${sequence}`,
    turnId,
    turnSequence: sequence,
    occurredAt: timestamp(sequence),
  };
}

function presentation(sequence: number, turnId = `assistant-turn-${sequence}`) {
  return {
    kind: 'model-presentation' as const,
    assistantTurnId: turnId,
    turnSequence: sequence,
    completed: true as const,
    presentedAt: timestamp(sequence),
  };
}

function paths() {
  return [1, 2, 3].map((number) => ({
    id: `path-${number}`,
    revision: 1,
    name: `Path ${number}`,
    servesWhy: `Serve the confirmed Why through approach ${number}`,
    possibility: `A concrete possibility ${number}`,
    evidence: [`Existing signal ${number}`],
    centralUnknown: `Unknown ${number}`,
    projectPreview: `A small firsthand project ${number}`,
    practicalFit: `Can begin alongside current work ${number}`,
  })) as [ReturnType<typeof paths>[number], ReturnType<typeof paths>[number], ReturnType<typeof paths>[number]];
}

function seedPendingWhy(): CareerMap {
  const result = applyCareerMapOperation(createCareerMap('explorer-1'), {
    type: 'propose-why',
    sourceId: 'prior-proposal-call',
    expectedRevision: 0,
    occurredAt: timestamp(1),
    payload: {
      why: {
        id: 'why-1',
        revision: 1,
        statement: 'Help people make consequential choices with less avoidable confusion.',
        serves: 'People facing consequential choices',
        pointOfView: 'Useful clarity comes from testing decisions against reality.',
      },
      presentation: {
        kind: 'model-presentation',
        assistantTurnId: 'assistant-prior-turn',
        turnSequence: 2,
        completed: true,
        presentedAt: timestamp(1),
      },
    },
  });
  if (result.status !== 'committed') throw new Error('Fixture Why proposal did not commit.');
  return result.map;
}

function seedPendingPaths(): CareerMap {
  let map = seedPendingWhy();
  const confirmed = applyCareerMapOperation(map, {
    type: 'confirm-why',
    sourceId: 'prior-confirm-call',
    expectedRevision: map.revision,
    occurredAt: timestamp(3),
    payload: { whyId: 'why-1', whyRevision: 1, action: action(3) },
  });
  if (confirmed.status !== 'committed') throw new Error('Why confirmation fixture did not commit.');
  map = confirmed.map;
  const proposed = applyCareerMapOperation(map, {
    type: 'propose-purpose-paths',
    sourceId: 'prior-path-call',
    expectedRevision: map.revision,
    occurredAt: timestamp(4),
    payload: { setId: 'set-1', setRevision: 1, paths: paths(), presentation: presentation(4, 'assistant-path-turn') },
  });
  if (proposed.status !== 'committed') throw new Error('Path fixture did not commit.');
  return proposed.map;
}

class InMemoryMethodStorage {
  constructor(public map = seedPendingWhy()) {}

  async loadCareerMap() {
    return { status: 'ready' as const, map: this.map };
  }

  async persistCareerMapOperation(input: { operation: CareerMapOperation }): Promise<PersistCareerMapResult> {
    const result = applyCareerMapOperation(this.map, input.operation);
    if (result.status === 'committed' || result.status === 'replayed') this.map = result.map;
    return result;
  }
}

describe('authenticated Method agent loop', () => {
  it('uses a strict non-authoritative routing call and fails ambiguous output to the Method barrier', async () => {
    const routedModel = new MockLanguageModelV4({
      doGenerate: modelResult([{
        type: 'tool-call', toolCallId: 'route-call', toolName: 'route_method_turn',
        input: JSON.stringify({ route: 'conversation' }),
      }], 'tool-calls'),
    });
    await expect(classifyMethodTurn({
      model: routedModel,
      message: 'Could we just talk through what this means?',
    })).resolves.toBe('conversation');
    expect(routedModel.doGenerateCalls[0]?.toolChoice).toEqual({
      type: 'tool', toolName: 'route_method_turn',
    });
    expect(routedModel.doGenerateCalls[0]?.tools?.[0]).toMatchObject({
      name: 'route_method_turn', strict: true,
    });
    expect(routedModel.doGenerateCalls[0]?.providerOptions?.openai).toMatchObject({ store: false });

    const ambiguousModel = new MockLanguageModelV4({
      doGenerate: modelResult([{ type: 'text', text: 'Maybe.' }], 'stop'),
    });
    await expect(classifyMethodTurn({
      model: ambiguousModel,
      message: 'That feels exactly right.',
    })).resolves.toBe('method');
  });

  it('derives locale-independent authorization without exposing canonical ids or retaining classifier content', async () => {
    const storage = new InMemoryMethodStorage();
    const state = await refreshMethodState(
      storage as unknown as Pick<IStorage, 'loadCareerMap'>,
      await createMethodModuleLoader(),
      'explorer-1',
    );
    const message = 'C’est exactement ce que je veux dire.';
    const model = new MockLanguageModelV4({
      doGenerate: modelResult([{
        type: 'tool-call', toolCallId: 'authorize-call', toolName: 'authorize_pending_decision',
        input: JSON.stringify({ intent: 'confirm-pending', choiceOrdinal: null }),
      }], 'tool-calls'),
    });

    await expect(classifyConsequentialAuthorization({ model, message, state })).resolves.toEqual({
      operation: 'confirm-why', targetId: 'why-1', targetRevision: 1,
    });
    expect(model.doGenerateCalls[0]?.toolChoice).toEqual({
      type: 'tool', toolName: 'authorize_pending_decision',
    });
    expect(model.doGenerateCalls[0]?.tools?.[0]).toMatchObject({
      name: 'authorize_pending_decision', strict: true,
    });
    expect(model.doGenerateCalls[0]?.providerOptions?.openai).toMatchObject({ store: false });
    expect(JSON.stringify(model.doGenerateCalls[0])).not.toContain('why-1');
    expect(JSON.stringify(model.doGenerateCalls[0])).not.toContain('assistant-prior-turn');
  });

  it.each([
    'That feels exactly right — don’t confirm it yet.',
    'That feels exactly right, but hold off for now.',
    'That captures what I mean; wait before confirming.',
    'Eso refleja lo que quiero decir, pero espera por ahora.',
  ])('does not let semantic authorization override deterministic deferral: %s', async (message) => {
    const storage = new InMemoryMethodStorage();
    const state = await refreshMethodState(
      storage as unknown as Pick<IStorage, 'loadCareerMap'>,
      await createMethodModuleLoader(),
      'explorer-1',
    );
    const model = new MockLanguageModelV4({
      doGenerate: modelResult([{
        type: 'tool-call', toolCallId: 'unsafe-authorize-call', toolName: 'authorize_pending_decision',
        input: JSON.stringify({ intent: 'confirm-pending', choiceOrdinal: null }),
      }], 'tool-calls'),
    });

    await expect(classifyConsequentialAuthorization({ model, message, state })).resolves.toBeUndefined();
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('does not let a conversation routing false-negative suppress an independently authorized confirmation', async () => {
    const storage = new InMemoryMethodStorage();
    const model = new MockLanguageModelV4({
      doGenerate: [
        modelResult([{
          type: 'tool-call',
          toolCallId: 'confirm-call',
          toolName: 'confirm_why',
          input: JSON.stringify({
            whyId: 'why-1',
            whyRevision: 1,
            presentedInTurnId: 'assistant-prior-turn',
            sourceMessageId: 'message-current',
          }),
        }], 'tool-calls'),
        modelResult([{ type: 'text', text: 'Confirmed from the authoritative state.' }], 'stop'),
      ],
    });

    const agent = createMethodAgent({
      model,
      storage: storage as unknown as Pick<IStorage, 'loadCareerMap' | 'persistCareerMapOperation'>,
      loader: await createMethodModuleLoader(),
      userId: 'explorer-1',
      conversationId: 'conversation-server-owned',
      turn: {
        turnId: 'agent-current-turn',
        leaseId: 'lease-current',
        clientMessageId: 'message-current',
        requestFingerprint: 'request-current',
        origin: 'agent-turn',
      },
      turnSequence: 3,
      occurredAt: timestamp(3),
      currentMessage: 'C’est exactement ce que je veux dire.',
      turnRoute: 'conversation',
      confirmationAuthorization: {
        operation: 'confirm-why', targetId: 'why-1', targetRevision: 1,
      },
    } as never);

    const result = await agent.generate({ prompt: 'C’est exactement ce que je veux dire.' });

    expect(result.text).toContain('authoritative state');
    expect(storage.map.revision).toBe(2);
    expect(model.doGenerateCalls[0]?.tools?.map((candidate) => candidate.name)).toContain('confirm_why');
  });

  it('does not let a conversation routing false-negative suppress an independently authorized selection', async () => {
    const storage = new InMemoryMethodStorage(seedPendingPaths());
    const model = new MockLanguageModelV4({
      doGenerate: [
        modelResult([{
          type: 'tool-call', toolCallId: 'select-call', toolName: 'select_purpose_path',
          input: JSON.stringify({
            setId: 'set-1', setRevision: 1, pathId: 'path-2', pathRevision: 1,
            presentedInTurnId: 'assistant-path-turn', sourceMessageId: 'message-current',
          }),
        }], 'tool-calls'),
        modelResult([{ type: 'text', text: 'Selected from the authoritative pending set.' }], 'stop'),
      ],
    });
    const agent = createMethodAgent({
      model, storage: storage as never, loader: await createMethodModuleLoader(),
      userId: 'explorer-1', conversationId: 'conversation-server-owned',
      turn: {
        turnId: 'agent-current-turn', leaseId: 'lease-current', clientMessageId: 'message-current',
        requestFingerprint: 'request-current', origin: 'agent-turn',
      },
      turnSequence: 5, occurredAt: timestamp(5),
      currentMessage: 'Je choisis la deuxième voie.',
      turnRoute: 'conversation',
      confirmationAuthorization: {
        operation: 'select-purpose-path', targetId: 'set-1', targetRevision: 1,
        choiceId: 'path-2', choiceRevision: 1,
      },
    } as never);

    await agent.generate({ prompt: 'Je choisis la deuxième voie.' });

    expect(storage.map.pathSets.at(-1)?.paths.map((path) => [path.id, path.selection])).toEqual([
      ['path-1', 'parked'], ['path-2', 'active'], ['path-3', 'parked'],
    ]);
    expect(model.doGenerateCalls[0]?.tools?.map((candidate) => candidate.name)).toContain('select_purpose_path');
    expect(model.doGenerateCalls[0]?.toolChoice).toEqual({ type: 'tool', toolName: 'select_purpose_path' });
  });

  it('confirms a previously presented Why, reloads Create Purpose Paths, and proposes paths in the same turn', async () => {
    const storage = new InMemoryMethodStorage();
    const model = new MockLanguageModelV4({
      doGenerate: [
        modelResult([{
          type: 'tool-call',
          toolCallId: 'confirm-call',
          toolName: 'confirm_why',
          input: JSON.stringify({
            whyId: 'why-1',
            whyRevision: 1,
            presentedInTurnId: 'assistant-prior-turn',
            sourceMessageId: 'message-current',
          }),
        }], 'tool-calls'),
        modelResult([{
          type: 'tool-call',
          toolCallId: 'paths-call',
          toolName: 'propose_purpose_paths',
          input: JSON.stringify({
            setId: 'set-1',
            setRevision: 1,
            paths: paths().map((path) => ({ ...path, researchSources: null, userSources: null })),
          }),
        }], 'tool-calls'),
        modelResult([{ type: 'text', text: 'Your Why is confirmed, and three Purpose Paths are ready to compare.' }], 'stop'),
      ],
    });

    const agent = createMethodAgent({
      model,
      storage: storage as unknown as Pick<IStorage, 'loadCareerMap' | 'persistCareerMapOperation'>,
      loader: await createMethodModuleLoader(),
      userId: 'explorer-1',
      conversationId: 'conversation-server-owned',
      turn: {
        turnId: 'agent-current-turn',
        leaseId: 'lease-current',
        clientMessageId: 'message-current',
        requestFingerprint: 'request-current',
        origin: 'agent-turn',
      },
      turnSequence: 3,
      occurredAt: timestamp(3),
      currentMessage: 'Yes — confirm why-1 revision 1, then show me the paths.',
    });

    const result = await agent.generate({ prompt: 'Yes — confirm why-1 revision 1, then show me the paths.' });

    expect(result.text).toContain('three Purpose Paths');
    expect(storage.map.revision).toBe(3);
    expect(storage.map.foundation.whyRevisions.at(-1)?.status).toBe('confirmed');
    expect(storage.map.pathSets.at(-1)).toMatchObject({ id: 'set-1', status: 'suggested' });
    expect(deriveMethodCheckpoint(storage.map)).toMatchObject({
      module: 'create-purpose-paths',
      pendingDecision: { kind: 'path-selection', targetId: 'set-1', targetRevision: 1 },
    });

    const toolNames = model.doGenerateCalls.map((call) => (
      call.tools?.map((tool) => tool.name).filter(Boolean) ?? []
    ));
    expect(toolNames[0]).toContain('confirm_why');
    expect(toolNames[0]).not.toContain('propose_purpose_paths');
    expect(model.doGenerateCalls[0]?.toolChoice).toEqual({ type: 'tool', toolName: 'confirm_why' });
    expect(model.doGenerateCalls[1]?.toolChoice).toEqual({ type: 'auto' });
    expect(toolNames[1]).toContain('propose_purpose_paths');
    expect(toolNames[1]).not.toContain('confirm_why');
    expect(toolNames[2]).not.toContain('propose_purpose_paths');
    expect(model.doGenerateCalls[0]?.prompt.map((message) => message.role)).toEqual(['user']);
    expect(model.doGenerateCalls[1]?.prompt.map((message) => message.role)).toEqual(['tool']);
    expect(model.doGenerateCalls[2]?.prompt.map((message) => message.role)).toEqual(['tool']);

    for (const [index, call] of model.doGenerateCalls.entries()) {
      const provider = call.providerOptions?.openai as Record<string, unknown>;
      expect(provider).toMatchObject({
        conversation: 'conversation-server-owned',
        store: true,
        reasoningEffort: 'low',
      });
      expect(provider.instructions).toEqual(expect.stringContaining('Active Method module:'));
      expect(call.prompt.some((message) => message.role === 'system')).toBe(false);
      expect(call.tools?.every((definition) => definition.type !== 'function' || definition.strict === true)).toBe(true);
      for (const definition of call.tools ?? []) {
        if (definition.type === 'function') expectOpenAIStrictObjectSchemas(definition.inputSchema);
      }
      if (index === 0) expect(provider.contextManagement).toBeDefined();
      else expect(provider).not.toHaveProperty('contextManagement');
    }
  });

  it('selects a path, parks its siblings, reloads Design a Path Project, and removes stale tools in the same turn', async () => {
    const storage = new InMemoryMethodStorage(seedPendingPaths());
    const project = {
      id: 'project-1', revision: 1, title: 'Interview three practitioners',
      outcome: 'A short comparison of their working reality', audience: 'The explorer',
      whyWanted: 'Test the selected path firsthand', learningGoal: 'Learn whether the day-to-day work fits',
      firstVersion: 'Three structured conversations and a one-page synthesis',
      firstStep: 'Draft five interview questions', decisionQuestion: 'Should this path receive a deeper project?',
      evidenceCue: 'Energy, pull, and specific repeatable work signals',
    };
    const model = new MockLanguageModelV4({
      doGenerate: [
        modelResult([{
          type: 'tool-call', toolCallId: 'select-path-call', toolName: 'select_purpose_path',
          input: JSON.stringify({
            setId: 'set-1', setRevision: 1, pathId: 'path-2', pathRevision: 1,
            presentedInTurnId: 'assistant-path-turn', sourceMessageId: 'message-current',
          }),
        }], 'tool-calls'),
        modelResult([{
          type: 'tool-call', toolCallId: 'propose-project-call', toolName: 'propose_first_project',
          input: JSON.stringify({ ...project, researchSources: null, userSources: null }),
        }], 'tool-calls'),
        modelResult([{ type: 'text', text: 'Path 2 is active and its first project is ready for review.' }], 'stop'),
      ],
    });
    const traces: string[][] = [];
    const agent = createMethodAgent({
      model,
      storage: storage as unknown as Pick<IStorage, 'loadCareerMap' | 'persistCareerMapOperation'>,
      loader: await createMethodModuleLoader(),
      userId: 'explorer-1', conversationId: 'conversation-server-owned',
      turn: {
        turnId: 'agent-current-turn', leaseId: 'lease-current', clientMessageId: 'message-current',
        requestFingerprint: 'request-current', origin: 'agent-turn',
      },
      turnSequence: 5, occurredAt: timestamp(5),
      currentMessage: 'Choose Path 2 and help me design the first project.',
      research: {
        research: async () => ({ status: 'insufficient', candidates: [] }),
        resolveSources: () => [],
      },
      onPreparedStep: (trace) => traces.push(trace.activeTools),
    });

    await agent.generate({ prompt: 'Choose Path 2 and help me design the first project.' });

    expect(storage.map.pathSets.at(-1)?.paths.map((path) => [path.id, path.selection])).toEqual([
      ['path-1', 'parked'], ['path-2', 'active'], ['path-3', 'parked'],
    ]);
    expect(storage.map.projects.at(-1)).toMatchObject({ id: 'project-1', agreementStatus: 'suggested' });
    expect(traces[0]).toContain('select_purpose_path');
    expect(traces[0]).toContain('research_current_world');
    expect(model.doGenerateCalls[0]?.toolChoice).toEqual({ type: 'tool', toolName: 'select_purpose_path' });
    expect(model.doGenerateCalls[1]?.toolChoice).toEqual({ type: 'auto' });
    expect(traces[1]).toContain('propose_first_project');
    expect(traces[1]).not.toContain('select_purpose_path');
    expect(traces[2]).not.toContain('propose_first_project');
    expect(traces[2]).not.toContain('accept_first_project');
    expect(model.doGenerateCalls.flatMap((call) => call.tools ?? []).map((definition) => definition.name))
      .not.toContain('web_search');
    expect((model.doGenerateCalls[0]?.providerOptions?.openai as Record<string, unknown>).contextManagement)
      .toBeDefined();
  });

  it.each([
    {
      label: 'ordinary English Foundation evidence',
      map: () => createCareerMap('explorer-1'),
      message: 'I lose track of time when I turn a messy idea into something another person can use.',
      reply: 'What kind of change do you most want that work to create?',
      expectedTool: 'append_foundation_evidence',
    },
    {
      label: 'ordinary Spanish Foundation evidence',
      map: () => createCareerMap('explorer-1'),
      message: 'Pierdo la noción del tiempo cuando convierto una idea confusa en algo que otra persona puede usar.',
      reply: '¿Qué cambio te gustaría que produjera ese trabajo?',
      expectedTool: 'append_foundation_evidence',
    },
    {
      label: 'a natural English ordinal choice',
      map: seedPendingPaths,
      message: 'The second one is the direction I want to pursue.',
      reply: 'I’ll use that choice once the exact pending path is committed.',
      expectedTool: 'select_purpose_path',
    },
    {
      label: 'a natural Spanish ordinal choice',
      map: seedPendingPaths,
      message: 'La segunda es la dirección que quiero seguir.',
      reply: 'Usaré esa elección cuando se confirme la ruta pendiente exacta.',
      expectedTool: 'select_purpose_path',
    },
  ])('keeps checkpoint tools available for $label without making wording the authority', async ({
    map, message, reply, expectedTool,
  }) => {
    const storage = new InMemoryMethodStorage(map());
    const startingRevision = storage.map.revision;
    const model = new MockLanguageModelV4({
      doGenerate: modelResult([{ type: 'text', text: reply }], 'stop'),
    });
    const traces: string[][] = [];
    const agent = createMethodAgent({
      model, storage: storage as never, loader: await createMethodModuleLoader(),
      userId: 'explorer-1', conversationId: 'server-conversation',
      turn: {
        turnId: 'agent-current-turn', leaseId: 'lease-current', clientMessageId: 'message-current',
        requestFingerprint: 'request-current', origin: 'agent-turn',
      },
      turnSequence: 5, occurredAt: timestamp(5), currentMessage: message,
      // Inject the exact streaming-classifier false negative: checkpoint state
      // must still expose the narrow Method tools for ordinary evidence/choice.
      turnRoute: 'conversation',
      onPreparedStep: (trace) => traces.push(trace.activeTools),
    } as never);

    const result = await agent.generate({ prompt: message });

    expect(result.text).toBe(reply);
    expect(traces[0]).toContain(expectedTool);
    expect(storage.map.revision).toBe(startingRevision);
    const request = model.doGenerateCalls[0];
    expect(JSON.stringify(request?.prompt)).toContain(message);
    expect(String(request?.providerOptions?.openai?.instructions))
      .toContain("Mirror the language of the explorer's latest message naturally.");
  });

  it.each(['committed', 'conflict', 'rejected'] as const)(
    'drops pre-result mutation prose for a %s result and releases only fresh narration',
    async (status) => {
      const parts = [
        { type: 'start' }, { type: 'start-step' },
        { type: 'text-start', id: 'pre' }, { type: 'text-delta', id: 'pre', text: 'It is already changed.' }, { type: 'text-end', id: 'pre' },
        { type: 'tool-call', toolCallId: 'call', toolName: 'confirm_why', input: {} },
        { type: 'tool-result', toolCallId: 'call', toolName: 'confirm_why', output: { status } },
        { type: 'finish-step' }, { type: 'start-step' },
        { type: 'text-start', id: 'post' }, { type: 'text-delta', id: 'post', text: `Fresh ${status} narration.` }, { type: 'text-end', id: 'post' },
        { type: 'finish-step' }, { type: 'finish' },
      ];
      const output = await collectTransform(parts);
      expect(JSON.stringify(output)).not.toContain('already changed');
      expect(JSON.stringify(output)).toContain(`Fresh ${status} narration`);
      expect(JSON.stringify(output)).not.toContain('tool-result');
    },
  );

  it('streams natural no-write text and drops buffered prose after abort', async () => {
    const natural = await collectTransform([
      { type: 'start-step' }, { type: 'text-start', id: 'text' },
      { type: 'text-delta', id: 'text', text: 'Natural reflection.' }, { type: 'text-end', id: 'text' },
      { type: 'finish-step' }, { type: 'finish' },
    ]);
    expect(JSON.stringify(natural)).toContain('Natural reflection');

    const aborted = await collectTransform([
      { type: 'start-step' }, { type: 'text-start', id: 'text' },
      { type: 'text-delta', id: 'text', text: 'Must not escape.' }, { type: 'abort' },
      { type: 'finish-step' }, { type: 'finish' },
    ]);
    expect(JSON.stringify(aborted)).not.toContain('Must not escape');
    expect(aborted.map((part) => part.type)).toEqual(['start-step', 'abort']);
  });

  it('delivers natural no-write deltas before finish-step while mutation-capable text remains buffered', async () => {
    let naturalController!: ReadableStreamDefaultController<Record<string, unknown>>;
    const naturalStream = new ReadableStream<Record<string, unknown>>({
      start(controller) { naturalController = controller; },
    }).pipeThrough(createResultBarrierTransform({ streamNaturalText: true } as never)() as never);
    const naturalReader = naturalStream.getReader();
    naturalController.enqueue({ type: 'start-step' });
    naturalController.enqueue({ type: 'text-start', id: 'natural' });
    naturalController.enqueue({ type: 'text-delta', id: 'natural', text: 'Early natural delta.' });
    expect((await naturalReader.read()).value).toMatchObject({ type: 'start-step' });
    expect((await naturalReader.read()).value).toMatchObject({ type: 'text-start' });
    const early = await Promise.race([
      naturalReader.read(),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('delta waited for finish-step')), 25)),
    ]);
    expect(early.value).toMatchObject({ type: 'text-delta', text: 'Early natural delta.' });
    naturalController.enqueue({ type: 'finish-step' });
    naturalController.close();

    let mutationController!: ReadableStreamDefaultController<Record<string, unknown>>;
    const mutationStream = new ReadableStream<Record<string, unknown>>({
      start(controller) { mutationController = controller; },
    }).pipeThrough(createResultBarrierTransform({ streamNaturalText: false } as never)() as never);
    const mutationReader = mutationStream.getReader();
    mutationController.enqueue({ type: 'start-step' });
    mutationController.enqueue({ type: 'text-start', id: 'mutation' });
    mutationController.enqueue({ type: 'text-delta', id: 'mutation', text: 'Premature mutation claim.' });
    mutationController.enqueue({ type: 'tool-call', toolCallId: 'call', toolName: 'confirm_why', input: {} });
    mutationController.enqueue({ type: 'finish-step' });
    mutationController.close();
    const mutationOutput: unknown[] = [];
    for (;;) {
      const part = await mutationReader.read();
      if (part.done) break;
      mutationOutput.push(part.value);
    }
    expect(JSON.stringify(mutationOutput)).not.toContain('Premature mutation claim');
  });

  it('applies the result barrier only to the outward stream after tool continuation has settled', async () => {
    const internalParts = [
      { type: 'start-step' },
      { type: 'tool-call', toolCallId: 'confirm-call', toolName: 'confirm_why', input: {} },
      { type: 'tool-result', toolCallId: 'confirm-call', toolName: 'confirm_why', output: { status: 'committed' } },
      { type: 'finish-step' },
      { type: 'start-step' },
      { type: 'text-start', id: 'safe' },
      { type: 'text-delta', id: 'safe', text: 'Fresh authoritative narration.' },
      { type: 'text-end', id: 'safe' },
      { type: 'finish-step' },
      { type: 'finish' },
    ];
    const internalStream = new ReadableStream({
      start(controller) {
        for (const part of internalParts) controller.enqueue(part);
        controller.close();
      },
    });

    const outward: unknown[] = [];
    for await (const part of projectMethodStreamForDisplay(internalStream as never) as never) {
      outward.push(part);
    }

    expect(JSON.stringify(outward)).toContain('Fresh authoritative narration');
    expect(JSON.stringify(outward)).not.toContain('tool-result');
    expect(JSON.stringify(outward)).not.toContain('confirm-call');
  });

  it('restores SDK retry defaults so a transient first call cannot duplicate an operation', async () => {
    const storage = new InMemoryMethodStorage();
    let attempt = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new APICallError({
            message: 'transient', url: 'https://provider.invalid', requestBodyValues: {},
            statusCode: 503, responseHeaders: { 'retry-after-ms': '0' }, isRetryable: true,
          });
        }
        if (attempt === 2) {
          return modelResult([{
            type: 'tool-call', toolCallId: 'retry-confirm-call', toolName: 'confirm_why',
            input: JSON.stringify({
              whyId: 'why-1', whyRevision: 1,
              presentedInTurnId: 'assistant-prior-turn', sourceMessageId: 'message-current',
            }),
          }], 'tool-calls');
        }
        return modelResult([{ type: 'text', text: 'Confirmed after one transient retry.' }], 'stop');
      },
    });
    const agent = createMethodAgent({
      model, storage: storage as never, loader: await createMethodModuleLoader(),
      userId: 'explorer-1', conversationId: 'server-conversation',
      turn: {
        turnId: 'agent-current-turn', leaseId: 'lease-current', clientMessageId: 'message-current',
        requestFingerprint: 'request-current', origin: 'agent-turn',
      },
      turnSequence: 3, occurredAt: timestamp(3), currentMessage: 'Yes, confirm why-1 revision 1.',
    } as never);

    const result = await agent.generate({ prompt: 'Yes, confirm why-1 revision 1.' });
    expect(result.text).toContain('Confirmed after one transient retry');
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(storage.map.revision).toBe(2);
    expect(storage.map.operationHistory.filter((receipt) => receipt.operationType === 'confirm-why')).toHaveLength(1);
  });

  it('retries a transient streaming failure without retaining provider request or response sentinels', async () => {
    const sentinel = 'PRIVATE-RETRY-PAYLOAD-SENTINEL';
    let attempt = 0;
    const observedErrors: unknown[] = [];
    const model = new MockLanguageModelV4({
      doStream: async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new APICallError({
            message: sentinel,
            url: `https://provider.example/${sentinel}`,
            requestBodyValues: { prompt: sentinel },
            statusCode: 503,
            responseHeaders: { 'retry-after-ms': '0', 'x-private-provider-header': sentinel },
            responseBody: sentinel,
            isRetryable: true,
          });
        }
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'text-1' },
              { type: 'text-delta', id: 'text-1', delta: 'Safe response after retry.' },
              { type: 'text-end', id: 'text-1' },
              { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage() },
            ] as never,
          }),
        };
      },
    });
    const agent = createMethodAgent({
      model, storage: new InMemoryMethodStorage() as never, loader: await createMethodModuleLoader(),
      userId: 'explorer-1', conversationId: 'server-conversation',
      turn: {
        turnId: 'agent-current-turn', leaseId: 'lease-current', clientMessageId: 'message-current',
        requestFingerprint: 'request-current', origin: 'agent-turn',
      },
      turnSequence: 3, occurredAt: timestamp(3), currentMessage: 'Help me reflect on this.',
      onError: (error) => observedErrors.push(error),
    } as never);

    const result = await agent.stream({ prompt: 'Help me reflect on this.' });
    const text = await result.text;

    expect(text).toBe('Safe response after retry.');
    expect(attempt).toBe(2);
    expect(observedErrors).toEqual([]);
    expect(JSON.stringify({ text, observedErrors })).not.toContain(sentinel);
    expect(model.doStreamCalls.at(-1)?.tools?.map((definition) => definition.name))
      .toContain('confirm_why');
  });

  it('drops non-numeric retry metadata when SDK streaming retries are exhausted', async () => {
    const privateRetryValue = 'private-retry-marker';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const observedErrors: unknown[] = [];
    const resultErrors: unknown[] = [];
    let attempt = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        attempt += 1;
        throw new APICallError({
          message: 'transient',
          url: 'https://provider.invalid',
          requestBodyValues: {},
          statusCode: 503,
          responseHeaders: {
            'retry-after': privateRetryValue,
            'retry-after-ms': '0',
          },
          isRetryable: true,
        });
      },
    });
    const agent = createMethodAgent({
      model, storage: new InMemoryMethodStorage() as never, loader: await createMethodModuleLoader(),
      userId: 'explorer-1', conversationId: 'server-conversation',
      turn: {
        turnId: 'agent-current-turn', leaseId: 'lease-current', clientMessageId: 'message-current',
        requestFingerprint: 'request-current', origin: 'agent-turn',
      },
      turnSequence: 3, occurredAt: timestamp(3), currentMessage: 'Help me reflect on this.',
      onError: (error) => observedErrors.push(error),
    } as never);

    const containsPrivateValue = (value: unknown, seen = new Set<object>()): boolean => {
      if (typeof value === 'string') return value.includes(privateRetryValue);
      if (!value || typeof value !== 'object' || seen.has(value)) return false;
      seen.add(value);
      return Object.values(value).some((child) => containsPrivateValue(child, seen));
    };
    const collectRetryHeaders = (
      value: unknown,
      collected: Array<[string, string]> = [],
      seen = new Set<object>(),
    ): Array<[string, string]> => {
      if (!value || typeof value !== 'object' || seen.has(value)) return collected;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (key === 'responseHeaders' && child && typeof child === 'object') {
          for (const [header, headerValue] of Object.entries(child)) {
            const normalized = header.toLowerCase();
            if ((normalized === 'retry-after' || normalized === 'retry-after-ms')
              && typeof headerValue === 'string') {
              collected.push([normalized, headerValue]);
            }
          }
        }
        collectRetryHeaders(child, collected, seen);
      }
      return collected;
    };

    try {
      const result = await agent.stream({ prompt: 'Help me reflect on this.' });
      await result.consumeStream({ onError: (error) => resultErrors.push(error) });

      const retained = [consoleError.mock.calls, observedErrors, resultErrors];
      const retryHeaders = collectRetryHeaders(retained);
      const allRetryValuesAreBoundedNumbers = retryHeaders.every(([header, value]) => {
        if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return false;
        const numeric = Number(value);
        return Number.isFinite(numeric)
          && numeric >= 0
          && numeric <= (header === 'retry-after' ? 60 : 60_000);
      });

      expect(attempt).toBe(3);
      expect(containsPrivateValue(retained)).toBe(false);
      expect(allRetryValuesAreBoundedNumbers).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('sanitizes exhausted generation retry metadata before a routing classifier can observe it', async () => {
    const privateRetryValue = 'PRIVATE-GENERATE-RETRY-SENTINEL';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let attempt = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        attempt += 1;
        throw new APICallError({
          message: privateRetryValue,
          url: `https://provider.invalid/${privateRetryValue}`,
          requestBodyValues: { prompt: privateRetryValue },
          statusCode: 503,
          responseHeaders: {
            'retry-after': '61',
            'retry-after-ms': '0',
            'x-private-provider-header': privateRetryValue,
          },
          responseBody: privateRetryValue,
          isRetryable: true,
        });
      },
    });

    try {
      await expect(classifyMethodTurn({ model, message: 'A general reflection.' })).resolves.toBe('method');
      expect(attempt).toBe(3);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateRetryValue);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('uses the model-safe briefing projection so multiline research payloads never reach provider instructions', async () => {
    const titleContinuation = 'PROVIDER-INSTRUCTION-TITLE-CONTINUATION';
    const excerptContinuation = 'PROVIDER-INSTRUCTION-EXCERPT-CONTINUATION';
    const providerResultId = 'PROVIDER-INSTRUCTION-RESULT-ID';
    const map = seedPendingPaths();
    map.pathSets[0].paths[0].sources = [{
      kind: 'cited-research', sourceHandle: 'source-tainted', providerResultId,
      url: 'https://example.com/tainted', retrievedAt: timestamp(4),
      title: `Visible canonical title\n${titleContinuation}`,
      excerpt: `Visible canonical excerpt\n${excerptContinuation}`,
      support: 'server-validated',
    }];
    const storage = new InMemoryMethodStorage(map);
    const model = new MockLanguageModelV4({
      doGenerate: modelResult([{ type: 'text', text: 'No transition.' }], 'stop'),
    });
    const agent = createMethodAgent({
      model, storage: storage as never, loader: await createMethodModuleLoader(),
      userId: 'explorer-1', conversationId: 'server-conversation',
      turn: {
        turnId: 'agent-current-turn', leaseId: 'lease-current', clientMessageId: 'message-current',
        requestFingerprint: 'request-current', origin: 'agent-turn',
      },
      turnSequence: 5, occurredAt: timestamp(5), currentMessage: 'What should I consider?',
    } as never);
    await agent.generate({ prompt: 'What should I consider?' });
    const instructions = String(model.doGenerateCalls[0]?.providerOptions?.openai?.instructions);
    expect(instructions).toContain(
      'Research source provenance recorded server-side; retrieved title and content omitted from instructions.',
    );
    expect(instructions).not.toContain(titleContinuation);
    expect(instructions).not.toContain(excerptContinuation);
    expect(instructions).not.toContain(providerResultId);
    expect(instructions).not.toContain('https://example.com/tainted');
    expect(storage.map.revision).toBe(3);
  });
});

async function collectTransform(parts: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  const stream = new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
  const output: Array<Record<string, unknown>> = [];
  for await (const part of stream.pipeThrough(createResultBarrierTransform()() as never) as never) {
    output.push(part as Record<string, unknown>);
  }
  return output;
}

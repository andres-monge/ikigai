import { describe, expect, it } from 'vitest';
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
import { createMethodAgent, createResultBarrierTransform } from './agent.js';

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
          input: JSON.stringify({ setId: 'set-1', setRevision: 1, paths: paths() }),
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
    expect(toolNames[1]).toContain('propose_purpose_paths');
    expect(toolNames[1]).not.toContain('confirm_why');
    expect(toolNames[2]).not.toContain('propose_purpose_paths');

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
          input: JSON.stringify(project),
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
    expect(traces[1]).toContain('propose_first_project');
    expect(traces[1]).not.toContain('select_purpose_path');
    expect(traces[2]).not.toContain('propose_first_project');
    expect(traces[2]).not.toContain('accept_first_project');
    expect(model.doGenerateCalls.flatMap((call) => call.tools ?? []).map((definition) => definition.name))
      .not.toContain('web_search');
    expect((model.doGenerateCalls[0]?.providerOptions?.openai as Record<string, unknown>).contextManagement)
      .toBeDefined();
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

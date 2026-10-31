import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { applyCareerMapOperation, createCareerMap, type CareerMap } from '../../shared/career-map/index.js';
import { createAgentTurnPersistenceContext, type IStorage } from '../storage.js';
import { createReplayStorage, runReplay } from '../../scripts/replay-nami.js';
import { METHOD_MODULE_KEYS, methodReasoningEffort } from './method/registry.js';

const at = '2030-01-01T00:00:00.000Z';
const action = { kind: 'user-message' as const, actionId: 'fixture-message', turnId: 'fixture-turn', turnSequence: 30, occurredAt: at };
function commit(map: CareerMap, type: string, payload: unknown): CareerMap {
  const result = applyCareerMapOperation(map, { type, payload, sourceId: `fixture-${map.revision}`, expectedRevision: map.revision, occurredAt: at });
  if (result.status !== 'committed') throw new Error(`Fixture ${type} failed: ${JSON.stringify(result)}`);
  return result.map;
}
const presentation = (sequence: number) => ({ kind: 'model-presentation' as const, assistantTurnId: `fixture-assistant-${sequence}`, turnSequence: sequence, completed: true, presentedAt: at });
function fixture(module: string): CareerMap {
  let map = createCareerMap('replay-user');
  if (module === 'form-foundation') return map;
  map = commit(map, 'propose-why', { why: { id: 'why-1', revision: 1, statement: 'Help people act.', serves: 'People choosing work', pointOfView: 'Experience supports agency.' }, presentation: presentation(1) });
  map = commit(map, 'confirm-why', { whyId: 'why-1', whyRevision: 1, action: { ...action, turnSequence: 2 } });
  if (module === 'create-purpose-paths') return map;
  const paths = [1, 2, 3].map(number => ({ id: `path-${number}`, revision: 1, name: `Path ${number}`, servesWhy: 'Help people act', evidence: ['Interest in making'], centralUnknown: 'Does the work create energy?', projectPreview: 'Make a small thing', practicalFit: 'A small weekend project' }));
  map = commit(map, 'propose-purpose-paths', { setId: 'set-1', setRevision: 1, paths, presentation: presentation(3) });
  map = commit(map, 'select-purpose-path', { setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1, action: { ...action, turnSequence: 4 } });
  if (module === 'design-path-project') return map;
  map = commit(map, 'propose-first-project', { project: { id: 'project-1', revision: 1, briefFormat: 'simple-v1', relationship: 'linked', title: 'Make a small aid', learningGoal: 'Notice energy', firstVersion: 'A page', firstStep: 'Sketch the page' }, presentation: presentation(5) });
  map = commit(map, 'present-first-project-framing', { projectId: 'project-1', projectRevision: 1, framingFormat: 'natural-v1', locale: 'en', framingText: 'Make a small version to notice whether the work makes you curious.', moduleVersion: 'test', presentation: presentation(6) });
  map = commit(map, 'deliver-first-project-framing', { projectId: 'project-1', projectRevision: 1, assistantText: 'Make a small version to notice whether the work makes you curious.', presentation: presentation(6) });
  map = commit(map, 'accept-first-project', { projectId: 'project-1', projectRevision: 1, action: { ...action, turnSequence: 7 } });
  if (module === 'guide-path-project') return map;
  return commit(map, 'open-reflection', { reflectionId: 'reflection-local', revision: 1, projectId: 'project-1', projectRevision: 1, action });
}
function stream(index: number, tool?: { name: string; input: unknown }): Response {
  const item = tool ? { type: 'function_call', id: `item-${index}`, call_id: `call-${index}`, name: tool.name, arguments: JSON.stringify(tool.input), status: 'completed' } : { type: 'message', id: `item-${index}` };
  const events = [
    { type: 'response.created', response: { id: `response-${index}`, created_at: 1, model: 'gpt-6.1-sol' } },
    { type: 'response.output_item.added', output_index: 0, item },
    ...(!tool ? [{ type: 'response.output_text.delta', item_id: item.id, output_index: 0, delta: 'Which part would you like to explore?' }] : []),
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 1 } } },
  ];
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}
afterEach(() => vi.unstubAllGlobals());
async function execute(map: CareerMap, options: { reasoningEffort?: 'production' | 'low' | 'medium' | 'high'; effortByModule?: Record<string, 'low' | 'medium' | 'high'> }, firstTool?: { name: string; input: unknown }) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'replay-production-')));
  const outgoing: Record<string, any>[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname === '/v1/conversations') return Response.json({ id: 'conv_local_clone' });
    if (new URL(request.url).pathname === '/v1/responses') {
      outgoing.push(await request.json());
      if (outgoing.length > (firstTool ? 2 : 1)) throw new Error('Unexpected request');
      return stream(outgoing.length, outgoing.length === 1 ? firstTool : undefined);
    }
    throw new Error('Unexpected endpoint');
  });
  try {
    await cp(path.resolve('server/ai/method/skills'), path.join(root, 'instructions/skills'), { recursive: true });
    await writeFile(path.join(root, 'instructions/base.txt'), 'Use the current checkpoint and supplied tools.');
    await writeFile(path.join(root, 'env'), 'OPENAI_API_KEY=local-unused-key');
    await writeFile(path.join(root, 'case.json'), JSON.stringify({ label: 'Local production replay', sourceConversationId: 'conv_live_source', initialMap: map, priorTurns: [], priorItems: [], currentMessage: 'Reflect on my project.', historicalReply: '', provenance: {} }));
    await runReplay({ casePath: path.join(root, 'case.json'), instructionsPath: path.join(root, 'instructions'), outputPath: path.join(root, 'output'), envPath: path.join(root, 'env'), ...options });
    return { outgoing, report: JSON.parse(await readFile(path.join(root, 'output/result.json'), 'utf8')) };
  } finally { await rm(root, { recursive: true, force: true }); }
}
it.each(METHOD_MODULE_KEYS)('serializes production effort for %s through the real replay agent', async module => {
  const { outgoing, report } = await execute(fixture(module), { reasoningEffort: 'production' });
  expect(outgoing.map(request => request.reasoning.effort)).toEqual([methodReasoningEffort(module)]);
  expect(report.reasoningEffort).toBe('production');
  expect(report.effortByModule[module]).toBe(methodReasoningEffort(module));
  expect(outgoing[0]).toMatchObject({ conversation: 'conv_local_clone', store: true, parallel_tool_calls: false });
});
it('refreshes the effort after Guide opens a reflection within the same replay turn', async () => {
  const { outgoing, report } = await execute(fixture('guide-path-project'), { reasoningEffort: 'production' }, { name: 'open_reflection', input: { reflectionId: 'new-reflection', revision: 1, projectId: 'project-1', projectRevision: 1 } });
  expect(report.traces.map((trace: { module: string }) => trace.module)).toEqual(['guide-path-project', 'interpret-path-project']);
  expect(outgoing.map(request => request.reasoning.effort)).toEqual(['low', 'low']);
});
it.each([undefined, 'low', 'medium', 'high'] as const)('preserves fixed historical effort %s', async reasoningEffort => {
  const { outgoing } = await execute(fixture('create-purpose-paths'), { reasoningEffort });
  expect(outgoing[0].reasoning.effort).toBe(reasoningEffort ?? 'low');
});
it('fails before any transport when frozen production policy no longer matches the runtime', async () => {
  const policy = Object.fromEntries(METHOD_MODULE_KEYS.map(key => [key, methodReasoningEffort(key)]));
  policy['design-path-project'] = 'high';
  await expect(execute(fixture('guide-path-project'), { reasoningEffort: 'production', effortByModule: policy })).rejects.toThrow(/policy.*runtime/i);
});

it('delivers first-project framing only after verified completion and audits later acceptance', async () => {
  const map = fixture('design-path-project');
  const turn = { userId: map.explorerId, turnId: 'replay-framing', clientMessageId: 'replay-message', leaseId: 'replay-lease', requestFingerprint: 'replay-fingerprint', origin: 'agent-turn' as const };
  const storage = createReplayStorage(map, [], turn);
  const context = createAgentTurnPersistenceContext(turn, { turnSequence: 10, occurredAt: at });
  const persist = async (type: string, payload: unknown) => storage.persistCareerMapOperation({ userId: turn.userId, leaseId: turn.leaseId, context, moduleVersion: 'test', operation: { type, payload, sourceId: `replay-${type}`, expectedRevision: (await storage.loadCareerMap(turn.userId)).map.revision, occurredAt: at } } as Parameters<IStorage['persistCareerMapOperation']>[0]);
  expect((await persist('propose-first-project', { project: { id: 'replay-project', revision: 1, briefFormat: 'simple-v1', relationship: 'linked', title: 'A small sketch', learningGoal: 'Notice energy', firstVersion: 'One page', firstStep: 'Sketch it' }, presentation: context.presentation })).status).toBe('committed');
  const framingText = 'Make a small version and notice whether the work draws you in.';
  expect((await persist('present-first-project-framing', { projectId: 'replay-project', projectRevision: 1, framingFormat: 'natural-v1', locale: 'en', framingText, moduleVersion: 'test', presentation: context.presentation })).status).toBe('committed');
  await expect(storage.completeTurn('Unrelated prose.', at)).rejects.toThrow(/framing delivery/);
  expect((await storage.loadCareerMap(turn.userId)).map.projects[0].acceptanceFraming?.status).toBe('pending');
  await storage.completeTurn(framingText, at);
  const delivered = (await storage.loadCareerMap(turn.userId)).map;
  expect(delivered.projects[0].acceptanceFraming?.status).toBe('delivered');
  expect(map.projects).toHaveLength(0);
  const next = { ...turn, turnId: 'later-acceptance', clientMessageId: 'later-message', leaseId: 'later-lease' };
  const nextContext = createAgentTurnPersistenceContext(next, { turnSequence: 11, occurredAt: at });
  const input = { userId: next.userId, leaseId: next.leaseId, context: nextContext, moduleVersion: 'test', operation: { type: 'accept-first-project' as const, sourceId: 'later-accept-project', expectedRevision: delivered.revision, occurredAt: at, payload: { projectId: 'replay-project', projectRevision: 1, action: nextContext.action } } };
  const withoutCompletedTurn = createReplayStorage(delivered, [], next);
  expect((await withoutCompletedTurn.persistCareerMapOperation(input)).status).toBe('rejected');
  const completed = { ...turn, status: 'completed' as const, terminalResult: { kind: 'completed' }, createdAt: new Date(at), updatedAt: new Date(at), terminalAt: new Date(at) };
  const audited = createReplayStorage(delivered, [completed], next);
  expect((await audited.persistCareerMapOperation(input)).status).toBe('committed');
});
it('rejects forged later-learning provenance and preserves independent sibling maps', async () => {
  const map = fixture('guide-path-project');
  const turn = { userId: map.explorerId, turnId: 'learning-turn', clientMessageId: 'learning-message', leaseId: 'learning-lease', requestFingerprint: 'learning-fingerprint', origin: 'agent-turn' as const };
  const context = createAgentTurnPersistenceContext(turn, { turnSequence: 30, occurredAt: at });
  const left = createReplayStorage(map, [], turn), right = createReplayStorage(map, [], turn);
  const operation = { type: 'open-reflection' as const, sourceId: 'open-local-reflection', expectedRevision: map.revision, occurredAt: at, payload: { reflectionId: 'local-reflection', revision: 1, projectId: 'project-1', projectRevision: 1, action: { ...context.action, turnId: 'forged-turn' } } };
  const input = { userId: turn.userId, leaseId: turn.leaseId, context, operation, moduleVersion: 'test' };
  expect((await left.persistCareerMapOperation(input)).status).toBe('rejected');
  input.operation.payload.action = context.action;
  expect((await left.persistCareerMapOperation(input)).status).toBe('committed');
  expect((await left.loadCareerMap(turn.userId)).map.reflections).toHaveLength(1);
  expect((await right.loadCareerMap(turn.userId)).map.reflections).toHaveLength(0);
  expect(map.reflections).toHaveLength(0);
});

it('reads historical V2 state through the production compatibility reader without changing its source', async () => {
  const historical = structuredClone(fixture('form-foundation')) as unknown as Record<string, unknown>;
  historical.schemaVersion = 2;
  delete historical.pathFocusCommitments;
  const before = structuredClone(historical);
  const { report } = await execute(historical as unknown as CareerMap, { reasoningEffort: 'low' });
  expect(report.sourceSchemaVersion).toBe(2);
  expect(report.mapMigrated).toBe(true);
  expect(report.sourceFileUnchanged).toBe(true);
  expect(historical).toEqual(before);
});

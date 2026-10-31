import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, cp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from '../test-fixtures/loopback-http.js';
import { execFileSync } from 'node:child_process';
import { privateArtifactPath } from '../../scripts/replay-private-paths.js';
import { createCareerMap, applyCareerMapOperation } from '../../shared/career-map/index.js';
import { validatePrivateRoot, createLabStore, type LabRunner } from '../../scripts/replay-lab/store.js';
import { createLabApp } from '../../scripts/replay-lab/server.js';
import type { ReplayCase } from '../../scripts/replay-nami.js';
import { resolveDisplayProjection } from './history.js';

const temporaryRoots: string[] = [];
afterEach(async () => { await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true }))); temporaryRoots.length = 0; });
const read = async <T,>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8'));
const write = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value)); };
async function setup(runner?: LabRunner) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'nami-lab-'))); temporaryRoots.push(root);
  await writeFile(path.join(root, 'accepted-v4.txt'), 'Exact accepted voice.');
  await writeFile(path.join(root, 'base-template.txt'), 'Shared product rules.\n{{VOICE}}\n{{CONTROLS}}');
  const draft = path.join(root, 'candidates', 'seed', 'draft');
  await mkdir(draft, { recursive: true }); await writeFile(path.join(draft, 'voice.txt'), 'Exact accepted voice.');
  await write(path.join(draft, 'name.json'), { name: 'Seed', kind: 'paths' });
  await cp(path.resolve('server/ai/method/skills'), path.join(draft, 'skills'), { recursive: true });
  const fixture: ReplayCase = { label: 'Actual checkpoint fixture', sourceConversationId: 'conv_source', initialMap: createCareerMap('test-user'), priorTurns: [], priorItems: [{ type: 'message', id: 'prior-user', role: 'user', content: [{ type: 'input_text', text: 'Prior context.' }] }], currentMessage: 'I like making tools.', historicalReply: 'Historical question.', provenance: { reconstructed: true, actionContract: 'Ask about constraints.' } };
  await write(path.join(root, 'checkpoints', 'one', 'case.json'), fixture);
  await write(path.join(root, 'checkpoints', 'one', 'checkpoint.json'), { id: 'one', label: fixture.label, kind: 'paths', context: [{ role: 'user', text: 'Prior context.' }], currentMessage: fixture.currentMessage, historicalReply: fixture.historicalReply, historicalCards: [], provenance: fixture.provenance });
  return { root, fixture, store: await createLabStore({ root, envPath: '/unused-secret-file', runner: runner ?? fixtureRunner }) };
}
// This fixture runner proves service wiring only; production engine remains runReplay.
// It uses the actual reducer and actual terminal projection, with no provider calls.
const fixtureRunner: LabRunner = async ({ casePath, outputPath }) => {
  const fixture = await read<ReplayCase>(casePath);
  const turnId = path.basename(path.dirname(casePath));
  const priorTurns = structuredClone(fixture.priorTurns);
  const revision = fixture.initialMap.revision;
  const operation = { type: 'append-foundation-evidence' as const, sourceId: 'op_' + turnId, expectedRevision: revision, occurredAt: '2026-10-03T10:00:00.000Z', payload: { evidence: { id: 'evidence_' + turnId, revision: 1, category: 'fascination' as const, content: fixture.currentMessage, provenance: { kind: 'user-message' as const, actionId: 'msg_' + turnId, turnId, turnSequence: revision + 1, occurredAt: '2026-10-03T10:00:00.000Z' } } } };
  const result = applyCareerMapOperation(fixture.initialMap, operation);
  if (result.status !== 'committed') throw new Error('Fixture operation failed.');
  const generated = [{ type: 'message', id: 'user_' + turnId, role: 'user', content: [{ type: 'input_text', text: fixture.currentMessage }] }, { type: 'message', id: 'assistant_' + turnId, role: 'assistant', content: [{ type: 'output_text', text: 'A useful question.' }] }];
  const projection = resolveDisplayProjection(generated, fixture.currentMessage, 'A useful question.');
  priorTurns.push({ turnId, userId: 'test-user', clientMessageId: 'msg_' + turnId, leaseId: 'lease_' + turnId, requestFingerprint: 'fingerprint', origin: 'agent-turn', status: 'completed', createdAt: new Date(), updatedAt: new Date(), terminalAt: new Date(), terminalResult: { kind: 'completed', displayProjection: projection } });
  await write(path.join(outputPath, 'continuation.json'), { initialMap: result.map, priorTurns, priorItems: [...fixture.priorItems, ...generated] });
  await write(path.join(outputPath, 'result.json'), { model: 'gpt-6.1-sol', reasoningEffort: 'low', reply: 'A useful question.', traces: [], operations: [{ operation, status: 'committed' }], initialRevision: revision, finalRevision: result.map.revision, prefixPreserved: true, sourceFileUnchanged: true });
};

describe('private replay lab', () => {
  it('preserves historical three-module candidate bytes and membership without filling later defaults', async () => {
    const {root,store} = await setup();
    const skills = path.join(root,'candidates/seed/draft/skills');
    await rm(path.join(skills,'guide-path-project'),{recursive:true});
    await rm(path.join(skills,'interpret-path-project'),{recursive:true});
    const before = await readFile(path.join(skills,'create-purpose-paths/SKILL.md'),'utf8');
    const first = await store.getCandidate('seed');
    expect(Object.keys(first.skills)).toHaveLength(3);
    expect((await store.getCandidate('seed')).version).toBe(first.version);
    expect(await readFile(path.join(skills,'create-purpose-paths/SKILL.md'),'utf8')).toBe(before);
    expect(first).not.toHaveProperty('effortByModule');
  });

  it('freezes production policy and isolated sibling histories for learning continuations', async () => {
    const calls: Parameters<LabRunner>[0][] = [];
    const {root,store} = await setup(async options => { calls.push(options); await fixtureRunner(options); });
    const policy = {'form-foundation':'low','create-purpose-paths':'high','design-path-project':'medium','guide-path-project':'low','interpret-path-project':'low'};
    await write(path.join(root,'candidates/seed/draft/name.json'),{name:'Current learning loop',kind:'learning',effortByModule:policy});
    const candidate = await store.getCandidate('seed');
    const copy = await store.createCandidate({name:'Learning copy',copyFrom:'seed'});
    expect(copy.effortByModule).toEqual(policy);
    const {jobIds:[parentId]} = await store.batch({candidateIds:['seed'],checkpointIds:['one']});
    await store.idle();
    const parent = await store.getJob(parentId);
    expect(parent.status).toBe('done');
    expect(parent.canonicalState?.revision).toBe(1);
    await store.updateCandidate('seed',{expectedVersion:candidate.version,voice:'A later voice edit.'});
    const [a,b] = await Promise.all([store.continueJob(parentId,{message:'Adjust how I work.'}),store.continueJob(parentId,{message:'Explore another direction.'})]);
    await store.idle();
    const children = await Promise.all([a.jobIds[0],b.jobIds[0]].map(id=>store.getJob(id)));
    for (const child of children) {
      expect(child.status).toBe('done'); expect(child.version).toBe(parent.version);
      expect(child.canonicalState?.revision).toBe(2);
      expect(child.config?.effortByModule).toEqual(policy);
      expect(child.config?.voice).toBe(parent.config?.voice);
    }
    expect(children[0].canonicalState?.foundation.evidence.at(-1)?.content).toBe('Adjust how I work.');
    expect(children[1].canonicalState?.foundation.evidence.at(-1)?.content).toBe('Explore another direction.');
    expect((await store.getJob(parentId)).canonicalState?.revision).toBe(1);
    for (const call of calls) expect(call).toMatchObject({reasoningEffort:'production',effortByModule:policy});
    const checkpoint = await store.getCheckpoint('one');
    await write(path.join(root,'checkpoints/one/checkpoint.json'),{...checkpoint,provenance:{awaitingReply:true}});
    await expect(store.batch({candidateIds:['seed'],checkpointIds:['one']})).rejects.toThrow('awaits your next answer');
    expect(calls).toHaveLength(3);
  });

  it('reserves main port 5173 and rejects the retired lab origin', async () => {
    const { store } = await setup();
    expect(() => createLabApp(store, 5173)).toThrow('reserved');
    const app = createLabApp(store);
    expect((await (await request(app)).get('/api/state').set('Host', '127.0.0.1:5317')).status).toBe(403);
    expect((await (await request(app)).get('/api/state').set('Host', 'localhost:5174')).status).toBe(200);
  });
  it('accepts only ignored untracked scoped storage inside Git and rejects forced tracked artifacts', async () => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'nami-private-git-'))); temporaryRoots.push(root);
    execFileSync('git', ['init', '-q', root]);
    await writeFile(path.join(root, '.gitignore'), '.context/\n');
    const privateRoot = path.join(root, '.context/revelio/replay');
    await mkdir(privateRoot, { recursive: true });
    expect(await validatePrivateRoot(privateRoot)).toBe(privateRoot);
    expect(await privateArtifactPath(path.join(privateRoot, 'new-result'))).toBe(path.join(privateRoot, 'new-result'));
    await mkdir(path.join(root, 'unignored'));
    await expect(validatePrivateRoot(path.join(root, 'unignored'))).rejects.toThrow(/scoped|ignored/i);
    await writeFile(path.join(root, '.gitignore'), '');
    await expect(validatePrivateRoot(privateRoot)).rejects.toThrow(/ignored/i);
    await writeFile(path.join(root, '.gitignore'), '.context/\n');
    await writeFile(path.join(privateRoot, 'forced.txt'), 'Test fixture only');
    execFileSync('git', ['add', '-f', '.context/revelio/replay/forced.txt'], { cwd: root });
    await expect(validatePrivateRoot(privateRoot)).rejects.toThrow(/tracked/i);
  });
  it('rebases artifact metadata through an explicit migration map without rewriting immutable snapshots', async () => {
    const { root, store } = await setup();
    const before = await store.getCandidate('seed');
    const oldRoot = '/old/private/replay';
    const frozen = path.join(before.artifactPath, 'candidate.json');
    const bytes = JSON.stringify({ ...before, artifactPath: before.artifactPath.replace(root, oldRoot) }, null, 2);
    await writeFile(frozen, bytes);
    await write(path.join(root, '.artifact-relocation.json'), { mappings: [{ from: oldRoot, to: root }] });
    const migrated = await createLabStore({ root, envPath: '/unused', runner: fixtureRunner });
    expect((await migrated.getCandidate('seed')).artifactPath).toBe(before.artifactPath);
    expect((await migrated.getCandidate('seed')).version).toBe(before.version);
    expect(await readFile(frozen, 'utf8')).toBe(bytes);
  });

  it('saves independent candidate content versions and returns actionable malformed-version errors without changing drafts', async () => {
    const { store } = await setup();
    const app = createLabApp(store);
    const initial = await store.getCandidate('seed');
    const skill = initial.skills['create-purpose-paths'].replace(/version:.*\n/, 'version: 1.1.7\n');
    const saved = await (await request(app)).put('/api/candidates/seed').set('Host', '127.0.0.1:5174').set('Origin', 'http://127.0.0.1:5174').send({ expectedVersion: initial.version, skills: { 'create-purpose-paths': skill } });
    expect(saved.status).toBe(200);
    expect(saved.body.skills['create-purpose-paths']).toBe(skill);
    const invalid = await (await request(app)).put('/api/candidates/seed').set('Host', '127.0.0.1:5174').set('Origin', 'http://127.0.0.1:5174').send({ expectedVersion: saved.body.version, skills: { 'create-purpose-paths': skill.replace('version: 1.1.7', 'version: broken') } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatch(/content version/i);
    expect((await store.getCandidate('seed')).version).toBe(saved.body.version);
  });

  it('exposes preparation conflicts in immutable versions and prevents blocked candidates or copies from spending a run', async () => {
    let calls = 0;
    const { root, store } = await setup(async (options) => { calls++; await fixtureRunner(options); });
    const before = await store.getCandidate('seed');
    const preparation = { status: 'blocked', conflicts: ['The current tool requires a removed card field.'], adaptations: ['Registry version only.'], originalSkill: 'Exact proposal.', contract: { requiredFields: ['possibility'] } };
    await write(path.join(root, 'candidates/seed/draft/preparation.json'), preparation);
    const prepared = await store.getCandidate('seed');
    expect(prepared).toMatchObject({ preparation });
    expect(prepared.version).not.toBe(before.version);
    expect(await read(path.join(prepared.artifactPath, 'candidate.json'))).toMatchObject({ preparation });
    const copy = await store.createCandidate({ name: 'Prepared copy', copyFrom: 'seed' });
    expect(copy).toMatchObject({ preparation });
    await expect(store.batch({ candidateIds: ['seed'], checkpointIds: ['one'] })).rejects.toThrow('requires contract preparation');
    await expect(store.batch({ candidateIds: [copy.id], checkpointIds: ['one'] })).rejects.toThrow('requires contract preparation');
    expect((await store.state()).jobs).toHaveLength(0);
    expect(calls).toBe(0);
  });
  it('runs a ready candidate with its preparation evidence frozen, retaining the earlier blocked version', async () => {
    let calls = 0;
    const { root, store } = await setup(async (options) => { calls++; await fixtureRunner(options); });
    const preparationFile = path.join(root, 'candidates/seed/draft/preparation.json');
    const blocked = { status: 'blocked', conflicts: ['Removed field is required.'], adaptations: ['Registry version only.'], originalSkill: 'Exact proposal.', contract: { requiredFields: ['possibility'] } };
    await write(preparationFile, blocked);
    const previous = await store.getCandidate('seed');
    const ready = { ...blocked, status: 'ready', conflicts: [], contract: { requiredFields: ['name'], legacyOptionalFields: ['possibility'] } };
    await write(preparationFile, ready);
    const candidate = await store.getCandidate('seed');
    expect(candidate.version).not.toBe(previous.version);
    expect(await read(path.join(previous.artifactPath, 'candidate.json'))).toMatchObject({ preparation: blocked });
    const { jobIds: [id] } = await store.batch({ candidateIds: ['seed'], checkpointIds: ['one'] });
    await store.idle();
    expect(calls).toBe(1);
    expect(await store.getJob(id)).toMatchObject({ status: 'done', config: { preparation: ready, controls: '' } });
    expect(await store.createCandidate({ name: 'V2 copy', copyFrom: 'seed' })).toMatchObject({ preparation: ready });
  });
  it('retains archived candidates and old versions without allowing their generation or accidental reactivation through editing', async () => {
    let calls = 0;
    const { root, store } = await setup(async (options) => { calls++; await fixtureRunner(options); });
    const prior = await store.getCandidate('seed');
    await write(path.join(root, 'candidates/seed/draft/name.json'), { name: 'Rejected baseline', kind: 'paths', archived: true });
    const archived = await store.getCandidate('seed');
    expect(archived).toMatchObject({ archived: true });
    expect(archived.version).not.toBe(prior.version);
    expect(await read(path.join(prior.artifactPath, 'candidate.json'))).not.toHaveProperty('archived');
    await expect(store.batch({ candidateIds: ['seed'], checkpointIds: ['one'] })).rejects.toThrow('archived');
    const edited = await store.updateCandidate('seed', { expectedVersion: archived.version, name: 'Renamed archive' });
    expect(edited).toMatchObject({ archived: true });
    const copy = await store.createCandidate({ name: 'Archive copy', copyFrom: 'seed' });
    expect(copy).toMatchObject({ archived: true });
    await expect(store.batch({ candidateIds: [copy.id], checkpointIds: ['one'] })).rejects.toThrow('archived');
    expect((await store.state()).jobs).toHaveLength(0);
    expect(calls).toBe(0);
  });
  it('detects direct draft edits, versions them, preserves old snapshots, and rejects stale saves or changed accepted voice', async () => {
    const { root, store } = await setup();
    const initial = await store.getCandidate('seed');
    const file = path.join(root, 'candidates/seed/draft/skills/form-foundation/SKILL.md');
    await writeFile(file, (await readFile(file, 'utf8')) + '\nExtra candidate guidance.\n');
    const changed = await store.getCandidate('seed');
    expect(changed.version).not.toBe(initial.version);
    expect((await read<typeof initial>(path.join(initial.artifactPath, 'candidate.json'))).skills['form-foundation']).toBe(initial.skills['form-foundation']);
    await expect(store.updateCandidate('seed', { expectedVersion: initial.version, name: 'Stale' })).rejects.toThrow('changed');
    await expect(store.updateCandidate('seed', { expectedVersion: changed.version, voice: 'Unapproved voice.' })).rejects.toThrow('exact accepted');
  });
  it('freezes all selected versions before starting bounded jobs; queued edits cannot affect snapshots or siblings', async () => {
    let active = 0, peak = 0;
    const release: Array<() => void> = [];
    const entries = Array.from({ length: 3 }, () => Promise.withResolvers<void>());
    let entered = 0;
    const { root, store } = await setup(async (options) => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>((resolve) => { release.push(resolve); entries[entered++].resolve(); });
      await fixtureRunner(options); active--;
    });
    const first = await store.getCandidate('seed');
    const second = await store.createCandidate({ name: 'Other hypothesis', copyFrom: 'seed' });
    const third = await store.createCandidate({ name: 'Queued hypothesis', copyFrom: 'seed' });
    const { jobIds } = await store.batch({ candidateIds: ['seed', second.id, third.id], checkpointIds: ['one'] });
    await Promise.all(entries.slice(0, 2).map((entry) => entry.promise));
    expect(peak).toBe(2);
    expect((await store.getJob(jobIds[2])).status).toBe('queued');
    await store.updateCandidate(third.id, { expectedVersion: third.version, name: 'Edited after enqueue' });
    expect((await store.getJob(jobIds[2])).config?.name).toBe('Queued hypothesis');
    expect((await store.getJob(jobIds[0])).config?.version).toBe(first.version);
    release.shift()!();
    await entries[2].promise;
    release.splice(0).forEach((resolve) => resolve()); await store.idle();
    const maps = await Promise.all(jobIds.map((id) => read<any>(path.join(root, 'jobs', id, 'output/continuation.json'))));
    expect(maps.map((value) => value.initialMap.revision)).toEqual([1, 1, 1]);
    expect(new Set(maps.map((value) => value.priorTurns.at(-1).turnId)).size).toBe(3);
    expect(maps[0].initialMap.foundation.evidence[0].id).not.toBe(maps[1].initialMap.foundation.evidence[0].id);
    expect((await read<ReplayCase>(path.join(root, 'checkpoints/one/case.json'))).initialMap.revision).toBe(0);
    await expect(store.batch({ candidateIds: Array(13).fill('seed'), checkpointIds: ['one'] })).rejects.toThrow('1–12');
  });

  it('retains failed-run diagnostics without retrying', async () => {
    let calls = 0;
    const { root, store } = await setup(async () => { calls++; throw new Error('Synthetic runner failure'); });
    const { jobIds } = await store.batch({ candidateIds: ['seed'], checkpointIds: ['one'] });
    await store.idle();
    expect((await store.getJob(jobIds[0])).status).toBe('error');
    expect((await read<{ message: string }>(path.join(root, 'jobs', jobIds[0], 'error-private.json'))).message).toBe('Synthetic runner failure');
    expect(calls).toBe(1);
  });

  it('keeps failure status in memory when diagnostics and job persistence fail, releasing the worker', async () => {
    let calls = 0;
    const { store } = await setup(async (options) => {
      calls++;
      if (calls === 1) {
        const directory = path.dirname(options.casePath);
        await rm(directory, { recursive: true });
        await writeFile(directory, 'Synthetic storage fault');
        throw new Error('Synthetic runner failure');
      }
      await fixtureRunner(options);
    });
    const { jobIds } = await store.batch({ candidateIds: ['seed'], checkpointIds: ['one'] });
    await store.idle();
    const failed = await store.getJob(jobIds[0]);
    expect(failed.status).toBe('error');
    expect(failed.error).toContain('retained in memory');
    const next = await store.batch({ candidateIds: ['seed'], checkpointIds: ['one'] });
    await store.idle();
    expect((await store.getJob(next.jobIds[0])).status).toBe('done');
    expect(calls).toBe(2);
  });

  it('preserves an imported candidate base through display, duplication and new runs', async () => {
    const { root, store } = await setup();
    const frozenTemplate = 'Original frozen rules.\n{{VOICE}}\n{{CONTROLS}}';
    await writeFile(path.join(root, 'candidates/seed/draft/base-template.txt'), frozenTemplate);
    const source = await store.getCandidate('seed');
    expect(source.sharedRules).toBe('Original frozen rules.\n\n');
    const copy = await store.createCandidate({ name: 'Imported copy', copyFrom: source.id });
    expect(copy.sharedRules).toBe(source.sharedRules);
    const { jobIds } = await store.batch({ candidateIds: [copy.id], checkpointIds: ['one'] });
    await store.idle();
    expect(await readFile(path.join(root, 'jobs', jobIds[0], 'instructions/base.txt'), 'utf8')).toBe('Original frozen rules.\nExact accepted voice.\n');
    const reloaded = await createLabStore({ root, envPath: '/unused', runner: fixtureRunner });
    expect((await reloaded.getCandidate(copy.id)).version).toBe(copy.version);
  });

  it('keeps a Paths continuation base frozen when the shared template changes after the parent run', async () => {
    const { root, store } = await setup();
    const { jobIds: [parentId] } = await store.batch({ candidateIds: ['seed'], checkpointIds: ['one'] }); await store.idle();
    const frozen = await readFile(path.join(root, 'jobs', parentId, 'instructions/base.txt'), 'utf8');
    await writeFile(path.join(root, 'base-template.txt'), 'Later shared rules.\n{{VOICE}}\n{{CONTROLS}}');
    const restarted = await createLabStore({ root, envPath: '/unused', runner: fixtureRunner });
    const { jobIds: [childId] } = await restarted.continueJob(parentId, { message: 'Synthetic fixture reply.' }); await restarted.idle();
    expect(await readFile(path.join(root, 'jobs', childId, 'instructions/base.txt'), 'utf8')).toBe(frozen);
  });
  it('continues from full parent state/history into independent children with frozen instructions and no fixed-action controls', async () => {
    const { root, store } = await setup();
    const voice = await store.createCandidate({ name: 'Voice', copyFrom: 'seed', kind: 'voice' });
    const { jobIds: [parentId] } = await store.batch({ candidateIds: [voice.id], checkpointIds: ['one'] }); await store.idle();
    const parent = await store.getJob(parentId);
    expect(parent.config?.controls).toBe('Ask about constraints.');
    const parentStatePath = path.join(root, 'jobs', parentId, 'output/continuation.json');
    const before = await readFile(parentStatePath, 'utf8');
    await store.updateCandidate(voice.id, { expectedVersion: voice.version, voice: 'New draft voice.' });
    const { jobIds: [a] } = await store.continueJob(parentId, { message: 'My first answer.' });
    const { jobIds: [b] } = await store.continueJob(parentId, { message: 'My alternative answer.' }); await store.idle();
    const childInput = await read<ReplayCase>(path.join(root, 'jobs', a, 'case.json'));
    expect(childInput.initialMap.revision).toBe(1);
    expect(childInput.priorTurns.at(-1)?.terminalResult?.displayProjection).toEqual(parentState(before).priorTurns.at(-1).terminalResult.displayProjection);
    expect(childInput.priorItems).toEqual(parentState(before).priorItems);
    expect((await store.getJob(a)).config?.voice).toBe('Exact accepted voice.');
    expect((await store.getJob(a)).config?.controls).toBe('');
    expect((await store.getJob(a)).metadata?.finalRevision).toBe(2);
    const sibling = await read<any>(path.join(root, 'jobs', b, 'output/continuation.json'));
    expect(sibling.initialMap.foundation.evidence.at(-1).content).toBe('My alternative answer.');
    expect(await readFile(parentStatePath, 'utf8')).toBe(before);
    expect((await store.getJob(parentId)).version).toBe(parent.version);
    await store.feedback(a, { preference: 'prefer', comment: 'Keep this wording.' });
    const restarted = await createLabStore({ root, envPath: '/unused', runner: fixtureRunner });
    expect((await restarted.getJob(a)).feedback.comment).toBe('Keep this wording.');
    expect((await restarted.getJob(a)).version).toBe(parent.version);
  });
  it('rejects cross-site mutations and unsafe identifiers before job/provider work', async () => {
    let runs = 0;
    const { store } = await setup(async (options) => { runs++; await fixtureRunner(options); });
    const app = createLabApp(store);
    expect((await (await request(app)).post('/api/batch').set('Host', '127.0.0.1:5174').set('Origin', 'https://attacker.invalid').send({ candidateIds: ['seed'], checkpointIds: ['one'] })).status).toBe(403);
    expect((await (await request(app)).post('/api/batch').set('Host', '127.0.0.1:5174').send({ candidateIds: ['seed'], checkpointIds: ['one'] })).status).toBe(403);
    expect((await (await request(app)).get('/api/state').set('Host', 'attacker.invalid')).status).toBe(403);
    await expect(store.getCandidate('../production')).rejects.toThrow('identifier');
    expect(runs).toBe(0);
    expect((await (await request(app)).get('/api/state').set('Host', '127.0.0.1:5174')).status).toBe(200);
  });
  it('marks persisted queued/running jobs interrupted on restart without replaying them', async () => {
    const { root } = await setup();
    await write(path.join(root, 'jobs', 'interrupted', 'job.json'), { id: 'interrupted', status: 'running', feedback: { preference: 'none', comment: '' } });
    let calls = 0;
    const restarted = await createLabStore({ root, envPath: '/unused', runner: async () => { calls++; } });
    expect((await restarted.getJob('interrupted')).status).toBe('error');
    await restarted.idle(); expect(calls).toBe(0);
  });
});
const parentState = (value: string): any => JSON.parse(value);

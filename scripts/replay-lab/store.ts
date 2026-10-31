/** Private local experiment store. Imports no live application or database. */
import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runReplay, type ReplayCase } from '../replay-nami.js';
import { NAMI_AGENT_MODEL } from '../../server/ai/agent.js';
import { careerMapSchema } from '../../shared/career-map/index.js';
import { METHOD_MODULE_KEYS } from '../../server/ai/method/registry.js';
import { createMethodModuleLoader, MethodModuleLoadError } from '../../server/ai/method/loader.js';
import { privateArtifactPath, loadArtifactRelocations, rebaseArtifactReferences } from '../replay-private-paths.js';
import type { Candidate, CandidateKind, CandidatePreparation, Checkpoint, Feedback, Job, LabState } from './types.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
export class LabInputError extends Error {}
export function validateId(id: string) { if (!idPattern.test(id)) throw new LabInputError('Invalid identifier.'); return id; }
async function json<T>(file: string): Promise<T> { return JSON.parse(await readFile(file, 'utf8')); }
async function exists(file: string) { return access(file).then(() => true, () => false); }

// The root and every descendant must be ordinary private files, never symlinked
// to production instructions. Checking all existing ancestors also rejects Git roots.
export async function validatePrivateRoot(root: string) {
  try {
    const resolved = await privateArtifactPath(root);
    await realpath(resolved); // The lab root must already exist.
    return resolved;
  } catch (error) { throw new LabInputError(error instanceof Error ? error.message : 'Invalid private root.'); }
}
async function ordinaryTree(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new LabInputError('Invalid private path.');
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new LabInputError('Private artifacts cannot be symlinks.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

export type LabRunner = (options: Parameters<typeof runReplay>[0]) => Promise<unknown>;
export async function createLabStore(options: { root: string; envPath: string; runner?: LabRunner }) {
  const root = await validatePrivateRoot(options.root);
  const runner = options.runner ?? runReplay;
  const relocations = await loadArtifactRelocations(root);
  const file = (...parts: string[]) => path.join(root, ...parts);
  async function read<T>(target: string) { await ordinaryTree(root, target); return rebaseArtifactReferences(await json<T>(target), relocations); }
  async function text(target: string) { await ordinaryTree(root, target); return readFile(target, 'utf8'); }
  async function save(target: string, value: unknown, exclusive = false) {
    await ordinaryTree(root, target);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    if (exclusive) return writeFile(target, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
    const temporary = target + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  }
  async function saveText(target: string, value: string) { await ordinaryTree(root, target); await mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); await writeFile(target, value, { mode: 0o600 }); }
  async function saveSkills(directory: string, skills: Record<string, string>) {
    for (const [key, value] of Object.entries(skills)) await saveText(path.join(directory, key, 'SKILL.md'), value);
  }
  async function ids(directory: string) {
    await ordinaryTree(root, directory);
    return (await readdir(directory).catch((error) => { if (error.code === 'ENOENT') return []; throw error; })).filter((name: string) => idPattern.test(name)).sort();
  }
  const acceptedVoice = await text(file('accepted-v4.txt'));
  const template = await text(file('base-template.txt'));
  if (!template.includes('{{VOICE}}')) throw new LabInputError('Base template must expose {{VOICE}}.');
  const sharedRules = template.replaceAll('{{VOICE}}', '').replaceAll('{{CONTROLS}}', '');
  const candidateLocks = new Map<string, Promise<unknown>>();
  async function serial<T>(id: string, action: () => Promise<T>): Promise<T> {
    const prior = candidateLocks.get(id) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(action);
    candidateLocks.set(id, next);
    try { return await next; } finally { if (candidateLocks.get(id) === next) candidateLocks.delete(id); }
  }
  async function validateSkills(skillsRoot: string) {
    const entries = await readdir(skillsRoot);
    const candidateModules = METHOD_MODULE_KEYS.filter(key => entries.includes(key));
    try { await createMethodModuleLoader({ skillsRoot, versionPolicy: 'candidate', candidateModules }); }
    catch (error) {
      if (error instanceof MethodModuleLoadError) throw new LabInputError(error.message);
      throw error;
    }
  }
  async function candidateUnlocked(id: string): Promise<Candidate> {
    validateId(id);
    const draft = file('candidates', id, 'draft');
    const info = await read<{ name: string; kind?: CandidateKind; archived?: boolean; effortByModule?: Candidate['effortByModule'] }>(path.join(draft, 'name.json'));
    const voice = await text(path.join(draft, 'voice.txt'));
    const skills: Record<string, string> = {};
    for (const key of METHOD_MODULE_KEYS) if (await exists(path.join(draft, 'skills', key, 'SKILL.md'))) skills[key] = await text(path.join(draft, 'skills', key, 'SKILL.md'));
    const kind = info.kind ?? 'paths';
    if (!['paths', 'voice', 'learning'].includes(kind)) throw new LabInputError('Invalid candidate kind.');
    if (kind === 'learning' && (Object.keys(skills).length !== METHOD_MODULE_KEYS.length
      || !info.effortByModule || Object.keys(info.effortByModule).length !== METHOD_MODULE_KEYS.length
      || METHOD_MODULE_KEYS.some(key => !['low','medium','high'].includes(info.effortByModule![key])))) {
      throw new LabInputError('Learning candidates require all five frozen modules and their effort policy.');
    }
    if (kind === 'paths' && voice !== acceptedVoice) throw new LabInputError('Path candidates must use the exact accepted V4 voice.');
    if (!info.name?.trim() || info.name.length > 200) throw new LabInputError('Candidate name is required.');
    await validateSkills(path.join(draft, 'skills'));
    const preparation = await exists(path.join(draft, 'preparation.json')) ? await read<CandidatePreparation>(path.join(draft, 'preparation.json')) : undefined;
    if (preparation && (!['blocked', 'ready'].includes(preparation.status) || !Array.isArray(preparation.conflicts) || (preparation.status === 'ready' && preparation.conflicts.length))) throw new LabInputError('Invalid candidate preparation.');
    if (info.archived !== undefined && typeof info.archived !== 'boolean') throw new LabInputError('Invalid candidate archive status.');
    // Imported experiments retain the base they were tested against.
    const candidateTemplate = await exists(path.join(draft, 'base-template.txt')) ? await text(path.join(draft, 'base-template.txt')) : template;
    if (!candidateTemplate.includes('{{VOICE}}')) throw new LabInputError('Candidate base template must expose {{VOICE}}.');
    const candidateRules = candidateTemplate.replaceAll('{{VOICE}}', '').replaceAll('{{CONTROLS}}', '');
    const details = { ...(info.effortByModule ? { effortByModule: info.effortByModule } : {}), ...(preparation ? { preparation } : {}), ...(info.archived ? { archived: true } : {}) };
    const version = hash({ name: info.name, kind, voice, skills, sharedRules: candidateRules, ...details });
    const artifactPath = file('candidates', id, 'versions', version);
    const candidate: Candidate = { id, name: info.name, kind, version, voice, skills, sharedRules: candidateRules, controls: '', acceptedVoice: voice === acceptedVoice, artifactPath, ...details };
    if (!await exists(path.join(artifactPath, 'candidate.json'))) {
      await save(path.join(artifactPath, 'candidate.json'), candidate, true);
      await saveText(path.join(artifactPath, 'voice.txt'), voice);
      await saveSkills(path.join(artifactPath, 'skills'), skills);
      if (candidateTemplate !== template) await saveText(path.join(artifactPath, 'base-template.txt'), candidateTemplate);
    } else {
      const saved = await read<Candidate>(path.join(artifactPath, 'candidate.json'));
      if (hash(saved) !== hash(candidate)) throw new LabInputError('Immutable candidate version changed.');
    }
    return candidate;
  }
  async function getCandidate(id: string) { return serial(id, () => candidateUnlocked(id)); }
  async function createCandidate(input: { name: string; copyFrom: string; kind?: CandidateKind }) {
    const source = await getCandidate(input.copyFrom);
    const id = 'candidate_' + randomUUID();
    const kind = input.kind ?? source.kind;
    if (!input.name?.trim() || input.name.length > 200 || !['paths', 'voice', 'learning'].includes(kind)) throw new LabInputError('Invalid candidate.');
    const draft = file('candidates', id, 'draft');
    await save(path.join(draft, 'name.json'), { name: input.name, kind, ...(source.effortByModule ? { effortByModule: source.effortByModule } : {}), ...(source.archived ? { archived: true } : {}) }, true);
    await saveText(path.join(draft, 'voice.txt'), kind === 'paths' ? acceptedVoice : source.voice);
    await saveSkills(path.join(draft, 'skills'), source.skills);
    if (await exists(path.join(source.artifactPath, 'base-template.txt'))) await saveText(path.join(draft, 'base-template.txt'), await text(path.join(source.artifactPath, 'base-template.txt')));
    if (source.preparation) await save(path.join(draft, 'preparation.json'), source.preparation);
    return getCandidate(id);
  }
  async function updateCandidate(id: string, input: { expectedVersion: string; name?: string; voice?: string; skills?: Record<string, string> }) {
    return serial(id, async () => {
      const previous = await candidateUnlocked(id);
      if (input.expectedVersion !== previous.version) throw new LabInputError('Candidate changed. Reload before saving.');
      const name = input.name ?? previous.name, voice = input.voice ?? previous.voice, skills = { ...previous.skills, ...input.skills };
      if (!name.trim() || name.length > 200 || typeof voice !== 'string' || !voice.trim() || voice.length > 100_000) throw new LabInputError('Invalid candidate text.');
      if (previous.kind === 'paths' && voice !== acceptedVoice) throw new LabInputError('Path candidates must use the exact accepted V4 voice.');
      if (Object.keys(skills).some((key) => !METHOD_MODULE_KEYS.includes(key as never)) || Object.values(skills).some((value) => typeof value !== 'string' || value.length > 200_000)) throw new LabInputError('Invalid skill bundle.');
      // Validate a private staging copy before touching the editable draft.
      const staging = file('staging', randomUUID());
      try {
        await saveSkills(path.join(staging, 'skills'), skills);
        await validateSkills(path.join(staging, 'skills'));
      } finally { await rm(staging, { recursive: true, force: true }); }
      const draft = file('candidates', id, 'draft');
      await save(path.join(draft, 'name.json'), { name, kind: previous.kind, ...(previous.effortByModule ? { effortByModule: previous.effortByModule } : {}), ...(previous.archived ? { archived: true } : {}) });
      await saveText(path.join(draft, 'voice.txt'), voice);
      await saveSkills(path.join(draft, 'skills'), skills);
      return candidateUnlocked(id);
    });
  }
  async function getCheckpoint(id: string) { validateId(id); return read<Checkpoint>(file('checkpoints', id, 'checkpoint.json')); }
  async function checkpoints() { return Promise.all((await ids(file('checkpoints'))).map(getCheckpoint)); }
  const jobs = new Map<string, Job>();
  for (const id of await ids(file('jobs'))) {
    const job = await read<Job>(file('jobs', id, 'job.json'));
    if (job.status === 'queued' || job.status === 'running') {
      job.status = 'error'; job.error = 'Interrupted by server restart. Select a new run to try again.';
      await save(file('jobs', id, 'job.json'), job);
    }
    jobs.set(id, job);
  }
  // Archives are optional lightweight manifests prepared from previously retained runs.
  for (const id of await ids(file('archives'))) {
    const archive = await read<Job>(file('archives', id, 'job.json'));
    jobs.set(id, { ...archive, archive: true });
  }
  async function persistJob(job: Job) { jobs.set(job.id, job); await save(file('jobs', job.id, 'job.json'), job); }
  async function getJob(id: string) { validateId(id); const job = jobs.get(id); if (!job) throw new LabInputError('Result not found.'); return structuredClone(job); }
  let running = 0;
  const queue: string[] = [];
  const tasks = new Set<Promise<void>>();
  async function execute(id: string) {
    const job = jobs.get(id)!;
    const directory = file('jobs', id);
    try {
      job.status = 'running'; await persistJob(job);
      const fixture = await read<ReplayCase>(path.join(directory, 'case.json'));
      await runner({ casePath: path.join(directory, 'case.json'), instructionsPath: path.join(directory, 'instructions'), outputPath: path.join(directory, 'output'), envPath: options.envPath, captureContinuation: true, reasoningEffort: job.config?.kind === 'learning' ? 'production' : 'low', effortByModule: job.config?.effortByModule });
      const result = await read<Record<string, any>>(path.join(directory, 'output/result.json'));
      const continuation = await read<Pick<ReplayCase, 'initialMap' | 'priorTurns' | 'priorItems'>>(path.join(directory, 'output/continuation.json'));
      if (!Array.isArray(continuation.priorItems) || !continuation.priorItems.length || !continuation.priorTurns.at(-1)?.terminalResult?.displayProjection) throw new Error('Incomplete continuation.');
      const turnId = continuation.priorTurns.at(-1)!.turnId;
      const displayed = result.canonicalPurposePathsOffer === true ? continuation.initialMap.pathSets.filter((set) => set.presentation.assistantTurnId === turnId) : [];
      Object.assign(job, { ...(job.config?.kind === 'learning' ? { canonicalState: careerMapSchema.parse(continuation.initialMap) } : {}), status: 'done', reply: result.reply, cards: displayed.flatMap((set) => set.paths), traces: result.traces, operations: result.operations, providerItems: continuation.priorItems,
        metadata: { model: result.model, effort: result.reasoningEffort, ...(job.config?.effortByModule ? { effortByModule: job.config.effortByModule } : {}), provenance: fixture.provenance, initialRevision: result.initialRevision, finalRevision: result.finalRevision, sourceFileUnchanged: result.sourceFileUnchanged, prefixPreserved: result.prefixPreserved, databaseConnected: false } });
    } catch (error) {
      job.status = 'error'; job.error = 'Run failed. Private diagnostic artifacts are preserved; no automatic retry.';
      try {
        await save(path.join(directory, 'error-private.json'), { name: error instanceof Error ? error.name : 'UnknownError', message: error instanceof Error ? error.message : String(error) });
      } catch {
        job.error = 'Run failed. Private storage could not retain diagnostics; no automatic retry.';
      }
    }
    try { await persistJob(job); }
    catch {
      job.status = 'error';
      job.error = 'Private storage could not save the result. Status is retained in memory; no automatic retry.';
    }
  }
  function pump() {
    while (running < 2 && queue.length) {
      const id = queue.shift()!; running++;
      const task = execute(id).catch(() => {
        const job = jobs.get(id)!;
        job.status = 'error'; job.error = 'Run failed unexpectedly; no automatic retry.';
      }).finally(() => { running--; tasks.delete(task); pump(); });
      tasks.add(task);
    }
  }
  async function enqueue(candidate: Candidate, checkpoint: Checkpoint, fixture: ReplayCase, parentId?: string, frozenBase?: string) {
    const id = 'job_' + randomUUID();
    const controls = candidate.kind === 'voice' ? String(checkpoint.provenance.actionContract ?? '') : '';
    const config = { ...structuredClone(candidate), controls };
    const directory = file('jobs', id);
    await save(path.join(directory, 'case.json'), fixture, true);
    const runTemplate = await exists(path.join(candidate.artifactPath, 'base-template.txt')) ? await text(path.join(candidate.artifactPath, 'base-template.txt')) : template;
    await saveText(path.join(directory, 'instructions/base.txt'), frozenBase ?? runTemplate.replaceAll('{{VOICE}}', config.voice).replaceAll('{{CONTROLS}}', controls));
    await saveSkills(path.join(directory, 'instructions/skills'), config.skills);
    const job: Job = { id, candidateId: config.id, candidateName: config.name, version: config.version, checkpointId: checkpoint.id, ...(parentId ? { parentId } : {}), createdAt: new Date().toISOString(), status: 'queued', currentMessage: fixture.currentMessage, feedback: { preference: 'none', comment: '' }, config,
      caveats: ['Historical inputs may be reconstructed; see checkpoint provenance.', 'Only available provider items are retained. Hidden reasoning is unavailable.'], metadata: { model: NAMI_AGENT_MODEL, effort: config.kind === 'learning' ? 'production' : 'low', ...(config.effortByModule ? { effortByModule: config.effortByModule } : {}), provenance: fixture.provenance } };
    await persistJob(job); queue.push(id);
    return id;
  }
  async function batch(input: { candidateIds: string[]; checkpointIds: string[] }) {
    if (!Array.isArray(input.candidateIds) || !Array.isArray(input.checkpointIds) || !input.candidateIds.length || !input.checkpointIds.length || input.candidateIds.length * input.checkpointIds.length > 12
      || new Set(input.candidateIds).size !== input.candidateIds.length || new Set(input.checkpointIds).size !== input.checkpointIds.length) throw new LabInputError('Choose 1–12 distinct candidate/checkpoint pairs.');
    const candidates = await Promise.all(input.candidateIds.map(getCandidate));
    const archived = candidates.find((candidate) => candidate.archived);
    if (archived) throw new LabInputError(`${archived.name} is archived and cannot run. Start from an active candidate.`);
    const blocked = candidates.find((candidate) => candidate.preparation?.status === 'blocked');
    if (blocked) throw new LabInputError(`${blocked.name} requires contract preparation before running: ${blocked.preparation!.conflicts.join(' ')}`);
    const selections = await Promise.all(input.checkpointIds.map(async (id) => { validateId(id); return { checkpoint: await getCheckpoint(id), fixture: await read<ReplayCase>(file('checkpoints', id, 'case.json')) }; }));
    if (selections.some(({ checkpoint }) => checkpoint.provenance.awaitingReply === true)) throw new LabInputError('This checkpoint awaits your next answer. Use Continue this branch on its captured result.');
    const jobIds: string[] = [];
    for (const candidate of candidates) for (const { checkpoint, fixture } of selections) jobIds.push(await enqueue(candidate, checkpoint, fixture));
    pump(); return { jobIds };
  }
  async function continueJob(id: string, input: { message: string }) {
    const parent = await getJob(id);
    if (parent.status !== 'done' || parent.archive || !parent.config) throw new LabInputError('This result has no complete isolated history to continue.');
    if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 20_000) throw new LabInputError('Enter a reply of 1–20,000 characters.');
    const continuation = await read<Pick<ReplayCase, 'initialMap' | 'priorTurns' | 'priorItems'>>(file('jobs', id, 'output/continuation.json'));
    if (!continuation.priorItems?.length || !continuation.priorTurns.at(-1)?.terminalResult?.displayProjection) throw new LabInputError('Required continuation history is unavailable.');
    const original = await read<ReplayCase>(file('jobs', id, 'case.json'));
    const checkpoint = await read<Checkpoint>(file('checkpoints', parent.checkpointId, 'checkpoint.json'));
    const { actionContract: _oldContract, ...parentProvenance } = original.provenance;
    const fixture: ReplayCase = { ...original, ...structuredClone(continuation), currentMessage: input.message, historicalReply: '', label: 'Continuation of ' + parent.id, provenance: { ...parentProvenance, parentJobId: parent.id, continuation: true } };
    const parentBase = await text(file('jobs', id, 'instructions/base.txt'));
    // Voice checkpoints alone discard their one-turn action contract on continuation.
    const frozenBase = parent.config.kind === 'voice' && parent.config.controls
      ? parentBase.replace(parent.config.controls, '') : parentBase;
    const childId = await enqueue(parent.config, { ...checkpoint, provenance: {} }, fixture, parent.id, frozenBase);
    pump(); return { jobIds: [childId] };
  }
  async function feedback(id: string, input: Feedback) {
    await getJob(id);
    if (!['none', 'prefer', 'avoid'].includes(input.preference) || typeof input.comment !== 'string' || input.comment.length > 30_000) throw new LabInputError('Invalid feedback.');
    const value = { preference: input.preference, comment: input.comment, updatedAt: new Date().toISOString() };
    // Do not replace the running job with a stale clone while feedback is saving.
    const current = jobs.get(id)!; current.feedback = value;
    if (current.archive) { await save(file('archives', id, 'job.json'), current); } else await persistJob(current);
    return value;
  }
  async function state(): Promise<LabState> {
    return { candidates: await Promise.all((await ids(file('candidates'))).map(getCandidate)), checkpoints: (await checkpoints()).map((checkpoint) => { const { availableProviderItems, ...provenance } = checkpoint.provenance; return { ...checkpoint, provenance }; }), jobs: [...jobs.values()].map(({ config, traces, providerItems, operations, ...summary }) => structuredClone(summary)), model: NAMI_AGENT_MODEL, effort: 'low', concurrency: 2, acceptedVoice, privateRoot: root };
  }
  async function idle() { while (tasks.size || queue.length) { pump(); await Promise.all([...tasks]); } }
  return { state, getCheckpoint, getCandidate, createCandidate, updateCandidate, batch, getJob, continueJob, feedback, idle };
}

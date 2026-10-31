/** Local private replay. Production imports none of this module. No database client. */
import { privateArtifactPath } from './replay-private-paths.js';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, cp, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createOpenAI } from '@ai-sdk/openai';
import { parse as parseEnv } from 'dotenv';
import { applyCareerMapOperation, careerMapSchema, readCareerMap, type CareerMap, userActionProvenanceSchema } from '../shared/career-map/index.js';
import { createMethodAgent, NAMI_AGENT_MODEL, type MethodPreparedStepTrace } from '../server/ai/agent.js';
import { BASE_INSTRUCTIONS_VERSION } from '../server/ai/method/base-instructions.js';
import { METHOD_MODULE_KEYS, methodReasoningEffort, isRegisteredMethodModule, type RegisteredMethodModuleKey } from '../server/ai/method/registry.js';
import { createMethodModuleLoader } from '../server/ai/method/loader.js';
import { listConversationItems, OpenAIConversationClient, resolveDisplayProjection, resolveInternalContextItemIds } from '../server/ai/history.js';
import { confirmationPresentationTurnId, nextMethodTurnSequence, type IStorage, type AgentTurnRecord, type DurableMethodTurnIdentity } from '../server/storage.js';

type ReplayTurn = DurableMethodTurnIdentity & { userId: string };
type PersistInput = Parameters<IStorage['persistCareerMapOperation']>[0];
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
// One local comparison may include several model steps and history pages.
const REPLAY_DEADLINE_MS = 15 * 60 * 1000;

export function replayPrefixPreserved(seeded: Record<string, unknown>[], prior: Record<string, unknown>[]) {
  const contentOnly = (item: Record<string, unknown>) => {
    const { id: _id, status: _status, ...content } = item;
    // Conversations supplies these empty defaults when synthetic assistant text
    // omits them. Keep nonempty values and every other field in the comparison.
    if (content.type === 'message' && Array.isArray(content.content)) {
      content.content = content.content.map(part => part?.type === 'output_text'
        ? { annotations: [], logprobs: [], ...part } : part);
    }
    return content;
  };
  return isDeepStrictEqual(seeded.map(contentOnly), prior.map(contentOnly));
}

function replayPayloadMatchesContext(value: unknown, context: PersistInput['context']): boolean {
  if (!value || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.every(item => replayPayloadMatchesContext(item, context));
  const record = value as Record<string, unknown>;
  const action = userActionProvenanceSchema.safeParse(record);
  if (action.success) return isDeepStrictEqual(action.data, context.action);
  if (record.kind === 'model-presentation') return isDeepStrictEqual(record, context.presentation);
  return Object.values(record).every(item => replayPayloadMatchesContext(item, context));
}

export function createReplayStorage(source: CareerMap, priorTurns: AgentTurnRecord[], turn: ReplayTurn) {
  let map = readCareerMap(structuredClone(source));
  const operations: Array<{ operation: PersistInput['operation']; status: string }> = [];
  if (map.explorerId !== turn.userId) throw new Error('Replay owner mismatch.');
  return {
    operations,
    async loadCareerMap(userId: string) {
      if (userId !== turn.userId) throw new Error('Replay owner mismatch.');
      return { status: 'ready' as const, map: structuredClone(map) };
    },
    async listAgentTurns(userId: string) {
      if (userId !== turn.userId) throw new Error('Replay owner mismatch.');
      return structuredClone(priorTurns);
    },
    async persistCareerMapOperation(input: PersistInput) {
      input.abortSignal?.throwIfAborted();
      if (input.userId !== turn.userId || input.leaseId !== turn.leaseId
        || input.context.turnId !== turn.turnId || input.context.clientMessageId !== turn.clientMessageId
        || input.context.origin !== turn.origin || input.context.leaseId !== turn.leaseId
        || input.context.requestFingerprint !== turn.requestFingerprint) throw new Error('Replay turn mismatch.');
      if (!replayPayloadMatchesContext(input.operation.payload, input.context)) {
        const rejected = { status: 'rejected' as const, map: structuredClone(map), error: { code: 'invalid-operation' as const, message: 'Operation provenance must be derived from the active durable turn.' } };
        operations.push({ operation: structuredClone(input.operation), status: rejected.status });
        return rejected;
      }
      const result = applyCareerMapOperation(map, input.operation);
      if (result.status === 'committed') {
        const presentedInTurnId = confirmationPresentationTurnId(result.map, input.operation);
        if (presentedInTurnId && !priorTurns.some((prior) => prior.turnId === presentedInTurnId && prior.status === 'completed')) {
          const rejected = { status: 'rejected' as const, map: structuredClone(map), error: { code: 'confirmation-not-auditable' as const, message: 'Conversational confirmation requires a completed prior presentation turn.' } };
          operations.push({ operation: structuredClone(input.operation), status: rejected.status });
          return rejected;
        }

        result.receipt.moduleVersion = input.moduleVersion;
        result.map.operationHistory[result.map.operationHistory.length - 1] = result.receipt;
        const persisted = careerMapSchema.safeParse(result.map);
        if (!persisted.success) {
          const rejected = { status: 'rejected' as const, map: structuredClone(map), error: { code: 'invalid-operation' as const, message: 'A valid Method module version is required for replay operations.' } };
          operations.push({ operation: structuredClone(input.operation), status: rejected.status });
          return rejected;
        }
      }
      if (result.status === 'committed' || result.status === 'replayed') map = structuredClone(result.map);
      operations.push({ operation: structuredClone(input.operation), status: result.status });
      return structuredClone(result);
    },
    async completeTurn(assistantText: string, occurredAt: string) {
      const project = map.projects.find(candidate => candidate.acceptanceFraming?.status === 'pending'
        && candidate.acceptanceFraming.assistantTurnId === turn.turnId);
      if (!project?.acceptanceFraming) return;
      const operation = {
        type: 'deliver-first-project-framing' as const, sourceId: `framing-delivery:${turn.turnId}`,
        expectedRevision: map.revision, occurredAt,
        payload: { projectId: project.id, projectRevision: project.revision, assistantText,
          presentation: { kind: 'model-presentation' as const, assistantTurnId: turn.turnId,
            turnSequence: project.acceptanceFraming.turnSequence, completed: true as const, presentedAt: occurredAt } },
      };
      const result = applyCareerMapOperation(map, operation);
      if (result.status !== 'committed') throw new Error('Replay framing delivery did not match completed output.');
      result.receipt.moduleVersion = project.acceptanceFraming.moduleVersion;
      result.map.operationHistory[result.map.operationHistory.length - 1] = result.receipt;
      map = careerMapSchema.parse(result.map);
      operations.push({ operation: structuredClone(operation), status: result.status });
    },
  };
}

/** All writes must target a Conversation created through this fetch instance. */
export function createReplayFetch(transport: typeof fetch = fetch, deadlineSignal?: AbortSignal): typeof fetch {
  const created = new Set<string>();
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== 'https://api.openai.com') throw new Error('Replay endpoint blocked.');
    const body = request.method === 'POST' ? await request.clone().json() : undefined;
    const create = request.method === 'POST' && url.pathname === '/v1/conversations';
    const items = url.pathname.match(/^\/v1\/conversations\/([^/]+)\/items$/);
    const validListQuery = [...url.searchParams.keys()].every((key) => ['limit', 'order', 'after'].includes(key))
      && /^[1-9]\d?$|^100$/.test(url.searchParams.get('limit') ?? '')
      && ['asc', 'desc'].includes(url.searchParams.get('order') ?? '')
      && (!url.searchParams.has('after') || /^[A-Za-z0-9_-]{1,200}$/.test(url.searchParams.get('after')!));
    const list = items && created.has(items[1]) && request.method === 'GET' && validListQuery;
    if (url.search && !list) throw new Error('Replay pagination blocked.');
    const response = request.method === 'POST' && url.pathname === '/v1/responses';
    if (!create && !list && !(items && created.has(items[1]) && request.method === 'POST')
      && !(response && created.has(body?.conversation) && !body.previous_response_id)) {
      throw new Error('Replay Conversation blocked.');
    }
    const boundedRequest = deadlineSignal
      ? new Request(request, { signal: AbortSignal.any([request.signal, deadlineSignal]) })
      : request;
    const result = await transport(boundedRequest);
    if (create && result.ok) {
      const record = await result.clone().json();
      if (typeof record.id !== 'string' || !record.id.startsWith('conv_')) throw new Error('Invalid replay Conversation.');
      created.add(record.id);
    }
    return result;
  };
}

export interface ReplayCase {
  label: string;
  sourceConversationId: string;
  initialMap: CareerMap;
  priorTurns: AgentTurnRecord[];
  priorItems: Record<string, unknown>[];
  currentMessage: string;
  historicalReply: string;
  provenance: Record<string, unknown>;
}



export async function runReplay(options: { casePath: string; instructionsPath: string; outputPath: string; envPath: string; captureContinuation?: boolean; deadlineMs?: number; reasoningEffort?: 'production' | 'low' | 'medium' | 'high'; effortByModule?: Record<string, 'low' | 'medium' | 'high'> }) {
  const reasoningEffort = options.reasoningEffort ?? 'low';
  const runtimePolicy = Object.fromEntries(METHOD_MODULE_KEYS.map(key => [key, methodReasoningEffort(key)]));
  const effortByModule = structuredClone(options.effortByModule ?? runtimePolicy);
  if (reasoningEffort === 'production' && !isDeepStrictEqual(effortByModule, runtimePolicy)) {
    throw new Error('Frozen production effort policy differs from the runtime policy.');
  }
  const replayStarted = performance.now();
  const casePath = await privateArtifactPath(options.casePath);
  const instructionsPath = await privateArtifactPath(options.instructionsPath);
  const outputPath = await privateArtifactPath(options.outputPath);
  const sourceText = await readFile(casePath, 'utf8');
  const fixture = JSON.parse(sourceText) as ReplayCase;
  const sourceSchemaVersion = fixture.initialMap.schemaVersion;
  fixture.initialMap = readCareerMap(fixture.initialMap);
  if (!fixture.currentMessage || !Array.isArray(fixture.priorItems)) throw new Error('Incomplete replay case.');
  // Read only the API key into the runtime; DATABASE_URL/auth credentials never enter process.env.
  const env = parseEnv(await readFile(options.envPath, 'utf8'));
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing.');
  const deadlineSignal = AbortSignal.timeout(options.deadlineMs ?? REPLAY_DEADLINE_MS);
  const runId = randomUUID();
  await mkdir(outputPath, { mode: 0o700 }); // Existing results cannot be overwritten.
  await cp(instructionsPath, path.join(outputPath, 'instructions'), { recursive: true, errorOnExist: true, force: false });
  const baseInstructions = await readFile(path.join(outputPath, 'instructions/base.txt'), 'utf8');
  const skillsRoot = path.join(outputPath, 'instructions/skills');
  const candidateModules = (await readdir(skillsRoot)).sort();
  if (candidateModules.some(key => !isRegisteredMethodModule(key))) throw new Error('Replay contains an unknown Method module.');
  const loader = await createMethodModuleLoader({ skillsRoot, versionPolicy: 'candidate', candidateModules: candidateModules as RegisteredMethodModuleKey[] });
  const policyFile = path.join(outputPath, 'instructions/effort-policy.json');
  const frozenPolicy = await readFile(policyFile, 'utf8').then(value => JSON.parse(value), error => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  const requestedPolicy = { mode: reasoningEffort, effortByModule };
  if (frozenPolicy && !isDeepStrictEqual(frozenPolicy, requestedPolicy)) throw new Error('Frozen instruction effort policy differs from requested replay policy.');
  if (!frozenPolicy) await writeFile(policyFile, JSON.stringify(requestedPolicy, null, 2), { mode: 0o600, flag: 'wx' });
  const traces: MethodPreparedStepTrace[] = [];
  const providerRequests: Array<Record<string, unknown>> = [];
  const modelCalls: Array<{ requestIndex: number; startedAt: string; durationMs?: number; status?: number }> = [];
  let diagnostics: unknown;
  const errors: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname === '/v1/responses') {
      const payload = await request.clone().json();
      // Full exact request is deliberately retained only in the private result directory.
      const module = traces.at(-1)?.module;
      const expectedEffort = reasoningEffort === 'production' ? (module && effortByModule[module]) : reasoningEffort;
      if (!expectedEffort || payload.reasoning?.effort !== expectedEffort) throw new Error('Outgoing replay effort differs from the prepared checkpoint policy.');
      providerRequests.push(payload);
      const call = { requestIndex: providerRequests.length - 1, startedAt: new Date().toISOString() } as typeof modelCalls[number];
      modelCalls.push(call);
      const started = performance.now();
      const response = await fetch(request);
      call.status = response.status;
      if (!response.body) { call.durationMs = performance.now() - started; return response; }
      return new Response(response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) { controller.enqueue(chunk); },
        flush() { call.durationMs = performance.now() - started; },
      })), { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    return fetch(request);
  };
  const guardedFetch = createReplayFetch(transport, deadlineSignal);
  const api = async (endpoint: string, body: unknown) => {
    const result = await guardedFetch('https://api.openai.com/v1/' + endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!result.ok) {
      // Provider messages can contain personal request values, so retain them privately only.
      await writeFile(path.join(outputPath, 'provider-error.txt'), await result.text(), { mode: 0o600 });
      throw new Error(`Replay provider HTTP ${result.status}. See private provider-error.txt.`);
    }
    return result.json();
  };
  const conversation = await api('conversations', { metadata: { purpose: 'nami-isolated-replay', run: runId } });
  if (conversation.id === fixture.sourceConversationId) throw new Error('Source Conversation returned as replay.');
  await writeFile(path.join(outputPath, 'branch.json'), JSON.stringify({ runId, conversationId: conversation.id }), { mode: 0o600 });
  const seededItems = [];
  for (let offset = 0; offset < fixture.priorItems.length; offset += 20) {
    const batch = fixture.priorItems.slice(offset, offset + 20);
    const result = await api(`conversations/${conversation.id}/items`, { items: batch });
    seededItems.push(...result.data);
  }
  await writeFile(path.join(outputPath, 'seeded-items.json'), JSON.stringify(seededItems, null, 2), { mode: 0o600 });
  const prefixPreserved = replayPrefixPreserved(seededItems, fixture.priorItems);
  if (options.captureContinuation && seededItems.some((item, index) => fixture.priorItems[index].id && item.id !== fixture.priorItems[index].id)) throw new Error('Seeded provider identities changed; cannot safely continue.');
  if (!prefixPreserved) throw new Error('Provider did not preserve the exact seeded prefix.');
  const turn: ReplayTurn = {
    userId: fixture.initialMap.explorerId, turnId: `replay_${runId}`, leaseId: `lease_${runId}`,
    clientMessageId: `message_${runId}`, requestFingerprint: digest(fixture.currentMessage), origin: 'agent-turn',
  };
  const storage = createReplayStorage(fixture.initialMap, fixture.priorTurns, turn);
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY, fetch: guardedFetch });
  const agent = createMethodAgent({
    model: openai.responses(NAMI_AGENT_MODEL), nativeWebSearchTool: openai.tools.webSearch(),
    storage, loader, userId: turn.userId, conversationId: conversation.id, turn,
    turnSequence: nextMethodTurnSequence(fixture.initialMap), occurredAt: new Date().toISOString(),
    currentMessage: fixture.currentMessage, baseInstructions, replayReasoningEffort: reasoningEffort === 'production' ? undefined : reasoningEffort,
    abortSignal: deadlineSignal,
    onPreparedStep: (trace) => traces.push(trace), onTurnDiagnostics: (value) => { diagnostics = value; },
    onError: (error) => errors.push(error instanceof Error ? error.name : 'UnknownError'),
  });
  const result = await agent.stream({ prompt: fixture.currentMessage, abortSignal: deadlineSignal });
  let reply = '';
  const reader = result.stream.getReader();
  const cancelOnDeadline = () => { void reader.cancel(deadlineSignal.reason).catch(() => undefined); };
  deadlineSignal.addEventListener('abort', cancelOnDeadline, { once: true });
  if (deadlineSignal.aborted) cancelOnDeadline();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === 'text-delta') reply += value.text;
    }
    deadlineSignal.throwIfAborted();
  } finally {
    deadlineSignal.removeEventListener('abort', cancelOnDeadline);
    reader.releaseLock();
  }
  let finalMap = (await storage.loadCareerMap(turn.userId)).map;

  const report = {
    runId, label: fixture.label, sourceDigest: digest(sourceText), sourceSchemaVersion, mapMigrated: sourceSchemaVersion !== fixture.initialMap.schemaVersion, model: NAMI_AGENT_MODEL,
    reasoningEffort, effortByModule, modelCalls, replayThroughGenerationMs: performance.now() - replayStarted, baseVersion: BASE_INSTRUCTIONS_VERSION, baseDigest: digest(baseInstructions),
    modules: Object.fromEntries(loader.registeredKeys.map((key) => { const module = loader.load({ module: key }); return [key, { version: module.contentVersion, digest: module.contentDigest }]; })),
    provenance: fixture.provenance, traces, diagnostics, errors,
    historicalReply: fixture.historicalReply, reply, providerVisibleReply: result.providerVisibleText(),
    operations: storage.operations, initialRevision: fixture.initialMap.revision, finalRevision: finalMap.revision,
    sourceFileUnchanged: digest(await readFile(casePath, 'utf8')) === digest(sourceText),
    sourceConversationWritePossible: false, databaseConnected: false,
    instructionsFrozen: true, prefixPreserved, canonicalPurposePathsOffer: result.canonicalPurposePathsOffer(),
  };
  await writeFile(path.join(outputPath, 'result.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  await writeFile(path.join(outputPath, 'final-map.json'), JSON.stringify(finalMap, null, 2), { mode: 0o600 });
  await writeFile(path.join(outputPath, 'provider-requests.json'), JSON.stringify(providerRequests, null, 2), { mode: 0o600 });
  await writeFile(path.join(outputPath, 'comparison.md'), `# ${fixture.label}\n\nHistorical reply:\n\n${fixture.historicalReply}\n\nCandidate (${NAMI_AGENT_MODEL}, ${reasoningEffort} effort; frozen current instructions):\n\n${reply}\n`, { mode: 0o600 });
  if (options.captureContinuation) {
    deadlineSignal.throwIfAborted();
    // Bind the completed branch through the same provider projection used by the app.
    // Retrieval is allowed only for the Conversation created by this guarded transport.
    const providerItems = await listConversationItems({ client: new OpenAIConversationClient(env.OPENAI_API_KEY, guardedFetch), conversationId: conversation.id }) as Record<string, unknown>[];
    deadlineSignal.throwIfAborted();
    const markers = await result.internalContextMarkers;
    const binding = resolveInternalContextItemIds(providerItems, markers);
    const generatedItems = providerItems.slice(seededItems.length);
    const projection = binding.complete ? resolveDisplayProjection(generatedItems, fixture.currentMessage, result.providerVisibleText(), new Set(binding.itemIds)) : undefined;
    await writeFile(path.join(outputPath, 'provider-items.json'), JSON.stringify(providerItems, null, 2), { mode: 0o600 });
    await writeFile(path.join(outputPath, 'terminal-history-diagnostic.json'), JSON.stringify({
      bindingComplete: binding.complete, projectionAvailable: Boolean(projection),
      replyLength: reply.length, providerVisibleReplyLength: result.providerVisibleText().length,
      errorClasses: errors,
    }, null, 2), { mode: 0o600 });
    if (!projection || errors.length || !reply.trim()) throw new Error('Replay terminal history unavailable; cannot continue.');
    const now = new Date();
    await storage.completeTurn(result.providerVisibleText(), now.toISOString());
    finalMap = (await storage.loadCareerMap(turn.userId)).map;
    report.finalRevision = finalMap.revision;
    await writeFile(path.join(outputPath, 'final-map.json'), JSON.stringify(finalMap, null, 2), { mode: 0o600 });
    await writeFile(path.join(outputPath, 'result.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    const completedTurn: AgentTurnRecord = { ...turn, status: 'completed', createdAt: now, updatedAt: now, terminalAt: now,
      terminalResult: { kind: 'completed', refetch: true, revision: finalMap.revision, displayProjection: projection,
        internalContextItemIds: binding.itemIds, ...(result.canonicalPurposePathsOffer() ? { canonicalPurposePathsOffer: true } : {}) } };
    const continuation = { initialMap: finalMap, priorTurns: [...fixture.priorTurns, completedTurn], priorItems: providerItems };
    await writeFile(path.join(outputPath, 'continuation.json'), JSON.stringify(continuation, null, 2), { mode: 0o600 });
  }
  deadlineSignal.throwIfAborted();
  if (errors.length || !reply.trim()) throw new Error('Replay failed; private artifacts preserved.');
  return { outputPath, runId, initialRevision: fixture.initialMap.revision, finalRevision: finalMap.revision, steps: traces.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [casePath, instructionsPath, outputPath, envPath] = process.argv.slice(2);
  if (!casePath || !instructionsPath || !outputPath || !envPath) {
    console.error('Usage: node --import tsx scripts/replay-nami.ts CASE_JSON INSTRUCTIONS_DIR NEW_OUTPUT_DIR ENV_FILE');
    process.exitCode = 1;
  } else {
    runReplay({ casePath, instructionsPath, outputPath, envPath }).then((result) => console.log(JSON.stringify(result))).catch((error) => {
      console.error(JSON.stringify({ status: 'failed', errorClass: error instanceof Error ? error.name : 'UnknownError', message: 'Replay failed. Inspect the private output artifacts.' }));
      process.exitCode = 1;
    });
  }
}

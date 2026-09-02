import { createHash, randomUUID } from 'node:crypto';
import express, { Router, type Request, type RequestHandler } from 'express';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import {
  experimental_transcribe as transcribe,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  toUIMessageStream,
  type LanguageModel,
  type ToolSet,
  type UIMessageChunk,
} from 'ai';
import { z } from 'zod';
import { env, parseAgentEnabled } from '../env.js';
import { getProtectedIdentity, requireAuth } from '../auth-middleware.js';
import {
  MethodOwnerBusyError,
  nextMethodTurnSequence,
  storage as defaultStorage,
  type AgentTurnRecord,
  type BeginAgentTurnResult,
  type IStorage,
} from '../storage.js';
import {
  REVELIO_AGENT_MODEL,
  REVELIO_AGENT_PROVIDER,
  createMethodAgent,
  type MethodAgentTurnStreamResult,
} from '../ai/agent.js';
import { createMethodModuleLoader, type MethodModuleLoader } from '../ai/method/loader.js';
import {
  OpenAIConversationClient,
  createConversationHistoryCursorCodec,
  createDisplayRecovery,
  listConversationItems,
  listRecentConversationItems,
  loadConversationHistory,
  resolveDisplayProjection,
  resolveInternalContextItemIds,
  type ConversationItemsClient,
} from '../ai/history.js';
import { createNativeSearchEvidenceLedger } from '../ai/research.js';
import {
  executeWorkspaceTool,
  OPERATION_TO_TOOL_NAME,
  workspaceOperationRequestSchema,
  type MethodOperationEnvelope,
} from '../ai/tools.js';
import { opaqueClientMessageIdSchema } from '../../shared/career-map/index.js';
import {
  claimLinkedCitationStreamPartSchema,
  operationStatusStreamPartSchema,
} from '../../shared/streaming-schemas.js';
import { methodRouteLabel } from './agent-logging.js';

const agentRequestSchema = z.object({
  id: opaqueClientMessageIdSchema,
  message: z.string().trim().min(1).max(12_000),
}).strict();

const audioLanguageSchema = z.enum(['en', 'es']);
const METHOD_AUDIO_LIMIT = '2mb';
const GUARDED_METHOD_PATHS = ['/', '/workspace/operations'];
const PROVISIONING_HANDOFF_WAIT_MS = 12_000;
const PROVISIONING_HANDOFF_INITIAL_DELAY_MS = 25;
const PROVISIONING_HANDOFF_MAX_DELAY_MS = 1_000;

type ProvisioningHandoffOutcome = 'lease-settled' | 'mapping-bound' | 'timed-out';
type ProvisioningHandoffTiming = {
  now: () => number;
  delay: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

export interface AgentRouterOptions {
  storage?: IStorage;
  requireAuth?: RequestHandler;
  loader?: MethodModuleLoader | Promise<MethodModuleLoader>;
  agentEnabled?: boolean | (() => boolean);
  model?: LanguageModel;
  nativeWebSearchTool?: ToolSet[string];
  conversationClient?: ConversationItemsClient;
  transcribeAudio?: (input: { audio: Buffer; language: 'en' | 'es'; abortSignal?: AbortSignal }) => Promise<string>;
  now?: () => Date;
  id?: () => string;
  operationalLog?: (entry: Record<string, unknown>) => void;
  conversationCleanupSignal?: (entry: Record<string, unknown>) => void;
  provisioningHandoffTiming?: ProvisioningHandoffTiming;
  /** Deterministic seam for provider-item binding tests. Production uses a random marker. */
  internalContextMarker?: (responseIndex: number) => string;
  /**
   * Exact browser origin allowed to call custom Method POSTs. Production uses
   * BETTER_AUTH_URL; tests and local harnesses may inject their exact origin.
   */
  methodRequestOrigin?: string;
}

function configuredMethodOrigin(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function requestHasExactOrigin(request: Request, expectedOrigin: string | undefined): boolean {
  if (!expectedOrigin) return false;
  const value = request.get('origin');
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return value === parsed.origin && parsed.origin === expectedOrigin;
  } catch {
    return false;
  }
}

function guardCustomMethodPost(expectedOrigin: string | undefined): RequestHandler {
  return (request, response, next) => {
    if (request.method === 'OPTIONS') {
      response.status(405).json({ error: 'Method preflight is not supported' });
      return;
    }
    if (!requestHasExactOrigin(request, expectedOrigin)
      || request.get('x-revelio-request') !== '1') {
      response.status(403).json({ error: 'Invalid Method request metadata' });
      return;
    }
    if (!request.is('application/json')) {
      response.status(415).json({ error: 'Method requests require application/json' });
      return;
    }
    next();
  };
}

function gateTerminalUIStream(
  stream: ReadableStream<UIMessageChunk>,
  beforeTerminal: (
    terminalType: 'finish' | 'error' | 'abort',
  ) => Promise<UIMessageChunk | undefined>,
): ReadableStream<UIMessageChunk> {
  const terminal: UIMessageChunk[] = [];
  let terminalType: 'finish' | 'error' | 'abort' = 'finish';
  return stream.pipeThrough(new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === 'finish' || chunk.type === 'error' || chunk.type === 'abort') {
        terminal.push(chunk);
        if (chunk.type === 'error' || chunk.type === 'abort') terminalType = chunk.type;
        return;
      }
      controller.enqueue(chunk);
    },
    async flush(controller) {
      const replacement = await beforeTerminal(terminalType);
      if (replacement) {
        controller.enqueue(replacement);
        return;
      }
      if (terminalType === 'finish') {
        for (const chunk of terminal) controller.enqueue(chunk);
      } else {
        const matchingTerminal = terminal.find((chunk) => chunk.type === terminalType);
        if (matchingTerminal) controller.enqueue(matchingTerminal);
      }
    },
  }));
}

function safeErrorClass(error: unknown): string {
  const candidate = error instanceof Error ? error.name : 'Error';
  const allowlisted = new Set([
    'AbortError',
    'APICallError',
    'CareerMapBriefingError',
    'CareerMapRepairRequiredError',
    'ConversationHistoryProviderError',
    'Error',
    'InternalContextBindingError',
    'MethodErasurePendingError',
    'MethodOwnerBusyError',
    'NoOutputGeneratedError',
    'RetryError',
    'TimeoutError',
    'TurnLeaseLostError',
    'ZodError',
  ]);
  return allowlisted.has(candidate) ? candidate : 'ExternalProviderError';
}

function requestFingerprint(clientMessageId: string, message: string): string {
  return createHash('sha256').update(`${clientMessageId}\u0000${message}`).digest('hex');
}

function opaqueOperationId(operationId: string): string {
  return `op_${createHash('sha256').update(operationId).digest('hex').slice(0, 16)}`;
}

function canonicalRequestValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalRequestValue).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalRequestValue(record[key])}`
  )).join(',')}}`;
}

function enabled(value: AgentRouterOptions['agentEnabled']): boolean {
  if (typeof value === 'function') return value();
  if (typeof value === 'boolean') return value;
  return parseAgentEnabled(process.env.AGENT_ENABLED);
}

function attachAbort(request: Request, response: express.Response): {
  signal: AbortSignal;
  detach: () => void;
} {
  const controller = new AbortController();
  const abort = () => {
    if (!response.writableEnded && !controller.signal.aborted) {
      controller.abort(new DOMException('Request closed.', 'AbortError'));
    }
  };
  request.once('aborted', abort);
  response.once('close', abort);
  return {
    signal: controller.signal,
    detach: () => {
      request.off('aborted', abort);
      response.off('close', abort);
    },
  };
}

function statusForEnvelope(envelope: MethodOperationEnvelope): number {
  if (envelope.status === 'conflict') return 409;
  if (envelope.status === 'rejected') return 422;
  return 200;
}

const storedOperationEnvelopeSchema = z.object({
  status: z.enum(['committed', 'idempotent-replay', 'conflict', 'rejected']),
  operation: z.enum(Object.keys(OPERATION_TO_TOOL_NAME) as [
    keyof typeof OPERATION_TO_TOOL_NAME,
    ...(keyof typeof OPERATION_TO_TOOL_NAME)[],
  ]),
  authoritativeRevision: z.number().int().nonnegative(),
  derivedModule: z.enum(['form-foundation', 'create-purpose-paths', 'design-path-project']),
  pendingDecision: z.object({
    kind: z.enum(['why-confirmation', 'path-selection', 'path-revision-confirmation', 'first-project-confirmation']),
    targetId: z.string().min(1).max(160),
    targetRevision: z.number().int().positive(),
  }).strict().nullable(),
  errorClass: z.string().min(1).max(160).optional(),
  retryable: z.boolean().optional(),
}).strict();

function safeTerminalResult(turn: AgentTurnRecord): Record<string, unknown> {
  const terminal = turn.terminalResult;
  if (!terminal || typeof terminal !== 'object') return { kind: turn.status, refetch: true };
  return {
    kind: turn.status,
    refetch: terminal.refetch === true,
    ...(typeof terminal.revision === 'number' ? { revision: terminal.revision } : {}),
    ...(typeof terminal.errorClass === 'string' ? { errorClass: terminal.errorClass } : {}),
    ...(typeof terminal.stopped === 'boolean' ? { stopped: terminal.stopped } : {}),
    ...(typeof terminal.operationCommitted === 'boolean' ? { operationCommitted: terminal.operationCommitted } : {}),
    ...(terminal.displayProjection ? { displayReady: true } : {}),
    ...(terminal.displayRecovery && !terminal.displayProjection ? { historyProjection: 'pending' } : {}),
  };
}

function turnResponse(result: BeginAgentTurnResult, response: express.Response): boolean {
  switch (result.status) {
    case 'started': return false;
    case 'attached':
      response.status(409).json({ status: 'in-flight', turnId: result.turn.turnId, retryable: true });
      return true;
    case 'terminal':
      if (result.turn.status === 'completed'
        && result.turn.terminalResult?.kind === 'workspace-result'
      ) {
        const parsedEnvelope = storedOperationEnvelopeSchema.safeParse(result.turn.terminalResult.operationEnvelope);
        if (!parsedEnvelope.success) {
          response.status(409).json({ status: 'failed-replay', terminal: 'failed', retryable: false, result: { kind: 'failed', refetch: true } });
          return true;
        }
        response.status(statusForEnvelope(parsedEnvelope.data)).json({
          ...parsedEnvelope.data,
          turnStatus: 'completed', replay: true,
        });
        return true;
      }
      response.status(result.turn.status === 'completed' ? 200 : 409).json({
        status: `${result.turn.status}-replay`, terminal: result.turn.status,
        result: safeTerminalResult(result.turn),
        ...(result.turn.status === 'completed' ? {} : { retryable: false }),
      });
      return true;
    case 'conflict':
      response.status(409).json({ status: 'conflict', retryable: true, retryAfter: result.retryAfter.toISOString() });
      return true;
    case 'message-id-reused':
      response.status(409).json({ status: 'message-id-reused', retryable: false });
      return true;
    case 'map-required':
      response.status(409).json({ status: 'map-required', retryable: true });
      return true;
    case 'erasure-pending':
      response.status(409).json({ status: 'erasure-pending', retryable: false });
      return true;
    case 'repair-required':
      response.status(409).json({ status: 'repair-required', retryable: false });
      return true;
  }
}

function throwIfRouteAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Request aborted.', 'AbortError');
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const settle = (callback: () => void) => {
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => settle(() => reject(signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}

async function waitForProvisioningHandoff(input: {
  storage: Pick<IStorage, 'getConversationMapping' | 'getTurnLease'>;
  userId: string;
  activeTurnId: string;
  abortSignal: AbortSignal;
  timing?: ProvisioningHandoffTiming;
}): Promise<ProvisioningHandoffOutcome> {
  const now = input.timing?.now ?? Date.now;
  const delay = input.timing?.delay ?? abortableDelay;
  const deadline = now() + PROVISIONING_HANDOFF_WAIT_MS;
  let delayMs = PROVISIONING_HANDOFF_INITIAL_DELAY_MS;
  while (true) {
    throwIfRouteAborted(input.abortSignal);
    if (await input.storage.getConversationMapping(input.userId)) {
      return 'mapping-bound';
    }
    const lease = await input.storage.getTurnLease(input.userId);
    const observedAt = now();
    if (!lease || lease.turnId !== input.activeTurnId || lease.expiresAt.getTime() <= observedAt) {
      return 'lease-settled';
    }
    const remainingMs = deadline - observedAt;
    if (remainingMs <= 0) return 'timed-out';
    await delay(Math.min(delayMs, remainingMs), input.abortSignal);
    delayMs = Math.min(delayMs * 2, PROVISIONING_HANDOFF_MAX_DELAY_MS);
  }
}

async function defaultTranscribeAudio(input: {
  audio: Buffer;
  language: 'en' | 'es';
  abortSignal?: AbortSignal;
}): Promise<string> {
  if (!env.GROQ_API_KEY) throw new Error('TranscriptionUnavailable');
  const groq = createGroq({ apiKey: env.GROQ_API_KEY });
  const result = await transcribe({
    model: groq.transcription('whisper-large-v3-turbo'),
    audio: input.audio,
    abortSignal: input.abortSignal,
    providerOptions: { groq: { language: input.language } },
  });
  return result.text;
}

export function createAgentRouter(options: AgentRouterOptions = {}): Router {
  const router = Router();
  const storage = options.storage ?? defaultStorage;
  const now = options.now ?? (() => new Date());
  const nextId = options.id ?? randomUUID;
  const loaderPromise = Promise.resolve(options.loader ?? createMethodModuleLoader());
  const log = options.operationalLog ?? ((entry) => console.log(JSON.stringify(entry)));
  const methodRequestOrigin = configuredMethodOrigin(
    options.methodRequestOrigin ?? env.BETTER_AUTH_URL,
  );
  const historyCursorCodec = createConversationHistoryCursorCodec(
    createHash('sha256').update(env.BETTER_AUTH_SECRET).digest('hex'),
  );
  let defaultOpenAI: ReturnType<typeof createOpenAI> | undefined;
  let defaultConversationClient: OpenAIConversationClient | undefined;

  const openAI = () => {
    if (!env.OPENAI_API_KEY) throw new Error('AgentProviderUnavailable');
    defaultOpenAI ??= createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return defaultOpenAI;
  };
  const model = () => options.model ?? openAI().responses(REVELIO_AGENT_MODEL);
  const conversationClient = () => options.conversationClient
    ?? (defaultConversationClient ??= new OpenAIConversationClient(env.OPENAI_API_KEY));
  const nativeWebSearchTool = () => options.nativeWebSearchTool
    ?? createOpenAI({ apiKey: env.OPENAI_API_KEY }).tools.webSearch({ searchContextSize: 'low' });
  const reconcileConversationProvisioning = async (userId: string) => {
    if (!enabled(options.agentEnabled)) return;
    while (true) {
      const claim = await storage.claimConversationProvisioningCleanup(userId, nextId());
      if (!claim) return;
      try {
        if (!conversationClient().deleteConversation) throw new Error('ConversationCleanupUnavailable');
        await conversationClient().deleteConversation!(claim.conversationId, AbortSignal.timeout(5_000));
        await storage.completeConversationProvisioningCleanup(claim);
      } catch {
        // The server-only marker remains durable for a later reconciliation or
        // full Method erasure. Provider ids never enter logs or client payloads.
        await storage.releaseConversationProvisioningCleanup(claim).catch(() => undefined);
        return;
      }
    }
  };

  // Reject browser-forgeable custom Method writes before authentication,
  // request logging, lease acquisition, map reads, or provider work. Audio has
  // its own bounded media contract and intentionally bypasses this JSON guard.
  const methodPostGuard = guardCustomMethodPost(methodRequestOrigin);
  // Register against the same Express paths as the eventual handlers so
  // default case-insensitive and trailing-slash route matching cannot bypass
  // the guard.
  router.post(GUARDED_METHOD_PATHS, methodPostGuard);
  router.options(GUARDED_METHOD_PATHS, methodPostGuard);
  router.use((request, response, next) => {
    const startedAt = Date.now();
    const requestId = nextId();
    response.setHeader('x-request-id', requestId);
    response.setHeader('cache-control', 'no-store');
    response.on('finish', () => {
      const metadata = response.locals.methodLog as Record<string, unknown> | undefined;
      log({
        type: 'method_request',
        requestId,
        route: methodRouteLabel(request.method, `${request.baseUrl}${request.path}`),
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
        ...(metadata ?? {}),
      });
    });
    next();
  });
  router.use(options.requireAuth ?? requireAuth);

  router.get('/history', async (request, response) => {
    const abort = attachAbort(request, response);
    try {
      throwIfRouteAborted(abort.signal);
      const cursor = z.string().min(1).max(4_096).optional().safeParse(request.query.cursor);
      if (!cursor.success) {
        response.locals.methodLog = { errorClass: 'ValidationError' };
        response.status(400).json({ error: 'Invalid history cursor', errorClass: 'ValidationError' });
        return;
      }
      const identity = getProtectedIdentity(response);
      await reconcileConversationProvisioning(identity.userId);
      const historyStorage = enabled(options.agentEnabled)
        ? storage
        : {
            getConversationMapping: (userId: string) => storage.getConversationMapping(userId),
            listAgentTurns: (userId: string) => storage.listAgentTurns(userId),
          };
      const history = await loadConversationHistory({
        storage: historyStorage,
        client: conversationClient(),
        userId: identity.userId,
        cursor: cursor.data,
        cursorCodec: historyCursorCodec,
        abortSignal: abort.signal,
      });
      throwIfRouteAborted(abort.signal);
      response.locals.methodLog = { provider: REVELIO_AGENT_PROVIDER };
      response.json(history);
    } catch (error) {
      if (abort.signal.aborted) return;
      response.locals.methodLog = { provider: REVELIO_AGENT_PROVIDER, errorClass: safeErrorClass(error) };
      response.status(error instanceof MethodOwnerBusyError ? 409 : 502).json({
        error: 'History is temporarily unavailable',
        errorClass: safeErrorClass(error),
        ...(error instanceof MethodOwnerBusyError ? { retryable: true } : {}),
      });
    } finally {
      abort.detach();
    }
  });

  router.get('/workspace', async (_request, response) => {
    try {
      const identity = getProtectedIdentity(response);
      const result = await storage.loadCareerMap(identity.userId);
      if (result.status === 'not-found') {
        response.json({ status: 'empty', map: null });
        return;
      }
      if (result.status === 'ready') {
        response.locals.methodLog = { revision: result.map.revision };
        response.json({ status: 'ready', map: result.map });
        return;
      }
      response.locals.methodLog = { errorClass: result.status };
      response.status(409).json({ status: result.status });
    } catch (error) {
      response.locals.methodLog = { errorClass: safeErrorClass(error) };
      response.status(error instanceof MethodOwnerBusyError ? 409 : 500).json({
        error: 'Workspace is temporarily unavailable',
        errorClass: safeErrorClass(error),
        ...(error instanceof MethodOwnerBusyError ? { retryable: true } : {}),
      });
    }
  });

  router.post('/workspace/operations', async (request, response) => {
    if (!enabled(options.agentEnabled)) {
      response.locals.methodLog = { errorClass: 'AgentDisabledError' };
      response.status(503).json({ error: 'Agent writes are disabled', errorClass: 'AgentDisabledError' });
      return;
    }
    const parsed = workspaceOperationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.locals.methodLog = { errorClass: 'ValidationError' };
      response.status(400).json({ error: 'Invalid workspace operation', errorClass: 'ValidationError' });
      return;
    }
    const identity = getProtectedIdentity(response);
    const abort = attachAbort(request, response);
    if (request.destroyed || abort.signal.aborted) {
      abort.detach();
      return;
    }
    const turnId = nextId();
    const leaseId = nextId();
    const occurredAt = now().toISOString();
    let turn: AgentTurnRecord | undefined;
    let startingRevision: number | undefined;
    const cancelWithCanonicalRecovery = async () => {
      if (!turn) return undefined;
      const authoritative = await storage.loadCareerMap(identity.userId).catch(() => undefined);
      const revision = authoritative?.status === 'ready' ? authoritative.map.revision : undefined;
      return storage.cancelAgentTurn({
        userId: identity.userId,
        turnId: turn.turnId,
        leaseId: turn.leaseId,
        result: {
          kind: 'cancelled', stopped: true, refetch: true,
          ...(revision !== undefined ? {
            revision,
            operationCommitted: startingRevision !== undefined && revision > startingRevision,
          } : {}),
        },
      });
    };
    try {
      throwIfRouteAborted(abort.signal);
      const map = await storage.getOrCreateCareerMap(identity.userId);
      if (map.status !== 'ready') {
        response.status(409).json({ status: map.status });
        return;
      }
      throwIfRouteAborted(abort.signal);
      const begun = await storage.beginWorkspaceActionTurn({
        userId: identity.userId,
        clientMessageId: parsed.data.clientMessageId,
        requestFingerprint: requestFingerprint(parsed.data.clientMessageId, canonicalRequestValue({
          expectedRevision: parsed.data.expectedRevision,
          operation: parsed.data.operation,
        })),
        turnId,
        leaseId,
      });
      if (begun.status !== 'started') {
        turnResponse(begun, response);
        return;
      }
      turn = begun.turn;
      const leasedState = await storage.loadCareerMap(identity.userId);
      if (leasedState.status !== 'ready') throw new Error('CareerMapUnavailableAfterLease');
      startingRevision = leasedState.map.revision;
      const turnSequence = nextMethodTurnSequence(leasedState.map);
      const envelope = await executeWorkspaceTool({
        runtime: {
          storage,
          loader: await loaderPromise,
          userId: identity.userId,
          turn,
          timing: { turnSequence, occurredAt },
          abortSignal: abort.signal,
        },
        expectedRevision: parsed.data.expectedRevision,
        operationType: parsed.data.operation.type,
        operationId: parsed.data.operationId,
        rawInput: parsed.data.operation.input,
      });
      throwIfRouteAborted(abort.signal);
      const completed = await storage.completeAgentTurn({
        userId: identity.userId,
        turnId: turn.turnId,
        leaseId: turn.leaseId,
        result: { kind: 'workspace-result', refetch: true, operationEnvelope: envelope },
        abortSignal: abort.signal,
      });
      if (!completed || completed.status !== 'completed') {
        response.status(409).json({
          status: `${completed?.status ?? 'failed'}-replay`,
          terminal: completed?.status ?? 'failed',
          result: completed ? safeTerminalResult(completed) : { kind: 'failed', refetch: true },
          retryable: false,
        });
        return;
      }
      response.locals.methodLog = { operationId: opaqueOperationId(parsed.data.operationId), revision: envelope.authoritativeRevision, errorClass: envelope.errorClass };
      response.status(statusForEnvelope(envelope)).json(envelope);
    } catch (error) {
      if (turn) {
        if (abort.signal.aborted) {
          await cancelWithCanonicalRecovery().catch(() => undefined);
        } else {
          await storage.failAgentTurn({ userId: identity.userId, turnId: turn.turnId, leaseId: turn.leaseId, errorClass: safeErrorClass(error) }).catch(() => undefined);
        }
      }
      if (abort.signal.aborted) return;
      response.locals.methodLog = { operationId: opaqueOperationId(parsed.data.operationId), errorClass: safeErrorClass(error) };
      response.status(error instanceof MethodOwnerBusyError ? 409 : 500).json({
        error: 'Workspace operation failed',
        errorClass: safeErrorClass(error),
        ...(error instanceof MethodOwnerBusyError ? { retryable: true } : {}),
      });
    } finally {
      abort.detach();
      if (turn) await storage.releaseTurnLease(identity.userId, turn.turnId, turn.leaseId).catch(() => undefined);
    }
  });

  router.post('/audio/transcribe', express.raw({ type: 'audio/*', limit: METHOD_AUDIO_LIMIT }), async (request, response) => {
    if (!enabled(options.agentEnabled)) {
      response.locals.methodLog = { errorClass: 'AgentDisabledError' };
      response.status(503).json({ error: 'Agent audio is disabled', errorClass: 'AgentDisabledError' });
      return;
    }
    const contentType = request.headers['content-type'] ?? '';
    const language = audioLanguageSchema.safeParse(typeof request.query.language === 'string' ? request.query.language : 'en');
    if (!contentType.startsWith('audio/') || !Buffer.isBuffer(request.body) || request.body.length === 0 || !language.success) {
      response.locals.methodLog = { errorClass: 'ValidationError' };
      response.status(400).json({ error: 'Invalid bounded audio request', errorClass: 'ValidationError' });
      return;
    }
    const abort = attachAbort(request, response);
    try {
      throwIfRouteAborted(abort.signal);
      const text = await (options.transcribeAudio ?? defaultTranscribeAudio)({
        audio: request.body,
        language: language.data,
        abortSignal: abort.signal,
      });
      if (abort.signal.aborted) return;
      response.locals.methodLog = { provider: 'groq-whisper' };
      response.json({ text });
    } catch (error) {
      if (abort.signal.aborted) return;
      response.locals.methodLog = { provider: 'groq-whisper', errorClass: safeErrorClass(error) };
      response.status(502).json({ error: 'Transcription failed', errorClass: safeErrorClass(error) });
    } finally {
      abort.detach();
    }
  });

  router.post('/', async (request, response) => {
    if (!enabled(options.agentEnabled)) {
      response.locals.methodLog = { errorClass: 'AgentDisabledError' };
      response.status(503).json({ error: 'Agent is disabled', errorClass: 'AgentDisabledError' });
      return;
    }
    const parsed = agentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.locals.methodLog = { errorClass: 'ValidationError' };
      response.status(400).json({ error: 'Invalid agent request', errorClass: 'ValidationError' });
      return;
    }
    const identity = getProtectedIdentity(response);
    const abort = attachAbort(request, response);
    if (request.destroyed || abort.signal.aborted) {
      abort.detach();
      return;
    }
    let turn: AgentTurnRecord | undefined;
    let leaseFinalized = false;
    let startingRevision: number | undefined;
    let safeAssistantText = '';
    let conversationId: string | undefined;
    let methodResult: MethodAgentTurnStreamResult | undefined;
    let operationSaved = false;
    let latestSavedRevision: number | undefined;
    let terminalProviderStatePromise: Promise<{
      items: unknown[];
      internalContextItemIds: string[];
      markers: readonly string[];
      complete: boolean;
    }> | undefined;
    const terminalProviderState = (timeoutMs = 5_000, requestSignal?: AbortSignal) => {
      terminalProviderStatePromise ??= (async () => {
        if (!methodResult || !conversationId) {
          return { items: [], internalContextItemIds: [], markers: [], complete: false };
        }
        const markerTimeoutSignal = AbortSignal.timeout(timeoutMs);
        const markerSignal = requestSignal
          ? AbortSignal.any([requestSignal, markerTimeoutSignal])
          : markerTimeoutSignal;
        const markers = await awaitWithAbort(methodResult.internalContextMarkers, markerSignal)
          .catch(() => methodResult?.observedInternalContextMarkers() ?? []);
        if (markers.length === 0) {
          return { items: [], internalContextItemIds: [], markers, complete: false };
        }
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const terminalSignal = requestSignal
          ? AbortSignal.any([requestSignal, timeoutSignal])
          : timeoutSignal;
        let latest = {
          items: [] as unknown[], internalContextItemIds: [] as string[], markers, complete: false,
        };
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const items = await awaitWithAbort(
            listRecentConversationItems({
              client: conversationClient(),
              conversationId,
              abortSignal: terminalSignal,
            }),
            terminalSignal,
          );
          const resolved = resolveInternalContextItemIds(items, markers);
          latest = {
            items,
            internalContextItemIds: resolved.itemIds,
            markers,
            complete: resolved.complete,
          };
          if (resolved.complete) return latest;
          if (attempt < 4) await abortableDelay(100, terminalSignal);
        }
        return latest;
      })().catch(() => ({
        items: [],
        internalContextItemIds: [],
        markers: methodResult?.observedInternalContextMarkers() ?? [],
        complete: false,
      }));
      return terminalProviderStatePromise;
    };
    const canonicalFailureResult = async (): Promise<Record<string, unknown>> => {
      const [authoritative, providerState] = await Promise.all([
        storage.loadCareerMap(identity.userId).catch(() => undefined),
        terminalProviderState(500),
      ]);
      const revision = authoritative?.status === 'ready'
        ? authoritative.map.revision
        : latestSavedRevision;
      const operationCommitted = operationSaved
        || latestSavedRevision !== undefined
        || (revision !== undefined && startingRevision !== undefined && revision > startingRevision);
      return {
        ...(revision !== undefined ? { revision } : {}),
        ...(operationCommitted ? { operationCommitted: true } : {}),
        ...(providerState.internalContextItemIds.length > 0
          ? { internalContextItemIds: providerState.internalContextItemIds }
          : {}),
        ...(!providerState.complete && providerState.markers.length > 0
          ? { internalContextMarkers: providerState.markers }
          : {}),
      };
    };
    const cancelWithCanonicalRecovery = async () => {
      if (!turn) return undefined;
      const [authoritative, providerState] = await Promise.all([
        storage.loadCareerMap(identity.userId).catch(() => undefined),
        terminalProviderState(500),
      ]);
      const revision = authoritative?.status === 'ready'
        ? authoritative.map.revision
        : latestSavedRevision;
      const operationCommitted = operationSaved
        || latestSavedRevision !== undefined
        || (revision !== undefined && startingRevision !== undefined && revision > startingRevision);
      return storage.cancelAgentTurn({
        userId: identity.userId,
        turnId: turn.turnId,
        leaseId: turn.leaseId,
        result: {
          kind: 'cancelled', stopped: true, refetch: true,
          displayRecovery: createDisplayRecovery(
            parsed.data.message,
            safeAssistantText,
            safeAssistantText.length > 0,
          ),
          ...(providerState.internalContextItemIds.length > 0
            ? { internalContextItemIds: providerState.internalContextItemIds }
            : {}),
          ...(!providerState.complete && providerState.markers.length > 0
            ? { internalContextMarkers: providerState.markers }
            : {}),
          ...(revision !== undefined ? { revision } : {}),
          ...(revision !== undefined || operationCommitted ? { operationCommitted } : {}),
        },
      });
    };
    try {
      throwIfRouteAborted(abort.signal);
      const map = await storage.getOrCreateCareerMap(identity.userId);
      if (map.status !== 'ready') {
        response.status(409).json({ status: map.status });
        return;
      }
      throwIfRouteAborted(abort.signal);
      const beginInput = {
        userId: identity.userId,
        clientMessageId: parsed.data.id,
        requestFingerprint: requestFingerprint(parsed.data.id, parsed.data.message),
        turnId: nextId(),
        leaseId: nextId(),
      };
      let begun = await storage.beginAgentTurn(beginInput);
      if (begun.status === 'conflict' && begun.waitReason === 'conversation-provisioning') {
        const handoff = await waitForProvisioningHandoff({
          storage,
          userId: identity.userId,
          activeTurnId: begun.activeTurnId,
          abortSignal: abort.signal,
          timing: options.provisioningHandoffTiming,
        });
        if (handoff !== 'timed-out') begun = await storage.beginAgentTurn(beginInput);
      }
      if (begun.status !== 'started') {
        turnResponse(begun, response);
        return;
      }
      turn = begun.turn;
      const leasedState = await storage.loadCareerMap(identity.userId);
      if (leasedState.status !== 'ready') throw new Error('CareerMapUnavailableAfterLease');
      startingRevision = leasedState.map.revision;
      const turnSequence = nextMethodTurnSequence(leasedState.map);
      throwIfRouteAborted(abort.signal);
      await reconcileConversationProvisioning(identity.userId);
      conversationId = await storage.getConversationMapping(identity.userId);
      if (!conversationId) {
        if (!conversationClient().createConversation) throw new Error('ConversationProvisioningUnavailable');
        throwIfRouteAborted(abort.signal);
        // A client disconnect must not discard a provider id created just
        // before the request signal fires. Complete this bounded call to an id,
        // persist its cleanup identity, then compensate if the request stopped.
        const provisioningSignal = AbortSignal.timeout(5_000);
        const createdConversationId = await conversationClient().createConversation!(provisioningSignal);
        const provisioningMarker = {
          userId: identity.userId,
          turnId: turn.turnId,
          leaseId: turn.leaseId,
          conversationId: createdConversationId,
        };
        try {
          await storage.recordConversationProvisioning(provisioningMarker);
        } catch (markerError) {
          let cleanupRequired = true;
          try {
            if (!conversationClient().deleteConversation) throw new Error('ConversationCleanupUnavailable');
            await conversationClient().deleteConversation!(createdConversationId, AbortSignal.timeout(5_000));
            cleanupRequired = false;
          } catch {
            // A transient marker failure or erasure race gets one independent
            // durable retry after failed provider compensation. Postgres can
            // attach this to the turn or the generation-fenced erasure marker.
            await storage.recordConversationProvisioning(provisioningMarker).catch(() => undefined);
          }
          options.conversationCleanupSignal?.({
            type: 'conversation_provisioning_compensated',
            conversationToken: `conv_${createHash('sha256').update(createdConversationId).digest('hex').slice(0, 16)}`,
            cleanupRequired,
            errorClass: safeErrorClass(markerError),
          });
          throw markerError;
        }
        if (abort.signal.aborted) {
          try {
            if (!conversationClient().deleteConversation) throw new Error('ConversationCleanupUnavailable');
            await conversationClient().deleteConversation!(createdConversationId, AbortSignal.timeout(5_000));
            await storage.resolveConversationProvisioning({
              userId: identity.userId,
              turnId: turn.turnId,
              conversationId: createdConversationId,
            });
          } catch {
            // The durable marker is retained. Once cancellation terminalizes
            // this turn, owner-locked reconciliation may safely claim it.
          }
          throwIfRouteAborted(abort.signal);
        }
        try {
          await storage.setConversationMapping(identity.userId, turn.leaseId, createdConversationId);
          conversationId = createdConversationId;
        } catch (bindingError) {
          // Binding errors are acknowledgement-ambiguous: the transaction may
          // have committed before the driver threw. Never delete here. Keep the
          // durable marker so owner-locked reconciliation can inspect mapping
          // and lease state after this turn terminalizes.
          options.conversationCleanupSignal?.({
            type: 'conversation_provisioning_compensated',
            conversationToken: `conv_${createHash('sha256').update(createdConversationId).digest('hex').slice(0, 16)}`,
            cleanupRequired: true,
            errorClass: safeErrorClass(bindingError),
          });
          throw bindingError;
        }
        // Mapping is the ownership authority. Marker resolution is cleanup
        // bookkeeping and must never compensate/delete an already-bound
        // Conversation; an unresolved marker is reconciled on a later read.
        await storage.resolveConversationProvisioning({
          userId: identity.userId,
          turnId: turn.turnId,
          conversationId: createdConversationId,
        }).catch(() => undefined);
        throwIfRouteAborted(abort.signal);
      }
      const evidence = createNativeSearchEvidenceLedger({
        storage,
        userId: identity.userId,
        turnId: turn.turnId,
        leaseId: turn.leaseId,
        now,
      });
      let streamError: unknown;
      const loader = await loaderPromise;
      if (!conversationId) throw new Error('ConversationProvisioningUnavailable');
      const activeConversationId = conversationId;
      response.locals.methodLog = { provider: REVELIO_AGENT_PROVIDER, turnId: turn.turnId };
      throwIfRouteAborted(abort.signal);
      const uiStream = createUIMessageStream({
        execute: async ({ writer }) => {
          const agent = createMethodAgent({
            model: model(),
            nativeWebSearchTool: nativeWebSearchTool(),
            storage,
            loader,
            userId: identity.userId,
            conversationId: activeConversationId,
            turn: turn!,
            turnSequence,
            occurredAt: now().toISOString(),
            evidence,
            currentMessage: parsed.data.message,
            abortSignal: abort.signal,
            internalContextMarker: (responseIndex) => options.internalContextMarker?.(responseIndex)
              ?? `ctx_${createHash('sha256').update([
                turn!.turnId,
                String(responseIndex),
                randomUUID(),
              ].join('\u0000')).digest('base64url').slice(0, 32)}`,
            onOperationStatus: async (event) => {
              if (event.phase === 'terminal' && event.status === 'saved') {
                operationSaved = true;
                if (event.authoritativeRevision !== undefined) {
                  latestSavedRevision = event.authoritativeRevision;
                }
              }
              const operationId = opaqueOperationId(event.operationId);
              writer.write(operationStatusStreamPartSchema.parse({
                type: 'data-operation-status',
                id: operationId,
                transient: true,
                data: {
                  version: 1,
                  turnId: turn!.turnId,
                  messageId: turn!.turnId,
                  operationId,
                  operation: event.operation,
                  status: event.phase === 'saving'
                    ? 'Saving'
                    : ({ saved: 'Saved', conflict: 'Conflict', rejected: 'Rejected', failed: 'Failed' } as const)[event.status],
                  sequence: event.phase === 'saving' ? 0 : 1,
                  authoritativeRevision: event.phase === 'saving'
                    ? null
                    : event.authoritativeRevision ?? null,
                  ...(event.phase === 'terminal' && event.errorClass
                    ? { errorClass: event.errorClass }
                    : {}),
                  ...(event.phase === 'terminal' && event.retryable ? { retryable: true } : {}),
                },
              }) as UIMessageChunk);
            },
            onError: (error) => {
              streamError = error;
              response.locals.methodLog = {
                ...response.locals.methodLog,
                errorClass: safeErrorClass(error),
              };
            },
          });
          methodResult = await agent.stream({
            prompt: parsed.data.message,
            abortSignal: abort.signal,
            onTextDelta: (text) => { safeAssistantText += text; },
            onCitation: (citation) => {
              writer.write(claimLinkedCitationStreamPartSchema.parse({
                type: 'data-claim-citation',
                id: citation.citationId,
                data: {
                  version: 1,
                  citationId: citation.citationId,
                  turnId: turn!.turnId,
                  messageId: turn!.turnId,
                  textHash: citation.textHash,
                  exactClaim: citation.exactClaim,
                  start: citation.start,
                  end: citation.end,
                  url: citation.url,
                  title: citation.title ?? null,
                  support: citation.support,
                },
              }) as UIMessageChunk);
            },
          });
          const display = toUIMessageStream({
            stream: methodResult.stream,
            sendReasoning: false,
            sendSources: true,
            onError: (error) => {
              streamError = error;
              response.locals.methodLog = { ...response.locals.methodLog, errorClass: safeErrorClass(error) };
              return 'The agent request failed.';
            },
          });
          const reader = display.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              writer.write(value);
            }
          } finally {
            reader.releaseLock();
          }
        },
        onError: (error) => {
          streamError = error;
          response.locals.methodLog = { ...response.locals.methodLog, errorClass: safeErrorClass(error) };
          return 'The agent request failed.';
        },
      });
      const terminalGatedStream = gateTerminalUIStream(uiStream, async (terminalType) => {
        let terminalFailure: unknown;
        try {
          if (streamError || terminalType === 'error') {
            terminalFailure = streamError ?? new Error('The provider stream failed.');
          } else if (abort.signal.aborted || terminalType === 'abort') {
            const cancelled = await cancelWithCanonicalRecovery();
            if (!cancelled || cancelled.status !== 'cancelled') {
              const cancellationError = new Error('The turn could not be durably cancelled.');
              cancellationError.name = 'TurnLeaseLostError';
              terminalFailure = cancellationError;
            }
          } else {
            const authoritative = await storage.loadCareerMap(identity.userId);
            const revision = authoritative.status === 'ready' ? authoritative.map.revision : undefined;
            if (revision !== undefined) response.locals.methodLog = { ...response.locals.methodLog, revision };
            const providerState = await terminalProviderState(5_000, abort.signal);
            if (!providerState.complete) {
              const bindingError = new Error('Internal context provider items were not durably bound.');
              bindingError.name = 'InternalContextBindingError';
              throw bindingError;
            }
            const displayProjection = providerState.complete
              ? resolveDisplayProjection(
                  providerState.items,
                  parsed.data.message,
                  safeAssistantText,
                  new Set(providerState.internalContextItemIds),
                )
              : undefined;
            if (abort.signal.aborted) {
              const cancelled = await cancelWithCanonicalRecovery();
              if (!cancelled || cancelled.status !== 'cancelled') {
                const cancellationError = new Error('The turn could not be durably cancelled.');
                cancellationError.name = 'TurnLeaseLostError';
                terminalFailure = cancellationError;
              }
            } else {
              const completed = await storage.completeAgentTurn({
                userId: identity.userId,
                turnId: turn!.turnId,
                leaseId: turn!.leaseId,
                result: {
                  kind: 'completed', refetch: true,
                  ...(revision !== undefined ? { revision } : {}),
                  ...(providerState.internalContextItemIds.length > 0
                    ? { internalContextItemIds: providerState.internalContextItemIds }
                    : {}),
                  ...(displayProjection
                    ? { displayProjection }
                    : { displayRecovery: createDisplayRecovery(parsed.data.message, safeAssistantText, false) }),
                },
                abortSignal: abort.signal,
              });
              if (!completed || completed.status !== 'completed') {
                const terminalError = new Error('The turn could not be durably completed.');
                terminalError.name = completed?.status === 'failed'
                  && typeof completed.terminalResult?.errorClass === 'string'
                  ? completed.terminalResult.errorClass
                  : 'TurnLeaseLostError';
                terminalFailure = terminalError;
              }
            }
          }
        } catch (error) {
          terminalFailure = error;
        }
        let terminalFailureClass: string | undefined;
        try {
          if (terminalFailure && (
            abort.signal.aborted
            || (terminalFailure instanceof Error && terminalFailure.name === 'AbortError')
          )) {
            const cancelled = await cancelWithCanonicalRecovery();
            if (cancelled?.status === 'cancelled') {
              terminalFailure = undefined;
            } else {
              const cancellationError = new Error('The turn could not be durably cancelled.');
              cancellationError.name = 'TurnLeaseLostError';
              terminalFailure = cancellationError;
            }
          }
          if (terminalFailure) {
            const errorClass = safeErrorClass(terminalFailure);
            terminalFailureClass = errorClass;
            response.locals.methodLog = { ...response.locals.methodLog, errorClass };
            const failed = await storage.failAgentTurn({
              userId: identity.userId,
              turnId: turn!.turnId,
              leaseId: turn!.leaseId,
              errorClass,
              result: await canonicalFailureResult(),
            });
            if (!failed || failed.status === 'pending') terminalFailureClass = 'TurnLeaseLostError';
          }
        } finally {
          await storage.releaseTurnLease(identity.userId, turn!.turnId, turn!.leaseId).catch(() => false);
          leaseFinalized = true;
        }
        return terminalFailureClass
          ? { type: 'error', errorText: 'The agent request failed.' }
          : undefined;
      });
      await pipeUIMessageStreamToResponse({
        response,
        stream: terminalGatedStream,
      });
    } catch (error) {
      if (turn && !leaseFinalized) {
        if (abort.signal.aborted) {
          await cancelWithCanonicalRecovery().catch(() => undefined);
        } else {
          await storage.failAgentTurn({
            userId: identity.userId,
            turnId: turn.turnId,
            leaseId: turn.leaseId,
            errorClass: safeErrorClass(error),
            result: await canonicalFailureResult(),
          }).catch(() => undefined);
        }
      }
      response.locals.methodLog = { ...response.locals.methodLog, provider: REVELIO_AGENT_PROVIDER, errorClass: safeErrorClass(error) };
      if (!response.headersSent && !abort.signal.aborted) {
        response.status(error instanceof MethodOwnerBusyError ? 409 : 502).json({
          error: 'Agent request failed',
          errorClass: safeErrorClass(error),
          ...(error instanceof MethodOwnerBusyError ? { retryable: true } : {}),
        });
      } else if (!response.writableEnded) {
        response.end();
      }
    } finally {
      abort.detach();
      if (turn && !leaseFinalized) {
        await storage.releaseTurnLease(identity.userId, turn.turnId, turn.leaseId).catch(() => undefined);
      }
    }
  });

  return router;
}

export const agentRouter = createAgentRouter();

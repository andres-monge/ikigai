import { createHash, randomUUID } from 'node:crypto';
import express, { Router, type Request, type RequestHandler } from 'express';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import {
  experimental_transcribe as transcribe,
  pipeUIMessageStreamToResponse,
  toUIMessageStream,
  type LanguageModel,
} from 'ai';
import { z } from 'zod';
import { env, parseAgentEnabled } from '../env.js';
import { getProtectedIdentity, requireAuth } from '../auth-middleware.js';
import {
  MethodOwnerBusyError,
  storage as defaultStorage,
  type AgentTurnRecord,
  type BeginAgentTurnResult,
  type IStorage,
} from '../storage.js';
import {
  REVELIO_AGENT_MODEL,
  REVELIO_AGENT_PROVIDER,
  classifyMethodTurn,
  createMethodAgent,
  projectMethodStreamForDisplay,
  type MethodTurnRoute,
} from '../ai/agent.js';
import { createMethodModuleLoader, type MethodModuleLoader } from '../ai/method/loader.js';
import {
  OpenAIConversationClient,
  createDisplayRecovery,
  listConversationItems,
  loadConversationHistory,
  resolveDisplayProjection,
  type ConversationItemsClient,
} from '../ai/history.js';
import {
  ResearchSession,
  createOpenAIIsolatedResearchProvider,
  type IsolatedResearchProvider,
} from '../ai/research.js';
import {
  executeWorkspaceTool,
  OPERATION_TO_TOOL_NAME,
  workspaceOperationRequestSchema,
  type MethodOperationEnvelope,
} from '../ai/tools.js';

const agentRequestSchema = z.object({
  id: z.string().min(1).max(160),
  message: z.string().trim().min(1).max(12_000),
}).strict();

const audioLanguageSchema = z.enum(['en', 'es']);
const METHOD_AUDIO_LIMIT = '2mb';

export interface AgentRouterOptions {
  storage?: IStorage;
  requireAuth?: RequestHandler;
  loader?: MethodModuleLoader | Promise<MethodModuleLoader>;
  agentEnabled?: boolean | (() => boolean);
  model?: LanguageModel;
  conversationClient?: ConversationItemsClient;
  researchProvider?: IsolatedResearchProvider;
  transcribeAudio?: (input: { audio: Buffer; language: 'en' | 'es'; abortSignal?: AbortSignal }) => Promise<string>;
  now?: () => Date;
  id?: () => string;
  operationalLog?: (entry: Record<string, unknown>) => void;
  conversationCleanupSignal?: (entry: Record<string, unknown>) => void;
  classifyTurn?: (input: {
    model: LanguageModel;
    message: string;
    abortSignal?: AbortSignal;
  }) => Promise<MethodTurnRoute>;
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

async function defaultTranscribeAudio(input: { audio: Buffer; language: 'en' | 'es' }): Promise<string> {
  if (!env.GROQ_API_KEY) throw new Error('TranscriptionUnavailable');
  const groq = createGroq({ apiKey: env.GROQ_API_KEY });
  const result = await transcribe({
    model: groq.transcription('whisper-large-v3-turbo'),
    audio: input.audio,
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
  const researchProvider = () => options.researchProvider
    ?? createOpenAIIsolatedResearchProvider(model(), openAI().tools.webSearch({ searchContextSize: 'low' }));
  const reconcileConversationProvisioning = async (userId: string) => {
    if (!enabled(options.agentEnabled)) return;
    const pending = await storage.listPendingConversationProvisioning(userId);
    const mappedConversationId = await storage.getConversationMapping(userId);
    for (const marker of pending) {
      try {
        if (mappedConversationId !== marker.conversationId) {
          if (!conversationClient().deleteConversation) return;
          await conversationClient().deleteConversation!(marker.conversationId, AbortSignal.timeout(5_000));
        }
        await storage.resolveConversationProvisioning(marker);
      } catch {
        // The server-only marker remains durable for a later reconciliation or
        // full Method erasure. Provider ids never enter logs or client payloads.
      }
    }
  };

  router.use((request, response, next) => {
    const startedAt = Date.now();
    const requestId = nextId();
    response.setHeader('x-request-id', requestId);
    response.setHeader('cache-control', 'no-store');
    response.on('finish', () => {
      const metadata = response.locals.methodLog as Record<string, unknown> | undefined;
      const identity = response.locals.auth as { userId?: string } | undefined;
      log({
        type: 'method_request',
        requestId,
        route: request.path,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
        ...(identity?.userId ? { userId: identity.userId } : {}),
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
      startingRevision = map.map.revision;
      throwIfRouteAborted(abort.signal);
      const begun = await storage.beginWorkspaceActionTurn({
        userId: identity.userId,
        clientMessageId: parsed.data.clientMessageId,
        requestFingerprint: requestFingerprint(parsed.data.clientMessageId, canonicalRequestValue(parsed.data.operation)),
        turnId,
        leaseId,
      });
      if (begun.status !== 'started') {
        turnResponse(begun, response);
        return;
      }
      turn = begun.turn;
      const envelope = await executeWorkspaceTool({
        runtime: {
          storage,
          loader: await loaderPromise,
          userId: identity.userId,
          turn,
          timing: { turnSequence: now().getTime(), occurredAt },
          abortSignal: abort.signal,
        },
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
    let startingRevision: number | undefined;
    let safeAssistantText = '';
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
          displayRecovery: createDisplayRecovery(
            parsed.data.message,
            safeAssistantText,
            safeAssistantText.length > 0,
          ),
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
      startingRevision = map.map.revision;
      throwIfRouteAborted(abort.signal);
      const begun = await storage.beginAgentTurn({
        userId: identity.userId,
        clientMessageId: parsed.data.id,
        requestFingerprint: requestFingerprint(parsed.data.id, parsed.data.message),
        turnId: nextId(),
        leaseId: nextId(),
      });
      if (begun.status !== 'started') {
        turnResponse(begun, response);
        return;
      }
      turn = begun.turn;
      throwIfRouteAborted(abort.signal);
      await reconcileConversationProvisioning(identity.userId);
      let conversationId = await storage.getConversationMapping(identity.userId);
      if (!conversationId) {
        if (!conversationClient().createConversation) throw new Error('ConversationProvisioningUnavailable');
        throwIfRouteAborted(abort.signal);
        const provisioningSignal = AbortSignal.any([abort.signal, AbortSignal.timeout(5_000)]);
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
        try {
          await storage.setConversationMapping(identity.userId, turn.leaseId, createdConversationId);
          conversationId = createdConversationId;
        } catch (bindingError) {
          let cleanupRequired = true;
          try {
            if (!conversationClient().deleteConversation) throw new Error('ConversationCleanupUnavailable');
            await conversationClient().deleteConversation!(createdConversationId, AbortSignal.timeout(5_000));
            await storage.resolveConversationProvisioning({
              userId: identity.userId,
              turnId: turn.turnId,
              conversationId: createdConversationId,
            });
            cleanupRequired = false;
          } catch {
            cleanupRequired = true;
          }
          options.conversationCleanupSignal?.({
            type: 'conversation_provisioning_compensated',
            conversationToken: `conv_${createHash('sha256').update(createdConversationId).digest('hex').slice(0, 16)}`,
            cleanupRequired,
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
      const research = new ResearchSession({
        storage,
        provider: researchProvider(),
        userId: identity.userId,
        leaseId: turn.leaseId,
        turnId: turn.turnId,
        now,
      });
      let streamError: unknown;
      const turnRoute = await (options.classifyTurn ?? classifyMethodTurn)({
        model: model(),
        message: parsed.data.message,
        abortSignal: abort.signal,
      });
      const agent = createMethodAgent({
        model: model(),
        storage,
        loader: await loaderPromise,
        userId: identity.userId,
        conversationId,
        turn,
        turnSequence: now().getTime(),
        occurredAt: now().toISOString(),
        research,
        currentMessage: parsed.data.message,
        turnRoute,
        abortSignal: abort.signal,
        onError: (error) => {
          streamError = error;
          response.locals.methodLog = {
            ...response.locals.methodLog,
            errorClass: safeErrorClass(error),
          };
        },
      });
      response.locals.methodLog = { provider: REVELIO_AGENT_PROVIDER, turnId: turn.turnId };
      throwIfRouteAborted(abort.signal);
      const result = await agent.stream({
        prompt: parsed.data.message,
        abortSignal: abort.signal,
      });
      const displayStream = projectMethodStreamForDisplay(result.stream, {
        streamNaturalText: turnRoute === 'conversation',
        onTextDelta: (text) => { safeAssistantText += text; },
      });
      await pipeUIMessageStreamToResponse({
        response,
        stream: toUIMessageStream({
          stream: displayStream,
          sendReasoning: false,
          sendSources: false,
          onError: (error) => {
            streamError = error;
            response.locals.methodLog = { ...response.locals.methodLog, errorClass: safeErrorClass(error) };
            return 'The agent request failed.';
          },
        }),
      });
      if (streamError) throw streamError;
      if (abort.signal.aborted) {
        await cancelWithCanonicalRecovery();
      } else {
        const authoritative = await storage.loadCareerMap(identity.userId);
        const revision = authoritative.status === 'ready' ? authoritative.map.revision : undefined;
        if (revision !== undefined) response.locals.methodLog = { ...response.locals.methodLog, revision };
        const displayProjection = await listConversationItems({
          client: conversationClient(),
          conversationId,
          abortSignal: AbortSignal.timeout(5_000),
        }).then((items) => resolveDisplayProjection(items, parsed.data.message, safeAssistantText))
          .catch(() => undefined);
        const completed = await storage.completeAgentTurn({
          userId: identity.userId,
          turnId: turn.turnId,
          leaseId: turn.leaseId,
          result: {
            kind: 'completed', refetch: true,
            ...(revision !== undefined ? { revision } : {}),
            ...(displayProjection
              ? { displayProjection }
              : { displayRecovery: createDisplayRecovery(parsed.data.message, safeAssistantText, false) }),
          },
        });
        if (!completed || completed.status !== 'completed') {
          response.locals.methodLog = {
            ...response.locals.methodLog,
            errorClass: completed?.status === 'failed' && typeof completed.terminalResult?.errorClass === 'string'
              ? completed.terminalResult.errorClass
              : 'TurnLeaseLostError',
          };
        }
      }
    } catch (error) {
      if (turn) {
        if (abort.signal.aborted) {
          await cancelWithCanonicalRecovery().catch(() => undefined);
        } else {
          await storage.failAgentTurn({ userId: identity.userId, turnId: turn.turnId, leaseId: turn.leaseId, errorClass: safeErrorClass(error) }).catch(() => undefined);
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
      if (turn) await storage.releaseTurnLease(identity.userId, turn.turnId, turn.leaseId).catch(() => undefined);
    }
  });

  return router;
}

export const agentRouter = createAgentRouter();

import { createHash, randomUUID } from 'node:crypto';
import express, { Router, type Request, type RequestHandler } from 'express';
import { createOpenAI } from '@ai-sdk/openai';
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  toUIMessageStream,
  type LanguageModel,
  type ToolSet,
  type UIMessageChunk,
} from 'ai';
import { z } from 'zod';
import { configuredMethodOrigin, parseAppOrigin } from '../../shared/app-origin.js';
import { env, parseAgentEnabled } from '../env.js';
import { getProtectedIdentity, requireAuth } from '../auth-middleware.js';
import {
  MethodOwnerBusyError,
  nextMethodTurnSequence,
  type AgentTurnRecord,
  type BeginAgentTurnResult,
  type IStorage,
} from '../storage.js';
import { storage as defaultStorage } from '../storage-instance.js';
import {
  NAMI_AGENT_MODEL,
  NAMI_AGENT_PROVIDER,
  createMethodAgent,
  type MethodAgentTurnDiagnostics,
  type MethodAgentTurnStreamResult,
} from '../ai/agent.js';
import { reconcileCancelledToolCalls } from '../ai/cancelled-tool-calls.js';
import { createMethodModuleLoader, type MethodModuleLoader } from '../ai/method/loader.js';
import { MethodLatencyTrace, MethodRequestTiming, methodLatencyEnabled } from './agent-latency.js';
import {
  OpenAIConversationClient,
  ConversationHistoryProviderError,
  createConversationHistoryCursorCodec,
  createDisplayRecovery,
  listConversationItems,
  listRecentConversationItems,
  loadConversationHistory,
  resolveAssistantDisplayProjection,
  resolveDisplayProjection,
  resolveInternalContextItemIds,
  providerInternalContextMarker,
  type ConversationItemsClient,
} from '../ai/history.js';
import {
  executeWorkspaceTool,
  OPERATION_TO_TOOL_NAME,
  WORKSPACE_OPERATION_TYPES,
  workspaceOperationRequestSchema,
  type MethodOperationEnvelope,
} from '../ai/tools.js';
import { invalidationTargetKindSchema, opaqueClientMessageIdSchema, type CareerMap } from '../../shared/career-map/index.js';
import {
  claimLinkedCitationStreamPartSchema,
  operationStatusStreamPartSchema,
  methodWorkspaceRecoverySchema,
} from '../../shared/streaming-schemas.js';
import { observeMethodRequest, methodRouteLabel } from './agent-logging.js';
import {
  MAX_TRANSCRIPT_CODE_UNITS,
  OPENAI_TRANSCRIPTION_MODEL,
  OpenAITranscriptionError,
  transcribeOpenAIAudio,
  type TranscriptionMediaType,
} from '../ai/transcription.js';

import { MAX_ATTACHMENT_REQUEST_BYTES, ATTACHMENT_TYPES, AttachmentError } from '../../shared/chat-attachments.js';
import { prepareChatAttachments } from '../ai/chat-attachments.js';

const agentRequestSchema = z.object({
  id: opaqueClientMessageIdSchema,
  message: z.string().trim().max(12_000),
  attachments: z.array(z.object({
    name: z.string().min(1).max(300),
    mediaType: z.enum(Object.keys(ATTACHMENT_TYPES) as [keyof typeof ATTACHMENT_TYPES, ...(keyof typeof ATTACHMENT_TYPES)[]]),
    data: z.string(),
  }).strict()).optional(),
}).strict();

function requestFingerprint(clientMessageId: string, message: string): string {
  return createHash('sha256').update(`${clientMessageId}\u0000${message}`).digest('hex');
}

const METHOD_AUDIO_LIMIT = '11mb';
const METHOD_AUDIO_PROVIDER_TIMEOUT_MS = 90_000;
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
  transcribeAudio?: (input: {
    audio: Buffer;
    mediaType: TranscriptionMediaType;
    abortSignal?: AbortSignal;
  }) => Promise<string>;
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

function hasValidMethodRequestMetadata(
  request: Request,
  expectedOrigin: string | undefined,
): boolean {
  return requestHasExactOrigin(request, expectedOrigin)
    && request.get('x-nami-request') === '1';
}

function guardCustomMethodPost(expectedOrigin: string | undefined): RequestHandler {
  return (request, response, next) => {
    if (request.method === 'OPTIONS') {
      response.status(405).json({ error: 'Method preflight is not supported' });
      return;
    }
    if (!hasValidMethodRequestMetadata(request, expectedOrigin)) {
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

function normalizedAudioMediaType(value: string | undefined): TranscriptionMediaType | undefined {
  if (!value) return undefined;
  const [rawType, ...rawParameters] = value.split(';');
  const mediaType = rawType?.trim().toLowerCase();
  const parameters = rawParameters.map((parameter) => parameter.trim().toLowerCase()).filter(Boolean);
  if (mediaType === 'audio/mp4' && parameters.length === 0) return 'audio/mp4';
  if (mediaType !== 'audio/webm') return undefined;
  if (parameters.length === 0) return 'audio/webm';
  return parameters.length === 1 && /^codecs\s*=\s*"?opus"?$/u.test(parameters[0] ?? '')
    ? 'audio/webm'
    : undefined;
}

/**
 * Metadata-only guard for the paid Method transcription route. It never reads
 * the request stream, so callers can mount it before body parsers and logging.
 */
export function createAudioTranscriptionMetadataGuard(expectedOriginValue: string | undefined): RequestHandler {
  const expectedOrigin = parseAppOrigin(expectedOriginValue ?? '');
  return (request, response, next) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method audio preflight is not supported' });
      return;
    }
    if (!hasValidMethodRequestMetadata(request, expectedOrigin)) {
      response.status(403).json({ error: 'Invalid Method request metadata' });
      return;
    }
    const mediaType = normalizedAudioMediaType(request.get('content-type'));
    if (!mediaType) {
      response.status(400).json({ error: 'Method audio requires WebM or MP4' });
      return;
    }
    response.locals.methodAudioMediaType = mediaType;
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
    'FramingDeliveryError',
    'InternalContextBindingError',
    'MethodErasurePendingError',
    'MethodOwnerBusyError',
    'NoOutputGeneratedError',
    'OpenAITranscriptionError',
    'RetryError',
    'TimeoutError',
    'TurnLeaseLostError',
    'ZodError',
  ]);
  return allowlisted.has(candidate) ? candidate : 'ExternalProviderError';
}

function methodTurnDiagnosticLog(diagnostics: MethodAgentTurnDiagnostics): Record<string, unknown> {
  return {
    agentFinishReason: diagnostics.finishReason,
    agentStepFinishReasons: diagnostics.stepFinishReasons,
    agentStepCount: diagnostics.stepCount,
    agentVisibleOutput: diagnostics.visibleOutput,
    agentUsageReported: diagnostics.usageReported,
    ...(diagnostics.inputTokens !== undefined ? { agentInputTokens: diagnostics.inputTokens } : {}),
    ...(diagnostics.outputTokens !== undefined ? { agentOutputTokens: diagnostics.outputTokens } : {}),
    ...(diagnostics.reasoningTokens !== undefined ? { agentReasoningTokens: diagnostics.reasoningTokens } : {}),
  };
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

function clientDisconnected(request: Request, response: express.Response, signal: AbortSignal): boolean {
  // Node 24 may report a fully consumed IncomingMessage as destroyed after
  // express.json() completes. That is not a client disconnect.
  return request.aborted || response.destroyed || signal.aborted;
}

function statusForEnvelope(envelope: MethodOperationEnvelope): number {
  if (envelope.status === 'conflict') return 409;
  if (envelope.status === 'rejected') return 422;
  return 200;
}

const storedOperationEnvelopeSchema = z.object({
  status: z.enum(['committed', 'idempotent-replay', 'conflict', 'rejected']),
  operation: z.enum(WORKSPACE_OPERATION_TYPES),
  authoritativeRevision: z.number().int().nonnegative(),
  derivedModule: z.enum(['form-foundation', 'create-purpose-paths', 'design-path-project', 'guide-path-project', 'interpret-path-project']),
  pendingDecision: z.object({
    kind: z.enum([
      'why-confirmation', 'path-selection', 'path-revision-confirmation', 'first-project-confirmation',
      'project-revision-confirmation', 'follow-on-project-selection', 'continue-choice', 'next-move',
    ]),
    targetId: z.string().min(1).max(160),
    targetRevision: z.number().int().positive(),
  }).strict().nullable(),
  invalidatedArtifactClasses: z.array(invalidationTargetKindSchema).optional(),
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

// Recovery comes from the durable failed turn and its exact UI-action receipt,
// even when the provider produced no display item. A later failed reply cannot
// erase it; only a later completed conversation reply settles this guidance.
function workspaceRecovery(map: CareerMap, turns: readonly AgentTurnRecord[]) {
  const completedReply = z.object({
    userItemId: z.string().min(1), assistantItemIds: z.array(z.string().min(1)).min(1),
  });
  const failures = turns.filter((turn) => {
    const terminal = turn.terminalResult;
    if (turn.origin !== 'workspace-action' || turn.status !== 'failed' || !turn.terminalAt
      || terminal?.kind !== 'failed' || terminal.operationCommitted !== true
      || !Number.isSafeInteger(terminal.revision) || Number(terminal.revision) > map.revision) return false;
    return map.operationHistory.some((receipt) => receipt.operationType === 'select-purpose-path'
      && receipt.resultRevision <= Number(terminal.revision)
      && receipt.confirmationProvenance?.kind === 'ui-action'
      && receipt.confirmationProvenance.turnId === turn.turnId
      && receipt.confirmationProvenance.actionId === turn.clientMessageId);
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const failed of failures) {
    const settled = turns.some((turn) => turn.origin === 'agent-turn' && turn.status === 'completed'
      && turn.createdAt > failed.createdAt && turn.terminalAt && turn.terminalAt > failed.terminalAt!
      && turn.terminalResult?.kind === 'completed'
      && completedReply.safeParse(turn.terminalResult.displayProjection).success);
    if (settled) continue;
    const parsed = methodWorkspaceRecoverySchema.safeParse({
      kind: 'committed-follow-up-failed', turnId: failed.turnId, revision: failed.terminalResult!.revision,
    });
    if (parsed.success) return parsed.data;
  }
  return undefined;
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

function terminalBindingReadWindow(budgetMs: number, allowReadGrace: boolean, requestSignal?: AbortSignal) {
  const startedAt = performance.now();
  const totalBudgetMs = allowReadGrace ? budgetMs * 2 : budgetMs;
  const admissionDeadline = AbortSignal.timeout(budgetMs);
  const totalDeadline = allowReadGrace ? AbortSignal.timeout(totalBudgetMs) : admissionDeadline;
  const admissionSignal = requestSignal
    ? AbortSignal.any([requestSignal, admissionDeadline, totalDeadline])
    : AbortSignal.any([admissionDeadline, totalDeadline]);
  const admissionClosed = () => admissionDeadline.aborted || performance.now() - startedAt >= budgetMs;
  const totalExpired = () => totalDeadline.aborted || performance.now() - startedAt >= totalBudgetMs;
  const assertOpen = (expired: boolean) => {
    if (requestSignal?.aborted) throw requestSignal.reason;
    if (expired) throw new DOMException('Terminal binding deadline expired', 'TimeoutError');
  };
  return {
    startedAt, totalBudgetMs, admissionSignal, admissionClosed, totalExpired,
    startRead() {
      assertOpen(admissionClosed() || totalExpired());
      const readStartedAt = performance.now();
      const readDeadline = AbortSignal.timeout(budgetMs);
      const signal = AbortSignal.any([totalDeadline, readDeadline, ...(requestSignal ? [requestSignal] : [])]);
      const expired = () => readDeadline.aborted || performance.now() - readStartedAt >= budgetMs;
      return { signal, expired, assertOpen: () => assertOpen(expired() || totalExpired()) };
    },
  };
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

function attachProviderDeadline(parentSignal: AbortSignal): {
  signal: AbortSignal;
  detach: () => void;
} {
  const controller = new AbortController();
  const abortFromParent = () => {
    if (!controller.signal.aborted) controller.abort(parentSignal.reason);
  };
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener('abort', abortFromParent, { once: true });
  const timeout = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException('Transcription provider deadline exceeded.', 'TimeoutError'));
    }
  }, METHOD_AUDIO_PROVIDER_TIMEOUT_MS);
  timeout.unref?.();
  return {
    signal: controller.signal,
    detach: () => {
      clearTimeout(timeout);
      parentSignal.removeEventListener('abort', abortFromParent);
    },
  };
}

function validAudioSignature(audio: Buffer, mediaType: TranscriptionMediaType): boolean {
  if (mediaType === 'audio/webm') {
    if (audio.length < 6 || audio.readUInt32BE(0) !== 0x1a45dfa3) return false;
    const headerSize = readEbmlVint(audio, 4, true);
    if (!headerSize || headerSize.value > 256) return false;
    const headerEnd = 4 + headerSize.length + headerSize.value;
    if (headerEnd > audio.length) return false;
    let offset = 4 + headerSize.length;
    let webmDocType = false;
    while (offset < headerEnd) {
      const id = readEbmlVint(audio, offset, false);
      if (!id) return false;
      offset += id.length;
      const size = readEbmlVint(audio, offset, true);
      if (!size) return false;
      offset += size.length;
      if (offset + size.value > headerEnd) return false;
      if (id.value === 0x4282) {
        if (webmDocType || audio.toString('ascii', offset, offset + size.value) !== 'webm') return false;
        webmDocType = true;
      }
      offset += size.value;
    }
    return webmDocType;
  }
  if (audio.length < 16 || audio.toString('ascii', 4, 8) !== 'ftyp') return false;
  const boxSize = audio.readUInt32BE(0);
  if (boxSize < 16 || boxSize > 256 || boxSize % 4 !== 0 || boxSize > audio.length) return false;
  for (let offset = 8; offset < boxSize; offset += offset === 8 ? 8 : 4) {
    if (/^(?:isom|iso[2-9]|mp4[12]|M4[AB] |3gp[4-9]|dash)$/.test(audio.toString('ascii', offset, offset + 4))) {
      return true;
    }
  }
  return false;
}

function readEbmlVint(audio: Buffer, offset: number, stripMarker: boolean): { value: number; length: number } | undefined {
  const first = audio[offset];
  if (!first) return undefined;
  let length = 1;
  while (length <= 4 && (first & (0x80 >> (length - 1))) === 0) length += 1;
  if (length > 4 || offset + length > audio.length) return undefined;
  let value = stripMarker ? first & ((0x80 >> length) - 1) : first;
  for (let index = 1; index < length; index += 1) value = value * 256 + audio[offset + index];
  if (stripMarker && value === 2 ** (7 * length) - 1) return undefined;
  return { value, length };
}

async function defaultTranscribeAudio(input: {
  audio: Buffer;
  mediaType: TranscriptionMediaType;
  abortSignal?: AbortSignal;
}): Promise<string> {
  return transcribeOpenAIAudio({
    apiKey: env.OPENAI_API_KEY,
    audio: input.audio,
    mediaType: input.mediaType,
    abortSignal: input.abortSignal,
  });
}

export function createAgentRouter(options: AgentRouterOptions = {}): Router {
  const router = Router();
  const storage = options.storage ?? defaultStorage;
  const now = options.now ?? (() => new Date());
  const nextId = options.id ?? randomUUID;
  const loaderPromise = Promise.resolve(options.loader ?? createMethodModuleLoader());
  const log = options.operationalLog ?? ((entry) => console.log(JSON.stringify(entry)));
  const methodRequestOrigin = options.methodRequestOrigin
    ? parseAppOrigin(options.methodRequestOrigin)
    : configuredMethodOrigin(env.BETTER_AUTH_URL, { nodeEnv: env.NODE_ENV, vercel: process.env.VERCEL });
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
  const model = () => options.model ?? openAI().responses(NAMI_AGENT_MODEL);
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
  const audioMetadataGuard = createAudioTranscriptionMetadataGuard(methodRequestOrigin);
  // Register against the same Express paths as the eventual handlers so
  // default case-insensitive and trailing-slash route matching cannot bypass
  // the guard.
  router.post(GUARDED_METHOD_PATHS, methodPostGuard);
  router.options(GUARDED_METHOD_PATHS, methodPostGuard);
  router.all('/audio/transcribe', audioMetadataGuard);
  router.use((request, response, next) => {
    const requestId = nextId();
    const route = methodRouteLabel(request.method, `${request.baseUrl}${request.path}`);
    response.locals.methodLatency = methodLatencyEnabled() && (route === 'agent-turn' || route === 'workspace-operation')
      ? new MethodLatencyTrace() : undefined;
    response.locals.methodTiming = route === 'agent-turn' || route === 'workspace-operation'
      ? new MethodRequestTiming() : undefined;
    response.setHeader('x-request-id', requestId);
    response.setHeader('cache-control', 'no-store');
    observeMethodRequest(response, { requestId, route, log });
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
      response.locals.methodLog = { provider: NAMI_AGENT_PROVIDER };
      response.json(history);
    } catch (error) {
      if (abort.signal.aborted) return;
      response.locals.methodLog = { provider: NAMI_AGENT_PROVIDER, errorClass: safeErrorClass(error) };
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
        const hasDirectSelection = result.map.operationHistory.some((receipt) => (
          receipt.operationType === 'select-purpose-path' && receipt.confirmationProvenance?.kind === 'ui-action'
        ));
        const recovery = hasDirectSelection
          ? workspaceRecovery(result.map, await storage.listAgentTurns(identity.userId))
          : undefined;
        response.json({ status: 'ready', map: result.map, ...(recovery ? { recovery } : {}) });
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
    const latency = response.locals.methodLatency as MethodLatencyTrace | undefined;
    const timing = response.locals.methodTiming as MethodRequestTiming | undefined;
    const abort = attachAbort(request, response);
    if (clientDisconnected(request, response, abort.signal)) {
      abort.detach();
      return;
    }
    const turnId = nextId();
    const leaseId = nextId();
    const occurredAt = now().toISOString();
    let turn: AgentTurnRecord | undefined;
    let startingRevision: number | undefined;
    let operationEnvelope: MethodOperationEnvelope | undefined;
    let selectionCommitted = false;
    let leaseFinalized = false;
    let safeAssistantText = '';
    let conversationId: string | undefined;
    let methodResult: MethodAgentTurnStreamResult | undefined;
    let continuationOperationSaved = false;
    let latestSavedRevision: number | undefined;
    let terminalProviderStatePromise: Promise<{
      items: unknown[];
      internalContextItemIds: string[];
      markers: readonly string[];
      complete: boolean;
    }> | undefined;
    const terminalProviderState = (timeoutMs = 5_000, requestSignal?: AbortSignal, options: { allowReadGrace?: boolean } = {}) => {
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
        const readWindow = terminalBindingReadWindow(timeoutMs, options.allowReadGrace === true, requestSignal);
        let latest = {
          items: [] as unknown[], internalContextItemIds: [] as string[], markers, complete: false,
        };
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const read = readWindow.startRead();
          let items: unknown[] = [];
          try {
            items = await awaitWithAbort(
              listRecentConversationItems({
                client: conversationClient(),
                conversationId,
                abortSignal: read.signal,
              }),
              read.signal,
            );
            read.assertOpen();
          } catch (error) {
            if (read.signal.aborted || !(error instanceof ConversationHistoryProviderError && error.retryable)) throw error;
          }
          const resolved = resolveInternalContextItemIds(items, markers);
          latest = {
            items,
            internalContextItemIds: resolved.itemIds,
            markers,
            complete: resolved.complete,
          };
          read.assertOpen();
          if (resolved.complete) return latest;
          if (attempt < 4) await abortableDelay(100, readWindow.admissionSignal);
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
    const continuationRecovery = async (timeoutMs = 500) => {
      const [authoritative, providerState] = await Promise.all([
        storage.loadCareerMap(identity.userId).catch(() => undefined),
        terminalProviderState(timeoutMs),
      ]);
      const revision = authoritative?.status === 'ready'
        ? authoritative.map.revision
        : latestSavedRevision;
      const assistantDisplayProjection = providerState.complete
        ? resolveAssistantDisplayProjection(
            providerState.items,
            safeAssistantText,
            new Set(providerState.internalContextItemIds),
          )
        : undefined;
      return {
        ...(revision !== undefined ? { revision } : {}),
        operationCommitted: selectionCommitted
          || continuationOperationSaved
          || (revision !== undefined && startingRevision !== undefined && revision > startingRevision),
        ...(providerState.internalContextItemIds.length > 0
          ? { internalContextItemIds: providerState.internalContextItemIds }
          : {}),
        ...(!providerState.complete && providerState.markers.length > 0
          ? { internalContextMarkers: providerState.markers }
          : {}),
        ...(assistantDisplayProjection ? { assistantDisplayProjection } : {}),
      };
    };
    const cancelWithCanonicalRecovery = async () => {
      if (!turn) return undefined;
      const recovery = await continuationRecovery();
      return storage.cancelAgentTurn({
        userId: identity.userId,
        turnId: turn.turnId,
        leaseId: turn.leaseId,
        result: {
          kind: 'cancelled', stopped: true, refetch: true,
          ...recovery,
        },
      });
    };
    try {
      throwIfRouteAborted(abort.signal);
      const map = await storage.getOrCreateCareerMap(identity.userId);
      latency?.mark('map-ready');
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
      latency?.mark('lease-ready');
      const leasedState = await storage.loadCareerMap(identity.userId);
      if (leasedState.status !== 'ready') throw new Error('CareerMapUnavailableAfterLease');
      startingRevision = leasedState.map.revision;
      const turnSequence = nextMethodTurnSequence(leasedState.map);
      operationEnvelope = await executeWorkspaceTool({
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
      selectionCommitted = operationEnvelope.status === 'committed';
      throwIfRouteAborted(abort.signal);
      if (operationEnvelope.status !== 'committed') {
        const completed = await storage.completeAgentTurn({
          userId: identity.userId,
          turnId: turn.turnId,
          leaseId: turn.leaseId,
          result: { kind: 'workspace-result', refetch: true, operationEnvelope },
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
        response.locals.methodLog = {
          operationId: opaqueOperationId(parsed.data.operationId),
          revision: operationEnvelope.authoritativeRevision,
          errorClass: operationEnvelope.errorClass,
        };
        response.status(statusForEnvelope(operationEnvelope)).json(operationEnvelope);
        return;
      }
      conversationId = await storage.getConversationMapping(identity.userId);
      if (!conversationId) throw new Error('ConversationMappingUnavailableForContinuation');
      const activeConversationId = conversationId;
      const loader = await loaderPromise;
      let streamError: unknown;
      response.locals.methodLog = {
        provider: NAMI_AGENT_PROVIDER,
        turnId: turn.turnId,
        operationId: opaqueOperationId(parsed.data.operationId),
        revision: operationEnvelope.authoritativeRevision,
      };
      const uiStream = createUIMessageStream({
        execute: async ({ writer }) => {
          await reconcileCancelledToolCalls({
            storage, client: conversationClient(), userId: identity.userId,
            conversationId: activeConversationId, turn: turn!, abortSignal: abort.signal,
            operationId: (turnId, callId) => opaqueOperationId([turnId, callId].join('\u0000')),
          });
          const agent = createMethodAgent({
            model: model(),
            nativeWebSearchTool: nativeWebSearchTool(),
            storage,
            loader,
            userId: identity.userId,
            conversationId: activeConversationId,
            turn: turn!,
            turnSequence,
            occurredAt,
            abortSignal: abort.signal,
            internalContextMarker: (responseIndex) => options.internalContextMarker?.(responseIndex)
              ?? `ctx_${createHash('sha256').update([
                turn!.turnId,
                String(responseIndex),
                randomUUID(),
              ].join('\u0000')).digest('base64url').slice(0, 32)}`,
            operationIdForToolCall: (toolCallId) => opaqueOperationId([
              turn!.turnId,
              toolCallId,
            ].join('\u0000')),
            onTurnDiagnostics: (diagnostics) => {
              response.locals.methodLog = {
                ...response.locals.methodLog,
                ...methodTurnDiagnosticLog(diagnostics),
              };
            },
            onLatencyStep: latency ? (index, phase) => latency.step(index, phase) : undefined,
            onLatencySafeText: () => { latency?.mark('safe-text'); timing?.mark('safe-text'); },
            onOperationStatus: async (event) => {
              if (event.phase === 'terminal' && event.status === 'saved') {
                continuationOperationSaved = true;
                if (event.authoritativeRevision !== undefined) {
                  latestSavedRevision = event.authoritativeRevision;
                }
              }
              writer.write(operationStatusStreamPartSchema.parse({
                type: 'data-operation-status',
                id: event.operationId,
                transient: true,
                data: {
                  version: 1,
                  turnId: turn!.turnId,
                  messageId: turn!.clientMessageId,
                  operationId: event.operationId,
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
          latency?.mark('provider-start');
          timing?.mark('provider-start');
          methodResult = await agent.stream({
            continueFromConversation: true,
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
              response.locals.methodLog = {
                ...response.locals.methodLog,
                errorClass: safeErrorClass(error),
              };
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
          response.locals.methodLog = {
            ...response.locals.methodLog,
            errorClass: safeErrorClass(error),
          };
          return 'The agent request failed.';
        },
      });
      const terminalGatedStream = gateTerminalUIStream(uiStream, async (terminalType) => {
        latency?.mark('terminal-start');
        let terminalFailure: unknown;
        try {
          if (streamError || terminalType === 'error') {
            terminalFailure = streamError ?? new Error('The provider stream failed.');
          } else if (abort.signal.aborted || terminalType === 'abort') {
            const cancelled = await cancelWithCanonicalRecovery();
            if (!cancelled || cancelled.status !== 'cancelled') {
              const cancellationError = new Error('The direct continuation could not be durably cancelled.');
              cancellationError.name = 'TurnLeaseLostError';
              terminalFailure = cancellationError;
            }
          } else {
            const authoritative = await storage.loadCareerMap(identity.userId);
            const revision = authoritative.status === 'ready'
              ? authoritative.map.revision
              : latestSavedRevision;
            if (revision !== undefined) {
              response.locals.methodLog = { ...response.locals.methodLog, revision };
            }
            const providerState = await terminalProviderState(5_000, abort.signal, { allowReadGrace: true });
            if (!providerState.complete) {
              const bindingError = new Error('Direct continuation provider items were not durably bound.');
              bindingError.name = 'InternalContextBindingError';
              throw bindingError;
            }
            const assistantDisplayProjection = resolveAssistantDisplayProjection(
              providerState.items,
              safeAssistantText,
              new Set(providerState.internalContextItemIds),
            );
            if (!assistantDisplayProjection) {
              const bindingError = new Error('Direct continuation has no exact assistant projection.');
              bindingError.name = 'InternalContextBindingError';
              throw bindingError;
            }
            const completed = await storage.completeAgentTurn({
              userId: identity.userId,
              turnId: turn!.turnId,
              leaseId: turn!.leaseId,
              result: {
                kind: 'workspace-result',
                refetch: true,
                operationEnvelope,
                operationCommitted: true,
                ...(revision !== undefined ? { revision } : {}),
                internalContextItemIds: providerState.internalContextItemIds,
                assistantDisplayProjection,
              },
              assistantText: safeAssistantText,
              abortSignal: abort.signal,
            });
            if (!completed || completed.status !== 'completed') {
              const terminalError = new Error('The direct continuation could not be durably completed.');
              terminalError.name = completed?.status === 'failed'
                && typeof completed.terminalResult?.errorClass === 'string'
                ? completed.terminalResult.errorClass
                : 'TurnLeaseLostError';
              terminalFailure = terminalError;
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
              const cancellationError = new Error('The direct continuation could not be durably cancelled.');
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
              result: await continuationRecovery(),
            });
            if (!failed || failed.status === 'pending') terminalFailureClass = 'TurnLeaseLostError';
          }
        } finally {
          leaseFinalized = await storage
            .releaseTurnLease(identity.userId, turn!.turnId, turn!.leaseId)
            .then(() => true)
            .catch(() => false);
        }
        latency?.mark('terminal-done');
        timing?.mark('terminal-done');
        return terminalFailureClass
          ? { type: 'error', errorText: 'The agent request failed.' }
          : undefined;
      });
      await pipeUIMessageStreamToResponse({ response, stream: terminalGatedStream });
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
            ...(selectionCommitted ? { result: await continuationRecovery() } : {}),
          }).catch(() => undefined);
        }
      }
      if (abort.signal.aborted) return;
      response.locals.methodLog = { operationId: opaqueOperationId(parsed.data.operationId), errorClass: safeErrorClass(error) };
      if (!response.headersSent) {
        response.status(error instanceof MethodOwnerBusyError ? 409 : 500).json({
          error: 'Workspace operation failed',
          errorClass: safeErrorClass(error),
          ...(error instanceof MethodOwnerBusyError ? { retryable: true } : {}),
        });
      }
    } finally {
      abort.detach();
      if (turn && !leaseFinalized) {
        await storage.releaseTurnLease(identity.userId, turn.turnId, turn.leaseId).catch(() => undefined);
      }
    }
  });

  router.post('/audio/transcribe', express.raw({ type: () => true, limit: METHOD_AUDIO_LIMIT }), async (request, response) => {
    if (!enabled(options.agentEnabled)) {
      response.locals.methodLog = { errorClass: 'AgentDisabledError' };
      response.status(503).json({ error: 'Agent audio is disabled', errorClass: 'AgentDisabledError' });
      return;
    }
    const mediaType = response.locals.methodAudioMediaType as TranscriptionMediaType | undefined;
    if (!mediaType || !Buffer.isBuffer(request.body) || request.body.length === 0
      || !validAudioSignature(request.body, mediaType)) {
      response.locals.methodLog = { errorClass: 'ValidationError' };
      response.status(400).json({ error: 'Invalid bounded audio request', errorClass: 'ValidationError' });
      return;
    }
    const abort = attachAbort(request, response);
    const providerDeadline = attachProviderDeadline(abort.signal);
    try {
      throwIfRouteAborted(abort.signal);
      const text = await (options.transcribeAudio ?? defaultTranscribeAudio)({
        audio: request.body,
        mediaType,
        abortSignal: providerDeadline.signal,
      });
      if (abort.signal.aborted) return;
      if (providerDeadline.signal.aborted) throw providerDeadline.signal.reason;
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > MAX_TRANSCRIPT_CODE_UNITS) {
        throw new OpenAITranscriptionError(
          typeof text === 'string' && text.length > MAX_TRANSCRIPT_CODE_UNITS
            ? 'transcript-too-large'
            : 'empty-transcript',
        );
      }
      response.locals.methodLog = { provider: 'openai', model: OPENAI_TRANSCRIPTION_MODEL };
      response.json({ text });
    } catch (error) {
      if (abort.signal.aborted) return;
      const emptyTranscript = error instanceof OpenAITranscriptionError
        && error.kind === 'empty-transcript';
      response.locals.methodLog = {
        provider: 'openai',
        model: OPENAI_TRANSCRIPTION_MODEL,
        errorClass: safeErrorClass(error),
      };
      if (emptyTranscript) {
        response.json({ text: '' });
        return;
      }
      const unavailable = error instanceof OpenAITranscriptionError && error.kind === 'unavailable';
      response.status(unavailable ? 503 : 502).json({
        error: unavailable ? 'Transcription is unavailable' : 'Transcription failed',
        errorClass: safeErrorClass(error),
      });
    } finally {
      providerDeadline.detach();
      abort.detach();
    }
  });

  router.post('/', (request, response, next) => {
    if (!enabled(options.agentEnabled)) {
      response.status(503).json({ error: 'Agent is disabled', errorClass: 'AgentDisabledError' });
      return;
    }
    next();
  }, express.json({ limit: MAX_ATTACHMENT_REQUEST_BYTES }));

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
    let prepared: ReturnType<typeof prepareChatAttachments>;
    try {
      prepared = prepareChatAttachments(parsed.data);
    } catch (error) {
      response.status(error instanceof AttachmentError ? error.status : 400).json({
        error: error instanceof AttachmentError ? error.message : 'Invalid attachment request',
        errorClass: 'ValidationError',
      });
      return;
    }
    const identity = getProtectedIdentity(response);
    const latency = response.locals.methodLatency as MethodLatencyTrace | undefined;
    const timing = response.locals.methodTiming as MethodRequestTiming | undefined;
    const abort = attachAbort(request, response);
    if (clientDisconnected(request, response, abort.signal)) {
      abort.detach();
      return;
    }
    let turn: AgentTurnRecord | undefined;
    let leaseFinalized = false;
    let startingRevision: number | undefined;
    let safeAssistantText = '';
    let conversationId: string | undefined;
    let methodResult: MethodAgentTurnStreamResult | undefined;
    const bindingAssistantText = () => methodResult?.providerVisibleText() || safeAssistantText;
    const canonicalPurposePathsOffer = () => methodResult?.canonicalPurposePathsOffer() === true;
    let operationSaved = false;
    let latestSavedRevision: number | undefined;
    let terminalProviderStatePromise: Promise<{
      items: unknown[];
      internalContextItemIds: string[];
      markers: readonly string[];
      complete: boolean;
    }> | undefined;
    const terminalProviderState = (timeoutMs = 5_000, requestSignal?: AbortSignal, options: { allowReadGrace?: boolean } = {}) => {
      terminalProviderStatePromise ??= (async () => {
        const bindingStarted = performance.now();
        let phase: 0 | 1 | 2 | 3 | 4 = 0;
        let readWindow: ReturnType<typeof terminalBindingReadWindow> | undefined;
        let lastReadDeadlineExpired = false;
        try {
          if (!methodResult || !conversationId) {
            return { items: [], internalContextItemIds: [], markers: [], complete: false };
          }
          const markerTimeoutSignal = AbortSignal.timeout(timeoutMs);
          const markerSignal = requestSignal
            ? AbortSignal.any([requestSignal, markerTimeoutSignal])
            : markerTimeoutSignal;
          let promiseSettled: 0 | 1 = 1;
          const markers = await awaitWithAbort(methodResult.internalContextMarkers, markerSignal)
            .catch(() => { promiseSettled = 0; return methodResult?.observedInternalContextMarkers() ?? []; });
          try {
            latency?.bindingMarkers({ elapsedMs: performance.now() - bindingStarted, budgetMs: timeoutMs,
              expectedCount: markers.length, promiseSettled, requestAborted: requestSignal?.aborted ? 1 : 0,
              deadlineAborted: markerTimeoutSignal.aborted ? 1 : 0 });
          } catch {}
          if (markers.length === 0) {
            return { items: [], internalContextItemIds: [], markers, complete: false };
          }
          readWindow = terminalBindingReadWindow(timeoutMs, options.allowReadGrace === true, requestSignal);
          let latest = {
            items: [] as unknown[], internalContextItemIds: [] as string[], markers, complete: false,
          };
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const read = readWindow.startRead();
            phase = 1;
            const readStarted = performance.now();
            let pageCounts = { returnedCount: -1, hasMore: -1, cursorPresent: -1 };
            let items: unknown[] = [];
            let readReturned: 0 | 1 = 0;
            let httpStatus = 0;
            const client = conversationClient();
            try {
              items = await awaitWithAbort(
                listRecentConversationItems({
                  client: latency ? { listItems: async (input) => {
                    const page = await client.listItems(input);
                    try { pageCounts = { returnedCount: page.data.length, hasMore: page.hasMore ? 1 : 0,
                      cursorPresent: page.lastId ? 1 : 0 }; } catch {}
                    return page;
                  } } : client,
                  conversationId,
                  abortSignal: read.signal,
                }),
                read.signal,
              );
              readReturned = 1;
              read.assertOpen();
            } catch (error) {
              try { if (error instanceof ConversationHistoryProviderError) httpStatus = error.httpStatus ?? 0; } catch {}
              if (read.signal.aborted || !(error instanceof ConversationHistoryProviderError && error.retryable)) throw error;
            } finally {
              lastReadDeadlineExpired = read.expired();
              try {
                const elapsedMs = performance.now() - readStarted;
                const observedMarkers = latency && readReturned ? items.flatMap((item) => {
                  const candidate = providerInternalContextMarker(item);
                  return candidate ? [candidate.marker] : [];
                }) : [];
                latency?.bindingAttempt({ index: attempt + 1, elapsedMs,
                  readReturned, httpStatus, requestedLimit: 100, ...pageCounts,
                  matchCounts: readReturned ? markers.map((marker) => observedMarkers.filter((candidate) => candidate === marker).length) : [],
                  requestAborted: requestSignal?.aborted ? 1 : 0, admissionClosed: readWindow.admissionClosed() ? 1 : 0,
                  readDeadlineExpired: lastReadDeadlineExpired ? 1 : 0,
                  totalDeadlineExpired: readWindow.totalExpired() ? 1 : 0,
                  deadlineAborted: lastReadDeadlineExpired || readWindow.totalExpired() ? 1 : 0 });
              } catch {}
            }
            const resolved = resolveInternalContextItemIds(items, markers);
            latest = { items, internalContextItemIds: resolved.itemIds, markers, complete: resolved.complete };
            lastReadDeadlineExpired = read.expired();
            read.assertOpen();
            if (resolved.complete) { phase = 3; return latest; }
            if (attempt < 4) { phase = 2; await abortableDelay(100, readWindow.admissionSignal); }
          }
          phase = 4;
          return latest;
        } finally {
          try {
            latency?.bindingExit({ phase, elapsedMs: performance.now() - bindingStarted, complete: phase === 3 ? 1 : 0,
              readPhaseElapsedMs: readWindow ? performance.now() - readWindow.startedAt : 0,
              admissionBudgetMs: timeoutMs, perReadBudgetMs: timeoutMs,
              totalReadBudgetMs: readWindow?.totalBudgetMs ?? (options.allowReadGrace ? timeoutMs * 2 : timeoutMs),
              requestAborted: requestSignal?.aborted ? 1 : 0,
              admissionClosed: readWindow?.admissionClosed() ? 1 : 0,
              readDeadlineExpired: lastReadDeadlineExpired ? 1 : 0,
              totalDeadlineExpired: readWindow?.totalExpired() ? 1 : 0,
              deadlineAborted: lastReadDeadlineExpired || readWindow?.totalExpired() ? 1 : 0 });
          } catch {}
        }
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
      const displayProjection = providerState.complete && bindingAssistantText().length > 0
        ? resolveDisplayProjection(
            providerState.items,
            prepared.visibleText,
            bindingAssistantText(),
            new Set(providerState.internalContextItemIds),
          )
        : undefined;
      return {
        ...(revision !== undefined ? { revision } : {}),
        ...(operationCommitted ? { operationCommitted: true } : {}),
        ...(canonicalPurposePathsOffer() ? { canonicalPurposePathsOffer: true } : {}),
        ...(providerState.internalContextItemIds.length > 0
          ? { internalContextItemIds: providerState.internalContextItemIds }
          : {}),
        ...(!providerState.complete && providerState.markers.length > 0
          ? { internalContextMarkers: providerState.markers }
          : {}),
        ...(displayProjection
          ? { displayProjection }
          : bindingAssistantText().length > 0
            ? { displayRecovery: createDisplayRecovery(prepared.visibleText, bindingAssistantText(), true) }
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
            prepared.visibleText,
            bindingAssistantText(),
            safeAssistantText.length > 0,
          ),
          ...(canonicalPurposePathsOffer() ? { canonicalPurposePathsOffer: true } : {}),
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
      latency?.mark('map-ready');
      if (map.status !== 'ready') {
        response.status(409).json({ status: map.status });
        return;
      }
      throwIfRouteAborted(abort.signal);
      const beginInput = {
        userId: identity.userId,
        clientMessageId: parsed.data.id,
        requestFingerprint: prepared.fingerprint,
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
      latency?.mark('lease-ready');
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
      let streamError: unknown;
      const loader = await loaderPromise;
      if (!conversationId) throw new Error('ConversationProvisioningUnavailable');
      const activeConversationId = conversationId;
      response.locals.methodLog = { provider: NAMI_AGENT_PROVIDER, turnId: turn.turnId };
      throwIfRouteAborted(abort.signal);
      const uiStream = createUIMessageStream({
        execute: async ({ writer }) => {
          await reconcileCancelledToolCalls({
            storage, client: conversationClient(), userId: identity.userId,
            conversationId: activeConversationId, turn: turn!, abortSignal: abort.signal,
            operationId: (turnId, callId) => opaqueOperationId([turnId, callId].join('\u0000')),
          });
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
            currentMessage: parsed.data.message,
            abortSignal: abort.signal,
            internalContextMarker: (responseIndex) => options.internalContextMarker?.(responseIndex)
              ?? `ctx_${createHash('sha256').update([
                turn!.turnId,
                String(responseIndex),
                randomUUID(),
              ].join('\u0000')).digest('base64url').slice(0, 32)}`,
            operationIdForToolCall: (toolCallId) => opaqueOperationId([
              turn!.turnId,
              toolCallId,
            ].join('\u0000')),
            onTurnDiagnostics: (diagnostics) => {
              response.locals.methodLog = {
                ...response.locals.methodLog,
                ...methodTurnDiagnosticLog(diagnostics),
              };
            },
            onLatencyStep: latency ? (index, phase) => latency.step(index, phase) : undefined,
            onLatencySafeText: () => { latency?.mark('safe-text'); timing?.mark('safe-text'); },
            onOperationStatus: async (event) => {
              if (event.phase === 'terminal' && event.status === 'saved') {
                operationSaved = true;
                if (event.authoritativeRevision !== undefined) {
                  latestSavedRevision = event.authoritativeRevision;
                }
              }
              const operationId = event.operationId;
              writer.write(operationStatusStreamPartSchema.parse({
                type: 'data-operation-status',
                id: operationId,
                transient: true,
                data: {
                  version: 1,
                  turnId: turn!.turnId,
                  messageId: turn!.clientMessageId,
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
          latency?.mark('provider-start');
          timing?.mark('provider-start');
          methodResult = await agent.stream({
            prompt: [{ role: 'user', content: prepared.content }],
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
        latency?.mark('terminal-start');
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
            if (!safeAssistantText.trim()) {
              const noOutput = new Error('The agent produced no visible reply.');
              noOutput.name = 'NoOutputGeneratedError';
              throw noOutput;
            }
            const authoritative = await storage.loadCareerMap(identity.userId);
            const revision = authoritative.status === 'ready' ? authoritative.map.revision : undefined;
            if (revision !== undefined) response.locals.methodLog = { ...response.locals.methodLog, revision };
            const providerState = await terminalProviderState(5_000, abort.signal, { allowReadGrace: true });
            if (!providerState.complete) {
              const bindingError = new Error('Internal context provider items were not durably bound.');
              bindingError.name = 'InternalContextBindingError';
              throw bindingError;
            }
            const displayProjection = providerState.complete
              ? resolveDisplayProjection(
                  providerState.items,
                  prepared.visibleText,
                  bindingAssistantText(),
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
                  ...(canonicalPurposePathsOffer() ? { canonicalPurposePathsOffer: true } : {}),
                  ...(displayProjection
                    ? { displayProjection }
                    : { displayRecovery: createDisplayRecovery(prepared.visibleText, bindingAssistantText(), false) }),
                },
                assistantText: safeAssistantText,
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
        latency?.mark('terminal-done');
        timing?.mark('terminal-done');
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
      response.locals.methodLog = { ...response.locals.methodLog, provider: NAMI_AGENT_PROVIDER, errorClass: safeErrorClass(error) };
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

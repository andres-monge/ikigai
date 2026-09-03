import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import {
  deriveMethodCheckpoint,
  entityIdSchema,
  foundationEvidenceSchema,
  languageTagSchema,
  pathProjectInputSchema,
  opaqueClientMessageIdSchema,
  projectAcceptancePhraseSchema,
  projectAcceptanceQuestionSchema,
  purposePathInputSchema,
  realityConstraintSchema,
  revisionSchema,
  selectCurrentFoundationEvidence,
  selectCurrentRealityConstraints,
  hasSuggestedOperationVeto,
  isExactPersistedAcceptance,
  normalizeAuthorityMessage,
  whyInputSchema,
  type CareerMap,
  type CareerMapOperation,
  type CareerMapOperationType,
  type MethodCheckpoint,
} from '../../shared/career-map/index.js';
import { compileCareerMapBriefing, type CareerMapBriefing } from './briefing.js';
import {
  FIRST_PROJECT_ACCEPTANCE_PHRASE_ENGLISH,
  FIRST_PROJECT_ACCEPTANCE_PHRASE_SPANISH,
  R22_CANONICAL_ENGLISH,
  R22_CANONICAL_SPANISH,
} from './method/base-instructions.js';
import type { LoadedMethodModule, MethodModuleLoader } from './method/loader.js';
import {
  createAgentTurnPersistenceContext,
  createWorkspaceActionPersistenceContext,
  type DurableMethodTurnIdentity,
  type IStorage,
  type MethodProvenanceTiming,
  type PersistCareerMapResult,
  MethodOwnerBusyError,
} from '../storage.js';

export type MethodOperationStatus = 'committed' | 'idempotent-replay' | 'conflict' | 'rejected';

export interface MethodOperationEnvelope {
  status: MethodOperationStatus;
  operation: CareerMapOperationType;
  authoritativeRevision: number;
  derivedModule: MethodCheckpoint['module'];
  pendingDecision: MethodCheckpoint['pendingDecision'];
  errorClass?: string;
  retryable?: boolean;
}

export interface PreparedMethodState {
  map: CareerMap;
  checkpoint: MethodCheckpoint;
  module: LoadedMethodModule;
  briefing: CareerMapBriefing;
}

export interface MethodResponseOperationGuard {
  reset(): void;
  claim(operationId: string): boolean;
}

export type MethodOperationLifecycleEvent =
  | {
      phase: 'saving';
      operationId: string;
      operation: CareerMapOperationType;
    }
  | {
      phase: 'terminal';
      operationId: string;
      operation: CareerMapOperationType;
      status: 'saved' | 'conflict' | 'rejected' | 'failed';
      authoritativeRevision?: number;
      errorClass?: string;
      retryable?: boolean;
    };

/**
 * The main agent resets this guard before each provider Response. A custom
 * operation attempt claims that Response before payload preparation, so a
 * provider can never batch multiple canonical writes before an authoritative
 * refresh. Workspace actions deliberately do not use this request-scoped seam.
 */
export function createMethodResponseOperationGuard(): MethodResponseOperationGuard {
  let claimedOperationId: string | undefined;
  return {
    reset() {
      claimedOperationId = undefined;
    },
    claim(operationId) {
      if (claimedOperationId !== undefined) return claimedOperationId === operationId;
      claimedOperationId = operationId;
      return true;
    },
  };
}

export interface MethodOperationExecutorOptions {
  storage: Pick<IStorage, 'loadCareerMap' | 'persistCareerMapOperation'>;
  loader: MethodModuleLoader;
  userId: string;
  turn: DurableMethodTurnIdentity;
  timing: MethodProvenanceTiming;
  surface: 'agent-turn' | 'workspace-action';
  sourceId: string;
  operationType: CareerMapOperationType;
  payload: Record<string, unknown>;
  prepared?: PreparedMethodState;
  abortSignal?: AbortSignal;
}

export type MethodToolRuntime = Omit<MethodOperationExecutorOptions, 'sourceId' | 'operationType' | 'payload' | 'prepared'> & {
  prepared: { current?: PreparedMethodState };
  currentMessage?: string;
  operationGuard?: MethodResponseOperationGuard;
  onOperationStatus?: (event: MethodOperationLifecycleEvent) => void | Promise<void>;
};

const pathToolInputSchema = purposePathInputSchema;
const projectToolInputSchema = pathProjectInputSchema;
const evidenceToolInputSchema = foundationEvidenceSchema.omit({ provenance: true, supersedesEvidenceId: true });
const constraintToolInputSchema = realityConstraintSchema.omit({ provenance: true, supersedesConstraintId: true });

const confirmationTargetSchema = z.object({
  targetId: entityIdSchema,
  targetRevision: revisionSchema,
  presentedInTurnId: entityIdSchema,
  sourceMessageId: entityIdSchema,
}).strict();

const whyConfirmationSchema = z.object({
  whyId: entityIdSchema,
  whyRevision: revisionSchema,
  presentedInTurnId: entityIdSchema,
  sourceMessageId: entityIdSchema,
}).strict();

const projectAcceptanceSchema = z.object({
  projectId: entityIdSchema,
  projectRevision: revisionSchema,
  presentedInTurnId: entityIdSchema,
  sourceMessageId: entityIdSchema,
}).strict();

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('The request was aborted.', 'AbortError');
  }
}

export async function refreshMethodState(
  storage: Pick<IStorage, 'loadCareerMap'>,
  loader: MethodModuleLoader,
  userId: string,
): Promise<PreparedMethodState> {
  const loaded = await storage.loadCareerMap(userId);
  if (loaded.status !== 'ready') {
    const error = new Error('Authoritative Method state is unavailable.');
    error.name = loaded.status === 'repair-required' ? 'CareerMapRepairRequiredError' : 'CareerMapUnavailableError';
    throw error;
  }
  const checkpoint = deriveMethodCheckpoint(loaded.map);
  const module = loader.load(checkpoint);
  const briefing = compileCareerMapBriefing(loaded.map);
  return { map: loaded.map, checkpoint, module, briefing };
}

function checkpointFromMap(map: CareerMap): Pick<PreparedMethodState, 'map' | 'checkpoint'> {
  return { map, checkpoint: deriveMethodCheckpoint(map) };
}

function envelopeFromState(
  operation: CareerMapOperationType,
  state: PreparedMethodState,
  status: MethodOperationStatus,
  errorClass?: string,
  retryable?: boolean,
): MethodOperationEnvelope {
  return {
    status,
    operation,
    authoritativeRevision: state.map.revision,
    derivedModule: state.checkpoint.module,
    pendingDecision: state.checkpoint.pendingDecision,
    ...(errorClass ? { errorClass } : {}),
    ...(retryable ? { retryable: true } : {}),
  };
}

function resultStatus(result: PersistCareerMapResult): {
  status: MethodOperationStatus;
  errorClass?: string;
  retryable?: boolean;
} {
  switch (result.status) {
    case 'committed': return { status: 'committed' };
    case 'replayed': return { status: 'idempotent-replay' };
    case 'rejected':
      return result.error.code === 'revision-conflict'
        ? { status: 'conflict', errorClass: 'revision-conflict', retryable: true }
        : { status: 'rejected', errorClass: result.error.code };
    case 'lease-lost': return { status: 'conflict', errorClass: 'turn-lease-lost', retryable: true };
    case 'repair-required': return { status: 'rejected', errorClass: 'repair-required' };
    case 'erasure-pending': return { status: 'rejected', errorClass: 'method-erasure-pending' };
  }
}

export async function executeMethodOperation(
  options: MethodOperationExecutorOptions,
): Promise<MethodOperationEnvelope> {
  throwIfAborted(options.abortSignal);
  const before = await refreshMethodState(options.storage, options.loader, options.userId);
  if (
    options.prepared
    && (
      options.prepared.map.revision !== before.map.revision
      || options.prepared.checkpoint.module !== before.checkpoint.module
    )
  ) {
    return envelopeFromState(options.operationType, before, 'conflict', 'stale-step-context', true);
  }
  if (!before.checkpoint.availableOperations.includes(options.operationType)) {
    return envelopeFromState(options.operationType, before, 'rejected', 'operation-unavailable');
  }

  const context = options.surface === 'agent-turn'
    ? createAgentTurnPersistenceContext(options.turn, options.timing)
    : createWorkspaceActionPersistenceContext(options.turn, options.timing);
  const operation = {
    type: options.operationType,
    sourceId: options.sourceId,
    expectedRevision: before.map.revision,
    occurredAt: options.timing.occurredAt,
    payload: options.payload,
  } as CareerMapOperation;

  throwIfAborted(options.abortSignal);
  const result = await options.storage.persistCareerMapOperation({
    userId: options.userId,
    leaseId: options.turn.leaseId,
    context,
    operation,
    moduleVersion: `${before.module.key}@${before.module.contentVersion}:${before.module.contentDigest}`,
    abortSignal: options.abortSignal,
  });
  const normalized = resultStatus(result);
  // The persistence result is authoritative. Never downgrade a durable commit
  // because a subsequent load, module read, or briefing compile fails. The
  // next model step still performs its mandatory fresh reload.
  if ('map' in result) {
    const authoritative = checkpointFromMap(result.map);
    return {
      status: normalized.status,
      operation: options.operationType,
      authoritativeRevision: authoritative.map.revision,
      derivedModule: authoritative.checkpoint.module,
      pendingDecision: authoritative.checkpoint.pendingDecision,
      ...(normalized.errorClass ? { errorClass: normalized.errorClass } : {}),
      ...(normalized.retryable ? { retryable: true } : {}),
    };
  }
  return envelopeFromState(options.operationType, before, normalized.status, normalized.errorClass, normalized.retryable);
}

const normalizedMessage = normalizeAuthorityMessage;

/** Deterministic vetoes are a write guard, never a model-routing decision. */
function hasConsequentialDisqualifier(message: string): boolean {
  if (/[?¿？]/.test(message)) return true;
  return [
    /\b(?:no|not|never|neither|except|anything except|dont|don't|do not|without|todavia no|aun no|no quiero|no elijo|no confirmes|no lo confirmes|no selecciones|nunca|jamas|ni|excepto|salvo)\b/,
    /\b(?:research|investigate|explore|explain|revise|refine|edit|adjust|change|before i (?:decide|choose)|investiga|investigar|explora|explica|revisa|revisar|refina|refinar|cambia|cambiar|antes de (?:decidir|elegir))\b/,
    /^\s*(?:should|can|could|would|do|does|did|is|are|what|which|why|how|deberia|puedo|podrias|podemos|confirmamos|que|cual|como)\b/,
    /\b(?:wait|hold off|pause|not yet|for now|before confirm(?:ing)?|espera|esperar|pausa|por ahora|antes de confirmar)\b/,
    /\b(?:need|want)\s+more\s+time\b/,
    /\b(?:between|entre)\b.*\b(?:and|y)\b/,
    /\b(?:path|camino|ruta)\s+(?:[4-9]|\d{2,})\b/,
    /\b(?:choose to discuss|choose to wait|elijo esperar)\b/,
    /\b(?:if|provided that|assuming|only if|solo si|siempre que)\b/,
    /^(?:ok|okay|right|got it|thanks|thank you|interesting|i see|vale|de acuerdo|entendido|tell me more|cuentame mas)\s*[.!]?$/,
    /\b(?:quoting|quoted|i am quoting|i'm quoting|reported speech|citando|entre comillas)\b/,
    /\b(?:non|ne\s+\S+(?:\s+\S+){0,4}\s+pas|attends?|attendre|avant\s+de|recherche|rechercher|affine|affiner|devrais|explique|expliquer)\b/u,
    /\b(?:premiere|premier|deuxieme|second|troisieme|troisieme)\b.*\b(?:et|ou)\b.*\b(?:premiere|premier|deuxieme|second|troisieme|troisieme)\b/u,
    /(?:いいえ|まだ|しないで|待って|待つ|調べて|調べる|改善して|改善する|選ぶ前|確認するのは待)/u,
    /[123]番目.*[とや、,].*[123]番目/u,
  ].some((pattern) => pattern.test(message));
}

export function isConsequentiallyDisqualifiedMessage(message: string): boolean {
  return hasConsequentialDisqualifier(normalizedMessage(message));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPositiveWhyAuthorization(
  message: string,
  input: { targetId: string; targetRevision: number },
): boolean {
  const targetId = escapeRegExp(normalizedMessage(input.targetId));
  const targetRevision = String(input.targetRevision);
  return [
    /^(?:yes|si)\s*[.!]?$/,
    /^(?:yes|si)\s*(?:[-,:]\s*)?(?:confirm|confirma|confirmo)\s*[.!]?$/,
    new RegExp(`^(?:yes|si)\\s*(?:[-,:]\\s*)?(?:confirm|confirma|confirmo)\\s+(?:${targetId})(?:\\s+revision\\s+${targetRevision})?\\s*[.!]?$`, 'u'),
    new RegExp(`^(?:confirm|confirma|confirmo)\\s+(?:${targetId})(?:\\s+revision\\s+${targetRevision})?\\s*[.!]?$`, 'u'),
    new RegExp(`^(?:confirm|confirma|confirmo)\\s+(?:why|por que|el por que)(?:\\s+revision\\s+${targetRevision})?\\s*[.!]?$`, 'u'),
    /^that (?:captures|reflects) what i mean\s*[.!]?(?:\s*(?:use|leave) it as my provisional foundation\s*[.!]?)?$/,
    /^that (?:feels|is) exactly right\s*[.!]?$/,
    /^eso (?:refleja|recoge|capta) lo que quiero decir\s*[.!]?(?:\s*dejemoslo como mi fundamento provisional\s*[.!]?)?$/,
    /^se siente exactamente bien\s*[.!]?$/,
    /^c'est exactement ce que je veux dire\s*[.!]?$/,
    /^それはまさに私の言いたいことです[。.!]?$/u,
  ].some((pattern) => pattern.test(message));
}

function pathReferenceAliases(path: { id: string; name: string }, index: number): string[] {
  const languageAliases = [
    ['first', 'first one', 'first option', 'first path', 'primer', 'primero', 'primera', 'primera opcion', 'premiere voie', 'premier chemin', '1番目の道'],
    ['second', 'second one', 'second option', 'second path', 'segundo', 'segunda', 'segunda opcion', 'deuxieme voie', 'deuxieme chemin', '2番目の道'],
    ['third', 'third one', 'third option', 'third path', 'tercero', 'tercera', 'tercera opcion', 'troisieme voie', 'troisieme chemin', '3番目の道'],
  ][index] ?? [];
  const number = index + 1;
  return [...new Set([
    normalizedMessage(path.id), normalizedMessage(path.name),
    String(number), `path ${number}`, `paths ${number}`, `path number ${number}`,
    `camino ${number}`, `caminos ${number}`, `ruta ${number}`, `rutas ${number}`,
    ...languageAliases,
  ].filter(Boolean))];
}

function matchesPositivePathAuthorization(
  path: { id: string; name: string },
  pathIndex: number,
  message: string,
): boolean {
  const target = pathReferenceAliases(path, pathIndex)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');
  const suffix = String.raw`(?:\s+and\s+help\s+me\s+design\s+(?:the\s+)?(?:first\s+)?project|\s+y\s+ayudame\s+a\s+disenar\s+(?:el\s+)?(?:primer\s+)?proyecto|\s+as\s+the\s+direction\s+i\s+want\s+to\s+pursue)?\s*[.!]?`;
  return [
    new RegExp(`^(?:i\\s+)?(?:choose|select|pick)\\s+(?:the\\s+)?(?:${target})${suffix}$`, 'u'),
    new RegExp(`^go\\s+with\\s+(?:the\\s+)?(?:${target})${suffix}$`, 'u'),
    new RegExp(`^my\\s+choice\\s+is\\s+(?:the\\s+)?(?:${target})${suffix}$`, 'u'),
    new RegExp(`^(?:the\\s+)?(?:${target})\\s+is\\s+the\\s+direction\\s+i\\s+want\\s+to\\s+pursue\\s*[.!]?$`, 'u'),
    new RegExp(`^(?:elijo|selecciono|escojo|me\\s+quedo\\s+con)\\s+(?:(?:el|la)\\s+)?(?:${target})${suffix}$`, 'u'),
    new RegExp(`^je\\s+choisis\\s+(?:la|le)\\s+(?:${target})\\s*[.!]?$`, 'u'),
    new RegExp(`^(?:${target})を選びます[。.!]?$`, 'u'),
  ].some((pattern) => pattern.test(message));
}

function hasPositivePathAuthorization(
  state: PreparedMethodState | undefined,
  input: { targetId: string; targetRevision: number; choiceId?: string; choiceRevision?: number },
  message: string,
): boolean {
  const set = state?.map.pathSets.find((candidate) => (
    candidate.id === input.targetId && candidate.revision === input.targetRevision
  ));
  const pathIndex = set?.paths.findIndex((candidate) => (
    candidate.id === input.choiceId && candidate.revision === input.choiceRevision
  )) ?? -1;
  if (!set || pathIndex < 0) return false;
  const matchingPaths = set.paths.flatMap((path, index) => (
    matchesPositivePathAuthorization(path, index, message) ? [index] : []
  ));
  return matchingPaths.length === 1 && matchingPaths[0] === pathIndex;
}

function hasPositiveProjectAuthorization(
  state: PreparedMethodState | undefined,
  input: { targetId: string; targetRevision: number },
  message: string,
): boolean {
  const project = state?.map.projects.find((candidate) => (
    candidate.id === input.targetId && candidate.revision === input.targetRevision
  ));
  return project?.acceptanceFraming?.status === 'delivered'
    && isExactPersistedAcceptance(message, project.acceptanceFraming.acceptancePhrase);
}

function assertCurrentMessageFramingRequest(runtime: MethodToolRuntime): void {
  if (runtime.surface === 'workspace-action') return;
  const message = normalizedMessage(runtime.currentMessage ?? '');
  const pendingDecision = runtime.prepared.current?.checkpoint.pendingDecision;
  const project = pendingDecision?.kind === 'first-project-confirmation'
    ? runtime.prepared.current?.map.projects.find((candidate) => (
      candidate.id === pendingDecision.targetId
      && candidate.revision === pendingDecision.targetRevision
    ))
    : undefined;
  const requestsFraming = [
    /\b(?:ready|want|would like)\b.*\b(?:accept|acceptance)\b.*\bproject\b/u,
    /\b(?:give|show|present|share)\b.*\b(?:required\s+)?(?:framing|project framing)\b/u,
    /\b(?:list[oa]|preparad[oa]|quiero)\b.*\bacept(?:ar|o)\b.*\bproyecto\b/u,
    /\b(?:dame|muestra|presenta)\b.*\b(?:marco|encuadre)\b/u,
  ].some((pattern) => pattern.test(message));
  const explicitlyRejectsFraming = hasSuggestedOperationVeto(message, [
    'frame', 'framing', 'present', 'show', 'share', 'marco', 'encuadre', 'presentes', 'muestres',
  ]);
  const attemptedAcceptance = project
    ? hasPositiveProjectAuthorization(runtime.prepared.current, {
      targetId: project.id,
      targetRevision: project.revision,
    }, message)
    : false;
  if (!message || explicitlyRejectsFraming || (!requestsFraming && !attemptedAcceptance)) {
    const error = new Error('The current message does not request the first-project acceptance framing.');
    error.name = 'ConfirmationAuthorizationError';
    throw error;
  }
}

function assertCurrentMessageAuthorization(runtime: MethodToolRuntime, input: {
  operation: 'confirm-why' | 'select-purpose-path' | 'confirm-purpose-path-revision' | 'accept-first-project';
  targetId: string;
  targetRevision: number;
  choiceId?: string;
  choiceRevision?: number;
}): void {
  if (runtime.surface === 'workspace-action') return;
  const message = runtime.currentMessage?.trim();
  const normalized = message ? normalizedMessage(message) : '';
  const genericPathAssent = input.operation !== 'confirm-why' && [
    /^(?:yes|yep|yeah|right|correct|confirmed|si|vale|de acuerdo)\s*[.!]?$/,
    /^(?:yes|si),?\s+(?:whichever|whatever|el que|la que)\b/,
  ].some((pattern) => pattern.test(normalized));
  const hasPositiveAuthority = input.operation === 'confirm-why'
    ? hasPositiveWhyAuthorization(normalized, input)
    : input.operation === 'accept-first-project'
      ? hasPositiveProjectAuthorization(runtime.prepared.current, input, normalized)
      : hasPositivePathAuthorization(runtime.prepared.current, input, normalized);
  if (
    !message
    || hasConsequentialDisqualifier(normalized)
    || genericPathAssent
    || !hasPositiveAuthority
  ) {
    const error = new Error('The current message does not unambiguously authorize this target.');
    error.name = 'ConfirmationAuthorizationError';
    throw error;
  }
}

type SuggestedOperation =
  | 'propose-why'
  | 'revise-why'
  | 'propose-purpose-paths'
  | 'replace-purpose-path'
  | 'combine-purpose-paths'
  | 'propose-first-project'
  | 'replace-project-proposal';

function assertCurrentMessageSuggestedOperation(
  runtime: MethodToolRuntime,
  operation: SuggestedOperation,
): void {
  if (runtime.surface === 'workspace-action') return;
  const message = normalizedMessage(runtime.currentMessage ?? '');
  const explicitlyVetoed = hasSuggestedOperationVeto(message, [
    'suggest', 'propose', 'draft', 'create', 'design', 'replace', 'revise', 'combine',
    'sugieras', 'propongas', 'redactes', 'crees', 'disenes', 'reemplaces', 'revises', 'combines',
  ]);
  const prepared = runtime.prepared.current;
  const currentAction = (value: { provenance?: { actionId?: string; turnId?: string } } | undefined) => (
    value?.provenance?.actionId === runtime.turn.clientMessageId
    && value.provenance.turnId === runtime.turn.turnId
  );
  const currentEvidence = prepared
    ? selectCurrentFoundationEvidence(prepared.map.foundation)
    : [];
  const currentConstraints = prepared
    ? selectCurrentRealityConstraints(prepared.map.foundation)
    : [];
  const foundationCategories = new Set(currentEvidence.map((item) => item.category));
  const foundationComplete = ['fascination', 'importance', 'point-of-view', 'starting-asset'].every(
    (category) => foundationCategories.has(category as typeof currentEvidence[number]['category']),
  ) && (currentConstraints.length > 0 || foundationCategories.has('reality-boundary'));
  const touchedFoundationThisMessage = currentEvidence.some(currentAction)
    || currentConstraints.some(currentAction);
  const confirmedWhy = prepared?.map.foundation.whyRevisions.findLast((item) => item.status === 'confirmed');
  const activeSet = prepared?.map.pathSets.findLast((item) => item.status === 'active');
  const automaticTransitionAuthorized = !explicitlyVetoed && (
    (operation === 'propose-why' && Boolean(foundationComplete && touchedFoundationThisMessage))
    || (operation === 'propose-purpose-paths'
      && confirmedWhy?.confirmation?.confirmedBy.actionId === runtime.turn.clientMessageId
      && confirmedWhy.confirmation.confirmedBy.turnId === runtime.turn.turnId)
    || (operation === 'propose-first-project'
      && activeSet?.confirmation?.confirmedBy.actionId === runtime.turn.clientMessageId
      && activeSet.confirmation.confirmedBy.turnId === runtime.turn.turnId)
  );
  if (automaticTransitionAuthorized) return;
  const action = operation === 'combine-purpose-paths'
    ? /\b(?:combine|merge|blend|combina|fusiona|mezcla)\b/u
    : operation === 'replace-purpose-path' || operation === 'replace-project-proposal'
      ? /\b(?:replace|revise|edit|change|rewrite|refine|reemplaza|revisa|edita|cambia|refina)\b/u
      : operation === 'revise-why'
        ? /\b(?:revise|edit|change|rewrite|refine|revisa|edita|cambia|refina)\b/u
        : /\b(?:suggest|propose|draft|create|design|develop|generate|show|give|sugiere|propone|crea|disena|genera|muestra)\b/u;
  const subject = operation === 'propose-why' || operation === 'revise-why'
    ? /\b(?:why|foundation|por que|fundamento)\b/u
    : operation === 'propose-first-project' || operation === 'replace-project-proposal'
      ? /\b(?:project|proyecto)\b/u
      : /\b(?:path|paths|direction|directions|camino|caminos|ruta|rutas|direccion|direcciones)\b/u;
  if (!message || explicitlyVetoed || !action.test(message) || !subject.test(message)) {
    const error = new Error('The current message does not explicitly request this Suggested operation.');
    error.name = 'SuggestedOperationAuthorizationError';
    throw error;
  }
}

function pathReferenceAppears(path: { id: string; name: string }, index: number, message: string): boolean {
  return pathReferenceAliases(path, index).some((alias) => new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(alias)}(?:$|[^a-z0-9])`,
    'u',
  ).test(message));
}

function assertRequestedPathEditTargets(
  runtime: MethodToolRuntime,
  input: { sourceSetId: string; sourceSetRevision: number; pathIds: string[]; allowAdditionalMentions?: boolean },
): void {
  if (runtime.surface === 'workspace-action') return;
  const set = runtime.prepared.current?.map.pathSets.find((candidate) => (
    candidate.id === input.sourceSetId && candidate.revision === input.sourceSetRevision
  ));
  const message = normalizedMessage(runtime.currentMessage ?? '');
  const requestedIds = new Set(input.pathIds);
  const mentionedIds = new Set((set?.paths ?? []).flatMap((path, index) => (
    pathReferenceAppears(path, index, message) ? [path.id] : []
  )));
  if (
    !set
    || requestedIds.size !== input.pathIds.length
    || [...requestedIds].some((id) => !mentionedIds.has(id))
    || (!input.allowAdditionalMentions && mentionedIds.size !== requestedIds.size)
  ) {
    const error = new Error('The path edit does not match the exact targets named in the current message.');
    error.name = 'SuggestedOperationAuthorizationError';
    throw error;
  }
}

function confirmationPayload(
  runtime: MethodToolRuntime,
  input: z.infer<typeof confirmationTargetSchema>,
  operation: 'confirm-why' | 'accept-first-project',
  expectedKind: NonNullable<MethodCheckpoint['pendingDecision']>['kind'],
  targetKey: string,
): Record<string, unknown> {
  const prepared = runtime.prepared.current;
  const pending = prepared?.checkpoint.pendingDecision;
  const targetMatches = pending
    && pending.kind === expectedKind
    && pending.targetId === input.targetId
    && pending.targetRevision === input.targetRevision;
  const presentedInTurnId = operation === 'confirm-why'
    ? prepared?.map.foundation.whyRevisions.find(
      (item) => item.id === input.targetId && item.revision === input.targetRevision,
    )?.presentation.assistantTurnId
    : prepared?.map.projects.find(
      (item) => item.id === input.targetId && item.revision === input.targetRevision,
    )?.acceptanceFraming?.presentation?.assistantTurnId;
  if (
    !targetMatches
    || input.sourceMessageId !== runtime.turn.clientMessageId
    || presentedInTurnId !== input.presentedInTurnId
  ) {
    const error = new Error('Confirmation target is not the exact pending proposal.');
    error.name = 'ConfirmationTargetMismatchError';
    throw error;
  }
  assertCurrentMessageAuthorization(runtime, {
    operation, targetId: input.targetId, targetRevision: input.targetRevision,
  });
  const context = runtime.surface === 'agent-turn'
    ? createAgentTurnPersistenceContext(runtime.turn, runtime.timing)
    : createWorkspaceActionPersistenceContext(runtime.turn, runtime.timing);
  return { [targetKey]: input.targetId, [`${targetKey.replace(/Id$/, '')}Revision`]: input.targetRevision, action: context.action };
}

function assertExactPendingTarget(input: {
  runtime: MethodToolRuntime;
  expectedKind: NonNullable<MethodCheckpoint['pendingDecision']>['kind'];
  targetId: string;
  targetRevision: number;
  presentedInTurnId: string;
  sourceMessageId: string;
  actualPresentedInTurnId: string | undefined;
}): void {
  const pending = input.runtime.prepared.current?.checkpoint.pendingDecision;
  if (
    !pending
    || pending.kind !== input.expectedKind
    || pending.targetId !== input.targetId
    || pending.targetRevision !== input.targetRevision
    || input.sourceMessageId !== input.runtime.turn.clientMessageId
    || input.actualPresentedInTurnId !== input.presentedInTurnId
  ) {
    const error = new Error('The consequential choice does not match the exact pending proposal.');
    error.name = 'ConfirmationTargetMismatchError';
    throw error;
  }
}

function assertUserAuthoredValue(runtime: MethodToolRuntime, value: string): void {
  if (runtime.surface !== 'agent-turn') return;
  const message = normalizedMessage(runtime.currentMessage ?? '');
  const exactValue = normalizedMessage(value);
  if (message && exactValue && message.includes(exactValue)) return;
  const error = new Error('Explorer-authored evidence must be an exact value from the current message.');
  error.name = 'UserEvidenceAssociationError';
  throw error;
}

const SAFE_OPERATION_LIFECYCLE_ERROR_CLASSES = new Set([
  'AbortError',
  'ConfirmationAuthorizationError',
  'ConfirmationTargetMismatchError',
  'MethodOwnerBusyError',
  'ResponseOperationLimitError',
  'SuggestedOperationAuthorizationError',
  'UserEvidenceAssociationError',
  'confirmation-not-auditable',
  'illegal-transition',
  'invalid-map',
  'invalid-operation',
  'invariant-violation',
  'method-erasure-pending',
  'operation-unavailable',
  'repair-required',
  'revision-conflict',
  'source-id-reused',
  'stale-step-context',
  'stale-target',
  'turn-lease-lost',
]);

function safeLifecycleErrorClass(value: string | undefined, fallback: string): string {
  return value && SAFE_OPERATION_LIFECYCLE_ERROR_CLASSES.has(value) ? value : fallback;
}

function operationTool<INPUT>(
  runtime: MethodToolRuntime,
  operationType: CareerMapOperationType,
  description: string,
  inputSchema: z.ZodType<INPUT>,
  payload: (input: INPUT) => Record<string, unknown> | Promise<Record<string, unknown>>,
) {
  return tool({
    description,
    inputSchema,
    strict: true,
    execute: async (input, context) => {
      let terminalEmitted = false;
      const emitTerminal = async (envelope: MethodOperationEnvelope): Promise<void> => {
        terminalEmitted = true;
        await runtime.onOperationStatus?.({
          phase: 'terminal',
          operationId: context.toolCallId,
          operation: operationType,
          status: envelope.status === 'committed' || envelope.status === 'idempotent-replay'
            ? 'saved'
            : envelope.status,
          authoritativeRevision: envelope.authoritativeRevision,
          ...(envelope.errorClass ? {
            errorClass: safeLifecycleErrorClass(
              envelope.errorClass,
              envelope.status === 'conflict' ? 'OperationConflict' : 'OperationRejected',
            ),
          } : {}),
          ...(envelope.retryable ? { retryable: true } : {}),
        });
      };
      try {
        await runtime.onOperationStatus?.({
          phase: 'saving', operationId: context.toolCallId, operation: operationType,
        });
        if (runtime.surface === 'agent-turn' && !runtime.operationGuard?.claim(context.toolCallId)) {
          const error = new Error('Only one canonical operation may be attempted per provider Response.');
          error.name = 'ResponseOperationLimitError';
          throw error;
        }
        const result = await executeMethodOperation({
          ...runtime,
          prepared: runtime.prepared.current,
          sourceId: context.toolCallId,
          operationType,
          payload: await payload(input),
          abortSignal: context.abortSignal ?? runtime.abortSignal,
        });
        await emitTerminal(result);
        return result;
      } catch (error) {
        if (terminalEmitted) throw error;
        const state = runtime.prepared.current;
        if (!state) throw error;
        if (context.abortSignal?.aborted || runtime.abortSignal?.aborted) {
          terminalEmitted = true;
          await runtime.onOperationStatus?.({
            phase: 'terminal', operationId: context.toolCallId, operation: operationType,
            status: 'failed', authoritativeRevision: state.map.revision,
            errorClass: 'AbortError',
          });
          throw error;
        }
        if (error instanceof MethodOwnerBusyError) {
          const envelope = envelopeFromState(operationType, state, 'conflict', error.name, true);
          await emitTerminal(envelope);
          return envelope;
        }
        const knownRejection = error instanceof z.ZodError
          || (error instanceof Error && new Set([
            'ConfirmationAuthorizationError',
            'ConfirmationTargetMismatchError',
            'ResponseOperationLimitError',
            'SuggestedOperationAuthorizationError',
            'UserEvidenceAssociationError',
          ]).has(error.name));
        if (!knownRejection) {
          terminalEmitted = true;
          await runtime.onOperationStatus?.({
            phase: 'terminal', operationId: context.toolCallId, operation: operationType,
            status: 'failed', authoritativeRevision: state.map.revision,
            errorClass: 'OperationError',
          });
          throw error;
        }
        const envelope = envelopeFromState(
          operationType,
          state,
          'rejected',
          error instanceof Error ? error.name : 'OperationInputError',
        );
        await emitTerminal(envelope);
        return envelope;
      }
    },
  });
}

export const OPERATION_TO_TOOL_NAME = {
  'append-foundation-evidence': 'append_foundation_evidence',
  'correct-foundation-evidence': 'correct_foundation_evidence',
  'record-reality-constraint': 'record_reality_constraint',
  'propose-why': 'propose_why',
  'revise-why': 'revise_why',
  'confirm-why': 'confirm_why',
  'propose-purpose-paths': 'propose_purpose_paths',
  'replace-purpose-path': 'replace_purpose_path',
  'combine-purpose-paths': 'combine_purpose_paths',
  'select-purpose-path': 'select_purpose_path',
  'confirm-purpose-path-revision': 'confirm_purpose_path_revision',
  'propose-first-project': 'propose_first_project',
  'replace-project-proposal': 'replace_project_proposal',
  'present-first-project-framing': 'present_first_project_framing',
  'accept-first-project': 'accept_first_project',
} as const satisfies Partial<Record<CareerMapOperationType, string>>;

export const WORKSPACE_OPERATION_TYPES = [
  'confirm-why',
  'select-purpose-path',
  'confirm-purpose-path-revision',
] as const satisfies readonly (keyof typeof OPERATION_TO_TOOL_NAME)[];

export function toolNamesForCheckpoint(
  checkpoint: MethodCheckpoint,
): string[] {
  return checkpoint.availableOperations.flatMap((operation) => {
    const name = OPERATION_TO_TOOL_NAME[operation as keyof typeof OPERATION_TO_TOOL_NAME];
    return name ? [name] : [];
  });
}

export function createMethodTools(runtime: MethodToolRuntime): ToolSet {
  runtime.operationGuard ??= createMethodResponseOperationGuard();
  const context = () => runtime.surface === 'agent-turn'
    ? createAgentTurnPersistenceContext(runtime.turn, runtime.timing)
    : createWorkspaceActionPersistenceContext(runtime.turn, runtime.timing);
  const targetSelectionSchema = z.object({
    setId: entityIdSchema,
    setRevision: revisionSchema,
    pathId: entityIdSchema,
    pathRevision: revisionSchema,
    presentedInTurnId: entityIdSchema,
    sourceMessageId: entityIdSchema,
  }).strict();
  return {
    append_foundation_evidence: operationTool(runtime, 'append-foundation-evidence', 'Record one explorer-authored Foundation evidence item from the current message.', evidenceToolInputSchema, (input) => {
      assertUserAuthoredValue(runtime, input.content);
      return { evidence: { ...input, provenance: context().action } };
    }),
    correct_foundation_evidence: operationTool(runtime, 'correct-foundation-evidence', 'Append a correction to one exact Foundation evidence record.', z.object({ supersedesEvidenceId: entityIdSchema, evidence: evidenceToolInputSchema }).strict(), ({ supersedesEvidenceId, evidence }) => {
      assertUserAuthoredValue(runtime, evidence.content);
      return { supersedesEvidenceId, evidence: { ...evidence, supersedesEvidenceId, provenance: context().action } };
    }),
    record_reality_constraint: operationTool(runtime, 'record-reality-constraint', 'Record one practical reality constraint outside the Why.', constraintToolInputSchema, (input) => {
      assertUserAuthoredValue(runtime, input.description);
      return { constraint: { ...input, provenance: context().action } };
    }),
    propose_why: operationTool(runtime, 'propose-why', 'Suggest one provisional Why. It cannot be confirmed in this assistant turn.', whyInputSchema, (why) => {
      assertCurrentMessageSuggestedOperation(runtime, 'propose-why');
      return { why, presentation: context().presentation };
    }),
    revise_why: operationTool(runtime, 'revise-why', 'Suggest a revision to the current confirmed Why.', z.object({ supersedesWhyId: entityIdSchema, why: whyInputSchema }).strict(), ({ supersedesWhyId, why }) => {
      assertCurrentMessageSuggestedOperation(runtime, 'revise-why');
      return { supersedesWhyId, why, presentation: context().presentation };
    }),
    confirm_why: operationTool(runtime, 'confirm-why', 'Confirm only the exact pending Why from a completed prior assistant turn and this exact user message.', whyConfirmationSchema, (input) => confirmationPayload(runtime, { ...input, targetId: input.whyId, targetRevision: input.whyRevision }, 'confirm-why', 'why-confirmation', 'whyId')),
    propose_purpose_paths: operationTool(runtime, 'propose-purpose-paths', 'Suggest exactly three equal-weight Purpose Paths grounded in the confirmed Why.', z.object({ setId: entityIdSchema, setRevision: revisionSchema, paths: z.array(pathToolInputSchema).length(3) }).strict(), ({ setId, setRevision, paths }) => {
      assertCurrentMessageSuggestedOperation(runtime, 'propose-purpose-paths');
      return { setId, setRevision, paths, presentation: context().presentation };
    }),
    replace_purpose_path: operationTool(runtime, 'replace-purpose-path', 'Replace exactly one path while preserving the other two.', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, replacedPathId: entityIdSchema, replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, replacement: pathToolInputSchema }).strict(), (input) => {
      assertCurrentMessageSuggestedOperation(runtime, 'replace-purpose-path');
      assertRequestedPathEditTargets(runtime, { sourceSetId: input.sourceSetId, sourceSetRevision: input.sourceSetRevision, pathIds: [input.replacedPathId] });
      return { ...input, presentation: context().presentation };
    }),
    combine_purpose_paths: operationTool(runtime, 'combine-purpose-paths', 'Combine exactly two paths and preserve an exact-three equal-weight set.', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, combinedPathIds: z.array(entityIdSchema).length(2), replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, paths: z.array(pathToolInputSchema).length(3) }).strict(), (input) => {
      assertCurrentMessageSuggestedOperation(runtime, 'combine-purpose-paths');
      assertRequestedPathEditTargets(runtime, { sourceSetId: input.sourceSetId, sourceSetRevision: input.sourceSetRevision, pathIds: input.combinedPathIds, allowAdditionalMentions: true });
      return { ...input, presentation: context().presentation };
    }),
    select_purpose_path: operationTool(runtime, 'select-purpose-path', 'Select one exact pending Purpose Path from a completed prior presentation.', targetSelectionSchema, (input) => {
      const set = runtime.prepared.current?.map.pathSets.find((item) => item.id === input.setId && item.revision === input.setRevision);
      assertExactPendingTarget({ runtime, expectedKind: 'path-selection', targetId: input.setId, targetRevision: input.setRevision, presentedInTurnId: input.presentedInTurnId, sourceMessageId: input.sourceMessageId, actualPresentedInTurnId: set?.presentation.assistantTurnId });
      if (!set?.paths.some((path) => path.id === input.pathId && path.revision === input.pathRevision)) {
        const error = new Error('The selected path is not an exact member of the pending set.');
        error.name = 'ConfirmationTargetMismatchError';
        throw error;
      }
      assertCurrentMessageAuthorization(runtime, { operation: 'select-purpose-path', targetId: input.setId, targetRevision: input.setRevision, choiceId: input.pathId, choiceRevision: input.pathRevision });
      return { setId: input.setId, setRevision: input.setRevision, pathId: input.pathId, pathRevision: input.pathRevision, action: context().action };
    }),
    confirm_purpose_path_revision: operationTool(runtime, 'confirm-purpose-path-revision', 'Confirm the exact pending revised Purpose Path set.', targetSelectionSchema, (input) => {
      const set = runtime.prepared.current?.map.pathSets.find((item) => item.id === input.setId && item.revision === input.setRevision);
      assertExactPendingTarget({ runtime, expectedKind: 'path-revision-confirmation', targetId: input.setId, targetRevision: input.setRevision, presentedInTurnId: input.presentedInTurnId, sourceMessageId: input.sourceMessageId, actualPresentedInTurnId: set?.presentation.assistantTurnId });
      if (!set?.paths.some((path) => path.id === input.pathId && path.revision === input.pathRevision)) {
        const error = new Error('The confirmed path is not an exact member of the pending revision.');
        error.name = 'ConfirmationTargetMismatchError';
        throw error;
      }
      assertCurrentMessageAuthorization(runtime, { operation: 'confirm-purpose-path-revision', targetId: input.setId, targetRevision: input.setRevision, choiceId: input.pathId, choiceRevision: input.pathRevision });
      return { setId: input.setId, setRevision: input.setRevision, pathId: input.pathId, pathRevision: input.pathRevision, action: context().action };
    }),
    propose_first_project: operationTool(runtime, 'propose-first-project', 'Immediately after committed path selection, suggest one small firsthand Path Project in the same response for collaborative refinement.', projectToolInputSchema, (project) => {
      assertCurrentMessageSuggestedOperation(runtime, 'propose-first-project');
      return { project, presentation: context().presentation };
    }),
    replace_project_proposal: operationTool(runtime, 'replace-project-proposal', 'Replace the one pending first-project proposal.', z.object({ projectId: entityIdSchema, projectRevision: revisionSchema, replacement: projectToolInputSchema }).strict(), (input) => {
      assertCurrentMessageSuggestedOperation(runtime, 'replace-project-proposal');
      return { ...input, presentation: context().presentation };
    }),
    present_first_project_framing: operationTool(runtime, 'present-first-project-framing', 'Record that the required locale-correct first-project framing will be the only framing in this completed assistant turn.', z.object({
      projectId: entityIdSchema,
      projectRevision: revisionSchema,
      locale: languageTagSchema,
      framingText: z.string().min(1).max(2_000),
      acceptancePhrase: projectAcceptancePhraseSchema,
      acceptanceQuestion: projectAcceptanceQuestionSchema,
    }).strict(), (input) => {
      assertCurrentMessageFramingRequest(runtime);
      const language = input.locale.split('-')[0]?.toLowerCase();
      const canonicalAcceptancePhrase = language === 'en'
        ? FIRST_PROJECT_ACCEPTANCE_PHRASE_ENGLISH
        : language === 'es' ? FIRST_PROJECT_ACCEPTANCE_PHRASE_SPANISH : undefined;
      if (
        (language === 'en' && input.framingText !== R22_CANONICAL_ENGLISH)
        || (language === 'es' && input.framingText !== R22_CANONICAL_SPANISH)
        || (canonicalAcceptancePhrase !== undefined && input.acceptancePhrase !== canonicalAcceptancePhrase)
        || !input.acceptanceQuestion.includes(input.acceptancePhrase)
      ) {
        const error = new Error('The first-project framing or acceptance copy does not match the canonical locale contract.');
        error.name = 'FramingDeliveryError';
        throw error;
      }
      return {
        ...input,
        moduleVersion: runtime.prepared.current?.module.contentVersion ?? 'unavailable',
        presentation: context().presentation,
      };
    }),
    accept_first_project: operationTool(runtime, 'accept-first-project', 'Accept only the exact pending first Path Project after the required framing appeared in a completed prior assistant turn and this message explicitly accepts it.', projectAcceptanceSchema, (input) => confirmationPayload(runtime, {
      ...input,
      targetId: input.projectId,
      targetRevision: input.projectRevision,
    }, 'accept-first-project', 'first-project-confirmation', 'projectId')),
  } satisfies ToolSet;
}

export async function executeWorkspaceTool(input: {
  runtime: Omit<MethodToolRuntime, 'prepared' | 'surface'>;
  expectedRevision: number;
  operationType: keyof typeof OPERATION_TO_TOOL_NAME;
  operationId: string;
  rawInput: unknown;
}): Promise<MethodOperationEnvelope> {
  const prepared = await refreshMethodState(input.runtime.storage, input.runtime.loader, input.runtime.userId);
  if (!(WORKSPACE_OPERATION_TYPES as readonly string[]).includes(input.operationType)) {
    return envelopeFromState(input.operationType, prepared, 'rejected', 'operation-unavailable');
  }
  if (prepared.map.revision !== input.expectedRevision) {
    return envelopeFromState(input.operationType, prepared, 'conflict', 'revision-conflict', true);
  }
  const tools = createMethodTools({
    ...input.runtime,
    surface: 'workspace-action',
    prepared: { current: prepared },
  });
  const name = OPERATION_TO_TOOL_NAME[input.operationType];
  const selected = tools[name];
  if (!selected?.execute) {
    return envelopeFromState(input.operationType, prepared, 'rejected', 'operation-unavailable');
  }
  const schema = selected.inputSchema as z.ZodTypeAny;
  const parsed = schema.safeParse(input.rawInput);
  if (!parsed.success) {
    return envelopeFromState(input.operationType, prepared, 'rejected', 'invalid-operation-input');
  }
  return selected.execute(parsed.data, {
    toolCallId: input.operationId,
    messages: [],
    abortSignal: input.runtime.abortSignal,
  } as never) as Promise<MethodOperationEnvelope>;
}

export const workspaceOperationRequestSchema = z.object({
  operationId: entityIdSchema,
  clientMessageId: opaqueClientMessageIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  operation: z.object({
    type: z.enum(WORKSPACE_OPERATION_TYPES),
    input: z.record(z.unknown()),
  }).strict(),
}).strict();

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import {
  deriveMethodCheckpoint,
  entityIdSchema,
  foundationEvidenceSchema,
  pathProjectInputSchema,
  purposePathInputSchema,
  realityConstraintSchema,
  revisionSchema,
  whyInputSchema,
  type CareerMap,
  type CareerMapOperation,
  type CareerMapOperationType,
  type MethodCheckpoint,
  type SourceProvenance,
} from '../../shared/career-map/index.js';
import { compileCareerMapBriefing, type CareerMapBriefing } from './briefing.js';
import { researchIntentSchema, type ResearchIntent } from './research.js';
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

export interface ResearchSourceReference {
  handle: string;
  field: string;
  claim: string;
}

export interface MethodResearchSession {
  research(input: unknown, abortSignal?: AbortSignal): Promise<unknown>;
  resolveSources(references: readonly ResearchSourceReference[]): SourceProvenance[];
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

type MethodToolRuntime = Omit<MethodOperationExecutorOptions, 'sourceId' | 'operationType' | 'payload' | 'prepared'> & {
  prepared: { current?: PreparedMethodState };
  research?: MethodResearchSession;
  currentMessage?: string;
  turnPolicy?: { researchPerformed: boolean };
};

const sourceReferenceSchema = z.object({
  handle: entityIdSchema,
  field: z.string().min(1).max(80),
  claim: z.string().min(1).max(2_000),
}).strict();

const userSourceSchema = z.object({
  label: z.string().min(1).max(500),
  url: z.string().url().refine((value) => value.startsWith('https://'), 'Sources must use HTTPS.').optional(),
}).strict();

const sourceReferenceFields = {
  researchSources: z.array(sourceReferenceSchema).min(1).max(8).optional(),
  userSources: z.array(userSourceSchema).max(8).optional(),
};

const pathToolInputSchema = purposePathInputSchema.omit({ sources: true }).extend(sourceReferenceFields).strict();
const projectToolInputSchema = pathProjectInputSchema.omit({ sources: true }).extend(sourceReferenceFields).strict();
const evidenceToolInputSchema = foundationEvidenceSchema.omit({ provenance: true, supersedesEvidenceId: true });
const constraintToolInputSchema = realityConstraintSchema.omit({ provenance: true });

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

type ConfirmationAuthorization =
  | { operation: 'confirm-why'; targetId: string; targetRevision: number }
  | { operation: 'select-purpose-path' | 'confirm-purpose-path-revision'; targetId: string; targetRevision: number; choiceId: string; choiceRevision: number };

function normalizedMessage(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function resolveConfirmationAuthorization(
  state: PreparedMethodState,
  message: string,
): ConfirmationAuthorization | undefined {
  const pending = state.checkpoint.pendingDecision;
  if (!pending) return undefined;
  const normalized = normalizedMessage(message);
  const genericAssent = /^\s*(?:yes|yep|yeah|si|confirm(?:ed)?|correct|right|vale|de acuerdo)\b/.test(normalized);
  if (pending.kind === 'why-confirmation') {
    if (!genericAssent && !normalized.includes(normalizedMessage(pending.targetId))) return undefined;
    return { operation: 'confirm-why', targetId: pending.targetId, targetRevision: pending.targetRevision };
  }
  if (pending.kind !== 'path-selection' && pending.kind !== 'path-revision-confirmation') return undefined;
  const set = state.map.pathSets.find((candidate) => (
    candidate.id === pending.targetId && candidate.revision === pending.targetRevision
  ));
  if (!set || genericAssent && !set.paths.some((path) => normalized.includes(normalizedMessage(path.id)) || normalized.includes(normalizedMessage(path.name)))) {
    return undefined;
  }
  const ordinal = normalized.match(/\b(?:path|camino|ruta)\s*(?:number\s*)?(1|2|3)\b/)?.[1];
  const matches = set.paths.filter((path, index) => (
    normalized.includes(normalizedMessage(path.id))
    || normalized.includes(normalizedMessage(path.name))
    || ordinal === String(index + 1)
  ));
  if (matches.length !== 1) return undefined;
  const choice = matches[0];
  return {
    operation: pending.kind === 'path-selection' ? 'select-purpose-path' : 'confirm-purpose-path-revision',
    targetId: pending.targetId,
    targetRevision: pending.targetRevision,
    choiceId: choice.id,
    choiceRevision: choice.revision,
  };
}

function assertCurrentMessageAuthorization(runtime: MethodToolRuntime, input: {
  operation: ConfirmationAuthorization['operation'];
  targetId: string;
  targetRevision: number;
  choiceId?: string;
  choiceRevision?: number;
}): void {
  if (runtime.surface === 'workspace-action' || runtime.currentMessage === undefined) return;
  const state = runtime.prepared.current;
  const authorization = state ? resolveConfirmationAuthorization(state, runtime.currentMessage) : undefined;
  if (
    !authorization
    || authorization.operation !== input.operation
    || authorization.targetId !== input.targetId
    || authorization.targetRevision !== input.targetRevision
    || ('choiceId' in authorization && (
      authorization.choiceId !== input.choiceId || authorization.choiceRevision !== input.choiceRevision
    ))
  ) {
    const error = new Error('The current message does not unambiguously authorize this target.');
    error.name = 'ConfirmationAuthorizationError';
    throw error;
  }
}

function confirmationPayload(
  runtime: MethodToolRuntime,
  input: z.infer<typeof confirmationTargetSchema>,
  expectedKind: NonNullable<MethodCheckpoint['pendingDecision']>['kind'],
  targetKey: string,
): Record<string, unknown> {
  const prepared = runtime.prepared.current;
  const pending = prepared?.checkpoint.pendingDecision;
  const targetMatches = pending
    && pending.kind === expectedKind
    && pending.targetId === input.targetId
    && pending.targetRevision === input.targetRevision;
  const why = prepared?.map.foundation.whyRevisions.find(
    (item) => item.id === input.targetId && item.revision === input.targetRevision,
  );
  const project = prepared?.map.projects.find(
    (item) => item.id === input.targetId && item.revision === input.targetRevision,
  );
  const presentedInTurnId = why?.presentation.assistantTurnId ?? project?.presentation.assistantTurnId;
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
    operation: 'confirm-why', targetId: input.targetId, targetRevision: input.targetRevision,
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

function sourcesFor(
  runtime: MethodToolRuntime,
  input: { researchSources?: ResearchSourceReference[]; userSources?: Array<{ label: string; url?: string }> },
): SourceProvenance[] | undefined {
  const context = runtime.surface === 'agent-turn'
    ? createAgentTurnPersistenceContext(runtime.turn, runtime.timing)
    : createWorkspaceActionPersistenceContext(runtime.turn, runtime.timing);
  const research = input.researchSources?.length
    ? runtime.research?.resolveSources(input.researchSources) ?? (() => {
      const error = new Error('Research handles are unavailable for this turn.');
      error.name = 'ResearchHandleError';
      throw error;
    })()
    : [];
  const user = (input.userSources ?? []).map((source) => ({
    kind: 'user-supplied-source' as const,
    ...source,
    recordedBy: context.action,
  }));
  const sources = [...research, ...user];
  return sources.length ? sources : undefined;
}

function stripSourceReferences<T extends Record<string, unknown>>(
  runtime: MethodToolRuntime,
  input: T & { researchSources?: ResearchSourceReference[]; userSources?: Array<{ label: string; url?: string }> },
  researchableFields: readonly string[],
): Omit<T, 'researchSources' | 'userSources'> & { sources?: SourceProvenance[] } {
  const { researchSources: _research, userSources: _user, ...value } = input;
  if (runtime.turnPolicy?.researchPerformed && !input.researchSources?.length) {
    const error = new Error('A research-backed proposal requires an exact current handle.');
    error.name = 'ResearchGroundingError';
    throw error;
  }
  for (const reference of input.researchSources ?? []) {
    const candidate = value[reference.field];
    const exact = typeof candidate === 'string'
      ? candidate === reference.claim
      : Array.isArray(candidate) && candidate.includes(reference.claim);
    if (!researchableFields.includes(reference.field) || !exact) {
      const error = new Error('Research handle does not support the referenced canonical claim field.');
      error.name = 'ResearchGroundingError';
      throw error;
    }
  }
  const sources = sourcesFor(runtime, input);
  return { ...value, ...(sources ? { sources } : {}) };
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
      try {
        return await executeMethodOperation({
          ...runtime,
          prepared: runtime.prepared.current,
          sourceId: context.toolCallId,
          operationType,
          payload: await payload(input),
          abortSignal: context.abortSignal ?? runtime.abortSignal,
        });
      } catch (error) {
        if (context.abortSignal?.aborted || runtime.abortSignal?.aborted) throw error;
        const state = runtime.prepared.current;
        if (!state) throw error;
        if (error instanceof MethodOwnerBusyError) {
          return envelopeFromState(operationType, state, 'conflict', error.name, true);
        }
        const knownRejection = error instanceof z.ZodError
          || (error instanceof Error && new Set([
            'ConfirmationAuthorizationError',
            'ConfirmationTargetMismatchError',
            'ResearchGroundingError',
            'ResearchHandleError',
          ]).has(error.name));
        if (!knownRejection) throw error;
        return envelopeFromState(
          operationType,
          state,
          'rejected',
          error instanceof Error ? error.name : 'OperationInputError',
        );
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
} as const satisfies Partial<Record<CareerMapOperationType, string>>;

export function toolNamesForCheckpoint(
  checkpoint: MethodCheckpoint,
  hasResearch: boolean,
  turnPolicy?: { researchPerformed: boolean },
): string[] {
  const operationTools = checkpoint.availableOperations.flatMap((operation) => {
    const name = OPERATION_TO_TOOL_NAME[operation as keyof typeof OPERATION_TO_TOOL_NAME];
    return name ? [name] : [];
  });
  const researchAllowed = hasResearch && (
    checkpoint.pendingDecision?.kind === 'path-selection'
    || checkpoint.pendingDecision?.kind === 'path-revision-confirmation'
    || checkpoint.pendingDecision?.kind === 'first-project-confirmation'
  );
  if (turnPolicy?.researchPerformed) {
    const researchBackedProposalTools = new Set([
      'propose_purpose_paths', 'replace_purpose_path', 'combine_purpose_paths',
      'propose_first_project', 'replace_project_proposal',
    ]);
    const bounded = operationTools.filter((name) => researchBackedProposalTools.has(name));
    return researchAllowed ? [...bounded, 'research_current_world'] : bounded;
  }
  return researchAllowed ? [...operationTools, 'research_current_world'] : operationTools;
}

export function createMethodTools(runtime: MethodToolRuntime): ToolSet {
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
  const assertResearchTarget = (input: ResearchIntent): void => {
    const prepared = runtime.prepared.current;
    const pending = prepared?.checkpoint.pendingDecision;
    const matches = input.target.kind === 'purpose-path-set'
      ? (pending?.kind === 'path-selection' || pending?.kind === 'path-revision-confirmation')
        && pending.targetId === input.target.id
        && pending.targetRevision === input.target.revision
        && prepared?.map.pathSets.some((set) => (
          set.id === input.target.id && set.revision === input.target.revision && set.status === 'suggested'
        ))
      : pending?.kind === 'first-project-confirmation'
        && pending.targetId === input.target.id
        && pending.targetRevision === input.target.revision
        && prepared?.map.projects.some((project) => (
          project.id === input.target.id && project.revision === input.target.revision
          && project.agreementStatus === 'suggested'
        ));
    if (!matches) {
      const error = new Error('Research target must be the exact current Suggested proposal.');
      error.name = 'ResearchTargetMismatchError';
      throw error;
    }
  };

  return {
    append_foundation_evidence: operationTool(runtime, 'append-foundation-evidence', 'Record one explorer-authored Foundation evidence item from the current message.', evidenceToolInputSchema, (input) => ({ evidence: { ...input, provenance: context().action } })),
    correct_foundation_evidence: operationTool(runtime, 'correct-foundation-evidence', 'Append a correction to one exact Foundation evidence record.', z.object({ supersedesEvidenceId: entityIdSchema, evidence: evidenceToolInputSchema }).strict(), ({ supersedesEvidenceId, evidence }) => ({ supersedesEvidenceId, evidence: { ...evidence, supersedesEvidenceId, provenance: context().action } })),
    record_reality_constraint: operationTool(runtime, 'record-reality-constraint', 'Record one practical reality constraint outside the Why.', constraintToolInputSchema, (input) => ({ constraint: { ...input, provenance: context().action } })),
    propose_why: operationTool(runtime, 'propose-why', 'Suggest one provisional Why. It cannot be confirmed in this assistant turn.', whyInputSchema, (why) => ({ why, presentation: context().presentation })),
    revise_why: operationTool(runtime, 'revise-why', 'Suggest a revision to the current confirmed Why.', z.object({ supersedesWhyId: entityIdSchema, why: whyInputSchema }).strict(), ({ supersedesWhyId, why }) => ({ supersedesWhyId, why, presentation: context().presentation })),
    confirm_why: operationTool(runtime, 'confirm-why', 'Confirm only the exact pending Why from a completed prior assistant turn and this exact user message.', whyConfirmationSchema, (input) => confirmationPayload(runtime, { ...input, targetId: input.whyId, targetRevision: input.whyRevision }, 'why-confirmation', 'whyId')),
    propose_purpose_paths: operationTool(runtime, 'propose-purpose-paths', 'Suggest exactly three equal-weight Purpose Paths grounded in the confirmed Why.', z.object({ setId: entityIdSchema, setRevision: revisionSchema, paths: z.tuple([pathToolInputSchema, pathToolInputSchema, pathToolInputSchema]) }).strict(), ({ setId, setRevision, paths }) => ({ setId, setRevision, paths: paths.map((path) => stripSourceReferences(runtime, path, ['servesWhy', 'possibility', 'evidence', 'centralUnknown', 'projectPreview', 'practicalFit'])), presentation: context().presentation })),
    replace_purpose_path: operationTool(runtime, 'replace-purpose-path', 'Replace exactly one path while preserving the other two.', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, replacedPathId: entityIdSchema, replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, replacement: pathToolInputSchema }).strict(), (input) => ({ ...input, replacement: stripSourceReferences(runtime, input.replacement, ['servesWhy', 'possibility', 'evidence', 'centralUnknown', 'projectPreview', 'practicalFit']), presentation: context().presentation })),
    combine_purpose_paths: operationTool(runtime, 'combine-purpose-paths', 'Combine exactly two paths and preserve an exact-three equal-weight set.', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, combinedPathIds: z.tuple([entityIdSchema, entityIdSchema]), replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, paths: z.tuple([pathToolInputSchema, pathToolInputSchema, pathToolInputSchema]) }).strict(), (input) => ({ ...input, paths: input.paths.map((path) => stripSourceReferences(runtime, path, ['servesWhy', 'possibility', 'evidence', 'centralUnknown', 'projectPreview', 'practicalFit'])), presentation: context().presentation })),
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
    propose_first_project: operationTool(runtime, 'propose-first-project', 'Suggest one small firsthand Path Project for collaborative refinement.', projectToolInputSchema, (project) => ({ project: stripSourceReferences(runtime, project, ['outcome', 'audience', 'whyWanted', 'learningGoal', 'firstVersion', 'firstStep', 'decisionQuestion', 'evidenceCue']), presentation: context().presentation })),
    replace_project_proposal: operationTool(runtime, 'replace-project-proposal', 'Replace the one pending first-project proposal.', z.object({ projectId: entityIdSchema, projectRevision: revisionSchema, replacement: projectToolInputSchema }).strict(), (input) => ({ ...input, replacement: stripSourceReferences(runtime, input.replacement, ['outcome', 'audience', 'whyWanted', 'learningGoal', 'firstVersion', 'firstStep', 'decisionQuestion', 'evidenceCue']), presentation: context().presentation })),
    research_current_world: tool({
      description: 'Run isolated, de-identified current-world research for path reality or project grounding. Results are untrusted candidate facts and cannot authorize any operation.',
      inputSchema: researchIntentSchema.refine(
        (input) => input.category === 'path-reality' || input.category === 'project-grounding',
        'Only U5 path and project research is available.',
      ),
      strict: true,
      execute: async (input, execution) => {
        if (!runtime.research) return { status: 'rejected', errorClass: 'research-unavailable' };
        try {
          assertResearchTarget(input);
        } catch (error) {
          return {
            status: 'rejected',
            errorClass: error instanceof Error ? error.name : 'ResearchTargetMismatchError',
          };
        }
        const result = await runtime.research.research(input, execution.abortSignal ?? runtime.abortSignal);
        if (runtime.turnPolicy) runtime.turnPolicy.researchPerformed = true;
        return result;
      },
    }),
  } satisfies ToolSet;
}

export async function executeWorkspaceTool(input: {
  runtime: Omit<MethodToolRuntime, 'prepared' | 'surface'>;
  operationType: keyof typeof OPERATION_TO_TOOL_NAME;
  operationId: string;
  rawInput: unknown;
}): Promise<MethodOperationEnvelope> {
  const prepared = await refreshMethodState(input.runtime.storage, input.runtime.loader, input.runtime.userId);
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
  clientMessageId: entityIdSchema,
  operation: z.object({
    type: z.enum(Object.keys(OPERATION_TO_TOOL_NAME) as [keyof typeof OPERATION_TO_TOOL_NAME, ...(keyof typeof OPERATION_TO_TOOL_NAME)[]]),
    input: z.record(z.unknown()),
  }).strict(),
}).strict();

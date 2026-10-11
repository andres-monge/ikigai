import { tool, type ToolSet } from 'ai';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  deriveMethodCheckpoint,
  entityIdSchema,
  foundationEvidenceSchema,
  languageTagSchema,
  invalidationTargetKindSchema,
  pathProjectInputSchema,
  opaqueClientMessageIdSchema,
  projectAcceptancePhraseSchema,
  projectAcceptanceQuestionSchema,
  purposePathInputSchema,
  hasProviderCitationMarkers,
  realityConstraintSchema,
  revisionSchema,
  whyInputSchema,
  type CareerMap,
  type CareerMapOperation,
  type CareerMapOperationType,
  type MethodCheckpoint,
} from '../../shared/career-map/index.js';
import { compileCareerMapBriefing, type CareerMapBriefing } from './briefing.js';
import {
  FIRST_PROJECT_ACCEPTANCE_PHRASE_ENGLISH,
  R22_CANONICAL_ENGLISH,
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
  invalidatedArtifactClasses?: z.infer<typeof invalidationTargetKindSchema>[];
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
  storage: Pick<IStorage, 'loadCareerMap' | 'persistCareerMapOperation' | 'listAgentTurns'>;
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
  operationIdForToolCall?: (toolCallId: string) => string;
  onOperationStatus?: (event: MethodOperationLifecycleEvent) => void | Promise<void>;
};

const pathToolInputSchema = purposePathInputSchema.omit({ possibility: true }).superRefine((path, context) => {
  for (const [field, value] of Object.entries(path)) {
    const values = Array.isArray(value) ? value : [value];
    values.forEach((item, index) => {
      if (typeof item === 'string' && hasProviderCitationMarkers(item)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: Array.isArray(value) ? [field, index] : [field], message: 'Provider citation markers belong in conversation, not a Purpose Path card.' });
      }
    });
  }
});
export const revisePurposePathsToolInputSchema = z.object({
  replacementSetId: entityIdSchema,
  replacementSetRevision: revisionSchema,
  paths: z.array(pathToolInputSchema).length(3),
}).strict();
export const REVISE_PURPOSE_PATHS_TOOL_DESCRIPTION = 'Revise multiple paths in one atomic three-path set. The application supplies the current source set. Include all three paths in their existing order. Copy each unchanged path exactly, including its ID and revision. For each changed path, use a new ID or increment its revision; never change content while reusing the same ID and revision.';
export function normalizeRevisedPurposePathRevisions(map: CareerMap, paths: z.infer<typeof pathToolInputSchema>[]) {
  const existing = map.pathSets.flatMap((set) => set.paths);
  return paths.map((path) => {
    const prior = existing.find((candidate) => candidate.id === path.id && candidate.revision === path.revision);
    if (!prior) return path;
    const { selection: _selection, equalWeight: _equalWeight, ...priorInput } = prior;
    const { possibility: _legacyPossibility, ...priorCurrentInput } = priorInput;
    if (isDeepStrictEqual(priorCurrentInput, path)) return priorInput;
    return {
      ...path,
      revision: Math.max(...existing.filter((candidate) => candidate.id === path.id).map((candidate) => candidate.revision)) + 1,
    };
  });
}
const projectToolInputSchema = pathProjectInputSchema;
const evidenceToolInputSchema = foundationEvidenceSchema
  .omit({ provenance: true, supersedesEvidenceId: true })
  .extend({
    category: foundationEvidenceSchema.shape.category.describe(
      'Use fascination only for a specific activity or topic that actually pulls the explorer in. Never classify a statement that they cannot name one as fascination.',
    ),
    content: foundationEvidenceSchema.shape.content.describe(
      'Copy verbatim as one exact substring from the current explorer message. Never summarize or paraphrase it.',
    ),
  })
  .strict();
const constraintToolInputSchema = realityConstraintSchema
  .omit({ provenance: true, supersedesConstraintId: true })
  .extend({
    description: realityConstraintSchema.shape.description.describe(
      'Copy verbatim as one exact substring from the current explorer message. Never summarize or paraphrase it.',
    ),
  })
  .strict();

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
      ...('effects' in result && result.effects
        ? { invalidatedArtifactClasses: result.effects.invalidatedArtifactClasses }
        : {}),
      ...(normalized.errorClass ? { errorClass: normalized.errorClass } : {}),
      ...(normalized.retryable ? { retryable: true } : {}),
    };
  }
  return envelopeFromState(options.operationType, before, normalized.status, normalized.errorClass, normalized.retryable);
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
  const message = runtime.currentMessage ?? '';
  if (message.length > 0 && value.length > 0 && message.includes(value)) return;
  const error = new Error('Explorer-authored evidence must be an exact value from the current message.');
  error.name = 'UserEvidenceAssociationError';
  throw error;
}

const SAFE_OPERATION_LIFECYCLE_ERROR_CLASSES = new Set([
  'AbortError',
  'ConfirmationTargetMismatchError',
  'MethodOwnerBusyError',
  'ResponseOperationLimitError',
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
      const operationId = runtime.operationIdForToolCall?.(context.toolCallId) ?? context.toolCallId;
      let terminalEmitted = false;
      const emitTerminal = async (envelope: MethodOperationEnvelope): Promise<void> => {
        terminalEmitted = true;
        await runtime.onOperationStatus?.({
          phase: 'terminal',
          operationId,
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
          phase: 'saving', operationId, operation: operationType,
        });
        if (runtime.operationGuard && !runtime.operationGuard.claim(operationId)) {
          const error = new Error('Only one canonical operation may be attempted per provider Response.');
          error.name = 'ResponseOperationLimitError';
          throw error;
        }
        const result = await executeMethodOperation({
          ...runtime,
          prepared: runtime.prepared.current,
          sourceId: operationId,
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
            phase: 'terminal', operationId, operation: operationType,
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
            'ConfirmationTargetMismatchError',
            'ResponseOperationLimitError',
            'UserEvidenceAssociationError',
          ]).has(error.name));
        if (!knownRejection) {
          terminalEmitted = true;
          await runtime.onOperationStatus?.({
            phase: 'terminal', operationId, operation: operationType,
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
  'open-foundation-revision-focus': 'open_foundation_revision_focus',
  'close-focus': 'close_focus',
  'resolve-basis-review': 'resolve_basis_review',
  'propose-purpose-paths': 'propose_purpose_paths',
  'replace-purpose-path': 'replace_purpose_path',
  'revise-purpose-paths': 'revise_purpose_paths',
  'combine-purpose-paths': 'combine_purpose_paths',
  'select-purpose-path': 'select_purpose_path',
  'confirm-purpose-path-revision': 'confirm_purpose_path_revision',
  'propose-first-project': 'propose_first_project',
  'replace-project-proposal': 'replace_project_proposal',
  'present-first-project-framing': 'present_first_project_framing',
  'accept-first-project': 'accept_first_project',
} as const satisfies Partial<Record<CareerMapOperationType, string>>;

export const WORKSPACE_OPERATION_TYPES = [
  'select-purpose-path',
  'confirm-purpose-path-revision',
] as const satisfies readonly (keyof typeof OPERATION_TO_TOOL_NAME)[];

export function toolNamesForCheckpoint(
  checkpoint: MethodCheckpoint,
  currentTurnSequence?: number,
): string[] {
  return checkpoint.availableOperations.flatMap((operation) => {
    if (
      operation === 'close-focus'
      && checkpoint.focus?.kind === 'foundation-revision'
      && currentTurnSequence !== undefined
      && currentTurnSequence <= checkpoint.focus.openedBy.turnSequence
    ) return [];
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
    append_foundation_evidence: operationTool(runtime, 'append-foundation-evidence', 'Record one explorer-authored North Star evidence item. The content must be copied verbatim as one exact substring from the current explorer message; never summarize or paraphrase it. Never store a statement that the explorer cannot name an absorbing activity as fascination evidence.', evidenceToolInputSchema, (input) => {
      assertUserAuthoredValue(runtime, input.content);
      return { evidence: { ...input, provenance: context().action } };
    }),
    correct_foundation_evidence: operationTool(runtime, 'correct-foundation-evidence', 'Append a correction to one exact North Star evidence record.', z.object({ supersedesEvidenceId: entityIdSchema, evidence: evidenceToolInputSchema }).strict(), ({ supersedesEvidenceId, evidence }) => {
      assertUserAuthoredValue(runtime, evidence.content);
      return { supersedesEvidenceId, evidence: { ...evidence, supersedesEvidenceId, provenance: context().action } };
    }),
    record_reality_constraint: operationTool(runtime, 'record-reality-constraint', 'Record one practical reality constraint outside Your North Star. The description must be copied verbatim as one exact substring from the current explorer message; never summarize or paraphrase it.', constraintToolInputSchema, (input) => {
      assertUserAuthoredValue(runtime, input.description);
      return { constraint: { ...input, provenance: context().action } };
    }),
    propose_why: operationTool(runtime, 'propose-why', 'Propose one North Star for the explorer to consider. It cannot be confirmed in this assistant turn.', whyInputSchema, (why) => {
      return { why, presentation: context().presentation };
    }),
    revise_why: operationTool(runtime, 'revise-why', "Use only when the current explorer message explicitly asks to change the North Star's content or recover a failed presentation. Asking to revisit or reflect on it does not authorize this operation. Never use it for an acknowledgment or confirmation. Suggest the revision and return its exact affected artifact classes.", z.object({ supersedesWhyId: entityIdSchema, why: whyInputSchema }).strict(), ({ supersedesWhyId, why }) => {
      return { supersedesWhyId, why, presentation: context().presentation };
    }),
    confirm_why: operationTool(runtime, 'confirm-why', 'Confirm only the exact pending North Star from a completed prior assistant turn when the main agent judges the current explorer message as confirmation.', whyConfirmationSchema, (input) => confirmationPayload(runtime, { ...input, targetId: input.whyId, targetRevision: input.whyRevision }, 'confirm-why', 'why-confirmation', 'whyId')),
    open_foundation_revision_focus: operationTool(runtime, 'open-foundation-revision-focus', 'Open a conversation to reconsider the North Star when the explorer asks to revisit it; for example, a new interest may point to a different contribution or point of view. State the reason. Opening this focus does not revise or confirm the North Star; explore the tension with the explorer before proposing any revision.', z.object({ reason: z.string().min(1).max(2_000) }).strict(), ({ reason }) => ({ reason, action: context().action })),
    close_focus: operationTool(runtime, 'close-focus', 'Close the current reflection focus only after a later explorer turn resolves it or asks to return to the prior decision. Never close Foundation reflection in the same turn that opened it. In Foundation revision focus, this withdraws an unconfirmed North Star revision and restores the prior decision without changing the confirmed North Star or Purpose Paths.', z.object({}).strict(), () => ({ action: context().action })),
    resolve_basis_review: operationTool(runtime, 'resolve-basis-review', 'Resolve the exact earliest invalidated artifact shown in the current checkpoint. After a confirmed North Star revision, an old path set must use replaced; this preserves its history and allows a fresh three-path set after all reviews are resolved. Review later artifacts individually rather than automatically reaffirming them.', z.object({
      targetKind: invalidationTargetKindSchema,
      targetId: entityIdSchema,
      targetRevision: revisionSchema,
      resolution: z.enum(['reaffirmed', 'revised', 'replaced']),
    }).strict(), (input) => ({ ...input, action: context().action })),
    propose_purpose_paths: operationTool(runtime, 'propose-purpose-paths', 'Suggest exactly three equal-weight Purpose Paths grounded in the confirmed North Star.', z.object({ setId: entityIdSchema, setRevision: revisionSchema, paths: z.array(pathToolInputSchema).length(3) }).strict(), ({ setId, setRevision, paths }) => {
      return { setId, setRevision, paths, presentation: context().presentation };
    }),
    replace_purpose_path: operationTool(runtime, 'replace-purpose-path', 'Replace exactly one path while preserving the other two.', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, replacedPathId: entityIdSchema, replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, replacement: pathToolInputSchema }).strict(), (input) => {
      return { ...input, presentation: context().presentation };
    }),
    revise_purpose_paths: operationTool(runtime, 'revise-purpose-paths', REVISE_PURPOSE_PATHS_TOOL_DESCRIPTION, revisePurposePathsToolInputSchema, (input) => {
      const pathSets = runtime.prepared.current?.map.pathSets ?? [];
      const source = pathSets.findLast((set) => set.status === 'suggested')
        ?? pathSets.findLast((set) => set.status === 'active');
      if (!source) throw new Error('No current Purpose Path set is available to revise.');
      return {
        ...input,
        sourceSetId: source.id,
        sourceSetRevision: source.revision,
        paths: normalizeRevisedPurposePathRevisions(runtime.prepared.current!.map, input.paths),
        presentation: context().presentation,
      };
    }),
    combine_purpose_paths: operationTool(runtime, 'combine-purpose-paths', 'Combine exactly two paths and preserve an exact-three equal-weight set.', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, combinedPathIds: z.array(entityIdSchema).length(2), replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, paths: z.array(pathToolInputSchema).length(3) }).strict(), (input) => {
      return {
        ...input,
        paths: normalizeRevisedPurposePathRevisions(runtime.prepared.current!.map, input.paths),
        presentation: context().presentation,
      };
    }),
    select_purpose_path: operationTool(runtime, 'select-purpose-path', 'Select one exact pending Purpose Path from a completed prior presentation.', targetSelectionSchema, (input) => {
      const set = runtime.prepared.current?.map.pathSets.find((item) => item.id === input.setId && item.revision === input.setRevision);
      assertExactPendingTarget({ runtime, expectedKind: 'path-selection', targetId: input.setId, targetRevision: input.setRevision, presentedInTurnId: input.presentedInTurnId, sourceMessageId: input.sourceMessageId, actualPresentedInTurnId: set?.presentation.assistantTurnId });
      if (!set?.paths.some((path) => path.id === input.pathId && path.revision === input.pathRevision)) {
        const error = new Error('The selected path is not an exact member of the pending set.');
        error.name = 'ConfirmationTargetMismatchError';
        throw error;
      }
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
      return { setId: input.setId, setRevision: input.setRevision, pathId: input.pathId, pathRevision: input.pathRevision, action: context().action };
    }),
    propose_first_project: operationTool(runtime, 'propose-first-project', 'Immediately after committed path selection, suggest one small firsthand Path Project in the same response for collaborative refinement.', projectToolInputSchema, (project) => {
      return { project, presentation: context().presentation };
    }),
    replace_project_proposal: operationTool(runtime, 'replace-project-proposal', 'Replace the one pending first-project proposal.', z.object({ projectId: entityIdSchema, projectRevision: revisionSchema, replacement: projectToolInputSchema }).strict(), (input) => {
      return { ...input, presentation: context().presentation };
    }),
    present_first_project_framing: operationTool(runtime, 'present-first-project-framing', 'Record that the required first-project framing will be the only framing in this completed assistant turn.', z.object({
      projectId: entityIdSchema,
      projectRevision: revisionSchema,
      locale: languageTagSchema,
      framingText: z.string().min(1).max(2_000),
      acceptancePhrase: projectAcceptancePhraseSchema,
      acceptanceQuestion: projectAcceptanceQuestionSchema,
    }).strict(), (input) => {
      const language = input.locale.split('-')[0]?.toLowerCase();
      const canonicalAcceptancePhrase = language === 'en' ? FIRST_PROJECT_ACCEPTANCE_PHRASE_ENGLISH : undefined;
      if (
        (language === 'en' && input.framingText !== R22_CANONICAL_ENGLISH)
        || (canonicalAcceptancePhrase !== undefined && input.acceptancePhrase !== canonicalAcceptancePhrase)
        || !input.acceptanceQuestion.includes(input.acceptancePhrase)
      ) {
        const error = new Error('The first-project framing or acceptance copy does not match the canonical contract.');
        error.name = 'FramingDeliveryError';
        throw error;
      }
      return {
        ...input,
        moduleVersion: runtime.prepared.current?.module.contentVersion ?? 'unavailable',
        presentation: context().presentation,
      };
    }),
    accept_first_project: operationTool(runtime, 'accept-first-project', 'Accept only the exact pending first Path Project after the required framing appeared in a completed prior assistant turn and the main agent judges this message as unambiguous semantic acceptance.', projectAcceptanceSchema, (input) => confirmationPayload(runtime, {
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
  const presentedInTurnId = (parsed.data as Record<string, unknown>).presentedInTurnId;
  const presentationTurn = typeof presentedInTurnId === 'string'
    ? (await input.runtime.storage.listAgentTurns(input.runtime.userId)).find((turn) => (
        turn.turnId === presentedInTurnId && turn.origin === 'agent-turn'
      ))
    : undefined;
  if (
    !presentationTurn
    || presentationTurn.status !== 'completed'
    || presentationTurn.terminalResult?.kind !== 'completed'
  ) {
    return envelopeFromState(input.operationType, prepared, 'rejected', 'confirmation-not-auditable');
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

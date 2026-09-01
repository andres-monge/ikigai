import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import {
  deriveMethodCheckpoint,
  entityIdSchema,
  foundationEvidenceSchema,
  pathProjectInputSchema,
  projectWorkStatusSchema,
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
import type { LoadedMethodModule, MethodModuleLoader } from './method/loader.js';
import {
  createAgentTurnPersistenceContext,
  createWorkspaceActionPersistenceContext,
  type DurableMethodTurnIdentity,
  type IStorage,
  type MethodProvenanceTiming,
  type PersistCareerMapResult,
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
};

const sourceReferenceSchema = z.object({
  handle: entityIdSchema,
  claim: z.string().min(1).max(2_000),
}).strict();

const userSourceSchema = z.object({
  label: z.string().min(1).max(500),
  url: z.string().url().refine((value) => value.startsWith('https://'), 'Sources must use HTTPS.').optional(),
}).strict();

const sourceReferenceFields = {
  researchSources: z.array(sourceReferenceSchema).max(8).optional(),
  userSources: z.array(userSourceSchema).max(8).optional(),
};

const pathToolInputSchema = purposePathInputSchema.omit({ sources: true }).extend(sourceReferenceFields).strict();
const projectToolInputSchema = pathProjectInputSchema.omit({ sources: true }).extend(sourceReferenceFields).strict();
const evidenceToolInputSchema = foundationEvidenceSchema.omit({ provenance: true });
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
  // U5 deliberately ends before the U7 acceptance boundary. Committing this
  // operation would derive guide-path-project, whose repository-owned module
  // is not registered yet, leaving the next authoritative step unloadable.
  // Keep the same guard on agent and workspace execution until U7 lands the
  // next module atomically.
  if (options.operationType === 'accept-first-project') {
    return envelopeFromState(
      options.operationType,
      before,
      'rejected',
      'next-module-not-registered',
    );
  }
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
  const after = await refreshMethodState(options.storage, options.loader, options.userId);
  const normalized = resultStatus(result);
  return envelopeFromState(
    options.operationType,
    after,
    normalized.status,
    normalized.errorClass,
    normalized.retryable,
  );
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
): Omit<T, 'researchSources' | 'userSources'> & { sources?: SourceProvenance[] } {
  const { researchSources: _research, userSources: _user, ...value } = input;
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
        const state = await refreshMethodState(runtime.storage, runtime.loader, runtime.userId);
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
  'choose-parked-purpose-path': 'choose_parked_purpose_path',
  'propose-first-project': 'propose_first_project',
  'replace-project-proposal': 'replace_project_proposal',
  'accept-first-project': 'accept_first_project',
  'propose-project-revision': 'propose_project_revision',
  'confirm-project-revision': 'confirm_project_revision',
  'propose-follow-on-projects': 'propose_follow_on_projects',
  'replace-follow-on-project': 'replace_follow_on_project',
  'select-follow-on-project': 'select_follow_on_project',
  'open-foundation-revision-focus': 'open_foundation_revision_focus',
  'open-path-revision-focus': 'open_path_revision_focus',
  'close-focus': 'close_focus',
  'resolve-basis-review': 'resolve_basis_review',
} as const satisfies Partial<Record<CareerMapOperationType, string>>;

export function toolNamesForCheckpoint(checkpoint: MethodCheckpoint, hasResearch: boolean): string[] {
  const operationTools = checkpoint.availableOperations.flatMap((operation) => {
    if (operation === 'accept-first-project') return [];
    const name = OPERATION_TO_TOOL_NAME[operation as keyof typeof OPERATION_TO_TOOL_NAME];
    return name ? [name] : [];
  });
  const researchAllowed = hasResearch
    && (checkpoint.module === 'create-purpose-paths' || checkpoint.module === 'design-path-project');
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
  const projectConfirmationSchema = z.object({
    projectId: entityIdSchema,
    projectRevision: revisionSchema,
    presentedInTurnId: entityIdSchema,
    sourceMessageId: entityIdSchema,
  }).strict();

  return {
    append_foundation_evidence: operationTool(runtime, 'append-foundation-evidence', 'Record one explorer-authored Foundation evidence item from the current message.', evidenceToolInputSchema, (input) => ({ evidence: { ...input, provenance: context().action } })),
    correct_foundation_evidence: operationTool(runtime, 'correct-foundation-evidence', 'Append a correction to one exact Foundation evidence record.', z.object({ supersedesEvidenceId: entityIdSchema, evidence: evidenceToolInputSchema }).strict(), ({ supersedesEvidenceId, evidence }) => ({ supersedesEvidenceId, evidence: { ...evidence, supersedesEvidenceId, provenance: context().action } })),
    record_reality_constraint: operationTool(runtime, 'record-reality-constraint', 'Record one practical reality constraint outside the Why.', constraintToolInputSchema, (input) => ({ constraint: { ...input, provenance: context().action } })),
    propose_why: operationTool(runtime, 'propose-why', 'Suggest one provisional Why. It cannot be confirmed in this assistant turn.', whyInputSchema, (why) => ({ why, presentation: context().presentation })),
    revise_why: operationTool(runtime, 'revise-why', 'Suggest a revision to the current confirmed Why.', z.object({ supersedesWhyId: entityIdSchema, why: whyInputSchema }).strict(), ({ supersedesWhyId, why }) => ({ supersedesWhyId, why, presentation: context().presentation })),
    confirm_why: operationTool(runtime, 'confirm-why', 'Confirm only the exact pending Why from a completed prior assistant turn and this exact user message.', whyConfirmationSchema, (input) => confirmationPayload(runtime, { ...input, targetId: input.whyId, targetRevision: input.whyRevision }, 'why-confirmation', 'whyId')),
    propose_purpose_paths: operationTool(runtime, 'propose-purpose-paths', 'Suggest exactly three equal-weight Purpose Paths grounded in the confirmed Why.', z.object({ setId: entityIdSchema, setRevision: revisionSchema, paths: z.tuple([pathToolInputSchema, pathToolInputSchema, pathToolInputSchema]) }).strict(), ({ setId, setRevision, paths }) => ({ setId, setRevision, paths: paths.map((path) => stripSourceReferences(runtime, path)), presentation: context().presentation })),
    replace_purpose_path: operationTool(runtime, 'replace-purpose-path', 'Replace exactly one path while preserving the other two.', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, replacedPathId: entityIdSchema, replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, replacement: pathToolInputSchema }).strict(), (input) => ({ ...input, replacement: stripSourceReferences(runtime, input.replacement), presentation: context().presentation })),
    combine_purpose_paths: operationTool(runtime, 'combine-purpose-paths', 'Combine exactly two paths and preserve an exact-three equal-weight set.', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, combinedPathIds: z.tuple([entityIdSchema, entityIdSchema]), replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, paths: z.tuple([pathToolInputSchema, pathToolInputSchema, pathToolInputSchema]) }).strict(), (input) => ({ ...input, paths: input.paths.map((path) => stripSourceReferences(runtime, path)), presentation: context().presentation })),
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
    choose_parked_purpose_path: operationTool(runtime, 'choose-parked-purpose-path', 'Choose one parked Purpose Path after returning to paths.', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, pathId: entityIdSchema, pathRevision: revisionSchema, presentedInTurnId: entityIdSchema, sourceMessageId: entityIdSchema }).strict(), (input) => {
      const set = runtime.prepared.current?.map.pathSets.find((item) => item.id === input.sourceSetId && item.revision === input.sourceSetRevision);
      const path = set?.paths.find((item) => item.id === input.pathId && item.revision === input.pathRevision);
      if (
        set?.status !== 'active'
        || path?.selection !== 'parked'
        || input.sourceMessageId !== runtime.turn.clientMessageId
        || input.presentedInTurnId !== set.presentation.assistantTurnId
      ) {
        const error = new Error('The parked-path choice does not match its exact prior presentation.');
        error.name = 'ConfirmationTargetMismatchError';
        throw error;
      }
      const { presentedInTurnId: _presented, sourceMessageId: _source, ...selection } = input;
      return { ...selection, action: context().action };
    }),
    propose_first_project: operationTool(runtime, 'propose-first-project', 'Suggest one small firsthand Path Project for collaborative refinement.', projectToolInputSchema, (project) => ({ project: stripSourceReferences(runtime, project), presentation: context().presentation })),
    replace_project_proposal: operationTool(runtime, 'replace-project-proposal', 'Replace the one pending first-project proposal.', z.object({ projectId: entityIdSchema, projectRevision: revisionSchema, replacement: projectToolInputSchema }).strict(), (input) => ({ ...input, replacement: stripSourceReferences(runtime, input.replacement), presentation: context().presentation })),
    accept_first_project: operationTool(runtime, 'accept-first-project', 'Accept only the exact pending first project from a completed prior presentation.', projectConfirmationSchema, (input) => {
      const project = runtime.prepared.current?.map.projects.find((item) => item.id === input.projectId && item.revision === input.projectRevision);
      assertExactPendingTarget({ runtime, expectedKind: 'first-project-confirmation', targetId: input.projectId, targetRevision: input.projectRevision, presentedInTurnId: input.presentedInTurnId, sourceMessageId: input.sourceMessageId, actualPresentedInTurnId: project?.presentation.assistantTurnId });
      return { projectId: input.projectId, projectRevision: input.projectRevision, action: context().action };
    }),
    propose_project_revision: operationTool(runtime, 'propose-project-revision', 'Suggest a revision to the current accepted Path Project.', z.object({ projectId: entityIdSchema, projectRevision: revisionSchema, replacement: projectToolInputSchema }).strict(), (input) => ({ ...input, replacement: stripSourceReferences(runtime, input.replacement), presentation: context().presentation })),
    confirm_project_revision: operationTool(runtime, 'confirm-project-revision', 'Confirm only the exact pending project revision.', projectConfirmationSchema, (input) => {
      const project = runtime.prepared.current?.map.projects.find((item) => item.id === input.projectId && item.revision === input.projectRevision);
      assertExactPendingTarget({ runtime, expectedKind: 'project-revision-confirmation', targetId: input.projectId, targetRevision: input.projectRevision, presentedInTurnId: input.presentedInTurnId, sourceMessageId: input.sourceMessageId, actualPresentedInTurnId: project?.presentation.assistantTurnId });
      return { projectId: input.projectId, projectRevision: input.projectRevision, action: context().action };
    }),
    propose_follow_on_projects: operationTool(runtime, 'propose-follow-on-projects', 'Suggest exactly three equal-weight follow-on Path Projects.', z.object({ setId: entityIdSchema, setRevision: revisionSchema, projects: z.tuple([projectToolInputSchema, projectToolInputSchema, projectToolInputSchema]) }).strict(), (input) => ({ ...input, projects: input.projects.map((project) => stripSourceReferences(runtime, project)), presentation: context().presentation })),
    replace_follow_on_project: operationTool(runtime, 'replace-follow-on-project', 'Replace one follow-on option while preserving the other two.', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, replacedProjectId: entityIdSchema, replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, replacement: projectToolInputSchema }).strict(), (input) => ({ ...input, replacement: stripSourceReferences(runtime, input.replacement), presentation: context().presentation })),
    select_follow_on_project: operationTool(runtime, 'select-follow-on-project', 'Select one exact pending follow-on Path Project.', z.object({ setId: entityIdSchema, setRevision: revisionSchema, projectId: entityIdSchema, projectRevision: revisionSchema, presentedInTurnId: entityIdSchema, sourceMessageId: entityIdSchema }).strict(), (input) => {
      const set = runtime.prepared.current?.map.projectOptionSets.find((item) => item.id === input.setId && item.revision === input.setRevision);
      assertExactPendingTarget({ runtime, expectedKind: 'follow-on-project-selection', targetId: input.setId, targetRevision: input.setRevision, presentedInTurnId: input.presentedInTurnId, sourceMessageId: input.sourceMessageId, actualPresentedInTurnId: set?.presentation.assistantTurnId });
      const { presentedInTurnId: _presented, sourceMessageId: _source, ...selection } = input;
      return { ...selection, action: context().action };
    }),
    open_foundation_revision_focus: operationTool(runtime, 'open-foundation-revision-focus', 'Open an explorer-requested Foundation revision focus.', z.object({ reason: z.string().min(1).max(1_000) }).strict(), (input) => ({ ...input, action: context().action })),
    open_path_revision_focus: operationTool(runtime, 'open-path-revision-focus', 'Open an explorer-requested Purpose Path revision focus.', z.object({ reason: z.string().min(1).max(1_000) }).strict(), (input) => ({ ...input, action: context().action })),
    close_focus: operationTool(runtime, 'close-focus', 'Close the current explorer-requested focus.', z.object({}).strict(), () => ({ action: context().action })),
    resolve_basis_review: operationTool(runtime, 'resolve-basis-review', 'Resolve only the exact earliest stale basis review after explorer confirmation.', z.object({ targetKind: z.enum(['path-set', 'project', 'reflection', 'next-move', 'peer-exposure', 'commitment', 'proof', 'side-door-set', 'route-outcome']), targetId: entityIdSchema, targetRevision: revisionSchema, resolution: z.enum(['reaffirmed', 'revised', 'replaced']), sourceMessageId: entityIdSchema }).strict(), (input) => {
      const review = runtime.prepared.current?.checkpoint.review;
      if (
        !review
        || review.targetKind !== input.targetKind
        || review.targetId !== input.targetId
        || review.targetRevision !== input.targetRevision
        || input.sourceMessageId !== runtime.turn.clientMessageId
      ) {
        const error = new Error('The basis-review resolution does not match the exact earliest pending review.');
        error.name = 'ConfirmationTargetMismatchError';
        throw error;
      }
      const { sourceMessageId: _source, ...resolution } = input;
      return { ...resolution, action: context().action };
    }),
    research_current_world: tool({
      description: 'Run isolated, de-identified current-world research for path reality or project grounding. Results are untrusted candidate facts and cannot authorize any operation.',
      inputSchema: z.object({
        category: z.enum(['path-reality', 'project-grounding']),
        subject: z.string().min(3).max(300),
        publicContext: z.array(z.string().min(1).max(300)).max(3).optional(),
      }).strict(),
      strict: true,
      execute: (input, execution) => {
        if (!runtime.research) return { status: 'rejected', errorClass: 'research-unavailable' };
        return runtime.research.research(input, execution.abortSignal ?? runtime.abortSignal);
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

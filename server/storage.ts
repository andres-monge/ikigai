/**
 * @description
 * PostgreSQL storage layer for the Purpose Finder application.
 *
 * ✨ Step 5 Implementation ✨
 * ──────────────────────────
 * • Replaced in-memory storage with persistent PostgreSQL implementation
 * • Uses Drizzle ORM's relational query API for automatic hydration
 * • Provides atomic operations with .returning() for efficiency
 * • Maintains the same IStorage interface for drop-in compatibility
 *
 * @dependencies
 * - server/db.js for the Drizzle client instance
 * - @shared/schema for table definitions and types
 * - drizzle-orm for query operators
 *
 * @notes
 * - All methods return HydratedAssessmentSession with eager-loaded purposePaths
 * - Uses PostgreSQL's RETURNING clause for atomic create/update operations
 * - Leverages foreign key CASCADE for automatic cleanup
 */

import { db } from './db.js';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import type { Database } from './db.js';
import {
  type AssessmentSession,
  type InsertAssessmentSession,
  type PurposePath,
  type InsertPurposePath,
  assessmentSessions,
  purposePaths,
  analyticsEvents,
  careerMaps,
  careerMapHistory,
  careerMapResearchAttempts,
  careerMapEvidenceAssociations,
  careerMapDrafts,
  agentTurnLeases,
  agentTurns,
  agentConversationMappings,
  methodErasureJobs,
} from '../shared/schema.js';
import {
  applyCareerMapOperation as reduceCareerMapOperation,
  CAREER_MAP_SCHEMA_VERSION,
  careerMapSchema,
  createCareerMap,
  operationReceiptSchema,
  opaqueClientMessageIdSchema,
  pathProjectInputSchema,
  peerExposureInputSchema,
  purposePathInputSchema,
  amendedResearchAttemptSchema,
  amendedCitedResearchSourceSchema,
  normalizeResearchClaim,
  persistedResearchAttemptSchema,
  researchSourceAssociationSchema,
  sideDoorInputSchema,
  userActionProvenanceSchema,
  deriveMethodCheckpoint,
  type ApplyCareerMapResult,
  type CareerMap,
  type CareerMapOperation,
  type ResearchAttempt,
  type ResearchSourceAssociation,
  type ModelPresentation,
  type SourceProvenance,
  type UserActionProvenance,
} from '../shared/career-map/index.js';

export const CURRENT_CAREER_MAP_SCHEMA_VERSION = CAREER_MAP_SCHEMA_VERSION;
export const DEFAULT_TURN_LEASE_MS = 360_000;
const METHOD_OWNER_LOCK_SEED = 20260831;

export type RepairReason =
  | 'unsupported-schema'
  | 'invalid-document'
  | 'owner-mismatch'
  | 'row-document-mismatch'
  | 'history-mismatch'
  | 'research-mismatch'
  | 'evidence-association-mismatch';

export type CareerMapLoadResult =
  | { status: 'not-found' }
  | { status: 'erasure-pending' }
  | { status: 'ready'; map: CareerMap }
  | {
      status: 'repair-required';
      reason: RepairReason;
      schemaVersion: number;
      revision: number;
    };

export type PersistCareerMapResult =
  | ApplyCareerMapResult
  | Extract<CareerMapLoadResult, { status: 'repair-required' }>
  | Extract<CareerMapLoadResult, { status: 'erasure-pending' }>
  | { status: 'lease-lost'; message: string };

export type AgentTurnStatus = 'pending' | 'completed' | 'cancelled' | 'failed';
export type MethodTurnOrigin = 'agent-turn' | 'workspace-action';

export interface AgentTurnRecord {
  turnId: string;
  userId: string;
  clientMessageId: string;
  requestFingerprint: string;
  origin: MethodTurnOrigin;
  leaseId: string;
  status: AgentTurnStatus;
  terminalResult: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  terminalAt: Date | null;
}

export interface ConversationProvisioningRecord {
  userId: string;
  turnId: string;
  conversationId: string;
}

export interface ConversationProvisioningCleanupClaim extends ConversationProvisioningRecord {
  claimId: string;
}

const methodPersistenceContextMarker = Symbol('method-persistence-context');

export type MethodPersistenceContext = {
  readonly [methodPersistenceContextMarker]: true;
  readonly origin: MethodTurnOrigin;
  readonly turnId: string;
  readonly leaseId: string;
  readonly clientMessageId: string;
  readonly requestFingerprint: string;
  readonly action: UserActionProvenance;
  readonly presentation: ModelPresentation;
};

export type DurableMethodTurnIdentity = Pick<
  AgentTurnRecord,
  'turnId' | 'leaseId' | 'clientMessageId' | 'requestFingerprint' | 'origin'
>;

export type MethodProvenanceTiming = {
  turnSequence: number;
  occurredAt: string;
};

/**
 * Derive ordering from the already-validated canonical map, never from a
 * serverless instance clock. One fixed value is used for the whole durable
 * turn, so same-turn presentation/confirmation still shares a sequence and is
 * rejected while every later leased turn is strictly after canonical state.
 */
export function nextMethodTurnSequence(map: CareerMap): number {
  let maximum = map.revision;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'turnSequence' && typeof child === 'number' && Number.isSafeInteger(child)) {
        maximum = Math.max(maximum, child);
      } else {
        visit(child);
      }
    }
  };
  visit(map);
  if (!Number.isSafeInteger(maximum) || maximum >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Canonical Method turn sequence is exhausted.');
  }
  return maximum + 1;
}

function createMethodPersistenceContext(
  origin: MethodPersistenceContext['origin'],
  turn: DurableMethodTurnIdentity,
  timing: MethodProvenanceTiming,
): MethodPersistenceContext {
  if (turn.origin !== origin) {
    throw new Error(`Cannot derive ${origin} provenance from a durable ${turn.origin} turn.`);
  }
  const action = userActionProvenanceSchema.parse({
    kind: origin === 'workspace-action' ? 'ui-action' : 'user-message',
    actionId: turn.clientMessageId,
    turnId: turn.turnId,
    turnSequence: timing.turnSequence,
    occurredAt: timing.occurredAt,
  });
  return Object.freeze({
    [methodPersistenceContextMarker]: true as const,
    ...turn,
    origin,
    action,
    presentation: {
      kind: 'model-presentation' as const,
      assistantTurnId: turn.turnId,
      turnSequence: timing.turnSequence,
      completed: true as const,
      presentedAt: timing.occurredAt,
    },
  });
}

export function createAgentTurnPersistenceContext(
  turn: DurableMethodTurnIdentity,
  timing: MethodProvenanceTiming,
): MethodPersistenceContext {
  return createMethodPersistenceContext('agent-turn', turn, timing);
}

export function createWorkspaceActionPersistenceContext(
  turn: DurableMethodTurnIdentity,
  timing: MethodProvenanceTiming,
): MethodPersistenceContext {
  return createMethodPersistenceContext('workspace-action', turn, timing);
}

export type CareerMapHistoryRecord = typeof careerMapHistory.$inferSelect;
export type AgentTurnLeaseRecord = typeof agentTurnLeases.$inferSelect;
export type MethodErasureJobRecord = typeof methodErasureJobs.$inferSelect;
export type ResearchSourceAssociationRecord = typeof careerMapEvidenceAssociations.$inferSelect;

export interface CareerMapIntegrityAudit {
  totalMaps: number;
  invalidRecords: Array<{ userId: string; reason: RepairReason }>;
  orphanHistory: number;
  orphanResearchAttempts: number;
  invalidResearchAttempts: number;
  orphanEvidenceAssociations: number;
  invalidEvidenceAssociations: number;
  orphanDrafts: number;
  orphanTurns: number;
  orphanLeases: number;
  orphanConversationMappings: number;
  invalidLeases: number;
  pendingTurnsWithoutLease: number;
  pendingErasureJobs: number;
  zeroInvalid: boolean;
}

export type BeginAgentTurnResult =
  | { status: 'started'; turn: AgentTurnRecord; shouldInvokeModel: boolean; reclaimedTurnId?: string }
  | { status: 'attached'; turn: AgentTurnRecord; shouldInvokeModel: false }
  | { status: 'terminal'; turn: AgentTurnRecord; shouldInvokeModel: false }
  | {
      status: 'conflict';
      activeTurnId: string;
      retryAfter: Date;
      waitReason?: 'conversation-provisioning';
    }
  | { status: 'message-id-reused'; turn: AgentTurnRecord }
  | { status: 'map-required' }
  | { status: 'erasure-pending' }
  | Extract<CareerMapLoadResult, { status: 'repair-required' }>;

export class MethodErasurePendingError extends Error {
  readonly code = 'method-erasure-pending';

  constructor() {
    super('Method data erasure is pending; new product writes are disabled.');
    this.name = 'MethodErasurePendingError';
  }
}

export class CareerMapRepairRequiredError extends Error {
  readonly code = 'repair-required';
  readonly result: Extract<CareerMapLoadResult, { status: 'repair-required' }>;

  constructor(result: Extract<CareerMapLoadResult, { status: 'repair-required' }>) {
    super('Career map repair is required; Method writes are disabled.');
    this.name = 'CareerMapRepairRequiredError';
    this.result = result;
  }
}

export class TurnLeaseLostError extends Error {
  readonly code = 'turn-lease-lost';

  constructor() {
    super('The turn lease expired or was reclaimed.');
    this.name = 'TurnLeaseLostError';
  }
}

export class ConversationMappingConflictError extends Error {
  readonly code = 'conversation-mapping-conflict';

  constructor() {
    super('A different Conversation is already bound to this owner.');
    this.name = 'ConversationMappingConflictError';
  }
}

export class ResearchAttemptConflictError extends Error {
  readonly code = 'research-attempt-conflict';

  constructor() {
    super('Research attempt identity was reused with different content.');
    this.name = 'ResearchAttemptConflictError';
  }
}

export class ResearchAttemptSourceError extends Error {
  readonly code = 'invalid-research-source';

  constructor() {
    super('Research attempts may persist only server-resolved cited-research sources.');
    this.name = 'ResearchAttemptSourceError';
  }
}

export class TurnLeaseIdentityConflictError extends Error {
  readonly code = 'turn-lease-identity-conflict';

  constructor() {
    super('Turn lease identity was already used by this explorer.');
    this.name = 'TurnLeaseIdentityConflictError';
  }
}

export class MethodOwnerBusyError extends Error {
  readonly code = 'method-owner-busy';
  readonly retryable = true;

  constructor() {
    super('The Method workspace is busy; retry after the current operation finishes.');
    this.name = 'MethodOwnerBusyError';
  }
}

export interface MethodErasureProvider {
  /**
   * Exhaustively cancels/awaits active response work, deletes Conversation items,
   * then deletes the Conversation. Repeated calls, including an already-absent
   * provider object, must resolve successfully so local marker retries cannot lock
   * Method writes forever after a provider-side success.
   */
  deleteConversationItemsAndConversation(conversationId: string): Promise<void>;
}

export type StorageFaultStage =
  | 'before-research-attempt-insert'
  | 'before-turn-completion-update'
  | 'before-map-update'
  | 'after-evidence-association-before-history'
  | 'after-map-update-before-history'
  | 'before-commit'
  | 'before-erasure-marker-delete';

export interface PostgresStorageOptions {
  database?: Database;
  now?: () => Date;
  faultInjector?: (stage: StorageFaultStage) => void | Promise<void>;
}

/* ------------------------------------------------------------------ */
/*                          Helper - New Types                        */
/* ------------------------------------------------------------------ */

/**
 * @interface HydratedAssessmentSession
 * A fully-resolved session that contains:
 *  • the base `AssessmentSession` columns
 *  • an array of all `PurposePath` rows belonging to the session
 */
export interface HydratedAssessmentSession extends AssessmentSession {
  /** All purpose paths for this session */
  purposePaths: PurposePath[];
}

/* ------------------------------------------------------------------ */
/*                         Storage Interface                          */
/* ------------------------------------------------------------------ */

/**
 * @interface IStorage
 * Contract all storage back-ends must follow.
 *
 *  • Return types that previously pointed to `AssessmentSession` are now
 *    `HydratedAssessmentSession` so the caller always receives the
 *    fully-joined data graph.
 */
export interface IStorage {
  // === Assessment Session Methods ===
  getAssessmentSessionById(
    id: number,
  ): Promise<HydratedAssessmentSession | undefined>;
  getAssessmentSessionBySessionId(
    sessionId: string,
  ): Promise<HydratedAssessmentSession | undefined>;
  createAssessmentSession(
    session: Omit<InsertAssessmentSession, "id">,
  ): Promise<HydratedAssessmentSession>;
  updateAssessmentSession(
    sessionId: string,
    updates: Partial<InsertAssessmentSession>,
  ): Promise<HydratedAssessmentSession | undefined>;

  // === Purpose Path Methods ===
  createPurposePath(path: Omit<InsertPurposePath, "id">): Promise<PurposePath>;
  deletePurposePathsByAssessmentId(assessmentId: number): Promise<void>;
  deletePurposePathById(id: number): Promise<boolean>;

  // === Session Management Methods ===
  deleteAssessmentSessionBySessionId(sessionId: string): Promise<boolean>;

  // === Analytics Methods ===
  logAnalyticsEvent(
    sessionId: string,
    eventType: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;

  // === Authenticated Method career-map methods ===
  loadCareerMap(userId: string): Promise<CareerMapLoadResult>;
  getOrCreateCareerMap(userId: string): Promise<CareerMapLoadResult>;
  persistCareerMapOperation(input: {
    userId: string;
    leaseId: string;
    context: MethodPersistenceContext;
    operation: CareerMapOperation;
    moduleVersion: string;
    abortSignal?: AbortSignal;
  }): Promise<PersistCareerMapResult>;
  listCareerMapHistory(userId: string): Promise<CareerMapHistoryRecord[]>;
  beginAgentTurn(input: {
    userId: string;
    clientMessageId: string;
    requestFingerprint: string;
    turnId: string;
    leaseId: string;
    leaseDurationMs?: number;
  }): Promise<BeginAgentTurnResult>;
  beginWorkspaceActionTurn(input: {
    userId: string;
    clientMessageId: string;
    requestFingerprint: string;
    turnId: string;
    leaseId: string;
    leaseDurationMs?: number;
  }): Promise<BeginAgentTurnResult>;
  getAgentTurn(userId: string, clientMessageId: string): Promise<AgentTurnRecord | undefined>;
  listAgentTurns(userId: string): Promise<AgentTurnRecord[]>;
  backfillAgentTurnDisplayProjection(input: {
    userId: string;
    turnId: string;
    displayProjection: { userItemId: string; assistantItemIds: string[] };
  }): Promise<void>;
  getTurnLease(userId: string): Promise<AgentTurnLeaseRecord | undefined>;
  completeAgentTurn(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    result?: Record<string, unknown>;
    abortSignal?: AbortSignal;
  }): Promise<AgentTurnRecord | undefined>;
  cancelAgentTurn(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    result?: Record<string, unknown>;
  }): Promise<AgentTurnRecord | undefined>;
  failAgentTurn(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    errorClass: string;
    result?: Record<string, unknown>;
  }): Promise<AgentTurnRecord | undefined>;
  releaseTurnLease(userId: string, turnId: string, leaseId: string): Promise<boolean>;
  recordResearchAttempt(
    userId: string,
    leaseId: string,
    input: unknown,
    abortSignal?: AbortSignal,
  ): Promise<ResearchAttempt>;
  listResearchAttempts(userId: string): Promise<ResearchAttempt[]>;
  listResearchSourceAssociations(userId: string): Promise<ResearchSourceAssociationRecord[]>;
  saveCareerMapDraft(input: {
    userId: string;
    leaseId: string;
    id: string;
    kind: string;
    content: unknown;
  }): Promise<void>;
  setConversationMapping(userId: string, leaseId: string, conversationId: string): Promise<void>;
  getConversationMapping(userId: string): Promise<string | undefined>;
  recordConversationProvisioning(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    conversationId: string;
  }): Promise<void>;
  listPendingConversationProvisioning(userId: string): Promise<ConversationProvisioningRecord[]>;
  resolveConversationProvisioning(input: ConversationProvisioningRecord): Promise<void>;
  claimConversationProvisioningCleanup(
    userId: string,
    claimId: string,
  ): Promise<ConversationProvisioningCleanupClaim | undefined>;
  completeConversationProvisioningCleanup(
    input: ConversationProvisioningCleanupClaim,
  ): Promise<void>;
  releaseConversationProvisioningCleanup(
    input: ConversationProvisioningCleanupClaim,
  ): Promise<void>;
  eraseMethodData(
    userId: string,
    provider?: MethodErasureProvider,
  ): Promise<{ status: 'complete' | 'pending-provider'; errorClass?: string }>;
  getMethodErasureJob(userId: string): Promise<MethodErasureJobRecord | undefined>;
  auditCareerMapIntegrity(): Promise<CareerMapIntegrityAudit>;
}

type CareerMapRow = typeof careerMaps.$inferSelect;
type CareerMapHistoryRow = CareerMapHistoryRecord;
type CareerMapResearchRow = typeof careerMapResearchAttempts.$inferSelect;
type CareerMapEvidenceAssociationRow = typeof careerMapEvidenceAssociations.$inferSelect;
type AgentTurnRow = typeof agentTurns.$inferSelect;
type StorageTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

function asAgentTurnRecord(row: AgentTurnRow): AgentTurnRecord {
  return {
    ...row,
    origin: row.origin as MethodTurnOrigin,
    status: row.status as AgentTurnStatus,
    terminalResult: row.terminalResult ?? null,
  };
}

const CONVERSATION_CLEANUP_LIST_PREFIX = 'u5-cleanup-list:';
const CONVERSATION_CLEANUP_CLAIM_MS = 60_000;

function pendingProvisioningConversationIds(rows: Array<{ terminalResult: unknown }>): string[] {
  return rows.flatMap((row) => {
    if (!row.terminalResult || typeof row.terminalResult !== 'object') return [];
    const marker = (row.terminalResult as Record<string, unknown>).conversationProvisioning;
    if (!marker || typeof marker !== 'object') return [];
    const id = (marker as Record<string, unknown>).conversationId;
    return typeof id === 'string' && id.length > 0 && id.length <= 200 ? [id] : [];
  });
}

function encodeConversationCleanupIds(ids: readonly string[]): string | null {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return null;
  return unique.length === 1
    ? unique[0]
    : `${CONVERSATION_CLEANUP_LIST_PREFIX}${JSON.stringify(unique)}`;
}

function decodeConversationCleanupIds(value: string | null): string[] {
  if (!value) return [];
  if (!value.startsWith(CONVERSATION_CLEANUP_LIST_PREFIX)) return [value];
  try {
    const parsed = JSON.parse(value.slice(CONVERSATION_CLEANUP_LIST_PREFIX.length));
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200)
      : [];
  } catch {
    return [];
  }
}

function preserveConversationProvisioning(
  terminalResult: unknown,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const current = terminalResult && typeof terminalResult === 'object'
    ? terminalResult as Record<string, unknown>
    : {};
  return current.conversationProvisioning
    ? { ...next, conversationProvisioning: current.conversationProvisioning }
    : next;
}

function confirmationPresentationTurnId(
  map: CareerMap,
  operation: CareerMapOperation,
): string | undefined {
  switch (operation.type) {
    case 'confirm-why':
      return exactConfirmationTurn(map.foundation.whyRevisions, operation.payload.whyId, operation.payload.whyRevision);
    case 'select-purpose-path':
    case 'confirm-purpose-path-revision':
      return exactConfirmationTurn(map.pathSets, operation.payload.setId, operation.payload.setRevision);
    case 'choose-parked-purpose-path':
      return exactConfirmationTurn(map.pathSets, operation.payload.replacementSetId, operation.payload.replacementSetRevision);
    case 'accept-first-project':
    case 'confirm-project-revision':
      return exactConfirmationTurn(map.projects, operation.payload.projectId, operation.payload.projectRevision);
    case 'select-follow-on-project':
      return exactConfirmationTurn(map.projectOptionSets, operation.payload.setId, operation.payload.setRevision);
    case 'confirm-peer-exposure':
      return exactConfirmationTurn(map.peerExposures, operation.payload.exposureId, operation.payload.exposureRevision);
    case 'confirm-proof-inventory':
      return exactConfirmationTurn(map.proofRevisions, operation.payload.proofId, operation.payload.proofRevision);
    case 'select-side-door':
      return exactConfirmationTurn(map.sideDoorSets, operation.payload.setId, operation.payload.setRevision);
    default:
      return undefined;
  }
}

function exactConfirmationTurn(
  records: Array<{ id: string; revision: number; confirmation?: { presentedInTurnId: string } }>,
  id: string,
  revision: number,
): string | undefined {
  return records.find((record) => record.id === id && record.revision === revision)
    ?.confirmation?.presentedInTurnId;
}

type CitedResearchSource = Extract<SourceProvenance, { kind: 'cited-research' }>;
type AmendedCitedResearchSource = Extract<CitedResearchSource, { bindingVersion: 2 }>;

interface SourceClaim {
  source: SourceProvenance;
  parent: Record<string, unknown> & { id: string; revision: number };
}

function collectSourceClaims(value: unknown): SourceClaim[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(collectSourceClaims);
  const record = value as Record<string, unknown>;
  const direct = typeof record.id === 'string'
    && typeof record.revision === 'number'
    && Array.isArray(record.sources)
    ? record.sources
      .filter((source): source is SourceProvenance => Boolean(source)
        && typeof source === 'object'
        && ['cited-research', 'user-supplied-source'].includes(
          String((source as Record<string, unknown>).kind),
        ))
      .map((source) => ({
        source,
        parent: record as Record<string, unknown> & { id: string; revision: number },
      }))
    : [];
  return [
    ...direct,
    ...Object.entries(record)
      .filter(([key]) => key !== 'sources')
      .flatMap(([, nested]) => collectSourceClaims(nested)),
  ];
}

function collectCitedSourceClaims(value: unknown): Array<SourceClaim & { source: CitedResearchSource }> {
  return collectSourceClaims(value)
    .filter((claim): claim is SourceClaim & { source: CitedResearchSource } => (
      claim.source.kind === 'cited-research'
    ));
}

function collectOperationActions(value: unknown, insideSources = false): UserActionProvenance[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectOperationActions(item, insideSources));
  const record = value as Record<string, unknown>;
  if (!insideSources) {
    const parsed = userActionProvenanceSchema.safeParse(record);
    if (parsed.success) return [parsed.data];
  }
  return Object.entries(record).flatMap(([key, nested]) => (
    collectOperationActions(nested, insideSources || key === 'sources')
  ));
}

function collectOperationPresentations(value: unknown): ModelPresentation[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(collectOperationPresentations);
  const record = value as Record<string, unknown>;
  if (record.kind === 'model-presentation') return [record as ModelPresentation];
  return Object.values(record).flatMap(collectOperationPresentations);
}

function sameProvenance(left: unknown, right: unknown): boolean {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  };
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function citedSourceIdentity(source: CitedResearchSource): string {
  const base = {
    sourceHandle: source.sourceHandle,
    support: source.support,
    providerResultId: source.providerResultId ?? null,
    url: source.url,
    retrievedAt: source.retrievedAt,
    title: source.title ?? null,
    excerpt: source.excerpt ?? null,
  };
  return JSON.stringify(isAmendedCitedSource(source) ? {
    ...base,
    bindingVersion: source.bindingVersion,
    providerCallId: source.providerCallId,
    targetId: source.targetId,
    targetRevision: source.targetRevision,
    canonicalField: source.canonicalField,
    exactClaim: source.exactClaim,
    citation: source.citation,
  } : base);
}

function isAmendedCitedSource(source: CitedResearchSource): source is AmendedCitedResearchSource {
  return 'bindingVersion' in source && source.bindingVersion === 2;
}

const sourceBearingInputSchemas = [
  purposePathInputSchema.strip(),
  pathProjectInputSchema.strip(),
  peerExposureInputSchema.strip(),
  sideDoorInputSchema.strip(),
] as const;

const sourceBearingFields = [
  { prefix: 'purposePath', schema: purposePathInputSchema.strip() },
  { prefix: 'pathProject', schema: pathProjectInputSchema.strip() },
  { prefix: 'peerExposure', schema: peerExposureInputSchema.strip() },
  { prefix: 'sideDoor', schema: sideDoorInputSchema.strip() },
] as const;

function citedSourceMatchesCanonicalField(
  claim: SourceClaim & { source: AmendedCitedResearchSource },
  expectedRevision: number,
): boolean {
  if (claim.parent.id !== claim.source.targetId
    || claim.source.targetRevision !== expectedRevision
  ) return false;
  for (const candidate of sourceBearingFields) {
    const parsed = candidate.schema.safeParse(claim.parent);
    if (!parsed.success || !claim.source.canonicalField.startsWith(`${candidate.prefix}.`)) continue;
    const field = claim.source.canonicalField.slice(candidate.prefix.length + 1);
    if (field.includes('.')) return false;
    const value = (parsed.data as Record<string, unknown>)[field];
    if (candidate.prefix === 'purposePath' && field === 'evidence' && Array.isArray(value)) {
      return value.some((item) => typeof item === 'string'
        && normalizeResearchClaim(item) === claim.source.exactClaim);
    }
    return typeof value === 'string'
      && normalizeResearchClaim(value).includes(claim.source.exactClaim);
  }
  return false;
}

function sourceBearingInputSnapshot(value: unknown): string | undefined {
  for (const schema of sourceBearingInputSchemas) {
    const parsed = schema.safeParse(value);
    if (parsed.success) return JSON.stringify(parsed.data);
  }
  return undefined;
}

function sourceBearingInputIdentity(value: { id: string; revision: number }): string | undefined {
  const snapshot = sourceBearingInputSnapshot(value);
  return snapshot ? JSON.stringify([value.id, value.revision, snapshot]) : undefined;
}

function canonicalSourceClaimIdentities(map: CareerMap): Set<string> {
  const candidates = [
    ...map.pathSets.flatMap((set) => set.paths),
    ...map.projects,
    ...map.projectOptionSets.flatMap((set) => set.projects),
    ...map.peerExposures,
    ...map.sideDoorSets.flatMap((set) => set.doors),
  ];
  return new Set(candidates.flatMap((candidate) => {
    const identity = sourceBearingInputIdentity(candidate);
    return identity ? [identity] : [];
  }));
}

function historyMatchesMap(
  map: CareerMap,
  history: CareerMapHistoryRow[],
): boolean {
  if (history.length !== map.revision || history.length !== map.operationHistory.length) {
    return false;
  }
  return history.every((row, index) => {
    const receipt = map.operationHistory[index];
    const persistedResult = operationReceiptSchema.safeParse(row.result);
    const confirmationIsValid = row.confirmationProvenance === null
      || userActionProvenanceSchema.safeParse(row.confirmationProvenance).success;
    if (!persistedResult.success || !confirmationIsValid) return false;
    return row.userId === map.explorerId
      && row.operationSourceId === receipt.sourceId
      && row.operationType === receipt.operationType
      && row.payloadFingerprint === receipt.payloadFingerprint
      && row.baseRevision === index
      && row.resultRevision === receipt.resultRevision
      && row.baseRevision + 1 === row.resultRevision
      && sameProvenance(persistedResult.data, receipt)
      && sameProvenance(row.confirmationProvenance, receipt.confirmationProvenance)
      && row.moduleVersion === receipt.moduleVersion
      && row.committedAt.getTime() === new Date(receipt.committedAt).getTime();
  });
}

function researchMatchesMap(map: CareerMap, researchRows: CareerMapResearchRow[]): boolean {
  const persistedSources = new Set<string>();
  for (const row of researchRows) {
    const parsed = persistedResearchAttemptSchema.safeParse(row.attempt);
    if (!parsed.success || parsed.data.id !== row.id) return false;
    if ('schemaVersion' in parsed.data || parsed.data.status !== 'succeeded') continue;
    for (const source of parsed.data.sources) {
      if (source.kind === 'cited-research') persistedSources.add(citedSourceIdentity(source));
    }
  }
  return collectCitedSourceClaims(map)
    .filter((claim) => !isAmendedCitedSource(claim.source))
    .every((claim) => persistedSources.has(citedSourceIdentity(claim.source)));
}

function evidenceAssociationsMatchMap(
  map: CareerMap,
  historyRows: CareerMapHistoryRow[],
  researchRows: CareerMapResearchRow[],
  associationRows: CareerMapEvidenceAssociationRow[],
): boolean {
  const amendedAttempts = new Map(researchRows.flatMap((row) => {
    const parsed = amendedResearchAttemptSchema.safeParse(row.attempt);
    return parsed.success && parsed.data.id === row.id
      ? [[row.id, { row, attempt: parsed.data }] as const]
      : [];
  }));
  const canonicalClaimsBySource = new Map<string, Array<SourceClaim & {
    source: AmendedCitedResearchSource;
  }>>();
  for (const claim of collectCitedSourceClaims(map)) {
    if (!isAmendedCitedSource(claim.source)) continue;
    const identity = citedSourceIdentity(claim.source);
    canonicalClaimsBySource.set(identity, [
      ...(canonicalClaimsBySource.get(identity) ?? []),
      { ...claim, source: claim.source },
    ]);
  }
  const associatedSources = new Set<string>();

  for (const row of associationRows) {
    const parsed = researchSourceAssociationSchema.safeParse(row.association);
    if (!parsed.success) return false;
    const association = parsed.data;
    const attemptRecord = amendedAttempts.get(row.attemptId);
    const history = historyRows.find((entry) => entry.resultRevision === row.resultRevision);
    const canonicalClaims = canonicalClaimsBySource.get(citedSourceIdentity(association));
    if (!attemptRecord
      || attemptRecord.row.turnId !== row.turnId
      || attemptRecord.row.leaseId !== row.leaseId
      || attemptRecord.attempt.status !== 'succeeded'
      || row.sourceHandle !== association.sourceHandle
      || row.operationSourceId !== association.operationSourceId
      || row.resultRevision !== association.resultRevision
      || row.attemptId !== association.attemptId
      || history?.operationSourceId !== association.operationSourceId
      || history.moduleVersion !== association.moduleVersion
      || attemptRecord.attempt.checkpoint !== association.checkpoint
      || attemptRecord.attempt.moduleVersion !== association.moduleVersion
      || !attemptRecord.attempt.sources.some(
        (source) => citedSourceIdentity(source) === citedSourceIdentity(association),
      )
      || !canonicalClaims
      || canonicalClaims.some((claim) => !citedSourceMatchesCanonicalField(
        claim,
        row.resultRevision - 1,
      ))
    ) return false;
    associatedSources.add(citedSourceIdentity(association));
  }

  return [...canonicalClaimsBySource.keys()].every((identity) => associatedSources.has(identity));
}

function validateCareerMapRow(
  row: CareerMapRow,
  history: CareerMapHistoryRow[],
  researchRows: CareerMapResearchRow[],
  associationRows: CareerMapEvidenceAssociationRow[],
): Extract<CareerMapLoadResult, { status: 'ready' | 'repair-required' }> {
  if (row.schemaVersion !== CURRENT_CAREER_MAP_SCHEMA_VERSION) {
    return {
      status: 'repair-required',
      reason: 'unsupported-schema',
      schemaVersion: row.schemaVersion,
      revision: row.revision,
    };
  }
  const parsed = careerMapSchema.safeParse(row.document);
  if (!parsed.success) {
    return {
      status: 'repair-required',
      reason: 'invalid-document',
      schemaVersion: row.schemaVersion,
      revision: row.revision,
    };
  }
  if (parsed.data.explorerId !== row.userId) {
    return {
      status: 'repair-required',
      reason: 'owner-mismatch',
      schemaVersion: row.schemaVersion,
      revision: row.revision,
    };
  }
  if (parsed.data.schemaVersion !== row.schemaVersion || parsed.data.revision !== row.revision) {
    return {
      status: 'repair-required',
      reason: 'row-document-mismatch',
      schemaVersion: row.schemaVersion,
      revision: row.revision,
    };
  }
  if (!historyMatchesMap(parsed.data, history)) {
    return {
      status: 'repair-required',
      reason: 'history-mismatch',
      schemaVersion: row.schemaVersion,
      revision: row.revision,
    };
  }
  if (!researchMatchesMap(parsed.data, researchRows)) {
    return {
      status: 'repair-required',
      reason: 'research-mismatch',
      schemaVersion: row.schemaVersion,
      revision: row.revision,
    };
  }
  if (!evidenceAssociationsMatchMap(parsed.data, history, researchRows, associationRows)) {
    return {
      status: 'repair-required',
      reason: 'evidence-association-mismatch',
      schemaVersion: row.schemaVersion,
      revision: row.revision,
    };
  }
  // Repair is intentionally sticky. A reviewed repair must explicitly clear
  // this flag; merely making the JSON parse again must not resume model use.
  if (row.repairRequired) {
    return {
      status: 'repair-required',
      reason: 'invalid-document',
      schemaVersion: row.schemaVersion,
      revision: row.revision,
    };
  }
  return { status: 'ready', map: parsed.data };
}

async function validateCareerMapForWrite(
  transaction: StorageTransaction,
  userId: string,
  now: Date | (() => Date),
): Promise<Exclude<CareerMapLoadResult, { status: 'erasure-pending' }>> {
  const [row] = await transaction
    .select()
    .from(careerMaps)
    .where(eq(careerMaps.userId, userId));
  if (!row) return { status: 'not-found' };
  const history = await transaction
    .select()
    .from(careerMapHistory)
    .where(eq(careerMapHistory.userId, userId))
    .orderBy(asc(careerMapHistory.resultRevision));
  const research = await transaction
    .select()
    .from(careerMapResearchAttempts)
    .where(eq(careerMapResearchAttempts.userId, userId));
  const associations = await transaction
    .select()
    .from(careerMapEvidenceAssociations)
    .where(eq(careerMapEvidenceAssociations.userId, userId));
  const result = validateCareerMapRow(row, history, research, associations);
  if (result.status === 'repair-required' && !row.repairRequired) {
    await transaction
      .update(careerMaps)
      .set({ repairRequired: true, updatedAt: typeof now === 'function' ? now() : now })
      .where(eq(careerMaps.userId, userId));
  }
  return result;
}

async function lockMethodOwner(
  transaction: StorageTransaction,
  userId: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  const attempts = 25;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    throwIfPersistenceAborted(abortSignal);
    const result = await transaction.execute(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${userId}, ${METHOD_OWNER_LOCK_SEED})) as acquired`,
    );
    throwIfPersistenceAborted(abortSignal);
    const rows = Array.isArray(result)
      ? result
      : 'rows' in result && Array.isArray(result.rows)
        ? result.rows
        : [];
    if ((rows[0] as { acquired?: boolean } | undefined)?.acquired === true) return;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throwIfPersistenceAborted(abortSignal);
    }
  }
  throw new MethodOwnerBusyError();
}

function throwIfPersistenceAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The request was aborted.', 'AbortError');
}

async function assertCurrentWriteFence(
  transaction: StorageTransaction,
  userId: string,
  turnId: string,
  leaseId: string,
  now: Date,
): Promise<void> {
  const [erasure] = await transaction
    .select({ userId: methodErasureJobs.userId })
    .from(methodErasureJobs)
    .where(eq(methodErasureJobs.userId, userId));
  const [lease] = await transaction
    .select({ leaseId: agentTurnLeases.leaseId })
    .from(agentTurnLeases)
    .where(and(
      eq(agentTurnLeases.userId, userId),
      eq(agentTurnLeases.turnId, turnId),
      eq(agentTurnLeases.leaseId, leaseId),
      gt(agentTurnLeases.expiresAt, now),
    ));
  const [turn] = await transaction
    .select({ turnId: agentTurns.turnId })
    .from(agentTurns)
    .where(and(
      eq(agentTurns.userId, userId),
      eq(agentTurns.turnId, turnId),
      eq(agentTurns.leaseId, leaseId),
      eq(agentTurns.status, 'pending'),
    ));
  if (erasure || !lease || !turn) throw new TurnLeaseLostError();
}

function rowsByUserId<T extends { userId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const ownerRows = grouped.get(row.userId) ?? [];
    ownerRows.push(row);
    grouped.set(row.userId, ownerRows);
  }
  return grouped;
}

function turnLeaseIdentity(userId: string, turnId: string, leaseId: string): string {
  return JSON.stringify([userId, turnId, leaseId]);
}

/* ------------------------------------------------------------------ */
/*                         PostgresStorage Implementation             */
/* ------------------------------------------------------------------ */

export class PostgresStorage implements IStorage {
  private readonly database: Database;
  private readonly now: () => Date;
  private readonly faultInjector?: PostgresStorageOptions['faultInjector'];

  constructor(options: PostgresStorageOptions = {}) {
    this.database = options.database ?? db;
    this.now = options.now ?? (() => new Date());
    this.faultInjector = options.faultInjector;
  }

  /* ---------------- Assessment Session CRUD ---------------- */

  async getAssessmentSessionById(
    id: number,
  ): Promise<HydratedAssessmentSession | undefined> {
    const session = await this.database.query.assessmentSessions.findFirst({
      where: eq(assessmentSessions.id, id),
      with: { purposePaths: true }
    });
    return session as HydratedAssessmentSession | undefined;
  }

  async getAssessmentSessionBySessionId(
    sessionId: string,
  ): Promise<HydratedAssessmentSession | undefined> {
    const session = await this.database.query.assessmentSessions.findFirst({
      where: eq(assessmentSessions.sessionId, sessionId),
      with: { purposePaths: true }
    });
    return session as HydratedAssessmentSession | undefined;
  }

  async createAssessmentSession(
    insertSession: Omit<InsertAssessmentSession, "id">,
  ): Promise<HydratedAssessmentSession> {
    const now = new Date();
    const insertData = {
      sessionId: insertSession.sessionId,
      language: insertSession.language ?? 'en',
      responses: insertSession.responses as unknown,
      coreDriversAnalysis: insertSession.coreDriversAnalysis as unknown,
      chosenPathId: insertSession.chosenPathId ?? null,
      actionPlan: insertSession.actionPlan as unknown,
      createdAt: now,
      updatedAt: now,
    };
    
    const [created] = await this.database.insert(assessmentSessions)
      .values(insertData as typeof assessmentSessions.$inferInsert)
      .returning();

    // Return hydrated session by fetching with relations
    const hydrated = await this.getAssessmentSessionById(created.id);
    if (!hydrated) {
      throw new Error('Failed to create assessment session');
    }
    return hydrated;
  }

  async updateAssessmentSession(
    sessionId: string,
    updates: Partial<InsertAssessmentSession>,
  ): Promise<HydratedAssessmentSession | undefined> {
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    } as Record<string, unknown>;
    
    const [updated] = await this.database.update(assessmentSessions)
      .set(updateData)
      .where(eq(assessmentSessions.sessionId, sessionId))
      .returning();

    if (!updated) return undefined;

    // Return hydrated session by fetching with relations
    return this.getAssessmentSessionById(updated.id);
  }

  /* ---------------- Purpose Path CRUD ---------------- */

  async createPurposePath(
    insertPath: Omit<InsertPurposePath, "id">,
  ): Promise<PurposePath> {
    const [created] = await this.database.insert(purposePaths)
      .values({
        assessmentId: insertPath.assessmentId,
        title: insertPath.title,
        description: insertPath.description ?? null,
        actionStrategy: insertPath.actionStrategy ?? null,
        ikigaiAlignment: insertPath.ikigaiAlignment ?? {},
      })
      .returning();

    return created as PurposePath;
  }

  async deletePurposePathsByAssessmentId(assessmentId: number): Promise<void> {
    await this.database.delete(purposePaths)
      .where(eq(purposePaths.assessmentId, assessmentId));
  }

  async deletePurposePathById(id: number): Promise<boolean> {
    const [deleted] = await this.database.delete(purposePaths)
      .where(eq(purposePaths.id, id))
      .returning({ id: purposePaths.id });

    return !!deleted;
  }

  /* ---------------- Session Management ---------------- */

  async deleteAssessmentSessionBySessionId(sessionId: string): Promise<boolean> {
    const [deleted] = await this.database.delete(assessmentSessions)
      .where(eq(assessmentSessions.sessionId, sessionId))
      .returning({ id: assessmentSessions.id });

    return !!deleted;
  }

  /* ---------------- Analytics ---------------- */

  async logAnalyticsEvent(
    sessionId: string,
    eventType: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.database.insert(analyticsEvents).values({
      sessionId,
      eventType,
      metadata,
    });
  }

  /* ---------------- Authenticated Method career maps ---------------- */

  async loadCareerMap(userId: string): Promise<CareerMapLoadResult> {
    return this.database.transaction(async (tx) => {
      // A load that can make repair-required sticky must observe one atomic
      // map/history state, never the midpoint of a valid writer transaction.
      await lockMethodOwner(tx, userId);
      return validateCareerMapForWrite(tx, userId, this.now);
    });
  }

  async getOrCreateCareerMap(userId: string): Promise<CareerMapLoadResult> {
    const now = this.now();
    const map = createCareerMap(userId);
    return this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, userId);
      const [erasure] = await tx
        .select({ userId: methodErasureJobs.userId })
        .from(methodErasureJobs)
        .where(eq(methodErasureJobs.userId, userId));
      if (erasure) return { status: 'erasure-pending' };
      await tx
        .insert(careerMaps)
        .values({
          userId,
          schemaVersion: map.schemaVersion,
          revision: map.revision,
          document: map,
          repairRequired: false,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: careerMaps.userId });
      return validateCareerMapForWrite(tx, userId, now);
    });
  }

  async listCareerMapHistory(userId: string): Promise<CareerMapHistoryRow[]> {
    return this.database
      .select()
      .from(careerMapHistory)
      .where(eq(careerMapHistory.userId, userId))
      .orderBy(asc(careerMapHistory.resultRevision));
  }

  async persistCareerMapOperation(input: {
    userId: string;
    leaseId: string;
    context: MethodPersistenceContext;
    operation: CareerMapOperation;
    moduleVersion: string;
    abortSignal?: AbortSignal;
  }): Promise<PersistCareerMapResult> {
    throwIfPersistenceAborted(input.abortSignal);
    const now = this.now();
    try {
      return await this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, input.userId, input.abortSignal);
      throwIfPersistenceAborted(input.abortSignal);
      const [erasure] = await tx
        .select({ userId: methodErasureJobs.userId })
        .from(methodErasureJobs)
        .where(eq(methodErasureJobs.userId, input.userId));
      if (erasure) return { status: 'erasure-pending' };
      const [lease] = await tx
        .select()
        .from(agentTurnLeases)
        .where(and(
          eq(agentTurnLeases.userId, input.userId),
          eq(agentTurnLeases.leaseId, input.leaseId),
          gt(agentTurnLeases.expiresAt, now),
        ));
      if (!lease) {
        return { status: 'lease-lost', message: 'The turn lease expired or was reclaimed.' };
      }
      const [turn] = await tx
        .select()
        .from(agentTurns)
        .where(and(
          eq(agentTurns.userId, input.userId),
          eq(agentTurns.turnId, lease.turnId),
          eq(agentTurns.leaseId, input.leaseId),
          eq(agentTurns.status, 'pending'),
        ));
      if (!turn) {
        return { status: 'lease-lost', message: 'The active turn identity is missing or terminal.' };
      }

      const [row] = await tx
        .select()
        .from(careerMaps)
        .where(eq(careerMaps.userId, input.userId));
      if (!row) {
        return {
          status: 'repair-required',
          reason: 'invalid-document',
          schemaVersion: CURRENT_CAREER_MAP_SCHEMA_VERSION,
          revision: 0,
        };
      }
      const history = await tx
        .select()
        .from(careerMapHistory)
        .where(eq(careerMapHistory.userId, input.userId))
        .orderBy(asc(careerMapHistory.resultRevision));
      const ownerResearchRows = await tx
        .select()
        .from(careerMapResearchAttempts)
        .where(eq(careerMapResearchAttempts.userId, input.userId));
      const ownerAssociationRows = await tx
        .select()
        .from(careerMapEvidenceAssociations)
        .where(eq(careerMapEvidenceAssociations.userId, input.userId));
      const loaded = validateCareerMapRow(row, history, ownerResearchRows, ownerAssociationRows);
      if (loaded.status !== 'ready') {
        if (!row.repairRequired) {
          await tx
            .update(careerMaps)
            .set({ repairRequired: true, updatedAt: now })
            .where(eq(careerMaps.userId, input.userId));
        }
        return loaded;
      }

      const context = input.context;
      const contextMatchesTurn = Boolean(
        context
        && context[methodPersistenceContextMarker] === true
        && context.turnId === turn.turnId
        && context.leaseId === turn.leaseId
        && context.clientMessageId === turn.clientMessageId
        && context.requestFingerprint === turn.requestFingerprint
        && context.origin === turn.origin
        && input.leaseId === context.leaseId,
      );
      const actionProvenanceMatches = contextMatchesTurn
        && collectOperationActions(input.operation.payload)
          .every((action) => sameProvenance(action, context.action));
      const presentationProvenanceMatches = contextMatchesTurn
        && collectOperationPresentations(input.operation.payload)
          .every((presentation) => sameProvenance(presentation, context.presentation));
      if (!contextMatchesTurn || !actionProvenanceMatches || !presentationProvenanceMatches) {
        return {
          status: 'rejected',
          map: loaded.map,
          error: {
            code: 'invalid-operation',
            message: 'Operation provenance must be derived from the active durable turn.',
          },
        };
      }

      const reduced = reduceCareerMapOperation(loaded.map, input.operation);
      if (reduced.status !== 'committed') return reduced;
      const persistedMap = careerMapSchema.safeParse({
        ...reduced.map,
        operationHistory: [
          ...reduced.map.operationHistory.slice(0, -1),
          { ...reduced.receipt, moduleVersion: input.moduleVersion },
        ],
      });
      if (!persistedMap.success) {
        return {
          status: 'rejected',
          map: loaded.map,
          error: {
            code: 'invalid-operation',
            message: 'A non-empty Method module version is required for durable operations.',
          },
        };
      }
      const persistedReceipt = persistedMap.data.operationHistory.at(-1)!;

      const presentedInTurnId = confirmationPresentationTurnId(persistedMap.data, input.operation);
      if (context.origin === 'agent-turn' && presentedInTurnId) {
        const [completedPresentationTurn] = await tx
          .select({ turnId: agentTurns.turnId })
          .from(agentTurns)
          .where(and(
            eq(agentTurns.userId, input.userId),
            eq(agentTurns.turnId, presentedInTurnId),
            eq(agentTurns.status, 'completed'),
          ));
        if (!completedPresentationTurn) {
          return {
            status: 'rejected',
            map: loaded.map,
            error: {
              code: 'confirmation-not-auditable',
              message: 'Conversational confirmation requires a completed prior presentation turn.',
            },
          };
        }
      }

      const canonicalSourceIdentities = canonicalSourceClaimIdentities(loaded.map);
      const newSourceClaims = collectSourceClaims(input.operation.payload)
        .filter((claim) => {
          const identity = sourceBearingInputIdentity(claim.parent);
          return !identity || !canonicalSourceIdentities.has(identity);
        });
      const invalidUserSource = newSourceClaims.some((claim) => (
        claim.source.kind === 'user-supplied-source'
        && (
          !sameProvenance(claim.source.recordedBy, context.action)
          || (claim.source.url !== undefined && !claim.source.url.startsWith('https://'))
        )
      ));
      if (invalidUserSource) {
        return {
          status: 'rejected',
          map: loaded.map,
          error: {
            code: 'invalid-operation',
            message: 'User-supplied sources must be HTTPS and bound to the active server-derived user action.',
          },
        };
      }
      const claimedSourceClaims = newSourceClaims
        .filter((claim): claim is SourceClaim & { source: CitedResearchSource } => (
          claim.source.kind === 'cited-research'
        ));
      const associations: ResearchSourceAssociation[] = [];
      if (claimedSourceClaims.length > 0) {
        const currentModule = deriveMethodCheckpoint(loaded.map).module;
        const amendedResearchSources = new Map(ownerResearchRows.flatMap((researchRow) => {
          if (researchRow.turnId !== lease.turnId || researchRow.leaseId !== input.leaseId) return [];
          const parsed = amendedResearchAttemptSchema.safeParse(researchRow.attempt);
          if (!parsed.success
            || parsed.data.status !== 'succeeded'
            || parsed.data.checkpoint !== currentModule
            || parsed.data.moduleVersion !== input.moduleVersion
          ) return [];
          return parsed.data.sources.map((source) => [
            citedSourceIdentity(source),
            { attempt: parsed.data, row: researchRow },
          ] as const);
        }));
        const predecessorResearchSources = new Set(ownerResearchRows.flatMap((researchRow) => {
          if (researchRow.turnId !== lease.turnId || researchRow.leaseId !== input.leaseId) return [];
          const parsed = persistedResearchAttemptSchema.safeParse(researchRow.attempt);
          if (!parsed.success
            || 'schemaVersion' in parsed.data
            || parsed.data.status !== 'succeeded'
          ) return [];
          return parsed.data.sources.flatMap((source) => (
            source.kind === 'cited-research' && !isAmendedCitedSource(source)
              ? [citedSourceIdentity(source)]
              : []
          ));
        }));
        for (const claim of claimedSourceClaims) {
          if (!isAmendedCitedSource(claim.source)) {
            if (!predecessorResearchSources.has(citedSourceIdentity(claim.source))) {
              return {
                status: 'rejected',
                map: loaded.map,
                error: {
                  code: 'invalid-operation',
                  message: 'Predecessor cited research must match a successful attempt from the active turn and lease.',
                },
              };
            }
            continue;
          }
          const parsedSource = amendedCitedResearchSourceSchema.safeParse(claim.source);
          const matched = parsedSource.success
            ? amendedResearchSources.get(citedSourceIdentity(parsedSource.data))
            : undefined;
          if (!parsedSource.success
            || !matched
            || !citedSourceMatchesCanonicalField(
              { ...claim, source: parsedSource.data },
              input.operation.expectedRevision,
            )
          ) {
            return {
              status: 'rejected',
              map: loaded.map,
              error: {
                code: 'invalid-operation',
                message: 'Cited research must bind the exact current target, field, claim, and provider evidence.',
              },
            };
          }
          associations.push(researchSourceAssociationSchema.parse({
            ...parsedSource.data,
            attemptId: matched.attempt.id,
            operationSourceId: input.operation.sourceId,
            resultRevision: persistedReceipt.resultRevision,
            checkpoint: matched.attempt.checkpoint,
            moduleVersion: matched.attempt.moduleVersion,
          }));
        }
        const amendedClaimCount = claimedSourceClaims.filter((claim) => (
          isAmendedCitedSource(claim.source)
        )).length;
        if (associations.length !== amendedClaimCount) {
          return {
            status: 'rejected',
            map: loaded.map,
            error: {
              code: 'invalid-operation',
              message: 'Every cited claim requires an immutable evidence association.',
            },
          };
        }
      }

      await this.faultInjector?.('before-map-update');
      throwIfPersistenceAborted(input.abortSignal);
      await assertCurrentWriteFence(
        tx,
        input.userId,
        turn.turnId,
        input.leaseId,
        this.now(),
      );
      const [updated] = await tx
        .update(careerMaps)
        .set({
          document: persistedMap.data,
          revision: persistedMap.data.revision,
          schemaVersion: persistedMap.data.schemaVersion,
          repairRequired: false,
          updatedAt: now,
        })
        .where(and(
          eq(careerMaps.userId, input.userId),
          eq(careerMaps.revision, input.operation.expectedRevision),
        ))
        .returning({ revision: careerMaps.revision });

      if (!updated) {
        const [currentRow] = await tx
          .select()
          .from(careerMaps)
          .where(eq(careerMaps.userId, input.userId));
        const currentHistory = await tx
          .select()
          .from(careerMapHistory)
          .where(eq(careerMapHistory.userId, input.userId))
          .orderBy(asc(careerMapHistory.resultRevision));
        if (!currentRow) return { status: 'lease-lost', message: 'Career map disappeared during the operation.' };
        const currentResearch = await tx
          .select()
          .from(careerMapResearchAttempts)
          .where(eq(careerMapResearchAttempts.userId, input.userId));
        const currentAssociations = await tx
          .select()
          .from(careerMapEvidenceAssociations)
          .where(eq(careerMapEvidenceAssociations.userId, input.userId));
        const current = validateCareerMapRow(
          currentRow,
          currentHistory,
          currentResearch,
          currentAssociations,
        );
        if (current.status !== 'ready') return current;
        return reduceCareerMapOperation(current.map, input.operation);
      }

      if (associations.length > 0) {
        const researchRowsByAttempt = new Map(ownerResearchRows.map((row) => [row.id, row]));
        await tx.insert(careerMapEvidenceAssociations).values(associations.map((association) => {
          const researchRow = researchRowsByAttempt.get(association.attemptId);
          if (!researchRow) throw new Error('Evidence association lost its research attempt.');
          return {
            userId: input.userId,
            attemptId: association.attemptId,
            turnId: researchRow.turnId,
            leaseId: researchRow.leaseId,
            operationSourceId: association.operationSourceId,
            resultRevision: association.resultRevision,
            sourceHandle: association.sourceHandle,
            association,
            createdAt: now,
          };
        }));
        await this.faultInjector?.('after-evidence-association-before-history');
      }
      await this.faultInjector?.('after-map-update-before-history');
      await tx.insert(careerMapHistory).values({
        userId: input.userId,
        operationSourceId: persistedReceipt.sourceId,
        operationType: persistedReceipt.operationType,
        payloadFingerprint: persistedReceipt.payloadFingerprint,
        baseRevision: input.operation.expectedRevision,
        resultRevision: persistedReceipt.resultRevision,
        result: persistedReceipt,
        confirmationProvenance: persistedReceipt.confirmationProvenance,
        moduleVersion: persistedReceipt.moduleVersion!,
        committedAt: new Date(persistedReceipt.committedAt),
      });
      await this.faultInjector?.('before-commit');
      throwIfPersistenceAborted(input.abortSignal);
      await assertCurrentWriteFence(
        tx,
        input.userId,
        turn.turnId,
        input.leaseId,
        this.now(),
      );
      throwIfPersistenceAborted(input.abortSignal);
        return { status: 'committed', map: persistedMap.data, receipt: persistedReceipt };
      });
    } catch (error) {
      if (error instanceof TurnLeaseLostError) {
        return { status: 'lease-lost', message: error.message };
      }
      throw error;
    }
  }

  /* ---------------- Turn identity and fencing lease ---------------- */

  async getAgentTurn(
    userId: string,
    clientMessageId: string,
  ): Promise<AgentTurnRecord | undefined> {
    const [row] = await this.database
      .select()
      .from(agentTurns)
      .where(and(
        eq(agentTurns.userId, userId),
        eq(agentTurns.clientMessageId, clientMessageId),
      ));
    return row ? asAgentTurnRecord(row) : undefined;
  }

  async listAgentTurns(userId: string): Promise<AgentTurnRecord[]> {
    const rows = await this.database
      .select()
      .from(agentTurns)
      .where(eq(agentTurns.userId, userId))
      .orderBy(asc(agentTurns.createdAt), asc(agentTurns.turnId));
    return rows.map(asAgentTurnRecord);
  }

  async backfillAgentTurnDisplayProjection(input: {
    userId: string;
    turnId: string;
    displayProjection: { userItemId: string; assistantItemIds: string[] };
  }): Promise<void> {
    await this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, input.userId);
      const [turn] = await tx.select().from(agentTurns).where(and(
        eq(agentTurns.userId, input.userId),
        eq(agentTurns.turnId, input.turnId),
      ));
      if (!turn || (turn.status !== 'completed' && turn.status !== 'cancelled')) return;
      const terminal = turn.terminalResult && typeof turn.terminalResult === 'object'
        ? turn.terminalResult as Record<string, unknown>
        : {};
      if (terminal.displayProjection) return;
      const { displayRecovery: _displayRecovery, ...terminalWithoutRecovery } = terminal;
      await tx.update(agentTurns).set({
        terminalResult: { ...terminalWithoutRecovery, displayProjection: input.displayProjection },
        updatedAt: this.now(),
      }).where(and(
        eq(agentTurns.userId, input.userId),
        eq(agentTurns.turnId, input.turnId),
      ));
    });
  }

  async getTurnLease(userId: string) {
    const [row] = await this.database
      .select()
      .from(agentTurnLeases)
      .where(eq(agentTurnLeases.userId, userId));
    return row;
  }

  async beginAgentTurn(input: {
    userId: string;
    clientMessageId: string;
    requestFingerprint: string;
    turnId: string;
    leaseId: string;
    leaseDurationMs?: number;
  }): Promise<BeginAgentTurnResult> {
    return this.beginMethodTurn(input, 'agent-turn');
  }

  async beginWorkspaceActionTurn(input: {
    userId: string;
    clientMessageId: string;
    requestFingerprint: string;
    turnId: string;
    leaseId: string;
    leaseDurationMs?: number;
  }): Promise<BeginAgentTurnResult> {
    return this.beginMethodTurn(input, 'workspace-action');
  }

  private async beginMethodTurn(input: {
    userId: string;
    clientMessageId: string;
    requestFingerprint: string;
    turnId: string;
    leaseId: string;
    leaseDurationMs?: number;
  }, origin: MethodTurnOrigin): Promise<BeginAgentTurnResult> {
    // The protected route validates this first, and the durable boundary
    // repeats the check so alternate callers cannot persist display text or
    // instruction-shaped content as a client identity.
    opaqueClientMessageIdSchema.parse(input.clientMessageId);
    const now = this.now();
    const leaseDurationMs = input.leaseDurationMs ?? DEFAULT_TURN_LEASE_MS;
    if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 300_000) {
      throw new Error('leaseDurationMs must be above the 300-second platform cap.');
    }
    const expiresAt = new Date(now.getTime() + leaseDurationMs);

    return this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, input.userId);
      const [erasure] = await tx
        .select({ userId: methodErasureJobs.userId })
        .from(methodErasureJobs)
        .where(eq(methodErasureJobs.userId, input.userId));
      if (erasure) return { status: 'erasure-pending' };
      const mapState = await validateCareerMapForWrite(tx, input.userId, now);
      if (mapState.status === 'not-found') return { status: 'map-required' };
      if (mapState.status === 'repair-required') return mapState;
      const [existingTurn] = await tx
        .select()
        .from(agentTurns)
        .where(and(
          eq(agentTurns.userId, input.userId),
          eq(agentTurns.clientMessageId, input.clientMessageId),
        ));
      if (existingTurn) {
        const turn = asAgentTurnRecord(existingTurn);
        if (turn.requestFingerprint !== input.requestFingerprint || turn.origin !== origin) {
          return { status: 'message-id-reused', turn };
        }
        if (turn.status !== 'pending') {
          return { status: 'terminal', turn, shouldInvokeModel: false };
        }
        const [matchingLease] = await tx
          .select()
          .from(agentTurnLeases)
          .where(and(
            eq(agentTurnLeases.userId, input.userId),
            eq(agentTurnLeases.turnId, turn.turnId),
            eq(agentTurnLeases.leaseId, turn.leaseId),
          ));
        if (matchingLease && matchingLease.expiresAt > now) {
          return { status: 'attached', turn, shouldInvokeModel: false };
        }
        const [expired] = await tx
          .update(agentTurns)
          .set({
            status: 'failed',
            terminalResult: preserveConversationProvisioning(
              existingTurn.terminalResult,
              { reason: matchingLease ? 'lease-expired' : 'lease-missing', refetch: true },
            ),
            updatedAt: now,
            terminalAt: now,
          })
          .where(and(
            eq(agentTurns.userId, input.userId),
            eq(agentTurns.turnId, turn.turnId),
            eq(agentTurns.status, 'pending'),
          ))
          .returning();
        if (matchingLease) {
          await tx
            .delete(agentTurnLeases)
            .where(and(
              eq(agentTurnLeases.userId, input.userId),
              eq(agentTurnLeases.turnId, turn.turnId),
              eq(agentTurnLeases.leaseId, turn.leaseId),
            ));
        }
        return {
          status: 'terminal',
          turn: asAgentTurnRecord(expired ?? existingTurn),
          shouldInvokeModel: false,
        };
      }

      const [usedLeaseIdentity] = await tx
        .select({ turnId: agentTurns.turnId })
        .from(agentTurns)
        .where(and(
          eq(agentTurns.userId, input.userId),
          eq(agentTurns.leaseId, input.leaseId),
        ));
      if (usedLeaseIdentity) throw new TurnLeaseIdentityConflictError();

      const [previousLease] = await tx
        .select()
        .from(agentTurnLeases)
        .where(eq(agentTurnLeases.userId, input.userId));
      const [acquired] = await tx
        .insert(agentTurnLeases)
        .values({
          userId: input.userId,
          leaseId: input.leaseId,
          turnId: input.turnId,
          acquiredAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: agentTurnLeases.userId,
          set: {
            leaseId: input.leaseId,
            turnId: input.turnId,
            acquiredAt: now,
            expiresAt,
          },
          setWhere: lte(agentTurnLeases.expiresAt, now),
        })
        .returning();

      if (!acquired) {
        const [attachedAfterRace] = await tx
          .select()
          .from(agentTurns)
          .where(and(
            eq(agentTurns.userId, input.userId),
            eq(agentTurns.clientMessageId, input.clientMessageId),
          ));
        if (attachedAfterRace) {
          const turn = asAgentTurnRecord(attachedAfterRace);
          if (turn.requestFingerprint !== input.requestFingerprint || turn.origin !== origin) {
            return { status: 'message-id-reused', turn };
          }
          return turn.status === 'pending'
            ? { status: 'attached', turn, shouldInvokeModel: false }
            : { status: 'terminal', turn, shouldInvokeModel: false };
        }
        const [currentLease] = await tx
          .select()
          .from(agentTurnLeases)
          .where(eq(agentTurnLeases.userId, input.userId));
        if (!currentLease) {
          throw new Error('Lease acquisition failed without an existing lease.');
        }
        let waitReason: 'conversation-provisioning' | undefined;
        if (origin === 'agent-turn') {
          const [mapping] = await tx.select({ userId: agentConversationMappings.userId })
            .from(agentConversationMappings)
            .where(eq(agentConversationMappings.userId, input.userId));
          const [activeTurn] = await tx.select({ status: agentTurns.status, origin: agentTurns.origin })
            .from(agentTurns)
            .where(and(
              eq(agentTurns.userId, input.userId),
              eq(agentTurns.turnId, currentLease.turnId),
            ));
          if (!mapping && activeTurn?.status === 'pending' && activeTurn.origin === 'agent-turn') {
            waitReason = 'conversation-provisioning';
          }
        }
        return {
          status: 'conflict',
          activeTurnId: currentLease.turnId,
          retryAfter: currentLease.expiresAt,
          ...(waitReason ? { waitReason } : {}),
        };
      }

      let reclaimedTurnId: string | undefined;
      if (previousLease && previousLease.leaseId !== input.leaseId) {
        const [previousTurn] = await tx.select({ terminalResult: agentTurns.terminalResult })
          .from(agentTurns)
          .where(and(
            eq(agentTurns.userId, input.userId),
            eq(agentTurns.turnId, previousLease.turnId),
            eq(agentTurns.leaseId, previousLease.leaseId),
          ));
        const [expiredTurn] = await tx
          .update(agentTurns)
          .set({
            status: 'failed',
            terminalResult: preserveConversationProvisioning(
              previousTurn?.terminalResult,
              { reason: 'lease-expired', refetch: true },
            ),
            updatedAt: now,
            terminalAt: now,
          })
          .where(and(
            eq(agentTurns.userId, input.userId),
            eq(agentTurns.turnId, previousLease.turnId),
            eq(agentTurns.leaseId, previousLease.leaseId),
            eq(agentTurns.status, 'pending'),
          ))
          .returning({ turnId: agentTurns.turnId });
        reclaimedTurnId = expiredTurn?.turnId;
      }

      const [created] = await tx
        .insert(agentTurns)
        .values({
          turnId: input.turnId,
          userId: input.userId,
          clientMessageId: input.clientMessageId,
          requestFingerprint: input.requestFingerprint,
          origin,
          leaseId: input.leaseId,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) {
        throw new Error('Turn identity collision.');
      }
      return {
        status: 'started',
        turn: asAgentTurnRecord(created),
        shouldInvokeModel: origin === 'agent-turn',
        ...(reclaimedTurnId ? { reclaimedTurnId } : {}),
      };
    });
  }

  private async finishAgentTurn(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    status: Exclude<AgentTurnStatus, 'pending'>;
    result: Record<string, unknown>;
    abortSignal?: AbortSignal;
  }): Promise<AgentTurnRecord | undefined> {
    throwIfPersistenceAborted(input.abortSignal);
    return this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, input.userId, input.abortSignal);
      throwIfPersistenceAborted(input.abortSignal);
      const now = this.now();
      const [lease] = await tx
        .select()
        .from(agentTurnLeases)
        .where(and(
          eq(agentTurnLeases.userId, input.userId),
          eq(agentTurnLeases.turnId, input.turnId),
          eq(agentTurnLeases.leaseId, input.leaseId),
        ));
      if (!lease) {
        const [existing] = await tx
          .select()
          .from(agentTurns)
          .where(and(
            eq(agentTurns.userId, input.userId),
            eq(agentTurns.turnId, input.turnId),
          ));
        throwIfPersistenceAborted(input.abortSignal);
        return existing ? asAgentTurnRecord(existing) : undefined;
      }
      if (lease.expiresAt <= now) {
        throwIfPersistenceAborted(input.abortSignal);
        const [current] = await tx.select({ terminalResult: agentTurns.terminalResult })
          .from(agentTurns)
          .where(and(
            eq(agentTurns.userId, input.userId),
            eq(agentTurns.turnId, input.turnId),
          ));
        const [expired] = await tx
          .update(agentTurns)
          .set({
            status: 'failed',
            terminalResult: preserveConversationProvisioning(
              current?.terminalResult,
              { reason: 'lease-expired', refetch: true },
            ),
            updatedAt: now,
            terminalAt: now,
          })
          .where(and(
            eq(agentTurns.userId, input.userId),
            eq(agentTurns.turnId, input.turnId),
            eq(agentTurns.leaseId, input.leaseId),
            eq(agentTurns.status, 'pending'),
          ))
          .returning();
        await tx
          .delete(agentTurnLeases)
          .where(and(
            eq(agentTurnLeases.userId, input.userId),
            eq(agentTurnLeases.turnId, input.turnId),
            eq(agentTurnLeases.leaseId, input.leaseId),
          ));
        throwIfPersistenceAborted(input.abortSignal);
        return expired ? asAgentTurnRecord(expired) : undefined;
      }
      const [currentTurn] = await tx
        .select({ terminalResult: agentTurns.terminalResult })
        .from(agentTurns)
        .where(and(
          eq(agentTurns.userId, input.userId),
          eq(agentTurns.turnId, input.turnId),
        ));
      const existingTerminal = currentTurn?.terminalResult && typeof currentTurn.terminalResult === 'object'
        ? currentTurn.terminalResult as Record<string, unknown>
        : {};
      if (input.status === 'completed') {
        await this.faultInjector?.('before-turn-completion-update');
        throwIfPersistenceAborted(input.abortSignal);
        await assertCurrentWriteFence(
          tx,
          input.userId,
          input.turnId,
          input.leaseId,
          this.now(),
        );
        throwIfPersistenceAborted(input.abortSignal);
      }
      const terminalNow = this.now();
      const [updated] = await tx
        .update(agentTurns)
        .set({
          status: input.status,
          terminalResult: {
            ...input.result,
            ...(existingTerminal.conversationProvisioning
              ? { conversationProvisioning: existingTerminal.conversationProvisioning }
              : {}),
          },
          updatedAt: terminalNow,
          terminalAt: terminalNow,
        })
        .where(and(
          eq(agentTurns.userId, input.userId),
          eq(agentTurns.turnId, input.turnId),
          eq(agentTurns.leaseId, input.leaseId),
          eq(agentTurns.status, 'pending'),
        ))
        .returning();
      await tx
        .delete(agentTurnLeases)
        .where(and(
          eq(agentTurnLeases.userId, input.userId),
          eq(agentTurnLeases.leaseId, input.leaseId),
          eq(agentTurnLeases.turnId, input.turnId),
        ));
      throwIfPersistenceAborted(input.abortSignal);
      if (updated) return asAgentTurnRecord(updated);
      const [existing] = await tx
        .select()
        .from(agentTurns)
        .where(and(
          eq(agentTurns.userId, input.userId),
          eq(agentTurns.turnId, input.turnId),
        ));
      throwIfPersistenceAborted(input.abortSignal);
      return existing ? asAgentTurnRecord(existing) : undefined;
    });
  }

  async completeAgentTurn(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    result?: Record<string, unknown>;
    abortSignal?: AbortSignal;
  }): Promise<AgentTurnRecord | undefined> {
    return this.finishAgentTurn({
      ...input,
      status: 'completed',
      result: input.result ?? { refetch: true },
    });
  }

  async cancelAgentTurn(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    result?: Record<string, unknown>;
  }): Promise<AgentTurnRecord | undefined> {
    return this.finishAgentTurn({
      ...input,
      status: 'cancelled',
      result: input.result ?? { stopped: true, refetch: true },
    });
  }

  async failAgentTurn(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    errorClass: string;
    result?: Record<string, unknown>;
  }): Promise<AgentTurnRecord | undefined> {
    return this.finishAgentTurn({
      ...input,
      status: 'failed',
      result: {
        ...(input.result ?? {}),
        kind: 'failed',
        errorClass: input.errorClass,
        refetch: true,
      },
    });
  }

  async releaseTurnLease(userId: string, turnId: string, leaseId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, userId);
      const [lease] = await tx
        .select({ leaseId: agentTurnLeases.leaseId })
        .from(agentTurnLeases)
        .where(and(
          eq(agentTurnLeases.userId, userId),
          eq(agentTurnLeases.turnId, turnId),
          eq(agentTurnLeases.leaseId, leaseId),
        ));
      if (!lease) return false;
      const now = this.now();
      const [turn] = await tx
        .select({ terminalResult: agentTurns.terminalResult })
        .from(agentTurns)
        .where(and(
          eq(agentTurns.userId, userId),
          eq(agentTurns.turnId, turnId),
          eq(agentTurns.leaseId, leaseId),
        ));
      await tx
        .update(agentTurns)
        .set({
          status: 'failed',
          terminalResult: preserveConversationProvisioning(
            turn?.terminalResult,
            { errorClass: 'TurnLeaseReleased', refetch: true },
          ),
          terminalAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(agentTurns.userId, userId),
          eq(agentTurns.turnId, turnId),
          eq(agentTurns.leaseId, leaseId),
          eq(agentTurns.status, 'pending'),
        ));
      const [released] = await tx
        .delete(agentTurnLeases)
        .where(and(
          eq(agentTurnLeases.userId, userId),
          eq(agentTurnLeases.turnId, turnId),
          eq(agentTurnLeases.leaseId, leaseId),
        ))
        .returning({ userId: agentTurnLeases.userId });
      return Boolean(released);
    });
  }

  /* ---------------- Research, drafts, and Conversation mapping ---------------- */

  /** Server-only sink for provider-ledgered contextual research; never expose as a raw client write. */
  async recordResearchAttempt(
    userId: string,
    leaseId: string,
    input: unknown,
    abortSignal?: AbortSignal,
  ): Promise<ResearchAttempt> {
    throwIfPersistenceAborted(abortSignal);
    if (input && typeof input === 'object'
      && Array.isArray((input as { sources?: unknown }).sources)
      && (input as { sources: unknown[] }).sources.some((source) => (
        !source || typeof source !== 'object'
        || (source as { kind?: unknown }).kind !== 'cited-research'
      ))
    ) throw new ResearchAttemptSourceError();
    const attempt = persistedResearchAttemptSchema.parse(input);
    if (attempt.sources.some((source) => source.kind !== 'cited-research')) {
      throw new ResearchAttemptSourceError();
    }
    const result = await this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, userId, abortSignal);
      throwIfPersistenceAborted(abortSignal);
      const [erasure] = await tx
        .select({ userId: methodErasureJobs.userId })
        .from(methodErasureJobs)
        .where(eq(methodErasureJobs.userId, userId));
      if (erasure) throw new MethodErasurePendingError();
      const [lease] = await tx
        .select({ leaseId: agentTurnLeases.leaseId, turnId: agentTurnLeases.turnId })
        .from(agentTurnLeases)
        .where(and(
          eq(agentTurnLeases.userId, userId),
          eq(agentTurnLeases.leaseId, leaseId),
          gt(agentTurnLeases.expiresAt, this.now()),
      ));
      if (!lease) throw new TurnLeaseLostError();
      const mapState = await validateCareerMapForWrite(tx, userId, this.now());
      if (mapState.status === 'repair-required') return mapState;
      if (mapState.status !== 'ready') throw new TurnLeaseLostError();
      const [existing] = await tx
        .select()
        .from(careerMapResearchAttempts)
        .where(and(
          eq(careerMapResearchAttempts.userId, userId),
          eq(careerMapResearchAttempts.id, attempt.id),
        ));
      if (existing) {
        if (existing.turnId !== lease.turnId || existing.leaseId !== lease.leaseId) {
          throw new ResearchAttemptConflictError();
        }
        const persisted = persistedResearchAttemptSchema.parse(existing.attempt);
        if (JSON.stringify(persisted) !== JSON.stringify(attempt)) {
          throw new ResearchAttemptConflictError();
        }
        throwIfPersistenceAborted(abortSignal);
        await assertCurrentWriteFence(tx, userId, lease.turnId, lease.leaseId, this.now());
        throwIfPersistenceAborted(abortSignal);
        return persisted;
      }
      if ('schemaVersion' in attempt
        && (attempt.targetRevision !== mapState.map.revision
          || attempt.checkpoint !== deriveMethodCheckpoint(mapState.map).module)
      ) throw new ResearchAttemptSourceError();
      await this.faultInjector?.('before-research-attempt-insert');
      throwIfPersistenceAborted(abortSignal);
      await assertCurrentWriteFence(tx, userId, lease.turnId, lease.leaseId, this.now());
      throwIfPersistenceAborted(abortSignal);
      const [created] = await tx
        .insert(careerMapResearchAttempts)
        .values({ id: attempt.id, userId, turnId: lease.turnId, leaseId: lease.leaseId, attempt, createdAt: this.now() })
        .returning();
      throwIfPersistenceAborted(abortSignal);
      return persistedResearchAttemptSchema.parse(created.attempt);
    });
    if (result.status === 'repair-required') throw new CareerMapRepairRequiredError(result);
    return result;
  }

  async listResearchAttempts(userId: string): Promise<ResearchAttempt[]> {
    const rows = await this.database
      .select()
      .from(careerMapResearchAttempts)
      .where(eq(careerMapResearchAttempts.userId, userId))
      .orderBy(asc(careerMapResearchAttempts.createdAt));
    return rows.map((row) => persistedResearchAttemptSchema.parse(row.attempt));
  }

  async listResearchSourceAssociations(userId: string): Promise<ResearchSourceAssociationRecord[]> {
    return this.database
      .select()
      .from(careerMapEvidenceAssociations)
      .where(eq(careerMapEvidenceAssociations.userId, userId))
      .orderBy(
        asc(careerMapEvidenceAssociations.resultRevision),
        asc(careerMapEvidenceAssociations.id),
      );
  }

  async saveCareerMapDraft(input: {
    userId: string;
    leaseId: string;
    id: string;
    kind: string;
    content: unknown;
  }): Promise<void> {
    const now = this.now();
    const result = await this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, input.userId);
      const [erasure] = await tx
        .select({ userId: methodErasureJobs.userId })
        .from(methodErasureJobs)
        .where(eq(methodErasureJobs.userId, input.userId));
      if (erasure) throw new MethodErasurePendingError();
      const [lease] = await tx
        .select({ leaseId: agentTurnLeases.leaseId })
        .from(agentTurnLeases)
        .where(and(
          eq(agentTurnLeases.userId, input.userId),
          eq(agentTurnLeases.leaseId, input.leaseId),
          gt(agentTurnLeases.expiresAt, now),
      ));
      if (!lease) throw new TurnLeaseLostError();
      const mapState = await validateCareerMapForWrite(tx, input.userId, now);
      if (mapState.status === 'repair-required') return mapState;
      if (mapState.status !== 'ready') throw new TurnLeaseLostError();
      const { leaseId: _leaseId, ...draft } = input;
      await tx
        .insert(careerMapDrafts)
        .values({ ...draft, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [careerMapDrafts.userId, careerMapDrafts.id],
          set: { kind: input.kind, content: input.content, updatedAt: now },
        });
    });
    if (result?.status === 'repair-required') throw new CareerMapRepairRequiredError(result);
  }

  async setConversationMapping(userId: string, leaseId: string, conversationId: string): Promise<void> {
    const now = this.now();
    const result = await this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, userId);
      const [erasure] = await tx
        .select({ userId: methodErasureJobs.userId })
        .from(methodErasureJobs)
        .where(eq(methodErasureJobs.userId, userId));
      if (erasure) throw new MethodErasurePendingError();
      const [lease] = await tx
        .select({ leaseId: agentTurnLeases.leaseId })
        .from(agentTurnLeases)
        .where(and(
          eq(agentTurnLeases.userId, userId),
          eq(agentTurnLeases.leaseId, leaseId),
          gt(agentTurnLeases.expiresAt, now),
      ));
      if (!lease) throw new TurnLeaseLostError();
      const mapState = await validateCareerMapForWrite(tx, userId, now);
      if (mapState.status === 'repair-required') return mapState;
      if (mapState.status !== 'ready') throw new TurnLeaseLostError();
      const [created] = await tx
        .insert(agentConversationMappings)
        .values({ userId, conversationId, createdAt: now, updatedAt: now })
        .onConflictDoNothing({ target: agentConversationMappings.userId })
        .returning({ conversationId: agentConversationMappings.conversationId });
      if (created) return undefined;
      const [existing] = await tx
        .select({ conversationId: agentConversationMappings.conversationId })
        .from(agentConversationMappings)
        .where(eq(agentConversationMappings.userId, userId));
      if (existing?.conversationId !== conversationId) {
        throw new ConversationMappingConflictError();
      }
    });
    if (result?.status === 'repair-required') throw new CareerMapRepairRequiredError(result);
  }

  async getConversationMapping(userId: string): Promise<string | undefined> {
    const [row] = await this.database
      .select()
      .from(agentConversationMappings)
      .where(eq(agentConversationMappings.userId, userId));
    return row?.conversationId;
  }

  async recordConversationProvisioning(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    conversationId: string;
  }): Promise<void> {
    await this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, input.userId);
      const [turn] = await tx.select().from(agentTurns).where(and(
        eq(agentTurns.userId, input.userId),
        eq(agentTurns.turnId, input.turnId),
        eq(agentTurns.leaseId, input.leaseId),
      ));
      // This marker is cleanup metadata, not a product write. It must remain
      // recordable after lease expiry/terminalization so a returned provider id
      // can never become undiscoverable at the create/bind boundary.
      if (!turn) {
        // Erasure can win while provider creation is in flight. Preserve the
        // late provider identity in the existing non-content erasure marker
        // (or create a generation-fenced marker if local erasure just ended).
        const [existingErasure] = await tx.select().from(methodErasureJobs)
          .where(eq(methodErasureJobs.userId, input.userId));
        const conversationId = encodeConversationCleanupIds([
          ...decodeConversationCleanupIds(existingErasure?.conversationId ?? null),
          input.conversationId,
        ]);
        const jobId = randomUUID();
        await tx.insert(methodErasureJobs).values({
          userId: input.userId,
          jobId,
          conversationId,
          status: 'pending-provider',
          errorClass: null,
          createdAt: this.now(),
          updatedAt: this.now(),
        }).onConflictDoUpdate({
          target: methodErasureJobs.userId,
          set: {
            jobId,
            conversationId,
            status: 'pending-provider',
            errorClass: null,
            updatedAt: this.now(),
          },
        });
        return;
      }
      const terminal = turn.terminalResult && typeof turn.terminalResult === 'object'
        ? turn.terminalResult as Record<string, unknown>
        : {};
      const existing = terminal.conversationProvisioning as Record<string, unknown> | undefined;
      if (existing?.conversationId && existing.conversationId !== input.conversationId) {
        throw new ConversationMappingConflictError();
      }
      await tx.update(agentTurns).set({
        terminalResult: {
          ...terminal,
          conversationProvisioning: { status: 'pending', conversationId: input.conversationId },
        },
        updatedAt: this.now(),
      }).where(and(
        eq(agentTurns.userId, input.userId),
        eq(agentTurns.turnId, input.turnId),
      ));
    });
  }

  async listPendingConversationProvisioning(userId: string): Promise<ConversationProvisioningRecord[]> {
    const rows = await this.database.select({
      turnId: agentTurns.turnId,
      terminalResult: agentTurns.terminalResult,
    }).from(agentTurns).where(eq(agentTurns.userId, userId));
    return rows.flatMap((row) => {
      const terminal = row.terminalResult && typeof row.terminalResult === 'object'
        ? row.terminalResult as Record<string, unknown>
        : undefined;
      const marker = terminal?.conversationProvisioning;
      if (!marker || typeof marker !== 'object') return [];
      const record = marker as Record<string, unknown>;
      return record.status === 'pending'
        && typeof record.conversationId === 'string'
        && record.conversationId.length > 0
        && record.conversationId.length <= 200
        ? [{ userId, turnId: row.turnId, conversationId: record.conversationId }]
        : [];
    });
  }

  async resolveConversationProvisioning(input: ConversationProvisioningRecord): Promise<void> {
    await this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, input.userId);
      const [turn] = await tx.select().from(agentTurns).where(and(
        eq(agentTurns.userId, input.userId),
        eq(agentTurns.turnId, input.turnId),
      ));
      if (!turn) return;
      const terminal = turn.terminalResult && typeof turn.terminalResult === 'object'
        ? turn.terminalResult as Record<string, unknown>
        : {};
      const marker = terminal.conversationProvisioning as Record<string, unknown> | undefined;
      if (marker?.conversationId !== input.conversationId) return;
      const { conversationProvisioning: _resolved, ...rest } = terminal;
      await tx.update(agentTurns).set({ terminalResult: rest, updatedAt: this.now() }).where(and(
        eq(agentTurns.userId, input.userId),
        eq(agentTurns.turnId, input.turnId),
      ));
    });
  }

  async claimConversationProvisioningCleanup(
    userId: string,
    claimId: string,
  ): Promise<ConversationProvisioningCleanupClaim | undefined> {
    if (claimId.length === 0 || claimId.length > 200) {
      throw new Error('Conversation provisioning cleanup claim identity is invalid.');
    }
    return this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, userId);
      const now = this.now();
      const [mapping] = await tx
        .select({ conversationId: agentConversationMappings.conversationId })
        .from(agentConversationMappings)
        .where(eq(agentConversationMappings.userId, userId));
      const [lease] = await tx
        .select()
        .from(agentTurnLeases)
        .where(eq(agentTurnLeases.userId, userId));
      const turns = await tx
        .select()
        .from(agentTurns)
        .where(eq(agentTurns.userId, userId))
        .orderBy(asc(agentTurns.createdAt), asc(agentTurns.turnId));

      for (const turn of turns) {
        const terminal = turn.terminalResult && typeof turn.terminalResult === 'object'
          ? turn.terminalResult as Record<string, unknown>
          : {};
        const marker = terminal.conversationProvisioning;
        if (!marker || typeof marker !== 'object') continue;
        const record = marker as Record<string, unknown>;
        const conversationId = record.conversationId;
        if (typeof conversationId !== 'string'
          || conversationId.length === 0
          || conversationId.length > 200
        ) continue;

        // A provider Conversation that is already bound belongs to this owner.
        // Resolving its cleanup marker and deciding whether an unbound marker is
        // deletable happen under the same owner lock as binding and leases.
        if (mapping?.conversationId === conversationId) {
          const { conversationProvisioning: _resolved, ...rest } = terminal;
          await tx.update(agentTurns).set({ terminalResult: rest, updatedAt: now }).where(and(
            eq(agentTurns.userId, userId),
            eq(agentTurns.turnId, turn.turnId),
          ));
          continue;
        }

        const hasLiveOwningLease = turn.status === 'pending'
          && lease?.turnId === turn.turnId
          && lease.leaseId === turn.leaseId
          && lease.expiresAt > now;
        if (hasLiveOwningLease) continue;

        const status = record.status;
        if (status === 'cleanup-claimed') {
          if (record.claimId === claimId) {
            return { userId, turnId: turn.turnId, conversationId, claimId };
          }
          const claimedAt = typeof record.claimedAt === 'string'
            ? Date.parse(record.claimedAt)
            : Number.NaN;
          if (Number.isFinite(claimedAt)
            && claimedAt > now.getTime() - CONVERSATION_CLEANUP_CLAIM_MS
          ) continue;
        } else if (status !== 'pending') {
          continue;
        }

        await tx.update(agentTurns).set({
          terminalResult: {
            ...terminal,
            conversationProvisioning: {
              status: 'cleanup-claimed',
              conversationId,
              claimId,
              claimedAt: now.toISOString(),
            },
          },
          updatedAt: now,
        }).where(and(
          eq(agentTurns.userId, userId),
          eq(agentTurns.turnId, turn.turnId),
        ));
        return { userId, turnId: turn.turnId, conversationId, claimId };
      }
      return undefined;
    });
  }

  async completeConversationProvisioningCleanup(
    input: ConversationProvisioningCleanupClaim,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, input.userId);
      const [turn] = await tx.select().from(agentTurns).where(and(
        eq(agentTurns.userId, input.userId),
        eq(agentTurns.turnId, input.turnId),
      ));
      if (!turn) return;
      const terminal = turn.terminalResult && typeof turn.terminalResult === 'object'
        ? turn.terminalResult as Record<string, unknown>
        : {};
      const marker = terminal.conversationProvisioning;
      if (!marker || typeof marker !== 'object') return;
      const record = marker as Record<string, unknown>;
      if (record.status !== 'cleanup-claimed'
        || record.conversationId !== input.conversationId
        || record.claimId !== input.claimId
      ) return;
      const { conversationProvisioning: _resolved, ...rest } = terminal;
      await tx.update(agentTurns).set({ terminalResult: rest, updatedAt: this.now() }).where(and(
        eq(agentTurns.userId, input.userId),
        eq(agentTurns.turnId, input.turnId),
      ));
    });
  }

  async releaseConversationProvisioningCleanup(
    input: ConversationProvisioningCleanupClaim,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, input.userId);
      const [turn] = await tx.select().from(agentTurns).where(and(
        eq(agentTurns.userId, input.userId),
        eq(agentTurns.turnId, input.turnId),
      ));
      if (!turn) return;
      const terminal = turn.terminalResult && typeof turn.terminalResult === 'object'
        ? turn.terminalResult as Record<string, unknown>
        : {};
      const marker = terminal.conversationProvisioning;
      if (!marker || typeof marker !== 'object') return;
      const record = marker as Record<string, unknown>;
      if (record.status !== 'cleanup-claimed'
        || record.conversationId !== input.conversationId
        || record.claimId !== input.claimId
      ) return;
      const [mapping] = await tx
        .select({ conversationId: agentConversationMappings.conversationId })
        .from(agentConversationMappings)
        .where(eq(agentConversationMappings.userId, input.userId));
      const nextTerminal = mapping?.conversationId === input.conversationId
        ? (() => {
            const { conversationProvisioning: _resolved, ...rest } = terminal;
            return rest;
          })()
        : {
            ...terminal,
            conversationProvisioning: { status: 'pending', conversationId: input.conversationId },
          };
      await tx.update(agentTurns).set({ terminalResult: nextTerminal, updatedAt: this.now() }).where(and(
        eq(agentTurns.userId, input.userId),
        eq(agentTurns.turnId, input.turnId),
      ));
    });
  }

  /* ---------------- Retryable full Method erasure ---------------- */

  async eraseMethodData(
    userId: string,
    provider?: MethodErasureProvider,
  ): Promise<{ status: 'complete' | 'pending-provider'; errorClass?: string }> {
    const now = this.now();
    const newJobId = randomUUID();
    const marker = await this.database.transaction(async (tx) => {
      await lockMethodOwner(tx, userId);
      const [existingJob] = await tx
        .select()
        .from(methodErasureJobs)
        .where(eq(methodErasureJobs.userId, userId));
      const [mapping] = existingJob ? [] : await tx
        .select()
        .from(agentConversationMappings)
        .where(eq(agentConversationMappings.userId, userId));
      const pendingTurns = existingJob ? [] : await tx
        .select({ terminalResult: agentTurns.terminalResult })
        .from(agentTurns)
        .where(eq(agentTurns.userId, userId));
      const conversationId = existingJob?.conversationId
        ?? encodeConversationCleanupIds([
          ...(mapping?.conversationId ? [mapping.conversationId] : []),
          ...pendingProvisioningConversationIds(pendingTurns),
        ]);
      const [job] = await tx
        .insert(methodErasureJobs)
        .values({
          userId,
          jobId: newJobId,
          conversationId,
          status: 'pending-provider',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: methodErasureJobs.userId,
          set: { status: 'pending-provider', errorClass: null, updatedAt: now },
        })
        .returning();

      await tx.delete(agentTurnLeases).where(eq(agentTurnLeases.userId, userId));
      await tx.delete(agentTurns).where(eq(agentTurns.userId, userId));
      await tx.delete(agentConversationMappings).where(eq(agentConversationMappings.userId, userId));
      await tx.delete(careerMaps).where(eq(careerMaps.userId, userId));
      return job;
    });

    const conversationIds = decodeConversationCleanupIds(marker.conversationId);
    if (conversationIds.length === 0) {
      const [deleted] = await this.database.delete(methodErasureJobs)
        .where(and(
          eq(methodErasureJobs.userId, userId),
          eq(methodErasureJobs.jobId, marker.jobId),
        ))
        .returning({ jobId: methodErasureJobs.jobId });
      if (!deleted && await this.getMethodErasureJob(userId)) return { status: 'pending-provider' };
      return { status: 'complete' };
    }
    if (!provider) return { status: 'pending-provider' };

    try {
      for (const conversationId of conversationIds) {
        await provider.deleteConversationItemsAndConversation(conversationId);
      }
      await this.faultInjector?.('before-erasure-marker-delete');
      const [deleted] = await this.database.delete(methodErasureJobs)
        .where(and(
          eq(methodErasureJobs.userId, userId),
          eq(methodErasureJobs.jobId, marker.jobId),
        ))
        .returning({ jobId: methodErasureJobs.jobId });
      if (!deleted && await this.getMethodErasureJob(userId)) return { status: 'pending-provider' };
      return { status: 'complete' };
    } catch (error) {
      const errorClass = error instanceof Error ? error.constructor.name : 'UnknownError';
      const [updated] = await this.database
        .update(methodErasureJobs)
        .set({ status: 'failed-provider', errorClass, updatedAt: this.now() })
        .where(and(
          eq(methodErasureJobs.userId, userId),
          eq(methodErasureJobs.jobId, marker.jobId),
        ))
        .returning({ jobId: methodErasureJobs.jobId });
      if (!updated && !await this.getMethodErasureJob(userId)) return { status: 'complete' };
      return { status: 'pending-provider', errorClass };
    }
  }

  async getMethodErasureJob(userId: string) {
    const [row] = await this.database
      .select()
      .from(methodErasureJobs)
      .where(eq(methodErasureJobs.userId, userId));
    return row;
  }

  /* ---------------- Integrity audit ---------------- */

  async auditCareerMapIntegrity(): Promise<CareerMapIntegrityAudit> {
    return this.database.transaction(async (tx) => {
      const rows = await tx.select().from(careerMaps);
      const historyRows = await tx.select().from(careerMapHistory);
      const researchRows = await tx.select().from(careerMapResearchAttempts);
      const associationRows = await tx.select().from(careerMapEvidenceAssociations);
      const draftRows = await tx.select().from(careerMapDrafts);
      const turnRows = await tx.select().from(agentTurns);
      const leaseRows = await tx.select().from(agentTurnLeases);
      const mappingRows = await tx.select().from(agentConversationMappings);
      const erasureRows = await tx.select().from(methodErasureJobs);
      const owners = new Set(rows.map((row) => row.userId));
      const historyByUserId = rowsByUserId(historyRows);
      const researchByUserId = rowsByUserId(researchRows);
      const associationsByUserId = rowsByUserId(associationRows);
      const turnIdentities = new Set(turnRows.map((row) => (
        turnLeaseIdentity(row.userId, row.turnId, row.leaseId)
      )));
      const pendingTurnIdentities = new Set(turnRows
        .filter((row) => row.status === 'pending')
        .map((row) => turnLeaseIdentity(row.userId, row.turnId, row.leaseId)));
      const leaseIdentities = new Set(leaseRows.map((row) => (
        turnLeaseIdentity(row.userId, row.turnId, row.leaseId)
      )));
      const invalidRecords: Array<{ userId: string; reason: RepairReason }> = [];
      for (const row of rows) {
        const result = validateCareerMapRow(
          row,
          [...(historyByUserId.get(row.userId) ?? [])]
            .sort((left, right) => left.resultRevision - right.resultRevision),
          researchByUserId.get(row.userId) ?? [],
          associationsByUserId.get(row.userId) ?? [],
        );
        if (result.status === 'repair-required') {
          invalidRecords.push({ userId: row.userId, reason: result.reason });
        }
      }
      const orphanHistory = historyRows.filter((row) => !owners.has(row.userId)).length;
      const orphanResearchAttempts = researchRows.filter((row) => !owners.has(row.userId)
        || !turnIdentities.has(turnLeaseIdentity(row.userId, row.turnId, row.leaseId))).length;
      const invalidResearchAttempts = researchRows.filter((row) => {
        const parsed = persistedResearchAttemptSchema.safeParse(row.attempt);
        return !parsed.success || parsed.data.id !== row.id;
      }).length;
      const researchIdentities = new Set(researchRows.map((row) => JSON.stringify([row.userId, row.id])));
      const historyIdentities = new Set(historyRows.map((row) => JSON.stringify([
        row.userId,
        row.operationSourceId,
        row.resultRevision,
      ])));
      const orphanEvidenceAssociations = associationRows.filter((row) => (
        !owners.has(row.userId)
        || !researchIdentities.has(JSON.stringify([row.userId, row.attemptId]))
        || !historyIdentities.has(JSON.stringify([
          row.userId,
          row.operationSourceId,
          row.resultRevision,
        ]))
      )).length;
      const invalidEvidenceAssociations = associationRows.filter((row) => {
        const parsed = researchSourceAssociationSchema.safeParse(row.association);
        return !parsed.success
          || parsed.data.attemptId !== row.attemptId
          || parsed.data.operationSourceId !== row.operationSourceId
          || parsed.data.resultRevision !== row.resultRevision
          || parsed.data.sourceHandle !== row.sourceHandle;
      }).length;
      const orphanDrafts = draftRows.filter((row) => !owners.has(row.userId)).length;
      const orphanTurns = turnRows.filter((row) => !owners.has(row.userId)).length;
      const orphanLeases = leaseRows.filter((row) => !owners.has(row.userId)).length;
      const orphanConversationMappings = mappingRows.filter((row) => !owners.has(row.userId)).length;
      const invalidLeases = leaseRows.filter((lease) => !pendingTurnIdentities.has(
        turnLeaseIdentity(lease.userId, lease.turnId, lease.leaseId),
      )).length;
      const pendingTurnsWithoutLease = turnRows.filter((turn) => turn.status === 'pending'
        && !leaseIdentities.has(turnLeaseIdentity(turn.userId, turn.turnId, turn.leaseId))).length;
      const pendingErasureJobs = erasureRows.length;
      return {
        totalMaps: rows.length,
        invalidRecords,
        orphanHistory,
        orphanResearchAttempts,
        invalidResearchAttempts,
        orphanEvidenceAssociations,
        invalidEvidenceAssociations,
        orphanDrafts,
        orphanTurns,
        orphanLeases,
        orphanConversationMappings,
        invalidLeases,
        pendingTurnsWithoutLease,
        pendingErasureJobs,
        zeroInvalid: invalidRecords.length === 0
          && orphanHistory === 0
          && orphanResearchAttempts === 0
          && invalidResearchAttempts === 0
          && orphanEvidenceAssociations === 0
          && invalidEvidenceAssociations === 0
          && orphanDrafts === 0
          && orphanTurns === 0
          && orphanLeases === 0
          && orphanConversationMappings === 0
          && invalidLeases === 0
          && pendingTurnsWithoutLease === 0
          && pendingErasureJobs === 0,
      };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }
}

/* ------------------------------------------------------------------ */
/*                         Export Singleton Store                      */
/* ------------------------------------------------------------------ */

export const storage: IStorage = new PostgresStorage();

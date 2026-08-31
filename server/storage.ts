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
  careerMapDrafts,
  agentTurnLeases,
  agentTurns,
  agentConversationMappings,
  methodErasureJobs,
} from '../shared/schema.js';
import {
  applyCareerMapOperation as reduceCareerMapOperation,
  careerMapSchema,
  createCareerMap,
  operationReceiptSchema,
  pathProjectInputSchema,
  peerExposureInputSchema,
  purposePathInputSchema,
  researchAttemptSchema,
  sideDoorInputSchema,
  userActionProvenanceSchema,
  type ApplyCareerMapResult,
  type CareerMap,
  type CareerMapOperation,
  type ResearchAttempt,
  type SourceProvenance,
  type UserActionProvenance,
} from '../shared/career-map/index.js';

export const CURRENT_CAREER_MAP_SCHEMA_VERSION = 1;
export const DEFAULT_TURN_LEASE_MS = 360_000;

export type RepairReason =
  | 'unsupported-schema'
  | 'invalid-document'
  | 'owner-mismatch'
  | 'row-document-mismatch'
  | 'history-mismatch'
  | 'research-mismatch';

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

export interface AgentTurnRecord {
  turnId: string;
  userId: string;
  clientMessageId: string;
  requestFingerprint: string;
  leaseId: string;
  status: AgentTurnStatus;
  terminalResult: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  terminalAt: Date | null;
}

export type CareerMapHistoryRecord = typeof careerMapHistory.$inferSelect;
export type AgentTurnLeaseRecord = typeof agentTurnLeases.$inferSelect;
export type MethodErasureJobRecord = typeof methodErasureJobs.$inferSelect;

export interface CareerMapIntegrityAudit {
  totalMaps: number;
  invalidRecords: Array<{ userId: string; reason: RepairReason }>;
  orphanHistory: number;
  orphanResearchAttempts: number;
  invalidResearchAttempts: number;
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
  | { status: 'started'; turn: AgentTurnRecord; shouldInvokeModel: true; reclaimedTurnId?: string }
  | { status: 'attached'; turn: AgentTurnRecord; shouldInvokeModel: false }
  | { status: 'terminal'; turn: AgentTurnRecord; shouldInvokeModel: false }
  | { status: 'conflict'; activeTurnId: string; retryAfter: Date }
  | { status: 'message-id-reused'; turn: AgentTurnRecord }
  | { status: 'map-required' }
  | { status: 'erasure-pending' };

export class MethodErasurePendingError extends Error {
  readonly code = 'method-erasure-pending';

  constructor() {
    super('Method data erasure is pending; new product writes are disabled.');
    this.name = 'MethodErasurePendingError';
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

export class TurnLeaseIdentityConflictError extends Error {
  readonly code = 'turn-lease-identity-conflict';

  constructor() {
    super('Turn lease identity was already used by this explorer.');
    this.name = 'TurnLeaseIdentityConflictError';
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
  | 'before-map-update'
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
    operation: CareerMapOperation;
    moduleVersion: string;
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
  getAgentTurn(userId: string, clientMessageId: string): Promise<AgentTurnRecord | undefined>;
  getTurnLease(userId: string): Promise<AgentTurnLeaseRecord | undefined>;
  completeAgentTurn(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    result?: Record<string, unknown>;
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
  }): Promise<AgentTurnRecord | undefined>;
  releaseTurnLease(userId: string, turnId: string, leaseId: string): Promise<boolean>;
  recordResearchAttempt(userId: string, leaseId: string, input: unknown): Promise<ResearchAttempt>;
  listResearchAttempts(userId: string): Promise<ResearchAttempt[]>;
  saveCareerMapDraft(input: {
    userId: string;
    leaseId: string;
    id: string;
    kind: string;
    content: unknown;
  }): Promise<void>;
  setConversationMapping(userId: string, leaseId: string, conversationId: string): Promise<void>;
  getConversationMapping(userId: string): Promise<string | undefined>;
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
type AgentTurnRow = typeof agentTurns.$inferSelect;

function asAgentTurnRecord(row: AgentTurnRow): AgentTurnRecord {
  return {
    ...row,
    status: row.status as AgentTurnStatus,
    terminalResult: row.terminalResult ?? null,
  };
}

function operationConfirmation(
  operation: CareerMapOperation,
): UserActionProvenance | undefined {
  const payload = operation.payload as Record<string, unknown>;
  const action = payload.action;
  if (!action || typeof action !== 'object') return undefined;
  const candidate = action as Partial<UserActionProvenance>;
  return candidate.kind === 'user-message' || candidate.kind === 'ui-action'
    ? (action as UserActionProvenance)
    : undefined;
}

type CitedResearchSource = Extract<SourceProvenance, { kind: 'cited-research' }>;

interface CitedSourceClaim {
  source: CitedResearchSource;
  parent: Record<string, unknown>;
}

function collectCitedSourceClaims(value: unknown): CitedSourceClaim[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(collectCitedSourceClaims);
  const record = value as Record<string, unknown>;
  const direct = typeof record.id === 'string'
    && typeof record.revision === 'number'
    && Array.isArray(record.sources)
    ? record.sources
      .filter((source): source is CitedResearchSource => Boolean(source)
        && typeof source === 'object'
        && (source as Record<string, unknown>).kind === 'cited-research')
      .map((source) => ({ source, parent: record }))
    : [];
  return [
    ...direct,
    ...Object.entries(record)
      .filter(([key]) => key !== 'sources')
      .flatMap(([, nested]) => collectCitedSourceClaims(nested)),
  ];
}

function citedSourceIdentity(source: CitedResearchSource): string {
  return JSON.stringify({
    sourceHandle: source.sourceHandle,
    support: source.support,
    providerResultId: source.providerResultId ?? null,
    url: source.url,
    retrievedAt: source.retrievedAt,
    title: source.title ?? null,
    excerpt: source.excerpt ?? null,
  });
}

const sourceBearingInputSchemas = [
  purposePathInputSchema.strip(),
  pathProjectInputSchema.strip(),
  peerExposureInputSchema.strip(),
  sideDoorInputSchema.strip(),
] as const;

function sourceBearingInputSnapshot(value: unknown): string | undefined {
  for (const schema of sourceBearingInputSchemas) {
    const parsed = schema.safeParse(value);
    if (parsed.success) return JSON.stringify(parsed.data);
  }
  return undefined;
}

function unchangedCanonicalSourceClaim(map: CareerMap, claim: CitedSourceClaim): boolean {
  const claimSnapshot = sourceBearingInputSnapshot(claim.parent);
  if (!claimSnapshot) return false;
  const candidates = [
    ...map.pathSets.flatMap((set) => set.paths),
    ...map.projects,
    ...map.projectOptionSets.flatMap((set) => set.projects),
    ...map.peerExposures,
    ...map.sideDoorSets.flatMap((set) => set.doors),
  ];
  return candidates.some((candidate) => candidate.id === claim.parent.id
    && candidate.revision === claim.parent.revision
    && sourceBearingInputSnapshot(candidate) === claimSnapshot);
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
      && persistedResult.data.sourceId === receipt.sourceId
      && persistedResult.data.operationType === receipt.operationType
      && persistedResult.data.payloadFingerprint === receipt.payloadFingerprint
      && persistedResult.data.resultRevision === receipt.resultRevision
      && persistedResult.data.committedAt === receipt.committedAt
      && row.committedAt.getTime() === new Date(receipt.committedAt).getTime();
  });
}

function researchMatchesMap(map: CareerMap, researchRows: CareerMapResearchRow[]): boolean {
  const persistedSources = new Set<string>();
  for (const row of researchRows) {
    const parsed = researchAttemptSchema.safeParse(row.attempt);
    if (!parsed.success || parsed.data.id !== row.id) return false;
    if (parsed.data.status !== 'succeeded') continue;
    for (const source of parsed.data.sources) {
      if (source.kind === 'cited-research') persistedSources.add(citedSourceIdentity(source));
    }
  }
  return collectCitedSourceClaims(map)
    .every((claim) => persistedSources.has(citedSourceIdentity(claim.source)));
}

function validateCareerMapRow(
  row: CareerMapRow,
  history: CareerMapHistoryRow[],
  researchRows: CareerMapResearchRow[],
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
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 20260831))`);
      const [row] = await tx
        .select()
        .from(careerMaps)
        .where(eq(careerMaps.userId, userId));
      if (!row) return { status: 'not-found' };
      const history = await tx
        .select()
        .from(careerMapHistory)
        .where(eq(careerMapHistory.userId, userId))
        .orderBy(asc(careerMapHistory.resultRevision));
      const research = await tx
        .select()
        .from(careerMapResearchAttempts)
        .where(eq(careerMapResearchAttempts.userId, userId));
      const result = validateCareerMapRow(row, history, research);
      if (result.status === 'repair-required' && !row.repairRequired) {
        await tx
          .update(careerMaps)
          .set({ repairRequired: true, updatedAt: this.now() })
          .where(eq(careerMaps.userId, userId));
      }
      return result;
    });
  }

  async getOrCreateCareerMap(userId: string): Promise<CareerMapLoadResult> {
    const now = this.now();
    const map = createCareerMap(userId);
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 20260831))`);
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
      const [row] = await tx
        .select()
        .from(careerMaps)
        .where(eq(careerMaps.userId, userId));
      if (!row) return { status: 'not-found' };
      const history = await tx
        .select()
        .from(careerMapHistory)
        .where(eq(careerMapHistory.userId, userId))
        .orderBy(asc(careerMapHistory.resultRevision));
      const research = await tx
        .select()
        .from(careerMapResearchAttempts)
        .where(eq(careerMapResearchAttempts.userId, userId));
      const result = validateCareerMapRow(row, history, research);
      if (result.status === 'repair-required' && !row.repairRequired) {
        await tx
          .update(careerMaps)
          .set({ repairRequired: true, updatedAt: now })
          .where(eq(careerMaps.userId, userId));
      }
      return result;
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
    operation: CareerMapOperation;
    moduleVersion: string;
  }): Promise<PersistCareerMapResult> {
    const now = this.now();
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 20260831))`);
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
      const loaded = validateCareerMapRow(row, history, ownerResearchRows);
      if (loaded.status !== 'ready') {
        if (!row.repairRequired) {
          await tx
            .update(careerMaps)
            .set({ repairRequired: true, updatedAt: now })
            .where(eq(careerMaps.userId, input.userId));
        }
        return loaded;
      }

      const reduced = reduceCareerMapOperation(loaded.map, input.operation);
      if (reduced.status !== 'committed') return reduced;

      const claimedSources = collectCitedSourceClaims(input.operation.payload)
        .filter((claim) => !unchangedCanonicalSourceClaim(loaded.map, claim))
        .map((claim) => claim.source);
      if (claimedSources.length > 0) {
        const researchRows = ownerResearchRows.filter((researchRow) => researchRow.turnId === lease.turnId
          && researchRow.leaseId === input.leaseId);
        const validatedSourceIdentities = new Set(researchRows.flatMap((researchRow) => {
          const attempt = researchAttemptSchema.safeParse(researchRow.attempt);
          if (!attempt.success || attempt.data.status !== 'succeeded') return [];
          return attempt.data.sources
            .filter((source): source is CitedResearchSource => source.kind === 'cited-research')
            .map(citedSourceIdentity);
        }));
        if (claimedSources.some((source) => !validatedSourceIdentities.has(citedSourceIdentity(source)))) {
          return {
            status: 'rejected',
            map: loaded.map,
            error: {
              code: 'invalid-operation',
              message: 'Cited research sources must resolve to immutable research metadata owned by this explorer.',
            },
          };
        }
      }

      await this.faultInjector?.('before-map-update');
      const [updated] = await tx
        .update(careerMaps)
        .set({
          document: reduced.map,
          revision: reduced.map.revision,
          schemaVersion: reduced.map.schemaVersion,
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
        const current = validateCareerMapRow(currentRow, currentHistory, currentResearch);
        if (current.status !== 'ready') return current;
        return reduceCareerMapOperation(current.map, input.operation);
      }

      await this.faultInjector?.('after-map-update-before-history');
      await tx.insert(careerMapHistory).values({
        userId: input.userId,
        operationSourceId: reduced.receipt.sourceId,
        operationType: reduced.receipt.operationType,
        payloadFingerprint: reduced.receipt.payloadFingerprint,
        baseRevision: input.operation.expectedRevision,
        resultRevision: reduced.receipt.resultRevision,
        result: reduced.receipt,
        confirmationProvenance: operationConfirmation(input.operation),
        moduleVersion: input.moduleVersion,
        committedAt: new Date(reduced.receipt.committedAt),
      });
      await this.faultInjector?.('before-commit');
      return reduced;
    });
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
    const now = this.now();
    const leaseDurationMs = input.leaseDurationMs ?? DEFAULT_TURN_LEASE_MS;
    if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 300_000) {
      throw new Error('leaseDurationMs must be above the 300-second platform cap.');
    }
    const expiresAt = new Date(now.getTime() + leaseDurationMs);

    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 20260831))`);
      const [erasure] = await tx
        .select({ userId: methodErasureJobs.userId })
        .from(methodErasureJobs)
        .where(eq(methodErasureJobs.userId, input.userId));
      if (erasure) return { status: 'erasure-pending' };
      const [mapOwner] = await tx
        .select({ userId: careerMaps.userId })
        .from(careerMaps)
        .where(eq(careerMaps.userId, input.userId));
      if (!mapOwner) return { status: 'map-required' };
      const [existingTurn] = await tx
        .select()
        .from(agentTurns)
        .where(and(
          eq(agentTurns.userId, input.userId),
          eq(agentTurns.clientMessageId, input.clientMessageId),
        ));
      if (existingTurn) {
        const turn = asAgentTurnRecord(existingTurn);
        if (turn.requestFingerprint !== input.requestFingerprint) {
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
            terminalResult: { reason: matchingLease ? 'lease-expired' : 'lease-missing', refetch: true },
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
          if (turn.requestFingerprint !== input.requestFingerprint) {
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
        return {
          status: 'conflict',
          activeTurnId: currentLease.turnId,
          retryAfter: currentLease.expiresAt,
        };
      }

      let reclaimedTurnId: string | undefined;
      if (previousLease && previousLease.leaseId !== input.leaseId) {
        const [expiredTurn] = await tx
          .update(agentTurns)
          .set({
            status: 'failed',
            terminalResult: { reason: 'lease-expired' },
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
        shouldInvokeModel: true,
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
  }): Promise<AgentTurnRecord | undefined> {
    const now = this.now();
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 20260831))`);
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
        return existing ? asAgentTurnRecord(existing) : undefined;
      }
      if (lease.expiresAt <= now) {
        const [expired] = await tx
          .update(agentTurns)
          .set({
            status: 'failed',
            terminalResult: { reason: 'lease-expired', refetch: true },
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
        return expired ? asAgentTurnRecord(expired) : undefined;
      }
      const [updated] = await tx
        .update(agentTurns)
        .set({
          status: input.status,
          terminalResult: input.result,
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
          eq(agentTurnLeases.leaseId, input.leaseId),
          eq(agentTurnLeases.turnId, input.turnId),
        ));
      if (updated) return asAgentTurnRecord(updated);
      const [existing] = await tx
        .select()
        .from(agentTurns)
        .where(and(
          eq(agentTurns.userId, input.userId),
          eq(agentTurns.turnId, input.turnId),
        ));
      return existing ? asAgentTurnRecord(existing) : undefined;
    });
  }

  async completeAgentTurn(input: {
    userId: string;
    turnId: string;
    leaseId: string;
    result?: Record<string, unknown>;
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
  }): Promise<AgentTurnRecord | undefined> {
    return this.finishAgentTurn({
      ...input,
      status: 'failed',
      result: { errorClass: input.errorClass, refetch: true },
    });
  }

  async releaseTurnLease(userId: string, turnId: string, leaseId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 20260831))`);
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
      await tx
        .update(agentTurns)
        .set({
          status: 'failed',
          terminalResult: { errorClass: 'TurnLeaseReleased', refetch: true },
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

  /** Server-only sink for validated, isolated research output; never expose this method as a raw client write. */
  async recordResearchAttempt(userId: string, leaseId: string, input: unknown): Promise<ResearchAttempt> {
    const attempt = researchAttemptSchema.parse(input);
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 20260831))`);
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
        const persisted = researchAttemptSchema.parse(existing.attempt);
        if (JSON.stringify(persisted) !== JSON.stringify(attempt)) {
          throw new ResearchAttemptConflictError();
        }
        return persisted;
      }
      const [created] = await tx
        .insert(careerMapResearchAttempts)
        .values({ id: attempt.id, userId, turnId: lease.turnId, leaseId: lease.leaseId, attempt, createdAt: this.now() })
        .returning();
      return researchAttemptSchema.parse(created.attempt);
    });
  }

  async listResearchAttempts(userId: string): Promise<ResearchAttempt[]> {
    const rows = await this.database
      .select()
      .from(careerMapResearchAttempts)
      .where(eq(careerMapResearchAttempts.userId, userId))
      .orderBy(asc(careerMapResearchAttempts.createdAt));
    return rows.map((row) => researchAttemptSchema.parse(row.attempt));
  }

  async saveCareerMapDraft(input: {
    userId: string;
    leaseId: string;
    id: string;
    kind: string;
    content: unknown;
  }): Promise<void> {
    const now = this.now();
    await this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 20260831))`);
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
      const { leaseId: _leaseId, ...draft } = input;
      await tx
        .insert(careerMapDrafts)
        .values({ ...draft, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [careerMapDrafts.userId, careerMapDrafts.id],
          set: { kind: input.kind, content: input.content, updatedAt: now },
        });
    });
  }

  async setConversationMapping(userId: string, leaseId: string, conversationId: string): Promise<void> {
    const now = this.now();
    await this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 20260831))`);
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
      const [created] = await tx
        .insert(agentConversationMappings)
        .values({ userId, conversationId, createdAt: now, updatedAt: now })
        .onConflictDoNothing({ target: agentConversationMappings.userId })
        .returning({ conversationId: agentConversationMappings.conversationId });
      if (created) return;
      const [existing] = await tx
        .select({ conversationId: agentConversationMappings.conversationId })
        .from(agentConversationMappings)
        .where(eq(agentConversationMappings.userId, userId));
      if (existing?.conversationId !== conversationId) {
        throw new ConversationMappingConflictError();
      }
    });
  }

  async getConversationMapping(userId: string): Promise<string | undefined> {
    const [row] = await this.database
      .select()
      .from(agentConversationMappings)
      .where(eq(agentConversationMappings.userId, userId));
    return row?.conversationId;
  }

  /* ---------------- Retryable full Method erasure ---------------- */

  async eraseMethodData(
    userId: string,
    provider?: MethodErasureProvider,
  ): Promise<{ status: 'complete' | 'pending-provider'; errorClass?: string }> {
    const now = this.now();
    const newJobId = randomUUID();
    const marker = await this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 20260831))`);
      const [existingJob] = await tx
        .select()
        .from(methodErasureJobs)
        .where(eq(methodErasureJobs.userId, userId));
      const [mapping] = existingJob ? [] : await tx
        .select()
        .from(agentConversationMappings)
        .where(eq(agentConversationMappings.userId, userId));
      const conversationId = existingJob?.conversationId ?? mapping?.conversationId ?? null;
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

    if (!marker.conversationId) {
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
      await provider.deleteConversationItemsAndConversation(marker.conversationId);
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
      const draftRows = await tx.select().from(careerMapDrafts);
      const turnRows = await tx.select().from(agentTurns);
      const leaseRows = await tx.select().from(agentTurnLeases);
      const mappingRows = await tx.select().from(agentConversationMappings);
      const erasureRows = await tx.select().from(methodErasureJobs);
      const owners = new Set(rows.map((row) => row.userId));
      const invalidRecords: Array<{ userId: string; reason: RepairReason }> = [];
      for (const row of rows) {
        const result = validateCareerMapRow(
          row,
          historyRows
            .filter((history) => history.userId === row.userId)
            .sort((left, right) => left.resultRevision - right.resultRevision),
          researchRows.filter((research) => research.userId === row.userId),
        );
        if (result.status === 'repair-required') {
          invalidRecords.push({ userId: row.userId, reason: result.reason });
        }
      }
      const orphanHistory = historyRows.filter((row) => !owners.has(row.userId)).length;
      const orphanResearchAttempts = researchRows.filter((row) => !owners.has(row.userId)
        || !turnRows.some((turn) => turn.userId === row.userId
          && turn.turnId === row.turnId
          && turn.leaseId === row.leaseId)).length;
      const invalidResearchAttempts = researchRows.filter((row) => {
        const parsed = researchAttemptSchema.safeParse(row.attempt);
        return !parsed.success || parsed.data.id !== row.id;
      }).length;
      const orphanDrafts = draftRows.filter((row) => !owners.has(row.userId)).length;
      const orphanTurns = turnRows.filter((row) => !owners.has(row.userId)).length;
      const orphanLeases = leaseRows.filter((row) => !owners.has(row.userId)).length;
      const orphanConversationMappings = mappingRows.filter((row) => !owners.has(row.userId)).length;
      const invalidLeases = leaseRows.filter((lease) => !turnRows.some(
        (turn) => turn.userId === lease.userId
          && turn.turnId === lease.turnId
          && turn.leaseId === lease.leaseId
          && turn.status === 'pending',
      )).length;
      const pendingTurnsWithoutLease = turnRows.filter((turn) => turn.status === 'pending'
        && !leaseRows.some((lease) => lease.userId === turn.userId
          && lease.turnId === turn.turnId
          && lease.leaseId === turn.leaseId)).length;
      const pendingErasureJobs = erasureRows.length;
      return {
        totalMaps: rows.length,
        invalidRecords,
        orphanHistory,
        orphanResearchAttempts,
        invalidResearchAttempts,
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

/**
 * @description
 * Centralised database schema, shared validation, and shared TypeScript types
 * for the Purpose Finder application.
 *
 * 🔄 **2025-06-25 UPDATE (Step 11)**
 * - Added `SelectChatMessage` export for use in backend AI chain logic.
 *
 * 🔄 **2025-06-25 UPDATE (Step 10.3)**
 * – Replaced the legacy nested-object questionnaire model with an
 * *array-of-pairs* structure so each answer retains its original
 * question wording:
 *
 * {
 * passions: [ { question: string, answer: string }, … ],
 * skills:   [ { question: string, answer: string }, … ],
 * values:   [ { question: string, answer: string }, … ],
 * economic: [ { question: string, answer: string }, … ]
 * }
 *
 * This change preserves full context for downstream AI prompts while
 * remaining agnostic to question ordering or wording tweaks.
 *
 * Scope:
 * - Drizzle ORM table definitions (server only)
 * - Zod schemas shared by both client & server
 * - Inferred TypeScript types exported for type-safety
 *
 * IMPORTANT: **Do NOT** import runtime code from this file directly in
 * client-side modules—always use `import type { … }` to ensure tree-shaking
 * removes Drizzle/Node-only code from the browser bundle.
 *
 * @notes
 * - All previous exports remain intact; only the questionnaire shape changed.
 */

import {
  pgTable,
  text,
  serial,
  integer,
  jsonb,
  timestamp,
  pgEnum,
  boolean,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import type {
  CareerMap,
  OperationReceipt,
  ResearchAttempt,
  ResearchSourceAssociation,
  UserActionProvenance,
} from './career-map/index.js';

/* -------------------------------------------------------------------------- */
/* ENUM DEFINITIONS                              */
/* -------------------------------------------------------------------------- */

export const languageEnum = pgEnum('language_enum', ['en', 'es']);
export const agentTurnStatusEnum = pgEnum('agent_turn_status', [
  'pending',
  'completed',
  'cancelled',
  'failed',
]);
export const erasureStatusEnum = pgEnum('method_erasure_status', [
  'pending-provider',
  'failed-provider',
]);

/* -------------------------------------------------------------------------- */
/* SHARED ZOD SCHEMAS & TYPES                       */
/* -------------------------------------------------------------------------- */

/**
 * @description Zod schema for a single { question, answer } pair.
 * Both fields are required non-empty strings.
 */
export const questionAnswerPairSchema = z.object({
  /** Exact wording of the question the user saw. */
  question: z.string().min(1),
  /** User-supplied free-text answer. */
  answer: z.string().min(1),
});
export type QuestionAnswerPair = z.infer<typeof questionAnswerPairSchema>;

/**
 * @description
 * User questionnaire payload schema **(UPDATED in Step 10.3)**.
 *
 * Each category now stores an *array* of `{ question, answer }` objects,
 * preserving full context for the AI and allowing the UI to evolve without
 * breaking the validation layer.
 */
export const questionnaireResponsesSchema = z.object({
  passions: z.array(questionAnswerPairSchema).min(1),
  skills: z.array(questionAnswerPairSchema).min(1),
  values: z.array(questionAnswerPairSchema).min(1),
  economic: z.array(questionAnswerPairSchema).min(1),
});
export type QuestionnaireResponses = z.infer<
  typeof questionnaireResponsesSchema
>;

/* ----------------------- Action-plan-specific schemas ---------------------- */

export const skillToLearnSchema = z.object({
  skill: z.string(),
});
export type SkillToLearn = z.infer<typeof skillToLearnSchema>;

// === NEW ▶ Milestone-based Action-Plan schema (Step 3) ===
export const milestoneSchema = z.object({
  /** A short, evocative headline for this phase of the plan. */
  title: z.string(),
  /** Human-readable timeframe, e.g. "Weeks 1-2" or "Q4 2025". */
  timeline: z.string(),
  /** Concrete, atomic tasks the user must complete. */
  actions: z.array(z.string()).min(1),
  /** Optional skills (with learning resources) relevant to this milestone. */
  skills: z.array(skillToLearnSchema).optional().default([]),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const actionPlanSchema = z.object({
  /** Ordered list of milestones forming a coherent roadmap. */
  milestones: z.array(milestoneSchema).min(1),
});
export type ActionPlan = z.infer<typeof actionPlanSchema>;

/* -------------------------------------------------------------------------- */
/* DRIZZLE TABLES (DB)                            */
/* -------------------------------------------------------------------------- */
/* (unchanged from previous revision – omitted inline comments for brevity)   */

export const assessmentSessions = pgTable('assessment_sessions', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull().unique(),
  language: languageEnum('language').notNull(),
  responses: jsonb('responses'), // Questionnaire answers (new shape)
  coreDriversAnalysis: jsonb('core_drivers_analysis'),
  chosenPathId: integer('chosen_path_id'),
  actionPlan: jsonb('action_plan').$type<ActionPlan>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const purposePaths = pgTable('purpose_paths', {
  id: serial('id').primaryKey(),
  assessmentId: integer('assessment_id')
    .notNull()
    .references(() => assessmentSessions.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  ikigaiAlignment: jsonb('ikigai_alignment'),
  actionStrategy: text('action_strategy'),
});

/**
 * @description Analytics events table for tracking user funnel progression.
 * Stores lightweight events with optional metadata for calculating success metrics.
 */
export const analyticsEvents = pgTable('analytics_events', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  eventType: text('event_type').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Durable, owner-scoped Method product memory. */
export const careerMaps = pgTable('career_maps', {
  userId: text('user_id').primaryKey(),
  schemaVersion: integer('schema_version').notNull(),
  revision: integer('revision').notNull().default(0),
  document: jsonb('document').$type<CareerMap>().notNull(),
  repairRequired: boolean('repair_required').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  revisionNonnegative: check('career_maps_revision_nonnegative', sql`${table.revision} >= 0`),
  schemaVersionPositive: check('career_maps_schema_version_positive', sql`${table.schemaVersion} > 0`),
}));

/** One append-only database result for every committed map revision. */
export const careerMapHistory = pgTable('career_map_history', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => careerMaps.userId, { onDelete: 'cascade' }),
  operationSourceId: text('operation_source_id').notNull(),
  operationType: text('operation_type').notNull(),
  payloadFingerprint: text('payload_fingerprint').notNull(),
  baseRevision: integer('base_revision').notNull(),
  resultRevision: integer('result_revision').notNull(),
  result: jsonb('result').$type<OperationReceipt>().notNull(),
  confirmationProvenance: jsonb('confirmation_provenance').$type<UserActionProvenance>(),
  moduleVersion: text('module_version').notNull(),
  committedAt: timestamp('committed_at', { withTimezone: true }).notNull(),
}, (table) => ({
  operationIdentity: uniqueIndex('career_map_history_user_operation_unique')
    .on(table.userId, table.operationSourceId),
  resultRevision: uniqueIndex('career_map_history_user_revision_unique')
    .on(table.userId, table.resultRevision),
  ownerIndex: index('career_map_history_user_idx').on(table.userId),
  revisionOrder: check(
    'career_map_history_revision_order',
    sql`${table.resultRevision} = ${table.baseRevision} + 1`,
  ),
}));

/** Provider-search bookkeeping that cannot become a canonical proposal by itself. */
export const careerMapResearchAttempts = pgTable('career_map_research_attempts', {
  id: text('id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => careerMaps.userId, { onDelete: 'cascade' }),
  turnId: text('turn_id').notNull(),
  leaseId: text('lease_id').notNull(),
  attempt: jsonb('attempt').$type<ResearchAttempt>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  identity: uniqueIndex('career_map_research_user_id_unique').on(table.userId, table.id),
  ownerIndex: index('career_map_research_user_idx').on(table.userId),
  turnIndex: index('career_map_research_turn_idx').on(table.userId, table.turnId, table.leaseId),
}));

/** Exact claim/source bindings committed atomically with their canonical map revision. */
export const careerMapEvidenceAssociations = pgTable('career_map_evidence_associations', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => careerMaps.userId, { onDelete: 'cascade' }),
  attemptId: text('attempt_id').notNull(),
  turnId: text('turn_id').notNull(),
  leaseId: text('lease_id').notNull(),
  operationSourceId: text('operation_source_id').notNull(),
  resultRevision: integer('result_revision').notNull(),
  sourceHandle: text('source_handle').notNull(),
  association: jsonb('association').$type<ResearchSourceAssociation>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sourceIdentity: uniqueIndex('career_map_evidence_user_source_unique')
    .on(table.userId, table.sourceHandle),
  revisionIndex: index('career_map_evidence_user_revision_idx')
    .on(table.userId, table.resultRevision),
  attemptIndex: index('career_map_evidence_user_attempt_idx')
    .on(table.userId, table.attemptId),
  resultRevisionPositive: check(
    'career_map_evidence_result_revision_positive',
    sql`${table.resultRevision} > 0`,
  ),
}));

/** Human-controlled draft material; no operation sends or publishes it. */
export const careerMapDrafts = pgTable('career_map_drafts', {
  id: text('id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => careerMaps.userId, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  content: jsonb('content').$type<unknown>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  identity: uniqueIndex('career_map_drafts_user_id_unique').on(table.userId, table.id),
  ownerIndex: index('career_map_drafts_user_idx').on(table.userId),
}));

/** Per-user fencing lease shared by streamed turns and workspace operations. */
export const agentTurnLeases = pgTable('agent_turn_leases', {
  userId: text('user_id')
    .primaryKey()
    .references(() => careerMaps.userId, { onDelete: 'cascade' }),
  leaseId: text('lease_id').notNull(),
  turnId: text('turn_id').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => ({
  expiryIndex: index('agent_turn_leases_expiry_idx').on(table.expiresAt),
  positiveLifetime: check(
    'agent_turn_leases_above_platform_cap',
    sql`${table.expiresAt} > ${table.acquiredAt} + interval '300 seconds'`,
  ),
}));

/** Durable client-message identity and terminal outcome for attach/recovery. */
export const agentTurns = pgTable('agent_turns', {
  turnId: text('turn_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => careerMaps.userId, { onDelete: 'cascade' }),
  clientMessageId: text('client_message_id').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  origin: text('origin').$type<'agent-turn' | 'workspace-action'>().notNull(),
  leaseId: text('lease_id').notNull(),
  status: agentTurnStatusEnum('status').notNull().default('pending'),
  terminalResult: jsonb('terminal_result').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  terminalAt: timestamp('terminal_at', { withTimezone: true }),
}, (table) => ({
  clientIdentity: uniqueIndex('agent_turns_user_message_unique')
    .on(table.userId, table.clientMessageId),
  leaseIdentity: uniqueIndex('agent_turns_user_lease_unique')
    .on(table.userId, table.leaseId),
  ownerIndex: index('agent_turns_user_idx').on(table.userId),
  terminalConsistency: check(
    'agent_turns_terminal_consistency',
    sql`(${table.status} = 'pending' AND ${table.terminalAt} IS NULL) OR (${table.status} <> 'pending' AND ${table.terminalAt} IS NOT NULL)`,
  ),
  validOrigin: check(
    'agent_turns_valid_origin',
    sql`${table.origin} IN ('agent-turn', 'workspace-action')`,
  ),
}));

/** Server-side Conversation ownership; never accepts a client-supplied owner. */
export const agentConversationMappings = pgTable('agent_conversation_mappings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => careerMaps.userId, { onDelete: 'cascade' }),
  conversationId: text('conversation_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Non-content retry marker retained only while provider erasure is incomplete. */
export const methodErasureJobs = pgTable('method_erasure_jobs', {
  userId: text('user_id').primaryKey(),
  jobId: text('job_id').notNull().unique(),
  conversationId: text('conversation_id'),
  status: erasureStatusEnum('status').notNull(),
  errorClass: text('error_class'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------- DRIZZLE RELATIONS ---------------------------- */

export const assessmentSessionRelations = relations(
  assessmentSessions,
  ({ one, many }) => ({
    purposePaths: many(purposePaths),
    chosenPath: one(purposePaths, {
      fields: [assessmentSessions.chosenPathId],
      references: [purposePaths.id],
    }),
  }),
);

export const purposePathRelations = relations(
  purposePaths,
  ({ one }) => ({
    assessmentSession: one(assessmentSessions, {
      fields: [purposePaths.assessmentId],
      references: [assessmentSessions.id],
    }),
  }),
);




/* -------------------------------------------------------------------------- */
/* ZOD ↔ DRIZZLE-GENERATED INSERT/SELECT SCHEMAS                 */
/* -------------------------------------------------------------------------- */

export const insertAssessmentSessionSchema =
  createInsertSchema(assessmentSessions);
export const selectAssessmentSessionSchema =
  createSelectSchema(assessmentSessions);
export type SelectAssessmentSession = z.infer<
  typeof selectAssessmentSessionSchema
>;

export const insertPurposePathSchema = createInsertSchema(purposePaths);
export const selectPurposePathSchema = createSelectSchema(purposePaths);
export type SelectPurposePath = z.infer<typeof selectPurposePathSchema>;

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents);
export const selectAnalyticsEventSchema = createSelectSchema(analyticsEvents);
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type SelectAnalyticsEvent = z.infer<typeof selectAnalyticsEventSchema>;

/* -------------------------------------------------------------------------- */
/* API-LEVEL REQUEST SCHEMAS                        */
/* -------------------------------------------------------------------------- */

export const analysisRequestSchema = z.object({
  sessionId: z.string().min(1),
  language: z.enum(['en', 'es']),
  responses: questionnaireResponsesSchema,
});
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

export const actionPlanRequestSchema = z.object({
  sessionId: z.string().min(1),
  chosenPathId: z.number(),
});
export type ActionPlanRequest = z.infer<typeof actionPlanRequestSchema>;

export const startOverRequestSchema = z.object({
  sessionId: z.string().min(1),
  fromPage: z.enum(['results', 'action-plan']).optional(),
});
export type StartOverRequest = z.infer<typeof startOverRequestSchema>;

/**
 * Generic ActionState helper for API responses.
 */
export type ActionState<T> =
  | { isSuccess: true; message: string; data: T }
  | { isSuccess: false; message: string; data?: never };

/* -------------------------------------------------------------------------- */
/* SHARED LITERAL TYPES                           */
/* -------------------------------------------------------------------------- */

export type Language = 'en' | 'es';

/**
 * @description Analytics event types for tracking user funnel progression.
 * Shared between frontend hook and backend validation to prevent drift.
 */
export const ANALYTICS_EVENT_TYPES = [
  'visit',
  'start',
  'section',
  'export',
  'start_over',
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];
export type PurposePath = SelectPurposePath;
export type AssessmentSession = SelectAssessmentSession;
export type InsertAssessmentSession = z.infer<typeof insertAssessmentSessionSchema>;
export type InsertPurposePath = z.infer<typeof insertPurposePathSchema>;

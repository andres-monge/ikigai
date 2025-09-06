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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* ENUM DEFINITIONS                              */
/* -------------------------------------------------------------------------- */

export const languageEnum = pgEnum('language_enum', ['en', 'es']);

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

export const youtubeVideoSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  /** Medium-quality thumbnail URL for display purposes. */
  thumbnailUrl: z.string().url(),
});
export type YoutubeVideo = z.infer<typeof youtubeVideoSchema>;

export const skillToLearnSchema = z.object({
  skill: z.string(),
  /** 
   * YouTube learning videos for this skill. 
   * Empty arrays are allowed for graceful degradation when YouTube API fails
   * or no suitable videos are found, ensuring action plans are still delivered
   * even when video enrichment is unavailable.
   */
  youtubeLinks: z.array(youtubeVideoSchema),
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
export type PurposePath = SelectPurposePath;
export type AssessmentSession = SelectAssessmentSession;
export type InsertAssessmentSession = z.infer<typeof insertAssessmentSessionSchema>;
export type InsertPurposePath = z.infer<typeof insertPurposePathSchema>;
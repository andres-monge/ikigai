/**
 * @description
 * Central Drizzle + Zod schema for Purpose Finder.
 * Defines Postgres tables, FK relationships, and run-time validation.
 *
 * Key features
 * ─────────────
 * • 4 inter-related tables covering the full user journey  
 * • Strict FK constraints with ON CASCADE / ON SET NULL behaviour  
 * • Timestamp columns auto-maintained by Postgres (`defaultNow` + `onUpdateNow`)  
 * • `createInsertSchema` / `createSelectSchema` for type-safe inserts & selects  
 *
 * @dependencies
 * • drizzle-orm/pg-core – table & column DSL  
 * • drizzle-zod           – Drizzle → Zod bridge  
 * • zod                  – run-time validation  
 *
 * @notes
 * • Column names are **snake_case** to match SQL convention; camelCase is used
 *   only in TypeScript where appropriate.  
 * • When we migrate from MemStorage to Postgres the DB will auto-fill timestamps,
 *   but the in-memory adapter still stamps ISO strings for compatibility.  
 */

import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ────────────────────────────────────────────────────────────
// TABLES
// ────────────────────────────────────────────────────────────

/**
 * `assessment_sessions`
 * Top-level record tracking a user’s entire flow from questionnaire to action plan.
 */
export const assessmentSessions = pgTable("assessment_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  language: text("language").$type<"en" | "es">().notNull(),
  responses: jsonb("responses"), // questionnaire answers
  coreDriversAnalysis: jsonb("core_drivers_analysis"),
  chosenPathId: integer("chosen_path_id").references(
    () => purposePaths.id,
    { onDelete: "set null" }
  ),
  actionPlan: jsonb("action_plan"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .onUpdateNow()
    .notNull(),
});

/**
 * `purpose_paths`
 * Three AI-generated career directions per session.
 */
export const purposePaths = pgTable("purpose_paths", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .references(() => assessmentSessions.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  description: text("description"),
  ikigaiAlignment: jsonb("ikigai_alignment"),
  actionStrategy: text("action_strategy"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * `salary_data`
 * Real-time pay benchmarks linked to a single purpose path.
 */
export const salaryData = pgTable("salary_data", {
  id: serial("id").primaryKey(),
  pathId: integer("path_id")
    .references(() => purposePaths.id, { onDelete: "cascade" })
    .notNull(),
  entryLevel: text("entry_level"),
  midLevel: text("mid_level"),
  seniorLevel: text("senior_level"),
  location: text("location"),
  sources: text("sources").array(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true })
    .defaultNow()
    .onUpdateNow()
    .notNull(),
});

/**
 * `chat_messages`
 * All user ⇄ Nami exchanges, context-tagged.
 */
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .references(() => assessmentSessions.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  context: text("context"), // discovery | action_plan
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ────────────────────────────────────────────────────────────
// DRIZZLE-INFERRED TYPES
// ────────────────────────────────────────────────────────────

export type AssessmentSession = typeof assessmentSessions.$inferSelect;
export type PurposePath = typeof purposePaths.$inferSelect;
export type SalaryDatum = typeof salaryData.$inferSelect;   // singular for clarity
export type ChatMessage = typeof chatMessages.$inferSelect;

export type InsertAssessmentSession = typeof assessmentSessions.$inferInsert;
export type InsertPurposePath = typeof purposePaths.$inferInsert;
export type InsertSalaryDatum = typeof salaryData.$inferInsert;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// ────────────────────────────────────────────────────────────
// COMPLEX JSON SCHEMAS
// ────────────────────────────────────────────────────────────

export const ikigaiAlignmentSchema = z.object({
  love: z.string(),
  goodAt: z.string(),
  worldNeeds: z.string(),
  pay: z.string(),
});

export const coreDriversAnalysisSchema = z.object({
  energy: z.string(),
  edge: z.string(),
  impact: z.string(),
  economic: z.string(),
});

export const actionPlanSchema = z.object({
  overview: z.string(),
  milestones: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      timeframe: z.string(),
      tasks: z.array(z.string()),
    })
  ),
  skills: z.array(
    z.object({
      name: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      resources: z.array(z.string()),
    })
  ),
  projects: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    })
  ),
  networking: z.array(z.string()),
  resources: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      type: z.enum(["course", "book", "article", "video", "community"]),
    })
  ),
});

// ────────────────────────────────────────────────────────────
// API PAYLOAD VALIDATORS
// ────────────────────────────────────────────────────────────

export const questionnaireResponseSchema = z.object({
  sessionId: z.string().min(1),
  step: z.number().int().min(1).max(10),
  responses: z.record(z.any()),
});

export const chatRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
  context: z.enum(["discovery", "action_plan"]).optional(),
});

export const analysisRequestSchema = z.object({
  sessionId: z.string().min(1),
  responses: z.record(z.any()),
});

export const actionPlanRequestSchema = z.object({
  sessionId: z.string().min(1),
  chosenPathId: z.number().int().positive(),
});

// ────────────────────────────────────────────────────────────
// INSERT / SELECT SCHEMAS (DRIZZLE-ZOD)
// ────────────────────────────────────────────────────────────

export const insertAssessmentSessionSchema = createInsertSchema(
  assessmentSessions,
  {
    language: z.enum(["en", "es"]),
    responses: z.record(z.any()).optional(),
    coreDriversAnalysis: coreDriversAnalysisSchema.optional(),
    actionPlan: actionPlanSchema.optional(),
  }
).omit({ id: true, createdAt: true, updatedAt: true });

export const selectAssessmentSessionSchema =
  createSelectSchema(assessmentSessions);

export const insertPurposePathSchema = createInsertSchema(purposePaths, {
  ikigaiAlignment: ikigaiAlignmentSchema.optional(),
}).omit({ id: true, createdAt: true });

export const selectPurposePathSchema = createSelectSchema(purposePaths);

export const insertSalaryDataSchema = createInsertSchema(salaryData, {
  sources: z.array(z.string().url()).optional(),
}).omit({ id: true, retrievedAt: true });

export const selectSalaryDataSchema = createSelectSchema(salaryData);

export const insertChatMessageSchema = createInsertSchema(chatMessages, {
  role: z.enum(["user", "assistant"]),
  context: z.enum(["discovery", "action_plan"]).optional(),
}).omit({ id: true, createdAt: true });

export const selectChatMessageSchema = createSelectSchema(chatMessages);

// ────────────────────────────────────────────────────────────
// GENERIC ACTION-STATE TYPE
// ────────────────────────────────────────────────────────────

export type ActionState<T> =
  | { isSuccess: true; message: string; data: T }
  | { isSuccess: false; message: string };
// (data omitted on error)

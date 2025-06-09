
/**
 * @description 
 * This file defines the complete database schema for the Purpose Finder application using Drizzle ORM and Zod validation.
 * It establishes the foundational data structures for the ikigai assessment workflow including sessions, purpose paths, 
 * salary data, and chat messages.
 * 
 * Key features:
 * - Multi-table schema supporting the complete user journey from assessment to action plan
 * - Proper foreign key relationships and data normalization
 * - Comprehensive Zod schemas for API validation and type safety
 * - Support for both in-memory development and PostgreSQL production
 * 
 * @dependencies
 * - drizzle-orm/pg-core: PostgreSQL table definitions and column types
 * - drizzle-zod: Integration between Drizzle and Zod for schema validation
 * - zod: Runtime type validation and schema definition
 * 
 * @notes
 * - All timestamps use text format for compatibility with in-memory storage
 * - JSONB columns store complex nested data structures
 * - Foreign key relationships support CASCADE deletion for data consistency
 * - Schema is designed for seamless transition from MemStorage to PostgreSQL
 */

import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// =============================================================================
// DATABASE TABLES
// =============================================================================

/**
 * Main assessment sessions table - stores top-level session information
 * and tracks the user's journey through the ikigai discovery process
 */
export const assessmentSessions = pgTable("assessment_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  language: text("language").notNull(), // 'en' or 'es'
  responses: jsonb("responses"), // Initial questionnaire answers
  coreDriversAnalysis: jsonb("core_drivers_analysis"), // AI analysis of user's core drivers
  chosenPathId: integer("chosen_path_id"), // FK to purpose_paths.id, nullable until user chooses
  actionPlan: jsonb("action_plan"), // Detailed step-by-step action plan
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Purpose paths table - stores the three AI-generated career paths
 * Each session has exactly 3 paths generated from the ikigai analysis
 */
export const purposePaths = pgTable("purpose_paths", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(), // References assessment_sessions.session_id
  title: text("title").notNull(),
  description: text("description"),
  ikigaiAlignment: jsonb("ikigai_alignment"), // Contains love, goodAt, worldNeeds, pay alignment details
  actionStrategy: text("action_strategy"), // High-level strategy overview
  createdAt: text("created_at").notNull(),
});

/**
 * Salary data table - stores real-time salary information
 * Linked to specific purpose paths with source citations
 */
export const salaryData = pgTable("salary_data", {
  id: serial("id").primaryKey(),
  pathId: integer("path_id").notNull(), // FK to purpose_paths.id
  entryLevel: text("entry_level"),
  midLevel: text("mid_level"),
  seniorLevel: text("senior_level"),
  location: text("location"),
  sources: jsonb("sources").$type<string[]>(), // Array of URL strings for data sources
  retrievedAt: text("retrieved_at").notNull(),
});

/**
 * Chat messages table - stores all chat interactions with Nami
 * Supports context-aware conversations for both discovery and action plan refinement
 */
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(), // References assessment_sessions.session_id
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  context: text("context"), // 'discovery' or 'action_plan' - determines conversation focus
  timestamp: text("timestamp").notNull(),
});

// =============================================================================
// DRIZZLE SCHEMA INFERENCE TYPES
// =============================================================================

// Base table types for TypeScript inference
export type AssessmentSession = typeof assessmentSessions.$inferSelect;
export type PurposePath = typeof purposePaths.$inferSelect;
export type SalaryData = typeof salaryData.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Insert types for creating new records
export type InsertAssessmentSession = typeof assessmentSessions.$inferInsert;
export type InsertPurposePath = typeof purposePaths.$inferInsert;
export type InsertSalaryData = typeof salaryData.$inferInsert;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// =============================================================================
// ZOD VALIDATION SCHEMAS
// =============================================================================

/**
 * Core data structure schemas for complex JSONB fields
 */

// Schema for ikigai alignment analysis within purpose paths
export const ikigaiAlignmentSchema = z.object({
  love: z.string().describe("How this path aligns with what the user loves"),
  goodAt: z.string().describe("How this path leverages what the user is good at"),
  worldNeeds: z.string().describe("How this path addresses what the world needs"),
  pay: z.string().describe("Salary range and economic viability"),
});

// Schema for core drivers analysis from AI
export const coreDriversAnalysisSchema = z.object({
  energy: z.string().describe("What energizes the user - their passions and interests"),
  edge: z.string().describe("The user's unique strengths and advantages"),
  impact: z.string().describe("How the user wants to make a difference in the world"),
  economic: z.string().describe("Economic reality and financial considerations"),
});

// Schema for detailed action plan structure
export const actionPlanSchema = z.object({
  overview: z.string().describe("High-level summary of the action plan"),
  milestones: z.array(z.object({
    title: z.string(),
    description: z.string(),
    timeframe: z.string(),
    tasks: z.array(z.string()),
  })).describe("Key milestones in the career transition"),
  skills: z.array(z.object({
    name: z.string(),
    priority: z.enum(["high", "medium", "low"]),
    resources: z.array(z.string()),
  })).describe("Skills to develop with learning resources"),
  projects: z.array(z.object({
    title: z.string(),
    description: z.string(),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  })).describe("Hands-on projects to build experience"),
  networking: z.array(z.string()).describe("Networking and community engagement strategies"),
  resources: z.array(z.object({
    title: z.string(),
    url: z.string(),
    type: z.enum(["course", "book", "article", "video", "community"]),
  })).describe("Educational resources including YouTube courses"),
});

// =============================================================================
// API REQUEST/RESPONSE SCHEMAS
// =============================================================================

/**
 * Input validation schemas for API endpoints
 */

// Schema for questionnaire submission
export const questionnaireResponseSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  step: z.number().int().min(1).max(10, "Step must be between 1 and 10"),
  responses: z.record(z.any()).describe("User responses keyed by question ID"),
});

// Schema for chat requests with context awareness
export const chatRequestSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  message: z.string().min(1, "Message cannot be empty"),
  context: z.enum(["discovery", "action_plan"]).optional().describe("Chat context for AI focus"),
});

// Schema for analysis requests
export const analysisRequestSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  responses: z.record(z.any()).describe("Complete questionnaire responses"),
});

// Schema for action plan generation requests
export const actionPlanRequestSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  chosenPathId: z.number().int().positive("Valid path ID is required"),
});

// =============================================================================
// DRIZZLE-ZOD INTEGRATION SCHEMAS
// =============================================================================

/**
 * Auto-generated Zod schemas from Drizzle table definitions
 * These provide runtime validation for database operations
 */

// Assessment session schemas
export const insertAssessmentSessionSchema = createInsertSchema(assessmentSessions, {
  language: z.enum(["en", "es"]),
  responses: z.record(z.any()).optional(),
  coreDriversAnalysis: coreDriversAnalysisSchema.optional(),
  actionPlan: actionPlanSchema.optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectAssessmentSessionSchema = createSelectSchema(assessmentSessions);

// Purpose path schemas
export const insertPurposePathSchema = createInsertSchema(purposePaths, {
  ikigaiAlignment: ikigaiAlignmentSchema.optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const selectPurposePathSchema = createSelectSchema(purposePaths);

// Salary data schemas
export const insertSalaryDataSchema = createInsertSchema(salaryData, {
  sources: z.array(z.string().url()).optional(),
}).omit({
  id: true,
  retrievedAt: true,
});

export const selectSalaryDataSchema = createSelectSchema(salaryData);

// Chat message schemas
export const insertChatMessageSchema = createInsertSchema(chatMessages, {
  role: z.enum(["user", "assistant"]),
  context: z.enum(["discovery", "action_plan"]).optional(),
}).omit({
  id: true,
});

export const selectChatMessageSchema = createSelectSchema(chatMessages);

// =============================================================================
// UTILITY TYPES AND ACTION STATE
// =============================================================================

/**
 * Generic action state type for consistent API responses
 * Provides a standard success/error pattern across all endpoints
 */
export type ActionState<T> =
  | { isSuccess: true; message: string; data: T }
  | { isSuccess: false; message: string; data?: never };

/**
 * Exported type aliases for easier imports throughout the application
 */
export type QuestionnaireResponse = z.infer<typeof questionnaireResponseSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
export type ActionPlanRequest = z.infer<typeof actionPlanRequestSchema>;
export type IkigaiAlignment = z.infer<typeof ikigaiAlignmentSchema>;
export type CoreDriversAnalysis = z.infer<typeof coreDriversAnalysisSchema>;
export type ActionPlan = z.infer<typeof actionPlanSchema>;

/**
 * Language type for internationalization
 */
export type Language = "en" | "es";

// =============================================================================
// SCHEMA VALIDATION HELPERS
// =============================================================================

/**
 * Helper function to validate and parse questionnaire responses
 * @param data - Raw questionnaire data from frontend
 * @returns Parsed and validated questionnaire response
 */
export function validateQuestionnaireResponse(data: unknown): QuestionnaireResponse {
  return questionnaireResponseSchema.parse(data);
}

/**
 * Helper function to validate and parse chat requests
 * @param data - Raw chat request data from frontend
 * @returns Parsed and validated chat request
 */
export function validateChatRequest(data: unknown): ChatRequest {
  return chatRequestSchema.parse(data);
}

/**
 * Helper function to validate and parse analysis requests
 * @param data - Raw analysis request data from frontend
 * @returns Parsed and validated analysis request
 */
export function validateAnalysisRequest(data: unknown): AnalysisRequest {
  return analysisRequestSchema.parse(data);
}

/**
 * Helper function to validate and parse action plan requests
 * @param data - Raw action plan request data from frontend
 * @returns Parsed and validated action plan request
 */
export function validateActionPlanRequest(data: unknown): ActionPlanRequest {
  return actionPlanRequestSchema.parse(data);
}

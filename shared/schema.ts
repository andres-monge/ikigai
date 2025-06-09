import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const assessmentSessions = pgTable("assessment_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  responses: jsonb("responses"),
  analysis: jsonb("analysis"),
  purposePaths: jsonb("purpose_paths"),
  salaryData: jsonb("salary_data"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  timestamp: text("timestamp").notNull(),
});

export const insertAssessmentSessionSchema = createInsertSchema(assessmentSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
});

export type InsertAssessmentSession = z.infer<typeof insertAssessmentSessionSchema>;
export type AssessmentSession = typeof assessmentSessions.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Additional schemas for API validation
export const questionnaireResponseSchema = z.object({
  sessionId: z.string(),
  step: z.number(),
  responses: z.record(z.any()),
});

export const chatRequestSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
});

export const analysisRequestSchema = z.object({
  sessionId: z.string(),
  responses: z.record(z.any()),
});

export type QuestionnaireResponse = z.infer<typeof questionnaireResponseSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

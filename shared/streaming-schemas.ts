/**
 * @file streaming-schemas.ts
 * @description Single source of truth for Zod schemas used in AI streaming.
 * 
 * This file contains ONLY the Zod schemas needed by both frontend (useObject hooks)
 * and backend (streamObject chains). It is browser-safe and contains NO Node.js 
 * or Drizzle ORM dependencies.
 * 
 * ⚠️ IMPORTANT: This is the single source of truth for streaming schemas.
 * Any changes to streaming data structures must be made here to prevent 
 * drift between frontend and backend.
 * 
 * @dependencies
 * - zod: Runtime validation schemas (browser-safe)
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* PURPOSE DISCOVERY STREAMING SCHEMA                                        */
/* -------------------------------------------------------------------------- */

/**
 * Zod schema for purpose discovery AI streaming results.
 * Used by both frontend useObject hooks and backend streamObject chains.
 */
export const purposeDiscoveryResultSchema = z.object({
  coreDriversAnalysis: z.object({
    statementSentence: z.string(),
    coreThreads: z.string(),
  }),
  purposePaths: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        ikigaiAlignment: z.object({
          love: z.string(),
          goodAt: z.string(),
          meaning: z.string(),
          pay: z.string(),
        }),
        actionStrategy: z.string(),
      }),
    )
    .length(3, 'The AI must generate exactly 3 purpose paths.'),
});

export type PurposeDiscoveryResult = z.infer<typeof purposeDiscoveryResultSchema>;

/* -------------------------------------------------------------------------- */
/* ACTION PLAN STREAMING SCHEMA                                              */
/* -------------------------------------------------------------------------- */

/**
 * Skill to learn schema.
 */
const skillToLearnSchema = z.object({
  skill: z.string(),
});

/**
 * Milestone schema for action plan roadmap.
 */
const milestoneSchema = z.object({
  title: z.string(),
  timeline: z.string(),
  actions: z.array(z.string()).min(1),
  checkpoint: z.string(),
  skills: z.array(skillToLearnSchema).optional(),
});

/**
 * Zod schema for action plan AI streaming results.
 * Used by both frontend useObject hooks and backend streamObject chains.
 */
export const actionPlanResultSchema = z.object({
  milestones: z.array(milestoneSchema).min(1),
});

export type ActionPlanResult = z.infer<typeof actionPlanResultSchema>;
export type SkillToLearn = z.infer<typeof skillToLearnSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
/**
 * @description
 * This file contains all Zod validation schemas and OpenAPI schemas used by the AI chains.
 * Extracted from chains.ts to isolate data structure definitions from orchestration logic.
 * 
 * @dependencies
 * - zod: For runtime validation schemas
 * - @shared/schema: For shared application schemas
 */

import { z } from 'zod';
import { actionPlanSchema } from '@shared/schema';

// ========= INTERNAL ZOD SCHEMAS FOR AI OUTPUT VALIDATION =========

export const salaryFunctionArgSchema = z.object({
  careers: z
    .array(
      z.object({
        title: z.string().describe('The job title, e.g., "Software Engineer"'),
        location: z
          .string()
          .describe('The city or region for the salary, e.g., "London"'),
      }),
    )
    .min(1),
});
export type SalaryFunctionArgs = z.infer<typeof salaryFunctionArgSchema>;

export const rawSalaryDataSchema = z.object({
  title: z.string(),
  location: z.string(),
  salaryRange: z.string(),
  sources: z.array(z.string().url()),
});
export type RawSalaryData = z.infer<typeof rawSalaryDataSchema>;

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
          worldNeeds: z.string(),
          pay: z.string(),
        }),
        actionStrategy: z.string(),
      }),
    )
    .length(3, 'The AI must generate exactly 3 purpose paths.'),
});
export type PurposeDiscoveryResult = z.infer<
  typeof purposeDiscoveryResultSchema
>;

// Zod schema for the result of the Action Plan chain, mirroring shared/schema.ts
export const actionPlanResultSchema = actionPlanSchema;
export type ActionPlanResult = z.infer<typeof actionPlanResultSchema>;

export const youtubeFunctionArgSchema = z.object({
  skills: z
    .array(z.string().describe("A specific skill to learn, e.g., 'React'"))
    .min(1),
});
export type YoutubeFunctionArgs = z.infer<typeof youtubeFunctionArgSchema>;

// ========= OPENAPI SCHEMAS FOR FORCED JSON OUTPUT =========

export const purposeDiscoveryOpenApiSchema = {
  type: 'OBJECT',
  properties: {
    coreDriversAnalysis: {
      type: 'OBJECT',
      properties: {
        statementSentence: {
          type: 'STRING',
          description:
            'A single, insightful statement sentence that presents the core threads and culminates in a summary of their core ikigai or "reason for being".',
        },
        coreThreads: {
          type: 'STRING',
          description:
            'A detailed explanation of the 2-3 core "threads" that connect their passions, skills, and values. It should start with an intro, then a markdown-formatted list of threads, and a conclusion. For example: "The threads that connect almost everything you\'ve listed are:\\n\\n1. **Thread 1.**\\n2. **Thread 2.**\\n\\nConclusion about other points."',
        },
      },
      required: ['statementSentence', 'coreThreads'],
    },
    purposePaths: {
      type: 'ARRAY',
      minItems: 3,
      maxItems: 3,
      description: 'An array of exactly three distinct career paths.',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Specific Career Path Title' },
          description: {
            type: 'STRING',
            description:
              'A short, compelling description of this path for the user.',
          },
          ikigaiAlignment: {
            type: 'OBJECT',
            properties: {
              love: {
                type: 'STRING',
                description: 'How this path aligns with their passions.',
              },
              goodAt: {
                type: 'STRING',
                description: 'How this path aligns with their skills.',
              },
              worldNeeds: {
                type: 'STRING',
                description: 'How this path meets a need in the world.',
              },
              pay: {
                type: 'STRING',
                description:
                  'How this path meets their economic needs, referencing the salary data.',
              },
            },
            required: ['love', 'goodAt', 'worldNeeds', 'pay'],
          },
          actionStrategy: {
            type: 'STRING',
            description:
              "A high-level strategy to get started (e.g., 'Bootstrapped MVP in 6 mo').",
          },
        },
        required: [
          'title',
          'description',
          'ikigaiAlignment',
          'actionStrategy',
        ],
      },
    },
  },
  required: ['coreDriversAnalysis', 'purposePaths'],
};

export const actionPlanOpenApiSchema = {
  type: 'OBJECT',
  properties: {
    milestones: {
      type: 'ARRAY',
      description:
        'An ordered list of milestones that together form a coherent roadmap toward the chosen path.',
      items: {
        type: 'OBJECT',
        properties: {
          title: {
            type: 'STRING',
            description: 'A short, compelling milestone headline.',
          },
          timeline: {
            type: 'STRING',
            description:
              'Human-readable timeframe for this milestone (e.g., "Weeks 1-2").',
          },
          actions: {
            type: 'ARRAY',
            description: 'Concrete, atomic tasks to complete in this milestone.',
            items: { type: 'STRING' },
          },
          skills: {
            type: 'ARRAY',
            description:
              'Optional list of skills relevant to this milestone, each with embedded YouTube resources.',
            items: {
              type: 'OBJECT',
              properties: {
                skill: { type: 'STRING' },
                youtubeLinks: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      title: { type: 'STRING' },
                      url: { type: 'STRING' },
                    },
                    required: ['title', 'url'],
                  },
                },
              },
              required: ['skill', 'youtubeLinks'],
            },
          },
        },
        required: ['title', 'timeline', 'actions'],
      },
    },
  },
  required: ['milestones'],
} as const;
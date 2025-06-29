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
    energy: z.string(),
    edge: z.string(),
    impact: z.string(),
    economicReality: z.string(),
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
        energy: {
          type: 'STRING',
          description: 'A summary of what energizes the user.',
        },
        edge: {
          type: 'STRING',
          description: "A summary of the user's unique skills and strengths.",
        },
        impact: {
          type: 'STRING',
          description:
            'A summary of the kind of impact the user wants to make.',
        },
        economicReality: {
          type: 'STRING',
          description:
            "A summary of the user's financial needs and timeline.",
        },
      },
      required: ['energy', 'edge', 'impact', 'economicReality'],
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
    sideProjectIdeas: {
      type: 'ARRAY',
      description:
        'A list of 2-3 simple, actionable side project ideas a beginner can build to practice their new skills.',
      items: { type: 'STRING' },
    },
    skillsToLearn: {
      type: 'ARRAY',
      description:
        'A list of the most important skills to learn for this path.',
      items: {
        type: 'OBJECT',
        properties: {
          skill: { type: 'STRING', description: 'The name of the skill.' },
          youtubeLinks: {
            type: 'ARRAY',
            description:
              'The exact, unmodified YouTube video data received from the function call for this skill.',
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
    peopleToNetworkWith: {
      type: 'ARRAY',
      description:
        'A list of 2-3 types of people, roles, or communities the user should connect with to learn more.',
      items: { type: 'STRING' },
    },
  },
  required: ['sideProjectIdeas', 'skillsToLearn', 'peopleToNetworkWith'],
};
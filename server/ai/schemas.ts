/**
 * @description
 * This file contains OpenAPI schemas and server-specific validation schemas.
 * 
 * Streaming result schemas have been moved to @shared/streaming-schemas for 
 * single source of truth between frontend and backend. This file re-exports
 * them for backward compatibility.
 * 
 * @dependencies
 * - zod: For runtime validation schemas
 * - @shared/streaming-schemas: For streaming result schemas
 */

import { z } from 'zod';

// ========= STREAMING SCHEMAS (RE-EXPORTED FROM SHARED) =========

// Re-export streaming schemas from shared location for backward compatibility
export {
  purposeDiscoveryResultSchema,
  actionPlanResultSchema,
  type PurposeDiscoveryResult,
  type ActionPlanResult
} from '@shared/streaming-schemas';

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
                  'How this path meets their economic needs with realistic salary information.',
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
              'Optional list of skills relevant to this milestone.',
            items: {
              type: 'OBJECT',
              properties: {
                skill: { type: 'STRING' },
              },
              required: ['skill'],
            },
          },
        },
        required: ['title', 'timeline', 'actions'],
      },
    },
  },
  required: ['milestones'],
} as const;
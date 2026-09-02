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
import {
  careerMapOperationSchemas,
  type CareerMapOperationType,
} from './career-map/operations';

/* -------------------------------------------------------------------------- */
/* METHOD UI TRANSPORT                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Correlation values are request-scoped transport tokens. Their deliberately
 * narrow grammar keeps user identifiers, prose, and provider payloads out of
 * browser-visible operation events.
 */
export const streamCorrelationIdSchema = z.string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:~-]*$/, 'Correlation id must be an opaque token.');

export const operationTerminalStatusSchema = z.enum([
  'Saved',
  'Conflict',
  'Rejected',
  'Failed',
]);

const operationCorrelationSchema = z.object({
  version: z.literal(1),
  turnId: streamCorrelationIdSchema,
  messageId: streamCorrelationIdSchema,
  operationId: streamCorrelationIdSchema,
  operation: z.custom<CareerMapOperationType>((value) => (
    typeof value === 'string' && Object.hasOwn(careerMapOperationSchemas, value)
  ), 'Unknown Career Map operation.'),
  authoritativeRevision: z.number().int().nonnegative().nullable(),
  errorClass: z.string().min(1).max(160)
    .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/, 'Error class must be a bounded opaque label.')
    .optional(),
  retryable: z.boolean().optional(),
});

export const operationStatusDataSchema = z.discriminatedUnion('status', [
  operationCorrelationSchema.extend({
    status: z.literal('Saving'),
    sequence: z.literal(0),
  }).strict(),
  operationCorrelationSchema.extend({
    status: operationTerminalStatusSchema,
    sequence: z.literal(1),
  }).strict(),
]);

export type OperationStatusData = z.infer<typeof operationStatusDataSchema>;

export const operationStatusStreamPartSchema = z.object({
  type: z.literal('data-operation-status'),
  id: streamCorrelationIdSchema,
  data: operationStatusDataSchema,
  transient: z.literal(true),
}).strict().superRefine((part, context) => {
  if (part.id !== part.data.operationId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['id'],
      message: 'Status part id must match its operation correlation.',
    });
  }
});

export type OperationStatusStreamPart = z.infer<typeof operationStatusStreamPartSchema>;

function sameOperation(
  left: OperationStatusData,
  right: OperationStatusData,
): boolean {
  return left.turnId === right.turnId
    && left.messageId === right.messageId
    && left.operationId === right.operationId;
}

/**
 * UI reducers use this guard before accepting a status event. A terminal event
 * is final, so delayed, duplicated, crossed-turn, and regressive events cannot
 * replace authoritative operation state.
 */
export function isOperationStatusTransition(
  previous: OperationStatusData | undefined,
  incoming: OperationStatusData,
): boolean {
  if (!operationStatusDataSchema.safeParse(incoming).success) return false;
  if (!previous) return incoming.status === 'Saving' && incoming.sequence === 0;
  if (!operationStatusDataSchema.safeParse(previous).success || !sameOperation(previous, incoming)) {
    return false;
  }
  return previous.status === 'Saving'
    && previous.sequence === 0
    && incoming.status !== 'Saving'
    && incoming.sequence === 1;
}

const browserSourceTitleSchema = z.string()
  .min(1)
  .max(500)
  .refine((title) => sanitizeBrowserSourceTitle(title) === title, 'Source title must be sanitized.');

function canonicalBrowserSourceUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Source URL must be absolute.');
  }
  if (parsed.protocol !== 'https:') throw new Error('Source URL must use HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Source URL must not contain credentials.');
  parsed.hash = '';
  return parsed.toString();
}

export function sanitizeBrowserSourceTitle(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 500);
}

const canonicalBrowserSourceUrlSchema = z.string()
  .min(1)
  .max(2_048)
  .url()
  .superRefine((value, context) => {
    try {
      if (canonicalBrowserSourceUrl(value) !== value) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Source URL must be canonical.' });
      }
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Source URL is invalid.',
      });
    }
  });

export const browserSourceUrlPartSchema = z.object({
  type: z.literal('source-url'),
  sourceId: streamCorrelationIdSchema,
  url: canonicalBrowserSourceUrlSchema,
  title: browserSourceTitleSchema.optional(),
}).strict();

export type BrowserSourceUrlPart = z.infer<typeof browserSourceUrlPartSchema>;

export function createBrowserSourceUrlPart(input: {
  sourceId: string;
  url: string;
  title?: string;
}): BrowserSourceUrlPart {
  const title = input.title === undefined ? undefined : sanitizeBrowserSourceTitle(input.title);
  return browserSourceUrlPartSchema.parse({
    type: 'source-url',
    sourceId: input.sourceId,
    url: canonicalBrowserSourceUrl(input.url),
    ...(title ? { title } : {}),
  });
}

const claimSpanStartSchema = z.number().int().nonnegative().max(1_000_000);
const claimSpanEndSchema = z.number().int().positive().max(1_000_000);

export const claimLinkedCitationSchema = z.object({
  version: z.literal(1),
  citationId: streamCorrelationIdSchema,
  turnId: streamCorrelationIdSchema,
  messageId: streamCorrelationIdSchema,
  textHash: z.string().regex(/^[a-f0-9]{64}$/u, 'Citation text hash must be SHA-256 hex.'),
  exactClaim: z.string().min(1).max(3_000)
    .refine((claim) => claim.normalize('NFC') === claim, 'Exact claim must be NFC-normalized.'),
  start: claimSpanStartSchema,
  end: claimSpanEndSchema,
  url: canonicalBrowserSourceUrlSchema,
  title: browserSourceTitleSchema.nullable(),
  support: z.enum(['server-validated', 'cited-provenance']),
}).strict().refine((citation) => citation.end > citation.start, {
  path: ['end'],
  message: 'Claim span must be non-empty.',
});

export type ClaimLinkedCitation = z.infer<typeof claimLinkedCitationSchema>;

/** Standard AI SDK source part paired with the richer claim association. */
export function citationToBrowserSourceUrlPart(citation: ClaimLinkedCitation): BrowserSourceUrlPart {
  return browserSourceUrlPartSchema.parse({
    type: 'source-url',
    sourceId: citation.citationId,
    url: citation.url,
    ...(citation.title ? { title: citation.title } : {}),
  });
}

export const claimLinkedCitationStreamPartSchema = z.object({
  type: z.literal('data-claim-citation'),
  id: streamCorrelationIdSchema,
  data: claimLinkedCitationSchema,
}).strict().superRefine((part, context) => {
  if (part.id !== part.data.citationId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['id'],
      message: 'Citation part id must match its citation correlation.',
    });
  }
});

export type ClaimLinkedCitationStreamPart = z.infer<typeof claimLinkedCitationStreamPartSchema>;

export type RevelioUIDataTypes = {
  operationStatus: OperationStatusData;
  claimCitation: ClaimLinkedCitation;
};

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

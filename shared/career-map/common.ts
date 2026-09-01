import { z } from 'zod';

export const entityIdSchema = z.string().min(1).max(160);
export const revisionSchema = z.number().int().positive();
export const mapRevisionSchema = z.number().int().nonnegative();
export const timestampSchema = z.string().datetime({ offset: true });

export const modelPresentationSchema = z.object({
  kind: z.literal('model-presentation'),
  assistantTurnId: entityIdSchema,
  turnSequence: z.number().int().nonnegative(),
  completed: z.literal(true),
  presentedAt: timestampSchema,
}).strict();

export const userActionProvenanceSchema = z.object({
  kind: z.enum(['user-message', 'ui-action']),
  actionId: entityIdSchema,
  turnId: entityIdSchema,
  turnSequence: z.number().int().nonnegative(),
  occurredAt: timestampSchema,
}).strict();

export const userEvidenceProvenanceSchema = z.discriminatedUnion('kind', [
  userActionProvenanceSchema.extend({ kind: z.literal('user-message') }).strict(),
  userActionProvenanceSchema.extend({ kind: z.literal('ui-action') }).strict(),
  z.object({
    kind: z.literal('user-source'),
    actionId: entityIdSchema,
    sourceLabel: z.string().min(1).max(500),
    occurredAt: timestampSchema,
  }).strict(),
]);

export const confirmationSchema = z.object({
  targetId: entityIdSchema,
  targetRevision: revisionSchema,
  presentedInTurnId: entityIdSchema,
  confirmedBy: userActionProvenanceSchema,
}).strict();

export const revisionRefSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
}).strict();

const citedResearchBaseSchema = z.object({
  kind: z.literal('cited-research'),
  sourceHandle: entityIdSchema,
  url: z.string().url().refine((value) => value.startsWith('https://'), 'Research sources must use HTTPS.'),
  retrievedAt: timestampSchema,
  title: z.string().min(1).max(1_000).optional(),
});

export const sourceProvenanceSchema = z.union([
  z.object({
    kind: z.literal('user-supplied-source'),
    label: z.string().min(1).max(500),
    url: z.string().url()
      .refine((value) => value.startsWith('https://'), 'User sources must use HTTPS.')
      .optional(),
    recordedBy: userActionProvenanceSchema,
  }).strict(),
  citedResearchBaseSchema.extend({
    support: z.literal('server-validated'),
    providerResultId: entityIdSchema,
    excerpt: z.string().min(1).max(4_000),
  }).strict(),
  citedResearchBaseSchema.extend({
    support: z.literal('cited-provenance'),
    providerResultId: entityIdSchema.optional(),
    excerpt: z.string().min(1).max(4_000).optional(),
  }).strict(),
]);

/**
 * Minimal, non-conclusive record of an isolated research attempt. Failed or
 * insufficient attempts live outside exact-three proposal invariants so a
 * retry can resume without inventing a canonical path, project, peer, or
 * route. Raw queries and retrieved bodies are intentionally not retained.
 */
export const researchAttemptSchema = z.object({
  id: entityIdSchema,
  status: z.enum(['pending', 'succeeded', 'insufficient', 'failed']),
  queryCategory: z.string().min(1).max(160),
  attemptedAt: timestampSchema,
  sources: z.array(sourceProvenanceSchema),
  errorClass: z.string().min(1).max(160).optional(),
}).strict();

export const operationReceiptSchema = z.object({
  sourceId: entityIdSchema,
  operationType: z.string().min(1),
  payloadFingerprint: z.string().min(1),
  resultRevision: revisionSchema,
  committedAt: timestampSchema,
  confirmationProvenance: userActionProvenanceSchema.nullable(),
  moduleVersion: z.string().min(1).nullable(),
}).strict();

export const invalidationTargetKindSchema = z.enum([
  'path-set',
  'project',
  'reflection',
  'next-move',
  'peer-exposure',
  'commitment',
  'proof',
  'side-door-set',
  'route-outcome',
]);

export const invalidationSchema = z.object({
  id: entityIdSchema,
  basisKind: z.enum(['why', 'purpose-path', 'project', 'learning', 'peer-exposure', 'commitment', 'proof']),
  basisId: entityIdSchema,
  basisRevision: revisionSchema,
  targetKind: invalidationTargetKindSchema,
  targetId: entityIdSchema,
  targetRevision: revisionSchema,
  createdAtRevision: revisionSchema,
  status: z.enum(['pending', 'resolved']),
  resolution: z.object({
    kind: z.enum(['reaffirmed', 'revised', 'replaced']),
    action: userActionProvenanceSchema,
  }).strict().optional(),
}).strict();

export type ModelPresentation = z.infer<typeof modelPresentationSchema>;
export type UserActionProvenance = z.infer<typeof userActionProvenanceSchema>;
export type UserEvidenceProvenance = z.infer<typeof userEvidenceProvenanceSchema>;
export type Confirmation = z.infer<typeof confirmationSchema>;
export type RevisionRef = z.infer<typeof revisionRefSchema>;
export type SourceProvenance = z.infer<typeof sourceProvenanceSchema>;
export type ResearchAttempt = z.infer<typeof researchAttemptSchema>;
export type OperationReceipt = z.infer<typeof operationReceiptSchema>;
export type Invalidation = z.infer<typeof invalidationSchema>;
export type InvalidationTargetKind = z.infer<typeof invalidationTargetKindSchema>;

export const invalidationTargetOrder = [
  'path-set',
  'project',
  'reflection',
  'next-move',
  'peer-exposure',
  'commitment',
  'proof',
  'side-door-set',
  'route-outcome',
] as const satisfies readonly InvalidationTargetKind[];

export function exactThree<T extends z.ZodTypeAny>(item: T) {
  return z.tuple([item, item, item]);
}

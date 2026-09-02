import { z } from 'zod';

export const entityIdSchema = z.string().min(1).max(160);
/**
 * Client-supplied durable message identities are opaque transport tokens, not
 * display text. Keeping them to a single-line ASCII grammar prevents them from
 * becoming an instruction, log, or storage-protocol injection surface while
 * retaining UUID, AI SDK, and existing `message-*`/`msg_*` formats.
 */
export const opaqueClientMessageIdSchema = z.string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:~-]*$/, 'Client message id must be an opaque token.');
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

export const RESEARCH_SOURCE_LIMITS = {
  sourcesPerAttempt: 12,
  sourcesPerRecord: 4,
  urlCharacters: 2_048,
  titleCharacters: 500,
  excerptCharacters: 2_000,
  claimCharacters: 3_000,
} as const;

export function normalizeResearchClaim(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function canonicalizeResearchUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Research source URL must be an absolute URL.');
  }
  if (parsed.protocol !== 'https:') throw new Error('Research sources must use HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Research source URLs must not contain credentials.');
  parsed.hash = '';
  return parsed.toString();
}

const canonicalHttpsResearchUrlSchema = z.string()
  .min(1)
  .max(RESEARCH_SOURCE_LIMITS.urlCharacters)
  .url()
  .superRefine((value, context) => {
    try {
      if (canonicalizeResearchUrl(value) !== value) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Research source URLs must be stored in canonical form.',
        });
      }
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Research source URL is invalid.',
      });
    }
  });

const legacyCitedResearchBaseSchema = z.object({
  kind: z.literal('cited-research'),
  sourceHandle: entityIdSchema,
  url: z.string().url().refine((value) => value.startsWith('https://'), 'Research sources must use HTTPS.'),
  retrievedAt: timestampSchema,
  title: z.string().min(1).max(1_000).optional(),
});

const legacyCitedResearchSourceSchema = z.union([
  legacyCitedResearchBaseSchema.extend({
    support: z.literal('server-validated'),
    providerResultId: entityIdSchema,
    excerpt: z.string().min(1).max(4_000),
  }).strict(),
  legacyCitedResearchBaseSchema.extend({
    support: z.literal('cited-provenance'),
    providerResultId: entityIdSchema.optional(),
    excerpt: z.string().min(1).max(4_000).optional(),
  }).strict(),
]);

const citationAssociationSchema = z.object({
  start: z.number().int().nonnegative().max(1_000_000),
  end: z.number().int().positive().max(1_000_000),
  exactClaimStart: z.number().int().nonnegative().max(1_000_000),
  exactClaimEnd: z.number().int().positive().max(1_000_000),
  textHash: z.string().regex(/^[a-f0-9]{64}$/u, 'Citation text hash must be SHA-256 hex.'),
}).strict();

const amendedCitedResearchSourceBaseSchema = z.object({
  kind: z.literal('cited-research'),
  bindingVersion: z.literal(2),
  sourceHandle: entityIdSchema,
  providerCallId: entityIdSchema,
  providerResultId: entityIdSchema,
  targetId: entityIdSchema,
  targetRevision: mapRevisionSchema,
  canonicalField: z.string().min(1).max(160).regex(/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/u),
  exactClaim: z.string().min(1).max(RESEARCH_SOURCE_LIMITS.claimCharacters),
  url: canonicalHttpsResearchUrlSchema,
  retrievedAt: timestampSchema,
  title: z.string().min(1).max(RESEARCH_SOURCE_LIMITS.titleCharacters).optional(),
  excerpt: z.string().min(1).max(RESEARCH_SOURCE_LIMITS.excerptCharacters).optional(),
  support: z.enum(['server-validated', 'cited-provenance']),
  citation: citationAssociationSchema,
}).strict();

function validateAmendedCitedSource(
  source: z.infer<typeof amendedCitedResearchSourceBaseSchema>,
  context: z.RefinementCtx,
): void {
  if (source.exactClaim !== normalizeResearchClaim(source.exactClaim)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['exactClaim'],
      message: 'Research claims must be stored in exact normalized form.',
    });
  }
  if (source.citation.end <= source.citation.start
    || source.citation.exactClaimEnd <= source.citation.exactClaimStart
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['citation'],
      message: 'Citation and exact-claim spans must be non-empty.',
    });
  }
  const overlapsClaim = source.citation.start < source.citation.exactClaimEnd
    && source.citation.end > source.citation.exactClaimStart;
  const followsClaim = source.citation.start >= source.citation.exactClaimEnd
    && source.citation.start - source.citation.exactClaimEnd <= 8;
  if (!overlapsClaim && !followsClaim) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['citation'],
      message: 'Citation must overlap or immediately follow the exact claim.',
    });
  }
  if (source.support === 'server-validated'
    && (!source.excerpt
      || !normalizeResearchClaim(source.excerpt).includes(source.exactClaim))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['support'],
      message: 'Server-validated support requires bounded result content containing the exact claim.',
    });
  }
}

export const amendedCitedResearchSourceSchema = amendedCitedResearchSourceBaseSchema
  .superRefine(validateAmendedCitedSource);

/**
 * Bounded provider evidence that a search result was consulted. Unlike a
 * claim-linked citation, this record grants no canonical-write authority and
 * deliberately carries no target field, exact claim, excerpt, or handle.
 */
export const consultedResearchSourceSchema = z.object({
  providerCallId: entityIdSchema,
  providerResultId: entityIdSchema,
  action: z.enum(['search', 'openPage', 'findInPage']).optional(),
  url: canonicalHttpsResearchUrlSchema,
}).strict();

export const sourceProvenanceSchema = z.union([
  z.object({
    kind: z.literal('user-supplied-source'),
    label: z.string().min(1).max(500),
    url: z.string().url()
      .refine((value) => value.startsWith('https://'), 'User sources must use HTTPS.')
      .optional(),
    recordedBy: userActionProvenanceSchema,
  }).strict(),
  legacyCitedResearchSourceSchema,
  amendedCitedResearchSourceSchema,
]);

/** Preserve unbounded predecessor arrays while bounding only newly introduced v2 bindings. */
export const sourceProvenanceListSchema = z.array(sourceProvenanceSchema)
  .superRefine((sources, context) => {
    const amendedSourceCount = sources.filter((source) => (
      source.kind === 'cited-research' && 'bindingVersion' in source
    )).length;
    if (amendedSourceCount > RESEARCH_SOURCE_LIMITS.sourcesPerRecord) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        type: 'array',
        maximum: RESEARCH_SOURCE_LIMITS.sourcesPerRecord,
        inclusive: true,
        exact: false,
        message: `At most ${RESEARCH_SOURCE_LIMITS.sourcesPerRecord} v2 research bindings are allowed per record.`,
      });
    }
  });

/**
 * Minimal, non-conclusive record of an isolated research attempt. Failed or
 * insufficient attempts live outside exact-three proposal invariants so a
 * retry can resume without inventing a canonical path, project, peer, or
 * route. Raw queries and retrieved bodies are intentionally not retained.
 */
export const legacyResearchAttemptSchema = z.object({
  id: entityIdSchema,
  status: z.enum(['pending', 'succeeded', 'insufficient', 'failed']),
  queryCategory: z.string().min(1).max(160),
  attemptedAt: timestampSchema,
  sources: z.array(sourceProvenanceSchema),
  errorClass: z.string().min(1).max(160).optional(),
}).strict();

export const methodModuleSchema = z.enum([
  'form-foundation',
  'create-purpose-paths',
  'design-path-project',
  'guide-path-project',
  'find-relevant-peers',
  'interpret-path-project',
  'enter-side-doors',
]);

export const amendedResearchAttemptSchema = z.object({
  schemaVersion: z.literal(2),
  id: entityIdSchema,
  status: z.enum(['pending', 'succeeded', 'insufficient', 'failed']),
  checkpoint: methodModuleSchema,
  moduleVersion: z.string().min(1).max(160),
  targetId: entityIdSchema,
  targetRevision: mapRevisionSchema,
  attemptedAt: timestampSchema,
  consultedSources: z.array(consultedResearchSourceSchema)
    .max(RESEARCH_SOURCE_LIMITS.sourcesPerAttempt)
    .optional(),
  sources: z.array(amendedCitedResearchSourceSchema).max(RESEARCH_SOURCE_LIMITS.sourcesPerAttempt),
  errorClass: z.string().min(1).max(160).optional(),
}).strict().superRefine((attempt, context) => {
  for (let index = 0; index < attempt.sources.length; index += 1) {
    const source = attempt.sources[index];
    if (source.targetId !== attempt.targetId || source.targetRevision !== attempt.targetRevision) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sources', index],
        message: 'Every research source must bind to the attempt target and revision.',
      });
    }
  }
});

/** Expand/contract reader and temporary dual-writer contract for the U4-to-U5 rollout. */
export const persistedResearchAttemptSchema = z.union([
  amendedResearchAttemptSchema,
  legacyResearchAttemptSchema,
]);

/** Compatibility alias for callers that read predecessor and amended rows. */
export const researchAttemptSchema = persistedResearchAttemptSchema;

export const researchSourceAssociationSchema = amendedCitedResearchSourceBaseSchema.extend({
  attemptId: entityIdSchema,
  operationSourceId: entityIdSchema,
  resultRevision: revisionSchema,
  checkpoint: methodModuleSchema,
  moduleVersion: z.string().min(1).max(160),
}).strict().superRefine(validateAmendedCitedSource);

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
export type ConsultedResearchSource = z.infer<typeof consultedResearchSourceSchema>;
export type ResearchAttempt = z.infer<typeof researchAttemptSchema>;
export type AmendedResearchAttempt = z.infer<typeof amendedResearchAttemptSchema>;
export type ResearchSourceAssociation = z.infer<typeof researchSourceAssociationSchema>;
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

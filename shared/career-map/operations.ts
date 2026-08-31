import { z } from 'zod';
import {
  entityIdSchema,
  exactThree,
  modelPresentationSchema,
  revisionSchema,
  timestampSchema,
  userActionProvenanceSchema,
} from './common';
import { foundationEvidenceSchema, realityConstraintSchema, whyInputSchema } from './foundation';
import { purposePathInputSchema } from './paths';
import { pathProjectInputSchema, projectWorkStatusSchema } from './projects';
import { learningEvidenceSchema, nextMoveKindSchema } from './learning';
import { peerExposureInputSchema } from './peers';
import { proofInventoryInputSchema, sideDoorInputSchema } from './side-doors';

const expectedRevisionSchema = z.number().int().nonnegative();

function operationSchema<T extends string, P extends z.ZodTypeAny>(type: T, payload: P) {
  return z.object({
    type: z.literal(type),
    sourceId: entityIdSchema,
    expectedRevision: expectedRevisionSchema,
    occurredAt: timestampSchema,
    payload,
  }).strict();
}

export const foundationOperationSchemas = {
  'append-foundation-evidence': operationSchema('append-foundation-evidence', z.object({ evidence: foundationEvidenceSchema }).strict()),
  'correct-foundation-evidence': operationSchema('correct-foundation-evidence', z.object({ evidence: foundationEvidenceSchema, supersedesEvidenceId: entityIdSchema }).strict()),
  'record-reality-constraint': operationSchema('record-reality-constraint', z.object({ constraint: realityConstraintSchema }).strict()),
  'propose-why': operationSchema('propose-why', z.object({ why: whyInputSchema, presentation: modelPresentationSchema }).strict()),
  'revise-why': operationSchema('revise-why', z.object({ why: whyInputSchema, supersedesWhyId: entityIdSchema, presentation: modelPresentationSchema }).strict()),
  'confirm-why': operationSchema('confirm-why', z.object({ whyId: entityIdSchema, whyRevision: revisionSchema, action: userActionProvenanceSchema }).strict()),
} as const;

const pathSelectionPayload = z.object({
  setId: entityIdSchema,
  setRevision: revisionSchema,
  pathId: entityIdSchema,
  pathRevision: revisionSchema,
  action: userActionProvenanceSchema,
}).strict();

export const pathOperationSchemas = {
  'propose-purpose-paths': operationSchema('propose-purpose-paths', z.object({ setId: entityIdSchema, setRevision: revisionSchema, paths: exactThree(purposePathInputSchema), presentation: modelPresentationSchema }).strict()),
  'replace-purpose-path': operationSchema('replace-purpose-path', z.object({
    sourceSetId: entityIdSchema,
    sourceSetRevision: revisionSchema,
    replacedPathId: entityIdSchema,
    replacementSetId: entityIdSchema,
    replacementSetRevision: revisionSchema,
    replacement: purposePathInputSchema,
    presentation: modelPresentationSchema,
  }).strict()),
  'combine-purpose-paths': operationSchema('combine-purpose-paths', z.object({
    sourceSetId: entityIdSchema,
    sourceSetRevision: revisionSchema,
    combinedPathIds: z.tuple([entityIdSchema, entityIdSchema]),
    replacementSetId: entityIdSchema,
    replacementSetRevision: revisionSchema,
    paths: exactThree(purposePathInputSchema),
    presentation: modelPresentationSchema,
  }).strict()),
  'select-purpose-path': operationSchema('select-purpose-path', pathSelectionPayload),
  'confirm-purpose-path-revision': operationSchema('confirm-purpose-path-revision', pathSelectionPayload),
  'choose-parked-purpose-path': operationSchema('choose-parked-purpose-path', z.object({
    sourceSetId: entityIdSchema,
    sourceSetRevision: revisionSchema,
    replacementSetId: entityIdSchema,
    replacementSetRevision: revisionSchema,
    pathId: entityIdSchema,
    pathRevision: revisionSchema,
    action: userActionProvenanceSchema,
  }).strict()),
} as const;

export const projectOperationSchemas = {
  'propose-first-project': operationSchema('propose-first-project', z.object({ project: pathProjectInputSchema, presentation: modelPresentationSchema }).strict()),
  'replace-project-proposal': operationSchema('replace-project-proposal', z.object({ projectId: entityIdSchema, projectRevision: revisionSchema, replacement: pathProjectInputSchema, presentation: modelPresentationSchema }).strict()),
  'accept-first-project': operationSchema('accept-first-project', z.object({ projectId: entityIdSchema, projectRevision: revisionSchema, action: userActionProvenanceSchema }).strict()),
  'propose-project-revision': operationSchema('propose-project-revision', z.object({ projectId: entityIdSchema, projectRevision: revisionSchema, replacement: pathProjectInputSchema, presentation: modelPresentationSchema }).strict()),
  'confirm-project-revision': operationSchema('confirm-project-revision', z.object({ projectId: entityIdSchema, projectRevision: revisionSchema, action: userActionProvenanceSchema }).strict()),
  'update-project-work-status': operationSchema('update-project-work-status', z.object({ projectId: entityIdSchema, projectRevision: revisionSchema, status: projectWorkStatusSchema, action: userActionProvenanceSchema }).strict()),
  'propose-follow-on-projects': operationSchema('propose-follow-on-projects', z.object({ setId: entityIdSchema, setRevision: revisionSchema, projects: exactThree(pathProjectInputSchema), presentation: modelPresentationSchema }).strict()),
  'replace-follow-on-project': operationSchema('replace-follow-on-project', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, replacedProjectId: entityIdSchema, replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, replacement: pathProjectInputSchema, presentation: modelPresentationSchema }).strict()),
  'select-follow-on-project': operationSchema('select-follow-on-project', z.object({ setId: entityIdSchema, setRevision: revisionSchema, projectId: entityIdSchema, projectRevision: revisionSchema, action: userActionProvenanceSchema }).strict()),
} as const;

export const learningOperationSchemas = {
  'open-reflection': operationSchema('open-reflection', z.object({ reflectionId: entityIdSchema, revision: revisionSchema, projectId: entityIdSchema, projectRevision: revisionSchema, action: userActionProvenanceSchema }).strict()),
  'append-reflection-evidence': operationSchema('append-reflection-evidence', z.object({ reflectionId: entityIdSchema, reflectionRevision: revisionSchema, evidence: learningEvidenceSchema }).strict()),
  'revise-reflection-evidence': operationSchema('revise-reflection-evidence', z.object({ reflectionId: entityIdSchema, reflectionRevision: revisionSchema, newReflectionRevision: revisionSchema, evidence: learningEvidenceSchema, supersedesEvidenceId: entityIdSchema }).strict()),
  'close-reflection': operationSchema('close-reflection', z.object({ reflectionId: entityIdSchema, reflectionRevision: revisionSchema, action: userActionProvenanceSchema }).strict()),
  'record-continue-choice': operationSchema('record-continue-choice', z.object({ id: entityIdSchema, revision: revisionSchema, reflectionId: entityIdSchema, reflectionRevision: revisionSchema, wantsToContinue: z.boolean(), action: userActionProvenanceSchema }).strict()),
  'record-next-move': operationSchema('record-next-move', z.object({ id: entityIdSchema, revision: revisionSchema, continueChoiceId: entityIdSchema, continueChoiceRevision: revisionSchema, kind: nextMoveKindSchema, action: userActionProvenanceSchema }).strict()),
} as const;

export const peerOperationSchemas = {
  'open-peer-focus': operationSchema('open-peer-focus', z.object({ reason: z.string().min(1), action: userActionProvenanceSchema }).strict()),
  'record-peer-exposure': operationSchema('record-peer-exposure', z.object({ exposure: peerExposureInputSchema, presentation: modelPresentationSchema }).strict()),
  'revise-peer-exposure': operationSchema('revise-peer-exposure', z.object({ exposure: peerExposureInputSchema, supersedesExposureId: entityIdSchema, presentation: modelPresentationSchema }).strict()),
  'confirm-peer-exposure': operationSchema('confirm-peer-exposure', z.object({ exposureId: entityIdSchema, exposureRevision: revisionSchema, action: userActionProvenanceSchema }).strict()),
  'defer-peer-exposure': operationSchema('defer-peer-exposure', z.object({ intentId: entityIdSchema, action: userActionProvenanceSchema }).strict()),
  'complete-provisional-commitment': operationSchema('complete-provisional-commitment', z.object({ id: entityIdSchema, revision: revisionSchema, intentId: entityIdSchema, action: userActionProvenanceSchema }).strict()),
} as const;

export const sideDoorOperationSchemas = {
  'propose-proof-inventory': operationSchema('propose-proof-inventory', z.object({ proof: proofInventoryInputSchema, presentation: modelPresentationSchema }).strict()),
  'revise-proof-inventory': operationSchema('revise-proof-inventory', z.object({ proof: proofInventoryInputSchema, supersedesProofId: entityIdSchema, presentation: modelPresentationSchema }).strict()),
  'confirm-proof-inventory': operationSchema('confirm-proof-inventory', z.object({ proofId: entityIdSchema, proofRevision: revisionSchema, action: userActionProvenanceSchema }).strict()),
  'propose-side-doors': operationSchema('propose-side-doors', z.object({ setId: entityIdSchema, setRevision: revisionSchema, doors: exactThree(sideDoorInputSchema), presentation: modelPresentationSchema }).strict()),
  'replace-side-door': operationSchema('replace-side-door', z.object({ sourceSetId: entityIdSchema, sourceSetRevision: revisionSchema, replacedDoorId: entityIdSchema, replacementSetId: entityIdSchema, replacementSetRevision: revisionSchema, replacement: sideDoorInputSchema, presentation: modelPresentationSchema }).strict()),
  'select-side-door': operationSchema('select-side-door', z.object({ setId: entityIdSchema, setRevision: revisionSchema, doorId: entityIdSchema, doorRevision: revisionSchema, action: userActionProvenanceSchema }).strict()),
  'record-route-outcome': operationSchema('record-route-outcome', z.object({ id: entityIdSchema, revision: revisionSchema, doorId: entityIdSchema, doorRevision: revisionSchema, result: z.enum(['drafted', 'sent-by-explorer', 'positive-response', 'no-response', 'declined', 'other']), learning: z.string().min(1).max(6_000), action: userActionProvenanceSchema }).strict()),
} as const;

export const focusOperationSchemas = {
  'open-foundation-revision-focus': operationSchema('open-foundation-revision-focus', z.object({ reason: z.string().min(1), action: userActionProvenanceSchema }).strict()),
  'open-path-revision-focus': operationSchema('open-path-revision-focus', z.object({ reason: z.string().min(1), action: userActionProvenanceSchema }).strict()),
  'close-focus': operationSchema('close-focus', z.object({ action: userActionProvenanceSchema }).strict()),
  'resolve-basis-review': operationSchema('resolve-basis-review', z.object({ targetKind: z.enum(['path-set', 'project', 'reflection', 'next-move', 'peer-exposure', 'commitment', 'proof', 'side-door-set', 'route-outcome']), targetId: entityIdSchema, targetRevision: revisionSchema, resolution: z.enum(['reaffirmed', 'revised', 'replaced']), action: userActionProvenanceSchema }).strict()),
} as const;

export const careerMapOperationSchemas = {
  ...foundationOperationSchemas,
  ...pathOperationSchemas,
  ...projectOperationSchemas,
  ...learningOperationSchemas,
  ...peerOperationSchemas,
  ...sideDoorOperationSchemas,
  ...focusOperationSchemas,
} as const;

type SchemaMap = typeof careerMapOperationSchemas;
export type CareerMapOperationType = keyof SchemaMap;
export type CareerMapOperation = { [K in keyof SchemaMap]: z.infer<SchemaMap[K]> }[keyof SchemaMap];

export function parseCareerMapOperation(input: unknown): { success: true; data: CareerMapOperation } | { success: false; error: z.ZodError } {
  if (!input || typeof input !== 'object' || !('type' in input) || typeof input.type !== 'string') {
    return { success: false, error: new z.ZodError([{ code: z.ZodIssueCode.custom, path: ['type'], message: 'Operation type is required.' }]) };
  }
  const schema = careerMapOperationSchemas[input.type as CareerMapOperationType];
  if (!schema) {
    return { success: false, error: new z.ZodError([{ code: z.ZodIssueCode.custom, path: ['type'], message: 'Unknown operation type.' }]) };
  }
  const parsed = schema.safeParse(input);
  return parsed.success ? { success: true, data: parsed.data as CareerMapOperation } : parsed;
}

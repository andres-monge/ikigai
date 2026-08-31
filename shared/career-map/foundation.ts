import { z } from 'zod';
import {
  confirmationSchema,
  entityIdSchema,
  modelPresentationSchema,
  revisionSchema,
  userEvidenceProvenanceSchema,
} from './common';

export const foundationEvidenceSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  category: z.enum(['fascination', 'importance', 'point-of-view', 'starting-asset', 'reality-boundary', 'firsthand-evidence']),
  content: z.string().min(1).max(8_000),
  provenance: userEvidenceProvenanceSchema,
  supersedesEvidenceId: entityIdSchema.optional(),
}).strict();

export const realityConstraintSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  kind: z.enum(['income', 'time', 'location', 'responsibility', 'health', 'risk', 'none', 'other']),
  description: z.string().min(1).max(2_000),
  provenance: userEvidenceProvenanceSchema,
  supersedesConstraintId: entityIdSchema.optional(),
}).strict();

export const whyInputSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  statement: z.string().min(1).max(1_000),
  serves: z.string().min(1).max(1_000),
  pointOfView: z.string().min(1).max(2_000),
}).strict();

export const whyRevisionSchema = whyInputSchema.extend({
  status: z.enum(['suggested', 'confirmed', 'superseded']),
  presentation: modelPresentationSchema,
  confirmation: confirmationSchema.optional(),
  supersedesWhyId: entityIdSchema.optional(),
}).strict();

export const foundationStateSchema = z.object({
  evidence: z.array(foundationEvidenceSchema),
  constraints: z.array(realityConstraintSchema),
  whyRevisions: z.array(whyRevisionSchema),
}).strict();

export type FoundationEvidence = z.infer<typeof foundationEvidenceSchema>;
export type RealityConstraint = z.infer<typeof realityConstraintSchema>;
export type WhyInput = z.infer<typeof whyInputSchema>;
export type WhyRevision = z.infer<typeof whyRevisionSchema>;
export type FoundationState = z.infer<typeof foundationStateSchema>;

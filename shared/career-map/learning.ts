import { z } from 'zod';
import {
  entityIdSchema,
  revisionRefSchema,
  revisionSchema,
  userActionProvenanceSchema,
  userEvidenceProvenanceSchema,
} from './common';

export const learningEvidenceSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  observation: z.string().min(1).max(8_000),
  signal: z.enum(['energy', 'absorption', 'voluntary-pull', 'resistance', 'desire-to-continue', 'beneficiary-feedback', 'learning-question', 'scope', 'execution', 'constraint', 'temporary-obstacle', 'other']),
  interpretation: z.string().min(1).max(4_000),
  provenance: userEvidenceProvenanceSchema,
  supersedesEvidenceId: entityIdSchema.optional(),
}).strict();

export const reflectionSessionSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  projectBasis: revisionRefSchema,
  status: z.enum(['open', 'closed']),
  openedBy: userActionProvenanceSchema,
  closedBy: userActionProvenanceSchema.optional(),
  evidence: z.array(learningEvidenceSchema),
}).strict();

export const continueChoiceSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  reflectionBasis: revisionRefSchema,
  wantsToContinue: z.boolean(),
  action: userActionProvenanceSchema,
}).strict();

export const nextMoveKindSchema = z.enum(['return-to-paths', 'explore-further', 'commit-provisionally']);

export const nextMoveSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  continueChoiceBasis: revisionRefSchema,
  kind: nextMoveKindSchema,
  action: userActionProvenanceSchema,
}).strict();

export type LearningEvidence = z.infer<typeof learningEvidenceSchema>;
export type ReflectionSession = z.infer<typeof reflectionSessionSchema>;
export type ContinueChoice = z.infer<typeof continueChoiceSchema>;
export type NextMoveKind = z.infer<typeof nextMoveKindSchema>;
export type NextMove = z.infer<typeof nextMoveSchema>;

import { z } from 'zod';
import {
  confirmationSchema,
  entityIdSchema,
  exactThree,
  modelPresentationSchema,
  revisionRefSchema,
  revisionSchema,
  userActionProvenanceSchema,
} from './common';

export const pathProjectInputSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  title: z.string().min(1).max(500),
  outcome: z.string().min(1).max(3_000),
  audience: z.string().min(1).max(2_000),
  whyWanted: z.string().min(1).max(2_000),
  learningGoal: z.string().min(1).max(2_000),
  firstVersion: z.string().min(1).max(3_000),
  firstStep: z.string().min(1).max(2_000),
  decisionQuestion: z.string().min(1).max(2_000),
  evidenceCue: z.string().min(1).max(2_000),
}).strict();

export const projectWorkStatusSchema = z.enum(['not-started', 'in-progress', 'stopped', 'completed']);

export const projectWorkUpdateSchema = z.object({
  status: projectWorkStatusSchema,
  action: userActionProvenanceSchema,
}).strict();

export const pathProjectSchema = pathProjectInputSchema.extend({
  number: z.number().int().positive(),
  basisPath: revisionRefSchema,
  agreementStatus: z.enum(['suggested', 'accepted', 'parked', 'superseded']),
  workStatus: projectWorkStatusSchema,
  workUpdates: z.array(projectWorkUpdateSchema),
  presentation: modelPresentationSchema,
  confirmation: confirmationSchema.optional(),
  supersedesProjectId: entityIdSchema.optional(),
  sourceOptionSetId: entityIdSchema.optional(),
}).strict();

export const projectOptionSchema = pathProjectInputSchema.extend({
  selection: z.enum(['available', 'active', 'parked']),
  equalWeight: z.literal(true),
}).strict();

export const projectOptionSetSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  status: z.enum(['suggested', 'selected', 'superseded']),
  projectNumber: z.number().int().positive(),
  basisPath: revisionRefSchema,
  basisNextMove: revisionRefSchema,
  projects: exactThree(projectOptionSchema),
  presentation: modelPresentationSchema,
  confirmation: confirmationSchema.optional(),
}).strict();

export type PathProjectInput = z.infer<typeof pathProjectInputSchema>;
export type PathProject = z.infer<typeof pathProjectSchema>;
export type ProjectWorkStatus = z.infer<typeof projectWorkStatusSchema>;
export type ProjectOption = z.infer<typeof projectOptionSchema>;
export type ProjectOptionSet = z.infer<typeof projectOptionSetSchema>;

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

export const proofInventoryInputSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  artifacts: z.array(z.string().min(1).max(2_000)),
  problemsSolved: z.array(z.string().min(1).max(2_000)),
  peopleHelped: z.array(z.string().min(1).max(2_000)),
  usefulQualities: z.array(z.string().min(1).max(2_000)),
  knowledge: z.array(z.string().min(1).max(2_000)),
  relationships: z.array(z.string().min(1).max(2_000)),
  pointsOfView: z.array(z.string().min(1).max(2_000)),
  shareableMaterial: z.array(z.string().min(1).max(2_000)),
}).strict();

export const proofInventorySchema = proofInventoryInputSchema.extend({
  basisCommitment: revisionRefSchema,
  status: z.enum(['suggested', 'confirmed', 'superseded']),
  presentation: modelPresentationSchema,
  confirmation: confirmationSchema.optional(),
  supersedesProofId: entityIdSchema.optional(),
}).strict();

export const sideDoorInputSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  name: z.string().min(1).max(500),
  target: z.string().min(1).max(2_000),
  proofValue: z.string().min(1).max(3_000),
  contribution: z.string().min(1).max(3_000),
  firstMove: z.string().min(1).max(2_000),
  accessConstraints: z.array(z.string().min(1).max(2_000)),
}).strict();

export const sideDoorSchema = sideDoorInputSchema.extend({
  selection: z.enum(['available', 'active', 'parked']),
  equalWeight: z.literal(true),
}).strict();

export const sideDoorSetSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  status: z.enum(['suggested', 'active', 'superseded']),
  basisProof: revisionRefSchema,
  doors: exactThree(sideDoorSchema),
  presentation: modelPresentationSchema,
  confirmation: confirmationSchema.optional(),
  supersedesSetId: entityIdSchema.optional(),
}).strict();

export const routeOutcomeSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  doorBasis: revisionRefSchema,
  result: z.enum(['drafted', 'sent-by-explorer', 'positive-response', 'no-response', 'declined', 'other']),
  learning: z.string().min(1).max(6_000),
  action: userActionProvenanceSchema,
}).strict();

export type ProofInventoryInput = z.infer<typeof proofInventoryInputSchema>;
export type ProofInventory = z.infer<typeof proofInventorySchema>;
export type SideDoorInput = z.infer<typeof sideDoorInputSchema>;
export type SideDoor = z.infer<typeof sideDoorSchema>;
export type SideDoorSet = z.infer<typeof sideDoorSetSchema>;
export type RouteOutcome = z.infer<typeof routeOutcomeSchema>;

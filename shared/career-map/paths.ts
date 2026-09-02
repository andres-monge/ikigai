import { z } from 'zod';
import {
  confirmationSchema,
  entityIdSchema,
  exactThree,
  modelPresentationSchema,
  revisionRefSchema,
  revisionSchema,
  sourceProvenanceListSchema,
} from './common';

export const purposePathInputSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  name: z.string().min(1).max(300),
  servesWhy: z.string().min(1).max(2_000),
  possibility: z.string().min(1).max(2_000),
  evidence: z.array(z.string().min(1).max(2_000)).min(1),
  centralUnknown: z.string().min(1).max(2_000),
  projectPreview: z.string().min(1).max(2_000),
  practicalFit: z.string().min(1).max(2_000),
  sources: sourceProvenanceListSchema.optional(),
}).strict();

export const purposePathSchema = purposePathInputSchema.extend({
  selection: z.enum(['available', 'active', 'parked']),
  equalWeight: z.literal(true),
}).strict();

export const purposePathSetSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  status: z.enum(['suggested', 'active', 'superseded']),
  basisWhy: revisionRefSchema,
  paths: exactThree(purposePathSchema),
  presentation: modelPresentationSchema,
  confirmation: confirmationSchema.optional(),
  supersedesSetId: entityIdSchema.optional(),
  changeKind: z.enum(['initial', 'replacement', 'combination', 'revision']),
  combinedFromPathIds: z.tuple([entityIdSchema, entityIdSchema]).optional(),
}).strict();

export type PurposePathInput = z.infer<typeof purposePathInputSchema>;
export type PurposePath = z.infer<typeof purposePathSchema>;
export type PurposePathSet = z.infer<typeof purposePathSetSchema>;

import { z } from 'zod';
import {
  confirmationSchema,
  entityIdSchema,
  exactThree,
  modelPresentationSchema,
  revisionRefSchema,
  revisionSchema,
} from './common';

// Provider citations belong to conversation transport, never to saved card copy.
const providerCitationMarker = /cite[^]*|【\s*turn\d+(?:search|view|fetch)\d+[^】]*】|\bcite\s+turn\d+(?:search|view|fetch)\d+\b/giu;

export function stripProviderCitationMarkers(value: string): string {
  return value.replace(providerCitationMarker, '').replace(/\s{2,}/g, ' ').trim();
}

export function hasProviderCitationMarkers(value: string): boolean {
  providerCitationMarker.lastIndex = 0;
  return providerCitationMarker.test(value);
}

export const purposePathInputSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  name: z.string().min(1).max(300),
  servesWhy: z.string().min(1).max(2_000),
  // Retained only for reading historical cards and preserving unchanged siblings.
  possibility: z.string().min(1).max(2_000).optional(),
  evidence: z.array(z.string().min(1).max(2_000)).min(1),
  centralUnknown: z.string().min(1).max(2_000),
  projectPreview: z.string().min(1).max(2_000),
  practicalFit: z.string().min(1).max(2_000),
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

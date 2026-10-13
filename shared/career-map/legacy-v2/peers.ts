import { z } from 'zod';
import {
  confirmationSchema,
  entityIdSchema,
  modelPresentationSchema,
  revisionRefSchema,
  revisionSchema,
  userActionProvenanceSchema,
} from './common';

export const peerExposureInputSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  subjectKind: z.enum(['real-person', 'community', 'first-person-source']),
  subject: z.string().min(1).max(2_000),
  insight: z.string().min(1).max(6_000),
}).strict();

export const peerExposureSchema = peerExposureInputSchema.extend({
  basisPath: revisionRefSchema,
  status: z.enum(['suggested', 'confirmed', 'superseded']),
  presentation: modelPresentationSchema,
  confirmation: confirmationSchema.optional(),
  supersedesExposureId: entityIdSchema.optional(),
}).strict();

export const commitmentIntentSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  basisPath: revisionRefSchema,
  basisNextMove: revisionRefSchema,
  status: z.enum(['pending-peer-exposure', 'peer-exposure-deferred', 'ready', 'completed']),
  action: userActionProvenanceSchema,
}).strict();

export const provisionalCommitmentSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  basisPath: revisionRefSchema,
  basisNextMove: revisionRefSchema,
  basisPeerExposure: revisionRefSchema,
  status: z.literal('confirmed'),
  action: userActionProvenanceSchema,
}).strict();

export type PeerExposureInput = z.infer<typeof peerExposureInputSchema>;
export type PeerExposure = z.infer<typeof peerExposureSchema>;
export type CommitmentIntent = z.infer<typeof commitmentIntentSchema>;
export type ProvisionalCommitment = z.infer<typeof provisionalCommitmentSchema>;

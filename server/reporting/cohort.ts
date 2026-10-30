import { z } from 'zod';

const key = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const participantSchema = z.object({
  key,
  stage: z.enum(['identified', 'invited', 'agreed', 'enabled', 'attempted', 'succeeded', 'returned', 'paused']),
  stageAt: z.string().datetime({ offset: true }),
  source: z.string().min(1),
  userId: z.string().min(1).optional(),
  noticeReference: z.string().min(1).optional(),
  agreementReference: z.string().min(1).optional(),
}).strict();
const cohortSchema = z.object({
  version: z.literal(1),
  participants: z.array(participantSchema),
  exclusions: z.array(z.object({ userId: z.string().min(1), role: z.enum(['founder', 'qa']), source: z.string().min(1) }).strict()),
}).strict();
export type Cohort = z.infer<typeof cohortSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type ParticipantClassification = 'pilot' | 'unlinked' | 'excluded-founder' | 'excluded-qa';

export function parseCohort(value: unknown): Cohort {
  const cohort = cohortSchema.parse(value);
  const keys = new Set<string>();
  const identities = new Set<string>();
  for (const participant of cohort.participants) {
    if (keys.has(participant.key)) throw new Error('Duplicate participant key.');
    keys.add(participant.key);
    if (participant.userId) {
      if (identities.has(participant.userId)) throw new Error('Duplicate participant identity binding.');
      identities.add(participant.userId);
    }
  }
  const excluded = new Set<string>();
  for (const exclusion of cohort.exclusions) {
    if (excluded.has(exclusion.userId)) throw new Error('Duplicate or contradictory exclusion.');
    excluded.add(exclusion.userId);
  }
  return cohort;
}

export function classifyParticipant(cohort: Cohort, participant: Participant): ParticipantClassification {
  if (!participant.userId) return 'unlinked';
  const exclusion = cohort.exclusions.find(entry => entry.userId === participant.userId);
  return exclusion ? `excluded-${exclusion.role}` : 'pilot';
}

export function requireReviewParticipant(cohort: Cohort, participantKey: string): Participant & { userId: string } {
  const participant = cohort.participants.find(entry => entry.key === participantKey);
  if (!participant?.userId) throw new Error('Participant does not have a verified identity binding.');
  if (classifyParticipant(cohort, participant) === 'excluded-founder') throw new Error('Founder conversation is not a permitted review target.');
  return participant as Participant & { userId: string };
}

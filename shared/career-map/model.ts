import { z } from 'zod';
import {
  entityIdSchema,
  invalidationSchema,
  mapRevisionSchema,
  operationReceiptSchema,
  userActionProvenanceSchema,
} from './common';
import { foundationStateSchema } from './foundation';
import { purposePathSetSchema } from './paths';
import { pathProjectSchema, projectOptionSetSchema } from './projects';
import { continueChoiceSchema, nextMoveSchema, reflectionSessionSchema } from './learning';
import { commitmentIntentSchema, peerExposureSchema, provisionalCommitmentSchema } from './peers';
import { proofInventorySchema, routeOutcomeSchema, sideDoorSetSchema } from './side-doors';

export const CAREER_MAP_SCHEMA_VERSION = 1;

export const focusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reflection'), reflectionId: entityIdSchema, reason: z.string().min(1), openedBy: userActionProvenanceSchema }).strict(),
  z.object({ kind: z.literal('peers'), reason: z.string().min(1), openedBy: userActionProvenanceSchema }).strict(),
  z.object({ kind: z.literal('foundation-revision'), reason: z.string().min(1), openedBy: userActionProvenanceSchema }).strict(),
  z.object({ kind: z.literal('path-revision'), reason: z.string().min(1), openedBy: userActionProvenanceSchema }).strict(),
]);

const composedCareerMapSchema = z.object({
  schemaVersion: z.literal(CAREER_MAP_SCHEMA_VERSION),
  explorerId: entityIdSchema,
  revision: mapRevisionSchema,
  foundation: foundationStateSchema,
  pathSets: z.array(purposePathSetSchema),
  projects: z.array(pathProjectSchema),
  projectOptionSets: z.array(projectOptionSetSchema),
  reflections: z.array(reflectionSessionSchema),
  continueChoices: z.array(continueChoiceSchema),
  nextMoves: z.array(nextMoveSchema),
  peerExposures: z.array(peerExposureSchema),
  commitmentIntent: commitmentIntentSchema.optional(),
  provisionalCommitment: provisionalCommitmentSchema.optional(),
  proofRevisions: z.array(proofInventorySchema),
  sideDoorSets: z.array(sideDoorSetSchema),
  routeOutcomes: z.array(routeOutcomeSchema),
  focus: focusSchema.optional(),
  invalidations: z.array(invalidationSchema),
  operationHistory: z.array(operationReceiptSchema),
}).strict();

function hasRevision(records: Array<{ id: string; revision: number }>, ref: { id: string; revision: number }): boolean {
  return records.some((record) => record.id === ref.id && record.revision === ref.revision);
}

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function uniqueRevisions(records: Array<{ id: string; revision: number }>): boolean {
  return unique(records.map((record) => `${record.id}@${record.revision}`));
}

export const careerMapSchema = composedCareerMapSchema.superRefine((map, context) => {
  const whyRevisions = map.foundation.whyRevisions;
  const paths = map.pathSets.flatMap((set) => set.paths);
  const doors = map.sideDoorSets.flatMap((set) => set.doors);

  if (!unique(map.operationHistory.map((receipt) => receipt.sourceId))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['operationHistory'], message: 'Operation source IDs must be unique.' });
  }
  if (map.operationHistory.length !== map.revision
    || map.operationHistory.some((receipt, index) => receipt.resultRevision !== index + 1)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['operationHistory'], message: 'Each map revision must have exactly one ordered operation receipt.' });
  }

  const revisionCollections: Array<[string, Array<{ id: string; revision: number }>]> = [
    ['foundation.whyRevisions', whyRevisions],
    ['pathSets', map.pathSets],
    ['projects', map.projects],
    ['projectOptionSets', map.projectOptionSets],
    ['reflections', map.reflections],
    ['continueChoices', map.continueChoices],
    ['nextMoves', map.nextMoves],
    ['peerExposures', map.peerExposures],
    ['proofRevisions', map.proofRevisions],
    ['sideDoorSets', map.sideDoorSets],
    ['routeOutcomes', map.routeOutcomes],
  ];
  for (const [path, records] of revisionCollections) {
    if (!uniqueRevisions(records)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: path.split('.'), message: 'Record identity and revision pairs must be unique.' });
    }
  }

  if (whyRevisions.filter((why) => why.status === 'confirmed').length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['foundation', 'whyRevisions'], message: 'Only one Why revision may be confirmed.' });
  }
  for (const [index, why] of whyRevisions.entries()) {
    if (why.status === 'confirmed' && !why.confirmation) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['foundation', 'whyRevisions', index], message: 'Confirmed Why requires auditable confirmation.' });
    }
    if (why.status === 'suggested' && why.confirmation) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['foundation', 'whyRevisions', index], message: 'Suggested Why cannot already be confirmed.' });
    }
  }

  if (map.pathSets.filter((set) => set.status === 'active').length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['pathSets'], message: 'Only one Purpose Path set may be active.' });
  }

  for (const [setIndex, set] of map.pathSets.entries()) {
    if (!unique(set.paths.map((path) => path.id))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pathSets', setIndex, 'paths'], message: 'Purpose Paths must have distinct IDs.' });
    }
    const activeCount = set.paths.filter((path) => path.selection === 'active').length;
    const parkedCount = set.paths.filter((path) => path.selection === 'parked').length;
    if (set.status === 'suggested' && set.paths.some((path) => path.selection !== 'available')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pathSets', setIndex], message: 'Suggested Purpose Paths cannot be preselected.' });
    }
    if (set.status === 'active' && (activeCount !== 1 || parkedCount !== 2)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pathSets', setIndex], message: 'An active Purpose Path set must activate one and park two.' });
    }
    if (set.status === 'active' && !set.confirmation) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pathSets', setIndex], message: 'Active Purpose Paths require auditable selection.' });
    }
    if (!hasRevision(whyRevisions, set.basisWhy)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pathSets', setIndex, 'basisWhy'], message: 'Purpose Path basis Why is missing.' });
    }
  }

  const pathSnapshots = new Map<string, string>();
  for (const [setIndex, set] of map.pathSets.entries()) {
    for (const [pathIndex, path] of set.paths.entries()) {
      const { selection: _selection, equalWeight: _equalWeight, ...input } = path;
      const key = `${path.id}@${path.revision}`;
      const snapshot = JSON.stringify(input);
      const existing = pathSnapshots.get(key);
      if (existing && existing !== snapshot) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pathSets', setIndex, 'paths', pathIndex],
          message: 'A Purpose Path revision must have one immutable content snapshot.',
        });
      } else {
        pathSnapshots.set(key, snapshot);
      }
    }
  }

  const acceptedNumbers = map.projects.filter((project) => project.agreementStatus === 'accepted').map((project) => project.number);
  if (!unique(acceptedNumbers.map(String))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects'], message: 'Only one accepted Path Project may occupy a project number.' });
  }
  for (const [projectIndex, project] of map.projects.entries()) {
    if (!hasRevision(paths, project.basisPath)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', projectIndex, 'basisPath'], message: 'Path Project basis is missing.' });
    }
    if (project.agreementStatus === 'accepted' && !project.confirmation) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', projectIndex], message: 'Accepted project requires auditable confirmation.' });
    }
    const lastWorkStatus = project.workUpdates.at(-1)?.status ?? 'not-started';
    if (lastWorkStatus !== project.workStatus) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', projectIndex, 'workStatus'], message: 'Project work status must match its latest provenance record.' });
    }
  }

  for (const [setIndex, set] of map.projectOptionSets.entries()) {
    if (!unique(set.projects.map((project) => project.id))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectOptionSets', setIndex, 'projects'], message: 'Follow-on projects must have distinct IDs.' });
    }
    if (!hasRevision(paths, set.basisPath) || !hasRevision(map.nextMoves, set.basisNextMove)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectOptionSets', setIndex], message: 'Follow-on project basis is missing.' });
    }
    const activeCount = set.projects.filter((project) => project.selection === 'active').length;
    if (set.status === 'suggested' && set.projects.some((project) => project.selection !== 'available')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectOptionSets', setIndex], message: 'Suggested follow-on projects cannot be preselected.' });
    }
    const parkedCount = set.projects.filter((project) => project.selection === 'parked').length;
    if (set.status === 'selected' && (activeCount !== 1 || parkedCount !== 2 || !set.confirmation)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectOptionSets', setIndex], message: 'A selected follow-on set must activate one project.' });
    }
  }

  for (const [index, reflection] of map.reflections.entries()) {
    if (!hasRevision(map.projects, reflection.projectBasis)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reflections', index, 'projectBasis'], message: 'Reflection project basis is missing.' });
    }
    if (reflection.status === 'closed' && !reflection.closedBy) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reflections', index], message: 'A closed reflection needs closing provenance.' });
    }
  }
  for (const [index, choice] of map.continueChoices.entries()) {
    if (!hasRevision(map.reflections, choice.reflectionBasis)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['continueChoices', index], message: 'Continue choice reflection basis is missing.' });
    }
  }
  for (const [index, move] of map.nextMoves.entries()) {
    if (!hasRevision(map.continueChoices, move.continueChoiceBasis)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['nextMoves', index], message: 'Next Move choice basis is missing.' });
    }
  }
  for (const [index, exposure] of map.peerExposures.entries()) {
    if (!hasRevision(paths, exposure.basisPath)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['peerExposures', index], message: 'Peer exposure path basis is missing.' });
    }
    if (exposure.status === 'confirmed' && !exposure.confirmation) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['peerExposures', index], message: 'Confirmed peer insight requires auditable confirmation.' });
    }
  }

  if (map.commitmentIntent) {
    if (!hasRevision(paths, map.commitmentIntent.basisPath) || !hasRevision(map.nextMoves, map.commitmentIntent.basisNextMove)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['commitmentIntent'], message: 'Commitment intent basis is missing.' });
    }
  }
  if (map.provisionalCommitment) {
    if (!hasRevision(paths, map.provisionalCommitment.basisPath)
      || !hasRevision(map.nextMoves, map.provisionalCommitment.basisNextMove)
      || !hasRevision(map.peerExposures, map.provisionalCommitment.basisPeerExposure)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['provisionalCommitment'], message: 'Provisional commitment basis is missing.' });
    }
  }

  for (const [index, proof] of map.proofRevisions.entries()) {
    if (!map.provisionalCommitment
      || proof.basisCommitment.id !== map.provisionalCommitment.id
      || proof.basisCommitment.revision !== map.provisionalCommitment.revision) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['proofRevisions', index, 'basisCommitment'], message: 'Proof commitment basis is missing.' });
    }
    if (proof.status === 'confirmed' && !proof.confirmation) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['proofRevisions', index], message: 'Confirmed proof requires auditable confirmation.' });
    }
  }
  for (const [setIndex, set] of map.sideDoorSets.entries()) {
    if (!hasRevision(map.proofRevisions, set.basisProof)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sideDoorSets', setIndex, 'basisProof'], message: 'Side Door proof basis is missing.' });
    }
    if (!unique(set.doors.map((door) => door.id))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sideDoorSets', setIndex, 'doors'], message: 'Side Doors must have distinct IDs.' });
    }
    const activeCount = set.doors.filter((door) => door.selection === 'active').length;
    if (set.status === 'suggested' && set.doors.some((door) => door.selection !== 'available')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sideDoorSets', setIndex], message: 'Suggested Side Doors cannot be preselected.' });
    }
    const parkedCount = set.doors.filter((door) => door.selection === 'parked').length;
    if (set.status === 'active' && (activeCount !== 1 || parkedCount !== 2 || !set.confirmation)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sideDoorSets', setIndex], message: 'An active Side Door set must activate one route.' });
    }
  }
  for (const [index, outcome] of map.routeOutcomes.entries()) {
    if (!hasRevision(doors, outcome.doorBasis)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['routeOutcomes', index, 'doorBasis'], message: 'Route outcome Side Door basis is missing.' });
    }
  }
});

export type Focus = z.infer<typeof focusSchema>;
export type CareerMap = z.infer<typeof careerMapSchema>;

export function createCareerMap(explorerId: string): CareerMap {
  return careerMapSchema.parse({
    schemaVersion: CAREER_MAP_SCHEMA_VERSION,
    explorerId,
    revision: 0,
    foundation: { evidence: [], constraints: [], whyRevisions: [] },
    pathSets: [],
    projects: [],
    projectOptionSets: [],
    reflections: [],
    continueChoices: [],
    nextMoves: [],
    peerExposures: [],
    proofRevisions: [],
    sideDoorSets: [],
    routeOutcomes: [],
    invalidations: [],
    operationHistory: [],
  });
}

import { z } from 'zod';
import {
  entityIdSchema,
  invalidationSchema,
  mapRevisionSchema,
  operationReceiptSchema,
  revisionRefSchema,
  revisionSchema,
  userActionProvenanceSchema,
} from './common.js';
import { foundationStateSchema } from './foundation.js';
import { purposePathSetSchema } from './paths.js';
import { pathProjectSchema, pathProjectInputSchema, projectOptionSetSchema, validateProjectBrief } from './projects.js';
import { continueChoiceSchema, nextMoveSchema, reflectionSessionSchema } from './learning.js';
import { commitmentIntentSchema, peerExposureSchema, provisionalCommitmentSchema } from './peers.js';
import { proofInventorySchema, routeOutcomeSchema, sideDoorSetSchema } from './side-doors.js';

import { careerMapSchema as careerMapV2Schema } from './legacy-v2/model.js';
export { careerMapV2Schema };

export const CAREER_MAP_SCHEMA_VERSION = 3;

export const pathFocusCommitmentSchema = z.object({
  id: entityIdSchema,
  revision: revisionSchema,
  basisPath: revisionRefSchema,
  selectionSourceId: entityIdSchema,
  action: userActionProvenanceSchema,
  basisNextMove: revisionRefSchema.optional(),
  basisLegacyIntent: revisionRefSchema.optional(),
}).strict();
export type PathFocusCommitment = z.infer<typeof pathFocusCommitmentSchema>;

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
  pathFocusCommitments: z.array(pathFocusCommitmentSchema),
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
    ['pathFocusCommitments', map.pathFocusCommitments],
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

  const projectSnapshots = new Map<string, string>();
  const projectInputs = [
    ...map.projects.map((project, index) => ({ project, path: ['projects', index] })),
    ...map.projectOptionSets.flatMap((set, setIndex) => set.projects.map((project, index) => ({ project, path: ['projectOptionSets', setIndex, 'projects', index] }))),
  ];
  // Historical V2 briefs were not subject to immutable project snapshots.
  // Enforce the stronger invariant for explicit V3 briefs without rewriting old content.
  const simpleProjectKeys = new Set(projectInputs.filter(({ project }) => project.briefFormat === 'simple-v1').map(({ project }) => `${project.id}@${project.revision}`));
  for (const { project, path } of projectInputs) {
    const key = `${project.id}@${project.revision}`;
    if (!simpleProjectKeys.has(key)) continue;
    const snapshot = JSON.stringify(pathProjectInputSchema.strip().parse(project));
    const previous = projectSnapshots.get(key);
    if (previous && previous !== snapshot) {
      context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'A project revision must have one immutable brief snapshot.' });
    } else projectSnapshots.set(key, snapshot);
  }

  const acceptedNumbers = map.projects.filter((project) => project.agreementStatus === 'accepted').map((project) => project.number);
  if (!unique(acceptedNumbers.map(String))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects'], message: 'Only one accepted Path Project may occupy a project number.' });
  }
  for (const [projectIndex, project] of map.projects.entries()) {
    validateProjectBrief(project, { ...context, addIssue: (issue) => context.addIssue({ ...issue, path: ['projects', projectIndex, ...(issue.path ?? [])] }) });
    if (!hasRevision(paths, project.basisPath)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', projectIndex, 'basisPath'], message: 'Path Project basis is missing.' });
    }
    if (project.agreementStatus === 'accepted' && !project.confirmation && (!project.proceedingReport || project.proceedingReport.retractedBy)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', projectIndex], message: 'Accepted project requires auditable confirmation or current-report proceeding.' });
    }
    if (project.acceptanceFraming && !project.acceptanceFraming.framingFormat
      && (!project.acceptanceFraming.acceptancePhrase || !project.acceptanceFraming.acceptanceQuestion)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', projectIndex, 'acceptanceFraming'], message: 'Legacy project framing requires its exact acceptance phrase and question.' });
    }
    if (project.acceptanceFraming?.status === 'delivered' && !project.acceptanceFraming.presentation) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', projectIndex, 'acceptanceFraming'], message: 'Delivered first-project framing requires completed presentation provenance.' });
    }
    if (project.acceptanceFraming?.status === 'pending' && project.acceptanceFraming.presentation) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', projectIndex, 'acceptanceFraming'], message: 'Pending first-project framing cannot claim completed presentation.' });
    }
    if (project.basisAction) {
      const receipt = map.operationHistory.find((record) => record.sourceId === project.basisAction?.sourceId);
      if (!receipt || !['request-new-project','select-purpose-path','confirm-purpose-path-revision','choose-parked-purpose-path'].includes(receipt.operationType) || JSON.stringify(receipt.confirmationProvenance) !== JSON.stringify(project.basisAction.action)) context.addIssue({ code:z.ZodIssueCode.custom, path:['projects',projectIndex,'basisAction'], message:'Project action basis must match its explicit user action receipt.' });
    }
    if (project.proceedingReport) {
      const report = project.proceedingReport;
      const receipt = map.operationHistory.find((record) => record.sourceId === report.sourceId);
      const update = project.workUpdates.find((item) => item.sourceId === report.sourceId);
      if ((project.agreementStatus === 'suggested' && !report.retractedBy)
        || report.projectId !== project.id || report.projectRevision !== project.revision
        || !receipt || receipt.operationType !== 'report-project-work'
        || JSON.stringify(receipt.confirmationProvenance) !== JSON.stringify(report.action)
        || report.action.kind !== 'user-message' || !update || update.status === 'not-started'
        || JSON.stringify(update.action) !== JSON.stringify(report.action) || update.reportedActivity !== report.reportedActivity
        || map.projects.some((other, index) => index !== projectIndex && other.proceedingReport?.sourceId === report.sourceId)) {
        context.addIssue({ code:z.ZodIssueCode.custom, path:['projects',projectIndex,'proceedingReport'], message:'Proceeding must retain its exact project and current-report operation provenance.' });
      }
      if (report.retractedBy && !project.workUpdates.some((item) => item.status === 'not-started'
        && item.correctsActionId && JSON.stringify(item.action) === JSON.stringify(report.retractedBy))) {
        context.addIssue({ code:z.ZodIssueCode.custom, path:['projects',projectIndex,'proceedingReport'], message:'Retracted proceeding requires its retained correction.' });
      }
    }
    for (const [updateIndex, update] of project.workUpdates.entries()) {
      if (!update.sourceId) continue;
      const receipt = map.operationHistory.find((record) => record.sourceId === update.sourceId);
      const previous = project.workUpdates[updateIndex - 1];
      if (!receipt || !['report-project-work','update-project-work-status','correct-project-work-status'].includes(receipt.operationType)
        || JSON.stringify(receipt.confirmationProvenance) !== JSON.stringify(update.action)
        || (receipt.operationType === 'correct-project-work-status'
          ? !previous || update.correctsActionId !== previous.action.actionId
          : update.correctsActionId !== undefined)) {
        context.addIssue({ code:z.ZodIssueCode.custom, path:['projects',projectIndex,'workUpdates',updateIndex], message:'Work updates must retain their operation and exact prior correction provenance.' });
      }
    }
    const lastWorkStatus = project.workUpdates.at(-1)?.status ?? 'not-started';
    if (lastWorkStatus !== project.workStatus) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', projectIndex, 'workStatus'], message: 'Project work status must match its latest provenance record.' });
    }
  }

  const optionBasisKey = (set: typeof map.projectOptionSets[number]) => set.basisAction
    ? `action:${set.basisAction.sourceId}`
    : set.basisNextMove ? `next-move:${set.basisNextMove.id}@${set.basisNextMove.revision}` : undefined;
  const rootOptionBases = map.projectOptionSets.filter((set) => !set.supersedesSetId && (set.basisAction || set.projects.some((project) => project.briefFormat === 'simple-v1'))).map(optionBasisKey).filter((key): key is string => !!key);
  if (!unique(rootOptionBases)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectOptionSets'], message: 'An authoritative project basis may be consumed only once.' });
  }
  for (const [setIndex, set] of map.projectOptionSets.entries()) {
    for (const [projectIndex, project] of set.projects.entries()) {
      validateProjectBrief(project, { ...context, addIssue: (issue) => context.addIssue({ ...issue, path: ['projectOptionSets', setIndex, 'projects', projectIndex, ...(issue.path ?? [])] }) });
    }
    if (!unique(set.projects.map((project) => project.id))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectOptionSets', setIndex, 'projects'], message: 'Follow-on projects must have distinct IDs.' });
    }
    if (!hasRevision(paths, set.basisPath)
      || (set.basisNextMove && !hasRevision(map.nextMoves, set.basisNextMove))
      || (!set.basisNextMove && !set.basisAction)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectOptionSets', setIndex], message: 'Follow-on project basis is missing.' });
    }
    if (set.supersedesSetId) {
      const previous = map.projectOptionSets.find((record) => record.id === set.supersedesSetId);
      if (!previous || previous.id === set.id || optionBasisKey(previous) !== optionBasisKey(set)
        || JSON.stringify(previous.basisPath) !== JSON.stringify(set.basisPath)
        || previous.projectNumber !== set.projectNumber) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectOptionSets', setIndex, 'supersedesSetId'], message: 'Replacement project options must preserve their original authoritative basis.' });
      }
    }
    if (set.basisAction && set.basisNextMove) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectOptionSets', setIndex], message: 'Project options require exactly one authoritative basis.' });
    }
    if (set.basisAction) {
      const receipt = map.operationHistory.find((record) => record.sourceId === set.basisAction?.sourceId);
      if (!receipt || !['request-new-project', 'select-purpose-path', 'confirm-purpose-path-revision', 'choose-parked-purpose-path'].includes(receipt.operationType)
        || JSON.stringify(receipt.confirmationProvenance) !== JSON.stringify(set.basisAction.action)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['projectOptionSets', setIndex, 'basisAction'], message: 'Project option action basis must match an explicit user action receipt.' });
      }
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
  for (const [index, choice] of map.continueChoices.entries()) {
    const reflection = map.reflections.find((record) => record.id === choice.reflectionBasis.id && record.revision === choice.reflectionBasis.revision);
    const project = reflection && map.projects.find((record) => record.id === reflection.projectBasis.id && record.revision === reflection.projectBasis.revision);
    if (project && choice.scope && choice.scope !== (project.relationship === 'unrelated' ? 'project' : 'path')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['continueChoices', index, 'scope'], message: 'Continue choice scope must match its reflected project relationship.' });
    }
  }
  for (const [index, commitment] of map.pathFocusCommitments.entries()) {
    const selection = map.operationHistory.find((receipt) => receipt.sourceId === commitment.selectionSourceId);
    const selectedSet = selection && map.pathSets.find((set) => set.confirmation?.confirmedBy.actionId === selection.confirmationProvenance?.actionId && set.paths.some((path) => path.selection === 'active' && path.id === commitment.basisPath.id && path.revision === commitment.basisPath.revision));
    const legacyIdentity = [map.provisionalCommitment, map.commitmentIntent].some((legacy) => legacy?.id === commitment.id && legacy.revision === commitment.revision);
    const move = commitment.basisNextMove && map.nextMoves.find((candidate) => candidate.id === commitment.basisNextMove?.id && candidate.revision === commitment.basisNextMove.revision);
    const choice = move && map.continueChoices.find((candidate) => candidate.id === move.continueChoiceBasis.id && candidate.revision === move.continueChoiceBasis.revision);
    const reflection = choice && map.reflections.find((candidate) => candidate.id === choice.reflectionBasis.id && candidate.revision === choice.reflectionBasis.revision);
    const project = reflection && map.projects.find((candidate) => candidate.id === reflection.projectBasis.id && candidate.revision === reflection.projectBasis.revision);
    const expectedOperation = commitment.basisNextMove ? 'record-next-move' : commitment.basisLegacyIntent ? 'confirm-legacy-path-focus' : 'record-path-focus';
    const actionReceipt = map.operationHistory.find((receipt) => receipt.operationType === expectedOperation && JSON.stringify(receipt.confirmationProvenance) === JSON.stringify(commitment.action));
    if (legacyIdentity || !selectedSet || !actionReceipt || !selection?.confirmationProvenance || selection.confirmationProvenance.turnSequence > commitment.action.turnSequence
      || (move && (move.kind !== 'commit-provisionally' || choice?.scope === 'project' || project?.basisPath.id !== commitment.basisPath.id || project?.basisPath.revision !== commitment.basisPath.revision || JSON.stringify(move.action) !== JSON.stringify(commitment.action)))
      || (commitment.basisLegacyIntent && (map.commitmentIntent?.basisPath.id !== commitment.basisPath.id || map.commitmentIntent?.basisPath.revision !== commitment.basisPath.revision || map.commitmentIntent.action.turnSequence >= commitment.action.turnSequence))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path:['pathFocusCommitments',index], message:'Path focus identity, selection, or explicit action authority is inconsistent.' });
    }
    if (!hasRevision(paths, commitment.basisPath)
      || !selection || !['select-purpose-path', 'confirm-purpose-path-revision', 'choose-parked-purpose-path'].includes(selection.operationType)
      || (commitment.basisNextMove && !hasRevision(map.nextMoves, commitment.basisNextMove))
      || (commitment.basisLegacyIntent && (!map.commitmentIntent || !hasRevision([map.commitmentIntent], commitment.basisLegacyIntent)))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pathFocusCommitments', index], message: 'Path focus commitment basis is missing.' });
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
    pathFocusCommitments: [],
    proofRevisions: [],
    sideDoorSets: [],
    routeOutcomes: [],
    invalidations: [],
    operationHistory: [],
  });
}

/** Parse historical documents before adding any V3 defaults. The persisted input is never mutated. */
export function readCareerMap(input: unknown): CareerMap {
  if (typeof input === 'object' && input !== null && 'schemaVersion' in input && input.schemaVersion === 2) {
    const legacy = careerMapV2Schema.parse(input);
    return careerMapSchema.parse({
      ...legacy,
      schemaVersion: CAREER_MAP_SCHEMA_VERSION,
      pathFocusCommitments: [],
    });
  }
  return careerMapSchema.parse(input);
}

import type { z } from 'zod';
import {
  invalidationTargetOrder,
  userActionProvenanceSchema,
  type Confirmation,
  type InvalidationTargetKind,
  type ModelPresentation,
  type UserActionProvenance,
} from './common';
import { careerMapSchema, type CareerMap } from './model';
import {
  parseCareerMapOperation,
  type CareerMapOperation,
  type CareerMapOperationType,
} from './operations';
import type { PurposePath, PurposePathInput, PurposePathSet } from './paths';
import { pathProjectInputSchema, type PathProjectInput, type ProjectOptionSet } from './projects';
import { isExactFirstProjectFramingDelivery } from './authority';
import type { SideDoorInput, SideDoorSet } from './side-doors';
import { selectActivePurposePath, selectCurrentProjectLearning, selectCurrentPathSelectionSourceId, selectProjectDecisionBasis, hasCompletedLearningLoop, isActiveBasisReview, selectEarliestActiveReview, selectLatestAcceptedProject, deriveMethodCheckpoint } from './selector';

type RejectionCode =
  | 'invalid-map'
  | 'invalid-operation'
  | 'source-id-reused'
  | 'revision-conflict'
  | 'illegal-transition'
  | 'stale-target'
  | 'confirmation-not-auditable'
  | 'invariant-violation';

export type ApplyCareerMapResult =
  | { status: 'committed'; map: CareerMap; receipt: CareerMap['operationHistory'][number]; effects?: CareerMapOperationEffects }
  | { status: 'replayed'; map: CareerMap; receipt: CareerMap['operationHistory'][number]; effects?: CareerMapOperationEffects }
  | { status: 'rejected'; map: CareerMap; error: { code: RejectionCode; message: string; details?: unknown } };

export interface CareerMapOperationEffects {
  invalidatedArtifactClasses: InvalidationTargetKind[];
}

class DomainError extends Error {
  constructor(readonly code: RejectionCode, message: string) {
    super(message);
  }
}

function cloneMap(map: CareerMap): CareerMap {
  return JSON.parse(JSON.stringify(map)) as CareerMap;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function stablePayloadFingerprint(value: unknown): string {
  const input = canonicalJson(value);
  const states = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const primes = [0x01000193, 0x27d4eb2d, 0x165667b1, 0x9e3779b1];
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    for (let lane = 0; lane < states.length; lane += 1) {
      states[lane] = Math.imul(states[lane] ^ (code + lane * 131), primes[lane]);
      states[lane] ^= states[lane] >>> 13;
    }
  }
  return `u2-v1-${states.map((state) => (state >>> 0).toString(16).padStart(8, '0')).join('')}`;
}

function assert(condition: unknown, message: string, code: RejectionCode = 'illegal-transition'): asserts condition {
  if (!condition) throw new DomainError(code, message);
}

function sameRevision(record: { id: string; revision: number }, id: string, revision: number): boolean {
  return record.id === id && record.revision === revision;
}

function currentWhy(map: CareerMap) {
  return map.foundation.whyRevisions.findLast((why) => why.status === 'confirmed');
}

function currentPathSet(map: CareerMap) {
  return map.pathSets.findLast((set) => set.status === 'active');
}

function parkPendingProjects(map: CareerMap): void {
  for (const project of map.projects) if (project.agreementStatus === 'suggested') project.agreementStatus = 'parked';
  for (const set of map.projectOptionSets) if (set.status === 'suggested') set.status = 'superseded';
}

function latestNextMove(map: CareerMap) {
  return map.nextMoves.at(-1);
}

function confirmedProof(map: CareerMap) {
  return map.proofRevisions.findLast((proof) => proof.status === 'confirmed');
}

function asPath(input: PurposePathInput, selection: PurposePath['selection'] = 'available'): PurposePath {
  return { ...input, selection, equalWeight: true };
}

function pathInput(path: PurposePath): PurposePathInput {
  const { selection: _selection, equalWeight: _equalWeight, ...input } = path;
  return input;
}

function pathContent(path: PurposePathInput): Omit<PurposePathInput, 'id' | 'revision'> {
  const { id: _id, revision: _revision, ...content } = path;
  return content;
}

function assertPathRevisionConsistency(map: CareerMap, paths: PurposePathInput[]): void {
  const existingPaths = map.pathSets.flatMap((set) => set.paths);
  for (const candidate of paths) {
    const existing = existingPaths.find((path) => sameRevision(path, candidate.id, candidate.revision));
    assert(
      !existing || canonicalJson(pathInput(existing)) === canonicalJson(candidate),
      'Purpose Path content changes require a new revision.',
      'revision-conflict',
    );
  }
}

const projectBriefKeys = Object.keys(pathProjectInputSchema.shape) as Array<keyof PathProjectInput>;

function projectBriefContent(project: PathProjectInput) {
  return Object.fromEntries(projectBriefKeys
    .filter((key) => project[key] !== undefined)
    .map((key) => [key, project[key]]));
}

function assertProjectRevisionConsistency(map: CareerMap, candidates: PathProjectInput[]): void {
  const inputs = [...map.projects, ...map.projectOptionSets.flatMap((set) => set.projects)];
  for (const candidate of candidates) {
    const existing = inputs.find((project) => sameRevision(project, candidate.id, candidate.revision));
    if (!existing) continue;
    assert(canonicalJson(projectBriefContent(existing)) === canonicalJson(projectBriefContent(candidate)), 'Project content changes require a new identity or revision.', 'revision-conflict');
  }
}

function requireLatestReflection(map: CareerMap, id:string, revision:number) {
  const reflection = map.reflections.findLast((item) => item.id === id);
  assert(reflection && reflection.revision === revision, 'The reflection revision is stale.', 'stale-target');
  return reflection;
}

function assertFirstPathSetInTurn(map: CareerMap, presentation: ModelPresentation): void {
  assert(
    !map.pathSets.some((set) => set.presentation.assistantTurnId === presentation.assistantTurnId),
    'An assistant turn may present only one Purpose Path set.',
  );
}

function auditableConfirmation(
  target: { id: string; revision: number; presentation: ModelPresentation },
  action: UserActionProvenance,
): Confirmation {
  const turnIsValid = action.kind === 'ui-action'
    || action.turnId !== target.presentation.assistantTurnId;
  const sequenceIsValid = action.kind === 'ui-action'
    ? action.turnSequence >= target.presentation.turnSequence
    : action.turnSequence > target.presentation.turnSequence;
  assert(turnIsValid && sequenceIsValid, 'Confirmation must come from a subsequent user turn or an explicit UI action.', 'confirmation-not-auditable');
  return {
    targetId: target.id,
    targetRevision: target.revision,
    presentedInTurnId: target.presentation.assistantTurnId,
    confirmedBy: action,
  };
}

function ensureUniqueIds(records: Array<{ id: string }>, label: string): void {
  assert(new Set(records.map((record) => record.id)).size === records.length, `${label} must have distinct IDs.`, 'invariant-violation');
}

function addInvalidation(
  map: CareerMap,
  basisKind: CareerMap['invalidations'][number]['basisKind'],
  basisId: string,
  basisRevision: number,
  targetKind: InvalidationTargetKind,
  targetId: string,
  targetRevision: number,
): void {
  if (map.invalidations.some((item) => item.status === 'pending' && item.targetKind === targetKind && item.targetId === targetId && item.targetRevision === targetRevision)) return;
  map.invalidations.push({
    id: `${basisKind}:${basisId}@${basisRevision}->${targetKind}:${targetId}@${targetRevision}`.slice(0, 160),
    basisKind,
    basisId,
    basisRevision,
    targetKind,
    targetId,
    targetRevision,
    createdAtRevision: map.revision + 1,
    status: 'pending',
  });
}

function invalidateCommitmentClosure(map: CareerMap, basisKind: CareerMap['invalidations'][number]['basisKind'], basisId: string, basisRevision: number, includeCommitment: boolean): void {
  if (includeCommitment) {
    if (map.commitmentIntent) addInvalidation(map, basisKind, basisId, basisRevision, 'commitment', map.commitmentIntent.id, map.commitmentIntent.revision);
    if (map.provisionalCommitment) addInvalidation(map, basisKind, basisId, basisRevision, 'commitment', map.provisionalCommitment.id, map.provisionalCommitment.revision);
  }
  if (includeCommitment) for (const focus of map.pathFocusCommitments) addInvalidation(map, basisKind, basisId, basisRevision, 'commitment', focus.id, focus.revision);
  for (const proof of map.proofRevisions) addInvalidation(map, basisKind, basisId, basisRevision, 'proof', proof.id, proof.revision);
  for (const set of map.sideDoorSets) addInvalidation(map, basisKind, basisId, basisRevision, 'side-door-set', set.id, set.revision);
  for (const outcome of map.routeOutcomes) addInvalidation(map, basisKind, basisId, basisRevision, 'route-outcome', outcome.id, outcome.revision);
}

function invalidateFromLearning(map: CareerMap, reflectionRefs: Array<{ id: string; revision: number }>, basisKind: 'project' | 'learning', basisId: string, basisRevision: number): void {
  const reflectionIds = new Set(reflectionRefs.map((reflection) => reflection.id));
  const choiceIds = new Set(
    map.continueChoices.filter((choice) => reflectionIds.has(choice.reflectionBasis.id)).map((choice) => choice.id),
  );
  const moveIds = new Set(
    map.nextMoves.filter((move) => choiceIds.has(move.continueChoiceBasis.id)).map((move) => move.id),
  );
  for (const reflection of reflectionRefs) addInvalidation(map, basisKind, basisId, basisRevision, 'reflection', reflection.id, reflection.revision);
  for (const move of map.nextMoves.filter((item) => moveIds.has(item.id))) addInvalidation(map, basisKind, basisId, basisRevision, 'next-move', move.id, move.revision);
  const commitmentDepends = Boolean(
    (map.commitmentIntent && moveIds.has(map.commitmentIntent.basisNextMove.id))
    || (map.provisionalCommitment && moveIds.has(map.provisionalCommitment.basisNextMove.id)),
  );
  if (commitmentDepends) invalidateCommitmentClosure(map, basisKind, basisId, basisRevision, true);
}

function invalidateFromProject(map: CareerMap, projectId: string, projectRevision: number): void {
  addInvalidation(map, 'project', projectId, projectRevision, 'project', projectId, projectRevision);
  const reflections = map.reflections.filter((reflection) => reflection.projectBasis.id === projectId && reflection.projectBasis.revision === projectRevision);
  invalidateFromLearning(map, reflections, 'project', projectId, projectRevision);
}

function invalidateFromPath(map: CareerMap, pathId: string, pathRevision: number): void {
  const projectIds = new Set(
    map.projects.filter((project) => project.basisPath.id === pathId && project.basisPath.revision === pathRevision).map((project) => project.id),
  );
  for (const project of map.projects.filter((item) => projectIds.has(item.id))) invalidateFromProject(map, project.id, project.revision);
  const peerIds = new Set(
    map.peerExposures.filter((peer) => peer.basisPath.id === pathId && peer.basisPath.revision === pathRevision).map((peer) => peer.id),
  );
  for (const peer of map.peerExposures.filter((item) => peerIds.has(item.id))) addInvalidation(map, 'purpose-path', pathId, pathRevision, 'peer-exposure', peer.id, peer.revision);
  const commitmentDepends = Boolean(
    (map.commitmentIntent && map.commitmentIntent.basisPath.id === pathId && map.commitmentIntent.basisPath.revision === pathRevision)
    || (map.provisionalCommitment && map.provisionalCommitment.basisPath.id === pathId && map.provisionalCommitment.basisPath.revision === pathRevision),
  );
  for (const focus of map.pathFocusCommitments.filter((item) => sameRevision(item.basisPath, pathId, pathRevision))) addInvalidation(map, 'purpose-path', pathId, pathRevision, 'commitment', focus.id, focus.revision);
  if (commitmentDepends) invalidateCommitmentClosure(map, 'purpose-path', pathId, pathRevision, true);
}

function invalidateFromWhy(
  map: CareerMap,
  oldWhyId: string,
  oldWhyRevision: number,
  newWhyId: string,
  newWhyRevision: number,
): { invalidatedRecords: CareerMap['invalidations']; invalidatedArtifactClasses: InvalidationTargetKind[] } {
  const firstInvalidationIndex = map.invalidations.length;
  const impactedSets = map.pathSets.filter((set) => set.basisWhy.id === oldWhyId && set.basisWhy.revision === oldWhyRevision);
  for (const set of impactedSets) addInvalidation(map, 'why', newWhyId, newWhyRevision, 'path-set', set.id, set.revision);
  const impactedPaths = impactedSets.flatMap((set) => set.paths);
  for (const path of impactedPaths) {
    const projectIds = map.projects
      .filter((project) => project.basisPath.id === path.id && project.basisPath.revision === path.revision)
      .map((project) => project.id);
    for (const projectId of projectIds) {
      const project = map.projects.find((item) => item.id === projectId)!;
      addInvalidation(map, 'why', newWhyId, newWhyRevision, 'project', projectId, project.revision);
      const reflectionIds = new Set(map.reflections.filter((reflection) => reflection.projectBasis.id === projectId && reflection.projectBasis.revision === project.revision).map((reflection) => reflection.id));
      const choiceIds = new Set(map.continueChoices.filter((choice) => reflectionIds.has(choice.reflectionBasis.id)).map((choice) => choice.id));
      const moveIds = new Set(map.nextMoves.filter((move) => choiceIds.has(move.continueChoiceBasis.id)).map((move) => move.id));
      for (const reflection of map.reflections.filter((item) => reflectionIds.has(item.id))) addInvalidation(map, 'why', newWhyId, newWhyRevision, 'reflection', reflection.id, reflection.revision);
      for (const move of map.nextMoves.filter((item) => moveIds.has(item.id))) addInvalidation(map, 'why', newWhyId, newWhyRevision, 'next-move', move.id, move.revision);
    }
    for (const peer of map.peerExposures.filter((item) => item.basisPath.id === path.id && item.basisPath.revision === path.revision)) {
      addInvalidation(map, 'why', newWhyId, newWhyRevision, 'peer-exposure', peer.id, peer.revision);
    }
  }
  invalidateCommitmentClosure(map, 'why', newWhyId, newWhyRevision, true);
  const invalidatedRecords = map.invalidations.slice(firstInvalidationIndex);
  return {
    invalidatedRecords,
    invalidatedArtifactClasses: invalidationTargetOrder.filter((targetKind) => (
      invalidatedRecords.some((record) => record.targetKind === targetKind)
    )),
  };
}

function invalidateFromProof(map: CareerMap, oldProofId: string, oldProofRevision: number): void {
  for (const set of map.sideDoorSets.filter((item) => item.basisProof.id === oldProofId)) {
    addInvalidation(map, 'proof', oldProofId, oldProofRevision, 'side-door-set', set.id, set.revision);
    const doorIds = new Set(set.doors.map((door) => door.id));
    for (const outcome of map.routeOutcomes.filter((item) => doorIds.has(item.doorBasis.id))) {
      addInvalidation(map, 'proof', oldProofId, oldProofRevision, 'route-outcome', outcome.id, outcome.revision);
    }
  }
}

function invalidateFromPeerExposure(map: CareerMap, oldExposureId: string, newExposureId: string, newExposureRevision: number): void {
  if (map.provisionalCommitment?.basisPeerExposure.id === oldExposureId) {
    invalidateCommitmentClosure(map, 'peer-exposure', newExposureId, newExposureRevision, true);
  }
}

function ensureNoPendingReview(map: CareerMap, type: CareerMapOperationType): void {
  if (type === 'resolve-basis-review') return;
  assert(!map.invalidations.some((item) => isActiveBasisReview(map, item)), 'Resolve the earliest invalidated basis before downstream changes.');
  const pendingWhyRevision = map.foundation.whyRevisions.some((why) => (
    why.status === 'suggested' && why.supersedesWhyId !== undefined
  ));
  assert(
    !pendingWhyRevision || type === 'revise-why' || type === 'confirm-why'
      || (type === 'close-focus' && map.focus?.kind === 'foundation-revision'),
    'Confirm or revise the pending Why revision before downstream changes.',
  );
}

function nextProjectNumber(map: CareerMap): number {
  let highestAcceptedNumber = 0;
  for (const project of map.projects) {
    if ((project.confirmation || (project.proceedingReport && !project.proceedingReport.retractedBy)) && project.number > highestAcceptedNumber) {
      highestAcceptedNumber = project.number;
    }
  }
  return highestAcceptedNumber + 1;
}

function applyDomainOperation(map: CareerMap, operation: CareerMapOperation): CareerMapOperationEffects | undefined {
  ensureNoPendingReview(map, operation.type);
  if ('project' in operation.payload) assertProjectRevisionConsistency(map, [operation.payload.project]);
  if ('replacement' in operation.payload && (
    operation.type === 'replace-project-proposal'
    || operation.type === 'propose-project-revision'
    || operation.type === 'replace-follow-on-project'
  )) assertProjectRevisionConsistency(map, [operation.payload.replacement]);
  if ('projects' in operation.payload) assertProjectRevisionConsistency(map, operation.payload.projects);

  switch (operation.type) {
    case 'append-foundation-evidence': {
      assert(!map.foundation.evidence.some((item) => sameRevision(item, operation.payload.evidence.id, operation.payload.evidence.revision)), 'Foundation evidence revision already exists.');
      map.foundation.evidence.push(operation.payload.evidence);
      return;
    }
    case 'correct-foundation-evidence': {
      const prior = map.foundation.evidence.find((item) => item.id === operation.payload.supersedesEvidenceId);
      assert(prior, 'Superseded Foundation evidence does not exist.', 'stale-target');
      assert(operation.payload.evidence.supersedesEvidenceId === operation.payload.supersedesEvidenceId, 'Correction must carry its superseded evidence ID.');
      map.foundation.evidence.push(operation.payload.evidence);
      return;
    }
    case 'record-reality-constraint': {
      map.foundation.constraints.push(operation.payload.constraint);
      return;
    }
    case 'propose-why':
    case 'revise-why': {
      let effects: CareerMapOperationEffects | undefined;
      if (operation.type === 'revise-why') {
        const confirmed = currentWhy(map);
        assert(confirmed?.id === operation.payload.supersedesWhyId, 'Why revision must target the current confirmed Why.', 'stale-target');
        effects = {
          invalidatedArtifactClasses: invalidateFromWhy(
            cloneMap(map),
            confirmed.id,
            confirmed.revision,
            operation.payload.why.id,
            operation.payload.why.revision,
          ).invalidatedArtifactClasses,
        };
      } else {
        assert(!currentWhy(map), 'Use revise-why after a Why has been confirmed.');
      }
      for (const why of map.foundation.whyRevisions.filter((item) => item.status === 'suggested')) why.status = 'superseded';
      map.foundation.whyRevisions.push({
        ...operation.payload.why,
        status: 'suggested',
        presentation: operation.payload.presentation,
        ...(operation.type === 'revise-why' ? { supersedesWhyId: operation.payload.supersedesWhyId } : {}),
      });
      return effects;
    }
    case 'confirm-why': {
      const target = map.foundation.whyRevisions.find((why) => sameRevision(why, operation.payload.whyId, operation.payload.whyRevision));
      assert(target?.status === 'suggested', 'Why confirmation target is stale or unavailable.', 'stale-target');
      const prior = currentWhy(map);
      target.confirmation = auditableConfirmation(target, operation.payload.action);
      target.status = 'confirmed';
      if (prior) {
        prior.status = 'superseded';
        invalidateFromWhy(map, prior.id, prior.revision, target.id, target.revision);
      }
      return;
    }
    case 'propose-purpose-paths': {
      assertFirstPathSetInTurn(map, operation.payload.presentation);
      const why = currentWhy(map);
      assert(why, 'Purpose Paths require a confirmed Why.');
      ensureUniqueIds(operation.payload.paths, 'Purpose Paths');
      assertPathRevisionConsistency(map, operation.payload.paths);
      for (const set of map.pathSets.filter((item) => item.status === 'suggested')) set.status = 'superseded';
      map.pathSets.push({
        id: operation.payload.setId,
        revision: operation.payload.setRevision,
        status: 'suggested',
        basisWhy: { id: why.id, revision: why.revision },
        paths: operation.payload.paths.map((path) => asPath(path)) as PurposePathSet['paths'],
        presentation: operation.payload.presentation,
        changeKind: 'initial',
      });
      return;
    }
    case 'replace-purpose-path': {
      assertFirstPathSetInTurn(map, operation.payload.presentation);
      const source = map.pathSets.find((set) => sameRevision(set, operation.payload.sourceSetId, operation.payload.sourceSetRevision));
      assert(source && source.status !== 'superseded', 'Purpose Path source set is stale.', 'stale-target');
      assert(source.paths.some((path) => path.id === operation.payload.replacedPathId), 'Replacement target is not in the source set.', 'stale-target');
      const replacements = source.paths.map((path) => path.id === operation.payload.replacedPathId ? operation.payload.replacement : pathInput(path));
      ensureUniqueIds(replacements, 'Purpose Paths');
      assertPathRevisionConsistency(map, replacements);
      for (const set of map.pathSets.filter((item) => item.status === 'suggested')) set.status = 'superseded';
      map.pathSets.push({
        id: operation.payload.replacementSetId,
        revision: operation.payload.replacementSetRevision,
        status: 'suggested',
        basisWhy: source.basisWhy,
        paths: replacements.map((path) => asPath(path)) as PurposePathSet['paths'],
        presentation: operation.payload.presentation,
        supersedesSetId: source.id,
        changeKind: 'replacement',
      });
      return;
    }
    case 'revise-purpose-paths': {
      assertFirstPathSetInTurn(map, operation.payload.presentation);
      const source = map.pathSets.find((set) => sameRevision(set, operation.payload.sourceSetId, operation.payload.sourceSetRevision));
      assert(source && source.status !== 'superseded', 'Purpose Path source set is stale.', 'stale-target');
      const sourceIds = new Set(source.paths.map((path) => path.id));
      const changed = operation.payload.paths.filter((path, index) => {
        assert(!sourceIds.has(path.id) || path.id === source.paths[index].id, 'Retained Purpose Paths must keep their original order.');
        return canonicalJson(pathContent(path)) !== canonicalJson(pathContent(pathInput(source.paths[index])));
      });
      assert(changed.length >= 2, 'A full-set revision must change at least two Purpose Paths.');
      ensureUniqueIds(operation.payload.paths, 'Purpose Paths');
      assertPathRevisionConsistency(map, operation.payload.paths);
      for (const set of map.pathSets.filter((item) => item.status === 'suggested')) set.status = 'superseded';
      map.pathSets.push({
        id: operation.payload.replacementSetId,
        revision: operation.payload.replacementSetRevision,
        status: 'suggested',
        basisWhy: source.basisWhy,
        paths: operation.payload.paths.map((path) => asPath(path)) as PurposePathSet['paths'],
        presentation: operation.payload.presentation,
        supersedesSetId: source.id,
        changeKind: 'revision',
      });
      return;
    }
    case 'combine-purpose-paths': {
      assertFirstPathSetInTurn(map, operation.payload.presentation);
      const source = map.pathSets.find((set) => sameRevision(set, operation.payload.sourceSetId, operation.payload.sourceSetRevision));
      assert(source && source.status !== 'superseded', 'Purpose Path combination source is stale.', 'stale-target');
      const [first, second] = operation.payload.combinedPathIds;
      assert(first !== second && source.paths.some((path) => path.id === first) && source.paths.some((path) => path.id === second), 'Combined paths must be two distinct members of the source set.');
      ensureUniqueIds(operation.payload.paths, 'Combined Purpose Paths');
      assertPathRevisionConsistency(map, operation.payload.paths);
      const preserved = source.paths.find((path) => path.id !== first && path.id !== second)!;
      assert(operation.payload.paths.some((path) => sameRevision(path, preserved.id, preserved.revision)), 'A combination must preserve the uncombined sibling and add a merged path plus a new third path.');
      for (const set of map.pathSets.filter((item) => item.status === 'suggested')) set.status = 'superseded';
      map.pathSets.push({
        id: operation.payload.replacementSetId,
        revision: operation.payload.replacementSetRevision,
        status: 'suggested',
        basisWhy: source.basisWhy,
        paths: operation.payload.paths.map((path) => asPath(path)) as PurposePathSet['paths'],
        presentation: operation.payload.presentation,
        supersedesSetId: source.id,
        changeKind: 'combination',
        combinedFromPathIds: operation.payload.combinedPathIds,
      });
      return;
    }
    case 'select-purpose-path':
    case 'confirm-purpose-path-revision': {
      const set = map.pathSets.find((item) => sameRevision(item, operation.payload.setId, operation.payload.setRevision));
      assert(set?.status === 'suggested', 'Purpose Path selection target is stale.', 'stale-target');
      const selected = set.paths.find((path) => sameRevision(path, operation.payload.pathId, operation.payload.pathRevision));
      assert(selected, 'Selected Purpose Path revision is unavailable.', 'stale-target');
      const priorSet = currentPathSet(map);
      const priorPath = selectActivePurposePath(map);
      set.confirmation = auditableConfirmation(set, operation.payload.action);
      set.status = 'active';
      set.paths = set.paths.map((path) => ({ ...path, selection: path.id === selected.id && path.revision === selected.revision ? 'active' : 'parked' })) as PurposePathSet['paths'];
      if (priorSet && priorSet !== set) priorSet.status = 'superseded';
      if (map.focus?.kind === 'path-revision') delete map.focus;
      parkPendingProjects(map);
      if (priorPath && (priorPath.id !== selected.id || priorPath.revision !== selected.revision)) {
        invalidateFromPath(map, priorPath.id, priorPath.revision);
      }
      return;
    }
    case 'choose-parked-purpose-path': {
      const source = map.pathSets.find((set) => sameRevision(set, operation.payload.sourceSetId, operation.payload.sourceSetRevision));
      const move = latestNextMove(map);
      assert(source?.status === 'active' && (move?.kind === 'return-to-paths' || map.focus?.kind === 'path-revision'), 'A parked path can be chosen only after a return-to-paths Next Move.', 'stale-target');
      const selected = source.paths.find((path) => sameRevision(path, operation.payload.pathId, operation.payload.pathRevision) && path.selection === 'parked');
      const priorPath = source.paths.find((path) => path.selection === 'active');
      assert(selected && priorPath, 'Parked Purpose Path target is stale.', 'stale-target');
      const replacement: PurposePathSet = {
        id: operation.payload.replacementSetId,
        revision: operation.payload.replacementSetRevision,
        status: 'active',
        basisWhy: source.basisWhy,
        paths: source.paths.map((path) => ({ ...path, selection: sameRevision(path, selected.id, selected.revision) ? 'active' : 'parked' })) as PurposePathSet['paths'],
        presentation: source.presentation,
        confirmation: {
          targetId: operation.payload.replacementSetId,
          targetRevision: operation.payload.replacementSetRevision,
          presentedInTurnId: source.presentation.assistantTurnId,
          confirmedBy: operation.payload.action,
        },
        supersedesSetId: source.id,
        changeKind: 'revision',
      };
      auditableConfirmation({ id: replacement.id, revision: replacement.revision, presentation: replacement.presentation }, operation.payload.action);
      source.status = 'superseded';
      map.pathSets.push(replacement);
      parkPendingProjects(map);
      invalidateFromPath(map, priorPath.id, priorPath.revision);
      if (map.focus?.kind === 'path-revision') delete map.focus;
      return;
    }
    case 'request-new-project': {
      assert(selectActivePurposePath(map), 'A project request requires a selected path as context.');
      assert(!map.focus || map.focus.kind === 'peers' || map.focus.kind === 'reflection', 'Finish the active direction discussion before requesting a project.');
      if (map.focus?.kind === 'reflection' || map.focus?.kind === 'peers') delete map.focus;
      parkPendingProjects(map);
      return;
    }
    case 'record-path-focus':
    case 'confirm-legacy-path-focus': {
      const path = selectActivePurposePath(map);
      const selectionSourceId = selectCurrentPathSelectionSourceId(map);
      assert(path && selectionSourceId, 'Focus requires an auditable current path selection.');
      if (operation.type === 'record-path-focus') {
        assert(sameRevision(path, operation.payload.pathId, operation.payload.pathRevision), 'Focus target must be the current path revision.', 'stale-target');
      } else {
        const intent = map.commitmentIntent;
        assert(intent && intent.status !== 'completed' && sameRevision(intent, operation.payload.intentId, operation.payload.intentRevision) && sameRevision(intent.basisPath,path.id,path.revision), 'Legacy intent is stale.', 'stale-target');
        const selection = map.operationHistory.find((item) => item.sourceId === selectionSourceId);
        assert(selection?.confirmationProvenance && selection.confirmationProvenance.turnSequence <= intent.action.turnSequence, 'Legacy intent no longer belongs to this selection tenure.', 'stale-target');
        assert(operation.payload.action.turnSequence > intent.action.turnSequence, 'Legacy intent requires a fresh explicit later user action.', 'confirmation-not-auditable');
      }
      map.pathFocusCommitments.push({id:operation.payload.id,revision:operation.payload.revision,basisPath:{id:path.id,revision:path.revision},selectionSourceId,action:operation.payload.action,...(operation.type === 'confirm-legacy-path-focus' ? {basisLegacyIntent:{id:operation.payload.intentId,revision:operation.payload.intentRevision}} : {})});
      return;
    }
    case 'propose-first-project': {
      const path = selectActivePurposePath(map);
      assert(path, 'A first Path Project requires an active Purpose Path.');
      assert(!map.projects.some((project) => project.agreementStatus === 'suggested'), 'Replace the current unaccepted project proposal instead of making another independent proposal.');
      assert(!hasCompletedLearningLoop(map), 'After a completed learning loop offer exactly three projects.');
      const current = selectLatestAcceptedProject(map);
      const basis = selectProjectDecisionBasis(map);
      assert(!current || !sameRevision(current.basisPath, path.id, path.revision) || selectProjectDecisionBasis(map)?.basisAction, 'A new project requires an explicit current direction or project request.');
      for (const project of map.projects.filter((item) => item.agreementStatus === 'suggested')) project.agreementStatus = 'superseded';
      map.projects.push({
        ...operation.payload.project,
        number: nextProjectNumber(map),
        ...(basis?.basisAction ? {basisAction:basis.basisAction} : {}),
        basisPath: { id: path.id, revision: path.revision },
        agreementStatus: 'suggested',
        workStatus: 'not-started',
        workUpdates: [],
        presentation: operation.payload.presentation,
      });
      return;
    }
    case 'replace-project-proposal': {
      const source = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      assert(source?.agreementStatus === 'suggested', 'Only an unaccepted project proposal can be replaced.', 'stale-target');
      source.agreementStatus = 'superseded';
      map.projects.push({
        ...operation.payload.replacement,
        number: source.number,
        ...(source.basisAction ? {basisAction:source.basisAction} : {}),
        basisPath: source.basisPath,
        agreementStatus: 'suggested',
        workStatus: 'not-started',
        workUpdates: [],
        presentation: operation.payload.presentation,
        supersedesProjectId: source.supersedesProjectId ?? source.id,
      });
      return;
    }
    case 'present-first-project-framing': {
      const target = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      assert(target?.agreementStatus === 'suggested', 'First project framing target is stale.', 'stale-target');
      assert(!target.acceptanceFraming, 'The first project framing was already presented.', 'stale-target');
      assert(
        operation.payload.presentation.turnSequence > target.presentation.turnSequence
        || (
          operation.payload.framingFormat === 'natural-v1'
          && operation.payload.presentation.turnSequence === target.presentation.turnSequence
          && operation.payload.presentation.assistantTurnId === target.presentation.assistantTurnId
        ),
        'Project framing requires a later assistant turn or the exact natural proposal turn.',
        'confirmation-not-auditable',
      );
      assert(operation.payload.framingFormat === 'natural-v1' || (operation.payload.acceptancePhrase && operation.payload.acceptanceQuestion), 'Legacy framing requires its phrase and question.');
      target.acceptanceFraming = {
        locale: operation.payload.locale,
        framingText: operation.payload.framingText,
        ...(operation.payload.framingFormat ? {framingFormat:operation.payload.framingFormat} : {}),
        ...(operation.payload.acceptancePhrase ? {acceptancePhrase:operation.payload.acceptancePhrase} : {}),
        ...(operation.payload.acceptanceQuestion ? {acceptanceQuestion:operation.payload.acceptanceQuestion} : {}),
        moduleVersion: operation.payload.moduleVersion,
        status: 'pending',
        assistantTurnId: operation.payload.presentation.assistantTurnId,
        turnSequence: operation.payload.presentation.turnSequence,
        initiatedAt: operation.payload.presentation.presentedAt,
      };
      return;
    }
    case 'deliver-first-project-framing': {
      const target = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      const framing = target?.acceptanceFraming;
      assert(target?.agreementStatus === 'suggested' && framing?.status === 'pending', 'First project framing delivery target is stale.', 'stale-target');
      assert(
        framing.assistantTurnId === operation.payload.presentation.assistantTurnId
        && framing.turnSequence === operation.payload.presentation.turnSequence,
        'First project framing must complete in its initiating assistant turn.',
        'confirmation-not-auditable',
      );
      assert(
        framing.framingFormat === 'natural-v1' ? operation.payload.assistantText.includes(framing.framingText) : Boolean(framing.acceptanceQuestion && isExactFirstProjectFramingDelivery(operation.payload.assistantText, {framingText:framing.framingText,acceptanceQuestion:framing.acceptanceQuestion})),
        'First project framing delivery did not match the exact durable two-paragraph response.',
        'confirmation-not-auditable',
      );
      framing.status = 'delivered';
      framing.presentation = operation.payload.presentation;
      return;
    }
    case 'abandon-first-project-framing': {
      const target = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      const framing = target?.acceptanceFraming;
      assert(target?.agreementStatus === 'suggested' && framing?.status === 'pending', 'First project framing cleanup target is stale.', 'stale-target');
      assert(framing.assistantTurnId === operation.payload.assistantTurnId, 'Only the initiating turn may clear pending first-project framing.', 'stale-target');
      delete target.acceptanceFraming;
      return;
    }
    case 'accept-first-project': {
      const target = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      assert(target?.agreementStatus === 'suggested', 'First project confirmation target is stale.', 'stale-target');
      assert(sameRevision(target.basisPath, selectActivePurposePath(map)?.id ?? '', selectActivePurposePath(map)?.revision ?? 0), 'Project acceptance basis is no longer current.', 'stale-target');
      assert(target.acceptanceFraming?.status === 'delivered' && target.acceptanceFraming.presentation, 'First project acceptance requires delivered durable R22 framing.');
      target.confirmation = auditableConfirmation({
        id: target.id,
        revision: target.revision,
        presentation: target.acceptanceFraming.presentation,
      }, operation.payload.action);
      for (const project of map.projects) if (project !== target && project.agreementStatus === 'accepted') project.agreementStatus = 'parked';
      target.agreementStatus = 'accepted';
      return;
    }
    case 'propose-project-revision': {
      const source = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      assert(source?.agreementStatus === 'accepted' && selectLatestAcceptedProject(map)?.id === source.id, 'Only an accepted current project can be revised.', 'stale-target');
      map.projects.push({
        ...operation.payload.replacement,
        number: source.number,
        basisPath: source.basisPath,
        agreementStatus: 'suggested',
        workStatus: source.workStatus,
        workUpdates: source.workUpdates,
        presentation: operation.payload.presentation,

        supersedesProjectId: source.id,
      });
      return;
    }
    case 'confirm-project-revision': {
      const target = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      assert(target?.agreementStatus === 'suggested' && target.supersedesProjectId, 'Project revision target is stale.', 'stale-target');
      const source = map.projects.find((project) => project.id === target.supersedesProjectId && project.agreementStatus === 'accepted');
      assert(source, 'Project revision basis is stale.', 'stale-target');
      target.confirmation = auditableConfirmation(target, operation.payload.action);
      target.agreementStatus = 'accepted';
      source.agreementStatus = 'superseded';
      invalidateFromProject(map, source.id, source.revision);
      return;
    }
    case 'report-project-work': {
      const target = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      const pending = deriveMethodCheckpoint(map).pendingDecision;
      assert(target?.agreementStatus === 'suggested' && pending?.kind === 'first-project-confirmation'
        && sameRevision(target, pending.targetId, pending.targetRevision), 'A work report must identify the exact current suggested project, not a historical project or pending accepted-project replacement.', 'stale-target');
      assert(operation.payload.action.kind === 'user-message', 'Proceeding requires a current human work report.');
      assert(operation.payload.action.turnSequence > target.presentation.turnSequence,
        'A work report must refer to a project persisted before the current human message.', 'stale-target');
      for (const project of map.projects) if (project !== target && project.agreementStatus === 'accepted') project.agreementStatus = 'parked';
      target.agreementStatus = 'accepted';
      target.proceedingReport = {
        sourceId: operation.sourceId, projectId: target.id, projectRevision: target.revision,
        action: operation.payload.action, reportedActivity: operation.payload.reportedActivity,
      };
      target.workStatus = operation.payload.status;
      target.workUpdates.push({ status: operation.payload.status, action: operation.payload.action,
        sourceId: operation.sourceId, reportedActivity: operation.payload.reportedActivity });
      return;
    }
    case 'update-project-work-status':
    case 'correct-project-work-status': {
      const target = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      const current = selectLatestAcceptedProject(map);
      assert(target?.agreementStatus === 'accepted' && current && sameRevision(target, current.id, current.revision)
        && sameRevision(target.basisPath, selectActivePurposePath(map)?.id ?? '', selectActivePurposePath(map)?.revision ?? 0), 'Work status requires the current project on the active path.', 'stale-target');
      if (operation.type === 'correct-project-work-status') {
        const latest = target.workUpdates.at(-1);
        assert(latest && latest.action.actionId === operation.payload.latestActionId
          && latest.status === operation.payload.expectedStatus, 'Correct only the exact latest reported work update.', 'stale-target');
        assert(operation.payload.action.kind === 'user-message', 'A status correction requires a current human correction.');
        if (operation.payload.status === 'not-started' && !target.confirmation && target.proceedingReport && !target.proceedingReport.retractedBy) {
          let originIndex = target.workUpdates.length - 1;
          while (target.workUpdates[originIndex].correctsActionId && originIndex > 0) originIndex -= 1;
          assert(target.workUpdates[originIndex].sourceId === target.proceedingReport.sourceId,
            'Clarify the earlier work report before retracting proceeding: correcting the latest update cannot retract an independent earlier report.');
          assert(!map.reflections.some((reflection) => sameRevision(reflection.projectBasis, target.id, target.revision)),
            'Clarify the reported experience before retracting proceeding: this project already has reflection records. Preserve that learning and its dependent decisions.');
          target.proceedingReport.retractedBy = operation.payload.action;
          target.agreementStatus = 'suggested';
        }
      } else {
        assert(target.workStatus !== 'completed' || operation.payload.status === 'completed', 'Completed work status cannot be silently reversed.');
        assert(target.workStatus === 'not-started' || operation.payload.status !== 'not-started', 'Use an exact status correction to retract reported work.');
      }
      target.workStatus = operation.payload.status;
      target.workUpdates.push({ status: operation.payload.status, action: operation.payload.action, sourceId: operation.sourceId,
        ...(operation.payload.reportedActivity ? { reportedActivity: operation.payload.reportedActivity } : {}),
        ...(operation.type === 'correct-project-work-status' ? {correctsActionId:operation.payload.latestActionId} : {}),
      });
      return;
    }
    case 'propose-follow-on-projects': {
      const path = selectActivePurposePath(map);
      const basis = selectProjectDecisionBasis(map);
      assert(path && basis && hasCompletedLearningLoop(map), 'Follow-on projects require a fresh explicit decision and a completed learning loop.');
      ensureUniqueIds(operation.payload.projects, 'Follow-on projects');
      for (const set of map.projectOptionSets.filter((item) => item.status === 'suggested')) set.status = 'superseded';
      const optionSet: ProjectOptionSet = {
        id: operation.payload.setId,
        revision: operation.payload.setRevision,
        status: 'suggested',
        projectNumber: nextProjectNumber(map),
        basisPath: { id: path.id, revision: path.revision },
        ...basis,
        projects: operation.payload.projects.map((project) => ({ ...project, selection: 'available', equalWeight: true })) as ProjectOptionSet['projects'],
        presentation: operation.payload.presentation,
      };
      map.projectOptionSets.push(optionSet);
      return;
    }
    case 'replace-follow-on-project': {
      const source = map.projectOptionSets.find((set) => sameRevision(set, operation.payload.sourceSetId, operation.payload.sourceSetRevision));
      assert(source?.status === 'suggested', 'Follow-on project option set is stale.', 'stale-target');
      assert(source.projects.some((project) => project.id === operation.payload.replacedProjectId), 'Follow-on project replacement target is missing.', 'stale-target');
      const projects = source.projects.map((project) => project.id === operation.payload.replacedProjectId ? operation.payload.replacement : (() => {
        const { selection: _selection, equalWeight: _equalWeight, ...input } = project;
        return input;
      })());
      ensureUniqueIds(projects, 'Follow-on projects');
      source.status = 'superseded';
      map.projectOptionSets.push({
        id: operation.payload.replacementSetId,
        revision: operation.payload.replacementSetRevision,
        status: 'suggested',
        projectNumber: source.projectNumber,
        supersedesSetId: source.id,
        basisPath: source.basisPath,
        ...(source.basisNextMove ? { basisNextMove: source.basisNextMove } : {}),
        ...(source.basisAction ? { basisAction: source.basisAction } : {}),
        projects: projects.map((project) => ({ ...project, selection: 'available', equalWeight: true })) as ProjectOptionSet['projects'],
        presentation: operation.payload.presentation,
      });
      return;
    }
    case 'select-follow-on-project': {
      const set = map.projectOptionSets.find((item) => sameRevision(item, operation.payload.setId, operation.payload.setRevision));
      assert(set?.status === 'suggested' && sameRevision(set.basisPath, selectActivePurposePath(map)?.id ?? '', selectActivePurposePath(map)?.revision ?? 0), 'Follow-on project selection target is stale.', 'stale-target');
      const target = set.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      assert(target, 'Follow-on project target is missing.', 'stale-target');
      set.confirmation = auditableConfirmation(set, operation.payload.action);
      set.status = 'selected';
      for (const project of map.projects) if (project.agreementStatus === 'accepted') project.agreementStatus = 'parked';
      set.projects = set.projects.map((project) => ({ ...project, selection: sameRevision(project, target.id, target.revision) ? 'active' : 'parked' })) as ProjectOptionSet['projects'];
      const { selection: _selection, equalWeight: _equalWeight, ...selectedProject } = target;
      map.projects.push({
        ...selectedProject,
        number: set.projectNumber,
        basisPath: set.basisPath,
        agreementStatus: 'accepted',
        workStatus: 'not-started',
        workUpdates: [],
        presentation: set.presentation,
        confirmation: {
          targetId: target.id,
          targetRevision: target.revision,
          presentedInTurnId: set.presentation.assistantTurnId,
          confirmedBy: operation.payload.action,
        },
        sourceOptionSetId: set.id,
      });
      return;
    }
    case 'open-reflection': {
      const project = map.projects.find((item) => sameRevision(item, operation.payload.projectId, operation.payload.projectRevision));
      assert(project?.agreementStatus === 'accepted' && selectLatestAcceptedProject(map)?.id === project.id, 'Reflection requires an accepted project.', 'stale-target');
      assert(!map.focus || map.focus.kind === 'peers'
        || (map.focus.kind === 'reflection' && selectCurrentProjectLearning(map).reflection?.id !== map.focus.reflectionId),
      'Close the current focus before opening reflection.');
      map.reflections.push({
        id: operation.payload.reflectionId,
        revision: operation.payload.revision,
        projectBasis: { id: project.id, revision: project.revision },
        status: 'open',
        openedBy: operation.payload.action,
        evidence: [],
      });
      map.focus = { kind: 'reflection', reflectionId: operation.payload.reflectionId, reason: 'Interpret firsthand project evidence', openedBy: operation.payload.action };
      return;
    }
    case 'append-reflection-evidence': {
      const reflection = requireLatestReflection(map, operation.payload.reflectionId, operation.payload.reflectionRevision);
      assert(reflection?.status === 'open', 'Learning evidence requires an open reflection.', 'stale-target');
      reflection.evidence.push(operation.payload.evidence);
      return;
    }
    case 'revise-reflection-evidence': {
      const reflection = requireLatestReflection(map, operation.payload.reflectionId, operation.payload.reflectionRevision);
      assert(reflection, 'The evidence snapshot is missing.', 'stale-target');
      assert(operation.payload.newReflectionRevision > reflection.revision, 'A learning revision must advance the reflection revision.');
      assert(!map.reflections.some((item) => sameRevision(item, reflection.id, operation.payload.newReflectionRevision)), 'Reflection revision already exists.');
      assert(reflection.evidence.some((item) => item.id === operation.payload.supersedesEvidenceId), 'Superseded learning evidence is missing.', 'stale-target');
      assert(operation.payload.evidence.supersedesEvidenceId === operation.payload.supersedesEvidenceId, 'Learning correction must link its superseded evidence.');
      map.reflections.push({
        ...reflection,
        revision: operation.payload.newReflectionRevision,
        evidence: [...reflection.evidence, operation.payload.evidence],
      });
      const hasDownstreamChoice = map.continueChoices.some((choice) => choice.reflectionBasis.id === reflection.id && choice.reflectionBasis.revision === reflection.revision);
      if (hasDownstreamChoice) {
        invalidateFromLearning(map, [reflection], 'learning', operation.payload.evidence.id, operation.payload.evidence.revision);
      }
      return;
    }
    case 'close-reflection': {
      const reflection = requireLatestReflection(map, operation.payload.reflectionId, operation.payload.reflectionRevision);
      assert(reflection?.status === 'open', 'Reflection is not open.', 'stale-target');
      assert(reflection.evidence.length > 0, 'Record firsthand evidence before closing reflection.');
      reflection.status = 'closed';
      reflection.closedBy = operation.payload.action;
      if (map.focus?.kind === 'reflection' && map.focus.reflectionId === reflection.id) delete map.focus;
      return;
    }
    case 'record-continue-choice': {
      const reflection = requireLatestReflection(map, operation.payload.reflectionId, operation.payload.reflectionRevision);
      assert(reflection?.status === 'closed', 'Continue choice requires a closed reflection.', 'stale-target');
      assert(!map.continueChoices.some((choice) => choice.reflectionBasis.id === reflection.id && choice.reflectionBasis.revision === reflection.revision), 'Reflection already has a continue choice.');
      const project = map.projects.find((item) => sameRevision(item, reflection.projectBasis.id, reflection.projectBasis.revision));
      assert(project && selectLatestAcceptedProject(map)?.id === project.id && project.agreementStatus === 'accepted', 'Reflection project basis is no longer current.', 'stale-target');
      const scope = project.relationship === 'unrelated' ? 'project' : 'path';
      assert(!operation.payload.scope || operation.payload.scope === scope, 'Continue scope must match the actual reflected project.');
      map.continueChoices.push({
        id: operation.payload.id,
        revision: operation.payload.revision,
        reflectionBasis: { id: reflection.id, revision: reflection.revision },
        wantsToContinue: operation.payload.wantsToContinue,
        scope,
        action: operation.payload.action,
      });
      return;
    }
    case 'record-next-move': {
      const choice = map.continueChoices.find((item) => sameRevision(item, operation.payload.continueChoiceId, operation.payload.continueChoiceRevision));
      assert(choice, 'Next Move choice target is stale.', 'stale-target');
      assert(!map.nextMoves.some((move) => move.continueChoiceBasis.id === choice.id && move.continueChoiceBasis.revision === choice.revision), 'Continue choice already has a Next Move.');
      const reflection = map.reflections.find((item) => sameRevision(item, choice.reflectionBasis.id, choice.reflectionBasis.revision));
      const project = reflection && map.projects.find((item) => sameRevision(item, reflection.projectBasis.id, reflection.projectBasis.revision));
      const currentProject = selectLatestAcceptedProject(map);
      assert(project && currentProject && sameRevision(project, currentProject.id, currentProject.revision), 'Next Move must use the current accepted project reflection.', 'stale-target');
      assert(choice.scope !== 'project' || operation.payload.kind !== 'commit-provisionally', 'Unrelated project evidence cannot commit the contextual path.');
      if (choice.wantsToContinue) {
        assert(operation.payload.kind === 'explore-further' || operation.payload.kind === 'commit-provisionally', 'Continue-yes permits only explore further or provisional commitment.');
      } else {
        assert(operation.payload.kind === 'return-to-paths', 'Continue-no returns to Purpose Paths.');
      }
      const path = selectActivePurposePath(map);
      assert(path, 'Next Move requires an active Purpose Path.');
      map.nextMoves.push({
        id: operation.payload.id,
        revision: operation.payload.revision,
        continueChoiceBasis: { id: choice.id, revision: choice.revision },
        kind: operation.payload.kind,
        action: operation.payload.action,
      });
      if (operation.payload.kind === 'commit-provisionally') {
        const selectionSourceId = selectCurrentPathSelectionSourceId(map);
        assert(selectionSourceId, 'Focus requires an auditable current path selection.');
        map.pathFocusCommitments.push({ id: `focus-${operation.payload.id}`, revision: 1, basisPath: { id:path.id, revision:path.revision }, selectionSourceId, basisNextMove: {id:operation.payload.id,revision:operation.payload.revision}, action: operation.payload.action });
      }
      return;
    }
    case 'open-peer-focus': {
      assert(!map.focus, 'Close the current focus before opening peer work.');
      map.focus = { kind: 'peers', reason: operation.payload.reason, openedBy: operation.payload.action };
      return;
    }
    case 'record-peer-exposure': {
      const path = selectActivePurposePath(map);
      assert(path, 'Peer exposure requires an active Purpose Path.');
      map.peerExposures.push({
        ...operation.payload.exposure,
        basisPath: { id: path.id, revision: path.revision },
        status: 'suggested',
        presentation: operation.payload.presentation,
      });
      return;
    }
    case 'revise-peer-exposure': {
      const prior = map.peerExposures.find((item) => item.id === operation.payload.supersedesExposureId && item.status === 'confirmed');
      const path = selectActivePurposePath(map);
      assert(prior && path && sameRevision(prior.basisPath, path.id, path.revision), 'Peer revision must target a confirmed insight on the active path.', 'stale-target');
      map.peerExposures.push({
        ...operation.payload.exposure,
        basisPath: prior.basisPath,
        status: 'suggested',
        presentation: operation.payload.presentation,
        supersedesExposureId: prior.id,
      });
      return;
    }
    case 'confirm-peer-exposure': {
      const exposure = map.peerExposures.find((item) => sameRevision(item, operation.payload.exposureId, operation.payload.exposureRevision));
      assert(exposure?.status === 'suggested', 'Peer exposure confirmation target is stale.', 'stale-target');
      exposure.confirmation = auditableConfirmation(exposure, operation.payload.action);
      exposure.status = 'confirmed';
      if (exposure.supersedesExposureId) {
        const prior = map.peerExposures.find((item) => item.id === exposure.supersedesExposureId && item.status === 'confirmed');
        assert(prior, 'Peer revision basis is stale.', 'stale-target');
        prior.status = 'superseded';
        invalidateFromPeerExposure(map, prior.id, exposure.id, exposure.revision);
      }
      const intent = map.commitmentIntent;
      if (intent && intent.status !== 'completed' && sameRevision(exposure.basisPath, intent.basisPath.id, intent.basisPath.revision)) intent.status = 'ready';
      return;
    }
    case 'defer-peer-exposure': {
      const intent = map.commitmentIntent;
      assert(intent?.id === operation.payload.intentId && intent.status === 'pending-peer-exposure', 'Only pending peer exposure can be deferred.', 'stale-target');
      intent.status = 'peer-exposure-deferred';
      if (map.focus?.kind === 'peers') delete map.focus;
      return;
    }
    case 'complete-provisional-commitment': {
      const intent = map.commitmentIntent;
      assert(intent?.id === operation.payload.intentId && intent.status === 'ready', 'Commitment remains intent until qualifying peer exposure is confirmed.');
      const peer = map.peerExposures.findLast((exposure) => exposure.status === 'confirmed' && sameRevision(exposure.basisPath, intent.basisPath.id, intent.basisPath.revision));
      assert(peer, 'A confirmed, decision-relevant peer insight on the active path is required.');
      map.provisionalCommitment = {
        id: operation.payload.id,
        revision: operation.payload.revision,
        basisPath: intent.basisPath,
        basisNextMove: intent.basisNextMove,
        basisPeerExposure: { id: peer.id, revision: peer.revision },
        status: 'confirmed',
        action: operation.payload.action,
      };
      intent.status = 'completed';
      return;
    }
    case 'propose-proof-inventory':
    case 'revise-proof-inventory': {
      const commitment = map.provisionalCommitment;
      assert(commitment, 'Proof requires completed provisional commitment.');
      if (operation.type === 'revise-proof-inventory') {
        const prior = confirmedProof(map);
        assert(prior?.id === operation.payload.supersedesProofId, 'Proof revision must target current confirmed proof.', 'stale-target');
      }
      for (const proof of map.proofRevisions.filter((item) => item.status === 'suggested')) proof.status = 'superseded';
      map.proofRevisions.push({
        ...operation.payload.proof,
        basisCommitment: { id: commitment.id, revision: commitment.revision },
        status: 'suggested',
        presentation: operation.payload.presentation,
        ...(operation.type === 'revise-proof-inventory' ? { supersedesProofId: operation.payload.supersedesProofId } : {}),
      });
      return;
    }
    case 'confirm-proof-inventory': {
      const proof = map.proofRevisions.find((item) => sameRevision(item, operation.payload.proofId, operation.payload.proofRevision));
      assert(proof?.status === 'suggested', 'Proof confirmation target is stale.', 'stale-target');
      const prior = confirmedProof(map);
      proof.confirmation = auditableConfirmation(proof, operation.payload.action);
      proof.status = 'confirmed';
      if (prior) {
        prior.status = 'superseded';
        invalidateFromProof(map, prior.id, prior.revision);
      }
      return;
    }
    case 'propose-side-doors': {
      const proof = confirmedProof(map);
      assert(proof, 'Side Doors require confirmed proof.');
      ensureUniqueIds(operation.payload.doors, 'Side Doors');
      for (const set of map.sideDoorSets.filter((item) => item.status === 'suggested')) set.status = 'superseded';
      map.sideDoorSets.push({
        id: operation.payload.setId,
        revision: operation.payload.setRevision,
        status: 'suggested',
        basisProof: { id: proof.id, revision: proof.revision },
        doors: operation.payload.doors.map((door) => ({ ...door, selection: 'available', equalWeight: true })) as SideDoorSet['doors'],
        presentation: operation.payload.presentation,
      });
      return;
    }
    case 'replace-side-door': {
      const source = map.sideDoorSets.find((set) => sameRevision(set, operation.payload.sourceSetId, operation.payload.sourceSetRevision));
      assert(source && source.status !== 'superseded', 'Side Door source set is stale.', 'stale-target');
      assert(source.doors.some((door) => door.id === operation.payload.replacedDoorId), 'Side Door replacement target is missing.', 'stale-target');
      const doors: SideDoorInput[] = source.doors.map((door) => door.id === operation.payload.replacedDoorId ? operation.payload.replacement : (() => {
        const { selection: _selection, equalWeight: _equalWeight, ...input } = door;
        return input;
      })());
      ensureUniqueIds(doors, 'Side Doors');
      if (source.status === 'suggested') source.status = 'superseded';
      map.sideDoorSets.push({
        id: operation.payload.replacementSetId,
        revision: operation.payload.replacementSetRevision,
        status: 'suggested',
        basisProof: source.basisProof,
        doors: doors.map((door) => ({ ...door, selection: 'available', equalWeight: true })) as SideDoorSet['doors'],
        presentation: operation.payload.presentation,
        supersedesSetId: source.id,
      });
      return;
    }
    case 'select-side-door': {
      const set = map.sideDoorSets.find((item) => sameRevision(item, operation.payload.setId, operation.payload.setRevision));
      assert(set?.status === 'suggested', 'Side Door selection target is stale.', 'stale-target');
      const door = set.doors.find((item) => sameRevision(item, operation.payload.doorId, operation.payload.doorRevision));
      assert(door, 'Side Door selection target is missing.', 'stale-target');
      const priorActiveSet = map.sideDoorSets.findLast((item) => item.status === 'active');
      set.confirmation = auditableConfirmation(set, operation.payload.action);
      set.status = 'active';
      set.doors = set.doors.map((item) => ({ ...item, selection: sameRevision(item, door.id, door.revision) ? 'active' : 'parked' })) as SideDoorSet['doors'];
      if (priorActiveSet && priorActiveSet !== set) priorActiveSet.status = 'superseded';
      return;
    }
    case 'record-route-outcome': {
      const door = map.sideDoorSets.find((set) => set.status === 'active')?.doors.find((item) => sameRevision(item, operation.payload.doorId, operation.payload.doorRevision) && item.selection === 'active');
      assert(door, 'Route outcomes require the selected Side Door.', 'stale-target');
      map.routeOutcomes.push({
        id: operation.payload.id,
        revision: operation.payload.revision,
        doorBasis: { id: door.id, revision: door.revision },
        result: operation.payload.result,
        learning: operation.payload.learning,
        action: operation.payload.action,
      });
      return;
    }
    case 'open-foundation-revision-focus': {
      assert(!map.focus || map.focus.kind === 'peers' || map.focus.kind === 'reflection', 'Close the current focus before opening Foundation revision.');
      parkPendingProjects(map);
      map.focus = { kind: 'foundation-revision', reason: operation.payload.reason, openedBy: operation.payload.action };
      return;
    }
    case 'open-path-revision-focus': {
      assert(!map.focus || map.focus.kind === 'peers' || map.focus.kind === 'reflection', 'Close the current focus before opening path revision.');
      parkPendingProjects(map);
      map.focus = { kind: 'path-revision', reason: operation.payload.reason, openedBy: operation.payload.action };
      return;
    }
    case 'close-focus': {
      assert(map.focus, 'No explicit focus is open.');
      if (map.focus.kind === 'foundation-revision') {
        assert(
          operation.payload.action.turnSequence > map.focus.openedBy.turnSequence,
          'Foundation reflection can close only after a later explorer turn.',
        );
        const confirmed = currentWhy(map);
        if (confirmed) {
          for (const why of map.foundation.whyRevisions) {
            if (why.status === 'suggested' && why.supersedesWhyId === confirmed.id) why.status = 'superseded';
          }
        }
      }
      delete map.focus;
      return;
    }
    case 'resolve-basis-review': {
      const earliest = selectEarliestActiveReview(map);
      assert(earliest
        && earliest.targetKind === operation.payload.targetKind
        && earliest.targetId === operation.payload.targetId
        && earliest.targetRevision === operation.payload.targetRevision, 'Resolve the earliest invalidated basis first.', 'stale-target');
      if (earliest.targetKind === 'path-set') {
        const set = map.pathSets.find((item) => sameRevision(item, earliest.targetId, earliest.targetRevision));
        assert(set, 'The invalidated path set no longer exists.', 'stale-target');
        const why = currentWhy(map);
        if (why && !sameRevision(set.basisWhy, why.id, why.revision)) {
          assert(operation.payload.resolution === 'replaced', 'Paths based on the previous North Star must be replaced before new paths are offered.');
          set.status = 'superseded';
        }
      }
      earliest.status = 'resolved';
      earliest.resolution = { kind: operation.payload.resolution, action: operation.payload.action };
      return;
    }
    default: {
      const exhaustiveOperation: never = operation;
      throw new DomainError('invalid-operation', `Unhandled operation: ${String(exhaustiveOperation)}`);
    }
  }
}

function reject(map: CareerMap, code: RejectionCode, message: string, details?: unknown): ApplyCareerMapResult {
  return { status: 'rejected', map, error: { code, message, ...(details === undefined ? {} : { details }) } };
}

function operationConfirmation(operation: CareerMapOperation): UserActionProvenance | null {
  const action = (operation.payload as Record<string, unknown>).action;
  const parsed = userActionProvenanceSchema.safeParse(action);
  return parsed.success ? parsed.data : null;
}

export function applyCareerMapOperation(mapInput: CareerMap, operationInput: unknown): ApplyCareerMapResult {
  const parsedMap = careerMapSchema.safeParse(mapInput);
  if (!parsedMap.success) return reject(mapInput, 'invalid-map', 'Career map failed full-document validation.', parsedMap.error.flatten());
  const map = parsedMap.data;

  const parsedOperation = parseCareerMapOperation(operationInput);
  if (!parsedOperation.success) return reject(map, 'invalid-operation', 'Operation failed strict validation.', parsedOperation.error.flatten());
  const operation = parsedOperation.data;
  // Retry identity is semantic operation content, not volatile transport
  // envelope fields such as expectedRevision or occurredAt.
  const payloadFingerprint = stablePayloadFingerprint({
    type: operation.type,
    payload: operation.payload,
  });
  const existing = map.operationHistory.find((receipt) => receipt.sourceId === operation.sourceId);
  if (existing) {
    if (existing.payloadFingerprint !== payloadFingerprint) {
      return reject(map, 'source-id-reused', 'Operation source ID was reused with a different payload.');
    }
    if (operation.type === 'revise-why') {
      const confirmed = currentWhy(map);
      if (confirmed?.id === operation.payload.supersedesWhyId) {
        return {
          status: 'replayed', map, receipt: existing,
          effects: {
            invalidatedArtifactClasses: invalidateFromWhy(
              cloneMap(map),
              confirmed.id,
              confirmed.revision,
              operation.payload.why.id,
              operation.payload.why.revision,
            ).invalidatedArtifactClasses,
          },
        };
      }
    }
    return { status: 'replayed', map, receipt: existing };
  }
  if (operation.expectedRevision !== map.revision) {
    return reject(map, 'revision-conflict', `Expected map revision ${operation.expectedRevision}, found ${map.revision}.`);
  }

  const candidate = cloneMap(map);
  try {
    const effects = applyDomainOperation(candidate, operation);
    candidate.revision = map.revision + 1;
    const receipt = {
      sourceId: operation.sourceId,
      operationType: operation.type,
      payloadFingerprint,
      resultRevision: candidate.revision,
      committedAt: operation.occurredAt,
      confirmationProvenance: operationConfirmation(operation),
      moduleVersion: null,
    };
    candidate.operationHistory.push(receipt);
    const validated = careerMapSchema.safeParse(candidate);
    if (!validated.success) {
      return reject(map, 'invariant-violation', 'Operation would create an invalid career map.', validated.error.flatten());
    }
    return { status: 'committed', map: validated.data, receipt, ...(effects ? { effects } : {}) };
  } catch (error) {
    if (error instanceof DomainError) return reject(map, error.code, error.message);
    return reject(map, 'invariant-violation', 'Operation failed without changing the career map.', error instanceof Error ? error.message : error);
  }
}

export function assertCareerMap(input: unknown): CareerMap {
  return careerMapSchema.parse(input);
}

export type CareerMapValidationError = z.ZodError;

import type { z } from 'zod';
import {
  invalidationTargetOrder,
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
import type { ProjectOptionSet } from './projects';
import type { SideDoorInput, SideDoorSet } from './side-doors';

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
  | { status: 'committed'; map: CareerMap; receipt: CareerMap['operationHistory'][number] }
  | { status: 'replayed'; map: CareerMap; receipt: CareerMap['operationHistory'][number] }
  | { status: 'rejected'; map: CareerMap; error: { code: RejectionCode; message: string; details?: unknown } };

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

function activePath(map: CareerMap) {
  return currentPathSet(map)?.paths.find((path) => path.selection === 'active');
}

function latestAcceptedProject(map: CareerMap) {
  let latest: CareerMap['projects'][number] | undefined;
  for (const project of map.projects) {
    if (project.agreementStatus === 'accepted' && (!latest || project.number > latest.number)) latest = project;
  }
  return latest;
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

function auditableConfirmation(
  target: { id: string; revision: number; presentation: ModelPresentation },
  action: UserActionProvenance,
): Confirmation {
  const sequenceIsValid = action.kind === 'ui-action'
    ? action.turnSequence >= target.presentation.turnSequence
    : action.turnSequence > target.presentation.turnSequence;
  assert(sequenceIsValid, 'Confirmation must come from a subsequent user turn or an explicit UI action.', 'confirmation-not-auditable');
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
  if (commitmentDepends) invalidateCommitmentClosure(map, 'purpose-path', pathId, pathRevision, true);
}

function invalidateFromWhy(map: CareerMap, oldWhyId: string, oldWhyRevision: number, newWhyId: string, newWhyRevision: number): void {
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
  assert(!map.invalidations.some((item) => item.status === 'pending'), 'Resolve the earliest invalidated basis before downstream changes.');
}

function nextProjectNumber(map: CareerMap): number {
  let highestAcceptedNumber = 0;
  for (const project of map.projects) {
    if (project.agreementStatus === 'accepted' && project.number > highestAcceptedNumber) {
      highestAcceptedNumber = project.number;
    }
  }
  return highestAcceptedNumber + 1;
}

function applyDomainOperation(map: CareerMap, operation: CareerMapOperation): void {
  ensureNoPendingReview(map, operation.type);

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
      if (operation.type === 'revise-why') {
        const confirmed = currentWhy(map);
        assert(confirmed?.id === operation.payload.supersedesWhyId, 'Why revision must target the current confirmed Why.', 'stale-target');
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
      return;
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
      const why = currentWhy(map);
      assert(why, 'Purpose Paths require a confirmed Why.');
      ensureUniqueIds(operation.payload.paths, 'Purpose Paths');
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
      const source = map.pathSets.find((set) => sameRevision(set, operation.payload.sourceSetId, operation.payload.sourceSetRevision));
      assert(source && source.status !== 'superseded', 'Purpose Path source set is stale.', 'stale-target');
      assert(source.paths.some((path) => path.id === operation.payload.replacedPathId), 'Replacement target is not in the source set.', 'stale-target');
      const replacements = source.paths.map((path) => path.id === operation.payload.replacedPathId ? operation.payload.replacement : pathInput(path));
      ensureUniqueIds(replacements, 'Purpose Paths');
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
    case 'combine-purpose-paths': {
      const source = map.pathSets.find((set) => sameRevision(set, operation.payload.sourceSetId, operation.payload.sourceSetRevision));
      assert(source && source.status !== 'superseded', 'Purpose Path combination source is stale.', 'stale-target');
      const [first, second] = operation.payload.combinedPathIds;
      assert(first !== second && source.paths.some((path) => path.id === first) && source.paths.some((path) => path.id === second), 'Combined paths must be two distinct members of the source set.');
      ensureUniqueIds(operation.payload.paths, 'Combined Purpose Paths');
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
      const priorPath = activePath(map);
      set.confirmation = auditableConfirmation(set, operation.payload.action);
      set.status = 'active';
      set.paths = set.paths.map((path) => ({ ...path, selection: path.id === selected.id && path.revision === selected.revision ? 'active' : 'parked' })) as PurposePathSet['paths'];
      if (priorSet && priorSet !== set) priorSet.status = 'superseded';
      if (priorPath && (priorPath.id !== selected.id || priorPath.revision !== selected.revision)) {
        invalidateFromPath(map, priorPath.id, priorPath.revision);
      }
      return;
    }
    case 'choose-parked-purpose-path': {
      const source = map.pathSets.find((set) => sameRevision(set, operation.payload.sourceSetId, operation.payload.sourceSetRevision));
      const move = latestNextMove(map);
      assert(source?.status === 'active' && move?.kind === 'return-to-paths', 'A parked path can be chosen only after a return-to-paths Next Move.', 'stale-target');
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
      invalidateFromPath(map, priorPath.id, priorPath.revision);
      return;
    }
    case 'propose-first-project': {
      const path = activePath(map);
      assert(path, 'A first Path Project requires an active Purpose Path.');
      assert(!map.projects.some((project) => project.agreementStatus === 'accepted'), 'The singular first-project flow is no longer available.');
      for (const project of map.projects.filter((item) => item.agreementStatus === 'suggested')) project.agreementStatus = 'superseded';
      map.projects.push({
        ...operation.payload.project,
        number: 1,
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
        basisPath: source.basisPath,
        agreementStatus: 'suggested',
        workStatus: 'not-started',
        workUpdates: [],
        presentation: operation.payload.presentation,
        supersedesProjectId: source.supersedesProjectId ?? source.id,
      });
      return;
    }
    case 'accept-first-project': {
      const target = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      assert(target?.agreementStatus === 'suggested' && target.number === 1, 'First project confirmation target is stale.', 'stale-target');
      target.confirmation = auditableConfirmation(target, operation.payload.action);
      target.agreementStatus = 'accepted';
      return;
    }
    case 'propose-project-revision': {
      const source = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      assert(source?.agreementStatus === 'accepted', 'Only an accepted current project can be revised.', 'stale-target');
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
    case 'update-project-work-status': {
      const target = map.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      assert(target?.agreementStatus === 'accepted', 'Work status requires an accepted project.', 'stale-target');
      assert(target.workStatus !== 'completed' || operation.payload.status === 'completed', 'Completed work status cannot be silently reversed.');
      target.workStatus = operation.payload.status;
      target.workUpdates.push({ status: operation.payload.status, action: operation.payload.action });
      return;
    }
    case 'propose-follow-on-projects': {
      const path = activePath(map);
      const move = latestNextMove(map);
      assert(path && move, 'Follow-on projects require an active path and a completed learning loop.');
      const choice = map.continueChoices.find((item) => sameRevision(item, move.continueChoiceBasis.id, move.continueChoiceBasis.revision));
      assert(choice, 'Follow-on project learning basis is missing.');
      if (move.kind === 'return-to-paths') {
        const set = currentPathSet(map);
        assert(set?.confirmation && set.confirmation.confirmedBy.turnSequence > move.action.turnSequence, 'Choose a Purpose Path after returning before proposing follow-on projects.');
      } else {
        assert(move.kind === 'explore-further', 'Follow-on projects require an explore-further Next Move.');
      }
      ensureUniqueIds(operation.payload.projects, 'Follow-on projects');
      for (const set of map.projectOptionSets.filter((item) => item.status === 'suggested')) set.status = 'superseded';
      const optionSet: ProjectOptionSet = {
        id: operation.payload.setId,
        revision: operation.payload.setRevision,
        status: 'suggested',
        projectNumber: nextProjectNumber(map),
        basisPath: { id: path.id, revision: path.revision },
        basisNextMove: { id: move.id, revision: move.revision },
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
        basisPath: source.basisPath,
        basisNextMove: source.basisNextMove,
        projects: projects.map((project) => ({ ...project, selection: 'available', equalWeight: true })) as ProjectOptionSet['projects'],
        presentation: operation.payload.presentation,
      });
      return;
    }
    case 'select-follow-on-project': {
      const set = map.projectOptionSets.find((item) => sameRevision(item, operation.payload.setId, operation.payload.setRevision));
      assert(set?.status === 'suggested', 'Follow-on project selection target is stale.', 'stale-target');
      const target = set.projects.find((project) => sameRevision(project, operation.payload.projectId, operation.payload.projectRevision));
      assert(target, 'Follow-on project target is missing.', 'stale-target');
      set.confirmation = auditableConfirmation(set, operation.payload.action);
      set.status = 'selected';
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
      assert(project?.agreementStatus === 'accepted', 'Reflection requires an accepted project.', 'stale-target');
      assert(!map.focus, 'Close the current focus before opening reflection.');
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
      const reflection = map.reflections.find((item) => sameRevision(item, operation.payload.reflectionId, operation.payload.reflectionRevision));
      assert(reflection?.status === 'open', 'Learning evidence requires an open reflection.', 'stale-target');
      reflection.evidence.push(operation.payload.evidence);
      return;
    }
    case 'revise-reflection-evidence': {
      const reflection = map.reflections.find((item) => sameRevision(item, operation.payload.reflectionId, operation.payload.reflectionRevision));
      assert(reflection?.status === 'closed', 'Revise a closed evidence snapshot by creating a new reflection revision.', 'stale-target');
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
      const reflection = map.reflections.find((item) => sameRevision(item, operation.payload.reflectionId, operation.payload.reflectionRevision));
      assert(reflection?.status === 'open', 'Reflection is not open.', 'stale-target');
      assert(reflection.evidence.length > 0, 'Record firsthand evidence before closing reflection.');
      reflection.status = 'closed';
      reflection.closedBy = operation.payload.action;
      if (map.focus?.kind === 'reflection' && map.focus.reflectionId === reflection.id) delete map.focus;
      return;
    }
    case 'record-continue-choice': {
      const reflection = map.reflections.find((item) => sameRevision(item, operation.payload.reflectionId, operation.payload.reflectionRevision));
      assert(reflection?.status === 'closed', 'Continue choice requires a closed reflection.', 'stale-target');
      assert(!map.continueChoices.some((choice) => choice.reflectionBasis.id === reflection.id && choice.reflectionBasis.revision === reflection.revision), 'Reflection already has a continue choice.');
      map.continueChoices.push({
        id: operation.payload.id,
        revision: operation.payload.revision,
        reflectionBasis: { id: reflection.id, revision: reflection.revision },
        wantsToContinue: operation.payload.wantsToContinue,
        action: operation.payload.action,
      });
      return;
    }
    case 'record-next-move': {
      const choice = map.continueChoices.find((item) => sameRevision(item, operation.payload.continueChoiceId, operation.payload.continueChoiceRevision));
      assert(choice, 'Next Move choice target is stale.', 'stale-target');
      assert(!map.nextMoves.some((move) => move.continueChoiceBasis.id === choice.id && move.continueChoiceBasis.revision === choice.revision), 'Continue choice already has a Next Move.');
      if (choice.wantsToContinue) {
        assert(operation.payload.kind === 'explore-further' || operation.payload.kind === 'commit-provisionally', 'Continue-yes permits only explore further or provisional commitment.');
      } else {
        assert(operation.payload.kind === 'return-to-paths', 'Continue-no returns to Purpose Paths.');
      }
      const path = activePath(map);
      assert(path, 'Next Move requires an active Purpose Path.');
      map.nextMoves.push({
        id: operation.payload.id,
        revision: operation.payload.revision,
        continueChoiceBasis: { id: choice.id, revision: choice.revision },
        kind: operation.payload.kind,
        action: operation.payload.action,
      });
      if (operation.payload.kind === 'commit-provisionally') {
        map.commitmentIntent = {
          id: `intent-${operation.payload.id}`,
          revision: 1,
          basisPath: { id: path.id, revision: path.revision },
          basisNextMove: { id: operation.payload.id, revision: operation.payload.revision },
          status: 'pending-peer-exposure',
          action: operation.payload.action,
        };
      }
      return;
    }
    case 'open-peer-focus': {
      assert(!map.focus, 'Close the current focus before opening peer work.');
      map.focus = { kind: 'peers', reason: operation.payload.reason, openedBy: operation.payload.action };
      return;
    }
    case 'record-peer-exposure': {
      const path = activePath(map);
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
      const path = activePath(map);
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
      assert(!map.focus, 'Close the current focus before opening Foundation revision.');
      map.focus = { kind: 'foundation-revision', reason: operation.payload.reason, openedBy: operation.payload.action };
      return;
    }
    case 'open-path-revision-focus': {
      assert(!map.focus, 'Close the current focus before opening path revision.');
      map.focus = { kind: 'path-revision', reason: operation.payload.reason, openedBy: operation.payload.action };
      return;
    }
    case 'close-focus': {
      assert(map.focus, 'No explicit focus is open.');
      delete map.focus;
      return;
    }
    case 'resolve-basis-review': {
      let earliest: CareerMap['invalidations'][number] | undefined;
      for (const item of map.invalidations) {
        if (item.status !== 'pending') continue;
        if (!earliest || invalidationTargetOrder.indexOf(item.targetKind) < invalidationTargetOrder.indexOf(earliest.targetKind)) {
          earliest = item;
        }
      }
      assert(earliest
        && earliest.targetKind === operation.payload.targetKind
        && earliest.targetId === operation.payload.targetId
        && earliest.targetRevision === operation.payload.targetRevision, 'Resolve the earliest invalidated basis first.', 'stale-target');
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

export function applyCareerMapOperation(mapInput: CareerMap, operationInput: unknown): ApplyCareerMapResult {
  const parsedMap = careerMapSchema.safeParse(mapInput);
  if (!parsedMap.success) return reject(mapInput, 'invalid-map', 'Career map failed full-document validation.', parsedMap.error.flatten());
  const map = parsedMap.data;

  const parsedOperation = parseCareerMapOperation(operationInput);
  if (!parsedOperation.success) return reject(map, 'invalid-operation', 'Operation failed strict validation.', parsedOperation.error.flatten());
  const operation = parsedOperation.data;
  const payloadFingerprint = stablePayloadFingerprint(operation);
  const existing = map.operationHistory.find((receipt) => receipt.sourceId === operation.sourceId);
  if (existing) {
    return existing.payloadFingerprint === payloadFingerprint
      ? { status: 'replayed', map, receipt: existing }
      : reject(map, 'source-id-reused', 'Operation source ID was reused with a different payload.');
  }
  if (operation.expectedRevision !== map.revision) {
    return reject(map, 'revision-conflict', `Expected map revision ${operation.expectedRevision}, found ${map.revision}.`);
  }

  const candidate = cloneMap(map);
  try {
    applyDomainOperation(candidate, operation);
    candidate.revision = map.revision + 1;
    const receipt = {
      sourceId: operation.sourceId,
      operationType: operation.type,
      payloadFingerprint,
      resultRevision: candidate.revision,
      committedAt: operation.occurredAt,
    };
    candidate.operationHistory.push(receipt);
    const validated = careerMapSchema.safeParse(candidate);
    if (!validated.success) {
      return reject(map, 'invariant-violation', 'Operation would create an invalid career map.', validated.error.flatten());
    }
    return { status: 'committed', map: validated.data, receipt };
  } catch (error) {
    if (error instanceof DomainError) return reject(map, error.code, error.message);
    return reject(map, 'invariant-violation', 'Operation failed without changing the career map.', error instanceof Error ? error.message : error);
  }
}

export function assertCareerMap(input: unknown): CareerMap {
  return careerMapSchema.parse(input);
}

export type CareerMapValidationError = z.ZodError;

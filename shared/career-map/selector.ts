import { invalidationTargetOrder, type Invalidation, type InvalidationTargetKind } from './common';
import type { CareerMap, Focus } from './model';
import type { CareerMapOperationType } from './operations';

export type MethodModule =
  | 'form-foundation'
  | 'create-purpose-paths'
  | 'design-path-project'
  | 'guide-path-project'
  | 'find-relevant-peers'
  | 'interpret-path-project'
  | 'enter-side-doors';

export type PendingDecision =
  | { kind: 'why-confirmation'; targetId: string; targetRevision: number }
  | { kind: 'path-selection'; targetId: string; targetRevision: number }
  | { kind: 'path-revision-confirmation'; targetId: string; targetRevision: number }
  | { kind: 'first-project-confirmation'; targetId: string; targetRevision: number }
  | { kind: 'project-revision-confirmation'; targetId: string; targetRevision: number }
  | { kind: 'follow-on-project-selection'; targetId: string; targetRevision: number }
  | { kind: 'continue-choice'; targetId: string; targetRevision: number }
  | { kind: 'next-move'; targetId: string; targetRevision: number }
  | { kind: 'peer-insight-confirmation'; targetId: string; targetRevision: number }
  | { kind: 'commitment-completion'; targetId: string; targetRevision: number }
  | { kind: 'proof-confirmation'; targetId: string; targetRevision: number }
  | { kind: 'side-door-selection'; targetId: string; targetRevision: number };

export interface MethodCheckpoint {
  module: MethodModule;
  pendingDecision: PendingDecision | null;
  focus: Focus | null;
  review: Invalidation | null;
  availableOperations: CareerMapOperationType[];
}

function earliestReview(map: CareerMap): Invalidation | null {
  let earliest: Invalidation | null = null;
  for (const item of map.invalidations) {
    if (item.status !== 'pending') continue;
    if (!earliest) {
      earliest = item;
      continue;
    }
    const kindDifference = invalidationTargetOrder.indexOf(item.targetKind)
      - invalidationTargetOrder.indexOf(earliest.targetKind);
    if (kindDifference < 0 || (kindDifference === 0 && item.createdAtRevision < earliest.createdAtRevision)) {
      earliest = item;
    }
  }
  return earliest;
}

function reviewModule(kind: InvalidationTargetKind): MethodModule {
  switch (kind) {
    case 'path-set': return 'create-purpose-paths';
    case 'project': return 'design-path-project';
    case 'reflection':
    case 'next-move': return 'interpret-path-project';
    case 'peer-exposure': return 'find-relevant-peers';
    case 'commitment':
    case 'proof':
    case 'side-door-set':
    case 'route-outcome': return 'enter-side-doors';
  }
}

function focusModule(focus: Focus): MethodModule {
  switch (focus.kind) {
    case 'reflection': return 'interpret-path-project';
    case 'peers': return 'find-relevant-peers';
    case 'foundation-revision': return 'form-foundation';
    case 'path-revision': return 'create-purpose-paths';
  }
}

function activePath(map: CareerMap) {
  return map.pathSets.findLast((set) => set.status === 'active')?.paths.find((path) => path.selection === 'active');
}

function latestAcceptedProject(map: CareerMap) {
  let latest: CareerMap['projects'][number] | undefined;
  for (const project of map.projects) {
    if (project.agreementStatus === 'accepted' && (!latest || project.number > latest.number)) latest = project;
  }
  return latest;
}

function hasProjectOptionsForMove(
  map: CareerMap,
  move: CareerMap['nextMoves'][number],
): boolean {
  return map.projectOptionSets.some(
    (set) => set.basisNextMove.id === move.id && set.basisNextMove.revision === move.revision,
  );
}

function pendingDecision(map: CareerMap): { module: MethodModule; decision: PendingDecision } | null {
  const why = map.foundation.whyRevisions.findLast((item) => item.status === 'suggested');
  if (why) return { module: 'form-foundation', decision: { kind: 'why-confirmation', targetId: why.id, targetRevision: why.revision } };

  const pathSet = map.pathSets.findLast((item) => item.status === 'suggested');
  if (pathSet) {
    const hasActivePath = Boolean(activePath(map));
    return {
      module: 'create-purpose-paths',
      decision: {
        kind: hasActivePath ? 'path-revision-confirmation' : 'path-selection',
        targetId: pathSet.id,
        targetRevision: pathSet.revision,
      },
    };
  }

  const suggestedProject = map.projects.findLast((item) => item.agreementStatus === 'suggested');
  if (suggestedProject) {
    return {
      module: 'design-path-project',
      decision: {
        kind: suggestedProject.supersedesProjectId ? 'project-revision-confirmation' : 'first-project-confirmation',
        targetId: suggestedProject.id,
        targetRevision: suggestedProject.revision,
      },
    };
  }

  const projectOptions = map.projectOptionSets.findLast((item) => item.status === 'suggested');
  if (projectOptions) {
    return { module: 'design-path-project', decision: { kind: 'follow-on-project-selection', targetId: projectOptions.id, targetRevision: projectOptions.revision } };
  }

  const reflection = map.reflections.at(-1);
  if (reflection?.status === 'closed') {
    const choice = map.continueChoices.find((item) => item.reflectionBasis.id === reflection.id && item.reflectionBasis.revision === reflection.revision);
    if (!choice) return { module: 'interpret-path-project', decision: { kind: 'continue-choice', targetId: reflection.id, targetRevision: reflection.revision } };
    const move = map.nextMoves.find((item) => item.continueChoiceBasis.id === choice.id && item.continueChoiceBasis.revision === choice.revision);
    if (!move) return { module: 'interpret-path-project', decision: { kind: 'next-move', targetId: choice.id, targetRevision: choice.revision } };
  }

  const peer = map.peerExposures.findLast((item) => item.status === 'suggested');
  if (peer) return { module: 'find-relevant-peers', decision: { kind: 'peer-insight-confirmation', targetId: peer.id, targetRevision: peer.revision } };

  if (map.commitmentIntent?.status === 'ready' && !map.provisionalCommitment) {
    return { module: 'find-relevant-peers', decision: { kind: 'commitment-completion', targetId: map.commitmentIntent.id, targetRevision: map.commitmentIntent.revision } };
  }

  const proof = map.proofRevisions.findLast((item) => item.status === 'suggested');
  if (proof) return { module: 'enter-side-doors', decision: { kind: 'proof-confirmation', targetId: proof.id, targetRevision: proof.revision } };

  const doors = map.sideDoorSets.findLast((item) => item.status === 'suggested');
  if (doors) return { module: 'enter-side-doors', decision: { kind: 'side-door-selection', targetId: doors.id, targetRevision: doors.revision } };

  return null;
}

function operationsForFocus(map: CareerMap, focus: Focus): CareerMapOperationType[] {
  switch (focus.kind) {
    case 'reflection': return ['append-reflection-evidence', 'revise-reflection-evidence', 'update-project-work-status', 'close-reflection', 'close-focus'];
    case 'peers': return [
      'record-peer-exposure',
      'revise-peer-exposure',
      'confirm-peer-exposure',
      ...(map.commitmentIntent?.status === 'pending-peer-exposure' ? ['defer-peer-exposure' as const] : []),
      'close-focus',
    ];
    case 'foundation-revision': return [
      'append-foundation-evidence',
      ...(map.foundation.evidence.length > 0 ? ['correct-foundation-evidence' as const] : []),
      'record-reality-constraint',
      ...(map.foundation.whyRevisions.some((why) => why.status === 'confirmed') ? ['revise-why' as const] : ['propose-why' as const]),
      ...(map.foundation.whyRevisions.some((why) => why.status === 'suggested') ? ['confirm-why' as const] : []),
      'close-focus',
    ];
    case 'path-revision': return [
      ...(map.pathSets.some((set) => set.status !== 'superseded')
        ? ['replace-purpose-path' as const, 'combine-purpose-paths' as const]
        : ['propose-purpose-paths' as const]),
      ...(map.pathSets.some((set) => set.status === 'suggested') ? ['confirm-purpose-path-revision' as const] : []),
      'close-focus',
    ];
  }
}

function operationsForDecision(map: CareerMap, decision: PendingDecision): CareerMapOperationType[] {
  switch (decision.kind) {
    case 'why-confirmation': return [
      ...(map.foundation.whyRevisions.some((why) => why.status === 'confirmed') ? ['revise-why' as const] : ['propose-why' as const]),
      'confirm-why',
      'open-foundation-revision-focus',
    ];
    case 'path-selection': return ['replace-purpose-path', 'combine-purpose-paths', 'select-purpose-path', 'open-path-revision-focus'];
    case 'path-revision-confirmation': return ['replace-purpose-path', 'combine-purpose-paths', 'confirm-purpose-path-revision', 'select-purpose-path', 'open-path-revision-focus'];
    case 'first-project-confirmation': return ['replace-project-proposal', 'accept-first-project'];
    case 'project-revision-confirmation': return ['replace-project-proposal', 'confirm-project-revision'];
    case 'follow-on-project-selection': return ['replace-follow-on-project', 'select-follow-on-project'];
    case 'continue-choice': return ['record-continue-choice', 'open-peer-focus', 'open-foundation-revision-focus', 'open-path-revision-focus'];
    case 'next-move': return ['record-next-move', 'open-peer-focus', 'open-foundation-revision-focus', 'open-path-revision-focus'];
    case 'peer-insight-confirmation': return [
      'confirm-peer-exposure',
      'record-peer-exposure',
      'revise-peer-exposure',
      ...(map.commitmentIntent?.status === 'pending-peer-exposure' ? ['defer-peer-exposure' as const] : []),
    ];
    case 'commitment-completion': return ['complete-provisional-commitment', 'open-peer-focus'];
    case 'proof-confirmation': return [
      ...(map.proofRevisions.some((proof) => proof.status === 'confirmed') ? ['revise-proof-inventory' as const] : ['propose-proof-inventory' as const]),
      'confirm-proof-inventory',
    ];
    case 'side-door-selection': return ['replace-side-door', 'select-side-door'];
  }
}

function normalLifecycle(map: CareerMap): { module: MethodModule; operations: CareerMapOperationType[] } {
  const why = map.foundation.whyRevisions.findLast((item) => item.status === 'confirmed');
  if (!why) return {
    module: 'form-foundation',
    operations: [
      'append-foundation-evidence',
      ...(map.foundation.evidence.length > 0 ? ['correct-foundation-evidence' as const] : []),
      'record-reality-constraint',
      'propose-why',
    ],
  };

  const path = activePath(map);
  const move = map.nextMoves.at(-1);
  if (!path) {
    return { module: 'create-purpose-paths', operations: ['propose-purpose-paths', 'open-foundation-revision-focus'] };
  }
  if (move?.kind === 'return-to-paths') {
    const activeSet = map.pathSets.findLast((set) => set.status === 'active');
    const pathChosenAfterMove = Boolean(
      activeSet?.confirmation
      && activeSet.confirmation.confirmedBy.turnSequence > move.action.turnSequence,
    );
    if (!pathChosenAfterMove) {
      return { module: 'create-purpose-paths', operations: ['choose-parked-purpose-path', 'propose-purpose-paths', 'open-path-revision-focus', 'open-foundation-revision-focus'] };
    }
    if (!hasProjectOptionsForMove(map, move)) {
      return { module: 'design-path-project', operations: ['propose-follow-on-projects'] };
    }
  }

  if (map.provisionalCommitment) {
    const proof = map.proofRevisions.findLast((item) => item.status === 'confirmed');
    if (!proof) return { module: 'enter-side-doors', operations: ['propose-proof-inventory'] };
    const doorSet = map.sideDoorSets.findLast((item) => item.status === 'active');
    if (!doorSet) return { module: 'enter-side-doors', operations: ['propose-side-doors', 'revise-proof-inventory'] };
    return { module: 'enter-side-doors', operations: ['record-route-outcome', 'replace-side-door', 'propose-side-doors', 'revise-proof-inventory'] };
  }

  if (map.commitmentIntent?.status === 'pending-peer-exposure') {
    return { module: 'find-relevant-peers', operations: ['open-peer-focus', 'record-peer-exposure', 'revise-peer-exposure', 'confirm-peer-exposure', 'defer-peer-exposure'] };
  }

  if (move?.kind === 'explore-further' && !hasProjectOptionsForMove(map, move)) {
    return { module: 'design-path-project', operations: ['propose-follow-on-projects'] };
  }

  const project = latestAcceptedProject(map);
  if (!project || project.basisPath.id !== path.id || project.basisPath.revision !== path.revision) {
    const hasCompletedLoop = map.nextMoves.length > 0;
    return {
      module: 'design-path-project',
      operations: hasCompletedLoop
        ? ['propose-follow-on-projects']
        : ['propose-first-project'],
    };
  }

  const reflection = map.reflections.at(-1);
  if (reflection?.status === 'open') {
    return { module: 'interpret-path-project', operations: ['append-reflection-evidence', 'revise-reflection-evidence', 'close-reflection', 'update-project-work-status'] };
  }

  return {
    module: 'guide-path-project',
    operations: ['update-project-work-status', 'propose-project-revision', 'open-reflection', 'open-peer-focus', 'open-foundation-revision-focus', 'open-path-revision-focus'],
  };
}

export function deriveMethodCheckpoint(map: CareerMap): MethodCheckpoint {
  const review = earliestReview(map);
  if (review) {
    return {
      module: reviewModule(review.targetKind),
      pendingDecision: null,
      focus: map.focus ?? null,
      review,
      availableOperations: ['resolve-basis-review'],
    };
  }

  if (map.focus) {
    return {
      module: focusModule(map.focus),
      pendingDecision: null,
      focus: map.focus,
      review: null,
      availableOperations: operationsForFocus(map, map.focus),
    };
  }

  const pending = pendingDecision(map);
  if (pending) {
    return {
      module: pending.module,
      pendingDecision: pending.decision,
      focus: null,
      review: null,
      availableOperations: operationsForDecision(map, pending.decision),
    };
  }

  const normal = normalLifecycle(map);
  return {
    module: normal.module,
    pendingDecision: null,
    focus: null,
    review: null,
    availableOperations: normal.operations,
  };
}

export function isOperationTypeAvailable(map: CareerMap, type: CareerMapOperationType): boolean {
  return deriveMethodCheckpoint(map).availableOperations.includes(type);
}

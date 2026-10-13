import { invalidationTargetOrder, type Invalidation, type InvalidationTargetKind, type RevisionRef, type UserActionProvenance } from './common';
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

export function selectEarliestActiveReview(map: CareerMap): Invalidation | null {
  let earliest: Invalidation | null = null;
  for (const item of map.invalidations) {
    if (!isActiveBasisReview(map, item)) continue;
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

export function selectActivePurposePath(map: CareerMap) {
  return map.pathSets.findLast((set) => set.status === 'active')?.paths.find((path) => path.selection === 'active');
}

export function selectLatestAcceptedProject(map: CareerMap) {
  let latest: CareerMap['projects'][number] | undefined;
  for (const project of map.projects) {
    if (project.agreementStatus === 'accepted' && (!latest || project.number > latest.number)) latest = project;
  }
  return latest;
}

const sameRef = (a: RevisionRef | undefined, b: RevisionRef | undefined) => Boolean(a && b && a.id === b.id && a.revision === b.revision);
const selectionOperations = ['select-purpose-path', 'confirm-purpose-path-revision', 'choose-parked-purpose-path', 'confirm-purpose-path-change', 'choose-purpose-path'];

export function selectCurrentPathSelectionSourceId(map: CareerMap): string | undefined {
  let set = map.pathSets.findLast((candidate) => candidate.status === 'active');
  const path = set?.paths.find((candidate) => candidate.selection === 'active');
  if (!set?.confirmation || !path) return undefined;
  let confirmation = set.confirmation;
  const visited = new Set<string>();
  while (set.supersedesSetId && !visited.has(set.supersedesSetId)) {
    visited.add(set.supersedesSetId);
    const parentIndex = map.pathSets.indexOf(set);
    const prior = map.pathSets.slice(0, parentIndex).findLast((candidate) => candidate.id === set!.supersedesSetId);
    if (!prior) break;
    const selected = prior.paths.find((candidate) => candidate.selection === 'active');
    if (prior.confirmation && !sameRef(selected, path)) break;
    if (!prior.paths.some((candidate) => sameRef(candidate, path))) break;
    if (prior.confirmation) confirmation = prior.confirmation;
    set = prior;
  }
  return map.operationHistory.findLast((receipt) => selectionOperations.includes(receipt.operationType)
    && receipt.confirmationProvenance?.actionId === confirmation.confirmedBy.actionId)?.sourceId;
}

export function selectCurrentPathFocus(map: CareerMap) {
  const path = selectActivePurposePath(map);
  const sourceId = selectCurrentPathSelectionSourceId(map);
  const set = map.pathSets.findLast((candidate) => candidate.status === 'active');
  const why = map.foundation.whyRevisions.findLast((candidate) => candidate.status === 'confirmed');
  if (!path || !sourceId || !set || !sameRef(set.basisWhy, why)
    || map.invalidations.some((review) => review.status === 'pending' && review.targetKind === 'path-set' && sameRef(set, { id: review.targetId, revision: review.targetRevision }))) return undefined;
  return map.pathFocusCommitments.findLast((focus) => sameRef(focus.basisPath, path) && focus.selectionSourceId === sourceId);
}

export function selectCurrentProjectLearning(map: CareerMap) {
  const project = selectLatestAcceptedProject(map);
  const reflection = project && map.reflections.findLast((item) => sameRef(item.projectBasis, project));
  const choice = reflection && map.continueChoices.findLast((item) => sameRef(item.reflectionBasis, reflection));
  const move = choice && map.nextMoves.findLast((item) => sameRef(item.continueChoiceBasis, choice));
  return { project, reflection, choice, move };
}

export function hasCompletedLearningLoop(map: CareerMap): boolean {
  return map.nextMoves.some((move) => {
    const choice = map.continueChoices.find((item) => sameRef(item, move.continueChoiceBasis));
    const reflection = choice && map.reflections.find((item) => sameRef(item, choice.reflectionBasis));
    return Boolean(reflection?.status === 'closed' && reflection.evidence.length > 0
      && map.projects.some((project) => sameRef(project, reflection.projectBasis)));
  });
}

export function isActiveBasisReview(map: CareerMap, item: Invalidation): boolean {
  if (item.status !== 'pending') return false;
  const { project, reflection, move } = selectCurrentProjectLearning(map);
  switch (item.targetKind) {
    case 'path-set': return map.pathSets.some((set) => sameRef(set, { id: item.targetId, revision: item.targetRevision }) && set.status !== 'superseded');
    case 'project': return sameRef(project, { id: item.targetId, revision: item.targetRevision }) || map.projects.some((candidate) => candidate.agreementStatus === 'suggested' && sameRef(candidate.basisPath, selectActivePurposePath(map)) && sameRef(candidate, { id: item.targetId, revision: item.targetRevision }));
    case 'reflection': return map.reflections.some((candidate) => sameRef(candidate.projectBasis, project) && sameRef(candidate, { id: item.targetId, revision: item.targetRevision }));
    case 'next-move': return map.nextMoves.some((candidate) => {
      const choice = map.continueChoices.find((record) => sameRef(record, candidate.continueChoiceBasis));
      const basisReflection = choice && map.reflections.find((record) => sameRef(record, choice.reflectionBasis));
      return sameRef(basisReflection?.projectBasis, project) && sameRef(candidate, { id: item.targetId, revision: item.targetRevision });
    });
    default: return false;
  }
}

export function selectProjectDecisionBasis(map: CareerMap): { basisNextMove?: RevisionRef; basisAction?: { sourceId: string; action: UserActionProvenance } } | undefined {
  const selectionSourceId = selectCurrentPathSelectionSourceId(map);
  const selection = map.operationHistory.find((receipt) => receipt.sourceId === selectionSourceId);
  const request = map.operationHistory.findLast((receipt) => receipt.operationType === 'request-new-project'
    && (!selection || receipt.resultRevision > selection.resultRevision));
  const receipt = request ?? selection;
  if (receipt?.confirmationProvenance && !map.projectOptionSets.some((set) => set.basisAction?.sourceId === receipt.sourceId) && !map.projects.some((project) => project.basisAction?.sourceId === receipt.sourceId)) {
    const latestProject = selectLatestAcceptedProject(map);
    const projectReceipt = latestProject?.confirmation && map.operationHistory.findLast((item) => ['accept-first-project','confirm-project-revision','select-follow-on-project'].includes(item.operationType) && item.confirmationProvenance?.actionId === latestProject.confirmation?.confirmedBy.actionId);
    if (!projectReceipt || projectReceipt.resultRevision < receipt.resultRevision) {
      return { basisAction: { sourceId: receipt.sourceId, action: receipt.confirmationProvenance } };
    }
  }
  const { project, reflection, move } = selectCurrentProjectLearning(map);
  if (project && sameRef(project.basisPath, selectActivePurposePath(map)) && move?.kind === 'explore-further' && !map.projectOptionSets.some((set) => sameRef(set.basisNextMove, move))) {
    return { basisNextMove: { id: move.id, revision: move.revision } };
  }
  return undefined;
}

function pendingDecision(map: CareerMap): { module: MethodModule; decision: PendingDecision } | null {
  const why = map.foundation.whyRevisions.findLast((item) => item.status === 'suggested');
  if (why) return { module: 'form-foundation', decision: { kind: 'why-confirmation', targetId: why.id, targetRevision: why.revision } };

  const pathSet = map.pathSets.findLast((item) => item.status === 'suggested');
  if (pathSet) {
    const hasActivePath = Boolean(selectActivePurposePath(map));
    return {
      module: 'create-purpose-paths',
      decision: {
        kind: hasActivePath ? 'path-revision-confirmation' : 'path-selection',
        targetId: pathSet.id,
        targetRevision: pathSet.revision,
      },
    };
  }

  const suggestedProject = map.projects.findLast((item) => item.agreementStatus === 'suggested' && sameRef(item.basisPath, selectActivePurposePath(map)));
  if (suggestedProject) {
    const revisesAcceptedProject = Boolean(
      suggestedProject.supersedesProjectId
      && map.projects.some(
        (project) => project.id === suggestedProject.supersedesProjectId && project.agreementStatus === 'accepted',
      ),
    );
    return {
      module: 'design-path-project',
      decision: {
        kind: revisesAcceptedProject ? 'project-revision-confirmation' : 'first-project-confirmation',
        targetId: suggestedProject.id,
        targetRevision: suggestedProject.revision,
      },
    };
  }

  const projectOptions = map.projectOptionSets.findLast((item) => item.status === 'suggested' && sameRef(item.basisPath, selectActivePurposePath(map)));
  if (projectOptions) {
    return { module: 'design-path-project', decision: { kind: 'follow-on-project-selection', targetId: projectOptions.id, targetRevision: projectOptions.revision } };
  }

  const { reflection, choice, move } = selectCurrentProjectLearning(map);
  const basis = selectProjectDecisionBasis(map);
  if (basis?.basisAction && map.operationHistory.some((receipt) => receipt.sourceId === basis.basisAction?.sourceId && receipt.operationType === 'request-new-project')) return null;
  if (reflection?.status === 'closed' && sameRef(selectCurrentProjectLearning(map).project?.basisPath, selectActivePurposePath(map))) {
    if (!choice) return { module: 'interpret-path-project', decision: { kind: 'continue-choice', targetId: reflection.id, targetRevision: reflection.revision } };
    if (!move) return { module: 'interpret-path-project', decision: { kind: 'next-move', targetId: choice.id, targetRevision: choice.revision } };
  }

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
        ? ['replace-purpose-path' as const, 'revise-purpose-paths' as const, 'combine-purpose-paths' as const]
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
    case 'path-selection': return ['replace-purpose-path', 'revise-purpose-paths', 'combine-purpose-paths', 'select-purpose-path', 'open-path-revision-focus', 'open-foundation-revision-focus'];
    case 'path-revision-confirmation': return ['replace-purpose-path', 'revise-purpose-paths', 'combine-purpose-paths', 'confirm-purpose-path-revision', 'select-purpose-path', 'open-path-revision-focus', 'open-foundation-revision-focus'];
    case 'first-project-confirmation': {
      const project = map.projects.find((item) => (
        item.id === decision.targetId && item.revision === decision.targetRevision
      ));
      if (!project?.acceptanceFraming) return ['replace-project-proposal', 'present-first-project-framing'];
      return project.acceptanceFraming.status === 'delivered'
        ? ['replace-project-proposal', 'accept-first-project']
        : [];
    }
    case 'project-revision-confirmation': return ['replace-project-proposal', 'confirm-project-revision'];
    case 'follow-on-project-selection': return ['replace-follow-on-project', 'select-follow-on-project'];
    case 'continue-choice': return ['record-continue-choice', 'revise-reflection-evidence', 'open-foundation-revision-focus', 'open-path-revision-focus'];
    case 'next-move': return ['record-next-move', 'revise-reflection-evidence', 'open-foundation-revision-focus', 'open-path-revision-focus'];
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

  const path = selectActivePurposePath(map);
  if (!path) return { module: 'create-purpose-paths', operations: ['propose-purpose-paths', 'open-foundation-revision-focus'] };

  const { project, reflection, move } = selectCurrentProjectLearning(map);
  const basis = selectProjectDecisionBasis(map);
  const newProjectRequested = basis?.basisAction && map.operationHistory.some((receipt) => receipt.sourceId === basis.basisAction?.sourceId && receipt.operationType === 'request-new-project');
  if (!newProjectRequested && move?.kind === 'return-to-paths') {
    const selection = map.operationHistory.find((receipt) => receipt.sourceId === selectCurrentPathSelectionSourceId(map));
    if (!selection?.confirmationProvenance || selection.confirmationProvenance.turnSequence <= move.action.turnSequence) {
      return { module: 'create-purpose-paths', operations: ['choose-parked-purpose-path', 'propose-purpose-paths', 'open-path-revision-focus', 'open-foundation-revision-focus'] };
    }
  }
  if (!project || !sameRef(project.basisPath, path) || basis) {
    return { module: 'design-path-project', operations: hasCompletedLearningLoop(map) && basis ? ['propose-follow-on-projects'] : ['propose-first-project'] };
  }

  return {
    module: 'guide-path-project',
    operations: ['update-project-work-status', 'propose-project-revision', 'open-reflection', ...(reflection ? ['revise-reflection-evidence' as const] : []), 'open-foundation-revision-focus', 'open-path-revision-focus'],
  };
}

function withHelpOperations(map: CareerMap, operations: CareerMapOperationType[]): CareerMapOperationType[] {
  const path = selectActivePurposePath(map);
  const extras: CareerMapOperationType[] = ['open-foundation-revision-focus'];
  if (map.foundation.whyRevisions.some((why) => why.status === 'confirmed')) extras.push('open-path-revision-focus');
  if (path && !map.foundation.whyRevisions.some((why) => why.status === 'suggested') && !map.pathSets.some((set) => set.status === 'suggested')) {
    if (map.focus?.kind === 'path-revision' || selectCurrentProjectLearning(map).move?.kind === 'return-to-paths') extras.push('choose-parked-purpose-path');
    if ((!map.focus || map.focus.kind === 'reflection') && !selectCurrentPathFocus(map)) extras.push('record-path-focus');
    const tenure = map.operationHistory.find((item) => item.sourceId === selectCurrentPathSelectionSourceId(map));
    if ((!map.focus || map.focus.kind === 'reflection') && map.commitmentIntent && map.commitmentIntent.status !== 'completed' && sameRef(map.commitmentIntent.basisPath, path) && tenure?.confirmationProvenance && tenure.confirmationProvenance.turnSequence <= map.commitmentIntent.action.turnSequence && !selectCurrentPathFocus(map)) extras.push('confirm-legacy-path-focus');
    if ((!map.focus || map.focus.kind === 'reflection') && sameRef(selectCurrentProjectLearning(map).project?.basisPath, path)) extras.push('request-new-project');
  }
  return [...new Set([...operations, ...extras])];
}

export function deriveMethodCheckpoint(map: CareerMap): MethodCheckpoint {
  const review = selectEarliestActiveReview(map);
  if (review) {
    return {
      module: reviewModule(review.targetKind),
      pendingDecision: null,
      focus: map.focus?.kind === 'peers' ? null : map.focus ?? null,
      review,
      availableOperations: ['resolve-basis-review'],
    };
  }

  if (map.focus && map.focus.kind !== 'peers' && (map.focus.kind !== 'reflection' || selectCurrentProjectLearning(map).reflection?.id === map.focus.reflectionId)) {
    return {
      module: focusModule(map.focus),
      pendingDecision: null,
      focus: map.focus,
      review: null,
      availableOperations: withHelpOperations(map, operationsForFocus(map, map.focus)),
    };
  }

  const pending = pendingDecision(map);
  if (pending) {
    return {
      module: pending.module,
      pendingDecision: pending.decision,
      focus: null,
      review: null,
      availableOperations: withHelpOperations(map, operationsForDecision(map, pending.decision)),
    };
  }

  const normal = normalLifecycle(map);
  return {
    module: normal.module,
    pendingDecision: null,
    focus: null,
    review: null,
    availableOperations: withHelpOperations(map, normal.operations),
  };
}

export function isOperationTypeAvailable(map: CareerMap, type: CareerMapOperationType): boolean {
  return deriveMethodCheckpoint(map).availableOperations.includes(type);
}

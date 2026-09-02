import { describe, expect, it } from 'vitest';
import {
  applyCareerMapOperation,
  careerMapSchema,
  createCareerMap,
  deriveMethodCheckpoint,
  type CareerMap,
  type CareerMapOperation,
  type PathProjectInput,
  type PurposePathInput,
  type SideDoorInput,
  type UserActionProvenance,
} from './index';

const at = (n: number) => `2026-08-31T10:${String(n).padStart(2, '0')}:00.000Z`;

const presentation = (sequence: number) => ({
  kind: 'model-presentation' as const,
  assistantTurnId: `assistant-${sequence}`,
  turnSequence: sequence,
  completed: true as const,
  presentedAt: at(sequence),
});

const action = (sequence: number, kind: UserActionProvenance['kind'] = 'user-message') => ({
  kind,
  actionId: `action-${sequence}`,
  turnId: `user-${sequence}`,
  turnSequence: sequence,
  occurredAt: at(sequence),
});

const paths = (prefix = 'path', revision = 1): [PurposePathInput, PurposePathInput, PurposePathInput] => [
  {
    id: `${prefix}-1`, revision, name: 'Make knowledge useful',
    servesWhy: 'Turn complexity into practical understanding', possibility: 'People act with more confidence',
    evidence: ['The explorer repeatedly explains complex systems'], centralUnknown: 'Whether facilitation stays energizing',
    projectPreview: 'Run a decision workshop', practicalFit: 'Can begin beside current work',
  },
  {
    id: `${prefix}-2`, revision, name: 'Build humane tools',
    servesWhy: 'Encode practical understanding into tools', possibility: 'Small teams make better decisions',
    evidence: ['The explorer builds internal tools voluntarily'], centralUnknown: 'Whether product iteration is absorbing',
    projectPreview: 'Build one decision aid', practicalFit: 'A low-cost prototype is feasible',
  },
  {
    id: `${prefix}-3`, revision, name: 'Investigate better systems',
    servesWhy: 'Find and publish better ways to decide', possibility: 'Useful methods spread',
    evidence: ['The explorer follows research questions for fun'], centralUnknown: 'Whether sustained inquiry feels alive',
    projectPreview: 'Publish a field note', practicalFit: 'Can be tested with one case',
  },
];

const project = (id = 'project-1', revision = 1): PathProjectInput => ({
  id,
  revision,
  title: 'Build a real decision aid',
  outcome: 'A colleague can use it for a current decision',
  audience: 'A colleague with a live decision',
  whyWanted: 'The explorer wants less wasteful decision work',
  learningGoal: 'Learn whether product iteration creates voluntary pull',
  firstVersion: 'A one-page interactive prototype',
  firstStep: 'Interview one colleague about a live decision',
  decisionQuestion: 'Do I want to keep improving tools like this?',
  evidenceCue: 'Notice whether iteration creates energy or resistance',
});

const doors = (): [SideDoorInput, SideDoorInput, SideDoorInput] => [
  {
    id: 'door-1', revision: 1, name: 'Contribute a working aid', target: 'A decision-practice community',
    proofValue: 'The prototype solves a visible problem', contribution: 'Offer the aid and a short field note',
    firstMove: 'Ask one maintainer for critique', accessConstraints: ['Public community channel'],
  },
  {
    id: 'door-2', revision: 1, name: 'Help a small team', target: 'A mission-led small team',
    proofValue: 'The project shows useful product judgment', contribution: 'Adapt the aid to one live workflow',
    firstMove: 'Share a tailored teardown', accessConstraints: ['Needs a warm problem signal'],
  },
  {
    id: 'door-3', revision: 1, name: 'Publish the method', target: 'Practitioners improving decisions',
    proofValue: 'The work contains a tested point of view', contribution: 'Publish the method and example',
    firstMove: 'Draft a concise case study', accessConstraints: ['Requires permission to anonymize'],
  },
];

function operation<T extends CareerMapOperation['type']>(
  map: CareerMap,
  type: T,
  payload: Extract<CareerMapOperation, { type: T }>['payload'],
  sourceId = `${type}-${map.revision + 1}`,
): Extract<CareerMapOperation, { type: T }> {
  return { type, sourceId, expectedRevision: map.revision, occurredAt: at(map.revision + 1), payload } as Extract<
    CareerMapOperation,
    { type: T }
  >;
}

function commit<T extends CareerMapOperation['type']>(
  map: CareerMap,
  type: T,
  payload: Extract<CareerMapOperation, { type: T }>['payload'],
  sourceId?: string,
): CareerMap {
  const result = applyCareerMapOperation(map, operation(map, type, payload, sourceId));
  expect(result.status).toBe('committed');
  return result.map;
}

function withConfirmedWhy(): CareerMap {
  let map = createCareerMap('explorer-1');
  map = commit(map, 'propose-why', {
    why: { id: 'why-1', revision: 1, statement: 'I work to make complex choices more humane.', serves: 'People facing consequential choices', pointOfView: 'Clarity should produce action, not dependence' },
    presentation: presentation(1),
  });
  return commit(map, 'confirm-why', { whyId: 'why-1', whyRevision: 1, action: action(2) });
}

function withSelectedPath(): CareerMap {
  let map = withConfirmedWhy();
  map = commit(map, 'propose-purpose-paths', { setId: 'paths-1', setRevision: 1, paths: paths(), presentation: presentation(3) });
  return commit(map, 'select-purpose-path', { setId: 'paths-1', setRevision: 1, pathId: 'path-2', pathRevision: 1, action: action(4) });
}

function withAcceptedProject(): CareerMap {
  let map = withSelectedPath();
  map = commit(map, 'propose-first-project', { project: project(), presentation: presentation(5) });
  return commit(map, 'accept-first-project', { projectId: 'project-1', projectRevision: 1, action: action(6) });
}

function withCompletedLearningLoop(nextMove: 'explore-further' | 'commit-provisionally' | 'return-to-paths'): CareerMap {
  let map = withAcceptedProject();
  map = commit(map, 'open-reflection', { reflectionId: 'reflection-1', revision: 1, projectId: 'project-1', projectRevision: 1, action: action(7) });
  map = commit(map, 'append-reflection-evidence', {
    reflectionId: 'reflection-1', reflectionRevision: 1,
    evidence: { id: 'learning-1', revision: 1, observation: 'I kept improving the interaction after the useful version worked.', signal: 'voluntary-pull', interpretation: 'Iteration itself may be energizing', provenance: action(8) },
  });
  map = commit(map, 'close-reflection', { reflectionId: 'reflection-1', reflectionRevision: 1, action: action(9) });
  const wantsToContinue = nextMove !== 'return-to-paths';
  map = commit(map, 'record-continue-choice', { id: 'continue-1', revision: 1, reflectionId: 'reflection-1', reflectionRevision: 1, wantsToContinue, action: action(10) });
  return commit(map, 'record-next-move', { id: 'move-1', revision: 1, continueChoiceId: 'continue-1', continueChoiceRevision: 1, kind: nextMove, action: action(11) });
}

describe('Method reducer', () => {
  it('rejects partial exact-three sets, fit scores, and malformed second-active state without mutation', () => {
    const base = withConfirmedWhy();
    const partial = operation(base, 'propose-purpose-paths', {
      setId: 'partial', setRevision: 1, paths: paths().slice(0, 2) as never, presentation: presentation(3),
    });
    const partialResult = applyCareerMapOperation(base, partial as CareerMapOperation);
    expect(partialResult.status).toBe('rejected');
    expect(partialResult.map).toEqual(base);

    const scored = operation(base, 'propose-purpose-paths', {
      setId: 'scored', setRevision: 1,
      paths: paths().map((candidate) => ({ ...candidate, fitScore: 0.9 })) as never,
      presentation: presentation(3),
    });
    expect(applyCareerMapOperation(base, scored as CareerMapOperation).status).toBe('rejected');

    const selected = withSelectedPath();
    const malformed = structuredClone(selected);
    const activeSet = malformed.pathSets.find((set) => set.status === 'active')!;
    activeSet.paths[0].selection = 'active';
    activeSet.paths[1].selection = 'active';
    expect(careerMapSchema.safeParse(malformed).success).toBe(false);
  });

  it('commits exact-three paths atomically, rejects ranked input, and replays once', () => {
    const base = withConfirmedWhy();
    const propose = operation(base, 'propose-purpose-paths', {
      setId: 'paths-1', setRevision: 1, paths: paths(), presentation: presentation(3),
    }, 'source-path-set');

    const first = applyCareerMapOperation(base, propose);
    expect(first.status).toBe('committed');
    expect(first.map.pathSets.at(-1)?.paths).toHaveLength(3);
    expect(first.map.pathSets.at(-1)?.paths.every((candidate) => candidate.selection === 'available')).toBe(true);
    expect(first.receipt.payloadFingerprint).toMatch(/^u2-v1-[0-9a-f]{32}$/);
    expect(first.receipt.payloadFingerprint).not.toContain('Make knowledge useful');

    const replay = applyCareerMapOperation(first.map, propose);
    expect(replay.status).toBe('replayed');
    expect(replay.map).toEqual(first.map);
    expect(replay.receipt.resultRevision).toBe(first.map.revision);

    const changedPayload = { ...propose, payload: { ...propose.payload, setId: 'paths-other' } };
    const collision = applyCareerMapOperation(first.map, changedPayload);
    expect(collision.status).toBe('rejected');
    expect(collision.error.code).toBe('source-id-reused');
    expect(collision.map).toEqual(first.map);

    const stale = { ...operation(first.map, 'open-peer-focus', { reason: 'Inspect the field', action: action(4) }), expectedRevision: base.revision };
    const conflicted = applyCareerMapOperation(first.map, stale);
    expect(conflicted.status).toBe('rejected');
    expect(conflicted.error.code).toBe('revision-conflict');
    expect(conflicted.map).toEqual(first.map);

    const ranked = operation(base, 'propose-purpose-paths', {
      setId: 'ranked', setRevision: 1,
      paths: paths().map((candidate, index) => ({ ...candidate, rank: index + 1 })) as never,
      presentation: presentation(3),
    });
    const rejected = applyCareerMapOperation(base, ranked as CareerMapOperation);
    expect(rejected.status).toBe('rejected');
    expect(rejected.map).toEqual(base);
  });

  it('replaces and combines paths as complete unranked sets without implicit activation', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'propose-purpose-paths', { setId: 'paths-1', setRevision: 1, paths: paths(), presentation: presentation(3) });
    map = commit(map, 'replace-purpose-path', {
      sourceSetId: 'paths-1', sourceSetRevision: 1, replacedPathId: 'path-1',
      replacementSetId: 'paths-2', replacementSetRevision: 1,
      replacement: { ...paths('replacement')[0], id: 'path-4' }, presentation: presentation(4),
    });
    expect(map.pathSets.at(-1)?.paths.map((candidate) => candidate.id)).toEqual(['path-4', 'path-2', 'path-3']);

    map = commit(map, 'combine-purpose-paths', {
      sourceSetId: 'paths-2', sourceSetRevision: 1, combinedPathIds: ['path-4', 'path-2'],
      replacementSetId: 'paths-3', replacementSetRevision: 1,
      paths: [
        { ...paths('combined')[0], id: 'path-combined' },
        paths()[2],
        { ...paths('combined')[2], id: 'path-new-third' },
      ],
      presentation: presentation(5),
    });
    const current = map.pathSets.at(-1);
    expect(current?.paths).toHaveLength(3);
    expect(current?.status).toBe('suggested');
    expect(current?.paths.every((candidate) => candidate.selection === 'available')).toBe(true);
  });

  it('requires a new revision whenever Purpose Path content changes', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'propose-purpose-paths', {
      setId: 'paths-1', setRevision: 1, paths: paths(), presentation: presentation(3),
    });

    const reusedRevision = applyCareerMapOperation(map, operation(map, 'replace-purpose-path', {
      sourceSetId: 'paths-1', sourceSetRevision: 1, replacedPathId: 'path-1',
      replacementSetId: 'paths-2', replacementSetRevision: 1,
      replacement: { ...paths()[0], name: 'Materially changed path' },
      presentation: presentation(4),
    }));

    expect(reusedRevision.status).toBe('rejected');
    if (reusedRevision.status === 'rejected') {
      expect(reusedRevision.error.code).toBe('revision-conflict');
    }
    expect(reusedRevision.map).toEqual(map);

    const malformed = structuredClone(map);
    malformed.pathSets.push({
      ...structuredClone(malformed.pathSets[0]),
      id: 'paths-2',
      revision: 1,
    });
    malformed.pathSets[1].paths[0].name = 'Changed without a new revision';
    const parsed = careerMapSchema.safeParse(malformed);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) =>
        issue.message === 'A Purpose Path revision must have one immutable content snapshot.')).toBe(true);
    }
  });

  it('requires auditable subsequent-turn confirmation and rejects stale targets', () => {
    let map = createCareerMap('explorer-1');
    map = commit(map, 'propose-why', {
      why: { id: 'why-1', revision: 1, statement: 'Make hard choices clearer.', serves: 'People in transition', pointOfView: 'Useful clarity changes the next action' },
      presentation: presentation(5),
    });

    const sameTurn = applyCareerMapOperation(map, operation(map, 'confirm-why', { whyId: 'why-1', whyRevision: 1, action: action(5) }));
    expect(sameTurn.status).toBe('rejected');

    const stale = applyCareerMapOperation(map, operation(map, 'confirm-why', { whyId: 'why-1', whyRevision: 2, action: action(6) }));
    expect(stale.status).toBe('rejected');

    const ui = applyCareerMapOperation(map, operation(map, 'confirm-why', { whyId: 'why-1', whyRevision: 1, action: action(5, 'ui-action') }));
    expect(ui.status).toBe('committed');
  });

  it.each(['not-started', 'in-progress', 'stopped', 'completed'] as const)(
    'opens reflection while work is %s without changing work status',
    (workStatus) => {
      let map = withAcceptedProject();
      if (workStatus !== 'not-started') {
        map = commit(map, 'update-project-work-status', { projectId: 'project-1', projectRevision: 1, status: workStatus, action: action(7) });
      }
      const before = map.projects.find((candidate) => candidate.id === 'project-1')?.workStatus;
      map = commit(map, 'open-reflection', { reflectionId: `reflection-${workStatus}`, revision: 1, projectId: 'project-1', projectRevision: 1, action: action(8) });
      expect(map.projects.find((candidate) => candidate.id === 'project-1')?.workStatus).toBe(before);
      expect(map.reflections.at(-1)?.status).toBe('open');
    },
  );

  it('enforces Next Move branches and peer-gated provisional commitment', () => {
    const noMap = withCompletedLearningLoop('return-to-paths');
    expect(noMap.nextMoves.at(-1)?.kind).toBe('return-to-paths');

    let map = withCompletedLearningLoop('commit-provisionally');
    expect(map.commitmentIntent?.status).toBe('pending-peer-exposure');
    expect(map.provisionalCommitment).toBeUndefined();
    expect(deriveMethodCheckpoint(map).availableOperations).not.toContain('propose-follow-on-projects');

    const blocked = applyCareerMapOperation(map, operation(map, 'complete-provisional-commitment', { id: 'commitment-1', revision: 1, intentId: map.commitmentIntent!.id, action: action(12) }));
    expect(blocked.status).toBe('rejected');

    map = commit(map, 'defer-peer-exposure', { intentId: map.commitmentIntent!.id, action: action(12) });
    expect(map.commitmentIntent?.status).toBe('peer-exposure-deferred');
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');

    map = commit(map, 'record-peer-exposure', {
      exposure: { id: 'peer-1', revision: 1, subjectKind: 'first-person-source', subject: 'A practitioner field journal', insight: 'The work rewards repeated translation between evidence and action' },
      presentation: presentation(12),
    });
    map = commit(map, 'confirm-peer-exposure', { exposureId: 'peer-1', exposureRevision: 1, action: action(13) });
    map = commit(map, 'complete-provisional-commitment', { id: 'commitment-1', revision: 1, intentId: map.commitmentIntent!.id, action: action(14) });
    expect(map.provisionalCommitment?.status).toBe('confirmed');
  });

  it('invalidates commitment and later state when its confirmed peer-insight basis is revised', () => {
    let map = withCompletedLearningLoop('commit-provisionally');
    map = commit(map, 'record-peer-exposure', {
      exposure: { id: 'peer-1', revision: 1, subjectKind: 'first-person-source', subject: 'Practitioner journal', insight: 'The work depends on repeated translation' },
      presentation: presentation(12),
    });
    map = commit(map, 'confirm-peer-exposure', { exposureId: 'peer-1', exposureRevision: 1, action: action(13) });
    map = commit(map, 'complete-provisional-commitment', { id: 'commitment-1', revision: 1, intentId: map.commitmentIntent!.id, action: action(14) });
    map = commit(map, 'revise-peer-exposure', {
      exposure: { id: 'peer-2', revision: 1, subjectKind: 'first-person-source', subject: 'Practitioner journal', insight: 'The work depends on facilitation more than translation' },
      supersedesExposureId: 'peer-1', presentation: presentation(15),
    });
    map = commit(map, 'confirm-peer-exposure', { exposureId: 'peer-2', exposureRevision: 1, action: action(16) });
    expect(map.peerExposures.find((item) => item.id === 'peer-1')?.status).toBe('superseded');
    expect(map.invalidations.some((item) => item.targetKind === 'commitment' && item.targetId === 'commitment-1')).toBe(true);
  });

  it('keeps the first project number on replacement and creates N+1 only after follow-on selection', () => {
    let map = withSelectedPath();
    map = commit(map, 'propose-first-project', { project: project(), presentation: presentation(5) });
    map = commit(map, 'replace-project-proposal', { projectId: 'project-1', projectRevision: 1, replacement: project('project-2', 1), presentation: presentation(6) });
    expect(map.projects.at(-1)?.number).toBe(1);
    map = commit(map, 'accept-first-project', { projectId: 'project-2', projectRevision: 1, action: action(7) });

    map = commit(map, 'open-reflection', { reflectionId: 'reflection-1', revision: 1, projectId: 'project-2', projectRevision: 1, action: action(8) });
    map = commit(map, 'append-reflection-evidence', { reflectionId: 'reflection-1', reflectionRevision: 1, evidence: { id: 'e-1', revision: 1, observation: 'I wanted another iteration.', signal: 'desire-to-continue', interpretation: 'More evidence is useful', provenance: action(9) } });
    map = commit(map, 'close-reflection', { reflectionId: 'reflection-1', reflectionRevision: 1, action: action(10) });
    map = commit(map, 'record-continue-choice', { id: 'continue-1', revision: 1, reflectionId: 'reflection-1', reflectionRevision: 1, wantsToContinue: true, action: action(11) });
    map = commit(map, 'record-next-move', { id: 'move-1', revision: 1, continueChoiceId: 'continue-1', continueChoiceRevision: 1, kind: 'explore-further', action: action(12) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({
      module: 'design-path-project',
      availableOperations: ['propose-follow-on-projects'],
    });

    map = commit(map, 'propose-follow-on-projects', {
      setId: 'project-options-1', setRevision: 1,
      projects: [project('option-1'), project('option-2'), project('option-3')], presentation: presentation(13),
    });
    const duplicatedOptions = applyCareerMapOperation(map, operation(map, 'propose-follow-on-projects', {
      setId: 'project-options-duplicate', setRevision: 1,
      projects: [project('duplicate-1'), project('duplicate-2'), project('duplicate-3')],
      presentation: presentation(14),
    }));
    expect(duplicatedOptions.status).toBe('rejected');
    const select = operation(map, 'select-follow-on-project', { setId: 'project-options-1', setRevision: 1, projectId: 'option-2', projectRevision: 1, action: action(14) }, 'select-follow-on-once');
    const selected = applyCareerMapOperation(map, select);
    expect(selected.status).toBe('committed');
    expect(selected.map.projects.at(-1)?.number).toBe(2);
    expect(deriveMethodCheckpoint(selected.map).module).toBe('guide-path-project');
    const replayed = applyCareerMapOperation(selected.map, select);
    expect(replayed.status).toBe('replayed');
    expect(replayed.map.projects.filter((candidate) => candidate.number === 2)).toHaveLength(1);
  });

  it('chooses a parked path after continue-no and still requires an exact-three N+1 project decision', () => {
    let map = withCompletedLearningLoop('return-to-paths');
    map = commit(map, 'choose-parked-purpose-path', {
      sourceSetId: 'paths-1', sourceSetRevision: 1,
      replacementSetId: 'paths-2', replacementSetRevision: 1,
      pathId: 'path-1', pathRevision: 1, action: action(12),
    });
    expect(map.pathSets.find((set) => set.status === 'active')?.paths.find((path) => path.selection === 'active')?.id).toBe('path-1');
    expect(map.invalidations.map((item) => item.targetKind)).toEqual(['project', 'reflection', 'next-move']);

    map = commit(map, 'resolve-basis-review', { targetKind: 'project', targetId: 'project-1', targetRevision: 1, resolution: 'replaced', action: action(13) });
    map = commit(map, 'resolve-basis-review', { targetKind: 'reflection', targetId: 'reflection-1', targetRevision: 1, resolution: 'reaffirmed', action: action(14) });
    map = commit(map, 'resolve-basis-review', { targetKind: 'next-move', targetId: 'move-1', targetRevision: 1, resolution: 'reaffirmed', action: action(15) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({
      module: 'design-path-project',
      availableOperations: ['propose-follow-on-projects'],
    });

    map = commit(map, 'propose-follow-on-projects', {
      setId: 'switched-options', setRevision: 1,
      projects: [project('switch-option-1'), project('switch-option-2'), project('switch-option-3')],
      presentation: presentation(16),
    });
    expect(map.projectOptionSets.at(-1)?.projects).toHaveLength(3);
    map = commit(map, 'select-follow-on-project', { setId: 'switched-options', setRevision: 1, projectId: 'switch-option-3', projectRevision: 1, action: action(17) });
    expect(map.projects.at(-1)?.number).toBe(2);
    expect(map.projects.at(-1)?.basisPath.id).toBe('path-1');
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');
  });

  it('selects one Side Door and parks two atomically while keeping route evidence separate', () => {
    let map = withCompletedLearningLoop('commit-provisionally');
    map = commit(map, 'record-peer-exposure', { exposure: { id: 'peer-1', revision: 1, subjectKind: 'community', subject: 'Decision practitioners', insight: 'Credibility comes from concrete cases' }, presentation: presentation(12) });
    map = commit(map, 'confirm-peer-exposure', { exposureId: 'peer-1', exposureRevision: 1, action: action(13) });
    map = commit(map, 'complete-provisional-commitment', { id: 'commitment-1', revision: 1, intentId: map.commitmentIntent!.id, action: action(14) });
    map = commit(map, 'propose-proof-inventory', { proof: { id: 'proof-1', revision: 1, artifacts: ['Decision aid prototype'], problemsSolved: ['Turned ambiguity into a usable flow'], peopleHelped: ['One colleague'], usefulQualities: ['Synthesis'], knowledge: ['Decision design'], relationships: ['Practitioner peer'], pointsOfView: ['Clarity must change action'], shareableMaterial: ['Anonymized case study'] }, presentation: presentation(15) });
    map = commit(map, 'confirm-proof-inventory', { proofId: 'proof-1', proofRevision: 1, action: action(16) });
    map = commit(map, 'propose-side-doors', { setId: 'doors-1', setRevision: 1, doors: doors(), presentation: presentation(17) });
    map = commit(map, 'select-side-door', { setId: 'doors-1', setRevision: 1, doorId: 'door-2', doorRevision: 1, action: action(18) });

    const selected = map.sideDoorSets.at(-1)?.doors;
    expect(selected?.filter((door) => door.selection === 'active')).toHaveLength(1);
    expect(selected?.filter((door) => door.selection === 'parked')).toHaveLength(2);

    map = commit(map, 'record-route-outcome', { id: 'outcome-1', revision: 1, doorId: 'door-2', doorRevision: 1, result: 'no-response', learning: 'Try a contribution with a clearer live problem', action: action(19) });
    expect(map.routeOutcomes).toHaveLength(1);
    expect(map.reflections).toHaveLength(1);
    expect(map.invalidations).toHaveLength(0);

    map = commit(map, 'replace-side-door', {
      sourceSetId: 'doors-1', sourceSetRevision: 1, replacedDoorId: 'door-3',
      replacementSetId: 'doors-2', replacementSetRevision: 1,
      replacement: { ...doors()[2], id: 'door-4', name: 'Share a live contribution' }, presentation: presentation(20),
    });
    map = commit(map, 'select-side-door', { setId: 'doors-2', setRevision: 1, doorId: 'door-4', doorRevision: 1, action: action(21) });
    expect(map.sideDoorSets.filter((set) => set.status === 'active')).toHaveLength(1);
    expect(map.routeOutcomes).toHaveLength(1);

    map = commit(map, 'revise-proof-inventory', { proof: { id: 'proof-2', revision: 1, artifacts: ['Decision aid prototype', 'Anonymized field note'], problemsSolved: ['Turned ambiguity into a usable flow'], peopleHelped: ['One colleague'], usefulQualities: ['Synthesis'], knowledge: ['Decision design'], relationships: ['Practitioner peer'], pointsOfView: ['Clarity must change action'], shareableMaterial: ['Anonymized case study'] }, supersedesProofId: 'proof-1', presentation: presentation(22) });
    map = commit(map, 'confirm-proof-inventory', { proofId: 'proof-2', proofRevision: 1, action: action(23) });
    expect(new Set(map.invalidations.map((item) => item.targetKind))).toEqual(new Set(['side-door-set', 'route-outcome']));
    expect(map.reflections).toHaveLength(1);
  });

  it('preserves history and marks the full downstream closure when Why changes', () => {
    let map = withCompletedLearningLoop('commit-provisionally');
    map = commit(map, 'record-peer-exposure', { exposure: { id: 'peer-1', revision: 1, subjectKind: 'real-person', subject: 'A working practitioner', insight: 'The work involves repeated facilitation under ambiguity' }, presentation: presentation(12) });
    map = commit(map, 'confirm-peer-exposure', { exposureId: 'peer-1', exposureRevision: 1, action: action(13) });
    map = commit(map, 'complete-provisional-commitment', { id: 'commitment-1', revision: 1, intentId: map.commitmentIntent!.id, action: action(14) });
    map = commit(map, 'propose-proof-inventory', { proof: { id: 'proof-1', revision: 1, artifacts: ['Prototype'], problemsSolved: ['Decision friction'], peopleHelped: ['Colleague'], usefulQualities: ['Synthesis'], knowledge: ['Decision design'], relationships: ['Practitioner'], pointsOfView: ['Action over abstraction'], shareableMaterial: ['Case note'] }, presentation: presentation(15) });
    map = commit(map, 'confirm-proof-inventory', { proofId: 'proof-1', proofRevision: 1, action: action(16) });
    map = commit(map, 'propose-side-doors', { setId: 'doors-1', setRevision: 1, doors: doors(), presentation: presentation(17) });
    map = commit(map, 'select-side-door', { setId: 'doors-1', setRevision: 1, doorId: 'door-1', doorRevision: 1, action: action(18) });
    map = commit(map, 'record-route-outcome', { id: 'outcome-1', revision: 1, doorId: 'door-1', doorRevision: 1, result: 'positive-response', learning: 'The contribution opened a useful conversation', action: action(19) });
    const evidenceBefore = map.reflections;

    map = commit(map, 'revise-why', { why: { id: 'why-2', revision: 1, statement: 'I work to help small groups act on difficult choices.', serves: 'Small groups facing consequential choices', pointOfView: 'Shared clarity should unlock an owned next move' }, supersedesWhyId: 'why-1', presentation: presentation(20) });
    map = commit(map, 'confirm-why', { whyId: 'why-2', whyRevision: 1, action: action(21) });

    expect(map.reflections).toEqual(evidenceBefore);
    expect(new Set(map.invalidations.filter((item) => item.status === 'pending').map((item) => item.targetKind))).toEqual(
      new Set(['path-set', 'project', 'reflection', 'next-move', 'peer-exposure', 'commitment', 'proof', 'side-door-set', 'route-outcome']),
    );
    expect(careerMapSchema.safeParse(map).success).toBe(true);
  });

  it('does not invalidate active work for a parked sibling revision but does for an active-path revision', () => {
    let map = withAcceptedProject();
    map = commit(map, 'replace-purpose-path', {
      sourceSetId: 'paths-1', sourceSetRevision: 1, replacedPathId: 'path-1',
      replacementSetId: 'paths-2', replacementSetRevision: 1,
      replacement: { ...paths('parked-revision')[0], id: 'path-1', revision: 2 }, presentation: presentation(7),
    });
    map = commit(map, 'confirm-purpose-path-revision', { setId: 'paths-2', setRevision: 1, pathId: 'path-2', pathRevision: 1, action: action(8) });
    expect(map.invalidations).toHaveLength(0);

    map = commit(map, 'replace-purpose-path', {
      sourceSetId: 'paths-2', sourceSetRevision: 1, replacedPathId: 'path-2',
      replacementSetId: 'paths-3', replacementSetRevision: 1,
      replacement: { ...paths('active-revision')[1], id: 'path-2', revision: 2 }, presentation: presentation(9),
    });
    map = commit(map, 'confirm-purpose-path-revision', { setId: 'paths-3', setRevision: 1, pathId: 'path-2', pathRevision: 2, action: action(10) });
    expect(map.invalidations.some((item) => item.targetKind === 'project' && item.targetId === 'project-1')).toBe(true);
    expect(map.invalidations.every((item) => item.basisRevision > 0 && item.targetRevision > 0)).toBe(true);
  });

  it('revises a closed learning snapshot by lineage and invalidates its dependent decision without overwriting evidence', () => {
    const original = withCompletedLearningLoop('explore-further');
    const priorReflection = structuredClone(original.reflections[0]);
    const revised = applyCareerMapOperation(original, operation(original, 'revise-reflection-evidence', {
      reflectionId: 'reflection-1',
      reflectionRevision: 1,
      newReflectionRevision: 2,
      supersedesEvidenceId: 'learning-1',
      evidence: {
        id: 'learning-2', revision: 1,
        observation: 'After a day, the pull was toward the problem rather than the interface.',
        signal: 'desire-to-continue', interpretation: 'The next project should test the problem in another medium',
        provenance: { ...action(12), kind: 'user-message' }, supersedesEvidenceId: 'learning-1',
      },
    }));
    expect(revised.status).toBe('committed');
    expect(revised.map.reflections.find((item) => item.revision === 1)).toEqual(priorReflection);
    expect(revised.map.reflections.find((item) => item.revision === 2)?.evidence).toHaveLength(2);
    expect(new Set(revised.map.invalidations.map((item) => item.targetKind))).toEqual(new Set(['reflection', 'next-move']));
  });

  it('does not retain provider research metadata in canonical records', () => {
    let map = withConfirmedWhy();
    const researchMetadata = [{
      kind: 'cited-research',
      sourceHandle: 'source-1',
      providerResultId: 'result-1',
      url: 'https://example.com/practice',
      retrievedAt: at(3),
      title: 'A practitioner account',
      excerpt: 'A bounded excerpt associated with this claim.',
      support: 'server-validated',
    }];
    const candidates = paths().map((candidate, index) => (
      index === 0 ? { ...candidate, sources: researchMetadata } : candidate
    )) as never;
    const result = applyCareerMapOperation(map, {
      type: 'propose-purpose-paths',
      sourceId: 'paths-with-provider-metadata',
      expectedRevision: map.revision,
      occurredAt: at(3),
      payload: {
        setId: 'paths-with-provider-metadata',
        setRevision: 1,
        paths: candidates,
        presentation: presentation(3),
      },
    });
    expect(result.status).toBe('rejected');
    expect(result.map).toEqual(map);
  });
});

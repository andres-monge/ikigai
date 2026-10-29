import { describe, expect, it } from 'vitest';
import legacyCommitment from './test-fixtures/legacy-commitment-v2.json';
import { readCareerMap } from './model';
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
const framingText = "The point of a project is not to succeed, it's to learn if it's something you'd want to pursue. Think of projects like dating: you start with something chill and low commitment, then invest more only if each date makes you want another.";
const acceptancePhrase = 'I explicitly accept this Path Project.';
const acceptanceQuestion = `Will you explicitly accept this Path Project by replying “${acceptancePhrase}”?`;

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

const framing = (projectId: string, sequence: number) => ({
  projectId, projectRevision: 1, locale: 'en', framingText, acceptancePhrase,
  acceptanceQuestion, moduleVersion: '1.1.1', presentation: presentation(sequence),
});

const delivery = (projectId: string, sequence: number) => ({
  projectId, projectRevision: 1, assistantText: `${framingText}\n\n${acceptanceQuestion}`,
  presentation: presentation(sequence),
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
  const loaded = readCareerMap(JSON.parse(JSON.stringify(result.map)));
  expect(loaded).toEqual(result.map);
  expect(loaded.explorerId).toBe(map.explorerId);
  expect(loaded.revision).toBe(map.revision + 1);
  expect(loaded.operationHistory).toEqual(result.map.operationHistory);
  expect(deriveMethodCheckpoint(loaded)).toEqual(deriveMethodCheckpoint(result.map));
  return loaded;
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
  map = commit(map, 'present-first-project-framing', framing('project-1', 6));
  map = commit(map, 'deliver-first-project-framing', delivery('project-1', 6));
  return commit(map, 'accept-first-project', { projectId: 'project-1', projectRevision: 1, action: action(7) });
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

  it('accepts new cards without possibility and preserves legacy siblings on replacement', () => {
    const withoutPossibility = ({ possibility: _legacy, ...path }: PurposePathInput) => path;
    const newPaths = paths().map(withoutPossibility) as [PurposePathInput, PurposePathInput, PurposePathInput];
    const proposed = applyCareerMapOperation(withConfirmedWhy(), operation(withConfirmedWhy(), 'propose-purpose-paths', {
      setId: 'new-paths', setRevision: 1, paths: newPaths, presentation: presentation(3),
    }));
    expect(proposed.status).toBe('committed');
    expect(proposed.map.pathSets.at(-1)?.paths.every((path) => !('possibility' in path))).toBe(true);
    expect(careerMapSchema.safeParse(proposed.map).success).toBe(true);

    let legacy = commit(withConfirmedWhy(), 'propose-purpose-paths', {
      setId: 'paths-1', setRevision: 1, paths: paths(), presentation: presentation(3),
    });
    const originalSet = structuredClone(legacy.pathSets[0]);
    legacy = commit(legacy, 'replace-purpose-path', {
      sourceSetId: 'paths-1', sourceSetRevision: 1, replacedPathId: 'path-1',
      replacementSetId: 'paths-2', replacementSetRevision: 1,
      replacement: { ...withoutPossibility(paths()[0]), id: 'path-4' }, presentation: presentation(4),
    });
    expect(legacy.pathSets[0]).toEqual({ ...originalSet, status: 'superseded' });
    expect(legacy.pathSets[1].paths.slice(1)).toEqual(originalSet.paths.slice(1));
    expect(legacy.pathSets[1].supersedesSetId).toBe('paths-1');
    expect(legacy.pathSets[1].paths[0]).not.toHaveProperty('possibility');
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

  it('rejects a second Purpose Path set presented in the same assistant turn', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'propose-purpose-paths', {
      setId: 'paths-1', setRevision: 1, paths: paths(), presentation: presentation(3),
    });
    map = commit(map, 'replace-purpose-path', {
      sourceSetId: 'paths-1', sourceSetRevision: 1, replacedPathId: 'path-1',
      replacementSetId: 'paths-2', replacementSetRevision: 1,
      replacement: { ...paths('replacement')[0], id: 'path-4' }, presentation: presentation(4),
    });

    const second = applyCareerMapOperation(map, operation(map, 'replace-purpose-path', {
      sourceSetId: 'paths-2', sourceSetRevision: 1, replacedPathId: 'path-2',
      replacementSetId: 'paths-3', replacementSetRevision: 1,
      replacement: { ...paths('replacement')[1], id: 'path-5' }, presentation: presentation(4),
    }));

    expect(second.status).toBe('rejected');
    if (second.status !== 'rejected') throw new Error('Second same-turn set unexpectedly committed.');
    expect(second.error.code).toBe('illegal-transition');
    expect(second.map).toEqual(map);
    expect(second.map.pathSets).toHaveLength(2);

    const combined = applyCareerMapOperation(map, operation(map, 'combine-purpose-paths', {
      sourceSetId: 'paths-2', sourceSetRevision: 1, combinedPathIds: ['path-4', 'path-2'],
      replacementSetId: 'paths-3', replacementSetRevision: 1,
      paths: [paths('combined')[0], paths('combined')[1], paths()[2]],
      presentation: presentation(4),
    }));
    expect(combined.status).toBe('rejected');
    if (combined.status !== 'rejected') throw new Error('Same-turn combination unexpectedly committed.');
    expect(combined.error.code).toBe('illegal-transition');
    expect(combined.map).toEqual(map);
  });

  it('saves the founder’s RL/alignment and AI-art/TouchDesigner revisions together while preserving path two', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'propose-purpose-paths', {
      setId: 'paths-1', setRevision: 1, paths: paths(), presentation: presentation(3),
    });
    const original = map;
    const preserved = map.pathSets[0].paths[1];
    const revisedPaths: [PurposePathInput, PurposePathInput, PurposePathInput] = [
      { ...paths('revised')[0], id: 'path-4', name: 'Explore RL and alignment' },
      paths()[1],
      { ...paths('revised')[2], id: 'path-5', name: 'Create AI art with TouchDesigner' },
    ];

    const intermediate = commit(original, 'replace-purpose-path', {
      sourceSetId: 'paths-1', sourceSetRevision: 1, replacedPathId: 'path-1',
      replacementSetId: 'paths-intermediate', replacementSetRevision: 1,
      replacement: revisedPaths[0], presentation: presentation(4),
    });
    const secondWrite = applyCareerMapOperation(intermediate, operation(intermediate, 'replace-purpose-path', {
      sourceSetId: 'paths-intermediate', sourceSetRevision: 1, replacedPathId: 'path-3',
      replacementSetId: 'paths-2', replacementSetRevision: 1,
      replacement: revisedPaths[2], presentation: presentation(4),
    }));
    expect(secondWrite.status).toBe('rejected');
    expect(secondWrite.map).toEqual(intermediate);
    expect(secondWrite.map.pathSets).toHaveLength(2);

    const revisionOperation = operation(map, 'revise-purpose-paths', {
      sourceSetId: 'paths-1', sourceSetRevision: 1,
      replacementSetId: 'paths-2', replacementSetRevision: 1,
      paths: revisedPaths, presentation: presentation(4),
    });
    const revisionResult = applyCareerMapOperation(map, revisionOperation);
    expect(revisionResult.status).toBe('committed');
    map = revisionResult.map;

    const replayedRevision = applyCareerMapOperation(map, revisionOperation);
    expect(replayedRevision.status).toBe('replayed');
    expect(replayedRevision.map).toEqual(map);
    const reusedSource = applyCareerMapOperation(original, {
      ...revisionOperation, sourceId: original.operationHistory.at(-1)!.sourceId,
    });
    expect(reusedSource.status).toBe('rejected');
    if (reusedSource.status === 'rejected') expect(reusedSource.error.code).toBe('source-id-reused');
    expect(reusedSource.map).toEqual(original);

    expect(map.pathSets).toHaveLength(2);
    expect(map.pathSets[0].status).toBe('superseded');
    expect(map.pathSets[1]).toMatchObject({
      status: 'suggested', changeKind: 'revision', supersedesSetId: 'paths-1',
      paths: [{ id: 'path-4', name: 'Explore RL and alignment' }, { id: preserved.id, revision: preserved.revision }, { id: 'path-5', name: 'Create AI art with TouchDesigner' }],
    });
    expect(map.pathSets[1].paths[1]).toEqual(preserved);
    expect(deriveMethodCheckpoint(map).pendingDecision?.targetId).toBe('paths-2');

    const duplicate = applyCareerMapOperation(map, operation(map, 'replace-purpose-path', {
      sourceSetId: 'paths-2', sourceSetRevision: 1, replacedPathId: 'path-4',
      replacementSetId: 'paths-3', replacementSetRevision: 1,
      replacement: { ...paths('extra')[0], id: 'path-6' }, presentation: presentation(4),
    }));
    expect(duplicate.status).toBe('rejected');
    expect(duplicate.map).toEqual(map);
  });

  it('does not count a new path identity or revision as a second substantive change', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'propose-purpose-paths', {
      setId: 'paths-1', setRevision: 1, paths: paths(), presentation: presentation(3),
    });

    const revised = applyCareerMapOperation(map, operation(map, 'revise-purpose-paths', {
      sourceSetId: 'paths-1', sourceSetRevision: 1,
      replacementSetId: 'paths-2', replacementSetRevision: 1,
      paths: [
        { ...paths()[0], id: 'path-4', name: 'Make research useful' },
        { ...paths()[1], id: 'path-5', revision: 2 },
        paths()[2],
      ],
      presentation: presentation(4),
    }));

    expect(revised.status).toBe('rejected');
    if (revised.status === 'rejected') {
      expect(revised.error.message).toBe('A full-set revision must change at least two Purpose Paths.');
    }
    expect(revised.map).toEqual(map);
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

  it('registers natural framing in the exact proposal turn while retaining completed prior-turn acceptance', () => {
    let map = withSelectedPath();
    map = commit(map, 'propose-first-project', { project: project(), presentation: presentation(5) });
    const natural = {
      projectId: 'project-1', projectRevision: 1, locale: 'en', framingFormat: 'natural-v1' as const,
      framingText: 'Start small and notice what you learn.', moduleVersion: '1.3.0', presentation: presentation(5),
    };
    const wrongIdentity = applyCareerMapOperation(map, operation(map, 'present-first-project-framing', {
      ...natural, presentation: { ...presentation(5), assistantTurnId: 'another-assistant' },
    }));
    expect(wrongIdentity).toMatchObject({ status: 'rejected', error: { code: 'confirmation-not-auditable' } });
    const earlier = applyCareerMapOperation(map, operation(map, 'present-first-project-framing', {
      ...natural, presentation: presentation(4),
    }));
    expect(earlier).toMatchObject({ status: 'rejected', error: { code: 'confirmation-not-auditable' } });
    const legacySameTurn = applyCareerMapOperation(map, operation(map, 'present-first-project-framing', framing('project-1', 5)));
    expect(legacySameTurn).toMatchObject({ status: 'rejected', error: { code: 'confirmation-not-auditable' } });
    map = commit(map, 'present-first-project-framing', natural);
    const undelivered = applyCareerMapOperation(map, operation(map, 'accept-first-project', {
      projectId: 'project-1', projectRevision: 1, action: action(6),
    }));
    expect(undelivered.status).toBe('rejected');
    map = commit(map, 'deliver-first-project-framing', {
      projectId: 'project-1', projectRevision: 1,
      assistantText: `A small project to try.\n\n${natural.framingText}`, presentation: presentation(5),
    });
    const sameTurn = applyCareerMapOperation(map, operation(map, 'accept-first-project', {
      projectId: 'project-1', projectRevision: 1, action: action(5),
    }));
    expect(sameTurn).toMatchObject({ status: 'rejected', error: { code: 'confirmation-not-auditable' } });
    map = commit(map, 'accept-first-project', { projectId: 'project-1', projectRevision: 1, action: action(6) });
    expect(map.projects.at(-1)?.confirmation?.presentedInTurnId).toBe('assistant-5');
  });

  it('records the first-project framing once and requires a later acceptance against it', () => {
    let map = withSelectedPath();
    map = commit(map, 'propose-first-project', { project: project(), presentation: presentation(5) });

    const beforeFraming = applyCareerMapOperation(map, operation(map, 'accept-first-project', {
      projectId: 'project-1', projectRevision: 1, action: action(6),
    }));
    expect(beforeFraming.status).toBe('rejected');

    map = commit(map, 'present-first-project-framing', framing('project-1', 6));
    const repeated = applyCareerMapOperation(map, operation(map, 'present-first-project-framing', {
      ...framing('project-1', 7),
    }));
    expect(repeated.status).toBe('rejected');

    const sameTurn = applyCareerMapOperation(map, operation(map, 'accept-first-project', {
      projectId: 'project-1', projectRevision: 1, action: action(6),
    }));
    expect(sameTurn.status).toBe('rejected');

    map = commit(map, 'deliver-first-project-framing', delivery('project-1', 6));
    map = commit(map, 'accept-first-project', {
      projectId: 'project-1', projectRevision: 1, action: action(7),
    });
    expect(map.projects.at(-1)?.confirmation?.presentedInTurnId).toBe('assistant-6');
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

  it('enforces Next Move branches and saves peer-free focus inside the loop', () => {
    expect(withCompletedLearningLoop('return-to-paths').nextMoves.at(-1)?.kind).toBe('return-to-paths');
    const map = withCompletedLearningLoop('commit-provisionally');
    expect(map.commitmentIntent).toBeUndefined();
    expect(map.provisionalCommitment).toBeUndefined();
    expect(map.pathFocusCommitments).toHaveLength(1);
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('request-new-project');
  });

  it('invalidates commitment and later state when its confirmed peer-insight basis is revised', () => {
    let map = readCareerMap(legacyCommitment);
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
    map = commit(map, 'present-first-project-framing', framing('project-2', 7));
    map = commit(map, 'deliver-first-project-framing', delivery('project-2', 7));
    map = commit(map, 'accept-first-project', { projectId: 'project-2', projectRevision: 1, action: action(8) });

    map = commit(map, 'open-reflection', { reflectionId: 'reflection-1', revision: 1, projectId: 'project-2', projectRevision: 1, action: action(8) });
    map = commit(map, 'append-reflection-evidence', { reflectionId: 'reflection-1', reflectionRevision: 1, evidence: { id: 'e-1', revision: 1, observation: 'I wanted another iteration.', signal: 'desire-to-continue', interpretation: 'More evidence is useful', provenance: action(9) } });
    map = commit(map, 'close-reflection', { reflectionId: 'reflection-1', reflectionRevision: 1, action: action(10) });
    map = commit(map, 'record-continue-choice', { id: 'continue-1', revision: 1, reflectionId: 'reflection-1', reflectionRevision: 1, wantsToContinue: true, action: action(11) });
    map = commit(map, 'record-next-move', { id: 'move-1', revision: 1, continueChoiceId: 'continue-1', continueChoiceRevision: 1, kind: 'explore-further', action: action(12) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({
      module: 'design-path-project',
      availableOperations: expect.arrayContaining(['propose-follow-on-projects']),
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
      availableOperations: expect.arrayContaining(['propose-follow-on-projects']),
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

  it('recovers a fresh three-option decision after abandoning Foundation reconsideration on a new path', () => {
    let map = withCompletedLearningLoop('return-to-paths');
    map = commit(map, 'choose-parked-purpose-path', {
      sourceSetId: 'paths-1', sourceSetRevision: 1, replacementSetId: 'paths-2', replacementSetRevision: 1,
      pathId: 'path-1', pathRevision: 1, action: action(12),
    });
    for (const [index, review] of map.invalidations.entries()) {
      map = commit(map, 'resolve-basis-review', { targetKind: review.targetKind, targetId: review.targetId, targetRevision: review.targetRevision, resolution: 'reaffirmed', action: action(13 + index) });
    }
    const savedLearning = { projects: map.projects, reflections: map.reflections, choices: map.continueChoices, moves: map.nextMoves };
    map = commit(map, 'propose-follow-on-projects', {
      setId: 'abandoned-options', setRevision: 1,
      projects: [project('abandoned-1'), project('abandoned-2'), project('abandoned-3')], presentation: presentation(16),
    });
    const abandoned = map.projectOptionSets.at(-1)!;
    map = commit(map, 'open-foundation-revision-focus', { reason: 'Reconsider my contribution', action: action(17) });
    map = commit(map, 'close-focus', { action: action(18) });
    expect(map.projectOptionSets.at(-1)).toEqual({ ...abandoned, status: 'superseded' });
    expect({ projects: map.projects, reflections: map.reflections, choices: map.continueChoices, moves: map.nextMoves }).toEqual(savedLearning);
    const resumed = deriveMethodCheckpoint(map);
    expect(resumed.availableOperations).not.toContain('propose-first-project');
    expect(resumed.availableOperations).not.toContain('propose-follow-on-projects');
    expect(resumed.availableOperations).toContain('request-new-project');
    map = commit(map, 'request-new-project', { action: action(19) });
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('propose-follow-on-projects');
    map = commit(map, 'propose-follow-on-projects', {
      setId: 'fresh-options', setRevision: 1,
      projects: [project('fresh-1'), project('fresh-2'), project('fresh-3')], presentation: presentation(20),
    });
    expect(map.projectOptionSets.at(-1)?.projects).toHaveLength(3);
    expect(map.projectOptionSets.at(-1)?.basisAction?.sourceId).not.toBe(abandoned.basisAction?.sourceId);
    expect(map.projectOptionSets[0]).toEqual({ ...abandoned, status: 'superseded' });
  });

  it('keeps abandoned options historical after directly leaving and returning to a parked path', () => {
    let map = withCompletedLearningLoop('return-to-paths');
    map = commit(map, 'choose-parked-purpose-path', {
      sourceSetId: 'paths-1', sourceSetRevision: 1, replacementSetId: 'paths-2', replacementSetRevision: 1,
      pathId: 'path-1', pathRevision: 1, action: action(12),
    });
    for (const [index, review] of map.invalidations.entries()) {
      map = commit(map, 'resolve-basis-review', { targetKind: review.targetKind, targetId: review.targetId, targetRevision: review.targetRevision, resolution: 'reaffirmed', action: action(13 + index) });
    }
    const savedProject = map.projects[0];
    map = commit(map, 'propose-follow-on-projects', {
      setId: 'options-a', setRevision: 1,
      projects: [project('a-1'), project('a-2'), project('a-3')], presentation: presentation(16),
    });
    const abandoned = map.projectOptionSets.at(-1)!;
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('choose-parked-purpose-path');
    map = commit(map, 'choose-parked-purpose-path', {
      sourceSetId: 'paths-2', sourceSetRevision: 1, replacementSetId: 'paths-3', replacementSetRevision: 1,
      pathId: 'path-3', pathRevision: 1, action: action(17),
    });
    expect(map.projectOptionSets[0]).toEqual({ ...abandoned, status: 'superseded' });
    map = commit(map, 'choose-parked-purpose-path', {
      sourceSetId: 'paths-3', sourceSetRevision: 1, replacementSetId: 'paths-4', replacementSetRevision: 1,
      pathId: 'path-1', pathRevision: 1, action: action(18),
    });
    expect(deriveMethodCheckpoint(map).pendingDecision).toBeNull();
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('propose-follow-on-projects');
    map = commit(map, 'propose-follow-on-projects', {
      setId: 'fresh-options-a', setRevision: 1,
      projects: [project('fresh-a-1'), project('fresh-a-2'), project('fresh-a-3')], presentation: presentation(19),
    });
    expect(map.projects[0]).toEqual(savedProject);
    expect(map.projectOptionSets[0]).toEqual({ ...abandoned, status: 'superseded' });
    expect(map.projectOptionSets.at(-1)?.projects).toHaveLength(3);
    expect(map.projectOptionSets.at(-1)?.basisAction?.sourceId).not.toBe(abandoned.basisAction?.sourceId);
  });

  it('selects one Side Door and parks two atomically while keeping route evidence separate', () => {
    let map = readCareerMap(legacyCommitment);
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
    let map = readCareerMap(legacyCommitment);
    map = commit(map, 'propose-proof-inventory', { proof: { id: 'proof-1', revision: 1, artifacts: ['Prototype'], problemsSolved: ['Decision friction'], peopleHelped: ['Colleague'], usefulQualities: ['Synthesis'], knowledge: ['Decision design'], relationships: ['Practitioner'], pointsOfView: ['Action over abstraction'], shareableMaterial: ['Case note'] }, presentation: presentation(15) });
    map = commit(map, 'confirm-proof-inventory', { proofId: 'proof-1', proofRevision: 1, action: action(16) });
    map = commit(map, 'propose-side-doors', { setId: 'doors-1', setRevision: 1, doors: doors(), presentation: presentation(17) });
    map = commit(map, 'select-side-door', { setId: 'doors-1', setRevision: 1, doorId: 'door-1', doorRevision: 1, action: action(18) });
    map = commit(map, 'record-route-outcome', { id: 'outcome-1', revision: 1, doorId: 'door-1', doorRevision: 1, result: 'positive-response', learning: 'The contribution opened a useful conversation', action: action(19) });
    const evidenceBefore = structuredClone(map.reflections);
    const deferredBefore = structuredClone({
      peerExposures: map.peerExposures, commitmentIntent: map.commitmentIntent,
      provisionalCommitment: map.provisionalCommitment, proofRevisions: map.proofRevisions,
      sideDoorSets: map.sideDoorSets, routeOutcomes: map.routeOutcomes,
    });

    const revise = operation(map, 'revise-why', {
      why: { id: 'why-2', revision: 1, statement: 'I work to help small groups act on difficult choices.', serves: 'Small groups facing consequential choices', pointOfView: 'Shared clarity should unlock an owned next move' },
      supersedesWhyId: 'why-1', presentation: presentation(20),
    }, 'revise-why-deepest');
    const revised = applyCareerMapOperation(map, revise);
    expect(revised.status).toBe('committed');
    if (revised.status !== 'committed') throw new Error('Deep Why revision fixture failed.');
    expect(revised.effects?.invalidatedArtifactClasses).toEqual([
      'path-set', 'project', 'reflection', 'next-move', 'peer-exposure',
      'commitment', 'proof', 'side-door-set', 'route-outcome',
    ]);
    const replayed = applyCareerMapOperation(revised.map, revise);
    expect(replayed.status).toBe('replayed');
    if (replayed.status !== 'replayed') throw new Error('Deep Why revision replay fixture failed.');
    expect(replayed.effects).toEqual(revised.effects);
    expect(replayed.map).toEqual(revised.map);
    map = readCareerMap(JSON.parse(JSON.stringify(replayed.map)));
    expect(map).toEqual(replayed.map);
    expect(map.operationHistory).toEqual(replayed.map.operationHistory);
    expect(deriveMethodCheckpoint(map)).toEqual(deriveMethodCheckpoint(replayed.map));
    expect(deriveMethodCheckpoint(map).pendingDecision?.kind).toBe('why-confirmation');
    map = commit(map, 'confirm-why', { whyId: 'why-2', whyRevision: 1, action: action(21) });

    expect(map.reflections).toEqual(evidenceBefore);
    expect(new Set(map.invalidations.filter((item) => item.status === 'pending').map((item) => item.targetKind))).toEqual(
      new Set(['path-set', 'project', 'reflection', 'next-move', 'peer-exposure', 'commitment', 'proof', 'side-door-set', 'route-outcome']),
    );
    expect(careerMapSchema.safeParse(map).success).toBe(true);
    let sequence = 22;
    const activeReviews: string[] = [];
    while (deriveMethodCheckpoint(map).review) {
      const review = deriveMethodCheckpoint(map).review!;
      activeReviews.push(review.targetKind);
      const loaded = readCareerMap(JSON.parse(JSON.stringify(map)));
      expect(loaded).toEqual(map);
      expect(deriveMethodCheckpoint(loaded)).toEqual(deriveMethodCheckpoint(map));
      map = commit(loaded, 'resolve-basis-review', {
        targetKind: review.targetKind, targetId: review.targetId, targetRevision: review.targetRevision,
        resolution: 'replaced', action: action(sequence++),
      });
    }
    expect(activeReviews).toEqual(['path-set', 'project', 'reflection', 'next-move']);
    expect(new Set(map.invalidations.filter(item => item.status === 'pending').map(item => item.targetKind))).toEqual(new Set([
      'peer-exposure', 'commitment', 'proof', 'side-door-set', 'route-outcome',
    ]));
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('propose-purpose-paths');
    const newPaths = paths().map(path => ({ ...path, id: `new-${path.id}` })) as ReturnType<typeof paths>;
    map = commit(map, 'propose-purpose-paths', { setId: 'paths-new', setRevision: 1, paths: newPaths, presentation: presentation(sequence++) });
    map = readCareerMap(JSON.parse(JSON.stringify(map)));
    map = commit(map, 'select-purpose-path', { setId: 'paths-new', setRevision: 1, pathId: 'new-path-2', pathRevision: 1, action: action(sequence++) });
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('propose-follow-on-projects');
    map = commit(map, 'propose-follow-on-projects', {
      setId: 'projects-new', setRevision: 1,
      projects: [project('project-new-1'), project('project-new-2'), project('project-new-3')],
      presentation: presentation(sequence++),
    });
    const pending = structuredClone(map);
    map = readCareerMap(JSON.parse(JSON.stringify(map)));
    expect(map).toEqual(pending);
    map = commit(map, 'select-follow-on-project', { setId: 'projects-new', setRevision: 1, projectId: 'project-new-2', projectRevision: 1, action: action(sequence++) });
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');
    expect(map.projects.at(-1)?.basisPath).toEqual({ id: 'new-path-2', revision: 1 });
    expect(map.reflections).toEqual(evidenceBefore);
    expect({
      peerExposures: map.peerExposures, commitmentIntent: map.commitmentIntent,
      provisionalCommitment: map.provisionalCommitment, proofRevisions: map.proofRevisions,
      sideDoorSets: map.sideDoorSets, routeOutcomes: map.routeOutcomes,
    }).toEqual(deferredBefore);
    expect(readCareerMap(JSON.parse(JSON.stringify(map)))).toEqual(map);
  });

  it('derives exact Why-revision invalidation classes before confirmation without storing a preview', () => {
    const map = withConfirmedWhy();
    const revise = operation(map, 'revise-why', {
      why: { id: 'why-2', revision: 1, statement: 'I work to help small groups act on difficult choices.', serves: 'Small groups facing consequential choices', pointOfView: 'Shared clarity should unlock an owned next move' },
      supersedesWhyId: 'why-1', presentation: presentation(20),
    }, 'revise-why-zero');
    const revised = applyCareerMapOperation(map, revise);

    expect(revised.status).toBe('committed');
    if (revised.status !== 'committed') throw new Error('Why revision fixture failed.');
    expect(revised.effects).toEqual({ invalidatedArtifactClasses: [] });
    expect(revised.map.invalidations).toHaveLength(0);
    const replayed = applyCareerMapOperation(revised.map, revise);
    expect(replayed.status).toBe('replayed');
    if (replayed.status !== 'replayed') throw new Error('Why revision replay fixture failed.');
    expect(replayed.effects).toEqual({ invalidatedArtifactClasses: [] });
    expect(replayed.map).toEqual(revised.map);
  });

  it('derives and replays the exact shallow Why-revision invalidation class', () => {
    const map = withSelectedPath();
    const revise = operation(map, 'revise-why', {
      why: { id: 'why-2', revision: 1, statement: 'I work to help small groups act on difficult choices.', serves: 'Small groups facing consequential choices', pointOfView: 'Shared clarity should unlock an owned next move' },
      supersedesWhyId: 'why-1', presentation: presentation(20),
    }, 'revise-why-shallow');

    const revised = applyCareerMapOperation(map, revise);
    expect(revised.status).toBe('committed');
    if (revised.status !== 'committed') throw new Error('Shallow Why revision fixture failed.');
    expect(revised.effects).toEqual({ invalidatedArtifactClasses: ['path-set'] });
    expect(revised.map.invalidations).toHaveLength(0);

    const replayed = applyCareerMapOperation(revised.map, revise);
    expect(replayed.status).toBe('replayed');
    if (replayed.status !== 'replayed') throw new Error('Shallow Why revision replay fixture failed.');
    expect(replayed.effects).toEqual(revised.effects);
    expect(replayed.map).toEqual(revised.map);
  });

  it('replaces a path set based on the old North Star before offering fresh paths', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'propose-purpose-paths', {
      setId: 'paths-old', setRevision: 1, paths: paths(), presentation: presentation(3),
    });
    map = commit(map, 'revise-why', {
      why: { id: 'why-2', revision: 1, statement: 'Help future generations live with safer AI.', serves: 'Future generations', pointOfView: 'AI safety should protect their agency.' },
      supersedesWhyId: 'why-1', presentation: presentation(20),
    });
    map = commit(map, 'confirm-why', { whyId: 'why-2', whyRevision: 1, action: action(21) });
    expect(deriveMethodCheckpoint(map).review).toMatchObject({ targetKind: 'path-set', targetId: 'paths-old' });

    const staleReaffirmation = applyCareerMapOperation(map, operation(map, 'resolve-basis-review', {
      targetKind: 'path-set', targetId: 'paths-old', targetRevision: 1,
      resolution: 'reaffirmed', action: action(22),
    }));
    expect(staleReaffirmation.status).toBe('rejected');

    map = commit(map, 'resolve-basis-review', {
      targetKind: 'path-set', targetId: 'paths-old', targetRevision: 1,
      resolution: 'replaced', action: action(22),
    });
    expect(map.pathSets[0].status).toBe('superseded');
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('propose-purpose-paths');
    map = commit(map, 'propose-purpose-paths', {
      setId: 'paths-new', setRevision: 1, paths: paths('new'), presentation: presentation(23),
    });
    expect(map.pathSets.at(-1)?.basisWhy).toEqual({ id: 'why-2', revision: 1 });
    expect(map.pathSets.at(-1)?.status).toBe('suggested');
  });

  it('keeps Foundation reflection open until a later explorer turn', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'propose-purpose-paths', {
      setId: 'paths-original', setRevision: 1, paths: paths(), presentation: presentation(3),
    });
    map = commit(map, 'open-foundation-revision-focus', {
      reason: 'Reconsider who the work serves.', action: action(4),
    });

    const prematureClose = applyCareerMapOperation(map, operation(map, 'close-focus', { action: action(4) }));
    expect(prematureClose.status).toBe('rejected');
    expect(prematureClose.map.focus?.kind).toBe('foundation-revision');

    map = commit(map, 'close-focus', { action: action(5) });
    expect(map.focus).toBeUndefined();
    expect(deriveMethodCheckpoint(map).pendingDecision?.kind).toBe('path-selection');
  });

  it('rejects stale confirmation after a pending Why revision is superseded and accepts the later exact target', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'revise-why', {
      why: { id: 'why-2', revision: 1, statement: 'I help small groups move through difficult choices.', serves: 'Small groups facing consequential choices', pointOfView: 'Shared clarity should unlock an owned next move' },
      supersedesWhyId: 'why-1', presentation: presentation(20),
    });
    const staleExpectedRevision = operation(map, 'confirm-why', {
      whyId: 'why-2', whyRevision: 1, action: action(21),
    });

    map = commit(map, 'revise-why', {
      why: { id: 'why-3', revision: 1, statement: 'I help small groups own their next difficult move.', serves: 'Small groups facing consequential choices', pointOfView: 'Shared clarity should unlock an owned next move' },
      supersedesWhyId: 'why-1', presentation: presentation(21),
    });

    const conflicted = applyCareerMapOperation(map, staleExpectedRevision);
    expect(conflicted.status).toBe('rejected');
    if (conflicted.status !== 'rejected') throw new Error('Stale expected-revision fixture unexpectedly committed.');
    expect(conflicted.error.code).toBe('revision-conflict');

    const superseded = applyCareerMapOperation(map, operation(map, 'confirm-why', {
      whyId: 'why-2', whyRevision: 1, action: action(22),
    }));
    expect(superseded.status).toBe('rejected');
    if (superseded.status !== 'rejected') throw new Error('Superseded Why fixture unexpectedly committed.');
    expect(superseded.error.code).toBe('stale-target');

    const confirmed = applyCareerMapOperation(map, operation(map, 'confirm-why', {
      whyId: 'why-3', whyRevision: 1, action: action(22),
    }));
    expect(confirmed.status).toBe('committed');
    expect(confirmed.map.foundation.whyRevisions.find((why) => why.id === 'why-3')?.status).toBe('confirmed');
  });

  it('rejects dependent writes while a revised Why awaits confirmation', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'revise-why', {
      why: { id: 'why-2', revision: 1, statement: 'I work to help small groups act on difficult choices.', serves: 'Small groups facing consequential choices', pointOfView: 'Shared clarity should unlock an owned next move' },
      supersedesWhyId: 'why-1', presentation: presentation(20),
    });

    const dependent = applyCareerMapOperation(map, operation(map, 'propose-purpose-paths', {
      setId: 'blocked-paths', setRevision: 1, paths: paths('blocked'), presentation: presentation(21),
    }));

    expect(dependent.status).toBe('rejected');
    if (dependent.status !== 'rejected') throw new Error('Dependent-write guard fixture unexpectedly committed.');
    expect(dependent.error.code).toBe('illegal-transition');
    expect(dependent.map).toEqual(map);
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

describe('current project work reports and exact status corrections', () => {
  const suggested = () => commit(withSelectedPath(), 'propose-first-project', { project: project(), presentation: presentation(5) });
  const report = (map: CareerMap, status: 'in-progress' | 'stopped' | 'completed' = 'in-progress') => operation(map, 'report-project-work', {
    projectId: 'project-1', projectRevision: 1, status,
    reportedActivity: 'I arranged the first interview.', action: action(7),
  });
  const correction = (map: CareerMap, status: 'not-started' | 'in-progress' | 'stopped' | 'completed') => operation(map, 'correct-project-work-status', {
    projectId: 'project-1', projectRevision: 1,
    latestActionId: map.projects[0].workUpdates.at(-1)!.action.actionId,
    expectedStatus: map.projects[0].workStatus, status,
    reportedActivity: 'That status was mistaken.', action: action(9),
  });

  it.each(['in-progress', 'stopped', 'completed'] as const)('atomically records %s from a current report without fabricating consent or delivered framing', (status) => {
    const before = suggested();
    const op = report(before, status);
    const result = applyCareerMapOperation(before, op);
    expect(result.status).toBe('committed');
    expect(before.projects[0]).toMatchObject({ agreementStatus: 'suggested', workStatus: 'not-started', workUpdates: [] });
    expect(result.map.projects[0]).toMatchObject({ agreementStatus: 'accepted', workStatus: status,
      proceedingReport: { sourceId: op.sourceId, projectId: 'project-1', projectRevision: 1, action: action(7), reportedActivity: op.payload.reportedActivity },
      workUpdates: [{ status, action: action(7), reportedActivity: op.payload.reportedActivity, sourceId: op.sourceId }],
    });
    expect(result.map.projects[0].confirmation).toBeUndefined();
    expect(result.map.projects[0].acceptanceFraming).toBeUndefined();
    expect(deriveMethodCheckpoint(result.map).module).toBe('guide-path-project');
    expect(readCareerMap(JSON.parse(JSON.stringify(result.map)))).toEqual(result.map);
  });

  it('exposes current report but keeps assent unavailable until framing is delivered', () => {
    const map = suggested();
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('report-project-work');
    expect(deriveMethodCheckpoint(map).availableOperations).not.toContain('accept-first-project');
    expect(applyCareerMapOperation(map, operation(map, 'accept-first-project', { projectId:'project-1',projectRevision:1,action:action(7) })).status).toBe('rejected');
    expect(withAcceptedProject().projects[0]).toMatchObject({ agreementStatus:'accepted',workStatus:'not-started',workUpdates:[] });
  });

  it('binds report to exact active suggestion and rejects non-current or not-started reports without mutation', () => {
    const map = suggested();
    for (const delta of [{ projectRevision:2 }, { projectId:'missing' }, { status:'not-started' }, { action:action(5) }]) {
      const op = report(map);
      const result = applyCareerMapOperation(map, { ...op, payload:{ ...op.payload, ...delta } });
      expect(result.status).toBe('rejected');
      expect(result.map).toEqual(map);
    }
    for (const agreementStatus of ['parked','superseded'] as const) {
      const old = structuredClone(map); old.projects[0].agreementStatus = agreementStatus;
      expect(applyCareerMapOperation(old, report(old)).status).toBe('rejected');
    }
    const accepted = withAcceptedProject();
    const pendingRevision = commit(accepted, 'propose-project-revision', { projectId:'project-1',projectRevision:1,replacement:project('replacement',1),presentation:presentation(8) });
    const op = report(pendingRevision);
    expect(applyCareerMapOperation(pendingRevision, {...op,payload:{...op.payload,projectId:'replacement'}}).status).toBe('rejected');
  });

  it('keeps reports idempotent and rejects source reuse or forged proceeding receipt linkage', () => {
    const before = suggested(); const op = report(before);
    const committed = applyCareerMapOperation(before, op);
    expect(committed.status).toBe('committed');
    expect(applyCareerMapOperation(committed.map, op).status).toBe('replayed');
    expect(applyCareerMapOperation(committed.map, {...op,payload:{...op.payload,status:'completed'}})).toMatchObject({status:'rejected',error:{code:'source-id-reused'}});
    const forged = structuredClone(committed.map);
    forged.projects[0].proceedingReport!.sourceId = 'invented';
    expect(careerMapSchema.safeParse(forged).success).toBe(false);
    const wrongRevision = structuredClone(committed.map);
    wrongRevision.projects[0].proceedingReport!.projectRevision = 2;
    expect(careerMapSchema.safeParse(wrongRevision).success).toBe(false);
  });

  it('corrects completed explicitly and keeps the original report while rejecting stale correction targets', () => {
    const map = applyCareerMapOperation(suggested(), report(suggested(),'completed')).map;
    expect(applyCareerMapOperation(map, operation(map,'update-project-work-status',{projectId:'project-1',projectRevision:1,status:'in-progress',action:action(8)})).status).toBe('rejected');
    const op = correction(map,'in-progress');
    for (const delta of [{latestActionId:'other'}, {expectedStatus:'stopped'}]) {
      expect(applyCareerMapOperation(map,{...op,payload:{...op.payload,...delta}}).status).toBe('rejected');
    }
    const corrected = applyCareerMapOperation(map,op);
    expect(corrected.status).toBe('committed');
    expect(corrected.map.projects[0].workUpdates).toHaveLength(2);
    expect(corrected.map.projects[0].workUpdates[0]).toEqual(map.projects[0].workUpdates[0]);
    expect(corrected.map.projects[0].workUpdates[1]).toMatchObject({status:'in-progress',correctsActionId:action(7).actionId,action:action(9)});
    expect(corrected.map.projects[0].agreementStatus).toBe('accepted');
  });

  it('retracts the sole report-derived proceeding but preserves independent assent and historical reports', () => {
    const map = applyCareerMapOperation(suggested(),report(suggested())).map;
    expect(applyCareerMapOperation(map,operation(map,'update-project-work-status',{projectId:'project-1',projectRevision:1,status:'not-started',action:action(8)})).status).toBe('rejected');
    const result = applyCareerMapOperation(map,correction(map,'not-started'));
    expect(result.status).toBe('committed');
    expect(result.map.projects[0]).toMatchObject({agreementStatus:'suggested',workStatus:'not-started',proceedingReport:{retractedBy:action(9)}});
    expect(result.map.projects[0].workUpdates).toHaveLength(2);
    const accepted = commit(withAcceptedProject(),'update-project-work-status',{projectId:'project-1',projectRevision:1,status:'completed',action:action(8)});
    const corrected = applyCareerMapOperation(accepted,correction(accepted,'not-started'));
    expect(corrected.status).toBe('committed');
    expect(corrected.map.projects[0].agreementStatus).toBe('accepted');
    expect(corrected.map.projects[0].confirmation).toEqual(accepted.projects[0].confirmation);
  });

  it('cannot retract an older proceeding report by correcting a later independent work update', () => {
    let map = applyCareerMapOperation(suggested(),report(suggested())).map;
    map = commit(map,'update-project-work-status',{projectId:'project-1',projectRevision:1,status:'completed',reportedActivity:'I completed the interviews.',action:action(8)});
    const result=applyCareerMapOperation(map,correction(map,'not-started'));
    expect(result).toMatchObject({status:'rejected',error:{code:'illegal-transition'}});
    expect(result.map).toEqual(map);
    expect(result.map.projects[0].proceedingReport?.retractedBy).toBeUndefined();
    const first=applyCareerMapOperation(suggested(),report(suggested(),'completed')).map;
    const inProgress=applyCareerMapOperation(first,correction(first,'in-progress')).map;
    const correctedAgain=applyCareerMapOperation(inProgress,operation(inProgress,'correct-project-work-status',{projectId:'project-1',projectRevision:1,latestActionId:action(9).actionId,expectedStatus:'in-progress',status:'not-started',reportedActivity:'I had not actually begun it.',action:action(10)}));
    expect(correctedAgain.status).toBe('committed');
    expect(correctedAgain.map.projects[0].agreementStatus).toBe('suggested');
  });

  it('preserves a pending project revision when retracting its sole report-derived proceeding basis', () => {
    const started = applyCareerMapOperation(suggested(), report(suggested())).map;
    const map = commit(started, 'propose-project-revision', {
      projectId: 'project-1', projectRevision: 1,
      replacement: project('replacement', 1), presentation: presentation(8),
    });
    const checkpoint = deriveMethodCheckpoint(map);
    expect(checkpoint.pendingDecision?.kind).toBe('project-revision-confirmation');
    const result = applyCareerMapOperation(map, correction(map, 'not-started'));
    expect(result).toMatchObject({ status: 'rejected', error: { code: 'illegal-transition' } });
    expect(result.map).toEqual(map);
    expect(deriveMethodCheckpoint(result.map)).toEqual(checkpoint);
  });

  it('allows completion correction without retracting proceeding while a project revision is pending', () => {
    const completed = applyCareerMapOperation(suggested(), report(suggested(), 'completed')).map;
    const map = commit(completed, 'propose-project-revision', {
      projectId: 'project-1', projectRevision: 1,
      replacement: project('replacement', 1), presentation: presentation(8),
    });
    const result = applyCareerMapOperation(map, correction(map, 'in-progress'));
    expect(result.status).toBe('committed');
    expect(result.map.projects[0]).toMatchObject({ agreementStatus: 'accepted', workStatus: 'in-progress' });
    expect(result.map.projects[0].proceedingReport?.retractedBy).toBeUndefined();
    expect(deriveMethodCheckpoint(result.map).pendingDecision?.kind).toBe('project-revision-confirmation');
  });

  it('preserves reflection during a status correction and requires clarification before retracting its proceeding basis', () => {
    let map = applyCareerMapOperation(suggested(),report(suggested(),'completed')).map;
    map = commit(map,'open-reflection',{reflectionId:'report-reflection',revision:1,projectId:'project-1',projectRevision:1,action:action(8)});
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('correct-project-work-status');
    const blocked = applyCareerMapOperation(map,correction(map,'not-started'));
    expect(blocked).toMatchObject({status:'rejected',error:{code:'illegal-transition'}});
    expect(blocked.map).toEqual(map);
    const corrected = applyCareerMapOperation(map,correction(map,'in-progress'));
    expect(corrected.status).toBe('committed');
    expect(corrected.map.reflections).toEqual(map.reflections);
    expect(corrected.map.invalidations).toEqual(map.invalidations);
  });
});

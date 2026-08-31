import { describe, expect, it } from 'vitest';
import {
  applyCareerMapOperation,
  createCareerMap,
  deriveMethodCheckpoint,
  type CareerMap,
  type CareerMapOperation,
  type PurposePathInput,
} from './index';

const at = (n: number) => `2026-08-31T11:${String(n).padStart(2, '0')}:00.000Z`;
const presentation = (n: number) => ({ kind: 'model-presentation' as const, assistantTurnId: `a-${n}`, turnSequence: n, completed: true as const, presentedAt: at(n) });
const action = (n: number) => ({ kind: 'user-message' as const, actionId: `u-${n}`, turnId: `u-${n}`, turnSequence: n, occurredAt: at(n) });
const paths: [PurposePathInput, PurposePathInput, PurposePathInput] = [1, 2, 3].map((n) => ({
  id: `path-${n}`, revision: 1, name: `Path ${n}`, servesWhy: `Serve the Why through approach ${n}`,
  possibility: `Outcome ${n}`, evidence: [`Evidence ${n}`], centralUnknown: `Unknown ${n}`,
  projectPreview: `Project ${n}`, practicalFit: `Fit ${n}`,
})) as [PurposePathInput, PurposePathInput, PurposePathInput];

function op<T extends CareerMapOperation['type']>(map: CareerMap, type: T, payload: Extract<CareerMapOperation, { type: T }>['payload']): Extract<CareerMapOperation, { type: T }> {
  return { type, sourceId: `${type}-${map.revision + 1}`, expectedRevision: map.revision, occurredAt: at(map.revision + 1), payload } as Extract<CareerMapOperation, { type: T }>;
}

function commit<T extends CareerMapOperation['type']>(map: CareerMap, type: T, payload: Extract<CareerMapOperation, { type: T }>['payload']): CareerMap {
  const result = applyCareerMapOperation(map, op(map, type, payload));
  expect(result.status).toBe('committed');
  return result.map;
}

describe('Method checkpoint selector', () => {
  it('is total from the empty map through pending Why and path selection', () => {
    let map = createCareerMap('explorer-selector');
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'form-foundation', pendingDecision: null });

    map = commit(map, 'propose-why', { why: { id: 'why-1', revision: 1, statement: 'Make difficult choices actionable.', serves: 'People in transition', pointOfView: 'Clarity must change action' }, presentation: presentation(1) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'form-foundation', pendingDecision: { kind: 'why-confirmation' } });

    map = commit(map, 'confirm-why', { whyId: 'why-1', whyRevision: 1, action: action(2) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'create-purpose-paths', pendingDecision: null });

    map = commit(map, 'propose-purpose-paths', { setId: 'set-1', setRevision: 1, paths, presentation: presentation(3) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'create-purpose-paths', pendingDecision: { kind: 'path-selection' } });
  });

  it('applies KTD2 precedence: invalidation, focus, pending, peer guard, lifecycle', () => {
    let map = createCareerMap('explorer-selector');
    map = commit(map, 'propose-why', { why: { id: 'why-1', revision: 1, statement: 'Make difficult choices actionable.', serves: 'People in transition', pointOfView: 'Clarity must change action' }, presentation: presentation(1) });

    map = commit(map, 'open-peer-focus', { reason: 'Inspect the working environment', action: action(2) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'find-relevant-peers', focus: { kind: 'peers' } });

    map = commit(map, 'close-focus', { action: action(3) });
    expect(deriveMethodCheckpoint(map).pendingDecision?.kind).toBe('why-confirmation');

    map = commit(map, 'confirm-why', { whyId: 'why-1', whyRevision: 1, action: action(4) });
    map = commit(map, 'propose-purpose-paths', { setId: 'set-1', setRevision: 1, paths, presentation: presentation(5) });
    map = commit(map, 'select-purpose-path', { setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1, action: action(6) });
    map = commit(map, 'propose-first-project', { project: { id: 'project-1', revision: 1, title: 'Build an aid', outcome: 'One person uses it', audience: 'A real colleague', whyWanted: 'Reduce decision waste', learningGoal: 'Learn whether iteration pulls me in', firstVersion: 'One-page prototype', firstStep: 'Interview the colleague', decisionQuestion: 'Do I want another iteration?', evidenceCue: 'Notice voluntary pull' }, presentation: presentation(7) });
    map = commit(map, 'accept-first-project', { projectId: 'project-1', projectRevision: 1, action: action(8) });
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');

    map = commit(map, 'open-foundation-revision-focus', { reason: 'New firsthand evidence changed the Why', action: action(9) });
    expect(deriveMethodCheckpoint(map).module).toBe('form-foundation');
    map = commit(map, 'close-focus', { action: action(10) });
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');
  });

  it('recomputes after focus closes instead of restoring a stale checkpoint', () => {
    let map = createCareerMap('explorer-selector');
    map = commit(map, 'open-peer-focus', { reason: 'Look at real practice', action: action(1) });
    map = commit(map, 'propose-why', { why: { id: 'why-1', revision: 1, statement: 'Help people act on complexity.', serves: 'People facing complexity', pointOfView: 'Actionable clarity beats diagnosis' }, presentation: presentation(2) });
    map = commit(map, 'close-focus', { action: action(3) });

    const checkpoint = deriveMethodCheckpoint(map);
    expect(checkpoint.module).toBe('form-foundation');
    expect(checkpoint.pendingDecision?.kind).toBe('why-confirmation');
    expect(checkpoint.focus).toBeNull();
  });

  it('routes the earliest unresolved basis before an explicit focus', () => {
    const map = createCareerMap('explorer-selector');
    const invalid: CareerMap = {
      ...map,
      focus: { kind: 'peers', reason: 'Later interrupt', openedBy: action(3) },
      invalidations: [
        { id: 'review-project', basisKind: 'purpose-path', basisId: 'path-old', basisRevision: 1, targetKind: 'project', targetId: 'project-old', targetRevision: 1, createdAtRevision: 5, status: 'pending' },
        { id: 'review-path', basisKind: 'why', basisId: 'why-new', basisRevision: 2, targetKind: 'path-set', targetId: 'paths-old', targetRevision: 1, createdAtRevision: 5, status: 'pending' },
      ],
    };
    expect(deriveMethodCheckpoint(invalid)).toMatchObject({
      module: 'create-purpose-paths',
      review: { targetKind: 'path-set', targetId: 'paths-old' },
    });
  });

  it('derives peer guard, commitment, proof, and Side Door pending decisions from canonical records', () => {
    let map = createCareerMap('explorer-deep');
    map = commit(map, 'propose-why', { why: { id: 'why-1', revision: 1, statement: 'Make difficult choices actionable.', serves: 'People in transition', pointOfView: 'Clarity must change action' }, presentation: presentation(1) });
    map = commit(map, 'confirm-why', { whyId: 'why-1', whyRevision: 1, action: action(2) });
    map = commit(map, 'propose-purpose-paths', { setId: 'set-1', setRevision: 1, paths, presentation: presentation(3) });
    map = commit(map, 'select-purpose-path', { setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1, action: action(4) });
    map = commit(map, 'propose-first-project', { project: { id: 'project-1', revision: 1, title: 'Build a real aid', outcome: 'One colleague uses it', audience: 'A real colleague', whyWanted: 'Reduce decision waste', learningGoal: 'Learn whether iteration pulls me in', firstVersion: 'One-page prototype', firstStep: 'Interview the colleague', decisionQuestion: 'Do I want another iteration?', evidenceCue: 'Notice voluntary pull' }, presentation: presentation(5) });
    map = commit(map, 'accept-first-project', { projectId: 'project-1', projectRevision: 1, action: action(6) });
    map = commit(map, 'open-reflection', { reflectionId: 'reflection-1', revision: 1, projectId: 'project-1', projectRevision: 1, action: action(7) });
    map = commit(map, 'append-reflection-evidence', { reflectionId: 'reflection-1', reflectionRevision: 1, evidence: { id: 'evidence-1', revision: 1, observation: 'Iteration created voluntary pull.', signal: 'voluntary-pull', interpretation: 'The path deserves a provisional commitment test', provenance: action(8) } });
    map = commit(map, 'close-reflection', { reflectionId: 'reflection-1', reflectionRevision: 1, action: action(9) });
    map = commit(map, 'record-continue-choice', { id: 'continue-1', revision: 1, reflectionId: 'reflection-1', reflectionRevision: 1, wantsToContinue: true, action: action(10) });
    map = commit(map, 'record-next-move', { id: 'move-1', revision: 1, continueChoiceId: 'continue-1', continueChoiceRevision: 1, kind: 'commit-provisionally', action: action(11) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'find-relevant-peers', pendingDecision: null });

    map = commit(map, 'record-peer-exposure', { exposure: { id: 'peer-1', revision: 1, subjectKind: 'first-person-source', subject: 'Practitioner journal', insight: 'The environment rewards facilitation under ambiguity' }, presentation: presentation(12) });
    expect(deriveMethodCheckpoint(map).pendingDecision?.kind).toBe('peer-insight-confirmation');
    map = commit(map, 'confirm-peer-exposure', { exposureId: 'peer-1', exposureRevision: 1, action: action(13) });
    expect(deriveMethodCheckpoint(map).pendingDecision?.kind).toBe('commitment-completion');
    map = commit(map, 'complete-provisional-commitment', { id: 'commitment-1', revision: 1, intentId: map.commitmentIntent!.id, action: action(14) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'enter-side-doors', pendingDecision: null });

    map = commit(map, 'propose-proof-inventory', { proof: { id: 'proof-1', revision: 1, artifacts: ['Prototype'], problemsSolved: ['Decision friction'], peopleHelped: ['Colleague'], usefulQualities: ['Synthesis'], knowledge: ['Decision design'], relationships: ['Practitioner'], pointsOfView: ['Action over abstraction'], shareableMaterial: ['Case note'] }, presentation: presentation(15) });
    expect(deriveMethodCheckpoint(map).pendingDecision?.kind).toBe('proof-confirmation');
    map = commit(map, 'confirm-proof-inventory', { proofId: 'proof-1', proofRevision: 1, action: action(16) });
    map = commit(map, 'propose-side-doors', { setId: 'doors-1', setRevision: 1, doors: [1, 2, 3].map((n) => ({ id: `door-${n}`, revision: 1, name: `Door ${n}`, target: `Target ${n}`, proofValue: `Proof value ${n}`, contribution: `Contribution ${n}`, firstMove: `Move ${n}`, accessConstraints: [`Constraint ${n}`] })) as never, presentation: presentation(17) });
    expect(deriveMethodCheckpoint(map).pendingDecision?.kind).toBe('side-door-selection');
    map = commit(map, 'select-side-door', { setId: 'doors-1', setRevision: 1, doorId: 'door-2', doorRevision: 1, action: action(18) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'enter-side-doors', pendingDecision: null });
  });
});

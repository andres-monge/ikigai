import { describe, expect, it } from 'vitest';
import {
  applyCareerMapOperation,
  createCareerMap,
  deriveMethodCheckpoint,
  type CareerMap,
  type CareerMapOperation,
  type PurposePathInput,
} from './index';
import { hasCompletedLearningLoop, selectCurrentProjectLearning, selectCurrentPathFocus, selectCurrentPathSelectionSourceId, selectProjectDecisionBasis, selectEarliestActiveReview } from './selector';

const at = (n: number) => `2026-08-31T11:${String(n).padStart(2, '0')}:00.000Z`;
const presentation = (n: number) => ({ kind: 'model-presentation' as const, assistantTurnId: `a-${n}`, turnSequence: n, completed: true as const, presentedAt: at(n) });
const action = (n: number) => ({ kind: 'user-message' as const, actionId: `u-${n}`, turnId: `u-${n}`, turnSequence: n, occurredAt: at(n) });
const framingText = "The point of a project is not to succeed, it's to learn if it's something you'd want to pursue. Think of projects like dating: you start with something chill and low commitment, then invest more only if each date makes you want another.";
const acceptancePhrase = 'I explicitly accept this Path Project.';
const acceptanceQuestion = `Will you explicitly accept this Path Project by replying “${acceptancePhrase}”?`;
const framing = (projectId: string, n: number) => ({ projectId, projectRevision: 1, locale: 'en', framingText, acceptancePhrase, acceptanceQuestion, moduleVersion: '1.1.1', presentation: presentation(n) });
const delivery = (projectId: string, n: number) => ({ projectId, projectRevision: 1, assistantText: `${framingText}\n\n${acceptanceQuestion}`, presentation: presentation(n) });
const paths: [PurposePathInput, PurposePathInput, PurposePathInput] = [1, 2, 3].map((n) => ({
  id: `path-${n}`, revision: 1, name: `Path ${n}`, servesWhy: `Serve the Why through approach ${n}`,
  possibility: `Outcome ${n}`, evidence: [`Evidence ${n}`], centralUnknown: `Unknown ${n}`,
  projectPreview: `Project ${n}`, practicalFit: `Fit ${n}`,
})) as [PurposePathInput, PurposePathInput, PurposePathInput];
const project = (id = 'project-1', revision = 1) => ({
  id,
  revision,
  title: 'Build an aid',
  outcome: 'One person uses it',
  audience: 'A real colleague',
  whyWanted: 'Reduce decision waste',
  learningGoal: 'Learn whether iteration pulls me in',
  firstVersion: 'One-page prototype',
  firstStep: 'Interview the colleague',
  decisionQuestion: 'Do I want another iteration?',
  evidenceCue: 'Notice voluntary pull',
});

function op<T extends CareerMapOperation['type']>(map: CareerMap, type: T, payload: Extract<CareerMapOperation, { type: T }>['payload']): Extract<CareerMapOperation, { type: T }> {
  return { type, sourceId: `${type}-${map.revision + 1}`, expectedRevision: map.revision, occurredAt: at(map.revision + 1), payload } as Extract<CareerMapOperation, { type: T }>;
}

function commit<T extends CareerMapOperation['type']>(map: CareerMap, type: T, payload: Extract<CareerMapOperation, { type: T }>['payload']): CareerMap {
  const result = applyCareerMapOperation(map, op(map, type, payload));
  expect(result.status).toBe('committed');
  return result.map;
}

function withSelectedPath(explorerId: string): CareerMap {
  let map = createCareerMap(explorerId);
  map = commit(map, 'propose-why', { why: { id: 'why-1', revision: 1, statement: 'Make difficult choices actionable.', serves: 'People in transition', pointOfView: 'Clarity must change action' }, presentation: presentation(1) });
  map = commit(map, 'confirm-why', { whyId: 'why-1', whyRevision: 1, action: action(2) });
  map = commit(map, 'propose-purpose-paths', { setId: 'set-1', setRevision: 1, paths, presentation: presentation(3) });
  return commit(map, 'select-purpose-path', { setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1, action: action(4) });
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

  it('can reconsider the North Star from either pending Purpose Path decision', () => {
    let map = createCareerMap('explorer-reconsider-why');
    map = commit(map, 'propose-why', { why: { id: 'why-1', revision: 1, statement: 'Make difficult choices actionable.', serves: 'People in transition', pointOfView: 'Clarity must change action' }, presentation: presentation(1) });
    map = commit(map, 'confirm-why', { whyId: 'why-1', whyRevision: 1, action: action(2) });
    map = commit(map, 'propose-purpose-paths', { setId: 'set-1', setRevision: 1, paths, presentation: presentation(3) });
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('open-foundation-revision-focus');

    map = commit(map, 'open-foundation-revision-focus', { reason: 'A new interest may suggest serving a different group.', action: action(4) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'form-foundation', focus: { kind: 'foundation-revision' }, pendingDecision: null });
    expect(map.foundation.whyRevisions.findLast((why) => why.status === 'confirmed')?.id).toBe('why-1');
    map = commit(map, 'close-focus', { action: action(5) });
    expect(deriveMethodCheckpoint(map).pendingDecision?.kind).toBe('path-selection');

    map = commit(map, 'select-purpose-path', { setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1, action: action(6) });
    map = commit(map, 'replace-purpose-path', {
      sourceSetId: 'set-1', sourceSetRevision: 1, replacedPathId: 'path-2',
      replacementSetId: 'set-2', replacementSetRevision: 1,
      replacement: { ...paths[1], id: 'path-4', name: 'Another way' },
      presentation: presentation(7),
    });
    expect(deriveMethodCheckpoint(map).pendingDecision?.kind).toBe('path-revision-confirmation');
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('open-foundation-revision-focus');

    map = commit(map, 'open-foundation-revision-focus', { reason: 'The new direction may change who the work serves.', action: action(8) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'form-foundation', focus: { kind: 'foundation-revision' }, pendingDecision: null });
    expect(map.pathSets.findLast((set) => set.status === 'suggested')?.id).toBe('set-2');
  });

  it('allows a fresh project request without an accepted project, after direction discussion ends', () => {
    let map = withSelectedPath('explorer-project-request');
    expect(map.projects).toHaveLength(0);
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('request-new-project');
    map = commit(map, 'open-path-revision-focus', { reason: 'Consider another path', action: action(5) });
    expect(deriveMethodCheckpoint(map).availableOperations).not.toContain('request-new-project');
    map = commit(map, 'replace-purpose-path', {
      sourceSetId: 'set-1', sourceSetRevision: 1, replacedPathId: 'path-2',
      replacementSetId: 'set-2', replacementSetRevision: 1,
      replacement: { ...paths[1], id: 'path-4' }, presentation: presentation(6),
    });
    map = commit(map, 'close-focus', { action: action(7) });
    expect(deriveMethodCheckpoint(map).availableOperations).not.toContain('request-new-project');
    map = commit(map, 'confirm-purpose-path-revision', { setId: 'set-2', setRevision: 1, pathId: 'path-1', pathRevision: 1, action: action(8) });
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('request-new-project');
    map = commit(map, 'request-new-project', { action: action(9) });
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('propose-first-project');
  });

  it('keeps a replacement for an unaccepted first project in first-project confirmation', () => {
    let map = withSelectedPath('explorer-first-project-replacement');
    map = commit(map, 'propose-first-project', { project: project(), presentation: presentation(5) });
    map = commit(map, 'replace-project-proposal', {
      projectId: 'project-1',
      projectRevision: 1,
      replacement: project('project-2'),
      presentation: presentation(6),
    });

    expect(deriveMethodCheckpoint(map)).toMatchObject({
      module: 'design-path-project',
      pendingDecision: { kind: 'first-project-confirmation', targetId: 'project-2', targetRevision: 1 },
      availableOperations: expect.arrayContaining(['replace-project-proposal', 'present-first-project-framing']),
    });

    map = commit(map, 'present-first-project-framing', framing('project-2', 7));
    expect(deriveMethodCheckpoint(map).availableOperations).not.toContain('accept-first-project');
    map = commit(map, 'deliver-first-project-framing', delivery('project-2', 7));
    expect(deriveMethodCheckpoint(map).availableOperations).toEqual(expect.arrayContaining(['replace-project-proposal', 'accept-first-project']));
    map = commit(map, 'accept-first-project', { projectId: 'project-2', projectRevision: 1, action: action(8) });
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'guide-path-project', pendingDecision: null });
  });

  it('keeps a revision of an accepted project in project-revision confirmation', () => {
    let map = withSelectedPath('explorer-accepted-project-revision');
    map = commit(map, 'propose-first-project', { project: project(), presentation: presentation(5) });
    map = commit(map, 'present-first-project-framing', framing('project-1', 6));
    map = commit(map, 'deliver-first-project-framing', delivery('project-1', 6));
    map = commit(map, 'accept-first-project', { projectId: 'project-1', projectRevision: 1, action: action(7) });
    map = commit(map, 'propose-project-revision', {
      projectId: 'project-1',
      projectRevision: 1,
      replacement: project('project-2', 2),
      presentation: presentation(7),
    });

    expect(deriveMethodCheckpoint(map)).toMatchObject({
      module: 'design-path-project',
      pendingDecision: { kind: 'project-revision-confirmation', targetId: 'project-2', targetRevision: 2 },
      availableOperations: expect.arrayContaining(['replace-project-proposal', 'confirm-project-revision']),
    });

    map = commit(map, 'confirm-project-revision', { projectId: 'project-2', projectRevision: 2, action: action(8) });
    expect(map.projects.find((item) => item.id === 'project-1')?.agreementStatus).toBe('superseded');
    expect(map.projects.find((item) => item.id === 'project-2')?.agreementStatus).toBe('accepted');
  });

  it('ignores deferred legacy focus, pending decisions, and reviews', () => {
    const map: CareerMap = {
      ...createCareerMap('legacy-tail'),
      focus: { kind: 'peers', reason: 'Preserved context', openedBy: action(3) },
      invalidations: [{ id: 'review-peer', basisKind: 'purpose-path', basisId: 'path-old', basisRevision: 1, targetKind: 'peer-exposure', targetId: 'peer-old', targetRevision: 1, createdAtRevision: 5, status: 'pending' }],
    };
    expect(deriveMethodCheckpoint(map)).toMatchObject({ module: 'form-foundation', focus: null, review: null });
    expect(deriveMethodCheckpoint(map).availableOperations).not.toContain('open-peer-focus');
  });

  it('allows direction changes while first-project framing is pending', () => {
    let map = withSelectedPath('direction-during-framing');
    map = commit(map, 'propose-first-project', { project: project(), presentation: presentation(5) });
    map = commit(map, 'present-first-project-framing', framing('project-1', 6));
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('open-path-revision-focus');
    expect(deriveMethodCheckpoint(map).availableOperations).not.toContain('choose-parked-purpose-path');
    expect(deriveMethodCheckpoint(map).availableOperations).not.toContain('accept-first-project');
  });
  it('ignores a historical reflection after a later project is accepted', () => {
    let map = withSelectedPath('historical-reflection');
    map = commit(map, 'propose-first-project', { project: project(), presentation: presentation(5) });
    map = commit(map, 'present-first-project-framing', framing('project-1', 6));
    map = commit(map, 'deliver-first-project-framing', delivery('project-1', 6));
    map = commit(map, 'accept-first-project', { projectId: 'project-1', projectRevision: 1, action: action(7) });
    const historical = { id: 'reflection-old', revision: 1, projectBasis: { id: 'project-old', revision: 1 }, status: 'closed' as const, openedBy: action(1), closedBy: action(2), evidence: [] };
    map.reflections.push(historical);
    expect(selectCurrentProjectLearning(map).reflection).toBeUndefined();
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');
    expect(hasCompletedLearningLoop(map)).toBe(false);
  });

  it('scopes path focus to its selection tenure and active path', () => {
    const map = withSelectedPath('focus-tenure');
    const sourceId = selectCurrentPathSelectionSourceId(map)!;
    const focus = { id: 'focus-1', revision: 1, basisPath: { id: 'path-1', revision: 1 }, selectionSourceId: sourceId, action: action(5) };
    map.pathFocusCommitments.push(focus);
    expect(selectCurrentPathFocus(map)).toBe(focus);
    map.pathFocusCommitments[0] = { ...focus, selectionSourceId: 'previous-selection' };
    expect(selectCurrentPathFocus(map)).toBeUndefined();
  });

  it('finds the current active review and ignores orphan and deferred reviews', () => {
    const map = withSelectedPath('review-selection');
    const review = { id: 'review-path', basisKind: 'why' as const, basisId: 'why-1', basisRevision: 1, targetKind: 'path-set' as const, targetId: 'set-1', targetRevision: 1, createdAtRevision: 5, status: 'pending' as const };
    map.invalidations.push({ ...review, id: 'orphan', targetId: 'missing-set' }, review);
    expect(selectEarliestActiveReview(map)).toBe(review);
    expect(deriveMethodCheckpoint(map).availableOperations).toEqual(['resolve-basis-review']);
  });

  it('uses the explicit selected direction as a follow-on basis', () => {
    const map = withSelectedPath('selection-basis');
    const basis = selectProjectDecisionBasis(map);
    expect(basis).toEqual({ basisAction: { sourceId: selectCurrentPathSelectionSourceId(map), action: action(4) } });
    map.projectOptionSets.push({ id: 'consumed', revision: 1, status: 'superseded', projectNumber: 2, basisPath: { id: 'path-1', revision: 1 }, ...basis, projects: [1, 2, 3].map((n) => ({ ...project(`project-${n}`), equalWeight: true, selection: 'available' })) as never, presentation: presentation(5) });
    expect(selectProjectDecisionBasis(map)).toBeUndefined();
  });

  it('preserves focus when only a sibling path changes, and expires it after leaving and returning', () => {
    let map = withSelectedPath('uninterrupted-focus');
    const selectionSourceId = selectCurrentPathSelectionSourceId(map);
    map = commit(map, 'record-path-focus', { id: 'focus-1', revision: 1, pathId: 'path-1', pathRevision: 1, action: action(5) });
    map = commit(map, 'open-path-revision-focus', { reason: 'Improve another option', action: action(6) });
    map = commit(map, 'replace-purpose-path', { sourceSetId: 'set-1', sourceSetRevision: 1, replacedPathId: 'path-2', replacementSetId: 'set-2', replacementSetRevision: 1, replacement: { ...paths[1], id: 'path-4' }, presentation: presentation(7) });
    map = commit(map, 'confirm-purpose-path-revision', { setId: 'set-2', setRevision: 1, pathId: 'path-1', pathRevision: 1, action: action(8) });
    expect(selectCurrentPathSelectionSourceId(map)).toBe(selectionSourceId);
    expect(selectCurrentPathFocus(map)?.id).toBe('focus-1');
    map = commit(map, 'open-path-revision-focus', { reason: 'Try the other path', action: action(9) });
    map = commit(map, 'choose-parked-purpose-path', { sourceSetId: 'set-2', sourceSetRevision: 1, replacementSetId: 'set-3', replacementSetRevision: 1, pathId: 'path-3', pathRevision: 1, action: action(10) });
    expect(selectCurrentPathFocus(map)).toBeUndefined();
    map = commit(map, 'open-path-revision-focus', { reason: 'Return to the original path', action: action(11) });
    map = commit(map, 'choose-parked-purpose-path', { sourceSetId: 'set-3', sourceSetRevision: 1, replacementSetId: 'set-4', replacementSetRevision: 1, pathId: 'path-1', pathRevision: 1, action: action(12) });
    expect(selectCurrentPathSelectionSourceId(map)).not.toBe(selectionSourceId);
    expect(selectCurrentPathFocus(map)).toBeUndefined();
  });

  it('expires path focus when Foundation confirmation invalidates its path basis', () => {
    let map = withSelectedPath('foundation-focus-expiry');
    map = commit(map, 'record-path-focus', { id: 'focus-1', revision: 1, pathId: 'path-1', pathRevision: 1, action: action(5) });
    map = commit(map, 'open-foundation-revision-focus', { reason: 'Change who the work serves', action: action(6) });
    map = commit(map, 'revise-why', { supersedesWhyId: 'why-1', why: { id: 'why-2', revision: 2, statement: 'Make group decisions actionable.', serves: 'Teams in transition', pointOfView: 'Shared clarity must change action' }, presentation: presentation(7) });
    map = commit(map, 'confirm-why', { whyId: 'why-2', whyRevision: 2, action: action(8) });
    expect(selectCurrentPathFocus(map)).toBeUndefined();
    expect(selectEarliestActiveReview(map)?.targetKind).toBe('path-set');
  });

});

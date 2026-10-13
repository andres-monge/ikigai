import { describe, expect, it } from 'vitest';
import { careerMapSchema, readCareerMap } from './model';
import pendingV2 from './test-fixtures/legacy-pending-v2.json';
import commitmentV2 from './test-fixtures/legacy-commitment-v2.json';
import proofV2 from './test-fixtures/legacy-proof-v2.json';
import { applyCareerMapOperation } from './reducer';
import { createCareerMap as createV2Map } from './legacy-v2/model';

const presentation = { kind: 'model-presentation' as const, assistantTurnId: 'assistant', turnSequence: 1, completed: true as const, presentedAt: '2026-01-01T00:00:00.000Z' };
function legacyWithProject() {
  const legacy = createV2Map('explorer');
  legacy.foundation.whyRevisions.push({ id: 'why', revision: 1, statement: 'Help people', serves: 'People', pointOfView: 'Through practice', status: 'suggested', presentation });
  legacy.pathSets.push({ id: 'paths', revision: 1, status: 'suggested', basisWhy: { id: 'why', revision: 1 }, presentation, changeKind: 'initial', paths: [1, 2, 3].map((index) => ({ id: `path-${index}`, revision: 1, name: 'Path', servesWhy: 'Help people', evidence: ['Evidence'], centralUnknown: 'Unknown', projectPreview: 'Project', practicalFit: 'Fits', selection: 'available', equalWeight: true })) as typeof legacy.pathSets[number]['paths'] });
  legacy.projects.push({ id: 'project', revision: 1, title: 'Legacy project', outcome: 'Outcome', audience: 'Audience', whyWanted: 'Why', learningGoal: 'Learn', firstVersion: 'First version', firstStep: 'First step', decisionQuestion: 'Continue?', evidenceCue: 'Cue', number: 1, basisPath: { id: 'path-1', revision: 1 }, agreementStatus: 'suggested', workStatus: 'not-started', workUpdates: [], presentation });
  return legacy;
}

describe('strict V2 Career Map reader', () => {
  it('normalizes without changing the original document, revision, or receipts', () => {
    const legacy = createV2Map('explorer');
    const before = structuredClone(legacy);
    const normalized = readCareerMap(legacy);
    expect(normalized.schemaVersion).toBe(3);
    expect(normalized.pathFocusCommitments).toEqual([]);
    expect(normalized.revision).toBe(legacy.revision);
    expect(normalized.operationHistory).toEqual(legacy.operationHistory);
    expect(legacy).toEqual(before);
    expect(careerMapSchema.safeParse(legacy).success).toBe(false);
    expect(careerMapSchema.safeParse(normalized).success).toBe(true);
  });

  it('preserves every historical brief field and does not manufacture relationship authority', () => {
    const legacy = legacyWithProject();
    const normalized = readCareerMap(legacy);
    expect(normalized.projects).toEqual(legacy.projects);
    expect(normalized.projects[0].relationship).toBeUndefined();
  });

  it('rejects malformed legacy briefs and dangling references before normalization', () => {
    const missingField = legacyWithProject();
    delete (missingField.projects[0] as Partial<typeof missingField.projects[number]>).outcome;
    expect(() => readCareerMap(missingField)).toThrow();
    const dangling = legacyWithProject();
    dangling.projects[0].basisPath.id = 'missing';
    expect(() => readCareerMap(dangling)).toThrow();
  });

  it('does not manufacture focus authority from a legacy intent', () => {
    const legacy = legacyWithProject();
    const action = { kind: 'user-message' as const, actionId: 'action', turnId: 'user', turnSequence: 1, occurredAt: '2026-01-01T00:00:00.000Z' };
    legacy.reflections.push({ id: 'reflection', revision: 1, projectBasis: { id: 'project', revision: 1 }, status: 'open', openedBy: action, evidence: [] });
    legacy.continueChoices.push({ id: 'choice', revision: 1, reflectionBasis: { id: 'reflection', revision: 1 }, wantsToContinue: true, action });
    legacy.nextMoves.push({ id: 'move', revision: 1, continueChoiceBasis: { id: 'choice', revision: 1 }, kind: 'commit-provisionally', action });
    legacy.commitmentIntent = { id: 'intent', revision: 1, basisPath: { id: 'path-1', revision: 1 }, basisNextMove: { id: 'move', revision: 1 }, status: 'pending-peer-exposure', action };
    const normalized = readCareerMap(legacy);
    expect(normalized.commitmentIntent).toEqual(legacy.commitmentIntent);
    expect(normalized.pathFocusCommitments).toEqual([]);
  });

  it.each([
    ['unknown field', { futureState: true }],
    ['unknown version', { schemaVersion: 4 }],
    ['missing field', { projects: undefined }],
    ['inconsistent receipt revision', { revision: 1 }],
    ['extra singleton field', { commitmentIntent: { id: 'intent', extra: true } }],
  ])('rejects %s before normalization', (_label, corruption) => {
    expect(() => readCareerMap({ ...createV2Map('explorer'), ...corruption })).toThrow();
  });
});

function actionBasedOptions() {
  const map = readCareerMap(legacyWithProject());
  const action = { kind: 'user-message' as const, actionId: 'action', turnId: 'user', turnSequence: 1, occurredAt: '2026-01-01T00:00:00.000Z' };
  map.revision = 1;
  map.operationHistory.push({ sourceId: 'request', operationType: 'request-new-project', payloadFingerprint: 'payload', resultRevision: 1, committedAt: action.occurredAt, confirmationProvenance: action, moduleVersion: null });
  const { number: _number, basisPath: _basisPath, agreementStatus: _agreementStatus, workStatus: _workStatus, workUpdates: _workUpdates, presentation: _presentation, ...brief } = map.projects[0];
  map.projectOptionSets.push({ id: 'options', revision: 1, status: 'suggested', projectNumber: 2, basisPath: { id: 'path-1', revision: 1 }, basisAction: { sourceId: 'request', action }, projects: [1, 2, 3].map((index) => ({ ...brief, id: `option-${index}`, selection: 'available', equalWeight: true })) as typeof map.projectOptionSets[number]['projects'], presentation });
  return map;
}

describe('V3 historical and new project integrity', () => {
  it('validates an explicit project request basis and rejects invented provenance', () => {
    const map = actionBasedOptions();
    expect(careerMapSchema.safeParse(map).success).toBe(true);
    map.projectOptionSets[0].basisAction!.action = { ...map.projectOptionSets[0].basisAction!.action, actionId: 'invented' };
    expect(careerMapSchema.safeParse(map).success).toBe(false);
  });

  it('rejects changed content under an existing project revision across projects and options', () => {
    const map = actionBasedOptions();
    map.projectOptionSets[0].projects[0].id = map.projects[0].id;
    map.projectOptionSets[0].projects[0].briefFormat = 'simple-v1';
    map.projectOptionSets[0].projects[0].title = 'Changed without a revision';
    expect(careerMapSchema.safeParse(map).success).toBe(false);
  });

  it('consumes one request once and permits an explicit replacement of its set', () => {
    const map = actionBasedOptions();
    const duplicate = { ...structuredClone(map.projectOptionSets[0]), id: 'second' };
    map.projectOptionSets.push(duplicate);
    expect(careerMapSchema.safeParse(map).success).toBe(false);
    duplicate.supersedesSetId = 'options';
    expect(careerMapSchema.safeParse(map).success).toBe(true);
  });
});


describe('real frozen V2 lifecycle fixtures', () => {
  it.each([pendingV2, commitmentV2, proofV2])('preserves historical singleton and proof links at revision $revision', (legacy) => {
    const before = structuredClone(legacy);
    const map = readCareerMap(legacy);
    expect(map.commitmentIntent).toEqual(legacy.commitmentIntent);
    expect(map.provisionalCommitment).toEqual('provisionalCommitment' in legacy ? legacy.provisionalCommitment : undefined);
    expect(map.proofRevisions).toEqual(legacy.proofRevisions);
    expect(map.pathFocusCommitments).toEqual([]);
    expect(map.operationHistory).toEqual(legacy.operationHistory);
    expect(legacy).toEqual(before);
  });

  it('records independent focus while retaining the legacy singleton and its proof links', () => {
    const map = readCareerMap(proofV2);
    const path = map.pathSets.find((set) => set.status === 'active')!.paths.find((path) => path.selection === 'active')!;
    const result = applyCareerMapOperation(map, { type: 'record-path-focus', sourceId: 'fresh-focus', expectedRevision: map.revision, occurredAt: '2026-10-13T12:00:00.000Z', payload: { id: 'fresh-focus-record', revision: 1, pathId: path.id, pathRevision: path.revision, action: { kind: 'user-message', actionId: 'focus-action', turnId: 'focus-turn', turnSequence: 100, occurredAt: '2026-10-13T12:00:00.000Z' } } });
    expect(result.status).toBe('committed');
    expect(result.map.commitmentIntent).toEqual(map.commitmentIntent);
    expect(result.map.provisionalCommitment).toEqual(map.provisionalCommitment);
    expect(result.map.proofRevisions).toEqual(map.proofRevisions);
    expect(result.map.pathFocusCommitments).toHaveLength(1);
  });
});

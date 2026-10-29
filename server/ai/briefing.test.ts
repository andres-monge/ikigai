import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyCareerMapOperation,
  createCareerMap,
  deriveMethodCheckpoint,
  readCareerMap,
  type CareerMap,
  type CareerMapOperation,
  type PathProjectInput,
  type PurposePathInput,
} from '../../shared/career-map/index.js';
import { CareerMapBriefingError, compileCareerMapBriefing } from './briefing.js';
import { R22_CANONICAL_ENGLISH } from './method/base-instructions.js';

const at = (sequence: number) => `2030-01-01T00:00:${String(sequence).padStart(2, '0')}.000Z`;
const acceptancePhrase = 'I explicitly accept this Path Project.';
const acceptanceQuestion = `Will you explicitly accept this Path Project by replying “${acceptancePhrase}”?`;
const presentation = (sequence: number) => ({
  kind: 'model-presentation' as const,
  assistantTurnId: `briefing-assistant-${sequence}`,
  turnSequence: sequence,
  completed: true as const,
  presentedAt: at(sequence),
});
const action = (sequence: number) => ({
  kind: 'user-message' as const,
  actionId: `briefing-action-${sequence}`,
  turnId: `briefing-user-${sequence}`,
  turnSequence: sequence,
  occurredAt: at(sequence),
});
const paths = (): [PurposePathInput, PurposePathInput, PurposePathInput] => [
  {
    id: 'briefing-path-active', revision: 1, name: 'Build humane tools', servesWhy: 'Turn complexity into useful tools', possibility: 'Small teams decide better', evidence: ['Builds tools voluntarily'], centralUnknown: 'Whether iteration remains energizing', projectPreview: 'Build a decision aid', practicalFit: 'Can start beside current work',
  },
  { id: 'briefing-path-parked-1', revision: 1, name: 'Parked facilitation', servesWhy: 'Help groups directly', possibility: 'Teams gain agency', evidence: ['Explains complexity'], centralUnknown: 'Whether facilitation pulls', projectPreview: 'Run a workshop', practicalFit: 'One workshop is feasible' },
  { id: 'briefing-path-parked-2', revision: 1, name: 'Parked research', servesWhy: 'Publish practical findings', possibility: 'Methods spread', evidence: ['Follows questions'], centralUnknown: 'Whether inquiry sustains', projectPreview: 'Publish a field note', practicalFit: 'One note is feasible' },
];
const project: PathProjectInput = {
  id: 'briefing-project', revision: 1, title: 'Build a real decision aid', outcome: 'A colleague uses it', audience: 'A colleague with a live choice', whyWanted: 'Reduce decision waste', learningGoal: 'Learn whether product iteration pulls', firstVersion: 'A one-page prototype', firstStep: 'Interview one colleague', decisionQuestion: 'Do I want another iteration?', evidenceCue: 'Notice voluntary pull',
};

function commit<T extends CareerMapOperation['type']>(
  map: CareerMap,
  type: T,
  payload: Extract<CareerMapOperation, { type: T }>['payload'],
): CareerMap {
  const result = applyCareerMapOperation(map, {
    type,
    sourceId: `briefing-source-${map.revision + 1}`,
    expectedRevision: map.revision,
    occurredAt: at(map.revision + 1),
    payload,
  });
  expect(result.status).toBe('committed');
  return result.map;
}

function withConfirmedWhy(): CareerMap {
  let map = createCareerMap('briefing-owner');
  map = commit(map, 'propose-why', {
    why: { id: 'briefing-why', revision: 1, statement: 'Make complex choices more humane.', serves: 'People facing consequential choices', pointOfView: 'Clarity should create agency.' },
    presentation: presentation(1),
  });
  return commit(map, 'confirm-why', { whyId: 'briefing-why', whyRevision: 1, action: action(2) });
}

function withPendingProject(): CareerMap {
  let map = withConfirmedWhy();
  map = commit(map, 'propose-purpose-paths', { setId: 'briefing-path-set', setRevision: 1, paths: paths(), presentation: presentation(3) });
  map = commit(map, 'select-purpose-path', { setId: 'briefing-path-set', setRevision: 1, pathId: 'briefing-path-active', pathRevision: 1, action: action(4) });
  return commit(map, 'propose-first-project', { project, presentation: presentation(5) });
}

function withAcceptedProject(): CareerMap {
  let map = commit(withPendingProject(), 'present-first-project-framing', {
    projectId: project.id,
    projectRevision: project.revision,
    locale: 'en',
    framingText: R22_CANONICAL_ENGLISH,
    acceptancePhrase,
    acceptanceQuestion,
    moduleVersion: '1.1.1',
    presentation: presentation(6),
  });
  map = commit(map, 'deliver-first-project-framing', {
    projectId: project.id, projectRevision: project.revision,
    assistantText: `${R22_CANONICAL_ENGLISH}\n\n${acceptanceQuestion}`,
    presentation: presentation(6),
  });
  return commit(map, 'accept-first-project', {
    projectId: project.id,
    projectRevision: project.revision,
    action: action(7),
  });
}

function withChangedPathAndOpenReflection(): CareerMap {
  let map = commit(withAcceptedProject(), 'open-reflection', {
    reflectionId: 'open-learning', revision: 1, projectId: project.id, projectRevision: 1, action: action(8),
  });
  map = commit(map, 'append-reflection-evidence', {
    reflectionId: 'open-learning', reflectionRevision: 1,
    evidence: { id: 'listening-energy', revision: 1, signal: 'energy', observation: 'Listening created energy; polishing drained it.', interpretation: 'Try hands-on work without polished prose.', provenance: action(9) },
  });
  map = commit(map, 'open-path-revision-focus', { reason: 'Try facilitation instead of tools.', action: action(10) });
  map = commit(map, 'choose-parked-purpose-path', {
    sourceSetId: 'briefing-path-set', sourceSetRevision: 1,
    replacementSetId: 'changed-path-set', replacementSetRevision: 1,
    pathId: 'briefing-path-parked-1', pathRevision: 1, action: action(11),
  });
  map = commit(map, 'resolve-basis-review', { targetKind: 'project', targetId: project.id, targetRevision: 1, resolution: 'reaffirmed', action: action(11) });
  return commit(map, 'resolve-basis-review', { targetKind: 'reflection', targetId: 'open-learning', targetRevision: 1, resolution: 'reaffirmed', action: action(11) });
}

function legacyFixture(kind: 'commitment' | 'proof'): CareerMap {
  return readCareerMap(JSON.parse(readFileSync(new URL(`../../shared/career-map/test-fixtures/legacy-${kind}-v2.json`, import.meta.url), 'utf8')));
}

function withSideDoorEntry(): CareerMap {
  return legacyFixture('commitment');
}

function withMultiProjectSideDoorEntry(): CareerMap {
  let map = withAcceptedProject();
  map = commit(map, 'open-reflection', {
    reflectionId: 'briefing-reflection-1', revision: 1,
    projectId: project.id, projectRevision: project.revision, action: action(7),
  });
  map = commit(map, 'append-reflection-evidence', {
    reflectionId: 'briefing-reflection-1', reflectionRevision: 1,
    evidence: {
      id: 'briefing-learning-1', revision: 1,
      observation: 'The first project revealed that interviewing created energy.',
      signal: 'energy', interpretation: 'Direct contact is worth testing again.', provenance: action(8),
    },
  });
  map = commit(map, 'close-reflection', {
    reflectionId: 'briefing-reflection-1', reflectionRevision: 1, action: action(9),
  });
  map = commit(map, 'record-continue-choice', {
    id: 'briefing-continue-1', revision: 1,
    reflectionId: 'briefing-reflection-1', reflectionRevision: 1,
    wantsToContinue: true, action: action(10),
  });
  map = commit(map, 'record-next-move', {
    id: 'briefing-move-1', revision: 1,
    continueChoiceId: 'briefing-continue-1', continueChoiceRevision: 1,
    kind: 'explore-further', action: action(11),
  });
  const followOnProjects = [1, 2, 3].map((number) => ({
    ...project,
    id: `briefing-follow-on-${number}`,
    title: `Follow-on project ${number}`,
  })) as [PathProjectInput, PathProjectInput, PathProjectInput];
  map = commit(map, 'propose-follow-on-projects', {
    setId: 'briefing-follow-on-set', setRevision: 1,
    projects: followOnProjects, presentation: presentation(12),
  });
  map = commit(map, 'select-follow-on-project', {
    setId: 'briefing-follow-on-set', setRevision: 1,
    projectId: 'briefing-follow-on-2', projectRevision: 1, action: action(13),
  });
  map = commit(map, 'open-reflection', {
    reflectionId: 'briefing-reflection-2', revision: 1,
    projectId: 'briefing-follow-on-2', projectRevision: 1, action: action(14),
  });
  map = commit(map, 'append-reflection-evidence', {
    reflectionId: 'briefing-reflection-2', reflectionRevision: 1,
    evidence: {
      id: 'briefing-learning-2', revision: 1,
      observation: 'The second project produced a reusable facilitation artifact.',
      signal: 'beneficiary-feedback', interpretation: 'The proof can support a credible contribution.', provenance: action(15),
    },
  });
  map = commit(map, 'close-reflection', {
    reflectionId: 'briefing-reflection-2', reflectionRevision: 1, action: action(16),
  });
  map = commit(map, 'record-continue-choice', {
    id: 'briefing-continue-2', revision: 1,
    reflectionId: 'briefing-reflection-2', reflectionRevision: 1,
    wantsToContinue: true, action: action(17),
  });
  map = commit(map, 'record-next-move', {
    id: 'briefing-move-2', revision: 1,
    continueChoiceId: 'briefing-continue-2', continueChoiceRevision: 1,
    kind: 'commit-provisionally', action: action(18),
  });
  return map;
}

function withCompletedSideDoors(): CareerMap {
  return legacyFixture('proof');
}

describe('compileCareerMapBriefing', () => {
  it('briefs new cards without undefined legacy possibility while keeping evidence and feasibility separate', () => {
    const newPaths = paths().map(({ possibility: _legacy, ...path }) => path) as [PurposePathInput, PurposePathInput, PurposePathInput];
    const map = commit(withConfirmedWhy(), 'propose-purpose-paths', {
      setId: 'new-paths', setRevision: 1, paths: newPaths, presentation: presentation(3),
    });
    const briefing = compileCareerMapBriefing(map);
    expect(briefing.markdown).not.toContain('Possibility:');
    expect(briefing.markdown).not.toContain('undefined');
    expect(briefing.markdown).toContain('Evidence: Builds tools voluntarily');
    expect(briefing.markdown).toContain('Practical fit: Can start beside current work');
  });

  it('projects a validated empty map without exposing operation history', () => {
    const briefing = compileCareerMapBriefing(createCareerMap('u4-briefing-owner'));
    expect(briefing.module).toBe('form-foundation');
    expect(briefing.markdown).toContain('active module form-foundation');
    expect(briefing.markdown).not.toContain('operationHistory');
  });

  it('briefs the exact suggested North Star while retaining its confirmed predecessor', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'open-foundation-revision-focus', {
      reason: 'The people served are now clearer.',
      action: action(3),
    });
    map = commit(map, 'close-focus', { action: action(4) });
    map = commit(map, 'revise-why', {
      why: {
        id: 'briefing-why-revision',
        revision: 1,
        statement: 'Help people turn complex choices into humane action.',
        serves: 'People stalled by consequential choices',
        pointOfView: 'Evidence becomes useful when it changes the next action.',
      },
      supersedesWhyId: 'briefing-why',
      presentation: presentation(5),
    });
    const briefing = compileCareerMapBriefing(map);
    expect(briefing.pendingDecision).toMatchObject({
      kind: 'why-confirmation',
      targetId: 'briefing-why-revision',
      targetRevision: 1,
    });
    expect(briefing.markdown.match(/^## Your North Star$/gm)).toHaveLength(2);
    expect(briefing.markdown).toContain('Make complex choices more humane.');
    expect(briefing.markdown).toContain('briefing-why-revision@1');
    expect(briefing.markdown).toContain('Content to express as one direction: Help people turn complex choices into humane action. — People stalled by consequential choices — Evidence becomes useful when it changes the next action.');
    expect(briefing.modelMarkdown).not.toMatch(/Suggested Your North Star|Confirmed Your North Star|^Serves:|^Point of view:/m);
    expect(briefing.markdown).toContain('exact revise-why result classes');
    expect(briefing.markdown).toContain('after a failed presentation, use revise-why again');
  });

  it('keeps only the relevant confirmed basis, active work, and decision', () => {
    const briefing = compileCareerMapBriefing(withPendingProject());
    expect(briefing.module).toBe('design-path-project');
    expect(briefing.pendingDecision?.kind).toBe('first-project-confirmation');
    expect(briefing.markdown).toContain('Make complex choices more humane.');
    expect(briefing.markdown).toContain('Build humane tools');
    expect(briefing.markdown).toContain('Build a real decision aid');
    expect(briefing.markdown).toContain('A colleague with a live choice');
    expect(briefing.markdown).toContain('A one-page prototype');
    expect(briefing.markdown).toContain('First-project framing: not yet presented.');
    expect(briefing.markdown).not.toContain('Parked facilitation');
    expect(briefing.markdown).not.toContain('Parked research');
    expect(briefing.markdown).not.toContain('briefing-source-1');
  });

  it('briefs a valid historical version-2 map without mutating its records or receipts', () => {
    const legacy = JSON.parse(readFileSync(new URL('../../shared/career-map/test-fixtures/legacy-pending-v2.json', import.meta.url), 'utf8'));
    const original = structuredClone(legacy);
    const briefing = compileCareerMapBriefing(legacy);
    expect(briefing.module).toBe('guide-path-project');
    expect(briefing.mapRevision).toBe(legacy.revision);
    expect(briefing.markdown).toContain('Relationship to Purpose Path: linked');
    expect(briefing.markdown).toContain('A colleague with a live decision');
    expect(legacy).toEqual(original);
  });

  it('renders a simple unrelated project without fabricated detailed fields or path alignment', () => {
    const map = withPendingProject();
    const { outcome: _outcome, audience: _audience, whyWanted: _why,
      decisionQuestion: _question, evidenceCue: _cue, ...simpleProject } = map.projects[0];
    map.projects[0] = { ...simpleProject, briefFormat: 'simple-v1', relationship: 'unrelated' };
    const briefing = compileCareerMapBriefing(structuredClone(map));
    expect(briefing.markdown).toContain('Learning goal: Learn whether product iteration pulls');
    expect(briefing.markdown).toContain('First version: A one-page prototype');
    expect(briefing.markdown).toContain('First step: Interview one colleague');
    expect(briefing.markdown).toContain('Relationship to Purpose Path: unrelated');
    expect(briefing.markdown).toContain('Path basis (historical context only): briefing-path-active@1');
    expect(briefing.markdown).toContain('do not infer a decision about that path or rewrite the North Star');
    expect(briefing.markdown).toContain('Project presentation: not yet delivered.');
    expect(briefing.markdown).not.toMatch(/undefined|Outcome:|Audience:|Why wanted:|Learning question:|Evidence cue:|First-project framing:/);
  });

  it('refreshes current Foundation and explorer work updates in project guidance', () => {
    let map = withAcceptedProject();
    map.foundation.evidence.push({
      id: 'old-fascination', revision: 1, category: 'fascination',
      content: 'Obsolete Foundation fascination', provenance: action(1),
    }, {
      id: 'current-fascination', revision: 1, category: 'fascination',
      content: 'Current Foundation fascination', supersedesEvidenceId: 'old-fascination', provenance: action(8),
    });
    map.foundation.constraints.push({
      id: 'time-boundary', revision: 1, kind: 'time',
      description: 'Only two hours this week', provenance: action(8),
    });
    map = commit(map, 'update-project-work-status', {
      projectId: project.id, projectRevision: project.revision, status: 'in-progress', action: action(8),
    });
    const briefing = compileCareerMapBriefing(structuredClone(map));
    expect(briefing.module).toBe('guide-path-project');
    expect(briefing.markdown).toContain('Current Foundation fascination');
    expect(briefing.markdown).not.toContain('Obsolete Foundation fascination');
    expect(briefing.markdown).toContain('Only two hours this week');
    expect(briefing.markdown).toContain('Learning goal: Learn whether product iteration pulls');
    expect(briefing.markdown).toContain('Relationship to Purpose Path: linked');
    expect(briefing.markdown).toContain('Work updates reported by the explorer:');
    expect(briefing.markdown).toContain('in-progress (user turn 8; 2030-01-01T00:00:08.000Z)');
  });

  it('shows the current path focus while keeping guidance and further learning available', () => {
    const map = commit(withAcceptedProject(), 'record-path-focus', {
      id: 'briefing-focus', revision: 1, pathId: 'briefing-path-active', pathRevision: 1, action: action(8),
    });
    const briefing = compileCareerMapBriefing(structuredClone(map));
    expect(briefing.module).toBe('guide-path-project');
    expect(briefing.markdown).toContain('## Current path focus');
    expect(briefing.markdown).toContain('briefing-focus@1; path briefing-path-active@1');
    expect(briefing.markdown).toContain('Guidance, further projects, reflection and changes of direction remain available.');
  });

  it('briefs one eligible project after a path change while preserving open learning on its actual path', () => {
    const map = withChangedPathAndOpenReflection();
    const before = structuredClone(map);
    const briefing = compileCareerMapBriefing(map);
    expect(briefing.module).toBe('design-path-project');
    expect(briefing.modelMarkdown).toContain('One suggested Path Project; save with propose_first_project.');
    expect(briefing.modelMarkdown).not.toContain('Exactly three equal-weight Path Project options; save with propose_follow_on_projects.');
    expect(briefing.modelMarkdown).toContain('## Saved Path Project on another Purpose Path');
    expect(briefing.modelMarkdown).not.toContain('## Active Path Project');
    expect(briefing.modelMarkdown).toContain('Path basis: briefing-path-active@1');
    expect(briefing.modelMarkdown).toContain('Reflection: open-learning@1; open; project briefing-project@1');
    expect(briefing.modelMarkdown).toContain('Listening created energy; polishing drained it.');
    expect(map).toEqual(before);
  });

  it('does not direct a new project save during ordinary guidance or pending proposal refinement', () => {
    for (const map of [withAcceptedProject(), withPendingProject()]) {
      expect(compileCareerMapBriefing(map).modelMarkdown).not.toContain('## Current project design contract');
    }
  });

  it('includes full equal options and the exact prior learning decision during follow-on design', () => {
    let map = withAcceptedProject();
    map = commit(map, 'open-reflection', {
      reflectionId: 'option-reflection', revision: 1,
      projectId: project.id, projectRevision: project.revision, action: action(8),
    });
    map = commit(map, 'append-reflection-evidence', {
      reflectionId: 'option-reflection', reflectionRevision: 1,
      evidence: { id: 'option-learning', revision: 1, signal: 'energy',
        observation: 'Interviews created energy', interpretation: 'Test a second conversation', provenance: action(9) },
    });
    map = commit(map, 'close-reflection', { reflectionId: 'option-reflection', reflectionRevision: 1, action: action(10) });
    map = commit(map, 'record-continue-choice', {
      id: 'option-choice', revision: 1, reflectionId: 'option-reflection', reflectionRevision: 1,
      wantsToContinue: true, action: action(11),
    });
    map = commit(map, 'record-next-move', {
      id: 'option-move', revision: 1, continueChoiceId: 'option-choice', continueChoiceRevision: 1,
      kind: 'explore-further', action: action(12),
    });
    const designBriefing = compileCareerMapBriefing(map);
    expect(designBriefing.modelMarkdown).toContain('Exactly three equal-weight Path Project options; save with propose_follow_on_projects.');
    expect(designBriefing.modelMarkdown).not.toContain('One suggested Path Project; save with propose_first_project.');
    const options = [1, 2, 3].map((number) => ({
      id: `simple-option-${number}`, revision: 1, title: `Option ${number}`, briefFormat: 'simple-v1' as const,
      relationship: number === 3 ? 'unrelated' as const : 'linked' as const,
      learningGoal: `Learning goal ${number}`, firstVersion: `Small version ${number}`, firstStep: `Concrete step ${number}`,
    })) as [PathProjectInput, PathProjectInput, PathProjectInput];
    map = commit(map, 'propose-follow-on-projects', {
      setId: 'simple-options', setRevision: 1, projects: options, presentation: presentation(13),
    });
    const briefing = compileCareerMapBriefing(structuredClone(map));
    expect(briefing.module).toBe('design-path-project');
    expect(briefing.markdown).toContain('Interviews created energy');
    expect(briefing.markdown).toContain('option-choice@1; scope path; reflection basis option-reflection@1');
    expect(briefing.markdown).toContain('Next Move: explore-further (option-move@1)');
    for (const number of [1, 2, 3]) {
      expect(briefing.markdown).toContain(`Option ${number} (simple-option-${number}@1; available; equal weight)`);
      expect(briefing.markdown).toContain(`Learning goal: Learning goal ${number}`);
      expect(briefing.markdown).toContain(`First version: Small version ${number}`);
      expect(briefing.markdown).toContain(`First step: Concrete step ${number}`);
    }
    expect(briefing.markdown).toContain('Relationship to Purpose Path: unrelated');
    expect(briefing.markdown).not.toContain('undefined');
  });

  it('resumes after the durable first-project framing without repeating it after reload or compaction', () => {
    let map = commit(withPendingProject(), 'present-first-project-framing', {
      projectId: project.id, projectRevision: project.revision, locale: 'en',
      framingText: R22_CANONICAL_ENGLISH, acceptancePhrase, acceptanceQuestion,
      moduleVersion: '1.1.1', presentation: presentation(6),
    });
    const pendingBriefing = compileCareerMapBriefing(structuredClone(map));
    expect(pendingBriefing.markdown).toContain('First-project framing: pending delivery');
    expect(pendingBriefing.markdown).toContain(JSON.stringify(`${R22_CANONICAL_ENGLISH}\n\n${acceptanceQuestion}`));
    expect(deriveMethodCheckpoint(map).availableOperations).not.toContain('accept-first-project');
    map = commit(map, 'deliver-first-project-framing', {
      projectId: project.id, projectRevision: project.revision,
      assistantText: `${R22_CANONICAL_ENGLISH}\n\n${acceptanceQuestion}`,
      presentation: presentation(6),
    });
    const briefing = compileCareerMapBriefing(structuredClone(map));

    expect(briefing.pendingDecision).toMatchObject({
      kind: 'first-project-confirmation', targetId: project.id, targetRevision: project.revision,
    });
    expect(briefing.markdown).toContain('First-project framing: delivered once in briefing-assistant-6; locale en. Do not repeat it.');
    expect(briefing.markdown).toContain(JSON.stringify(acceptancePhrase));
    expect(briefing.markdown).toContain('exact text matching is not required');
    expect(deriveMethodCheckpoint(map).availableOperations).toEqual(expect.arrayContaining([
      'replace-project-proposal', 'accept-first-project',
    ]));
  });

  it('does not compile canonical records carrying provider research metadata', () => {
    const map = structuredClone(withPendingProject()) as CareerMap & {
      pathSets: Array<{ paths: Array<Record<string, unknown>> }>;
    };
    map.pathSets[0].paths[0].sources = [{
      kind: 'cited-research',
      sourceHandle: 'briefing-source',
      providerResultId: 'briefing-result',
      url: 'https://example.com/current',
    }];
    expect(() => compileCareerMapBriefing(map)).toThrow(CareerMapBriefingError);
  });

  it('includes equal parked choices only while that path decision is open', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'propose-purpose-paths', { setId: 'briefing-path-set', setRevision: 1, paths: paths(), presentation: presentation(3) });
    const briefing = compileCareerMapBriefing(map);
    expect(briefing.pendingDecision?.kind).toBe('path-selection');
    expect(briefing.markdown).toContain('Build humane tools');
    expect(briefing.markdown).toContain('Parked facilitation');
    expect(briefing.markdown).toContain('Parked research');
  });

  it('carries current Foundation evidence and constraints into Purpose Path reflection', () => {
    const map = withConfirmedWhy();
    map.foundation.evidence.push({
      id: 'briefing-fascination', revision: 1, category: 'fascination',
      content: 'I keep building tools for people around me.', provenance: action(1),
    });
    map.foundation.constraints.push({
      id: 'briefing-time', revision: 1, kind: 'time',
      description: 'I have five hours a week.', provenance: action(1),
    });
    const pathsMap = commit(map, 'propose-purpose-paths', {
      setId: 'briefing-path-set', setRevision: 1, paths: paths(), presentation: presentation(3),
    });
    const briefing = compileCareerMapBriefing(pathsMap);
    expect(briefing.module).toBe('create-purpose-paths');
    expect(briefing.markdown).toContain('I keep building tools for people around me.');
    expect(briefing.markdown).toContain('I have five hours a week.');
  });

  it('warns on stale lineage and lets corrected canonical state outrank stale transcript text', () => {
    let map = withPendingProject();
    map = commit(map, 'open-foundation-revision-focus', { reason: 'New firsthand evidence', action: action(6) });
    map = commit(map, 'revise-why', {
      why: { id: 'briefing-why-corrected', revision: 1, statement: 'Help people act on complex choices.', serves: 'People facing consequential choices', pointOfView: 'Useful evidence should create agency.' },
      supersedesWhyId: 'briefing-why',
      presentation: presentation(7),
    });
    map = commit(map, 'confirm-why', { whyId: 'briefing-why-corrected', whyRevision: 1, action: action(8) });
    const briefing = compileCareerMapBriefing(map);
    expect(briefing.markdown).toContain('Repair the earliest stale basis');
    expect(briefing.markdown).toContain('Help people act on complex choices.');
    expect(briefing.markdown).toContain('Direct North Star basis: briefing-why@1 — Make complex choices more humane.');
    expect(briefing.markdown.indexOf('Direct North Star basis: briefing-why@1'))
      .toBeLessThan(briefing.markdown.indexOf('## Your North Star'));
    expect(briefing.markdown).toContain('Canonical state below outranks conflicting or stale transcript text.');
  });

  it('resumes relevant active guidance from a retained historical peer focus', () => {
    const focused = commit(withAcceptedProject(), 'open-peer-focus', {
      reason: 'I want first-person evidence before committing.',
      action: action(7),
    });
    const briefing = compileCareerMapBriefing(focused);
    expect(briefing.module).toBe('guide-path-project');
    expect(briefing.markdown).not.toContain('Explorer-opened focus');
    expect(briefing.markdown).toContain('Build a real decision aid');
  });

  it('projects only corrected evidence from the latest reflection revision', () => {
    let map = withAcceptedProject();
    map = commit(map, 'open-reflection', {
      reflectionId: 'briefing-correction-reflection', revision: 1,
      projectId: project.id, projectRevision: project.revision, action: action(7),
    });
    map = commit(map, 'append-reflection-evidence', {
      reflectionId: 'briefing-correction-reflection', reflectionRevision: 1,
      evidence: {
        id: 'briefing-obsolete-learning', revision: 1,
        observation: 'Obsolete claim: I disliked every part of the work.',
        signal: 'resistance', interpretation: 'This interpretation was too broad.', provenance: action(8),
      },
    });
    map = commit(map, 'close-reflection', {
      reflectionId: 'briefing-correction-reflection', reflectionRevision: 1, action: action(9),
    });
    map = commit(map, 'revise-reflection-evidence', {
      reflectionId: 'briefing-correction-reflection', reflectionRevision: 1,
      newReflectionRevision: 2, supersedesEvidenceId: 'briefing-obsolete-learning',
      evidence: {
        id: 'briefing-corrected-learning', revision: 1,
        observation: 'Corrected claim: framing was draining, but prototyping created energy.',
        signal: 'energy', interpretation: 'Separate framing work from building work.',
        provenance: action(10), supersedesEvidenceId: 'briefing-obsolete-learning',
      },
    });
    const briefing = compileCareerMapBriefing(map);
    expect(briefing.module).toBe('interpret-path-project');
    expect(briefing.markdown).toContain('briefing-correction-reflection@2');
    expect(briefing.markdown).toContain('Corrected claim: framing was draining');
    expect(briefing.markdown).not.toContain('Obsolete claim: I disliked every part');
  });

  it('never pairs an older reflection with a newer current project', () => {
    let map = withAcceptedProject();
    map = commit(map, 'open-reflection', {
      reflectionId: 'briefing-older-reflection', revision: 1,
      projectId: project.id, projectRevision: project.revision, action: action(7),
    });
    map = commit(map, 'append-reflection-evidence', {
      reflectionId: 'briefing-older-reflection', reflectionRevision: 1,
      evidence: {
        id: 'briefing-older-learning', revision: 1,
        observation: 'Learning that belongs only to Project 1.', signal: 'energy',
        interpretation: 'Project 1 interpretation.', provenance: action(8),
      },
    });
    map = commit(map, 'close-reflection', {
      reflectionId: 'briefing-older-reflection', reflectionRevision: 1, action: action(9),
    });
    const firstProject = map.projects.find((item) => item.id === project.id)!;
    const withSecondProject: CareerMap = {
      ...map,
      projects: [
        ...map.projects,
        {
          ...firstProject,
          id: 'briefing-project-2',
          number: 2,
          title: 'Current Project 2 without a reflection',
          presentation: presentation(10),
          confirmation: {
            targetId: 'briefing-project-2', targetRevision: 1,
            presentedInTurnId: presentation(10).assistantTurnId, confirmedBy: firstProject.confirmation!.confirmedBy,
          },
        },
      ],
    };
    const currentBriefing = compileCareerMapBriefing(withSecondProject);
    expect(currentBriefing.module).toBe('guide-path-project');
    expect(currentBriefing.markdown).toContain('Current Project 2 without a reflection');
    expect(currentBriefing.markdown).not.toContain('Learning that belongs only to Project 1.');

    const olderFocus: CareerMap = {
      ...withSecondProject,
      focus: {
        kind: 'reflection', reflectionId: 'briefing-older-reflection',
        reason: 'Revisit Project 1 learning.', openedBy: action(12),
      },
    };
    const focusedBriefing = compileCareerMapBriefing(olderFocus);
    expect(focusedBriefing.module).toBe('guide-path-project');
    expect(focusedBriefing.markdown).not.toContain('Learning that belongs only to Project 1.');
    expect(focusedBriefing.markdown).toContain('Current Project 2 without a reflection');
  });

  it('keeps a replaced project reflection historical while guiding the current revision', () => {
    let map = withAcceptedProject();
    map = commit(map, 'open-reflection', {
      reflectionId: 'briefing-review-reflection', revision: 1,
      projectId: project.id, projectRevision: project.revision, action: action(7),
    });
    map = commit(map, 'append-reflection-evidence', {
      reflectionId: 'briefing-review-reflection', reflectionRevision: 1,
      evidence: {
        id: 'briefing-review-learning', revision: 1,
        observation: 'Exact stale learning from the original project revision.',
        signal: 'energy', interpretation: 'The original project created pull.', provenance: action(8),
      },
    });
    map = commit(map, 'close-reflection', {
      reflectionId: 'briefing-review-reflection', reflectionRevision: 1, action: action(9),
    });
    map = commit(map, 'propose-project-revision', {
      projectId: project.id, projectRevision: project.revision,
      replacement: {
        ...project,
        id: 'briefing-current-project',
        title: 'Current revised project that must not hide the stale target',
      },
      presentation: presentation(10),
    });
    map = commit(map, 'confirm-project-revision', {
      projectId: 'briefing-current-project', projectRevision: 1, action: action(11),
    });
    const briefing = compileCareerMapBriefing(map);
    expect(briefing.module).toBe('guide-path-project');
    expect(briefing.markdown).not.toContain('Exact review target: reflection briefing-review-reflection@1');
    expect(briefing.markdown).not.toContain('Exact stale learning from the original project revision.');
    expect(briefing.markdown).toContain('Current revised project that must not hide the stale target');
  });

  it('reviews active exact bases while ignoring saved deferred-tail invalidations', () => {
    const deepMap = withCompletedSideDoors();
    const targets = [
      ['path-set', 'paths-1', 1, 'Purpose Path set: paths-1@1'],
      ['project', 'project-1', 1, 'Project 1: Build a real decision aid'],
      ['reflection', 'reflection-1', 1, 'I kept improving the interaction after the useful version worked.'],
      ['next-move', 'move-1', 1, 'Next Move: commit-provisionally (move-1@1)'],
      ['peer-exposure', 'peer-1', 1, 'Peer exposure: community: A facilitation community'],
      ['commitment', 'commitment-1', 1, 'Commitment: commitment-1@1; confirmed'],
      ['proof', 'proof-1', 1, 'Proof: proof-1@1; confirmed'],
      ['side-door-set', 'doors-1', 1, 'Side Door set: doors-1@1; active'],
      ['route-outcome', 'outcome-1', 1, 'Route outcome: positive-response (outcome-1@1)'],
    ] as const;

    for (const [targetKind, targetId, targetRevision, expected] of targets) {
      const reviewed: CareerMap = {
        ...deepMap,
        invalidations: [{
          id: `briefing-review-${targetKind}`,
          basisKind: 'why',
          basisId: 'why-1',
          basisRevision: 1,
          targetKind,
          targetId,
          targetRevision,
          createdAtRevision: deepMap.revision,
          status: 'pending',
        }],
      };
      const briefing = compileCareerMapBriefing(reviewed);
      if (['path-set', 'project', 'reflection', 'next-move'].includes(targetKind)) {
        expect(briefing.markdown).toContain(`Exact review target: ${targetKind} ${targetId}@${targetRevision}`);
        expect(briefing.markdown).toContain(expected);
      } else {
        expect(briefing.module).toBe('guide-path-project');
        expect(briefing.markdown).not.toContain('Exact review target:');
      }
    }
  });

  it('guides the current project and learning while retaining historical tail records', () => {
    const briefing = compileCareerMapBriefing(withSideDoorEntry());
    expect(briefing.module).toBe('guide-path-project');
    expect(briefing.markdown).toContain('Build a real decision aid');
    expect(briefing.markdown).toContain('I kept improving the interaction after the useful version worked.');
    expect(briefing.markdown).not.toContain('A decision practitioner');
    expect(briefing.markdown).not.toContain('## Provisional commitment');
    expect(briefing.markdown).not.toContain('Parked facilitation');
  });

  it('omits an outcome from an older revision of a Side Door in the current set', () => {
    const map = withCompletedSideDoors();
    const previousSet = map.sideDoorSets.at(-1)!;
    const revised: CareerMap = {
      ...map,
      sideDoorSets: [
        ...map.sideDoorSets.slice(0, -1),
        { ...previousSet, status: 'superseded' },
        {
          ...previousSet,
          revision: previousSet.revision + 1,
          status: 'active',
          doors: previousSet.doors.map((door) => ({
            ...door,
            revision: door.revision + 1,
          })) as typeof previousSet.doors,
        },
      ],
    };

    const briefing = compileCareerMapBriefing(revised);
    expect(briefing.markdown).not.toContain('## Side Doors');
    expect(briefing.markdown).not.toContain('Route outcome: positive-response');
  });

  it('keeps prior cycles historical while guiding the newest project', () => {
    const briefing = compileCareerMapBriefing(withMultiProjectSideDoorEntry());
    expect(briefing.module).toBe('guide-path-project');
    expect(briefing.markdown).not.toContain('The first project revealed that interviewing created energy.');
    expect(briefing.markdown).toContain('Follow-on project 2');
    expect(briefing.markdown).toContain('The second project produced a reusable facilitation artifact.');
    expect(briefing.markdown).not.toContain('Follow-on project 1');
    expect(briefing.markdown).not.toContain('Follow-on project 3');
  });

  it('uses only the latest corrected reflection snapshot in active guidance', () => {
    const map = withSideDoorEntry();
    const original = map.reflections[0];
    const corrected: CareerMap = {
      ...map,
      reflections: [
        ...map.reflections,
        {
          ...original,
          revision: 2,
          evidence: [
            ...original.evidence,
            {
              id: 'briefing-side-door-correction', revision: 1,
              observation: 'Corrected Side Door evidence: I improved it to test the audience response.',
              signal: 'beneficiary-feedback', interpretation: 'Audience response is the relevant proof.',
              provenance: action(15), supersedesEvidenceId: 'learning-1',
            },
          ],
        },
      ],
      continueChoices: map.continueChoices.map((choice) => ({
        ...choice,
        reflectionBasis: choice.reflectionBasis.id === original.id
          ? { id: original.id, revision: 2 }
          : choice.reflectionBasis,
      })),
    };
    const briefing = compileCareerMapBriefing(corrected);
    expect(briefing.module).toBe('guide-path-project');
    expect(briefing.markdown).toContain('reflection-1@2');
    expect(briefing.markdown).toContain('Corrected Side Door evidence');
    expect(briefing.markdown).not.toContain('I kept improving the interaction after the useful version worked.');
  });

  it('fails closed instead of briefing an unsupported or malformed record', () => {
    const invalid = { ...createCareerMap('briefing-invalid'), schemaVersion: 999 };
    expect(() => compileCareerMapBriefing(invalid)).toThrow(CareerMapBriefingError);
    expect(() => compileCareerMapBriefing({ ...createCareerMap('briefing-invalid'), pathSets: [{ id: 'broken' }] })).toThrow(CareerMapBriefingError);
  });
});

it('briefs reported proceeding and the exact latest work update without earlier assent', () => {
  const map = commit(withPendingProject(), 'report-project-work', {
    projectId:project.id,projectRevision:project.revision,status:'completed',reportedActivity:'I finished the interviews.',action:action(7),
  });
  const briefing=compileCareerMapBriefing(map).markdown;
  expect(briefing).toContain('Proceeding from a current work report');
  expect(briefing).toContain('I finished the interviews.');
  expect(briefing).toContain('Latest work update action:');
  expect(briefing).toContain('not evidence of earlier assent');
});

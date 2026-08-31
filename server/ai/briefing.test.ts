import { describe, expect, it } from 'vitest';
import {
  applyCareerMapOperation,
  createCareerMap,
  type CareerMap,
  type CareerMapOperation,
  type PathProjectInput,
  type PurposePathInput,
  type SideDoorInput,
} from '../../shared/career-map/index.js';
import { CareerMapBriefingError, compileCareerMapBriefing } from './briefing.js';

const at = (sequence: number) => `2030-01-01T00:00:${String(sequence).padStart(2, '0')}.000Z`;
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
    sources: [{ kind: 'cited-research', sourceHandle: 'briefing-source', providerResultId: 'briefing-result', url: 'https://example.com/current', retrievedAt: at(3), title: 'Current source', excerpt: 'A claim-associated public excerpt.', support: 'server-validated' }],
  },
  { id: 'briefing-path-parked-1', revision: 1, name: 'Parked facilitation', servesWhy: 'Help groups directly', possibility: 'Teams gain agency', evidence: ['Explains complexity'], centralUnknown: 'Whether facilitation pulls', projectPreview: 'Run a workshop', practicalFit: 'One workshop is feasible' },
  { id: 'briefing-path-parked-2', revision: 1, name: 'Parked research', servesWhy: 'Publish practical findings', possibility: 'Methods spread', evidence: ['Follows questions'], centralUnknown: 'Whether inquiry sustains', projectPreview: 'Publish a field note', practicalFit: 'One note is feasible' },
];
const project: PathProjectInput = {
  id: 'briefing-project', revision: 1, title: 'Build a real decision aid', outcome: 'A colleague uses it', audience: 'A colleague with a live choice', whyWanted: 'Reduce decision waste', learningGoal: 'Learn whether product iteration pulls', firstVersion: 'A one-page prototype', firstStep: 'Interview one colleague', decisionQuestion: 'Do I want another iteration?', evidenceCue: 'Notice voluntary pull',
};

const briefingDoors = (): [SideDoorInput, SideDoorInput, SideDoorInput] => [1, 2, 3].map((number) => ({
  id: `briefing-door-${number}`,
  revision: 1,
  name: `Briefing door ${number}`,
  target: `Relevant community ${number}`,
  proofValue: `Proof value ${number}`,
  contribution: `Contribution ${number}`,
  firstMove: `First move ${number}`,
  accessConstraints: [`Constraint ${number}`],
})) as [SideDoorInput, SideDoorInput, SideDoorInput];

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
  return commit(withPendingProject(), 'accept-first-project', {
    projectId: project.id,
    projectRevision: project.revision,
    action: action(6),
  });
}

function withSideDoorEntry(): CareerMap {
  let map = withAcceptedProject();
  map = commit(map, 'open-reflection', {
    reflectionId: 'briefing-reflection', revision: 1,
    projectId: project.id, projectRevision: project.revision, action: action(7),
  });
  map = commit(map, 'append-reflection-evidence', {
    reflectionId: 'briefing-reflection', reflectionRevision: 1,
    evidence: {
      id: 'briefing-learning', revision: 1,
      observation: 'I kept improving the decision aid after it first worked.',
      signal: 'voluntary-pull', interpretation: 'Iteration creates useful energy.', provenance: action(8),
    },
  });
  map = commit(map, 'close-reflection', {
    reflectionId: 'briefing-reflection', reflectionRevision: 1, action: action(9),
  });
  map = commit(map, 'record-continue-choice', {
    id: 'briefing-continue', revision: 1,
    reflectionId: 'briefing-reflection', reflectionRevision: 1,
    wantsToContinue: true, action: action(10),
  });
  map = commit(map, 'record-next-move', {
    id: 'briefing-move', revision: 1,
    continueChoiceId: 'briefing-continue', continueChoiceRevision: 1,
    kind: 'commit-provisionally', action: action(11),
  });
  map = commit(map, 'record-peer-exposure', {
    exposure: {
      id: 'briefing-peer', revision: 1, subjectKind: 'real-person',
      subject: 'A decision practitioner', insight: 'Concrete cases make the work credible.',
    },
    presentation: presentation(12),
  });
  map = commit(map, 'confirm-peer-exposure', {
    exposureId: 'briefing-peer', exposureRevision: 1, action: action(13),
  });
  return commit(map, 'complete-provisional-commitment', {
    id: 'briefing-commitment', revision: 1,
    intentId: map.commitmentIntent!.id, action: action(14),
  });
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
  map = commit(map, 'record-peer-exposure', {
    exposure: {
      id: 'briefing-peer-multi', revision: 1, subjectKind: 'community',
      subject: 'A facilitation community', insight: 'Reusable artifacts create a useful entry point.',
    },
    presentation: presentation(19),
  });
  map = commit(map, 'confirm-peer-exposure', {
    exposureId: 'briefing-peer-multi', exposureRevision: 1, action: action(20),
  });
  return commit(map, 'complete-provisional-commitment', {
    id: 'briefing-commitment-multi', revision: 1,
    intentId: map.commitmentIntent!.id, action: action(21),
  });
}

function withCompletedSideDoors(): CareerMap {
  let map = withMultiProjectSideDoorEntry();
  map = commit(map, 'propose-proof-inventory', {
    proof: {
      id: 'briefing-proof', revision: 1,
      artifacts: ['A working decision aid'], problemsSolved: ['Decision friction'],
      peopleHelped: ['One colleague'], usefulQualities: ['Synthesis'],
      knowledge: ['Decision design'], relationships: ['A practitioner'],
      pointsOfView: ['Evidence should change action'], shareableMaterial: ['A case note'],
    },
    presentation: presentation(22),
  });
  map = commit(map, 'confirm-proof-inventory', {
    proofId: 'briefing-proof', proofRevision: 1, action: action(23),
  });
  map = commit(map, 'propose-side-doors', {
    setId: 'briefing-door-set', setRevision: 1,
    doors: briefingDoors(), presentation: presentation(24),
  });
  map = commit(map, 'select-side-door', {
    setId: 'briefing-door-set', setRevision: 1,
    doorId: 'briefing-door-1', doorRevision: 1, action: action(25),
  });
  return commit(map, 'record-route-outcome', {
    id: 'briefing-route-outcome', revision: 1,
    doorId: 'briefing-door-1', doorRevision: 1,
    result: 'positive-response', learning: 'The contribution opened a relevant conversation.',
    action: action(26),
  });
}

describe('compileCareerMapBriefing', () => {
  it('projects a validated empty map without exposing operation history', () => {
    const briefing = compileCareerMapBriefing(createCareerMap('u4-briefing-owner'));
    expect(briefing.module).toBe('form-foundation');
    expect(briefing.markdown).toContain('active module form-foundation');
    expect(briefing.markdown).not.toContain('operationHistory');
  });

  it('briefs the exact suggested Why while retaining its confirmed predecessor', () => {
    let map = withConfirmedWhy();
    map = commit(map, 'open-foundation-revision-focus', {
      reason: 'The people served are now clearer.',
      action: action(3),
    });
    map = commit(map, 'revise-why', {
      why: {
        id: 'briefing-why-revision',
        revision: 1,
        statement: 'Help people turn complex choices into humane action.',
        serves: 'People stalled by consequential choices',
        pointOfView: 'Evidence becomes useful when it changes the next action.',
      },
      supersedesWhyId: 'briefing-why',
      presentation: presentation(4),
    });
    map = commit(map, 'close-focus', { action: action(5) });

    const briefing = compileCareerMapBriefing(map);
    expect(briefing.pendingDecision).toMatchObject({
      kind: 'why-confirmation',
      targetId: 'briefing-why-revision',
      targetRevision: 1,
    });
    expect(briefing.markdown).toContain('Confirmed Why I Work');
    expect(briefing.markdown).toContain('Make complex choices more humane.');
    expect(briefing.markdown).toContain('Suggested Why I Work — pending confirmation');
    expect(briefing.markdown).toContain('briefing-why-revision@1; suggested');
    expect(briefing.markdown).toContain('Help people turn complex choices into humane action.');
    expect(briefing.markdown).toContain('Serves: People stalled by consequential choices');
    expect(briefing.markdown).toContain('Point of view: Evidence becomes useful when it changes the next action.');
  });

  it('keeps only the relevant confirmed basis, active work, decision, and cited source', () => {
    const briefing = compileCareerMapBriefing(withPendingProject());
    expect(briefing.module).toBe('design-path-project');
    expect(briefing.pendingDecision?.kind).toBe('first-project-confirmation');
    expect(briefing.markdown).toContain('Make complex choices more humane.');
    expect(briefing.markdown).toContain('Build humane tools');
    expect(briefing.markdown).toContain('Build a real decision aid');
    expect(briefing.markdown).toContain('https://example.com/current');
    expect(briefing.markdown).toContain('A claim-associated public excerpt.');
    expect(briefing.markdown).not.toContain('Parked facilitation');
    expect(briefing.markdown).not.toContain('Parked research');
    expect(briefing.markdown).not.toContain('briefing-source-1');
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
    expect(briefing.markdown).toContain('Direct Why basis: briefing-why@1 — Make complex choices more humane.');
    expect(briefing.markdown.indexOf('Direct Why basis: briefing-why@1'))
      .toBeLessThan(briefing.markdown.indexOf('## Confirmed Why I Work'));
    expect(briefing.markdown).toContain('Canonical state below outranks conflicting or stale transcript text.');
  });

  it('renders the explorer-opened focus and its reason with the relevant open work', () => {
    const focused = commit(withAcceptedProject(), 'open-peer-focus', {
      reason: 'I want first-person evidence before committing.',
      action: action(7),
    });
    const briefing = compileCareerMapBriefing(focused);
    expect(briefing.module).toBe('find-relevant-peers');
    expect(briefing.markdown).toContain('Explorer-opened focus');
    expect(briefing.markdown).toContain('I want first-person evidence before committing.');
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
            presentedInTurnId: presentation(10).assistantTurnId, confirmedBy: action(11),
          },
        },
      ],
    };
    const currentBriefing = compileCareerMapBriefing(withSecondProject);
    expect(currentBriefing.module).toBe('interpret-path-project');
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
    expect(focusedBriefing.module).toBe('interpret-path-project');
    expect(focusedBriefing.markdown).toContain('Build a real decision aid');
    expect(focusedBriefing.markdown).toContain('Learning that belongs only to Project 1.');
    expect(focusedBriefing.markdown).not.toContain('Current Project 2 without a reflection');
  });

  it('projects the exact stale reflection and its project basis before current project fallbacks', () => {
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
    map = commit(map, 'resolve-basis-review', {
      targetKind: 'project', targetId: project.id, targetRevision: project.revision,
      resolution: 'replaced', action: action(12),
    });

    const briefing = compileCareerMapBriefing(map);
    expect(briefing.markdown).toContain('Review reflection briefing-review-reflection@1');
    expect(briefing.markdown).toContain('Exact review target: reflection briefing-review-reflection@1');
    expect(briefing.markdown).toContain('Direct project basis: briefing-project@1');
    expect(briefing.markdown).toContain('Exact stale learning from the original project revision.');
    expect(briefing.markdown.indexOf('Exact stale learning from the original project revision.'))
      .toBeLessThan(briefing.markdown.indexOf('Current revised project that must not hide the stale target'));
  });

  it('resolves exact review targets and direct bases across the complete deep-map target set', () => {
    const deepMap = withCompletedSideDoors();
    const targets = [
      ['path-set', 'briefing-path-set', 1, 'Purpose Path set: briefing-path-set@1'],
      ['project', 'briefing-project', 1, 'Project 1: Build a real decision aid'],
      ['reflection', 'briefing-reflection-1', 1, 'The first project revealed that interviewing created energy.'],
      ['next-move', 'briefing-move-1', 1, 'Next Move: explore-further (briefing-move-1@1)'],
      ['peer-exposure', 'briefing-peer-multi', 1, 'Peer exposure: community: A facilitation community'],
      ['commitment', 'briefing-commitment-multi', 1, 'Commitment: briefing-commitment-multi@1; confirmed'],
      ['proof', 'briefing-proof', 1, 'Proof: briefing-proof@1; confirmed'],
      ['side-door-set', 'briefing-door-set', 1, 'Side Door set: briefing-door-set@1; active'],
      ['route-outcome', 'briefing-route-outcome', 1, 'Route outcome: positive-response (briefing-route-outcome@1)'],
    ] as const;

    for (const [targetKind, targetId, targetRevision, expected] of targets) {
      const reviewed: CareerMap = {
        ...deepMap,
        invalidations: [{
          id: `briefing-review-${targetKind}`,
          basisKind: 'why',
          basisId: 'briefing-why',
          basisRevision: 1,
          targetKind,
          targetId,
          targetRevision,
          createdAtRevision: deepMap.revision,
          status: 'pending',
        }],
      };
      const briefing = compileCareerMapBriefing(reviewed);
      expect(briefing.markdown).toContain(`Exact review target: ${targetKind} ${targetId}@${targetRevision}`);
      expect(briefing.markdown).toContain(expected);
    }
  });

  it('keeps the active project, learning, peer, and commitment basis in the Side Doors checkpoint', () => {
    const briefing = compileCareerMapBriefing(withSideDoorEntry());
    expect(briefing.module).toBe('enter-side-doors');
    expect(briefing.markdown).toContain('Build a real decision aid');
    expect(briefing.markdown).toContain('I kept improving the decision aid after it first worked.');
    expect(briefing.markdown).toContain('A decision practitioner');
    expect(briefing.markdown).toContain('briefing-commitment@1');
    expect(briefing.markdown).not.toContain('Parked facilitation');
  });

  it('keeps accepted project and learning evidence from every completed cycle while drafting proof', () => {
    const briefing = compileCareerMapBriefing(withMultiProjectSideDoorEntry());
    expect(briefing.module).toBe('enter-side-doors');
    expect(briefing.markdown).toContain('Build a real decision aid');
    expect(briefing.markdown).toContain('The first project revealed that interviewing created energy.');
    expect(briefing.markdown).toContain('Follow-on project 2');
    expect(briefing.markdown).toContain('The second project produced a reusable facilitation artifact.');
    expect(briefing.markdown).not.toContain('Follow-on project 1');
    expect(briefing.markdown).not.toContain('Follow-on project 3');
  });

  it('uses only the latest corrected reflection snapshot while briefing Side Doors', () => {
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
              provenance: action(15), supersedesEvidenceId: 'briefing-learning',
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
    expect(briefing.module).toBe('enter-side-doors');
    expect(briefing.markdown).toContain('briefing-reflection@2');
    expect(briefing.markdown).toContain('Corrected Side Door evidence');
    expect(briefing.markdown).not.toContain('I kept improving the decision aid after it first worked.');
  });

  it('fails closed instead of briefing an unsupported or malformed record', () => {
    const invalid = { ...createCareerMap('briefing-invalid'), schemaVersion: 999 };
    expect(() => compileCareerMapBriefing(invalid)).toThrow(CareerMapBriefingError);
    expect(() => compileCareerMapBriefing({ ...createCareerMap('briefing-invalid'), pathSets: [{ id: 'broken' }] })).toThrow(CareerMapBriefingError);
  });
});

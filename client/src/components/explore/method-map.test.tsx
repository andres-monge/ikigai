// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { applyCareerMapOperation, createCareerMap, readCareerMap, type CareerMap } from '@shared/career-map';
import { MethodMap } from './method-map';
import legacyProof from '@shared/career-map/test-fixtures/legacy-proof-v2.json';

afterEach(cleanup);

const presentation = {
  kind: 'model-presentation' as const,
  assistantTurnId: 'assistant-turn-1', turnSequence: 1, completed: true as const,
  presentedAt: '2030-01-01T00:00:00.000Z',
};

function pathMap(status: 'suggested' | 'active' = 'suggested'): CareerMap {
  const map = createCareerMap('explorer-1');
  map.foundation.whyRevisions.push({
    id: 'why-1', revision: 1, statement: 'Make difficult systems humane.', serves: 'People using them.',
    pointOfView: 'Complexity is a choice.', status: 'confirmed', presentation,
    confirmation: {
      targetId: 'why-1', targetRevision: 1, presentedInTurnId: presentation.assistantTurnId,
      confirmedBy: { kind: 'user-message', actionId: 'a', turnId: 't', turnSequence: 2, occurredAt: '2030-01-01T00:00:01.000Z' },
    },
  });
  map.pathSets.push({
    id: 'set-1', revision: 1, status, basisWhy: { id: 'why-1', revision: 1 },
    presentation, changeKind: 'initial',
    ...(status === 'active' ? {
      confirmation: {
        targetId: 'set-1', targetRevision: 1, presentedInTurnId: presentation.assistantTurnId,
        confirmedBy: { kind: 'user-message' as const, actionId: 'select', turnId: 'turn-2', turnSequence: 2, occurredAt: '2030-01-01T00:00:01.000Z' },
      },
    } : {}),
    paths: [0, 1, 2].map((index) => ({
      id: `path-${index + 1}`, revision: 1, name: `Distinct path ${index + 1}`,
      servesWhy: `Way ${index + 1} to serve the North Star`, possibility: `Possibility ${index + 1}`,
      evidence: [`Evidence ${index + 1}`], centralUnknown: `Unknown ${index + 1}?`,
      projectPreview: `First project ${index + 1}`, practicalFit: `Practical fit ${index + 1}`,
      selection: status === 'active' ? (index === 0 ? 'active' as const : 'parked' as const) : 'available' as const,
      equalWeight: true as const,
    })) as CareerMap['pathSets'][number]['paths'],
  });
  return map;
}

describe('MethodMap', () => {
  it('shows only the stage and North Star statement without internal details', () => {
    const map = pathMap();
    const provenance = { kind: 'user-message' as const, actionId: 'evidence', turnId: 'turn-evidence', turnSequence: 1, occurredAt: presentation.presentedAt };
    map.foundation.evidence.push({ id: 'evidence-1', revision: 1, category: 'fascination', content: 'A previous answer.', provenance });
    map.foundation.constraints.push({ id: 'constraint-1', revision: 1, kind: 'time', description: 'A practical limit.', provenance });
    render(<MethodMap map={map} />);
    const checkpoint = screen.getByTestId('method-checkpoint');
    expect(checkpoint.textContent).toBe('Current focusCreate Purpose Paths');
    expect(screen.getByRole('heading', { name: 'Your North Star' })).toBeTruthy();
    expect(within(checkpoint).getByText('Current focus')).toBeTruthy();
    expect(screen.queryByText('Confirmed')).toBeNull();
    expect(screen.queryByText('Inspect Your North Star')).toBeNull();
    expect(screen.queryByText('People using them.')).toBeNull();
    expect(screen.queryByText('Complexity is a choice.')).toBeNull();
    const northStar = screen.getByRole('heading', { name: 'Your North Star' }).closest('section')!;
    expect(northStar.textContent).toBe('Your North StarMake difficult systems humane.');
    expect(screen.queryByText('A previous answer.')).toBeNull();
    expect(screen.queryByText('A practical limit.')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bFoundation\b|Why I Work/);
    expect(screen.getAllByTestId('purpose-path-card')).toHaveLength(3);
    const grid = document.querySelector('.purpose-path-comparison > .method-path-grid');
    expect(grid?.children).toHaveLength(3);
    expect([...grid!.children].every((child) => child.matches('[data-testid="purpose-path-card"]'))).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders active and parked paths through the same five-band cards without actions', () => {
    render(<MethodMap map={pathMap('active')} />);
    const cards = screen.getAllByTestId('purpose-path-card');
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText('Active')).toBeTruthy();
    expect(within(cards[1]).getByText('Parked')).toBeTruthy();
    expect(within(cards[2]).getByText('Parked')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([
    { basisPath: { id: 'path-1', revision: 1 }, linked: true },
    { basisPath: { id: 'another-path', revision: 1 }, linked: false },
    { basisPath: { id: 'path-1', revision: 2 }, linked: false },
    { basisPath: undefined, linked: false },
  ])('qualifies the original idea only for an exact saved project basis: $basisPath', ({ basisPath, linked }) => {
    const map = pathMap('active');
    const preview = 'The next piece of work has not been proposed.';
    map.pathSets[0].paths[0].projectPreview = preview;
    if (basisPath) map.projects.push({ ...simpleProject(), basisPath });
    const before = JSON.stringify(map);
    const { unmount } = render(<MethodMap map={map} />);
    const card = screen.getAllByTestId('purpose-path-card')[0];
    const context = 'This was the initial idea. See the project card for the developed brief and current status.';
    expect(within(card).getByText('Initial project idea')).toBeTruthy();
    expect(within(card).getByText(preview)).toBeTruthy();
    expect(!!within(card).queryByText(context)).toBe(linked);
    expect(screen.queryAllByText(context)).toHaveLength(linked ? 1 : 0);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    render(<MethodMap map={JSON.parse(before)} />);
    expect(screen.queryAllByText(context)).toHaveLength(linked ? 1 : 0);
    expect(screen.getByText(preview)).toBeTruthy();
    expect(JSON.stringify(map)).toBe(before);
  });

  it('does not present old paths or their project as serving a newly confirmed North Star', () => {
    const map = pathMap('active');
    map.projects.push({
      id: 'project-1', revision: 1, number: 1, basisPath: { id: 'path-1', revision: 1 },
      title: 'Old North Star project', outcome: 'Learn about the old direction.', audience: 'Teams',
      whyWanted: 'Curiosity', learningGoal: 'Learn', firstVersion: 'Small trial', firstStep: 'Start',
      decisionQuestion: 'Continue?', evidenceCue: 'Energy', agreementStatus: 'accepted',
      workStatus: 'not-started', workUpdates: [], presentation,
    });
    map.foundation.whyRevisions[0].status = 'superseded';
    map.foundation.whyRevisions.push({
      ...structuredClone(map.foundation.whyRevisions[0]), id: 'why-2', revision: 1,
      statement: 'Protect future generations from AI risks.', status: 'confirmed',
      supersedesWhyId: 'why-1',
      confirmation: {
        targetId: 'why-2', targetRevision: 1, presentedInTurnId: presentation.assistantTurnId,
        confirmedBy: { kind: 'user-message', actionId: 'reconfirm', turnId: 'turn-3', turnSequence: 3, occurredAt: '2030-01-01T00:00:02.000Z' },
      },
    });
    map.invalidations.push({
      id: 'review-paths', basisKind: 'why', basisId: 'why-2', basisRevision: 1,
      targetKind: 'path-set', targetId: 'set-1', targetRevision: 1,
      createdAtRevision: 3, status: 'pending',
    });

    const { rerender } = render(<MethodMap map={map} />);
    expect(screen.getByText('Protect future generations from AI risks.')).toBeTruthy();
    expect(screen.getByTestId('method-checkpoint').textContent).toBe('Current focusCreate Purpose Paths');
    expect(screen.getByText(/paths were created for your previous North Star/i)).toBeTruthy();
    expect(screen.queryByText('Three equal ways to serve your North Star, shown without ranking.')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'First Path Project' })).toBeNull();

    map.pathSets[0].status = 'superseded';
    map.pathSets.push({
      ...structuredClone(map.pathSets[0]), id: 'set-2', revision: 1, status: 'suggested',
      basisWhy: { id: 'why-2', revision: 1 },
      paths: map.pathSets[0].paths.map((path, index) => ({ ...path, id: `new-path-${index + 1}` })),
    });
    rerender(<MethodMap map={map} />);
    expect(screen.getByText('Three equal ways to serve your North Star, shown without ranking.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'First Path Project' })).toBeNull();
  });

  it('has no empty-map action', () => {
    render(<MethodMap map={createCareerMap('empty')} />);
    expect(screen.getByRole('heading', { name: 'Nothing on your map yet' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses Your North Star while the internal foundation module is active', () => {
    const map = createCareerMap('foundation-copy');
    map.foundation.evidence.push({
      id: 'evidence-1', revision: 1, category: 'fascination', content: 'Making complexity useful.',
      provenance: { kind: 'user-message', actionId: 'message-1', turnId: 'turn-1', turnSequence: 1, occurredAt: presentation.presentedAt },
    });
    render(<MethodMap map={map} />);
    expect(screen.getByRole('heading', { name: 'Form Your North Star' })).toBeTruthy();
    expect(screen.queryByText('Your North Star in progress')).toBeNull();
    expect(screen.queryByText('Making complexity useful.')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bFoundation\b|Why I Work/);
  });

  it('shows the North Star stage without exposing an internal revision focus', () => {
    const map = createCareerMap('foundation-review');
    map.foundation.evidence.push({
      id: 'evidence-1', revision: 1, category: 'fascination', content: 'Making complexity useful.',
      provenance: { kind: 'user-message', actionId: 'message-1', turnId: 'turn-1', turnSequence: 1, occurredAt: presentation.presentedAt },
    });
    map.focus = {
      kind: 'foundation-revision', reason: 'Revisit direction',
      openedBy: { kind: 'user-message', actionId: 'message-2', turnId: 'turn-2', turnSequence: 2, occurredAt: presentation.presentedAt },
    };
    render(<MethodMap map={map} />);
    const checkpoint = screen.getByTestId('method-checkpoint');
    expect(within(checkpoint).getByRole('heading', { name: 'Form Your North Star' })).toBeTruthy();
    expect(checkpoint.textContent).toBe('Current focusForm Your North Star');
  });
});

const action = { kind: 'user-message' as const, actionId: 'select', turnId: 'turn-2', turnSequence: 2, occurredAt: presentation.presentedAt };
function simpleProject(number = 1): CareerMap['projects'][number] {
  return { id: `project-${number}`, revision: 1, number, basisPath: { id: 'path-1', revision: 1 },
    briefFormat: 'simple-v1', relationship: 'linked', title: `Useful trial ${number}`,
    learningGoal: 'Will making a small aid pull me back? Notice energy after each trial.',
    firstVersion: 'One usable sketch; stop after one trial.', firstStep: 'Sketch one confusing moment.',
    agreementStatus: 'accepted', workStatus: 'not-started', workUpdates: [], presentation };
}

describe('repeating learning presentation', () => {
  it('shows the simple learning brief in order without fabricated legacy fields or reply controls', () => {
    const map = pathMap('active');
    map.projects.push({ ...simpleProject(), relationship: 'unrelated' });
    render(<MethodMap map={map} />);
    const card = screen.getByTestId('path-project-card');
    expect([...card.querySelectorAll('dt')].map((label) => label.textContent)).toEqual([
      "What you'll learn", "What you'll make", 'Suggested starting point',
    ]);
    expect(within(card).getByText(simpleProject().learningGoal)).toBeTruthy();
    expect(within(card).getByText(simpleProject().firstVersion)).toBeTruthy();
    expect(within(card).getByText(simpleProject().firstStep)).toBeTruthy();
    expect(card.querySelector('details')).toBeNull();
    expect(screen.getByText('Intentionally unrelated to your current Purpose Path.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Audience|Decision question|Choose one formal|begin Side Doors/i);
  });

  it('keeps legacy detail collapsed while showing its learning and starting point', () => {
    const map = readCareerMap(legacyProof);
    render(<MethodMap map={map} />);
    const card = screen.getAllByTestId('path-project-card')[0];
    expect(within(card).getByText("What you'll learn")).toBeTruthy();
    expect(within(card).getByText(map.projects[0].learningGoal)).toBeTruthy();
    expect(card.querySelector('details')?.open).toBe(false);
    expect(within(card).getByText(map.projects[0].audience!)).toBeTruthy();
  });

  it('uses the current project reflection and focus tenure, keeping older learning inspectable', () => {
    const map = pathMap('active');
    map.operationHistory.push({ sourceId: 'selection-source', operationType: 'select-purpose-path', fromRevision: 0, toRevision: 1, replayed: false, committedAt: presentation.presentedAt, confirmationProvenance: action } as CareerMap['operationHistory'][number]);
    map.pathFocusCommitments.push({ id: 'focus', revision: 1, basisPath: { id: 'path-1', revision: 1 }, selectionSourceId: 'selection-source', action });
    map.projects.push({ ...simpleProject(), agreementStatus: 'parked' }, simpleProject(2));
    map.reflections.push({ id: 'new-reflection', revision: 1, projectBasis: { id: 'project-2', revision: 1 }, status: 'open', openedBy: action,
      evidence: [{ id: 'new-evidence', revision: 1, observation: 'Current project energy', interpretation: 'Worth trying again', signal: 'energy', provenance: action }] });
    map.reflections.push({ id: 'old-reflection', revision: 1, projectBasis: { id: 'project-1', revision: 1 }, status: 'closed', openedBy: action,
      evidence: [{ id: 'old-evidence', revision: 1, observation: 'Older learning', interpretation: 'Earlier signal', signal: 'energy', provenance: action }] });
    const { rerender } = render(<MethodMap map={map} />);
    const learning = screen.getByTestId('current-project-learning');
    expect(learning.textContent).toContain('Current project energy');
    expect(learning.textContent).not.toContain('Older learning');
    expect(screen.getByText('Older learning — Earlier signal')).toBeTruthy();
    expect(screen.getByTestId('current-path-focus').textContent).toContain('Distinct path 1');
    expect(screen.getByTestId('current-path-focus').textContent).toContain('Keep learning');
    map.pathFocusCommitments[0].selectionSourceId = 'old-selection';
    rerender(<MethodMap map={map} />);
    expect(screen.queryByTestId('current-path-focus')).toBeNull();
  });

  it('moves previous-path learning into history after a direction change or North Star revision', () => {
    const map = pathMap('active');
    map.projects.push(simpleProject());
    map.reflections.push({ id: 'reflection-1', revision: 1, projectBasis: { id: 'project-1', revision: 1 }, status: 'closed', openedBy: action, evidence: [] });
    map.continueChoices.push({ id: 'choice-1', revision: 1, reflectionBasis: { id: 'reflection-1', revision: 1 }, wantsToContinue: true, action });
    map.nextMoves.push({ id: 'move-1', revision: 1, continueChoiceBasis: { id: 'choice-1', revision: 1 }, kind: 'commit-provisionally', action });
    map.pathSets[0].paths[0].selection = 'parked';
    map.pathSets[0].paths[1].selection = 'active';
    const { rerender } = render(<MethodMap map={map} />);
    expect(screen.queryByTestId('current-project-learning')).toBeNull();
    expect(screen.queryByText('You chose to focus on this path and keep learning.')).toBeNull();
    expect(screen.getByText('Commit provisionally')).toBeTruthy();
    map.pathSets[0].paths[0].selection = 'active';
    map.pathSets[0].paths[1].selection = 'parked';
    map.foundation.whyRevisions[0].status = 'superseded';
    rerender(<MethodMap map={map} />);
    expect(screen.queryByTestId('current-project-learning')).toBeNull();
    expect(screen.queryByText('You chose to focus on this path and keep learning.')).toBeNull();
  });

  it('keeps historical tail records collapsed and read-only without active tail instructions', () => {
    const map = readCareerMap(legacyProof);
    const before = structuredClone(map);
    render(<MethodMap map={map} />);
    const history = screen.getByTestId('historical-method-records');
    expect((history as HTMLDetailsElement).open).toBe(false);
    expect(history.textContent).toContain(map.peerExposures[0].subject);
    expect(history.textContent).toContain(map.proofRevisions[0].artifacts[0]);
    expect(history.textContent).toContain('Committed provisionally');
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toMatch(/begin Side Doors|Choose your Next Move|Choose one formal next step/);
    expect(map).toEqual(before);
  });
});


it('labels report-derived proceeding without claiming agreement and shows reported work', () => {
  const proposed=applyCareerMapOperation(pathMap('active'), {type:'propose-first-project',sourceId:'ui-project',expectedRevision:0,occurredAt:presentation.presentedAt,payload:{project:{id:'ui-report-project',revision:1,briefFormat:'simple-v1',relationship:'linked',title:'Interview a volunteer',learningGoal:'Notice energy',firstVersion:'One interview',firstStep:'Arrange it'},presentation:{...presentation,turnSequence:3}}});
  if(proposed.status!=='committed') throw new Error('UI project fixture failed');
  const report=applyCareerMapOperation(proposed.map,{type:'report-project-work',sourceId:'ui-work-report',expectedRevision:proposed.map.revision,occurredAt:presentation.presentedAt,payload:{projectId:'ui-report-project',projectRevision:1,status:'in-progress',reportedActivity:'I arranged the first interview.',action:{kind:'user-message',actionId:'ui-message',turnId:'ui-turn',turnSequence:4,occurredAt:presentation.presentedAt}}});
  if(report.status!=='committed') throw new Error('UI report fixture failed');
  render(<MethodMap map={report.map}/>);
  expect(screen.getByText('Proceeding from reported work')).toBeTruthy();
  expect(screen.queryByText('Agreement: Accepted')).toBeNull();
  expect(screen.queryByText('Accepted firsthand experiment')).toBeNull();
  expect(screen.getByText('I arranged the first interview.')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});

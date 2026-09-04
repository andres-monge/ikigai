// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCareerMap, type CareerMap } from '@shared/career-map';
import { MethodMap } from './method-map';

afterEach(cleanup);

const presentation = {
  kind: 'model-presentation' as const,
  assistantTurnId: 'assistant-turn-1', turnSequence: 1, completed: true as const,
  presentedAt: '2030-01-01T00:00:00.000Z',
};

function pathMap(): CareerMap {
  const map = createCareerMap('explorer-1');
  map.foundation.whyRevisions.push({
    id: 'why-1', revision: 1, statement: 'Make difficult systems humane.', serves: 'People using them.',
    pointOfView: 'Complexity is a choice.', status: 'confirmed', presentation,
    confirmation: {
      confirmedBy: { kind: 'ui-action', actionId: 'a', turnId: 't', turnSequence: 2, occurredAt: '2030-01-01T00:00:01.000Z' },
      presentedInTurnId: 'assistant-turn-1',
    },
  });
  map.pathSets.push({
    id: 'set-1', revision: 1, status: 'suggested', basisWhy: { id: 'why-1', revision: 1 },
    presentation, changeKind: 'initial',
    paths: [0, 1, 2].map((index) => ({
      id: `path-${index + 1}`, revision: 1, name: `Distinct path ${index + 1}`,
      servesWhy: `Way ${index + 1} to serve the Why`, possibility: `Possibility ${index + 1}`,
      evidence: [`Evidence ${index + 1}`], centralUnknown: `Unknown ${index + 1}?`,
      projectPreview: `First project ${index + 1}`, practicalFit: `Practical fit ${index + 1}`,
      selection: 'available' as const, equalWeight: true as const,
    })) as CareerMap['pathSets'][number]['paths'],
  });
  return map;
}

function selectedPathMap(): CareerMap {
  const map = pathMap();
  const set = map.pathSets[0];
  set.status = 'active';
  set.confirmation = {
    targetId: set.id,
    targetRevision: set.revision,
    presentedInTurnId: presentation.assistantTurnId,
    confirmedBy: {
      kind: 'ui-action', actionId: 'select-path', turnId: 'turn-select', turnSequence: 2,
      occurredAt: '2030-01-01T00:00:01.000Z',
    },
  };
  set.paths = set.paths.map((path, index) => ({
    ...path,
    selection: index === 0 ? 'active' as const : 'parked' as const,
  })) as CareerMap['pathSets'][number]['paths'];
  return map;
}

describe('MethodMap', () => {
  it('renders current Foundation evidence before a Why and hides superseded evidence', () => {
    const map = createCareerMap('foundation-in-progress');
    const provenance = {
      kind: 'user-message' as const, actionId: 'message-1', turnId: 'turn-1',
      turnSequence: 1, occurredAt: '2030-01-01T00:00:00.000Z',
    };
    map.foundation.evidence.push(
      { id: 'old-evidence', revision: 1, category: 'fascination', content: 'Old wording', provenance },
      { id: 'new-evidence', revision: 1, category: 'fascination', content: 'I lose track of time making complex ideas useful.', provenance, supersedesEvidenceId: 'old-evidence' },
    );
    map.foundation.constraints.push({
      id: 'constraint-1', revision: 1, kind: 'time', description: 'Five hours each week', provenance,
    });

    render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'What we know so far' })).toBeTruthy();
    expect(screen.getByText('I lose track of time making complex ideas useful.')).toBeTruthy();
    expect(screen.queryByText('Old wording')).toBeNull();
    expect(screen.getByText(/Five hours each week/)).toBeTruthy();
  });

  it('puts the canonical Method checkpoint and pending decision first', () => {
    render(<MethodMap map={pathMap()} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);

    const checkpoint = screen.getByTestId('method-checkpoint');
    expect(within(checkpoint).getByRole('heading', { name: 'Create Purpose Paths' })).toBeTruthy();
    expect(within(checkpoint).getByText('Pending decision: Choose a Purpose Path')).toBeTruthy();
    expect(checkpoint.compareDocumentPosition(screen.getByRole('heading', { name: 'Why You Work' }))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the selected exact-three equal-weight Purpose Paths contract', () => {
    render(<MethodMap map={pathMap()} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Why You Work' })).toBeTruthy();
    expect(screen.getAllByTestId('purpose-path-card')).toHaveLength(3);
    expect(screen.getByText('Path 01')).toBeTruthy();
    expect(screen.getByText('Path 02')).toBeTruthy();
    expect(screen.getByText('Path 03')).toBeTruthy();
    expect(screen.queryByText(/recommended/i)).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getAllByText('The central unknown')).toHaveLength(3);
    expect(screen.getAllByText('First project')).toHaveLength(3);
    expect(screen.getAllByText('Available')).toHaveLength(3);
  });

  it('compacts a selected path and progressively discloses the parked alternatives', () => {
    render(<MethodMap map={selectedPathMap()} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);

    expect(screen.queryAllByTestId('purpose-path-card')).toHaveLength(0);
    expect(screen.getByTestId('purpose-path-active')).toBeTruthy();
    expect(screen.getAllByTestId('purpose-path-parked')).toHaveLength(2);
    expect(screen.getByText('Parked Purpose Paths (2)')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getAllByText('Parked')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Three ways to serve that' })).toBeNull();
  });

  it('keeps a revised suggested set as the full comparison beside compact active context', () => {
    const map = selectedPathMap();
    const activeSet = map.pathSets[0];
    map.pathSets.push({
      ...structuredClone(activeSet),
      id: 'set-revision', revision: 2, status: 'suggested', changeKind: 'revision',
      supersedesSetId: activeSet.id, confirmation: undefined,
      paths: activeSet.paths.map((path, index) => ({
        ...structuredClone(path), id: `revised-path-${index + 1}`, selection: 'available' as const,
      })) as CareerMap['pathSets'][number]['paths'],
    });

    render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);

    expect(screen.getByTestId('purpose-path-active')).toBeTruthy();
    expect(screen.getAllByTestId('purpose-path-card')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Three ways to serve that' })).toBeTruthy();
    expect(screen.getAllByText('Available')).toHaveLength(3);
  });

  it('makes selection explicit while rewrite and replace only prepare conversation', () => {
    const onOperation = vi.fn();
    const onConversationPrompt = vi.fn();
    render(<MethodMap map={pathMap()} busy={false} onOperation={onOperation} onConversationPrompt={onConversationPrompt} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite path 1: Distinct path 1' }));
    expect(onConversationPrompt).toHaveBeenCalledWith(expect.stringContaining('rewrite only “Distinct path 1”'));
    expect(onOperation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start path 2: Distinct path 2' }));
    expect(onOperation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'select-purpose-path',
      input: expect.objectContaining({ setId: 'set-1', pathId: 'path-2' }),
    }));
  });

  it('uses initial selection when a replacement set has no canonical active path', () => {
    const map = pathMap();
    map.pathSets[0].changeKind = 'replacement';
    const onOperation = vi.fn();
    render(<MethodMap map={map} busy={false} onOperation={onOperation} onConversationPrompt={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start path 1: Distinct path 1' }));
    expect(onOperation).toHaveBeenCalledWith(expect.objectContaining({ type: 'select-purpose-path' }));
  });

  it('uses revision confirmation when canonical state already has an active path', () => {
    const map = pathMap();
    const suggested = map.pathSets[0];
    suggested.id = 'set-revision';
    suggested.revision = 2;
    suggested.changeKind = 'revision';
    suggested.supersedesSetId = 'set-active';
    map.pathSets.unshift({
      ...structuredClone(suggested),
      id: 'set-active',
      revision: 1,
      status: 'active',
      changeKind: 'initial',
      supersedesSetId: undefined,
      confirmation: {
        targetId: 'set-active',
        targetRevision: 1,
        presentedInTurnId: presentation.assistantTurnId,
        confirmedBy: {
          kind: 'ui-action', actionId: 'select-active', turnId: 'turn-active', turnSequence: 2,
          occurredAt: '2030-01-01T00:00:01.000Z',
        },
      },
      paths: suggested.paths.map((path, index) => ({
        ...structuredClone(path),
        selection: index === 0 ? 'active' as const : 'parked' as const,
      })) as CareerMap['pathSets'][number]['paths'],
    });
    const onOperation = vi.fn();
    render(<MethodMap map={map} busy={false} onOperation={onOperation} onConversationPrompt={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start path 1: Distinct path 1' }));
    expect(onOperation).toHaveBeenCalledWith(expect.objectContaining({ type: 'confirm-purpose-path-revision' }));
  });

  it.each(['not-started', 'in-progress', 'stopped', 'completed'] as const)(
    'renders reflection alongside a project at %s work status',
    (workStatus) => {
      const map = pathMap();
      map.projects.push({
        id: 'project-1', revision: 1, number: 1, basisPath: { id: 'path-1', revision: 1 },
        title: 'A firsthand experiment', outcome: 'Make one small thing.', audience: 'One real person',
        whyWanted: 'It tests the path.', learningGoal: 'Notice energy.', firstVersion: 'One page.',
        firstStep: 'Call one person.', decisionQuestion: 'Do I want another?', evidenceCue: 'Firsthand notes.',
        agreementStatus: 'accepted', workStatus, workUpdates: [], presentation,
      });
      map.reflections.push({
        id: 'reflection-1', revision: 1, projectBasis: { id: 'project-1', revision: 1 },
        status: 'open', openedBy: { kind: 'ui-action', actionId: 'a', turnId: 't', turnSequence: 2, occurredAt: '2030-01-01T00:00:01.000Z' },
        evidence: [],
      });
      render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);
      expect(screen.getByText(`Work: ${workStatus.replace('-', ' ').replace(/^./u, (first) => first.toUpperCase())}`)).toBeTruthy();
      expect(screen.getByText('What You Learned · open')).toBeTruthy();
    },
  );

  it('keeps the first project singular and renders exactly three equal follow-on choices', () => {
    const map = pathMap();
    map.projects.push({
      id: 'project-1', revision: 1, number: 1, basisPath: { id: 'path-1', revision: 1 },
      title: 'Only first proposal', outcome: 'One outcome', audience: 'One person', whyWanted: 'Why',
      learningGoal: 'Learn', firstVersion: 'Small', firstStep: 'Begin', decisionQuestion: 'Continue?',
      evidenceCue: 'Notice', agreementStatus: 'suggested', workStatus: 'not-started', workUpdates: [], presentation,
    });
    map.projectOptionSets.push({
      id: 'options-2', revision: 1, status: 'suggested', projectNumber: 2,
      basisPath: { id: 'path-1', revision: 1 }, basisNextMove: { id: 'move-1', revision: 1 }, presentation,
      projects: [1, 2, 3].map((number) => ({
        id: `option-${number}`, revision: 1, title: `Follow-on ${number}`, outcome: `Outcome ${number}`,
        audience: 'One person', whyWanted: 'Why', learningGoal: 'Learn', firstVersion: 'Small', firstStep: 'Begin',
        decisionQuestion: 'Continue?', evidenceCue: 'Notice', selection: 'available' as const, equalWeight: true as const,
      })) as CareerMap['projectOptionSets'][number]['projects'],
    });
    render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);
    expect(screen.getAllByRole('heading', { name: 'First Path Project' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Path Project 2' })).toBeTruthy();
    const projectCards = screen.getAllByTestId('path-project-card');
    expect(projectCards).toHaveLength(4);
    for (const card of projectCards.slice(1)) expect(within(card).getByText('Available')).toBeTruthy();
    expect(screen.getByText('One proposal for collaborative refinement')).toBeTruthy();
    expect(within(projectCards[0]).getByText('Agreement: Suggested')).toBeTruthy();
    expect(within(projectCards[0]).getByText('One person')).toBeTruthy();
    expect(within(projectCards[0]).getByText('Why')).toBeTruthy();
    expect(within(projectCards[0]).getByText('Notice')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review before accepting' })).toBeTruthy();
  });

  it('offers explicit acceptance only after the durable first-project framing marker', () => {
    const map = selectedPathMap();
    map.projects.push({
      id: 'project-1', revision: 1, number: 1, basisPath: { id: 'path-1', revision: 1 },
      title: 'Framed project', outcome: 'One outcome', audience: 'One person', whyWanted: 'Why',
      learningGoal: 'Learn', firstVersion: 'Small', firstStep: 'Begin', decisionQuestion: 'Continue?',
      evidenceCue: 'Notice', agreementStatus: 'suggested', workStatus: 'not-started', workUpdates: [], presentation,
      acceptanceFraming: {
        locale: 'en', framingText: 'Exact framing',
        acceptancePhrase: 'I explicitly accept this Path Project.',
        acceptanceQuestion: 'Will you explicitly accept by replying with the exact phrase?',
        moduleVersion: '1.1.1', status: 'delivered', assistantTurnId: 'framing-turn',
        turnSequence: 2, initiatedAt: presentation.presentedAt,
        presentation: { ...presentation, assistantTurnId: 'framing-turn', turnSequence: 2 },
      },
    });
    const onConversationPrompt = vi.fn();
    render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={onConversationPrompt} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept this project' }));
    expect(onConversationPrompt).toHaveBeenCalledWith('I explicitly accept this Path Project.');
    expect(onConversationPrompt).not.toHaveBeenCalledWith(expect.stringContaining('Framed project'));
    expect(screen.queryByRole('button', { name: 'Review before accepting' })).toBeNull();
  });

  it('separates accepted project agreement from work and shows selected follow-on states', () => {
    const map = selectedPathMap();
    map.projects.push({
      id: 'project-2', revision: 1, number: 2, basisPath: { id: 'path-1', revision: 1 },
      title: 'Accepted field test', outcome: 'Help one real team', audience: 'Operations leads',
      whyWanted: 'They asked for a clearer workflow', learningGoal: 'Learn where ambiguity remains',
      firstVersion: 'A facilitated walkthrough', firstStep: 'Schedule the walkthrough',
      decisionQuestion: 'Should this path continue?', evidenceCue: 'Watch where the team gets stuck',
      agreementStatus: 'accepted', workStatus: 'in-progress', workUpdates: [], presentation,
    });
    map.projectOptionSets.push({
      id: 'options-2', revision: 1, status: 'selected', projectNumber: 2,
      basisPath: { id: 'path-1', revision: 1 }, basisNextMove: { id: 'move-1', revision: 1 }, presentation,
      projects: [1, 2, 3].map((number) => ({
        id: `option-${number}`, revision: 1, title: `Option ${number}`, outcome: `Outcome ${number}`,
        audience: `Audience ${number}`, whyWanted: `Wanted ${number}`, learningGoal: 'Learn',
        firstVersion: 'Small', firstStep: 'Begin', decisionQuestion: 'Continue?', evidenceCue: `Cue ${number}`,
        selection: number === 2 ? 'active' as const : 'parked' as const, equalWeight: true as const,
      })) as CareerMap['projectOptionSets'][number]['projects'],
    });

    render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);

    expect(screen.getByText('Accepted firsthand experiment')).toBeTruthy();
    expect(screen.queryByText('One proposal for collaborative refinement')).toBeNull();
    const acceptedCard = screen.getAllByTestId('path-project-card')[0];
    expect(within(acceptedCard).getByText('Agreement: Accepted')).toBeTruthy();
    expect(within(acceptedCard).getByText('Work: In progress')).toBeTruthy();
    expect(within(acceptedCard).getByText('Operations leads')).toBeTruthy();
    expect(within(acceptedCard).getByText('They asked for a clearer workflow')).toBeTruthy();
    expect(within(acceptedCard).getByText('Watch where the team gets stuck')).toBeTruthy();
    expect(within(acceptedCard).getByText('Inspect project details').closest('details')?.hasAttribute('open')).toBe(false);
    const optionCards = screen.getAllByTestId('path-project-card').slice(1);
    expect(within(optionCards[0]).getByText('Parked')).toBeTruthy();
    expect(within(optionCards[1]).getByText('Active')).toBeTruthy();
    expect(within(optionCards[2]).getByText('Parked')).toBeTruthy();
  });

  it.each([
    ['explore-further', 'Explore further with another Path Project.'],
    ['commit-provisionally', 'Commit provisionally and begin Side Doors.'],
    ['return-to-paths', 'Return to Purpose Paths.'],
  ] as const)('renders the %s Next Move branch from canonical state', (kind, expected) => {
    const map = pathMap();
    map.reflections.push({
      id: 'reflection-1', revision: 1, projectBasis: { id: 'project-1', revision: 1 },
      status: 'closed',
      openedBy: { kind: 'ui-action', actionId: 'open', turnId: 't', turnSequence: 1, occurredAt: '2030-01-01T00:00:01.000Z' },
      closedBy: { kind: 'ui-action', actionId: 'close', turnId: 't', turnSequence: 2, occurredAt: '2030-01-01T00:00:02.000Z' },
      evidence: [],
    });
    map.continueChoices.push({
      id: 'choice-1', revision: 1, reflectionBasis: { id: 'reflection-1', revision: 1 },
      wantsToContinue: kind !== 'return-to-paths',
      action: { kind: 'ui-action', actionId: 'choose', turnId: 't', turnSequence: 3, occurredAt: '2030-01-01T00:00:03.000Z' },
    });
    map.nextMoves.push({
      id: 'move-1', revision: 1, continueChoiceBasis: { id: 'choice-1', revision: 1 }, kind,
      action: { kind: 'ui-action', actionId: 'a', turnId: 't', turnSequence: 4, occurredAt: '2030-01-01T00:00:04.000Z' },
    });
    render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('offers only the two formal continue choices until the correlated Next Move exists', () => {
    const map = pathMap();
    map.reflections.push({
      id: 'reflection-1', revision: 1, projectBasis: { id: 'project-1', revision: 1 }, status: 'closed',
      openedBy: { kind: 'ui-action', actionId: 'open', turnId: 't', turnSequence: 1, occurredAt: '2030-01-01T00:00:01.000Z' },
      closedBy: { kind: 'ui-action', actionId: 'close', turnId: 't', turnSequence: 2, occurredAt: '2030-01-01T00:00:02.000Z' },
      evidence: [],
    });
    map.continueChoices.push({
      id: 'choice-1', revision: 1, reflectionBasis: { id: 'reflection-1', revision: 1 }, wantsToContinue: true,
      action: { kind: 'ui-action', actionId: 'choose', turnId: 't', turnSequence: 3, occurredAt: '2030-01-01T00:00:03.000Z' },
    });
    const onConversationPrompt = vi.fn();
    render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={onConversationPrompt} />);

    expect(screen.getByRole('button', { name: 'Explore further' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Commit provisionally' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Return to Purpose Paths' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Explore further' }));
    expect(onConversationPrompt).toHaveBeenCalledWith('I want to explore further with another Path Project.');
  });

  it('offers only return to Purpose Paths when the latest reflection choice is not to continue', () => {
    const map = pathMap();
    map.reflections.push({
      id: 'reflection-1', revision: 1, projectBasis: { id: 'project-1', revision: 1 }, status: 'closed',
      openedBy: { kind: 'ui-action', actionId: 'open', turnId: 't', turnSequence: 1, occurredAt: '2030-01-01T00:00:01.000Z' },
      closedBy: { kind: 'ui-action', actionId: 'close', turnId: 't', turnSequence: 2, occurredAt: '2030-01-01T00:00:02.000Z' },
      evidence: [],
    });
    map.continueChoices.push({
      id: 'choice-1', revision: 1, reflectionBasis: { id: 'reflection-1', revision: 1 }, wantsToContinue: false,
      action: { kind: 'ui-action', actionId: 'choose', turnId: 't', turnSequence: 3, occurredAt: '2030-01-01T00:00:03.000Z' },
    });
    const onConversationPrompt = vi.fn();
    render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={onConversationPrompt} />);

    expect(screen.getByRole('button', { name: 'Return to Purpose Paths' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explore further' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Commit provisionally' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Purpose Paths' }));
    expect(onConversationPrompt).toHaveBeenCalledWith('I want to return to Purpose Paths.');
  });

  it('does not display an older Next Move for a newer reflection choice', () => {
    const map = pathMap();
    for (const number of [1, 2]) {
      map.reflections.push({
        id: `reflection-${number}`, revision: 1, projectBasis: { id: `project-${number}`, revision: 1 }, status: 'closed',
        openedBy: { kind: 'ui-action', actionId: `open-${number}`, turnId: 't', turnSequence: number, occurredAt: `2030-01-01T00:00:0${number}.000Z` },
        closedBy: { kind: 'ui-action', actionId: `close-${number}`, turnId: 't', turnSequence: number + 2, occurredAt: `2030-01-01T00:00:0${number + 2}.000Z` },
        evidence: [],
      });
      map.continueChoices.push({
        id: `choice-${number}`, revision: 1, reflectionBasis: { id: `reflection-${number}`, revision: 1 }, wantsToContinue: false,
        action: { kind: 'ui-action', actionId: `choose-${number}`, turnId: 't', turnSequence: number + 4, occurredAt: `2030-01-01T00:00:0${number + 4}.000Z` },
      });
    }
    map.nextMoves.push({
      id: 'move-1', revision: 1, continueChoiceBasis: { id: 'choice-1', revision: 1 }, kind: 'commit-provisionally',
      action: { kind: 'ui-action', actionId: 'move', turnId: 't', turnSequence: 7, occurredAt: '2030-01-01T00:00:07.000Z' },
    });

    render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);
    expect(screen.queryByText('Commit provisionally and begin Side Doors.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Return to Purpose Paths' })).toBeTruthy();
  });

  it('presents commitment, complete proof, and Side Door context without adding actions', () => {
    const map = selectedPathMap();
    const action = (actionId: string, turnSequence: number) => ({
      kind: 'ui-action' as const, actionId, turnId: 'turn-method', turnSequence,
      occurredAt: `2030-01-01T00:00:${String(turnSequence).padStart(2, '0')}.000Z`,
    });
    map.reflections.push({
      id: 'reflection-1', revision: 1, projectBasis: { id: 'project-1', revision: 1 }, status: 'closed',
      openedBy: action('open-reflection', 3), closedBy: action('close-reflection', 4), evidence: [],
    });
    map.continueChoices.push({
      id: 'choice-1', revision: 1, reflectionBasis: { id: 'reflection-1', revision: 1 },
      wantsToContinue: true, action: action('continue', 5),
    });
    map.nextMoves.push({
      id: 'move-1', revision: 1, continueChoiceBasis: { id: 'choice-1', revision: 1 },
      kind: 'commit-provisionally', action: action('commit-intent', 6),
    });
    map.peerExposures.push({
      id: 'peer-1', revision: 1, subjectKind: 'first-person-source', subject: 'A practicing service designer',
      insight: 'Credible change starts with one observed workflow.', basisPath: { id: 'path-1', revision: 1 },
      status: 'confirmed', presentation,
    });
    map.commitmentIntent = {
      id: 'intent-1', revision: 1, basisPath: { id: 'path-1', revision: 1 },
      basisNextMove: { id: 'move-1', revision: 1 }, status: 'completed', action: action('intent', 7),
    };
    map.provisionalCommitment = {
      id: 'commitment-1', revision: 1, basisPath: { id: 'path-1', revision: 1 },
      basisNextMove: { id: 'move-1', revision: 1 }, basisPeerExposure: { id: 'peer-1', revision: 1 },
      status: 'confirmed', action: action('commit', 8),
    };
    map.proofRevisions.push({
      id: 'proof-1', revision: 1, basisCommitment: { id: 'commitment-1', revision: 1 }, status: 'confirmed', presentation,
      artifacts: ['Workflow field guide'], problemsSolved: ['Reduced handoff ambiguity'], peopleHelped: ['Operations leads'],
      usefulQualities: ['Patient synthesis'], knowledge: ['Service blueprinting'], relationships: ['Design community'],
      pointsOfView: ['Complexity should be made inspectable'], shareableMaterial: ['Annotated case study'],
    });
    map.sideDoorSets.push({
      id: 'doors-1', revision: 1, status: 'active', basisProof: { id: 'proof-1', revision: 1 }, presentation,
      doors: [1, 2, 3].map((number) => ({
        id: `door-${number}`, revision: 1, name: `Side Door ${number}`, target: `Team ${number}`,
        proofValue: `Proof value ${number}`, contribution: `Useful contribution ${number}`,
        firstMove: `Small move ${number}`, accessConstraints: [`Constraint ${number}`],
        selection: number === 1 ? 'active' as const : 'parked' as const, equalWeight: true as const,
      })) as CareerMap['sideDoorSets'][number]['doors'],
    });

    render(<MethodMap map={map} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);

    expect(within(screen.getByTestId('method-checkpoint')).getByRole('heading', { name: 'Enter Through Side Doors' })).toBeTruthy();
    const intent = screen.getByTestId('commitment-intent');
    expect(within(intent).getByText('Commitment intent · Completed')).toBeTruthy();
    expect(within(intent).getByText('Distinct path 1')).toBeTruthy();
    expect(within(intent).getByText('Commit provisionally')).toBeTruthy();
    const commitment = screen.getByTestId('provisional-commitment');
    expect(within(commitment).getByText('Provisional commitment · Confirmed')).toBeTruthy();
    expect(within(commitment).getByText('A practicing service designer')).toBeTruthy();

    expect(screen.getByText('Reduced handoff ambiguity')).toBeTruthy();
    expect(screen.getByText('Patient synthesis')).toBeTruthy();
    expect(screen.getByText('Design community')).toBeTruthy();
    expect(screen.getByText('Complexity should be made inspectable')).toBeTruthy();
    const doorCards = screen.getAllByTestId('side-door-card');
    expect(doorCards).toHaveLength(3);
    expect(within(doorCards[0]).getByText(/Proof value 1/)).toBeTruthy();
    expect(within(doorCards[0]).getByText('Active')).toBeTruthy();
    expect(within(doorCards[1]).getByText('Parked')).toBeTruthy();
    expect(within(intent).queryByRole('button')).toBeNull();
    expect(within(commitment).queryByRole('button')).toBeNull();
  });

  it('shows an empty canonical map without treating it as a fetch failure', () => {
    render(<MethodMap map={createCareerMap('explorer-1')} busy={false} onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);
    expect(screen.getByText('Nothing on your map yet')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names why canonical actions are disabled during a turn and refetch', () => {
    render(<MethodMap map={pathMap()} busy onOperation={vi.fn()} onConversationPrompt={vi.fn()} />);
    const workspace = screen.getByRole('group', { name: 'Method workspace' });
    expect(workspace.getAttribute('aria-busy')).toBe('true');
    expect(workspace.getAttribute('aria-describedby')).toBe('method-actions-disabled-reason');
    expect(screen.getByText(/unavailable until the current turn finishes/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Start path 1: Distinct path 1' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

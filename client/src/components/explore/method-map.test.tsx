// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createCareerMap, type CareerMap } from '@shared/career-map';
import { MethodMap } from './method-map';

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
  it('keeps canonical checkpoint/status text and a readable North Star context', () => {
    render(<MethodMap map={pathMap()} />);
    const checkpoint = screen.getByTestId('method-checkpoint');
    expect(within(checkpoint).getByText('Pending decision: Choose a Purpose Path')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your North Star' })).toBeTruthy();
    expect(within(checkpoint).getByText('Current focus')).toBeTruthy();
    expect(screen.queryByText('Confirmed')).toBeNull();
    expect(screen.queryByText('Inspect Your North Star')).toBeNull();
    expect(screen.queryByText('People using them.')).toBeNull();
    expect(screen.getByText('Complexity is a choice.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bFoundation\b|Why I Work/);
    expect(screen.getAllByTestId('purpose-path-card')).toHaveLength(3);
    const grid = document.querySelector('.purpose-path-comparison > .method-path-grid');
    expect(grid?.children).toHaveLength(3);
    expect([...grid!.children].every((child) => child.matches('[data-testid="purpose-path-card"]'))).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders active and parked paths through the same seven-band cards without actions', () => {
    render(<MethodMap map={pathMap('active')} />);
    const cards = screen.getAllByTestId('purpose-path-card');
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText('Active')).toBeTruthy();
    expect(within(cards[1]).getByText('Parked')).toBeTruthy();
    expect(within(cards[2]).getByText('Parked')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
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
    expect(screen.getByText('Your North Star in progress')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bFoundation\b|Why I Work/);
  });
});

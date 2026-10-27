// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App, LearningState } from '../../scripts/replay-lab/ui';
import type { Candidate, Checkpoint, Job, LabState } from '../../scripts/replay-lab/types';
import { createCareerMap, type CareerMap } from '../../shared/career-map';

afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

function savedLearningMap() {
  const map = createCareerMap('synthetic-user');
  map.focus = { kind: 'foundation-revision', reason: 'The contribution may have changed.', openedBy: {} as never };
  map.projects.push({ id: 'project', revision: 1, number: 1, title: 'Make a tiny model',
    learningGoal: 'Do I enjoy investigating surprising outputs?', firstVersion: 'One working model.',
    firstStep: 'Build a small example.', relationship: 'linked', agreementStatus: 'accepted', workStatus: 'completed',
    workUpdates: [], basisPath: { id: 'path', revision: 1 }, presentation: {} as never });
  map.reflections.push({ id: 'reflection', revision: 1, status: 'open', projectBasis: { id: 'project', revision: 1 }, openedBy: {} as never,
    evidence: [{ id: 'evidence', revision: 1, signal: 'energy', observation: 'Inspecting outputs pulled me in.', interpretation: 'Investigating behavior may be worth exploring.', provenance: {} as never }] });
  map.projectOptionSets.push({ id: 'options', revision: 1, status: 'suggested', projectNumber: 2,
    basisPath: { id: 'path', revision: 1 }, presentation: {} as never,
    projects: [1, 2, 3].map(index => ({ id: 'option-' + index, revision: 1, title: 'Further experiment ' + index,
      learningGoal: 'Learn through making.', firstVersion: 'One useful output.', firstStep: 'Try one small change.',
      selection: 'available', equalWeight: true })) as CareerMap['projectOptionSets'][number]['projects'] });
  return map;
}

it('shows readable saved projects, reflection evidence, options and Foundation focus without decision controls', () => {
  const view = render(React.createElement(LearningState, { map: savedLearningMap() }));
  expect(view.getByText('Make a tiny model')).toBeTruthy();
  expect(view.getByText('Project 1 · accepted · completed')).toBeTruthy();
  expect(view.getAllByText("What you'll learn")).toHaveLength(4);
  expect(view.getByText('Inspecting outputs pulled me in.')).toBeTruthy();
  expect(view.getByText('Investigating behavior may be worth exploring.')).toBeTruthy();
  expect(view.getByText('Further project options · suggested')).toBeTruthy();
  expect(view.getByText('foundation revision: The contribution may have changed.')).toBeTruthy();
  expect(view.queryAllByRole('button')).toHaveLength(0);
});

it('opens one captured learning checkpoint directly and preserves two independently submitted sibling replies', async () => {
  window.history.replaceState({}, '', '/?kind=learning&checkpoint=learning-ready');
  vi.stubGlobal('structuredClone', (value: unknown) => JSON.parse(JSON.stringify(value)));
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  const candidate: Candidate = { id: 'learning-current', name: 'Current learning instructions', kind: 'learning', version: 'frozen-version',
    voice: 'Frozen voice', skills: {}, sharedRules: '', controls: '', acceptedVoice: true, artifactPath: '/private/frozen',
    effortByModule: { 'form-foundation': 'low', 'create-purpose-paths': 'high', 'design-path-project': 'medium', 'guide-path-project': 'low', 'interpret-path-project': 'low' } };
  const checkpoint: Checkpoint = { id: 'learning-ready', label: 'After completing the project', kind: 'learning', context: [],
    currentMessage: 'I finished it.', historicalReply: 'What work pulled you in?', historicalCards: [], provenance: {} };
  const parent: Job = { id: 'captured', candidateId: candidate.id, candidateName: candidate.name, version: candidate.version,
    checkpointId: checkpoint.id, createdAt: '2026-10-27T10:00:00Z', status: 'done', reply: checkpoint.historicalReply,
    canonicalState: savedLearningMap(), config: candidate, metadata: { origin: 'captured-checkpoint', effort: 'production' }, feedback: { preference: 'none', comment: '' } };
  const state: LabState = { candidates: [candidate], checkpoints: [checkpoint], jobs: [parent], model: 'test', effort: 'low', concurrency: 2, acceptedVoice: '', privateRoot: '/private' };
  const submitted: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    let value: unknown;
    if (url === '/api/state') value = state;
    else if (url === '/api/checkpoints/learning-ready') value = checkpoint;
    else if (url === '/api/jobs/captured/continue') {
      const message = JSON.parse(String(options?.body)).message; submitted.push(message);
      const child = { ...parent, id: `sibling-${submitted.length}`, parentId: parent.id, status: 'queued' as const,
        reply: undefined, currentMessage: message, createdAt: `2026-10-27T11:0${submitted.length}:00Z`, metadata: { effort: 'production' }, canonicalState: undefined };
      state.jobs.push(child); value = { jobIds: [child.id] };
    } else value = state.jobs.find(job => url === '/api/jobs/' + job.id);
    if (!value) throw new Error('Unexpected fixture URL: ' + url);
    return { ok: true, json: async () => structuredClone(value) };
  }));
  const view = render(React.createElement(App));
  await view.findByText('What work pulled you in?');
  const card = within(document.getElementById('result-captured')!);
  expect(card.getByText('Captured checkpoint')).toBeTruthy();
  expect(card.getByText(/Production effort by stage/)).toBeTruthy();
  expect(view.getByRole('button', { name: 'Learning loop', pressed: true })).toBeTruthy();
  for (const message of ['I want more support with this work.', 'I want to explore different work.']) {
    fireEvent.change(card.getByLabelText('Your reply'), { target: { value: message } });
    fireEvent.click(card.getByRole('button', { name: 'Send isolated reply' }));
    await waitFor(() => expect(submitted).toContain(message));
    await waitFor(() => expect((card.getByLabelText('Your reply') as HTMLTextAreaElement).value).toBe(''));
  }
  await waitFor(() => expect(document.getElementById('result-sibling-2')).toBeTruthy());
  expect(state.jobs.filter(job => job.parentId === 'captured').map(job => job.currentMessage)).toEqual(submitted);
  expect(Array.from(document.getElementById('result-captured')!.parentElement!.children).map(item => item.id)).toEqual(['result-captured', 'result-sibling-1', 'result-sibling-2']);
  expect(submitted).toHaveLength(2);
});

// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App, resultThreads } from '../../scripts/replay-lab/ui';
import type { Candidate, Checkpoint, Job, LabState } from '../../scripts/replay-lab/types';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  const candidate: Candidate = {
    id: 'paths-v1', name: 'Paths test', kind: 'paths', version: 'test-version',
    voice: 'Accepted voice', skills: { 'create-purpose-paths': 'Original skill' },
    sharedRules: '', controls: '', acceptedVoice: true, artifactPath: '/test/versions/test',
  };
  const checkpoint: Checkpoint = {
    id: 'paths-first', label: 'First path offer', kind: 'paths', context: [],
    currentMessage: 'Test moment', historicalReply: '', historicalCards: [], provenance: {},
  };
  const parent: Job = {
    id: 'parent', candidateId: candidate.id, candidateName: candidate.name, version: candidate.version,
    checkpointId: checkpoint.id, createdAt: '2026-10-11T07:00:00Z', status: 'done',
    reply: 'Original test reply', feedback: { preference: 'none', comment: '' },
  };
  const state: LabState = {
    candidates: [candidate], checkpoints: [checkpoint], jobs: [parent],
    model: 'test', effort: 'low', concurrency: 2, acceptedVoice: '', privateRoot: '/test',
  };
  return { candidate, checkpoint, parent, state };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const ok = (value: unknown) => ({ ok: true, json: async () => structuredClone(value) });

it('keeps candidates separate and orders nested continuations beneath their parents', () => {
  const job = (id: string, createdAt: string, parentId?: string): Job => ({
    id, parentId, createdAt, candidateId: 'test', candidateName: 'Test', version: 'test',
    checkpointId: 'paths-first', status: 'done', feedback: { preference: 'none', comment: '' },
  });
  const jobs = [job('later-child', '6', 'a'), job('grandchild', '5', 'first-child'),
    job('first-child', '4', 'a'), job('b', '3'), job('a', '2'), job('orphan', '1', 'missing')];
  expect(resultThreads(jobs).map(thread => thread.map(item => item.id))).toEqual([
    ['b'], ['a', 'first-child', 'grandchild', 'later-child'], ['orphan'],
  ]);
});

it('opens the newly submitted branch as soon as its queued card mounts', async () => {
  const candidate: Candidate = {
    id: 'paths-v1', name: 'Paths test', kind: 'paths', version: 'test-version',
    voice: '', skills: {}, sharedRules: '', controls: '', acceptedVoice: true, artifactPath: '/test/versions/test',
  };
  const checkpoint: Checkpoint = {
    id: 'paths-first', label: 'First path offer', kind: 'paths', context: [],
    currentMessage: 'Test moment', historicalReply: '', historicalCards: [], provenance: {},
  };
  const parent: Job = {
    id: 'parent', candidateId: candidate.id, candidateName: candidate.name, version: candidate.version,
    checkpointId: checkpoint.id, createdAt: '2026-10-11T07:00:00Z', status: 'done',
    reply: 'Original test reply', feedback: { preference: 'none', comment: '' },
  };
  const child: Job = {
    ...parent, id: 'child', parentId: parent.id, status: 'queued', reply: undefined,
    currentMessage: 'Synthetic test continuation', createdAt: '2026-10-11T08:00:00Z',
  };
  const state: LabState = {
    candidates: [candidate], checkpoints: [checkpoint], jobs: [parent],
    model: 'test', effort: 'low', concurrency: 2, acceptedVoice: '', privateRoot: '/test',
  };
  const requests: { url: string; body?: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    requests.push({ url, body: options?.body as string | undefined });
    let value: unknown;
    if (url === '/api/state') value = state;
    else if (url === '/api/checkpoints/paths-first') value = checkpoint;
    else if (url === '/api/jobs/parent') value = parent;
    else if (url === '/api/jobs/child') value = child;
    else if (url === '/api/jobs/parent/continue') {
      state.jobs = [parent, child];
      value = { jobIds: [child.id] };
    } else throw new Error(`Unexpected request: ${url}`);
    return { ok: true, json: async () => structuredClone(value) };
  }));
  const scrolled: string[] = [];
  vi.stubGlobal('structuredClone', (value: unknown) => JSON.parse(JSON.stringify(value)));
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true, value: vi.fn(function (this: Element) { scrolled.push(this.id); }),
  });
  const view = render(React.createElement(App));
  await view.findByText('Original test reply');
  const parentCard = within(document.getElementById('result-parent')!);
  fireEvent.change(parentCard.getByLabelText('Your reply'), { target: { value: child.currentMessage } });
  fireEvent.click(parentCard.getByRole('button', { name: 'Send isolated reply' }));
  await waitFor(() => expect(scrolled).toEqual(['result-child']));
  expect(within(document.getElementById('result-child')!).getByText('Waiting for an available slot.')).toBeTruthy();
  const thread = document.getElementById('result-parent')!.parentElement!;
  expect(thread.className).toBe('result-thread');
  expect(Array.from(thread.children).map(card => card.id)).toEqual(['result-parent', 'result-child']);
  expect(requests.filter(request => request.url.endsWith('/continue'))).toEqual([
    { url: '/api/jobs/parent/continue', body: JSON.stringify({ message: child.currentMessage }) },
  ]);
});

it('keeps candidate fields locked while a save can replace the draft', async () => {
  const { candidate, checkpoint, state } = fixture();
  const pendingSave = deferred<ReturnType<typeof ok>>();
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (url === '/api/state') return Promise.resolve(ok(state));
    if (url === '/api/checkpoints/paths-first') return Promise.resolve(ok(checkpoint));
    if (url === '/api/candidates/paths-v1' && options?.method === 'PUT') return pendingSave.promise;
    throw new Error(`Unexpected request: ${url}`);
  }));
  const view = render(React.createElement(App));
  fireEvent.click(await view.findByRole('button', { name: 'Edit' }));
  const dialog = view.getByRole('dialog');
  const skill = within(dialog).getByLabelText('Exact SKILL.md') as HTMLTextAreaElement;
  fireEvent.change(skill, { target: { value: 'Edited skill' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save version' }));
  await waitFor(() => expect((within(dialog).getByRole('button', { name: 'Working…' }) as HTMLButtonElement).disabled).toBe(true));
  expect((within(dialog).getByLabelText('Candidate name') as HTMLInputElement).disabled).toBe(true);
  expect(skill.disabled).toBe(true);
  expect((within(dialog).getByLabelText('Skill') as HTMLSelectElement).disabled).toBe(true);
  expect((within(dialog).getByRole('button', { name: 'Close candidate editor' }) as HTMLButtonElement).disabled).toBe(true);
  pendingSave.resolve(ok({ ...candidate, version: 'saved-version', skills: { 'create-purpose-paths': 'Edited skill' } }));
  await waitFor(() => expect(skill.disabled).toBe(false));
  expect(skill.value).toBe('Edited skill');
});

it('serializes feedback saves across result unmount and remount', async () => {
  const { checkpoint, parent, state } = fixture();
  const firstSave = deferred<ReturnType<typeof ok>>();
  const submitted: string[] = [];
  let stored = '';
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (url === '/api/state') return Promise.resolve(ok(state));
    if (url === '/api/checkpoints/paths-first') return Promise.resolve(ok(checkpoint));
    if (url === '/api/jobs/parent') return Promise.resolve(ok(parent));
    if (url === '/api/jobs/parent/feedback' && options?.method === 'PUT') {
      const comment = JSON.parse(options.body as string).comment as string;
      submitted.push(comment);
      if (submitted.length === 1) return firstSave.promise;
      stored = comment;
      return Promise.resolve(ok({ preference: 'none', comment }));
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
  const view = render(React.createElement(App));
  const note = await view.findByLabelText('Notes for this result') as HTMLTextAreaElement;
  fireEvent.change(note, { target: { value: 'First note' } });
  fireEvent.click(view.getByRole('button', { name: 'Voice' }));
  await waitFor(() => expect(submitted).toEqual(['First note']));
  fireEvent.click(view.getByRole('button', { name: 'Paths' }));
  const reopened = await view.findByLabelText('Notes for this result') as HTMLTextAreaElement;
  expect(reopened.value).toBe('First note');
  fireEvent.change(reopened, { target: { value: 'Newer note' } });
  fireEvent.click(view.getByRole('button', { name: 'Voice' }));
  expect(submitted).toEqual(['First note']);
  stored = 'First note';
  await act(async () => firstSave.resolve(ok({ preference: 'none', comment: 'First note' })));
  await waitFor(() => expect(submitted).toEqual(['First note', 'Newer note']));
  expect(stored).toBe('Newer note');
});

it('ignores an older poll that resolves after a newer batch refresh', async () => {
  const { checkpoint, parent, state } = fixture();
  state.jobs = [];
  const olderPoll = deferred<ReturnType<typeof ok>>();
  const freshState = { ...state, jobs: [{ ...parent, status: 'queued' as const }] };
  let stateRequests = 0;
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/state') {
      stateRequests++;
      if (stateRequests === 1) return Promise.resolve(ok(state));
      if (stateRequests === 2) return olderPoll.promise;
      return Promise.resolve(ok(freshState));
    }
    if (url === '/api/checkpoints/paths-first') return Promise.resolve(ok(checkpoint));
    if (url === '/api/batch') return Promise.resolve(ok({ jobIds: ['parent'] }));
    if (url === '/api/jobs/parent') return Promise.resolve(ok(freshState.jobs[0]));
    throw new Error(`Unexpected request: ${url}`);
  }));
  const view = render(React.createElement(App));
  await view.findByRole('button', { name: 'Run Paths V1' });
  await waitFor(() => expect(stateRequests).toBe(2), { timeout: 3500 });
  expect(stateRequests).toBe(2);
  fireEvent.click(view.getByRole('button', { name: 'Run Paths V1' }));
  await view.findByText('Waiting for an available slot.');
  await act(async () => olderPoll.resolve(ok(state)));
  expect(view.getByText('Waiting for an available slot.')).toBeTruthy();
});

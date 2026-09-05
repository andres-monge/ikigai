// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCareerMap, type CareerMap } from '@shared/career-map';
import type { NormalizedHistoryMessage } from '@/components/explore/explore-state';
import { attachPurposePathSets, Explore } from './explore';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function streamResponse(chunks: readonly Record<string, unknown>[]) {
  return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`).join('\n')}\ndata: [DONE]\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const presentation = {
  kind: 'model-presentation' as const, assistantTurnId: 'turn-paths', turnSequence: 3,
  completed: true as const, presentedAt: '2030-01-01T00:00:02.000Z',
};

function suggestedPathsMap(): CareerMap {
  const map = createCareerMap('explorer-1');
  map.foundation.whyRevisions.push({
    id: 'why-1', revision: 1, statement: 'Make difficult systems humane.', serves: 'People using them.',
    pointOfView: 'Complexity is a choice.', status: 'confirmed', presentation,
    confirmation: {
      targetId: 'why-1', targetRevision: 1, presentedInTurnId: presentation.assistantTurnId,
      confirmedBy: { kind: 'user-message', actionId: 'why', turnId: 'turn-why', turnSequence: 2, occurredAt: '2030-01-01T00:00:01.000Z' },
    },
  });
  map.pathSets.push({
    id: 'set-1', revision: 1, status: 'suggested', basisWhy: { id: 'why-1', revision: 1 },
    changeKind: 'initial', presentation,
    paths: [1, 2, 3].map((number) => ({
      id: `path-${number}`, revision: 1, name: `Path ${number}`, servesWhy: `Serve ${number}`,
      possibility: `Possibility ${number}`, evidence: [`Evidence ${number}`], centralUnknown: `Unknown ${number}`,
      projectPreview: `Project ${number}`, practicalFit: `Fit ${number}`, selection: 'available' as const, equalWeight: true as const,
    })) as CareerMap['pathSets'][number]['paths'],
  });
  return map;
}

function revisedPathsMap(): CareerMap {
  const map = suggestedPathsMap();
  const active = map.pathSets[0];
  active.status = 'active';
  active.paths = active.paths.map((path, index) => ({
    ...path,
    selection: index === 0 ? 'active' as const : 'parked' as const,
  })) as CareerMap['pathSets'][number]['paths'];
  active.confirmation = {
    targetId: active.id,
    targetRevision: active.revision,
    presentedInTurnId: active.presentation.assistantTurnId,
    confirmedBy: {
      kind: 'user-message',
      actionId: 'select-original',
      turnId: 'turn-select-original',
      turnSequence: 4,
      occurredAt: '2030-01-01T00:00:03.000Z',
    },
  };
  map.pathSets.push({
    ...structuredClone(active),
    id: 'set-2',
    status: 'suggested',
    paths: active.paths.map((path) => ({ ...path, selection: 'available' as const })) as CareerMap['pathSets'][number]['paths'],
    presentation: { ...presentation, assistantTurnId: 'turn-revised', turnSequence: 5 },
    confirmation: undefined,
    supersedesSetId: active.id,
    changeKind: 'replacement',
  });
  return map;
}

const historyMessages = (): NormalizedHistoryMessage[] => [
  { id: 'assistant-1', role: 'assistant', turn: { turnId: 'turn-paths', status: 'completed' }, parts: [{ type: 'text', text: 'I found three paths.' }] },
  { id: 'assistant-final', role: 'assistant', turn: { turnId: 'turn-paths', status: 'completed' }, isFinalAssistantItem: true, parts: [{ type: 'text', text: 'Compare them below.' }] },
];

function props() {
  return { userEmail: 'explorer@example.com', isSigningOut: false, signOutError: null, onSignOut: vi.fn() };
}

describe('Explore U6 conversation-first workspace', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'empty', messages: [] });
      if (url.includes('/workspace')) return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      throw new Error(`Unexpected request: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('joins canonical sets only to the exact final assistant item and deduplicates set revisions', () => {
    const map = suggestedPathsMap();
    const messages = [...historyMessages(), { ...historyMessages()[1], id: 'duplicate-final' }];
    const attached = attachPurposePathSets(messages, [...map.pathSets, structuredClone(map.pathSets[0])]);
    expect(attached.get('assistant-1')).toBeUndefined();
    expect(attached.get('assistant-final')).toEqual([map.pathSets[0]]);
    expect(attached.get('duplicate-final')).toBeUndefined();

    const failedWithoutFinal: NormalizedHistoryMessage[] = [{
      id: 'failed-prose', role: 'assistant', turn: { turnId: 'turn-paths', status: 'failed' },
      parts: [{ type: 'text', text: 'Partial prose' }],
    }];
    expect(attachPurposePathSets(failedWithoutFinal, map.pathSets).size).toBe(0);
  });

  it('attaches the shared cards after final prose in Chat and keeps Your Map action-free', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'ready', messages: historyMessages() });
      if (url.includes('/workspace')) return jsonResponse({ status: 'ready', map: suggestedPathsMap() });
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<Explore {...props()} />);
    const chat = screen.getByRole('tabpanel', { name: 'Chat' });
    expect(await within(chat).findAllByRole('button', { name: /Start path/ })).toHaveLength(3);
    const prose = within(chat).getByText('Compare them below.').closest('article')!;
    const cards = within(chat).getAllByTestId('purpose-path-card');
    expect(prose.compareDocumentPosition(cards[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Your Map' }));
    const mapPanel = screen.getByRole('tabpanel', { name: 'Your Map' });
    expect(within(mapPanel).getAllByTestId('purpose-path-card')).toHaveLength(3);
    expect(within(mapPanel).queryByRole('button')).toBeNull();
  });

  it('preserves tab draft, microphone, and Stop behavior', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/history')) return Promise.resolve(jsonResponse({ status: 'empty', messages: [] }));
      if (url === '/api/agent/workspace') return Promise.resolve(jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') }));
      if (url === '/api/agent') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Your Map' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect((textbox as HTMLTextAreaElement).value).toBe('Keep this draft');
    expect(screen.getByRole('button', { name: /Record a message|Microphone unavailable/ })).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Send' });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect((textbox as HTMLTextAreaElement).value).toBe('Keep this draft'));
  });

  it('keeps historical and failed presentations read-only and never attaches streaming text', async () => {
    const map = suggestedPathsMap();
    map.pathSets[0].status = 'superseded';
    const failedHistory = historyMessages().map((message) => ({
      ...message, turn: { turnId: 'turn-paths', status: 'failed' as const },
    }));
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'ready', messages: failedHistory });
      if (url.includes('/workspace')) return jsonResponse({ status: 'ready', map });
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<Explore {...props()} />);
    expect(await screen.findAllByTestId('purpose-path-card')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Start path/ })).toBeNull();
  });

  it('posts the exact current Start operation, stays disabled through refetch, and returns focus to Chat', async () => {
    const refetchWorkspace = deferred<Response>();
    let workspaceReads = 0;
    let operationBody: Record<string, unknown> | undefined;
    let operationId = '';
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'ready', messages: historyMessages() });
      if (url === '/api/agent/workspace') {
        workspaceReads += 1;
        if (workspaceReads === 1) return jsonResponse({ status: 'ready', map: suggestedPathsMap() });
        return refetchWorkspace.promise;
      }
      if (url === '/api/agent/workspace/operations') {
        operationBody = JSON.parse(String(init?.body));
        operationId = operationBody!.operationId as string;
        return streamResponse([
          { type: 'text-start', id: 'direct-project' },
          { type: 'text-delta', id: 'direct-project', delta: 'Here is your first Path Project.' },
          { type: 'text-end', id: 'direct-project' },
          { type: 'finish', finishReason: 'stop' },
        ]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<Explore {...props()} />);
    const start = await screen.findByRole('button', { name: 'Start path 2: Path 2' });
    fireEvent.click(start);
    await waitFor(() => expect(operationBody).toBeTruthy());
    expect(await screen.findByText('Here is your first Path Project.')).toBeTruthy();
    expect((start as HTMLButtonElement).disabled).toBe(true);
    const refreshed = suggestedPathsMap();
    refreshed.revision = 1;
    const sourceMessageId = ((operationBody!.operation as { input: Record<string, unknown> }).input.sourceMessageId) as string;
    refreshed.operationHistory.push({
      sourceId: operationId, operationType: 'select-purpose-path', payloadFingerprint: 'fingerprint', resultRevision: 1,
      committedAt: '2030-01-01T00:00:03.000Z', moduleVersion: null,
      confirmationProvenance: { kind: 'ui-action', actionId: sourceMessageId, turnId: 'server-turn-4', turnSequence: 4, occurredAt: '2030-01-01T00:00:03.000Z' },
    });
    refetchWorkspace.resolve(jsonResponse({ status: 'ready', map: refreshed }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Message Revelio' })));
    expect(operationBody).toMatchObject({
      expectedRevision: 0,
      operation: { type: 'select-purpose-path', input: {
        setId: 'set-1', setRevision: 1, pathId: 'path-2', pathRevision: 1, presentedInTurnId: 'turn-paths',
      } },
    });
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses the revision-confirmation operation for a revised Purpose Path set', async () => {
    let operationBody: Record<string, unknown> | undefined;
    const map = revisedPathsMap();
    const revisedHistory: NormalizedHistoryMessage[] = [{
      id: 'assistant-revised',
      role: 'assistant',
      turn: { turnId: 'turn-revised', status: 'completed' },
      isFinalAssistantItem: true,
      parts: [{ type: 'text', text: 'Compare the revised paths below.' }],
    }];
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'ready', messages: revisedHistory });
      if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map });
      if (url === '/api/agent/workspace/operations') {
        operationBody = JSON.parse(String(init?.body));
        return jsonResponse({
          status: 'rejected',
          operation: 'confirm-purpose-path-revision',
          authoritativeRevision: map.revision,
          derivedModule: 'create-purpose-paths',
          pendingDecision: {
            kind: 'path-revision-confirmation',
            targetId: 'set-2',
            targetRevision: 1,
          },
          errorClass: 'operation-unavailable',
          retryable: false,
        }, 409);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start path 2: Path 2' }));
    await waitFor(() => expect(operationBody).toBeTruthy());

    expect(operationBody).toMatchObject({
      expectedRevision: map.revision,
      operation: {
        type: 'confirm-purpose-path-revision',
        input: {
          setId: 'set-2',
          setRevision: 1,
          pathId: 'path-2',
          pathRevision: 1,
          presentedInTurnId: 'turn-revised',
        },
      },
    });
  });

  it('re-enables Start after a successful initial-load retry', async () => {
    let historyReads = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history')) {
        historyReads += 1;
        if (historyReads === 1) throw new Error('initial history unavailable');
        return jsonResponse({ status: 'ready', messages: historyMessages() });
      }
      if (url === '/api/agent/workspace') {
        return jsonResponse({ status: 'ready', map: suggestedPathsMap() });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    const start = await screen.findByRole('button', { name: 'Start path 1: Path 1' });
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
  });

  it('shows delayed Saving, clears success silently, and reconciles only the exact receipt', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    let historyReads = 0;
    let workspaceReads = 0;
    const encoder = new TextEncoder();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        return historyReads === 1
          ? jsonResponse({ status: 'empty', messages: [] })
          : jsonResponse({ status: 'ready', messages: [{ id: 'final', role: 'assistant', turn: { turnId: 'turn-op', status: 'completed' }, isFinalAssistantItem: true, parts: [{ type: 'text', text: 'Done.' }] }] });
      }
      if (url === '/api/agent/workspace') {
        workspaceReads += 1;
        const map = createCareerMap('explorer-1');
        if (workspaceReads > 1) {
          map.revision = 1;
          map.operationHistory.push({ sourceId: 'op-1', operationType: 'propose-purpose-paths', payloadFingerprint: 'fingerprint', resultRevision: 1, committedAt: '2030-01-01T00:00:03.000Z', confirmationProvenance: null, moduleVersion: '1.0.0' });
        }
        return jsonResponse({ status: 'ready', map });
      }
      if (url === '/api/agent') return new Response(new ReadableStream({ start(controller) { streamController = controller; } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Create paths.' } });
    const send = screen.getByRole('button', { name: 'Send' });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);
    await waitFor(() => expect(streamController).toBeTruthy());
    vi.useFakeTimers();
    await act(async () => {
      streamController!.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'data-operation-status', id: 'op-1', transient: true, data: { version: 1, turnId: 'turn-op', messageId: 'message-op', operationId: 'op-1', operation: 'propose-purpose-paths', authoritativeRevision: null, status: 'Saving', sequence: 0 } })}\n`));
    });
    expect(screen.queryByText('Saving…')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByText('Saving…')).toBeTruthy();
    await act(async () => {
      streamController!.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'data-operation-status', id: 'op-1', transient: true, data: { version: 1, turnId: 'turn-op', messageId: 'message-op', operationId: 'op-1', operation: 'propose-purpose-paths', authoritativeRevision: 1, status: 'Saved', sequence: 1 } })}\n`));
      streamController!.close();
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('treats an exact receipt as saved when provider narration fails without a history item', async () => {
    let historyReads = 0;
    let workspaceReads = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        return jsonResponse({ status: 'empty', messages: [] });
      }
      if (url === '/api/agent/workspace') {
        workspaceReads += 1;
        const map = createCareerMap('explorer-1');
        if (workspaceReads > 1) {
          map.revision = 1;
          map.operationHistory.push({
            sourceId: 'op-committed', operationType: 'propose-purpose-paths', payloadFingerprint: 'fingerprint',
            resultRevision: 1, committedAt: '2030-01-01T00:00:03.000Z', confirmationProvenance: null,
            moduleVersion: '1.0.0',
          });
        }
        return jsonResponse({ status: 'ready', map });
      }
      if (url === '/api/agent') {
        const chunks = [
          { type: 'data-operation-status', id: 'op-committed', transient: true, data: { version: 1, turnId: 'turn-committed', messageId: 'message-committed', operationId: 'op-committed', operation: 'propose-purpose-paths', authoritativeRevision: null, status: 'Saving', sequence: 0 } },
          { type: 'finish', finishReason: 'error' },
        ];
        return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`).join('\n')}\ndata: [DONE]\n`, {
          status: 200, headers: { 'content-type': 'text/event-stream' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Save this, then explain.' } });
    const send = screen.getByRole('button', { name: 'Send' });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);

    expect(await screen.findByText('Your map was updated, but Revelio’s follow-up reply did not finish.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue in Chat' })).toBeTruthy();
    expect(historyReads).toBeGreaterThan(1);
  });

  it('keeps a committed direct Start truthful when continuation fails before streaming', async () => {
    let workspaceReads = 0;
    let operationId = '';
    let sourceMessageId = '';
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        return jsonResponse({ status: 'ready', messages: historyMessages() });
      }
      if (url === '/api/agent/workspace') {
        workspaceReads += 1;
        const map = suggestedPathsMap();
        if (workspaceReads > 1) {
          map.revision = 1;
          map.operationHistory.push({
            sourceId: operationId, operationType: 'select-purpose-path', payloadFingerprint: 'fingerprint',
            resultRevision: 1, committedAt: '2030-01-01T00:00:03.000Z', moduleVersion: null,
            confirmationProvenance: {
              kind: 'ui-action', actionId: sourceMessageId, turnId: 'workspace-turn',
              turnSequence: 4, occurredAt: '2030-01-01T00:00:03.000Z',
            },
          });
        }
        return jsonResponse({ status: 'ready', map });
      }
      if (url === '/api/agent/workspace/operations') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        operationId = String(body.operationId);
        sourceMessageId = String(((body.operation as { input: Record<string, unknown> }).input).sourceMessageId);
        return jsonResponse({ error: 'Workspace operation failed', errorClass: 'Error' }, 500);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start path 1: Path 1' }));

    expect(await screen.findByText('Your map was updated, but Revelio’s follow-up reply did not finish.')).toBeTruthy();
    expect(screen.queryByText('Something went wrong. Try again.')).toBeNull();
  });

  it('keeps committed-write recovery ahead of a later failed continuation attempt', async () => {
    let workspaceReads = 0;
    let operationId = '';
    let sourceMessageId = '';
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        return jsonResponse({ status: 'ready', messages: historyMessages() });
      }
      if (url === '/api/agent/workspace') {
        workspaceReads += 1;
        const map = suggestedPathsMap();
        if (workspaceReads > 1) {
          map.revision = 1;
          map.operationHistory.push({
            sourceId: operationId,
            operationType: 'select-purpose-path',
            payloadFingerprint: 'fingerprint',
            resultRevision: 1,
            committedAt: '2030-01-01T00:00:03.000Z',
            moduleVersion: null,
            confirmationProvenance: {
              kind: 'ui-action',
              actionId: sourceMessageId,
              turnId: 'workspace-turn',
              turnSequence: 4,
              occurredAt: '2030-01-01T00:00:03.000Z',
            },
          });
        }
        return jsonResponse({ status: 'ready', map });
      }
      if (url === '/api/agent/workspace/operations') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        operationId = String(body.operationId);
        sourceMessageId = String(((body.operation as { input: Record<string, unknown> }).input).sourceMessageId);
        return streamResponse([
          {
            type: 'data-operation-status',
            id: 'project-operation',
            transient: true,
            data: {
              version: 1,
              turnId: 'workspace-turn',
              messageId: sourceMessageId,
              operationId: 'project-operation',
              operation: 'propose-first-project',
              authoritativeRevision: null,
              status: 'Saving',
              sequence: 0,
            },
          },
          {
            type: 'data-operation-status',
            id: 'project-operation',
            transient: true,
            data: {
              version: 1,
              turnId: 'workspace-turn',
              messageId: sourceMessageId,
              operationId: 'project-operation',
              operation: 'propose-first-project',
              authoritativeRevision: null,
              status: 'Failed',
              sequence: 1,
              errorClass: 'ProviderError',
            },
          },
          { type: 'finish', finishReason: 'error' },
        ]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start path 1: Path 1' }));

    expect(await screen.findByText('Your map was updated, but Revelio’s follow-up reply did not finish.')).toBeTruthy();
    expect(screen.queryByText('Something went wrong. Try again.')).toBeNull();
  });

  it('shows unknown after cancellation when the terminal history and workspace reads fail', async () => {
    let historyReads = 0;
    let workspaceReads = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        return historyReads === 1
          ? Promise.resolve(jsonResponse({ status: 'ready', messages: historyMessages() }))
          : Promise.reject(new Error('history unavailable'));
      }
      if (url === '/api/agent/workspace') {
        workspaceReads += 1;
        return workspaceReads === 1
          ? Promise.resolve(jsonResponse({ status: 'ready', map: suggestedPathsMap() }))
          : Promise.reject(new Error('workspace unavailable'));
      }
      if (url === '/api/agent/workspace/operations') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start path 1: Path 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    expect(await screen.findByText('Revelio could not confirm whether your map was updated. Refresh before trying again.')).toBeTruthy();
  });

  it('does not let a stale refresh erase a new optimistic message or live reply', async () => {
    const staleHistory = deferred<Response>();
    const staleWorkspace = deferred<Response>();
    let historyReads = 0;
    let workspaceReads = 0;
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        if (historyReads === 1) throw new Error('initial history unavailable');
        if (historyReads === 2) return staleHistory.promise;
        return jsonResponse({ status: 'empty', messages: [] });
      }
      if (url === '/api/agent/workspace') {
        workspaceReads += 1;
        if (workspaceReads === 2) return staleWorkspace.promise;
        return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      }
      if (url === '/api/agent') {
        return new Response(new ReadableStream({ start(controller) { streamController = controller; } }), {
          status: 200, headers: { 'content-type': 'text/event-stream' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    const textbox = screen.getByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Keep this optimistic message.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(streamController).toBeTruthy());
    await act(async () => {
      streamController!.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', id: 'text-live', delta: 'Keep this live reply.' })}\n`));
    });
    expect(screen.getByText('Keep this optimistic message.')).toBeTruthy();
    expect(screen.getByText('Keep this live reply.')).toBeTruthy();

    await act(async () => {
      staleHistory.resolve(jsonResponse({ status: 'empty', messages: [] }));
      staleWorkspace.resolve(jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') }));
      await Promise.resolve();
    });
    expect(screen.getByText('Keep this optimistic message.')).toBeTruthy();
    expect(screen.getByText('Keep this live reply.')).toBeTruthy();

    await act(async () => { streamController!.close(); });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
  });

  it('uses one persistent conflict error and marks Chat only when it originates in Your Map', async () => {
    const operationResponse = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'ready', messages: historyMessages() });
      if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: suggestedPathsMap() });
      if (url === '/api/agent/workspace/operations') return operationResponse.promise;
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start path 1: Path 1' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Your Map' }));
    operationResponse.resolve(jsonResponse({
      status: 'conflict', operation: 'select-purpose-path', authoritativeRevision: 0,
      derivedModule: 'create-purpose-paths', pendingDecision: { kind: 'path-selection', targetId: 'set-1', targetRevision: 1 },
      errorClass: 'revision-conflict', retryable: true,
    }, 409));
    expect(await screen.findByText('Your map changed — take another look.')).toBeTruthy();
    expect(screen.getByLabelText('Unseen Chat error')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Chat/ }));
    await waitFor(() => expect(screen.queryByLabelText('Unseen Chat error')).toBeNull());
    expect(screen.getByText('Your map changed — take another look.')).toBeTruthy();
  });
});

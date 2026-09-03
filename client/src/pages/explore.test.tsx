// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCareerMap } from '@shared/career-map';
import { Explore } from './explore';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function emptyWorkspace() {
  return { status: 'ready', map: createCareerMap('explorer-1') };
}

function suggestedWhyWorkspace() {
  const map = createCareerMap('explorer-1');
  map.foundation.whyRevisions.push({
    id: 'why-1',
    revision: 1,
    statement: 'Make difficult systems humane.',
    serves: 'People using them.',
    pointOfView: 'Complexity is a choice.',
    status: 'suggested',
    presentation: {
      kind: 'model-presentation',
      assistantTurnId: 'assistant-turn-1',
      turnSequence: 1,
      completed: true,
      presentedAt: '2030-01-01T00:00:00.000Z',
    },
  });
  return { status: 'ready' as const, map };
}

function suggestedPathsWorkspace() {
  const workspace = suggestedWhyWorkspace();
  const why = workspace.map.foundation.whyRevisions[0];
  why.status = 'confirmed';
  why.confirmation = {
    targetId: why.id,
    targetRevision: why.revision,
    presentedInTurnId: why.presentation.assistantTurnId,
    confirmedBy: {
      kind: 'ui-action', actionId: 'confirm-why', turnId: 'turn-why', turnSequence: 2,
      occurredAt: '2030-01-01T00:00:01.000Z',
    },
  };
  workspace.map.pathSets.push({
    id: 'path-set-1',
    revision: 1,
    status: 'suggested',
    basisWhy: { id: why.id, revision: why.revision },
    changeKind: 'initial',
    presentation: {
      kind: 'model-presentation', assistantTurnId: 'assistant-paths-1', turnSequence: 3,
      completed: true, presentedAt: '2030-01-01T00:00:02.000Z',
    },
    paths: [1, 2, 3].map((number) => ({
      id: `path-${number}`, revision: 1, name: `Path ${number}`, servesWhy: `Serve ${number}`,
      possibility: `Possibility ${number}`, evidence: [`Evidence ${number}`], centralUnknown: `Unknown ${number}`,
      projectPreview: `Project ${number}`, practicalFit: `Fit ${number}`, selection: 'available' as const, equalWeight: true as const,
    })),
  });
  return workspace;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function props() {
  return {
    userEmail: 'explorer@example.com',
    isSigningOut: false,
    signOutError: null,
    onSignOut: vi.fn(),
  };
}

describe('Explore workspace', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'empty', messages: [] });
      if (url.includes('/workspace')) return jsonResponse(emptyWorkspace());
      throw new Error(`Unexpected request: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('distinguishes a valid empty bootstrap from independent fetch failures', async () => {
    render(<Explore {...props()} />);
    expect(await screen.findByText(/What has been pulling/)).toBeTruthy();
    expect(screen.getByText('Your map will take shape here')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    cleanup();
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    render(<Explore {...props()} />);
    expect((await screen.findAllByRole('alert')).map((node) => node.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('conversation could not be loaded'),
      expect.stringContaining('map could not be loaded'),
    ]));
  });

  it('preserves the draft while switching between mobile Chat and Your Map views', async () => {
    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'A draft I need to keep' } });
    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    fireEvent.keyDown(chatTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Your Map' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Your Map' })));
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect((screen.getByRole('textbox', { name: 'Message Revelio' }) as HTMLTextAreaElement).value)
      .toBe('A draft I need to keep');
  });

  it('keeps the composer editable but blocks submission until initial reads settle', async () => {
    const history = deferred<Response>();
    const workspace = deferred<Response>();
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => (
      String(input).includes('/history') ? history.promise : workspace.promise
    ));
    render(<Explore {...props()} />);
    const textbox = screen.getByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Ready when the workspace is.' } });
    expect((textbox as HTMLTextAreaElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/available after the initial workspace load/i)).toBeTruthy();

    history.resolve(jsonResponse({ status: 'empty', messages: [] }));
    workspace.resolve(jsonResponse(emptyWorkspace()));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('loads older history only after an explicit opaque-cursor action and deduplicates messages', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({
        status: 'ready',
        olderCursor: 'opaque.cursor_token',
        messages: [{ id: 'newest', role: 'assistant', parts: [{ type: 'text', text: 'Newest answer' }] }],
      });
      if (url.includes('cursor=')) return jsonResponse({
        status: 'ready',
        messages: [
          { id: 'oldest', role: 'user', parts: [{ type: 'text', text: 'Oldest question' }] },
          { id: 'newest', role: 'assistant', parts: [{ type: 'text', text: 'Newest answer' }] },
        ],
      });
      if (url.includes('/workspace')) return jsonResponse(emptyWorkspace());
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load older messages' }));
    expect(await screen.findByText('Oldest question')).toBeTruthy();
    expect(screen.getAllByText('Newest answer')).toHaveLength(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/agent/history?cursor=opaque.cursor_token',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('uses Enter to send and refetches only the newest history page plus map after completion', async () => {
    let newestHistoryFetches = 0;
    let workspaceFetches = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        newestHistoryFetches += 1;
        return jsonResponse({ status: 'empty', messages: [] });
      }
      if (url === '/api/agent/workspace') {
        workspaceFetches += 1;
        return jsonResponse(emptyWorkspace());
      }
      if (url === '/api/agent') {
        return new Response([
          `data: ${JSON.stringify({ type: 'text-delta', id: 'text-1', delta: 'A concise reply.' })}`,
          'data: [DONE]',
          '',
        ].join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Help me think.' } });
    fireEvent.keyDown(textbox, { key: 'Enter' });

    await waitFor(() => expect(newestHistoryFetches).toBe(2));
    expect(workspaceFetches).toBe(2);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/agent', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'X-Revelio-Request': '1' }),
    }));
  });

  it('replaces the streaming fallback with the persisted reply after newest-page refetch', async () => {
    let historyFetches = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyFetches += 1;
        return historyFetches === 1
          ? jsonResponse({ status: 'empty', messages: [] })
          : jsonResponse({
              status: 'ready',
              messages: [{ id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'A concise reply.' }] }],
            });
      }
      if (url === '/api/agent/workspace') return jsonResponse(emptyWorkspace());
      if (url === '/api/agent') {
        return new Response([
          `data: ${JSON.stringify({ type: 'text-delta', id: 'text-1', delta: 'A concise reply.' })}`,
          'data: [DONE]',
          '',
        ].join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Help me think.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(historyFetches).toBe(2));
    expect(screen.getAllByText('A concise reply.')).toHaveLength(1);
  });

  it('preserves explicitly loaded older history across terminal newest-page refetch', async () => {
    let newestFetches = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        newestFetches += 1;
        return jsonResponse({
          status: 'ready',
          olderCursor: 'older-page',
          messages: [{ id: 'newest', role: 'assistant', parts: [{ type: 'text', text: 'Newest answer' }] }],
        });
      }
      if (url.includes('cursor=')) return jsonResponse({
        status: 'ready',
        messages: [{ id: 'oldest', role: 'user', parts: [{ type: 'text', text: 'Older context' }] }],
      });
      if (url === '/api/agent/workspace') return jsonResponse(emptyWorkspace());
      if (url === '/api/agent') {
        return new Response('data: [DONE]\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load older messages' }));
    expect(await screen.findByText('Older context')).toBeTruthy();
    const textbox = screen.getByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Continue.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(newestFetches).toBe(2));
    expect(screen.getByText('Older context')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load older messages' })).toBeNull();
  });

  it.each([
    ['committed', 200, 'Saved'],
    ['idempotent-replay', 200, 'Saved'],
    ['conflict', 409, 'Conflict'],
    ['rejected', 422, 'Rejected'],
  ] as const)('renders the %s direct-operation terminal and sends the exact target', async (status, responseStatus, visibleStatus) => {
    let operationRequest: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse(suggestedWhyWorkspace());
      if (url === '/api/agent/workspace/operations') {
        operationRequest = JSON.parse(String(init?.body));
        return jsonResponse({
          status,
          operation: 'confirm-why',
          authoritativeRevision: status === 'committed' || status === 'idempotent-replay' ? 1 : 0,
          derivedModule: 'form-foundation',
          pendingDecision: null,
          ...(status === 'conflict' ? { errorClass: 'revision-conflict', retryable: true } : {}),
          ...(status === 'rejected' ? { errorClass: 'operation-unavailable' } : {}),
        }, responseStatus);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm this Why' }));
    expect(await screen.findByText(new RegExp(`Why: ${visibleStatus}`))).toBeTruthy();
    expect(operationRequest).toMatchObject({
      expectedRevision: 0,
      operation: {
        type: 'confirm-why',
        input: {
          whyId: 'why-1',
          whyRevision: 1,
          presentedInTurnId: 'assistant-turn-1',
        },
      },
    });
  });

  it('keeps canonical actions disabled until the authoritative refetch settles', async () => {
    const workspaceRefetch = deferred<Response>();
    let workspaceFetches = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') {
        workspaceFetches += 1;
        if (workspaceFetches === 1) return jsonResponse(suggestedWhyWorkspace());
        return workspaceRefetch.promise;
      }
      if (url === '/api/agent/workspace/operations') return jsonResponse({
        status: 'committed', operation: 'confirm-why', authoritativeRevision: 1,
        derivedModule: 'form-foundation', pendingDecision: null,
      });
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const action = await screen.findByRole('button', { name: 'Confirm this Why' });
    fireEvent.click(action);
    await screen.findByText(/Why: Saved/);
    expect((action as HTMLButtonElement).disabled).toBe(true);
    workspaceRefetch.resolve(jsonResponse(suggestedWhyWorkspace()));
    await waitFor(() => expect((action as HTMLButtonElement).disabled).toBe(false));
  });

  it('sends an exact path selection and restores focus to the map after refetch', async () => {
    let operationRequest: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse(suggestedPathsWorkspace());
      if (url === '/api/agent/workspace/operations') {
        operationRequest = JSON.parse(String(init?.body));
        return jsonResponse({
          status: 'committed', operation: 'select-purpose-path', authoritativeRevision: 1,
          derivedModule: 'design-path-project', pendingDecision: null,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Your Map' }));
    const action = await screen.findByRole('button', { name: 'Start path 2: Path 2' });
    action.focus();
    fireEvent.click(action);
    expect(await screen.findByText(/Purpose Path: Saved/)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your Map' })));
    expect(operationRequest).toMatchObject({
      expectedRevision: 0,
      operation: {
        type: 'select-purpose-path',
        input: {
          setId: 'path-set-1', setRevision: 1, pathId: 'path-2', pathRevision: 1,
          presentedInTurnId: 'assistant-paths-1',
        },
      },
    });
  });

  it('restores map focus after confirmation conflict recovery', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse(suggestedWhyWorkspace());
      if (url === '/api/agent/workspace/operations') return jsonResponse({
        status: 'conflict', operation: 'confirm-why', authoritativeRevision: 0,
        derivedModule: 'form-foundation', pendingDecision: {
          kind: 'why-confirmation', targetId: 'why-1', targetRevision: 1,
        }, errorClass: 'revision-conflict', retryable: true,
      }, 409);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Your Map' }));
    const action = await screen.findByRole('button', { name: 'Confirm this Why' });
    action.focus();
    fireEvent.click(action);
    expect(await screen.findByText(/Why: Conflict/)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your Map' })));
  });

  it('reconciles a lost operation response only from the exact operation receipt', async () => {
    let operationId = '';
    let workspaceFetches = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace/operations') {
        operationId = JSON.parse(String(init?.body)).operationId;
        return jsonResponse({ malformed: true });
      }
      if (url === '/api/agent/workspace') {
        workspaceFetches += 1;
        if (workspaceFetches === 1) return jsonResponse(suggestedWhyWorkspace());
        const recovered = suggestedWhyWorkspace();
        recovered.map.revision = 1;
        recovered.map.operationHistory.push({
          sourceId: operationId,
          operationType: 'confirm-why',
          payloadFingerprint: 'fingerprint',
          resultRevision: 1,
          committedAt: '2030-01-01T00:00:01.000Z',
          confirmationProvenance: null,
          moduleVersion: null,
        });
        return jsonResponse(recovered);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm this Why' }));
    expect(await screen.findByText(/Why: Saved/)).toBeTruthy();
    expect(screen.getByText(/connection ended after this change was saved/i)).toBeTruthy();
  });

  it('terminalizes an aborted direct action without crediting an unrelated revision', async () => {
    let workspaceFetches = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') return Promise.resolve(jsonResponse({ status: 'empty', messages: [] }));
      if (url === '/api/agent/workspace') {
        workspaceFetches += 1;
        if (workspaceFetches === 1) return Promise.resolve(jsonResponse(suggestedWhyWorkspace()));
        const unrelated = suggestedWhyWorkspace();
        unrelated.map.revision = 1;
        unrelated.map.operationHistory.push({
          sourceId: 'another-operation', operationType: 'confirm-why', payloadFingerprint: 'fingerprint',
          resultRevision: 1, committedAt: '2030-01-01T00:00:01.000Z', confirmationProvenance: null, moduleVersion: null,
        });
        return Promise.resolve(jsonResponse(unrelated));
      }
      if (url === '/api/agent/workspace/operations') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm this Why' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(await screen.findByText(/Why: Failed/)).toBeTruthy();
    expect(screen.getByText(/before this action was confirmed saved/i)).toBeTruthy();
    expect(screen.queryByText(/Why: Saving/)).toBeNull();
  });

  it('keeps Saved when a stopped direct action has the exact committed receipt', async () => {
    let operationId = '';
    let workspaceFetches = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') return Promise.resolve(jsonResponse({ status: 'empty', messages: [] }));
      if (url === '/api/agent/workspace') {
        workspaceFetches += 1;
        if (workspaceFetches === 1) return Promise.resolve(jsonResponse(suggestedWhyWorkspace()));
        const committed = suggestedWhyWorkspace();
        committed.map.revision = 1;
        committed.map.operationHistory.push({
          sourceId: operationId, operationType: 'confirm-why', payloadFingerprint: 'fingerprint',
          resultRevision: 1, committedAt: '2030-01-01T00:00:01.000Z', confirmationProvenance: null, moduleVersion: null,
        });
        return Promise.resolve(jsonResponse(committed));
      }
      if (url === '/api/agent/workspace/operations') {
        operationId = JSON.parse(String(init?.body)).operationId;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm this Why' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(await screen.findByText(/Why: Saved/)).toBeTruthy();
    expect(screen.getByText(/stopped after this change was saved/i)).toBeTruthy();
  });

  it('preserves a new draft typed while a failing reply is in flight', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse(emptyWorkspace());
      if (url === '/api/agent') {
        return new Response(new ReadableStream({ start(controller) { streamController = controller; } }), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Submitted message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(streamController).toBeTruthy());
    fireEvent.change(textbox, { target: { value: 'My next thought' } });
    streamController!.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', errorText: 'failed' })}\n`));
    streamController!.close();

    await screen.findByText(/current draft is unchanged/i);
    expect((textbox as HTMLTextAreaElement).value).toBe('My next thought');
  });

  it('renders validated claim citations beside the live streamed claim', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse(emptyWorkspace());
      if (url === '/api/agent') {
        return new Response(new ReadableStream({ start(controller) { streamController = controller; } }), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'What is supported?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(streamController).toBeTruthy());
    const citation = {
      version: 1,
      citationId: 'citation-live-1',
      turnId: 'turn-live-1',
      messageId: 'message-live-1',
      textHash: 'a'.repeat(64),
      exactClaim: 'Supported claim.',
      start: 0,
      end: 16,
      url: 'https://example.com/source',
      title: 'Example source',
      support: 'server-validated',
    };
    await act(async () => {
      streamController!.enqueue(encoder.encode([
        `data: ${JSON.stringify({ type: 'text-delta', id: 'text-live-1', delta: 'Supported claim.' })}`,
        `data: ${JSON.stringify({ type: 'data-claim-citation', id: citation.citationId, data: citation })}`,
        '',
      ].join('\n')));
    });

    const link = await screen.findByRole('link', { name: 'Source: Example source' });
    expect(link.getAttribute('href')).toBe('https://example.com/source');
    await act(async () => streamController!.close());
  });

  it('aborts active reads and agent work when the workspace unmounts', async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(fetch).mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => undefined);
    });
    const view = render(<Explore {...props()} />);
    await waitFor(() => expect(signals.length).toBe(2));
    view.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('ignores an older refresh that settles after a newer authoritative refresh', async () => {
    const oldHistory = deferred<Response>();
    const oldWorkspace = deferred<Response>();
    let historyFetches = 0;
    let workspaceFetches = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyFetches += 1;
        if (historyFetches === 1) return Promise.reject(new Error('initial history failure'));
        if (historyFetches === 2) return oldHistory.promise;
        return Promise.resolve(jsonResponse({
          status: 'ready',
          messages: [{ id: 'new-state', role: 'assistant', parts: [{ type: 'text', text: 'Newest state' }] }],
        }));
      }
      if (url === '/api/agent/workspace') {
        workspaceFetches += 1;
        if (workspaceFetches === 1) return Promise.reject(new Error('initial workspace failure'));
        if (workspaceFetches === 2) return oldWorkspace.promise;
        return Promise.resolve(jsonResponse(emptyWorkspace()));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    render(<Explore {...props()} />);
    const retry = (await screen.findAllByRole('button', { name: 'Try again' }))[0];
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(await screen.findByText('Newest state')).toBeTruthy();

    oldHistory.resolve(jsonResponse({
      status: 'ready',
      messages: [{ id: 'old-state', role: 'assistant', parts: [{ type: 'text', text: 'Stale state' }] }],
    }));
    oldWorkspace.resolve(jsonResponse(suggestedWhyWorkspace()));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('Stale state')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm this Why' })).toBeNull();
  });

  it('terminalizes a streamed Saving attempt when the chat turn is stopped', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse(emptyWorkspace());
      if (url === '/api/agent') {
        const stream = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } });
        init?.signal?.addEventListener('abort', () => {
          streamController?.error(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Please confirm it.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(streamController).toBeTruthy());
    streamController!.enqueue(encoder.encode(`data: ${JSON.stringify({
      type: 'data-operation-status',
      id: 'operation-1',
      transient: true,
      data: {
        version: 1,
        turnId: 'turn-1',
        messageId: 'message-1',
        operationId: 'operation-1',
        operation: 'confirm-why',
        authoritativeRevision: null,
        status: 'Saving',
        sequence: 0,
      },
    })}\n`));
    expect(await screen.findByText(/Why: Saving/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByText(/Why: Failed/)).toBeTruthy();
    expect(screen.queryByText(/Why: Saving/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(textbox));
  });

  it('keeps Method actions disabled and names repair recovery when canonical state fails closed', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'empty', messages: [] });
      if (url.includes('/workspace')) return jsonResponse({ status: 'repair-required' }, 409);
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<Explore {...props()} />);
    expect(await screen.findByRole('heading', { name: 'Your map needs repair' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start path/ })).toBeNull();
    expect(screen.getByText(/stopped Method actions/)).toBeTruthy();
  });
});

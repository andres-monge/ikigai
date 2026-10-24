// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCareerMapOperation, createCareerMap, type CareerMap, type CareerMapOperation } from '@shared/career-map';
import type { NormalizedHistoryMessage } from '@/components/explore/explore-state';
import { ChatProjectBrief } from '@/components/explore/project-brief';
import { _resetBrowserSupportCache } from '@/hooks/use-speech-to-text';
import { attachProjectBriefs, attachPurposePathSets, Explore } from './explore';

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

function abortable<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject);
  });
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

const projectSupport = 'We can work out the next steps together. Tell me what you would change.';
function deliveredProjectMap(): CareerMap {
  let map = suggestedPathsMap();
  const commit = (operation: CareerMapOperation) => {
    const result = applyCareerMapOperation(map, operation);
    expect(result.status).toBe('committed');
    if (result.status !== 'committed') throw new Error('Project fixture did not commit');
    map = result.map;
  };
  const projectPresentation = { ...presentation, assistantTurnId: 'turn-proposal', turnSequence: 4 };
  const deliveryPresentation = { ...presentation, assistantTurnId: 'turn-delivery', turnSequence: 5 };
  commit({ type: 'select-purpose-path', sourceId: 'select', expectedRevision: map.revision, occurredAt: presentation.presentedAt,
    payload: { setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1,
      action: { kind: 'user-message', actionId: 'select', turnId: 'turn-selection', turnSequence: 4, occurredAt: presentation.presentedAt } } });
  commit({ type: 'propose-first-project', sourceId: 'proposal', expectedRevision: map.revision, occurredAt: presentation.presentedAt,
    payload: { project: { id: 'simple-project', revision: 1, briefFormat: 'simple-v1', relationship: 'linked',
      title: 'Make one useful guide', learningGoal: 'Notice whether explaining one difficult idea gives you energy.',
      firstVersion: 'One rough illustrated page; stop after one reader tries it.', firstStep: 'Open a blank document and sketch one confusing moment.' }, presentation: projectPresentation } });
  commit({ type: 'present-first-project-framing', sourceId: 'framing', expectedRevision: map.revision, occurredAt: presentation.presentedAt,
    payload: { projectId: 'simple-project', projectRevision: 1, framingFormat: 'natural-v1', framingText: projectSupport,
      locale: 'en', moduleVersion: '1.3.0', presentation: deliveryPresentation } });
  commit({ type: 'deliver-first-project-framing', sourceId: 'delivery', expectedRevision: map.revision, occurredAt: presentation.presentedAt,
    payload: { projectId: 'simple-project', projectRevision: 1, assistantText: projectSupport, presentation: deliveryPresentation } });
  return map;
}

function projectMessage(id = 'project-final', turnId = 'turn-delivery'): NormalizedHistoryMessage {
  return { id, role: 'assistant', turn: { turnId, status: 'completed' }, isFinalAssistantItem: true,
    parts: [{ type: 'text', text: projectSupport }] };
}

function props() {
  return { userEmail: 'explorer@example.com', isSigningOut: false, signOutError: null, onSignOut: vi.fn() };
}

function installVoiceHarness(options: { pendingPermission?: boolean } = {}) {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(global.navigator, 'mediaDevices');
  const permission = deferred<MediaStream>();
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;

  class ControlledMediaRecorder {
    static instances: ControlledMediaRecorder[] = [];
    static isTypeSupported() { return true; }

    state: RecordingState = 'inactive';
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;

    constructor(_stream: MediaStream, public readonly options?: MediaRecorderOptions) {
      ControlledMediaRecorder.instances.push(this);
    }

    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['voice'], { type: 'audio/webm' }) });
      this.onstop?.();
    }
    emit(data: Blob) { this.ondataavailable?.({ data }); }
  }

  const getUserMedia = vi.fn(() => options.pendingPermission ? permission.promise : Promise.resolve(stream));
  vi.stubGlobal('MediaRecorder', ControlledMediaRecorder);
  Object.defineProperty(global.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  _resetBrowserSupportCache();

  return {
    permission,
    stream,
    stopTrack,
    getUserMedia,
    recorders: ControlledMediaRecorder.instances,
    restore() {
      if (originalMediaDevices) {
        Object.defineProperty(global.navigator, 'mediaDevices', originalMediaDevices);
      } else {
        Reflect.deleteProperty(global.navigator, 'mediaDevices');
      }
      _resetBrowserSupportCache();
    },
  };
}

describe('Explore U6 conversation-first workspace', () => {
  beforeEach(() => {
    _resetBrowserSupportCache();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'empty', messages: [] });
      if (url.includes('/workspace')) return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      throw new Error(`Unexpected request: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    _resetBrowserSupportCache();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends attachment-only file bytes and retains exact files on a recoverable failure', async () => {
    const sent: Array<{ message: string; attachments: Array<{ data: string }> }> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes('/history')) return jsonResponse({ status: 'empty', messages: [] });
      if (String(input).includes('/workspace')) return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      sent.push(JSON.parse(init!.body as string));
      throw new Error('Network failed');
    });
    render(<Explore {...props()} />);
    const picker = await screen.findByLabelText('Attach files');
    const file = new File(['%PDF-content'], 'brief.pdf', { type: 'application/pdf' });
    fireEvent.change(picker, { target: { files: [file] } });
    await screen.findByRole('button', { name: 'Remove brief.pdf' });
    const send = screen.getByRole('button', { name: 'Send' });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);
    await screen.findByText(/submitted message has been restored/);
    expect(sent[0]).toMatchObject({ message: '', attachments: [{ name: 'brief.pdf', mediaType: 'application/pdf', data: btoa('%PDF-content') }] });
    expect(screen.getByRole('button', { name: 'Remove brief.pdf' })).toBeTruthy();
  });

  it('keeps a newer draft on Stop and restores the prior caption and files only by explicit replacement', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes('/history')) return jsonResponse({ status: 'empty', messages: [] });
      if (String(input).includes('/workspace')) return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      return abortable(pending.promise, init?.signal);
    });
    render(<Explore {...props()} />);
    fireEvent.change(await screen.findByLabelText('Attach files'), { target: { files: [new File(['%PDF-original'], 'original.pdf', { type: 'application/pdf' })] } });
    await screen.findByRole('button', { name: 'Remove original.pdf' });
    const textbox = screen.getByRole('textbox');
    fireEvent.change(textbox, { target: { value: 'Original caption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('button', { name: 'Stop' });
    fireEvent.change(textbox, { target: { value: 'Newer draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    const restore = await screen.findByRole('button', { name: 'Restore previous submission (replaces current draft)' });
    expect((textbox as HTMLTextAreaElement).value).toBe('Newer draft');
    expect(screen.queryByRole('button', { name: 'Remove original.pdf' })).toBeNull();
    fireEvent.click(restore);
    expect((textbox as HTMLTextAreaElement).value).toBe('Original caption');
    expect(screen.getByRole('button', { name: 'Remove original.pdf' })).toBeTruthy();
  });

  it('preserves text and valid files when an addition is unsupported or exceeds the aggregate', async () => {
    render(<Explore {...props()} />);
    const picker = await screen.findByLabelText('Attach files');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this question' } });
    fireEvent.change(picker, { target: { files: [new File(['%PDF-ok'], 'valid.pdf', { type: 'application/pdf' }), new File(['x'], 'bad.exe', { type: 'application/octet-stream' })] } });
    await screen.findByRole('button', { name: 'Remove valid.pdf' });
    await screen.findByText(/Choose PNG, JPEG/);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Keep this question');
    fireEvent.change(picker, { target: { files: [new File([new Uint8Array(3_000_000)], 'large.pdf', { type: 'application/pdf' })] } });
    await screen.findByText(/Files exceed 3 MB/);
    expect(screen.getByRole('button', { name: 'Remove valid.pdf' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove large.pdf' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove valid.pdf' }));
    expect(screen.queryByRole('button', { name: 'Remove valid.pdf' })).toBeNull();
  });

  it('handles image paste as a removable preview while leaving ordinary text paste alone', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:synthetic-preview'), revokeObjectURL: vi.fn() }));
    render(<Explore {...props()} />);
    await screen.findByLabelText('Attach files');
    const textbox = screen.getByRole('textbox');
    const image = new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'paste.png', { type: 'image/png' });
    const preventDefault = vi.fn();
    fireEvent.paste(textbox, { clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }] }, preventDefault });
    await screen.findByAltText('Attached image preview');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Remove paste.png' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-preview');
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { items: [{ kind: 'string', type: 'text/plain' }] } });
    fireEvent(textbox, event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('shows the saved simple brief before support-only final prose in the same Chat message', async () => {
    const map = deliveredProjectMap();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'ready', messages: [projectMessage()] });
      if (url.includes('/workspace')) return jsonResponse({ status: 'ready', map });
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<Explore {...props()} />);
    const chat = screen.getByRole('tabpanel', { name: 'Chat' });
    const title = await within(chat).findByRole('heading', { name: map.projects[0].title });
    const brief = title.closest('[data-project-brief]')!;
    expect([...brief.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
      "What you'll learn", "What you'll make", 'Suggested starting point',
    ]);
    for (const value of [map.projects[0].title, map.projects[0].learningGoal, map.projects[0].firstVersion, map.projects[0].firstStep]) {
      expect(within(chat).getAllByText(value)).toHaveLength(1);
    }
    const support = within(chat).getByText(projectSupport);
    expect(brief.parentElement?.contains(support)).toBe(true);
    expect(brief.parentElement?.querySelectorAll('article')).toHaveLength(1);
    expect(brief.compareDocumentPosition(support) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(brief.querySelector('button')).toBeNull();
    expect(brief.textContent).not.toMatch(/Agreement:|Work:|delivered|simple-v1/);
  });

  it('attaches each historical brief once to its exact framing delivery final item', () => {
    let map = deliveredProjectMap();
    const replacementPresentation = { ...presentation, assistantTurnId: 'turn-replacement', turnSequence: 6 };
    const commit = (operation: CareerMapOperation) => {
      const result = applyCareerMapOperation(map, operation);
      expect(result.status).toBe('committed');
      if (result.status !== 'committed') throw new Error('Replacement fixture did not commit');
      map = result.map;
    };
    commit({ type: 'replace-project-proposal', sourceId: 'replace', expectedRevision: map.revision, occurredAt: presentation.presentedAt,
      payload: { projectId: 'simple-project', projectRevision: 1,
        replacement: { id: 'simple-project', revision: 2, briefFormat: 'simple-v1', title: 'A revised guide',
          learningGoal: 'Notice whether illustrating the idea feels energizing.', firstVersion: 'One illustrated page.', firstStep: 'Draw one example.' },
        presentation: replacementPresentation } });
    commit({ type: 'present-first-project-framing', sourceId: 'replacement-framing', expectedRevision: map.revision, occurredAt: presentation.presentedAt,
      payload: { projectId: 'simple-project', projectRevision: 2, locale: 'en', framingFormat: 'natural-v1', framingText: projectSupport,
        moduleVersion: '1.3.0', presentation: replacementPresentation } });
    commit({ type: 'deliver-first-project-framing', sourceId: 'replacement-delivery', expectedRevision: map.revision, occurredAt: presentation.presentedAt,
      payload: { projectId: 'simple-project', projectRevision: 2, assistantText: projectSupport, presentation: replacementPresentation } });
    const [original, replacement] = map.projects;
    expect(original.agreementStatus).toBe('superseded');
    const messages = [projectMessage('proposal', 'turn-proposal'), { ...projectMessage('nonfinal'), isFinalAssistantItem: undefined },
      projectMessage(), projectMessage('duplicate'), projectMessage('replacement-final', 'turn-replacement')];
    const attached = attachProjectBriefs(messages, [original, replacement, structuredClone(original)]);
    expect([...attached.keys()]).toEqual(['project-final', 'replacement-final']);
    expect(attached.get('project-final')).toEqual([original]);
    expect(attached.get('replacement-final')).toEqual([replacement]);
    expect(attachProjectBriefs([...messages, ...messages], map.projects)).toEqual(attached);
  });

  it('does not attach pending, incomplete, legacy or unhosted project briefs', () => {
    const project = deliveredProjectMap().projects[0];
    const variants = [
      { ...project, briefFormat: undefined },
      { ...project, acceptanceFraming: undefined },
      { ...project, acceptanceFraming: { ...project.acceptanceFraming!, status: 'pending' as const } },
      { ...project, acceptanceFraming: { ...project.acceptanceFraming!, framingFormat: undefined } },
      { ...project, acceptanceFraming: { ...project.acceptanceFraming!, presentation: undefined } },
      { ...project, acceptanceFraming: { ...project.acceptanceFraming!,
        presentation: { ...project.acceptanceFraming!.presentation!, assistantTurnId: 'wrong-delivery' } } },
    ];
    for (const variant of variants) expect(attachProjectBriefs([projectMessage()], [variant]).size).toBe(0);
    for (const status of ['failed', 'cancelled'] as const) {
      expect(attachProjectBriefs([{ ...projectMessage(), turn: { turnId: 'turn-delivery', status } }], [project]).size).toBe(0);
    }
    expect(attachProjectBriefs([{ ...projectMessage(), turn: undefined, isFinalAssistantItem: undefined }], [project]).size).toBe(0);
    expect(attachProjectBriefs([projectMessage('other', 'another-turn')], [project]).size).toBe(0);
    expect(attachProjectBriefs([], [project]).size).toBe(0);
  });

  it('renders unrelated project fields as text without markup, status copy or actions', () => {
    const project = { ...deliveredProjectMap().projects[0], relationship: 'unrelated' as const,
      title: '<script>Title</script>', firstStep: '<img src=x onerror=alert(1)>Open a document.' };
    const { container } = render(<ChatProjectBrief project={project} />);
    expect(screen.getByRole('heading', { name: project.title })).toBeTruthy();
    expect(screen.getByText(project.firstStep)).toBeTruthy();
    expect(screen.getByText('Intentionally unrelated to your current Purpose Path.')).toBeTruthy();
    expect(container.querySelector('script, img, a, button')).toBeNull();
    expect(container.textContent).not.toMatch(/Agreement:|Work:|delivered|simple-v1/);
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

  it('attaches one three-card presentation after an atomic revision of paths one and three', async () => {
    const original = suggestedPathsMap();
    const toInput = ({ selection: _selection, equalWeight: _equalWeight, ...path }: CareerMap['pathSets'][number]['paths'][number]) => path;
    const [first, second, third] = original.pathSets[0].paths;
    const result = applyCareerMapOperation(original, {
      type: 'revise-purpose-paths', sourceId: 'two-path-revision', expectedRevision: original.revision,
      occurredAt: '2030-01-01T00:00:04.000Z',
      payload: {
        sourceSetId: 'set-1', sourceSetRevision: 1,
        replacementSetId: 'set-revised', replacementSetRevision: 1,
        paths: [
          { ...toInput(first), id: 'path-4', name: 'Explore RL and alignment' },
          toInput(second),
          { ...toInput(third), id: 'path-5', name: 'Create AI art with TouchDesigner' },
        ],
        presentation: { ...presentation, assistantTurnId: 'turn-revised', turnSequence: 4 },
      },
    });
    expect(result.status).toBe('committed');
    if (result.status !== 'committed') return;
    expect(result.map.pathSets).toHaveLength(2);

    const messages: NormalizedHistoryMessage[] = [
      ...historyMessages(),
      { id: 'revised-final', role: 'assistant', turn: { turnId: 'turn-revised', status: 'completed' },
        isFinalAssistantItem: true, parts: [{ type: 'text', text: 'Here are three revised paths.' }] },
    ];
    const attached = attachPurposePathSets(messages, result.map.pathSets);
    expect(attached.get('revised-final')).toHaveLength(1);
    expect(attached.get('revised-final')?.[0].paths.map((path) => path.name)).toEqual([
      'Explore RL and alignment', 'Path 2', 'Create AI art with TouchDesigner',
    ]);

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history')) return jsonResponse({ status: 'ready', messages });
      if (url.includes('/workspace')) return jsonResponse({ status: 'ready', map: result.map });
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<Explore {...props()} />);
    const chat = screen.getByRole('tabpanel', { name: 'Chat' });
    await within(chat).findByText('Explore RL and alignment');
    const revisedSet = within(chat).getByText('Explore RL and alignment').closest('[data-path-set="set-revised@1"]');
    expect(revisedSet).not.toBeNull();
    expect(within(revisedSet as HTMLElement).getAllByTestId('purpose-path-card')).toHaveLength(3);
    expect(within(chat).getAllByText('Explore RL and alignment')).toHaveLength(1);
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

  it('keeps the Revelio opening at the oldest boundary after the first reply', async () => {
    const turnResponse = deferred<Response>();
    let historyReads = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        return historyReads === 1
          ? jsonResponse({ status: 'empty', messages: [] })
          : jsonResponse({ status: 'ready', messages: [
            { id: 'history-user', role: 'user', parts: [{ type: 'text', text: 'Building useful tools.' }] },
            { id: 'history-assistant', role: 'assistant', turn: { turnId: 'turn-1', status: 'completed' }, isFinalAssistantItem: true, parts: [{ type: 'text', text: 'Follow-up question.' }] },
          ] });
      }
      if (url === '/api/agent/workspace') {
        return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      }
      if (url === '/api/agent') return turnResponse.promise;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const opening = await screen.findByText('What activities pull you in so much that you lose track of time?');
    const openingArticle = opening.closest('article')!;
    expect(openingArticle.classList.contains('mx-auto')).toBe(true);
    expect(openingArticle.classList.contains('w-full')).toBe(true);
    expect(openingArticle.classList.contains('max-w-[38rem]')).toBe(true);
    const textbox = screen.getByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Building useful tools.' } });
    const send = screen.getByRole('button', { name: 'Send' });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);

    const optimisticUser = await screen.findByRole('article', { name: 'You' });
    expect(screen.getByText('What activities pull you in so much that you lose track of time?')).toBe(opening);
    expect(openingArticle.compareDocumentPosition(optimisticUser) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await act(async () => {
      turnResponse.resolve(streamResponse([
        { type: 'text-start', id: 'assistant-live' },
        { type: 'text-delta', id: 'assistant-live', delta: 'Follow-up question.' },
        { type: 'text-end', id: 'assistant-live' },
        { type: 'finish', finishReason: 'stop' },
      ]));
    });

    await screen.findByText('Follow-up question.');
    await waitFor(() => expect(historyReads).toBeGreaterThan(1));
    expect(screen.getAllByText('What activities pull you in so much that you lose track of time?')).toHaveLength(1);
    const historicalUser = screen.getByRole('article', { name: 'You' });
    expect(openingArticle.compareDocumentPosition(historicalUser) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('restores a path revision request when the provider ends without a visible reply', async () => {
    const originalHistory = historyMessages();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'ready', messages: originalHistory });
      if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: suggestedPathsMap() });
      if (url === '/api/agent') return streamResponse([
        { type: 'start', messageId: 'assistant-silent' },
        { type: 'error', errorText: 'The agent request failed.' },
      ]);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    const message = 'Please change one of these paths.';
    fireEvent.change(textbox, { target: { value: message } });
    const send = screen.getByRole('button', { name: 'Send' });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);

    await waitFor(() => expect((textbox as HTMLTextAreaElement).value).toBe(message));
    expect(screen.getByText('Revelio’s reply failed. Your submitted message is available to edit.')).toBeTruthy();
    expect(screen.getAllByTestId('purpose-path-card')).toHaveLength(6);
  });

  it('withholds the opening until paginated history reaches the oldest boundary', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        return jsonResponse({ status: 'ready', messages: historyMessages(), olderCursor: 'older-page' });
      }
      if (url === '/api/agent/workspace') {
        return jsonResponse({ status: 'ready', map: suggestedPathsMap() });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);

    expect(await screen.findByRole('button', { name: 'Load older messages' })).toBeTruthy();
    expect(screen.queryByText('What activities pull you in so much that you lose track of time?')).toBeNull();
  });

  it('shows transcript-level thinking until the first assistant text arrives', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') {
        return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      }
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
    fireEvent.change(textbox, { target: { value: 'Here is my answer.' } });
    const send = screen.getByRole('button', { name: 'Send' });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);

    await waitFor(() => expect(streamController).toBeTruthy());
    expect(await screen.findByRole('status', { name: 'Revelio is responding.' })).toBeTruthy();

    await act(async () => {
      streamController!.enqueue(encoder.encode([
        `data: ${JSON.stringify({ type: 'text-start', id: 'assistant-live' })}`,
        `data: ${JSON.stringify({ type: 'text-delta', id: 'assistant-live', delta: 'First response token.' })}`,
        '',
      ].join('\n')));
    });

    expect(await screen.findByText('First response token.')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Revelio is responding.' })).toBeNull();

    await act(async () => {
      streamController!.enqueue(encoder.encode([
        `data: ${JSON.stringify({ type: 'text-end', id: 'assistant-live' })}`,
        `data: ${JSON.stringify({ type: 'finish', finishReason: 'stop' })}`,
        'data: [DONE]',
        '',
      ].join('\n')));
      streamController!.close();
    });
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

  it('shows recording and transcription progress before adding speech to the editable draft', async () => {
    const transcription = deferred<Response>();
    const originalMediaDevices = Object.getOwnPropertyDescriptor(global.navigator, 'mediaDevices');
    class MockMediaRecorder {
      static isTypeSupported() { return true; }
      state: 'inactive' | 'recording' = 'inactive';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;

      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['voice'], { type: 'audio/webm' }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
      },
    });
    _resetBrowserSupportCache();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      if (url.startsWith('/api/agent/audio/transcribe')) return transcription.promise;
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      render(<Explore {...props()} />);
      const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
      fireEvent.click(screen.getByRole('button', { name: 'Record a message' }));

      await screen.findByRole('button', { name: 'Stop recording' });
      expect(screen.getByText('Recording…')).toBeTruthy();
      expect(screen.queryByText(/Choose Stop|Waiting for microphone permission|Transcribing…/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Cancel recording' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Send' }).getAttribute('aria-describedby')).toBe('voice-send-block-reason');
      expect(screen.getByText('Finish or cancel recording before sending.').classList.contains('sr-only')).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
      expect(await screen.findByRole('button', { name: 'Cancel transcription' })).toBeTruthy();
      expect(screen.queryByText(/Recording…|Waiting for microphone permission|Transcribing…/)).toBeNull();

      await act(async () => {
        transcription.resolve(jsonResponse({ text: 'Speech stays editable.' }));
      });
      await waitFor(() => expect((textbox as HTMLTextAreaElement).value).toBe('Speech stays editable.'));
      expect(screen.queryByText('Transcription added to your draft. Review it before sending.')).toBeNull();
      expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
      expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === '/api/agent')).toHaveLength(0);
    } finally {
      if (originalMediaDevices) {
        Object.defineProperty(global.navigator, 'mediaDevices', originalMediaDevices);
      } else {
        Reflect.deleteProperty(global.navigator, 'mediaDevices');
      }
      _resetBrowserSupportCache();
    }
  });

  it('uses the Method policy, keeps Stop and Cancel distinct, appends to the latest draft, and never auto-sends', async () => {
    const voice = installVoiceHarness();
    const transcription = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      if (url === '/api/agent/audio/transcribe') return transcription.promise;
      throw new Error(`Unexpected request: ${url} ${String(init?.method)}`);
    });

    try {
      render(<Explore {...props()} />);
      const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
      fireEvent.change(textbox, { target: { value: 'Typed context' } });
      const start = screen.getByRole('button', { name: 'Record a message' });
      start.focus();
      fireEvent.click(start);

      const stop = await screen.findByRole('button', { name: 'Stop recording' });
      expect(screen.getByRole('button', { name: 'Cancel recording' })).toBeTruthy();
      expect(document.activeElement).toBe(stop);
      fireEvent.click(stop);

      const cancelProcessing = await screen.findByRole('button', { name: 'Cancel transcription' });
      expect(document.activeElement).toBe(cancelProcessing);
      const audioCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input) === '/api/agent/audio/transcribe');
      expect(audioCall?.[1]?.headers).toMatchObject({ 'X-Revelio-Request': '1' });
      expect(String(audioCall?.[0])).not.toContain('language=');

      fireEvent.change(textbox, { target: { value: 'Typed context, edited while processing' } });
      await act(async () => { transcription.resolve(jsonResponse({ text: 'Hola, keep both languages.' })); });
      await waitFor(() => expect((textbox as HTMLTextAreaElement).value)
        .toBe('Typed context, edited while processing Hola, keep both languages.'));
      await waitFor(() => expect(document.activeElement).toBe(textbox));
      expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === '/api/agent')).toHaveLength(0);
      expect(screen.queryByText(/OpenAI processes authenticated Method dictation/i)).toBeNull();
    } finally {
      voice.restore();
    }
  });

  it.each(['requesting', 'recording', 'processing'] as const)(
    'cancels %s without changing the draft and fences late completion',
    async (phase) => {
      const voice = installVoiceHarness({ pendingPermission: phase === 'requesting' });
      const transcription = deferred<Response>();
      vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
        if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
        if (url === '/api/agent/audio/transcribe') return transcription.promise;
        throw new Error(`Unexpected request: ${url}`);
      });

      try {
        render(<Explore {...props()} />);
        const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
        fireEvent.change(textbox, { target: { value: `Keep ${phase} draft` } });
        fireEvent.click(screen.getByRole('button', { name: 'Record a message' }));

        if (phase === 'requesting') {
          fireEvent.click(await screen.findByRole('button', { name: 'Cancel recording request' }));
          await act(async () => { voice.permission.resolve(voice.stream); });
          expect(voice.stopTrack).toHaveBeenCalledTimes(1);
        } else {
          await screen.findByRole('button', { name: 'Stop recording' });
          if (phase === 'processing') {
            fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
            fireEvent.click(await screen.findByRole('button', { name: 'Cancel transcription' }));
            await act(async () => { transcription.resolve(jsonResponse({ text: 'Late transcript' })); });
          } else {
            const recorder = voice.recorders[0];
            const staleStop = recorder.onstop;
            fireEvent.click(screen.getByRole('button', { name: 'Cancel recording' }));
            act(() => { staleStop?.(); });
          }
        }

        await waitFor(() => expect((textbox as HTMLTextAreaElement).value).toBe(`Keep ${phase} draft`));
        const restarted = screen.getByRole('button', { name: 'Record a message' });
        await waitFor(() => expect(document.activeElement).toBe(restarted));
        expect(screen.queryByDisplayValue(/Late transcript/)).toBeNull();
        expect(screen.getByText(/canceled.*draft was not changed/i)).toBeTruthy();
      } finally {
        voice.restore();
      }
    },
  );

  it.each(['requesting', 'recording', 'processing'] as const)(
    'keeps Send focusable and blocks click and Enter while voice is %s',
    async (phase) => {
      const voice = installVoiceHarness({ pendingPermission: phase === 'requesting' });
      const transcription = deferred<Response>();
      vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
        if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
        if (url === '/api/agent/audio/transcribe') return transcription.promise;
        if (url === '/api/agent') throw new Error('agent submission must stay blocked');
        throw new Error(`Unexpected request: ${url}`);
      });

      try {
        render(<Explore {...props()} />);
        const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
        fireEvent.change(textbox, { target: { value: 'Do not send yet' } });
        fireEvent.click(screen.getByRole('button', { name: 'Record a message' }));
        if (phase !== 'requesting') await screen.findByRole('button', { name: 'Stop recording' });
        if (phase === 'processing') {
          fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
          await screen.findByRole('button', { name: 'Cancel transcription' });
        }
        if (phase === 'recording') {
          expect(screen.getByText('Recording…')).toBeTruthy();
        } else {
          expect(screen.queryByText(/Recording…|Waiting for microphone permission|Transcribing…/)).toBeNull();
        }

        const send = screen.getByRole('button', { name: 'Send' });
        expect((send as HTMLButtonElement).disabled).toBe(false);
        expect(send.getAttribute('aria-disabled')).toBe('true');
        send.focus();
        fireEvent.click(send);
        expect(document.activeElement).toBe(send);
        fireEvent.keyDown(textbox, { key: 'Enter' });
        expect((textbox as HTMLTextAreaElement).value).toBe('Do not send yet');
        expect(screen.getByText('Finish or cancel recording before sending.')).toBeTruthy();
        expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === '/api/agent')).toHaveLength(0);
      } finally {
        voice.restore();
      }
    },
  );

  it.each(['map', 'sign-out'] as const)('discards processing before %s and ignores a late transcript', async (departure) => {
    const voice = installVoiceHarness();
    const transcription = deferred<Response>();
    let uploadSignal: AbortSignal | null | undefined;
    const onSignOut = vi.fn(() => {
      expect(uploadSignal?.aborted).toBe(true);
    });
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      if (url === '/api/agent/audio/transcribe') {
        uploadSignal = init?.signal;
        return transcription.promise;
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      render(<Explore {...props()} onSignOut={onSignOut} />);
      const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
      fireEvent.change(textbox, { target: { value: 'Preserve on departure' } });
      fireEvent.click(screen.getByRole('button', { name: 'Record a message' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
      await screen.findByRole('button', { name: 'Cancel transcription' });

      let departureControl: HTMLElement;
      if (departure === 'map') {
        departureControl = screen.getByRole('tab', { name: 'Your Map' });
        departureControl.focus();
        fireEvent.click(departureControl);
        expect(uploadSignal?.aborted).toBe(true);
      } else {
        departureControl = screen.getByRole('button', { name: 'Sign out' });
        departureControl.focus();
        fireEvent.click(departureControl);
        expect(onSignOut).toHaveBeenCalledTimes(1);
      }
      await act(async () => { transcription.resolve(jsonResponse({ text: 'Too late' })); });
      expect((textbox as HTMLTextAreaElement).value).toBe('Preserve on departure');
      expect(document.activeElement).toBe(departureControl);
    } finally {
      voice.restore();
    }
  });

  it('discards unresolved voice work when signing-out state arrives externally', async () => {
    const voice = installVoiceHarness();
    const transcription = deferred<Response>();
    let uploadSignal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      if (url === '/api/agent/audio/transcribe') {
        uploadSignal = init?.signal;
        return transcription.promise;
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      const view = render(<Explore {...props()} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Record a message' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
      await screen.findByRole('button', { name: 'Cancel transcription' });
      view.rerender(<Explore {...props()} isSigningOut />);
      expect(uploadSignal?.aborted).toBe(true);
      await act(async () => { transcription.resolve(jsonResponse({ text: 'Too late' })); });
      expect((screen.getByRole('textbox', { name: 'Message Revelio' }) as HTMLTextAreaElement).value).toBe('');
    } finally {
      voice.restore();
    }
  });

  it('preserves typed text and returns focus for permission errors and empty transcription', async () => {
    const voice = installVoiceHarness();
    voice.getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    const emptyTranscription = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
      if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
      if (url === '/api/agent/audio/transcribe') return emptyTranscription.promise;
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      render(<Explore {...props()} />);
      const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
      fireEvent.change(textbox, { target: { value: 'Typed fallback' } });
      fireEvent.click(screen.getByRole('button', { name: 'Record a message' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/Microphone access denied.*type your answer or try recording again/i);
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Record a message' })));

      voice.getUserMedia.mockResolvedValueOnce(voice.stream);
      fireEvent.click(screen.getByRole('button', { name: 'Record a message' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
      await act(async () => { emptyTranscription.resolve(jsonResponse({ text: '   ' })); });
      expect(await screen.findByText(/No speech was detected.*type your answer or try recording again/i)).toBeTruthy();
      expect((textbox as HTMLTextAreaElement).value).toBe('Typed fallback');
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Record a message' })));
    } finally {
      voice.restore();
    }
  });

  it('keeps unsupported dictation focusable and exposes the typed fallback', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    _resetBrowserSupportCache();
    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Typing still works' } });
    const unavailable = screen.getByRole('button', { name: 'Microphone unavailable' });
    expect((unavailable as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(unavailable);
    expect((await screen.findByRole('alert')).textContent).toMatch(/not supported.*type your answer or try recording again/i);
    expect((textbox as HTMLTextAreaElement).value).toBe('Typing still works');
    await waitFor(() => expect(document.activeElement).toBe(unavailable));
  });

  it.each(['byte-limit', 'time-limit'] as const)(
    'keeps the %s incomplete warning through later voice work and clears it only with the affected draft',
    async (limitReason) => {
      const voice = installVoiceHarness();
      const firstTranscription = deferred<Response>();
      const laterTranscription = deferred<Response>();
      const agentTurn = deferred<Response>();
      let audioRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/agent/history') return jsonResponse({ status: 'empty', messages: [] });
        if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') });
        if (url === '/api/agent/audio/transcribe') {
          audioRequests += 1;
          return audioRequests === 1 ? firstTranscription.promise : laterTranscription.promise;
        }
        if (url === '/api/agent') return agentTurn.promise;
        throw new Error(`Unexpected request: ${url}`);
      });

      try {
        render(<Explore {...props()} />);
        const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
        fireEvent.change(textbox, { target: { value: 'Affected draft' } });
        if (limitReason === 'time-limit') vi.useFakeTimers();
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Record a message' }));
          await Promise.resolve();
          await Promise.resolve();
        });
        const stopRecording = limitReason === 'time-limit'
          ? screen.getByRole('button', { name: 'Stop recording' })
          : await screen.findByRole('button', { name: 'Stop recording' });
        expect(stopRecording).toBeTruthy();

        if (limitReason === 'byte-limit') {
          act(() => { voice.recorders[0].emit(new Blob([new Uint8Array(9 * 1024 * 1024)], { type: 'audio/webm' })); });
        } else {
          await act(async () => { vi.advanceTimersByTime(300_000); });
          vi.useRealTimers();
        }
        await screen.findByRole('button', { name: 'Cancel transcription' });
        await act(async () => { firstTranscription.resolve(jsonResponse({ text: 'Possibly incomplete.' })); });

        const warning = await screen.findByText(/Recording stopped at the size\/time limit; this transcript may be incomplete\. Review before sending\./i);
        expect((textbox as HTMLTextAreaElement).value).toBe('Affected draft Possibly incomplete.');

        fireEvent.click(screen.getByRole('button', { name: 'Record a message' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Cancel recording' }));
        expect(warning.isConnected).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Record a message' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
        await act(async () => { laterTranscription.resolve(jsonResponse({ text: 'Later complete.' })); });
        expect(await screen.findByText(/Recording stopped at the size\/time limit/)).toBeTruthy();

        if (limitReason === 'byte-limit') {
          fireEvent.change(textbox, { target: { value: '' } });
          expect(screen.queryByText(/Recording stopped at the size\/time limit/)).toBeNull();
        } else {
          fireEvent.click(screen.getByRole('button', { name: 'Send' }));
          expect(screen.queryByText(/Recording stopped at the size\/time limit/)).toBeNull();
          expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === '/api/agent')).toHaveLength(1);
        }
      } finally {
        vi.useRealTimers();
        voice.restore();
      }
    },
  );

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

  it('shows transcript-level thinking while a direct Start operation is pending', async () => {
    const operationResponse = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        return jsonResponse({ status: 'ready', messages: historyMessages() });
      }
      if (url === '/api/agent/workspace') {
        return jsonResponse({ status: 'ready', map: suggestedPathsMap() });
      }
      if (url === '/api/agent/workspace/operations') return operationResponse.promise;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start path 1: Path 1' }));

    expect(await screen.findByRole('status', { name: 'Revelio is responding.' })).toBeTruthy();

    await act(async () => {
      operationResponse.resolve(jsonResponse({
        status: 'rejected',
        operation: 'select-purpose-path',
        authoritativeRevision: 0,
        derivedModule: 'create-purpose-paths',
        pendingDecision: { kind: 'path-selection', targetId: 'set-1', targetRevision: 1 },
        errorClass: 'operation-unavailable',
        retryable: false,
      }, 409));
    });
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Revelio is responding.' })).toBeNull());
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

  it('keeps a retry from being submitted again while its refresh is in flight', async () => {
    const retryHistory = deferred<Response>();
    let historyReads = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        return historyReads === 1
          ? Promise.reject(new Error('initial history unavailable'))
          : retryHistory.promise;
      }
      if (url === '/api/agent/workspace') {
        return Promise.resolve(jsonResponse({ status: 'ready', map: suggestedPathsMap() }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    const retrying = await screen.findByRole('button', { name: 'Trying again…' });
    expect((retrying as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(retrying);
    expect(historyReads).toBe(2);

    await act(async () => {
      retryHistory.resolve(jsonResponse({ status: 'ready', messages: historyMessages() }));
      await retryHistory.promise;
    });
    expect(await screen.findByText('Compare them below.')).toBeTruthy();
  });

  it('allows a valid cold history read to finish after five seconds', async () => {
    vi.useFakeTimers();
    const historyResponse = deferred<Response>();
    let historySignal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historySignal = init?.signal;
        return abortable(historyResponse.promise, historySignal);
      }
      if (url === '/api/agent/workspace') {
        return Promise.resolve(jsonResponse({ status: 'ready', map: suggestedPathsMap() }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_100); });

    expect(historySignal?.aborted).toBe(false);
    expect(screen.queryByText('Your conversation could not be loaded.')).toBeNull();

    await act(async () => {
      historyResponse.resolve(jsonResponse({ status: 'ready', messages: historyMessages() }));
      await historyResponse.promise;
    });
    expect(screen.getByText('Compare them below.')).toBeTruthy();
  });

  it('still aborts a hung history read after the extended budget', async () => {
    vi.useFakeTimers();
    let historySignal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historySignal = init?.signal;
        return abortable(new Promise<Response>(() => undefined), historySignal);
      }
      if (url === '/api/agent/workspace') {
        return Promise.resolve(jsonResponse({ status: 'ready', map: suggestedPathsMap() }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(14_900); });
    expect(historySignal?.aborted).toBe(false);
    expect(screen.queryByText('Your conversation could not be loaded.')).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(200); });

    expect(historySignal?.aborted).toBe(true);
    expect(screen.getByText('Your conversation could not be loaded.')).toBeTruthy();
  });

  it('uses the extended budget for older history without replacing the current transcript', async () => {
    let historyReads = 0;
    let olderSignal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        return Promise.resolve(jsonResponse({
          status: 'ready',
          messages: historyMessages(),
          olderCursor: 'older-page',
        }));
      }
      if (url === '/api/agent/history?cursor=older-page') {
        olderSignal = init?.signal;
        return abortable(new Promise<Response>(() => undefined), olderSignal);
      }
      if (url === '/api/agent/workspace') {
        return Promise.resolve(jsonResponse({ status: 'ready', map: suggestedPathsMap() }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const loadOlder = await screen.findByRole('button', { name: 'Load older messages' });
    vi.useFakeTimers();
    fireEvent.click(loadOlder);

    await act(async () => { await vi.advanceTimersByTimeAsync(5_100); });
    expect(olderSignal?.aborted).toBe(false);
    expect(screen.getByText('Compare them below.')).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(olderSignal?.aborted).toBe(true);
    expect(screen.getByText('Older messages could not be loaded. Your current conversation is unchanged.')).toBeTruthy();
    expect(screen.getByText('Compare them below.')).toBeTruthy();
    expect(historyReads).toBe(1);
  });

  it('retains the five-second deadline for a hung workspace read', async () => {
    vi.useFakeTimers();
    let historySignal: AbortSignal | null | undefined;
    let workspaceSignal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historySignal = init?.signal;
        return abortable(new Promise<Response>(() => undefined), historySignal);
      }
      if (url === '/api/agent/workspace') {
        workspaceSignal = init?.signal;
        return abortable(new Promise<Response>(() => undefined), workspaceSignal);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_900); });
    expect(workspaceSignal?.aborted).toBe(false);

    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(workspaceSignal?.aborted).toBe(true);
    expect(historySignal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: 'Your Map' }));
    expect(screen.getByText('Your map could not be loaded.')).toBeTruthy();
  });

  it('replaces Stop with a truthful finishing state during terminal refresh', async () => {
    const terminalHistory = deferred<Response>();
    let historyReads = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        return historyReads === 1
          ? Promise.resolve(jsonResponse({ status: 'empty', messages: [] }))
          : terminalHistory.promise;
      }
      if (url === '/api/agent/workspace') {
        return Promise.resolve(jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') }));
      }
      if (url === '/api/agent') {
        return Promise.resolve(streamResponse([
          { type: 'text-start', id: 'assistant-live' },
          { type: 'text-delta', id: 'assistant-live', delta: 'Reply complete.' },
          { type: 'text-end', id: 'assistant-live' },
          { type: 'finish', finishReason: 'stop' },
        ]));
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Complete this turn.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('button', { name: 'Finishing up' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();

    await act(async () => {
      terminalHistory.resolve(jsonResponse({ status: 'ready', messages: historyMessages() }));
      await terminalHistory.promise;
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Finishing up' })).toBeNull());
  });

  it('reconciles a multi-item live reply against the matching history sequence without duplication', async () => {
    let historyReads = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        return Promise.resolve(historyReads === 1
          ? jsonResponse({ status: 'empty', messages: [] })
          : jsonResponse({ status: 'ready', messages: [
              {
                id: 'assistant-step-1', role: 'assistant',
                turn: { turnId: 'turn-multi', status: 'completed' },
                parts: [{ type: 'text', text: 'First part. ' }],
              },
              {
                id: 'assistant-step-2', role: 'assistant', isFinalAssistantItem: true,
                turn: { turnId: 'turn-multi', status: 'completed' },
                parts: [{ type: 'text', text: 'Second part.' }],
              },
            ] }));
      }
      if (url === '/api/agent/workspace') {
        return Promise.resolve(jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') }));
      }
      if (url === '/api/agent') {
        return Promise.resolve(streamResponse([
          { type: 'text-start', id: 'assistant-step-1' },
          { type: 'text-delta', id: 'assistant-step-1', delta: 'First part. ' },
          { type: 'text-end', id: 'assistant-step-1' },
          { type: 'text-start', id: 'assistant-step-2' },
          { type: 'text-delta', id: 'assistant-step-2', delta: 'Second part.' },
          { type: 'text-end', id: 'assistant-step-2' },
          { type: 'finish', finishReason: 'stop' },
        ]));
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Give me a multi-step reply.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(historyReads).toBe(2));
    await waitFor(() => expect(screen.queryByText('First part. Second part.')).toBeNull());
    expect(screen.getByText('First part.')).toBeTruthy();
    expect(screen.getByText('Second part.')).toBeTruthy();
  });

  it('disables conversation retry while a turn is active and finishing', async () => {
    const terminalHistory = deferred<Response>();
    let historyReads = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        return historyReads === 1
          ? Promise.reject(new Error('initial history unavailable'))
          : terminalHistory.promise;
      }
      if (url === '/api/agent/workspace') {
        return Promise.resolve(jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') }));
      }
      if (url === '/api/agent') {
        return Promise.resolve(streamResponse([
          { type: 'text-start', id: 'assistant-live' },
          { type: 'text-delta', id: 'assistant-live', delta: 'Reply complete.' },
          { type: 'text-end', id: 'assistant-live' },
          { type: 'finish', finishReason: 'stop' },
        ]));
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Continue despite the failed history.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const retrying = await screen.findByRole('button', { name: 'Trying again…' });
    expect((retrying as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(retrying);
    expect(historyReads).toBe(2);

    await act(async () => {
      terminalHistory.resolve(jsonResponse({ status: 'ready', messages: historyMessages() }));
      await terminalHistory.promise;
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Finishing up' })).toBeNull());
  });

  it('does not start terminal reads after an active turn is unmounted', async () => {
    let historyReads = 0;
    let workspaceReads = 0;
    let markAgentSettled!: () => void;
    const agentSettled = new Promise<void>((resolve) => { markAgentSettled = resolve; });
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        return Promise.resolve(jsonResponse({ status: 'empty', messages: [] }));
      }
      if (url === '/api/agent/workspace') {
        workspaceReads += 1;
        return Promise.resolve(jsonResponse({ status: 'ready', map: createCareerMap('explorer-1') }));
      }
      if (url === '/api/agent') {
        return abortable(new Promise<Response>(() => undefined), init?.signal)
          .finally(markAgentSettled);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const view = render(<Explore {...props()} />);
    const textbox = await screen.findByRole('textbox', { name: 'Message Revelio' });
    fireEvent.change(textbox, { target: { value: 'Leave during this turn.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('button', { name: 'Stop' });

    view.unmount();
    await agentSettled;
    await act(async () => { await Promise.resolve(); });

    expect(historyReads).toBe(1);
    expect(workspaceReads).toBe(1);
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

  it('restores committed follow-up recovery after remount without reopening Start or blocking Chat', async () => {
    const original = suggestedPathsMap();
    const selected = applyCareerMapOperation(original, {
      type: 'select-purpose-path', sourceId: 'selection-operation', expectedRevision: original.revision,
      occurredAt: '2030-01-01T00:00:03.000Z', payload: {
        setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1,
        action: { kind: 'ui-action', actionId: 'selection-action', turnId: 'selection-turn', turnSequence: 4, occurredAt: '2030-01-01T00:00:03.000Z' },
      },
    });
    expect(selected.status).toBe('committed');
    if (selected.status !== 'committed') return;
    let continued = false;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/agent/history') return jsonResponse({ status: 'ready', messages: historyMessages() });
      if (url === '/api/agent/workspace') return jsonResponse({ status: 'ready', map: selected.map,
        ...(!continued ? { recovery: { kind: 'committed-follow-up-failed', turnId: 'selection-turn', revision: selected.map.revision } } : {}),
      });
      if (url === '/api/agent') { continued = true; return streamResponse([{ type: 'finish', finishReason: 'stop' }]); }
      throw new Error(`Unexpected request: ${url}`);
    });
    const first = render(<Explore {...props()} />);
    expect(await screen.findByText('Your map was updated, but Revelio’s follow-up reply did not finish.')).toBeTruthy();
    first.unmount();
    render(<Explore {...props()} />);
    expect(await screen.findByText('Your map was updated, but Revelio’s follow-up reply did not finish.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start path/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue in Chat' }));
    const textbox = screen.getByRole('textbox', { name: 'Message Revelio' });
    await waitFor(() => expect(document.activeElement).toBe(textbox));
    fireEvent.change(textbox, { target: { value: 'Help me design a first project for this path.' } });
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(continued).toBe(true));
    await waitFor(() => expect(screen.queryByText('Your map was updated, but Revelio’s follow-up reply did not finish.')).toBeNull());
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
    const refreshHistory = deferred<Response>();
    const refreshWorkspace = deferred<Response>();
    let historyReads = 0;
    let workspaceReads = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/agent/history') {
        historyReads += 1;
        if (historyReads === 1) return Promise.resolve(jsonResponse({ status: 'ready', messages: historyMessages() }));
        if (historyReads === 2) return Promise.reject(new Error('history unavailable'));
        return refreshHistory.promise;
      }
      if (url === '/api/agent/workspace') {
        workspaceReads += 1;
        if (workspaceReads === 1) return Promise.resolve(jsonResponse({ status: 'ready', map: suggestedPathsMap() }));
        if (workspaceReads === 2) return Promise.reject(new Error('workspace unavailable'));
        return refreshWorkspace.promise;
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
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    const refreshing = await screen.findByRole('button', { name: 'Refreshing…' });
    expect((refreshing as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(refreshing);
    expect(historyReads).toBe(3);
    expect(workspaceReads).toBe(3);

    await act(async () => {
      refreshHistory.resolve(jsonResponse({ status: 'ready', messages: historyMessages() }));
      refreshWorkspace.resolve(jsonResponse({ status: 'ready', map: suggestedPathsMap() }));
      await Promise.all([refreshHistory.promise, refreshWorkspace.promise]);
    });
    await waitFor(() => expect(screen.queryByText('Revelio could not confirm whether your map was updated. Refresh before trying again.')).toBeNull());
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

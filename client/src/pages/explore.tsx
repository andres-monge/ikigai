import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, Mic, Square } from 'lucide-react';
import {
  conversationHistoryPageSchema,
  methodOperationEnvelopeSchema,
  methodWorkspaceResponseSchema,
  type OperationStatusData,
} from '@shared/streaming-schemas';
import type { CareerMap } from '@shared/career-map';
import { useSpeechToText } from '@/hooks/use-speech-to-text';
import {
  consumeAgentStreamLine,
  failUnresolvedOperationAttempts,
  reduceOperationAttempts,
  terminalStatusForEnvelope,
  type AgentStreamState,
  type NormalizedHistoryMessage,
  type OperationAttempts,
} from '@/components/explore/explore-state';
import { SafeMessage } from '@/components/explore/safe-message';
import { MethodMap, type DeterministicOperationRequest } from '@/components/explore/method-map';
import { OperationStatusList } from '@/components/explore/operation-status';

type LoadState = 'loading' | 'empty' | 'ready' | 'error';
type WorkspaceLoadState = LoadState | 'repair-required';
type Panel = 'chat' | 'map';

interface ExploreProps {
  userEmail: string;
  isSigningOut: boolean;
  signOutError: string | null;
  onSignOut: () => void;
}

const requestHeaders = {
  'Content-Type': 'application/json',
  'X-Revelio-Request': '1',
};

function newOpaqueId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function dedupeMessages(messages: readonly NormalizedHistoryMessage[]): NormalizedHistoryMessage[] {
  const order = [...new Set(messages.map((message) => message.id))];
  const latest = new Map(messages.map((message) => [message.id, message]));
  return order.map((id) => latest.get(id)!);
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isPinnedToBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 96;
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export function Explore({ userEmail, isSigningOut, signOutError, onSignOut }: ExploreProps) {
  const [historyState, setHistoryState] = useState<LoadState>('loading');
  const [workspaceState, setWorkspaceState] = useState<WorkspaceLoadState>('loading');
  const [messages, setMessages] = useState<NormalizedHistoryMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | undefined>();
  const [map, setMap] = useState<CareerMap | null>(null);
  const [draft, setDraft] = useState('');
  const [submittedDraft, setSubmittedDraft] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState('');
  const [attempts, setAttempts] = useState<OperationAttempts>({});
  const [turnBusy, setTurnBusy] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [turnNotice, setTurnNotice] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<Panel>('chat');
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const readControllersRef = useRef(new Set<AbortController>());
  const mountedRef = useRef(true);
  const refreshGenerationRef = useRef(0);
  const loadedOlderHistoryRef = useRef(false);
  const loadedOlderMessageIdsRef = useRef(new Set<string>());
  const focusFramesRef = useRef(new Set<number>());
  const draftValueRef = useRef('');
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottomRef = useRef(true);
  const settledTranscriptRef = useRef(false);
  const renderedMessageCountRef = useRef(0);
  const mapHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const tabRefs = useRef<Record<Panel, HTMLButtonElement | null>>({ chat: null, map: null });
  const streamStateRef = useRef<AgentStreamState>({ text: '', citations: [], attempts: {}, providerFailed: false });
  const bootstrapPending = historyState === 'loading' || workspaceState === 'loading';

  const scheduleFocus = useCallback((target: () => HTMLElement | null) => {
    const frame = requestAnimationFrame(() => {
      focusFramesRef.current.delete(frame);
      if (mountedRef.current) target()?.focus();
    });
    focusFramesRef.current.add(frame);
  }, []);

  const withReadTimeout = useCallback(async <T,>(
    load: (signal: AbortSignal) => Promise<T>,
    timeoutMs = 5_000,
  ): Promise<T> => {
    const controller = new AbortController();
    readControllersRef.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await load(controller.signal);
    } finally {
      window.clearTimeout(timeout);
      readControllersRef.current.delete(controller);
    }
  }, []);

  const loadHistory = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/agent/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) throw new Error('HistoryUnavailable');
    return conversationHistoryPageSchema.parse(await parseJson(response));
  }, []);

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/agent/workspace', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    });
    const parsed = methodWorkspaceResponseSchema.safeParse(await parseJson(response));
    if (parsed.success && parsed.data.status === 'repair-required') return parsed.data;
    if (!response.ok || !parsed.success) throw new Error('WorkspaceUnavailable');
    return parsed.data;
  }, []);

  const refreshNewest = useCallback(async (focusMap = false) => {
    const generation = ++refreshGenerationRef.current;
    const [historyResult, workspaceResult] = await Promise.allSettled([
      withReadTimeout((signal) => loadHistory(undefined, signal)),
      withReadTimeout((signal) => loadWorkspace(signal)),
    ]);
    if (!mountedRef.current || generation !== refreshGenerationRef.current) {
      return { historyLoaded: false, workspaceLoaded: false };
    }
    if (historyResult.status === 'fulfilled') {
      setMessages((current) => dedupeMessages([
        ...current.filter((message) => loadedOlderMessageIdsRef.current.has(message.id)),
        ...historyResult.value.messages,
      ]));
      if (!loadedOlderHistoryRef.current) setOlderCursor(historyResult.value.olderCursor);
      setHistoryState(historyResult.value.status);
      streamStateRef.current = { ...streamStateRef.current, text: '', citations: [] };
      setStreamedText('');
    } else {
      setHistoryState('error');
    }
    if (workspaceResult.status === 'fulfilled') {
      if (workspaceResult.value.status === 'ready') {
        setMap(workspaceResult.value.map);
        setWorkspaceState('ready');
      } else if (workspaceResult.value.status === 'repair-required') {
        setMap(null);
        setWorkspaceState('repair-required');
      } else {
        setMap(null);
        setWorkspaceState('empty');
      }
    } else {
      setWorkspaceState('error');
    }
    if (
      focusMap
      && workspaceResult.status === 'fulfilled'
      && document.activeElement !== draftRef.current
      && !draftValueRef.current.trim()
    ) {
      scheduleFocus(() => mapHeadingRef.current);
    }
    return {
      historyLoaded: historyResult.status === 'fulfilled',
      workspaceLoaded: workspaceResult.status === 'fulfilled',
    };
  }, [loadHistory, loadWorkspace, scheduleFocus, withReadTimeout]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshNewest();
    return () => {
      mountedRef.current = false;
      refreshGenerationRef.current += 1;
      abortRef.current?.abort();
      for (const controller of readControllersRef.current) controller.abort();
      for (const frame of focusFramesRef.current) cancelAnimationFrame(frame);
      focusFramesRef.current.clear();
    };
  }, [refreshNewest]);


  useLayoutEffect(() => {
    const field = draftRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 176)}px`;
  }, [draft]);

  const speech = useSpeechToText({
    language: 'en',
    endpoint: '/api/agent/audio/transcribe',
    onTranscription: (_id, text) => {
      setDraft((current) => {
        const next = `${current}${current.trim() ? ' ' : ''}${text}`;
        draftValueRef.current = next;
        return next;
      });
      setMicNotice('Transcription added to your draft.');
      scheduleFocus(() => draftRef.current);
    },
    onEmptyTranscription: () => setMicNotice('No speech was detected. Your draft was not changed.'),
    onError: (message) => setMicNotice(message),
  });

  async function loadOlder() {
    if (!olderCursor || olderBusy) return;
    setOlderBusy(true);
    setTurnNotice(null);
    try {
      const page = await withReadTimeout((signal) => loadHistory(olderCursor, signal));
      if (!mountedRef.current) return;
      loadedOlderHistoryRef.current = true;
      for (const message of page.messages) loadedOlderMessageIdsRef.current.add(message.id);
      setMessages((current) => dedupeMessages([...page.messages, ...current]));
      setOlderCursor(page.olderCursor);
    } catch {
      if (mountedRef.current) setTurnNotice('Older messages could not be loaded. Your current conversation is unchanged.');
    } finally {
      if (mountedRef.current) setOlderBusy(false);
    }
  }

  function absorbStreamState(next: AgentStreamState) {
    if (!mountedRef.current) return;
    streamStateRef.current = next;
    setStreamedText(next.text);
    setAttempts(next.attempts);
  }

  function failUnresolvedAttempts(existingKeys: ReadonlySet<string>) {
    const next = failUnresolvedOperationAttempts(streamStateRef.current.attempts, existingKeys);
    absorbStreamState({ ...streamStateRef.current, attempts: next });
  }

  async function consumeStream(response: Response, existingKeys: ReadonlySet<string>) {
    if (!response.body) throw new Error('MissingStream');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) absorbStreamState(consumeAgentStreamLine(streamStateRef.current, line.trimEnd()));
      if (done) break;
    }
    if (buffer) absorbStreamState(consumeAgentStreamLine(streamStateRef.current, buffer.trimEnd()));
    failUnresolvedAttempts(existingKeys);
  }

  async function submitMessage() {
    const message = draft.trim();
    if (!message || turnBusy || bootstrapPending) return;
    const messageId = newOpaqueId('message');
    const existingAttemptKeys = new Set(Object.keys(attempts));
    const controller = new AbortController();
    abortRef.current = controller;
    pinnedToBottomRef.current = true;
    setTurnBusy(true);
    setTurnNotice(null);
    setSubmittedDraft(message);
    setDraft('');
    draftValueRef.current = '';
    setStreamedText('');
    streamStateRef.current = { text: '', citations: [], attempts, providerFailed: false };
    setMessages((current) => [...current, {
      id: messageId,
      role: 'user',
      parts: [{ type: 'text', text: message }],
    }]);
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        credentials: 'include',
        headers: requestHeaders,
        body: JSON.stringify({ id: messageId, message }),
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const body = await parseJson(response) as Record<string, unknown> | null;
        const status = body?.status;
        if (status === 'completed-replay') setTurnNotice('This message was already completed. Showing the saved result.');
        else if (status === 'in-flight') setTurnNotice('This message is already in progress. Refreshing its latest state.');
        else if (status === 'cancelled-replay') setTurnNotice('This message was already stopped.');
        else setTurnNotice('Revelio could not complete that reply. Your map may still contain an earlier saved change.');
      } else if (!response.ok) {
        throw new Error('AgentRequestFailed');
      } else {
        await consumeStream(response, existingAttemptKeys);
        if (!mountedRef.current) return;
        const saved = Object.entries(streamStateRef.current.attempts).some(([key, attempt]) => (
          !existingAttemptKeys.has(key) && attempt.status === 'Saved'
        ));
        if (streamStateRef.current.providerFailed) {
          const restored = !draftValueRef.current.trim();
          if (restored) {
            draftValueRef.current = message;
            setDraft(message);
          }
          setTurnNotice(saved
            ? 'Your map was saved, but Revelio’s follow-up reply failed. The saved state is preserved.'
            : restored
              ? 'Revelio’s reply failed. Nothing new was saved. Your submitted message is available to edit.'
              : 'Revelio’s reply failed. Nothing new was saved. Your current draft is unchanged.');
        }
      }
    } catch (error) {
      if (!mountedRef.current) return;
      failUnresolvedAttempts(existingAttemptKeys);
      const restored = !draftValueRef.current.trim();
      if (restored) {
        draftValueRef.current = message;
        setDraft(message);
      }
      if (controller.signal.aborted) {
        const saved = Object.entries(streamStateRef.current.attempts).some(([key, attempt]) => (
          !existingAttemptKeys.has(key) && attempt.status === 'Saved'
        ));
        setTurnNotice(saved
          ? 'Stopped after a saved change. The map remains authoritative.'
          : restored ? 'Stopped. Your submitted message has been restored.' : 'Stopped. Your current draft is unchanged.');
      } else {
        setTurnNotice(restored
          ? 'Revelio is temporarily unavailable. Your submitted message has been restored.'
          : 'Revelio is temporarily unavailable. Your current draft is unchanged.');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      await refreshNewest();
      if (mountedRef.current) {
        setTurnBusy(false);
        setSubmittedDraft(null);
        scheduleFocus(() => draftRef.current);
      }
    }
  }

  async function runOperation(operation: DeterministicOperationRequest) {
    if (!map || turnBusy) return;
    const sourceMessageId = typeof operation.input.sourceMessageId === 'string'
      ? operation.input.sourceMessageId
      : newOpaqueId('workspace-message');
    const operationId = newOpaqueId('workspace-operation');
    const controller = new AbortController();
    const saving: OperationStatusData = {
      version: 1,
      turnId: sourceMessageId,
      messageId: sourceMessageId,
      operationId,
      operation: operation.type,
      authoritativeRevision: null,
      status: 'Saving',
      sequence: 0,
    };
    setTurnBusy(true);
    abortRef.current = controller;
    setTurnNotice(null);
    setAttempts((current) => reduceOperationAttempts(current, saving));
    try {
      const response = await fetch('/api/agent/workspace/operations', {
        method: 'POST',
        credentials: 'include',
        headers: requestHeaders,
        body: JSON.stringify({
          operationId,
          clientMessageId: sourceMessageId,
          expectedRevision: map.revision,
          operation,
        }),
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      const responseBody = await parseJson(response);
      const envelope = methodOperationEnvelopeSchema.safeParse(responseBody);
      const responseMarker = responseBody && typeof responseBody === 'object'
        ? responseBody as Record<string, unknown>
        : null;
      if (!envelope.success && response.ok && responseMarker?.terminal !== 'failed') {
        throw new Error('WorkspaceOperationEnvelopeInvalid');
      }
      const terminal: OperationStatusData = envelope.success
        ? {
            ...saving,
            status: terminalStatusForEnvelope(envelope.data.status),
            sequence: 1,
            authoritativeRevision: envelope.data.authoritativeRevision,
            ...(envelope.data.errorClass ? { errorClass: envelope.data.errorClass } : {}),
            ...(envelope.data.retryable ? { retryable: true } : {}),
          }
        : {
            ...saving,
            status: responseMarker?.terminal === 'failed'
              ? 'Failed'
              : response.status === 409
                ? 'Conflict'
                : 'Failed',
            sequence: 1,
            authoritativeRevision: map.revision,
            errorClass: 'WorkspaceOperationError',
          };
      setAttempts((current) => reduceOperationAttempts(current, terminal));
      if (terminal.status === 'Conflict') setTurnNotice('Your map changed elsewhere. The latest version is being loaded; your chat draft is unchanged.');
      if (terminal.status === 'Rejected') setTurnNotice('That action no longer fits the current Method state. The latest map is being loaded.');
      if (terminal.status === 'Failed') setTurnNotice('That action failed before a save. Your chat draft is unchanged.');
    } catch {
      const authoritative = await withReadTimeout((signal) => loadWorkspace(signal), 2_000).catch(() => undefined);
      if (!mountedRef.current) return;
      const receipt = authoritative?.status === 'ready'
        ? authoritative.map.operationHistory.find((item) => item.sourceId === operationId)
        : undefined;
      const status: 'Saved' | 'Failed' = receipt ? 'Saved' : 'Failed';
      setAttempts((current) => reduceOperationAttempts(current, {
        ...saving,
        status,
        sequence: 1,
        authoritativeRevision: receipt?.resultRevision ?? map.revision,
        ...(status === 'Failed' ? { errorClass: 'WorkspaceOperationError' } : {}),
      }));
      if (receipt) {
        setTurnNotice(controller.signal.aborted
          ? 'Stopped after this change was saved. The map remains authoritative.'
          : 'The connection ended after this change was saved. The map remains authoritative.');
      } else {
        setTurnNotice(controller.signal.aborted
          ? 'Stopped before this action was confirmed saved. Your chat draft is unchanged.'
          : 'That action was not confirmed saved. The latest map is being loaded before you retry.');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      await refreshNewest(true);
      if (mountedRef.current) setTurnBusy(false);
    }
  }

  const goToConversation = useCallback(() => {
    setActivePanel('chat');
    scheduleFocus(() => draftRef.current);
  }, [scheduleFocus]);

  function prepareConversation(prompt: string) {
    setDraft((current) => {
      const next = current.trim() ? `${current}\n\n${prompt}` : prompt;
      draftValueRef.current = next;
      return next;
    });
    setActivePanel('chat');
    scheduleFocus(() => draftRef.current);
  }

  const displayedMessages = streamedText
    ? [...messages, {
        id: 'streaming-assistant',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: streamedText }],
        citations: streamStateRef.current.citations,
      }]
    : messages;

  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || activePanel !== 'chat' || historyState === 'loading') return;
    const grew = displayedMessages.length > renderedMessageCountRef.current;
    const settled = settledTranscriptRef.current;
    renderedMessageCountRef.current = displayedMessages.length;
    settledTranscriptRef.current = true;
    // Never pull the explorer away from older history they scrolled back to read.
    if (!pinnedToBottomRef.current) return;
    const animate = settled && grew && !streamedText && !prefersReducedMotion();
    if (typeof transcript.scrollTo === 'function') {
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: animate ? 'smooth' : 'auto' });
    } else {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [displayedMessages.length, streamedText, activePanel, historyState]);

  const isFirstRun = displayedMessages.length === 0;
  const mapHasContent = Boolean(map && map.revision > 0);
  const micLabel = !speech.isSupported
    ? 'Microphone unavailable'
    : speech.recordingState === 'recording'
      ? 'Stop recording'
      : speech.recordingState === 'processing'
        ? 'Transcribing your recording'
        : 'Record a message';

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-ikigai-beige text-stone-900">
      <header className="shrink-0 border-b-2 border-black bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[112rem] items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-black leading-none tracking-tight sm:text-2xl">Revelio</h1>
            <p className="mt-1 truncate font-display text-[0.65rem] font-bold uppercase tracking-[0.12em] text-stone-600 sm:text-xs">Figure out what to work on next</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-stone-600 sm:inline">{userEmail}</span>
            <button type="button" onClick={onSignOut} disabled={isSigningOut} className="min-h-11 border-2 border-black bg-white px-3 font-display text-xs font-black shadow-[2px_2px_0_rgba(0,0,0,0.65)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50">
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>
      {signOutError ? <p role="alert" className="mx-auto w-full max-w-[112rem] shrink-0 px-4 pt-3 text-sm font-bold text-red-800">{signOutError}</p> : null}

      <div className="shrink-0 border-b-2 border-black bg-white">
        <div className="mx-auto max-w-[112rem] sm:px-6 sm:py-3">
          <div role="tablist" aria-label="Workspace views" className="grid grid-cols-2 sm:inline-grid sm:grid-cols-[auto_auto] sm:border-2 sm:border-black sm:shadow-[3px_3px_0_rgba(0,0,0,0.65)]">
            {(['chat', 'map'] as const).map((panel) => (
              <button
                key={panel}
                id={`${panel}-tab`}
                ref={(node) => { tabRefs.current[panel] = node; }}
                type="button"
                role="tab"
                aria-selected={activePanel === panel}
                aria-controls={`${panel}-panel`}
                tabIndex={activePanel === panel ? 0 : -1}
                className={`min-h-12 border-r-2 border-black px-4 font-display text-sm font-black transition-colors last:border-r-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-black sm:min-h-10 sm:px-8 ${activePanel === panel ? 'bg-ikigai-yellow' : 'bg-white hover:bg-ikigai-beige'}`}
                onClick={() => setActivePanel(panel)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next: Panel = event.key === 'ArrowLeft' || event.key === 'Home' ? 'chat' : 'map';
                  setActivePanel(next);
                  requestAnimationFrame(() => tabRefs.current[next]?.focus());
                }}
              >
                {panel === 'chat' ? 'Chat' : 'Your Map'}
                {panel === 'map' && mapHasContent && activePanel !== 'map' ? (
                  <span aria-hidden="true" className="ml-2 inline-block h-2 w-2 border border-black bg-ikigai-teal align-middle" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full min-h-0 max-w-[112rem] flex-1 flex-col">
        <section id="chat-panel" role="tabpanel" aria-labelledby="chat-tab" className={`${activePanel === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col bg-ikigai-beige`}>
          <div
            ref={transcriptRef}
            onScroll={(event) => { pinnedToBottomRef.current = isPinnedToBottom(event.currentTarget); }}
            className="chat-scroll-fade min-h-0 flex-1 overflow-y-auto px-4 pt-6 sm:px-6"
            aria-live="polite"
          >
            <div className="mx-auto w-full max-w-[38rem] space-y-6 pb-10">
              {historyState === 'loading' ? <p role="status" className="text-sm text-stone-600">Loading your conversation…</p> : null}
              {historyState === 'error' ? (
                <div role="alert" className="border-2 border-red-800 bg-red-50 p-4 text-sm">
                  <p className="font-bold">Your conversation could not be loaded.</p>
                  <button type="button" className="mt-3 min-h-11 font-bold underline" onClick={() => void refreshNewest()}>Try again</button>
                </div>
              ) : null}
              {historyState === 'empty' && displayedMessages.length === 0 ? (
                <article aria-label="Revelio" className="max-w-none">
                  <p className="text-[1.0625rem] font-medium leading-7">
                    Hey! I’m here to help you figure out what to work on next, so I’ll ask a few questions to get
                    to know you first.
                  </p>
                  <p className="mt-4 text-[1.0625rem] font-medium leading-7">
                    What activities pull you in so much that you lose track of time?
                  </p>
                </article>
              ) : null}
              {olderCursor ? (
                <button type="button" disabled={olderBusy} className="mx-auto block min-h-11 px-3 text-sm font-bold underline" onClick={() => void loadOlder()}>
                  {olderBusy ? 'Loading…' : 'Load older messages'}
                </button>
              ) : null}
              {displayedMessages.map((message) => <SafeMessage key={message.id} message={message} />)}
            </div>
          </div>
          <div className="shrink-0 px-4 pb-4 pt-2 sm:px-6">
            <div className="mx-auto w-full max-w-[38rem] space-y-3">
              <OperationStatusList attempts={attempts} />
              {turnNotice ? <p role="status" aria-live="polite" className="text-xs font-bold text-stone-700">{turnNotice}</p> : null}
              {micNotice ? <p role="status" aria-live="polite" className="text-xs text-stone-600">{micNotice}</p> : null}
              <label htmlFor="revelio-draft" className="sr-only">Message Revelio</label>
              <div className="flex items-end gap-1 border-2 border-black bg-white p-2 shadow-[3px_3px_0_rgba(0,0,0,0.65)] transition-[border-color,box-shadow] focus-within:border-ikigai-teal">
                <textarea
                  id="revelio-draft"
                  ref={draftRef}
                  rows={1}
                  value={draft}
                  disabled={false}
                  onChange={(event) => {
                    draftValueRef.current = event.target.value;
                    setDraft(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void submitMessage();
                    }
                  }}
                  placeholder={isFirstRun ? 'Write your answer…' : 'Reply, ask, or push back'}
                  className="min-h-11 max-h-44 flex-1 resize-none self-center border-0 bg-transparent px-2 py-2 text-[1.0625rem] font-medium leading-7 outline-none placeholder:font-normal placeholder:text-stone-500"
                />
                <button
                  type="button"
                  disabled={!speech.isSupported || speech.recordingState === 'processing' || turnBusy || bootstrapPending}
                  aria-pressed={speech.recordingState === 'recording'}
                  aria-label={micLabel}
                  title={micLabel}
                  onClick={() => speech.recordingState === 'recording' ? speech.stopRecording() : void speech.startRecording('revelio-draft')}
                  className={`grid h-11 w-11 shrink-0 place-items-center border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-40 ${speech.recordingState === 'recording' ? 'border-black bg-ikigai-pink text-white' : 'border-transparent text-stone-700 hover:border-black hover:bg-ikigai-beige'}`}
                >
                  {speech.recordingState === 'processing'
                    ? <Loader2 aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin" />
                    : speech.recordingState === 'recording'
                      ? <Square aria-hidden="true" className="h-4 w-4 fill-current" />
                      : <Mic aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />}
                </button>
                {turnBusy ? (
                  <button
                    type="button"
                    aria-label="Stop"
                    title="Stop"
                    onClick={() => abortRef.current?.abort()}
                    className="grid h-11 w-11 shrink-0 place-items-center border-2 border-black bg-white text-black shadow-[2px_2px_0_rgba(0,0,0,0.65)] transition-[transform,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                  >
                    <Square aria-hidden="true" className="h-4 w-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!draft.trim() || bootstrapPending}
                    aria-label="Send"
                    title="Send"
                    aria-describedby={bootstrapPending ? 'composer-loading-reason' : undefined}
                    onClick={() => void submitMessage()}
                    className="grid h-11 w-11 shrink-0 place-items-center border-2 border-black bg-ikigai-teal text-black shadow-[2px_2px_0_rgba(0,0,0,0.65)] transition-[transform,box-shadow,opacity] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    <ArrowUp aria-hidden="true" className="h-5 w-5" strokeWidth={3} />
                  </button>
                )}
              </div>
              {bootstrapPending ? <span id="composer-loading-reason" className="sr-only">Send and microphone controls are available after the initial workspace load.</span> : null}
              {submittedDraft ? <span className="sr-only">Sending: {submittedDraft}</span> : null}
            </div>
          </div>
        </section>

        <section id="map-panel" role="tabpanel" aria-labelledby="map-tab" className={`${activePanel === 'map' ? 'block' : 'hidden'} min-h-0 min-w-0 flex-1 overflow-y-auto bg-ikigai-beige p-4 sm:p-6 lg:p-8`}>
          <div className="mx-auto w-full max-w-6xl">
            <h2 id="map-heading" ref={mapHeadingRef} tabIndex={-1} className="sr-only">Your Map</h2>
            {workspaceState === 'loading' ? <p role="status" className="text-sm text-stone-600">Loading your map…</p> : null}
            {workspaceState === 'error' ? (
              <div role="alert" className="border-2 border-red-800 bg-red-50 p-5">
                <p className="font-bold">Your map could not be loaded.</p>
                <button type="button" className="mt-3 min-h-11 font-bold underline" onClick={() => void refreshNewest()}>Try again</button>
              </div>
            ) : null}
            {workspaceState === 'repair-required' ? (
              <div role="alert" className="border-2 border-red-900 bg-red-50 p-5">
                <h3 className="text-xl font-black">Your map needs repair</h3>
                <p className="mt-2 text-sm leading-6">Revelio has stopped Method actions to protect your saved work. Please contact support before continuing.</p>
              </div>
            ) : null}
            {(workspaceState === 'ready' || workspaceState === 'empty') && map ? (
              <MethodMap
                map={map}
                busy={turnBusy}
                onOperation={(operation) => void runOperation(operation)}
                onConversationPrompt={prepareConversation}
                onGoToConversation={goToConversation}
              />
            ) : null}
            {workspaceState === 'empty' && !map ? (
              <div className="max-w-2xl border-2 border-dashed border-black bg-white/70 p-6 sm:p-8">
                <h3 className="font-display text-2xl font-black">Nothing on your map yet</h3>
                <p className="mt-3 text-sm leading-6 text-stone-700">
                  This is the record of what you and Revelio work out together: what pulls you in, why it matters
                  to you, the directions worth trying, and the project you take on first. Nothing lands here until
                  you’ve confirmed it, so you can change your mind in the chat at any point.
                </p>
                <button
                  type="button"
                  onClick={goToConversation}
                  className="mt-6 min-h-11 border-2 border-black bg-ikigai-teal px-4 font-display text-sm font-black shadow-[3px_3px_0_rgba(0,0,0,0.65)] transition-[transform,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Start in the chat
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

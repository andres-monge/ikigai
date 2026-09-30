import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Loader2, Mic, Square, X } from 'lucide-react';
import {
  conversationHistoryPageSchema,
  methodOperationEnvelopeSchema,
  methodWorkspaceResponseSchema,
  type OperationStatusData,
} from '@shared/streaming-schemas';
import { deriveMethodCheckpoint, type CareerMap, type CareerMapOperationType } from '@shared/career-map';
import { METHOD_SPEECH_TO_TEXT_POLICY, useSpeechToText } from '@/hooks/use-speech-to-text';
import {
  consumeAgentStreamLine,
  type AgentStreamState,
  type NormalizedHistoryMessage,
} from '@/components/explore/explore-state';
import { SafeMessage } from '@/components/explore/safe-message';
import { MethodMap } from '@/components/explore/method-map';
import { PurposePathCard } from '@/components/explore/purpose-path-card';
import { ActivityIndicator } from '@/components/explore/activity-indicator';
import { createClientLatencyTrace, type ClientLatencyTrace } from './explore-latency';

type LoadState = 'loading' | 'empty' | 'ready' | 'error';
type WorkspaceLoadState = LoadState | 'repair-required';
type Panel = 'chat' | 'map';
type TurnPhase = 'idle' | 'active' | 'finishing';
type DirectOperationType = 'select-purpose-path' | 'confirm-purpose-path-revision';

interface DeterministicOperationRequest {
  type: DirectOperationType;
  input: Record<string, unknown>;
}

interface PendingAttempt {
  operationId: string;
  turnId: string;
  messageId: string;
  operation: CareerMapOperationType;
  startedAt: number;
  terminal?: OperationStatusData['status'];
  cancelled?: boolean;
  directOperation?: DeterministicOperationRequest;
}

interface PersistenceError {
  kind: 'failed' | 'conflict' | 'reply-failed' | 'unknown';
  message: string;
  action: 'retry' | 'refresh' | 'continue';
  retryOperation?: DeterministicOperationRequest;
}

interface MicNotice {
  message: string;
  kind: 'status' | 'error';
}

const persistenceErrorPriority: Record<PersistenceError['kind'], number> = {
  failed: 1,
  conflict: 2,
  unknown: 3,
  'reply-failed': 4,
};

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
const HISTORY_READ_TIMEOUT_MS = 15_000;
const WORKSPACE_READ_TIMEOUT_MS = 5_000;

function newOpaqueId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function RefreshRetryButton({
  busy,
  disabled,
  onRetry,
}: {
  busy: boolean;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="mt-3 min-h-11 font-bold underline disabled:cursor-wait disabled:opacity-60"
      onClick={onRetry}
    >
      {busy ? 'Trying again…' : 'Try again'}
    </button>
  );
}

function dedupeMessages(messages: readonly NormalizedHistoryMessage[]): NormalizedHistoryMessage[] {
  const order = [...new Set(messages.map((message) => message.id))];
  const latest = new Map(messages.map((message) => [message.id, message]));
  return order.map((id) => latest.get(id)!);
}

export function attachPurposePathSets(
  messages: readonly NormalizedHistoryMessage[],
  pathSets: readonly CareerMap['pathSets'][number][],
): Map<string, CareerMap['pathSets'][number][]> {
  const attached = new Map<string, CareerMap['pathSets'][number][]>();
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.isFinalAssistantItem || !message.turn) continue;
    for (const set of pathSets) {
      const key = `${set.id}@${set.revision}`;
      if (seen.has(key) || set.presentation.assistantTurnId !== message.turn.turnId) continue;
      seen.add(key);
      attached.set(message.id, [...(attached.get(message.id) ?? []), set]);
    }
  }
  return attached;
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
  const [unresolvedOperationCount, setUnresolvedOperationCount] = useState(0);
  const [savingVisible, setSavingVisible] = useState(false);
  const [persistenceError, setPersistenceErrorState] = useState<PersistenceError | null>(null);
  const [unseenChatError, setUnseenChatError] = useState(false);
  const [terminalValidated, setTerminalValidated] = useState(false);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>('idle');
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [turnNotice, setTurnNotice] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<Panel>('chat');
  const [micNotice, setMicNotice] = useState<MicNotice | null>(null);
  const [incompleteTranscriptWarning, setIncompleteTranscriptWarning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const readControllersRef = useRef(new Set<AbortController>());
  const mountedRef = useRef(true);
  const refreshGenerationRef = useRef(0);
  const loadedOlderHistoryRef = useRef(false);
  const loadedOlderMessageIdsRef = useRef(new Set<string>());
  const focusFramesRef = useRef(new Set<number>());
  const draftValueRef = useRef('');
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const voicePrimaryRef = useRef<HTMLButtonElement | null>(null);
  const suppressVoiceFocusRef = useRef(false);
  const automaticCompletionReasonRef = useRef<ReturnType<typeof useSpeechToText>['automaticCompletionReason']>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottomRef = useRef(true);
  const settledTranscriptRef = useRef(false);
  const renderedMessageCountRef = useRef(0);
  const tabRefs = useRef<Record<Panel, HTMLButtonElement | null>>({ chat: null, map: null });
  const streamStateRef = useRef<AgentStreamState>({ text: '', citations: [], operationEvents: [], providerFailed: false });
  const latencyTraceRef = useRef<ClientLatencyTrace | undefined>(undefined);
  const processedOperationEventsRef = useRef(0);
  const pendingAttemptsRef = useRef(new Map<string, PendingAttempt>());
  const savingTimersRef = useRef(new Map<string, number>());
  const matureSavingAttemptsRef = useRef(new Set<string>());
  const activePanelRef = useRef<Panel>('chat');
  const turnBusy = turnPhase !== 'idle';
  const turnCanStop = turnPhase === 'active';
  const refreshDisabled = refreshBusy || turnBusy;
  const bootstrapPending = historyState === 'loading' || workspaceState === 'loading';

  useLayoutEffect(() => {
    if (streamedText) latencyTraceRef.current?.mark('first-render');
  }, [streamedText]);

  const setPersistenceError = useCallback((error: PersistenceError | null) => {
    setPersistenceErrorState(error);
    if (error && activePanelRef.current === 'map') setUnseenChatError(true);
  }, []);

  const syncUnresolvedState = useCallback(() => {
    setUnresolvedOperationCount(pendingAttemptsRef.current.size);
  }, []);

  const startAttempt = useCallback((attempt: PendingAttempt) => {
    if (pendingAttemptsRef.current.has(attempt.operationId)) return;
    pendingAttemptsRef.current.set(attempt.operationId, attempt);
    const timer = window.setTimeout(() => {
      savingTimersRef.current.delete(attempt.operationId);
      if (pendingAttemptsRef.current.has(attempt.operationId)) {
        matureSavingAttemptsRef.current.add(attempt.operationId);
        setSavingVisible(true);
      }
    }, 500);
    savingTimersRef.current.set(attempt.operationId, timer);
    syncUnresolvedState();
  }, [syncUnresolvedState]);

  const finishAttempt = useCallback((operationId: string) => {
    pendingAttemptsRef.current.delete(operationId);
    const timer = savingTimersRef.current.get(operationId);
    if (timer !== undefined) window.clearTimeout(timer);
    savingTimersRef.current.delete(operationId);
    matureSavingAttemptsRef.current.delete(operationId);
    setSavingVisible(matureSavingAttemptsRef.current.size > 0);
    syncUnresolvedState();
  }, [syncUnresolvedState]);

  const scheduleFocus = useCallback((target: () => HTMLElement | null) => {
    const frame = requestAnimationFrame(() => {
      focusFramesRef.current.delete(frame);
      if (mountedRef.current) target()?.focus();
    });
    focusFramesRef.current.add(frame);
  }, []);

  const withReadTimeout = useCallback(async <T,>(
    load: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
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

  const refreshNewest = useCallback(async () => {
    const generation = ++refreshGenerationRef.current;
    setRefreshBusy(true);
    const isCurrent = () => mountedRef.current && generation === refreshGenerationRef.current;
    const historyRead = withReadTimeout(
      (signal) => loadHistory(undefined, signal),
      HISTORY_READ_TIMEOUT_MS,
    ).then((value) => {
      if (isCurrent()) {
        setMessages((current) => dedupeMessages([
          ...current.filter((message) => loadedOlderMessageIdsRef.current.has(message.id)),
          ...value.messages,
        ]));
        if (!loadedOlderHistoryRef.current) setOlderCursor(value.olderCursor);
        setHistoryState(value.status);
        const liveText = streamStateRef.current.text;
        const authoritativeAssistantText = value.messages
          .filter((message) => message.role === 'assistant')
          .flatMap((message) => message.parts.flatMap((part) => part.type === 'text' ? [part.text] : []))
          .join('');
        const historyContainsLiveText = liveText.length > 0 && authoritativeAssistantText.endsWith(liveText);
        if (!liveText || historyContainsLiveText) {
          streamStateRef.current = { ...streamStateRef.current, text: '', citations: [] };
          setStreamedText('');
        }
      }
      return { status: 'fulfilled' as const, value };
    }, (reason: unknown) => {
      if (isCurrent()) setHistoryState('error');
      return { status: 'rejected' as const, reason };
    });
    const workspaceRead = withReadTimeout(
      (signal) => loadWorkspace(signal),
      WORKSPACE_READ_TIMEOUT_MS,
    ).then((value) => {
      if (isCurrent()) {
        if (value.status === 'ready') {
          setMap(value.map);
          setWorkspaceState('ready');
        } else if (value.status === 'repair-required') {
          setMap(null);
          setWorkspaceState('repair-required');
        } else {
          setMap(null);
          setWorkspaceState('empty');
        }
      }
      return { status: 'fulfilled' as const, value };
    }, (reason: unknown) => {
      if (isCurrent()) setWorkspaceState('error');
      return { status: 'rejected' as const, reason };
    });
    const [historyResult, workspaceResult] = await Promise.all([historyRead, workspaceRead]);
    if (!isCurrent()) return { history: undefined, workspace: undefined };
    setRefreshBusy(false);
    return {
      history: historyResult.status === 'fulfilled' ? historyResult.value : undefined,
      workspace: workspaceResult.status === 'fulfilled' ? workspaceResult.value : undefined,
    };
  }, [loadHistory, loadWorkspace, withReadTimeout]);

  const refreshNewestAndValidate = useCallback(async () => {
    const snapshot = await refreshNewest();
    if (mountedRef.current && snapshot.history && snapshot.workspace) setTerminalValidated(true);
    return snapshot;
  }, [refreshNewest]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshNewestAndValidate();
    return () => {
      mountedRef.current = false;
      refreshGenerationRef.current += 1;
      abortRef.current?.abort();
      for (const controller of readControllersRef.current) controller.abort();
      for (const frame of focusFramesRef.current) cancelAnimationFrame(frame);
      focusFramesRef.current.clear();
      for (const timer of savingTimersRef.current.values()) window.clearTimeout(timer);
      savingTimersRef.current.clear();
      matureSavingAttemptsRef.current.clear();
    };
  }, [refreshNewestAndValidate]);

  useEffect(() => {
    activePanelRef.current = activePanel;
    if (activePanel === 'chat') setUnseenChatError(false);
  }, [activePanel]);


  useLayoutEffect(() => {
    const field = draftRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 176)}px`;
  }, [draft]);

  const restoreVoiceFocus = useCallback(() => {
    if (suppressVoiceFocusRef.current || activePanelRef.current !== 'chat') return;
    scheduleFocus(() => voicePrimaryRef.current);
  }, [scheduleFocus]);

  const speech = useSpeechToText({
    language: 'en',
    policy: METHOD_SPEECH_TO_TEXT_POLICY,
    onTranscription: (_id, text) => {
      setDraft((current) => {
        const next = `${current}${current.trim() ? ' ' : ''}${text}`;
        draftValueRef.current = next;
        return next;
      });
      if (automaticCompletionReasonRef.current) setIncompleteTranscriptWarning(true);
      if (!suppressVoiceFocusRef.current && activePanelRef.current === 'chat') {
        scheduleFocus(() => draftRef.current);
      }
    },
    onEmptyTranscription: () => {
      setMicNotice({
        message: 'No speech was detected. Your draft was not changed. Type your answer or try recording again.',
        kind: 'error',
      });
      restoreVoiceFocus();
    },
    onError: (message) => {
      const fallback = /type your answer/i.test(message)
        ? message
        : `${message} Type your answer or try recording again.`;
      setMicNotice({ message: fallback, kind: 'error' });
      restoreVoiceFocus();
    },
  });
  automaticCompletionReasonRef.current = speech.automaticCompletionReason;
  const voiceBusy = speech.recordingState !== 'idle';

  const clearIncompleteTranscriptWarning = useCallback(() => {
    setIncompleteTranscriptWarning(false);
    speech.clearAutomaticCompletionReason();
  }, [speech.clearAutomaticCompletionReason]);

  const cancelVoice = useCallback((restoreFocus: boolean, announce = true) => {
    speech.discardRecording();
    if (announce) {
      setMicNotice({ message: 'Recording canceled. Your draft was not changed.', kind: 'status' });
    }
    if (restoreFocus) restoreVoiceFocus();
  }, [restoreVoiceFocus, speech.discardRecording]);

  const startVoice = useCallback(() => {
    suppressVoiceFocusRef.current = false;
    // The visible warning is draft-owned. Reset only the hook's per-attempt signal
    // so a later automatic stop can be attributed to the new result.
    speech.clearAutomaticCompletionReason();
    setMicNotice(null);
    speech.startRecording('revelio-draft');
  }, [speech.clearAutomaticCompletionReason, speech.startRecording]);

  const announceVoiceSendBlock = useCallback(() => {
    setMicNotice({ message: 'Sending blocked. Finish or cancel recording before sending.', kind: 'status' });
  }, []);

  const selectPanel = useCallback((panel: Panel) => {
    if (panel === 'map') {
      suppressVoiceFocusRef.current = true;
      speech.discardRecording();
    } else {
      suppressVoiceFocusRef.current = false;
    }
    setActivePanel(panel);
  }, [speech.discardRecording]);

  const handleSignOut = useCallback(() => {
    suppressVoiceFocusRef.current = true;
    speech.discardRecording();
    onSignOut();
  }, [onSignOut, speech.discardRecording]);

  useEffect(() => {
    if (!isSigningOut) return;
    suppressVoiceFocusRef.current = true;
    speech.discardRecording();
  }, [isSigningOut, speech.discardRecording]);

  useEffect(() => () => {
    suppressVoiceFocusRef.current = true;
    speech.discardRecording();
  }, [speech.discardRecording]);

  async function loadOlder() {
    if (!olderCursor || olderBusy) return;
    setOlderBusy(true);
    setTurnNotice(null);
    try {
      const page = await withReadTimeout(
        (signal) => loadHistory(olderCursor, signal),
        HISTORY_READ_TIMEOUT_MS,
      );
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
    if (next.text) latencyTraceRef.current?.mark('first-text');
    streamStateRef.current = next;
    setStreamedText(next.text);
    for (const event of next.operationEvents.slice(processedOperationEventsRef.current)) {
      if (event.status === 'Saving') {
        startAttempt({
          operationId: event.operationId,
          turnId: event.turnId,
          messageId: event.messageId,
          operation: event.operation,
          startedAt: Date.now(),
        });
      } else {
        const attempt = pendingAttemptsRef.current.get(event.operationId);
        if (attempt && attempt.turnId === event.turnId && attempt.messageId === event.messageId) {
          attempt.terminal = event.status;
        }
      }
    }
    processedOperationEventsRef.current = next.operationEvents.length;
  }

  async function consumeStream(response: Response) {
    if (!response.body) throw new Error('MissingStream');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawByte = false;
    while (true) {
      const { done, value } = await reader.read();
      if (!done && value?.length && !sawByte) {
        sawByte = true;
        latencyTraceRef.current?.mark('first-byte');
      }
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) absorbStreamState(consumeAgentStreamLine(streamStateRef.current, line.trimEnd()));
      if (done) break;
    }
    if (buffer) absorbStreamState(consumeAgentStreamLine(streamStateRef.current, buffer.trimEnd()));
  }

  function reconcileAttempts(
    snapshot: Awaited<ReturnType<typeof refreshNewest>>,
    options: { providerFailed?: boolean; cancelled?: boolean } = {},
  ) {
    const workspace = snapshot.workspace?.status === 'ready' ? snapshot.workspace.map : undefined;
    const readsEstablishAbsence = Boolean(
      snapshot.history
      && snapshot.workspace
      && snapshot.workspace.status !== 'repair-required',
    );
    let nextError: PersistenceError | undefined;
    const retainHighestPriorityError = (candidate: PersistenceError) => {
      if (!nextError || persistenceErrorPriority[candidate.kind] > persistenceErrorPriority[nextError.kind]) {
        nextError = candidate;
      }
    };
    for (const attempt of [...pendingAttemptsRef.current.values()]) {
      const receipt = workspace?.operationHistory.find((item) => item.sourceId === attempt.operationId);
      const receiptMatchesAttempt = Boolean(receipt && (
        attempt.directOperation
          ? receipt.confirmationProvenance?.kind === 'ui-action'
            && receipt.confirmationProvenance.actionId === attempt.messageId
          : !receipt.confirmationProvenance
            || receipt.confirmationProvenance.turnId === attempt.turnId
      ));
      if (receiptMatchesAttempt) {
        finishAttempt(attempt.operationId);
        if (options.providerFailed || options.cancelled || attempt.cancelled) {
          retainHighestPriorityError({
            kind: 'reply-failed',
            message: 'Your map was updated, but Revelio’s follow-up reply did not finish.',
            action: 'continue',
          });
        }
        continue;
      }
      if (attempt.terminal === 'Rejected') {
        finishAttempt(attempt.operationId);
        continue;
      }
      if (options.cancelled || attempt.cancelled) {
        finishAttempt(attempt.operationId);
        if (!readsEstablishAbsence || receipt) {
          retainHighestPriorityError({
            kind: 'unknown',
            message: 'Revelio could not confirm whether your map was updated. Refresh before trying again.',
            action: 'refresh',
          });
        }
        continue;
      }
      if (attempt.terminal === 'Conflict') {
        finishAttempt(attempt.operationId);
        retainHighestPriorityError({
          kind: 'conflict', message: 'Your map changed — take another look.', action: 'refresh',
        });
        continue;
      }
      if (attempt.terminal === 'Failed') {
        finishAttempt(attempt.operationId);
        retainHighestPriorityError({
          kind: 'failed', message: 'Something went wrong. Try again.', action: 'retry',
          retryOperation: attempt.directOperation,
        });
        continue;
      }
      finishAttempt(attempt.operationId);
      retainHighestPriorityError({
        kind: 'unknown',
        message: 'Revelio could not confirm whether your map was updated. Refresh before trying again.',
        action: 'refresh',
      });
    }
    if (nextError) setPersistenceError(nextError);
  }

  function beginFinishing(): boolean {
    if (!mountedRef.current) return false;
    setTurnPhase('finishing');
    return true;
  }

  const retryNewest = () => { void refreshNewestAndValidate(); };

  async function submitMessage() {
    if (voiceBusy) {
      announceVoiceSendBlock();
      return;
    }
    const message = draft.trim();
    if (!message || turnBusy || bootstrapPending) return;
    const latency = createClientLatencyTrace('agent-turn');
    latencyTraceRef.current = latency;
    if (incompleteTranscriptWarning) clearIncompleteTranscriptWarning();
    refreshGenerationRef.current += 1;
    const messageId = newOpaqueId('message');
    const controller = new AbortController();
    abortRef.current = controller;
    pinnedToBottomRef.current = true;
    setTurnPhase('active');
    setTerminalValidated(false);
    setTurnNotice(null);
    setSubmittedDraft(message);
    setDraft('');
    draftValueRef.current = '';
    setStreamedText('');
    streamStateRef.current = { text: '', citations: [], operationEvents: [], providerFailed: false };
    processedOperationEventsRef.current = 0;
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
      latency?.mark('headers');
      latency?.requestId(response.headers.get('x-request-id'));
      if (!mountedRef.current) return;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const body = await parseJson(response) as Record<string, unknown> | null;
        const status = body?.status;
        if (status === 'completed-replay') setTurnNotice(null);
        else if (status === 'in-flight') setTurnNotice('This message is already in progress. Refreshing its latest state.');
        else if (status === 'cancelled-replay') setTurnNotice('This message was already stopped.');
        else setTurnNotice('Revelio could not complete that reply. Your map may still contain an earlier saved change.');
      } else if (!response.ok) {
        throw new Error('AgentRequestFailed');
      } else {
        await consumeStream(response);
        latency?.mark('response-end');
        if (!mountedRef.current) return;
        if (streamStateRef.current.providerFailed) {
          const restored = !draftValueRef.current.trim();
          if (restored) {
            draftValueRef.current = message;
            setDraft(message);
          }
          if (pendingAttemptsRef.current.size === 0) {
            setTurnNotice(restored
              ? 'Revelio’s reply failed. Your submitted message is available to edit.'
              : 'Revelio’s reply failed. Your current draft is unchanged.');
          }
        }
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const restored = !draftValueRef.current.trim();
      if (restored) {
        draftValueRef.current = message;
        setDraft(message);
      }
      if (controller.signal.aborted) {
        for (const attempt of pendingAttemptsRef.current.values()) attempt.cancelled = true;
        setTurnNotice(restored ? 'Stopped. Your submitted message has been restored.' : 'Stopped. Your current draft is unchanged.');
      } else {
        setTurnNotice(restored
          ? 'Revelio is temporarily unavailable. Your submitted message has been restored.'
          : 'Revelio is temporarily unavailable. Your current draft is unchanged.');
      }
    } finally {
      latency?.mark('refetch-start');
      if (abortRef.current === controller) abortRef.current = null;
      if (!beginFinishing()) return;
      const snapshot = await refreshNewest();
      latency?.mark('refetch-end');
      if (mountedRef.current) {
        reconcileAttempts(snapshot, {
          providerFailed: streamStateRef.current.providerFailed,
          cancelled: controller.signal.aborted,
        });
        setTerminalValidated(Boolean(snapshot.history && snapshot.workspace));
        setTurnPhase('idle');
        setSubmittedDraft(null);
        scheduleFocus(() => draftRef.current);
      }
      latency?.finish();
      if (latencyTraceRef.current === latency) latencyTraceRef.current = undefined;
    }
  }

  async function runOperation(operation: DeterministicOperationRequest) {
    if (!map || turnBusy || unresolvedOperationCount > 0 || !terminalValidated) return;
    const latency = createClientLatencyTrace('workspace-operation');
    latencyTraceRef.current = latency;
    refreshGenerationRef.current += 1;
    const sourceMessageId = typeof operation.input.sourceMessageId === 'string'
      ? operation.input.sourceMessageId
      : newOpaqueId('workspace-message');
    const operationId = newOpaqueId('workspace-operation');
    const controller = new AbortController();
    const attempt: PendingAttempt = {
      turnId: sourceMessageId,
      messageId: sourceMessageId,
      operationId,
      operation: operation.type,
      startedAt: Date.now(),
      directOperation: operation,
    };
    setTurnPhase('active');
    setTerminalValidated(false);
    abortRef.current = controller;
    setTurnNotice(null);
    setStreamedText('');
    streamStateRef.current = { text: '', citations: [], operationEvents: [], providerFailed: false };
    processedOperationEventsRef.current = 0;
    startAttempt(attempt);
    let replyFailed = false;
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
      latency?.mark('headers');
      latency?.requestId(response.headers.get('x-request-id'));
      if (!mountedRef.current) return;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const responseBody = await parseJson(response);
        const envelope = methodOperationEnvelopeSchema.safeParse(responseBody);
        const responseMarker = responseBody && typeof responseBody === 'object'
          ? responseBody as Record<string, unknown>
          : null;
        if (!envelope.success && response.ok && responseMarker?.terminal !== 'failed') {
          throw new Error('WorkspaceOperationEnvelopeInvalid');
        }
        if (!envelope.success) {
          const result = responseMarker?.result && typeof responseMarker.result === 'object'
            ? responseMarker.result as Record<string, unknown>
            : null;
          replyFailed = response.status >= 500 || result?.operationCommitted === true;
        }
        attempt.terminal = envelope.success
          ? envelope.data.status === 'conflict' ? 'Conflict'
            : envelope.data.status === 'rejected' ? 'Rejected' : 'Saved'
          : response.status === 409 ? 'Conflict' : 'Failed';
      } else if (!response.ok) {
        throw new Error('WorkspaceOperationContinuationFailed');
      } else {
        await consumeStream(response);
        latency?.mark('response-end');
        replyFailed = streamStateRef.current.providerFailed;
      }
    } catch {
      attempt.cancelled = controller.signal.aborted;
      replyFailed = !controller.signal.aborted;
    } finally {
      latency?.mark('refetch-start');
      if (abortRef.current === controller) abortRef.current = null;
      if (!beginFinishing()) return;
      const snapshot = await refreshNewest();
      latency?.mark('refetch-end');
      if (mountedRef.current) {
        reconcileAttempts(snapshot, {
          providerFailed: replyFailed,
          cancelled: controller.signal.aborted,
        });
        setTerminalValidated(Boolean(snapshot.history && snapshot.workspace));
        setTurnPhase('idle');
        if (activePanelRef.current === 'chat') scheduleFocus(() => draftRef.current);
      }
      latency?.finish();
      if (latencyTraceRef.current === latency) latencyTraceRef.current = undefined;
    }
  }

  const liveCitationIdentity = streamStateRef.current.citations[0];
  const displayedMessages: NormalizedHistoryMessage[] = streamedText
    ? [...messages, {
        id: liveCitationIdentity?.messageId ?? 'streaming-assistant',
        role: 'assistant' as const,
        ...(liveCitationIdentity ? {
          turn: { turnId: liveCitationIdentity.turnId, status: 'completed' as const },
        } : {}),
        parts: [{ type: 'text' as const, text: streamedText }],
        citations: streamStateRef.current.citations,
      }]
    : messages;
  const pathSetAttachments = useMemo(
    () => attachPurposePathSets(messages, map?.pathSets ?? []),
    [messages, map?.pathSets],
  );
  const checkpoint = map ? deriveMethodCheckpoint(map) : null;
  const currentSuggestedSet = map?.pathSets.findLast((set) => set.status === 'suggested');
  const directOperationType = checkpoint?.pendingDecision?.kind === 'path-selection'
    ? 'select-purpose-path' as const
    : checkpoint?.pendingDecision?.kind === 'path-revision-confirmation'
      ? 'confirm-purpose-path-revision' as const
      : null;
  const actionsBlocked = turnBusy || unresolvedOperationCount > 0 || !terminalValidated;

  function canStartFromSet(set: CareerMap['pathSets'][number], message: NormalizedHistoryMessage): boolean {
    return Boolean(
      directOperationType
      && message.turn?.status === 'completed'
      && currentSuggestedSet?.id === set.id
      && currentSuggestedSet.revision === set.revision
      && checkpoint?.pendingDecision?.targetId === set.id
      && checkpoint.pendingDecision.targetRevision === set.revision
    );
  }

  function startPath(
    set: CareerMap['pathSets'][number],
    path: CareerMap['pathSets'][number]['paths'][number],
  ) {
    if (!directOperationType) return;
    const sourceMessageId = newOpaqueId('workspace-message');
    void runOperation({
      type: directOperationType,
      input: {
        setId: set.id,
        setRevision: set.revision,
        pathId: path.id,
        pathRevision: path.revision,
        presentedInTurnId: set.presentation.assistantTurnId,
        sourceMessageId,
      },
    });
  }

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
  const micLabel = !speech.isSupported
    ? 'Microphone unavailable'
    : speech.recordingState === 'requesting'
      ? 'Cancel recording request'
      : speech.recordingState === 'recording'
      ? 'Stop recording'
      : speech.recordingState === 'processing'
        ? 'Cancel transcription'
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
            <button type="button" onClick={handleSignOut} disabled={isSigningOut} className="min-h-11 border-2 border-black bg-white px-3 font-display text-xs font-black shadow-[2px_2px_0_rgba(0,0,0,0.65)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50">
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
                onClick={() => selectPanel(panel)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const next: Panel = event.key === 'ArrowLeft' || event.key === 'Home' ? 'chat' : 'map';
                  selectPanel(next);
                  requestAnimationFrame(() => tabRefs.current[next]?.focus());
                }}
              >
                {panel === 'chat' ? 'Chat' : 'Your Map'}
                {panel === 'chat' && unseenChatError ? (
                  <span aria-label="Unseen Chat error" className="ml-2 inline-block h-2 w-2 border border-black bg-red-600 align-middle" />
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
            <div className="mx-auto w-full max-w-[82rem] space-y-6 pb-10">
              {historyState === 'loading' ? <p role="status" className="text-sm text-stone-600">Loading your conversation…</p> : null}
              {historyState === 'error' ? (
                <div role="alert" className="border-2 border-red-800 bg-red-50 p-4 text-sm">
                  <p className="font-bold">Your conversation could not be loaded.</p>
                  <RefreshRetryButton
                    busy={refreshBusy}
                    disabled={refreshDisabled}
                    onRetry={retryNewest}
                  />
                </div>
              ) : null}
              {(historyState === 'empty' || historyState === 'ready') && !olderCursor ? (
                <article aria-label="Revelio" className="mx-auto w-full max-w-[38rem]">
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
              {displayedMessages.map((message) => (
                <div key={message.id} className="w-full space-y-5">
                  <SafeMessage message={message} />
                  {(pathSetAttachments.get(message.id) ?? []).map((set) => {
                    const startAvailable = canStartFromSet(set, message);
                    return (
                      <div key={`${set.id}@${set.revision}`} className="purpose-path-comparison" data-path-set={`${set.id}@${set.revision}`}>
                        <div className="method-path-grid">
                          {set.paths.map((path, index) => (
                            <PurposePathCard
                              key={`${path.id}-${path.revision}`}
                              path={path}
                              index={index}
                              {...(startAvailable ? {
                                onStart: () => startPath(set, path),
                                startDisabled: actionsBlocked,
                              } : {})}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {turnPhase === 'active' && !streamedText ? <ActivityIndicator /> : null}
            </div>
          </div>
          <div className="shrink-0 px-4 pb-4 pt-2 sm:px-6">
            <div className="mx-auto w-full max-w-[38rem] space-y-3">
              {savingVisible ? <p role="status" aria-live="polite" className="text-xs font-bold text-amber-900">Saving…</p> : null}
              {persistenceError ? (
                <div role="alert" className="border-l-4 border-red-800 bg-red-50 px-3 py-2 text-xs text-red-950">
                  <p className="font-bold">{persistenceError.message}</p>
                  <button
                    type="button"
                    disabled={persistenceError.action === 'refresh' && refreshDisabled}
                    className="mt-2 min-h-9 font-bold underline disabled:cursor-wait disabled:opacity-60"
                    onClick={() => {
                      if (persistenceError.action === 'retry' && persistenceError.retryOperation) {
                        setPersistenceError(null);
                        void runOperation({
                          ...persistenceError.retryOperation,
                          input: {
                            ...persistenceError.retryOperation.input,
                            sourceMessageId: newOpaqueId('workspace-message'),
                          },
                        });
                      } else if (persistenceError.action === 'retry') {
                        scheduleFocus(() => draftRef.current);
                      } else if (persistenceError.action === 'continue') {
                        setPersistenceError(null);
                        scheduleFocus(() => draftRef.current);
                      } else {
                        void refreshNewestAndValidate().then((snapshot) => {
                          if (snapshot.history && snapshot.workspace) {
                            setPersistenceError(null);
                          }
                        });
                      }
                    }}
                  >
                    {persistenceError.action === 'retry'
                      ? 'Try again'
                      : persistenceError.action === 'continue'
                        ? 'Continue in Chat'
                        : refreshBusy ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              ) : null}
              {turnNotice ? <p role="status" aria-live="polite" className="text-xs font-bold text-stone-700">{turnNotice}</p> : null}
              {micNotice ? (
                <p
                  role={micNotice.kind === 'error' ? 'alert' : 'status'}
                  aria-live={micNotice.kind === 'error' ? undefined : 'polite'}
                  className={`text-xs ${micNotice.kind === 'error' ? 'font-bold text-red-800' : 'text-stone-600'}`}
                >
                  {micNotice.message}
                </p>
              ) : null}
              {incompleteTranscriptWarning ? (
                <p role="alert" className="border-l-4 border-amber-700 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
                  Recording stopped at the size/time limit; this transcript may be incomplete. Review before sending.
                </p>
              ) : null}
              {speech.recordingState === 'recording' ? (
                <p role="status" aria-live="polite" className="text-xs font-bold text-stone-700">Recording…</p>
              ) : null}
              {voiceBusy ? (
                <p id="voice-send-block-reason" className="sr-only">
                  Finish or cancel recording before sending.
                </p>
              ) : null}
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
                    if (event.target.value === '' && incompleteTranscriptWarning) {
                      clearIncompleteTranscriptWarning();
                    }
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
                  ref={voicePrimaryRef}
                  type="button"
                  disabled={speech.recordingState === 'idle' && (turnBusy || bootstrapPending)}
                  aria-pressed={speech.recordingState === 'recording'}
                  aria-label={micLabel}
                  title={micLabel}
                  onClick={() => {
                    if (speech.recordingState === 'idle') startVoice();
                    else if (speech.recordingState === 'recording') speech.stopRecording();
                    else cancelVoice(true);
                  }}
                  className={`grid h-11 w-11 shrink-0 place-items-center border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-40 ${speech.recordingState === 'idle' ? 'border-transparent text-stone-700 hover:border-black hover:bg-ikigai-beige' : 'border-black bg-ikigai-pink text-white'}`}
                >
                  {speech.recordingState === 'recording'
                      ? <Square aria-hidden="true" className="h-4 w-4 fill-current" />
                      : speech.recordingState === 'requesting' || speech.recordingState === 'processing'
                        ? <X aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
                      : <Mic aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />}
                </button>
                {speech.recordingState === 'recording' ? (
                  <button
                    type="button"
                    aria-label="Cancel recording"
                    title="Cancel recording"
                    onClick={() => cancelVoice(true)}
                    className="grid h-11 w-11 shrink-0 place-items-center border-2 border-black bg-white text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                  >
                    <X aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                ) : null}
                {turnBusy && turnCanStop ? (
                  <button
                    type="button"
                    aria-label="Stop"
                    title="Stop"
                    onClick={() => abortRef.current?.abort()}
                    className="grid h-11 w-11 shrink-0 place-items-center border-2 border-black bg-white text-black shadow-[2px_2px_0_rgba(0,0,0,0.65)] transition-[transform,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                  >
                    <Square aria-hidden="true" className="h-4 w-4 fill-current" />
                  </button>
                ) : turnBusy ? (
                  <button
                    type="button"
                    disabled
                    aria-label="Finishing up"
                    title="Finishing up"
                    className="grid h-11 w-11 shrink-0 cursor-wait place-items-center border-2 border-black bg-white text-black opacity-60"
                  >
                    <Loader2 aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!draft.trim() || bootstrapPending}
                    aria-disabled={voiceBusy || undefined}
                    aria-label="Send"
                    title="Send"
                    aria-describedby={voiceBusy ? 'voice-send-block-reason' : bootstrapPending ? 'composer-loading-reason' : undefined}
                    onClick={() => void submitMessage()}
                    className="grid h-11 w-11 shrink-0 place-items-center border-2 border-black bg-ikigai-teal text-black shadow-[2px_2px_0_rgba(0,0,0,0.65)] transition-[transform,box-shadow,opacity] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:translate-x-0.5 active:translate-y-0.5 active:shadow-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
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
            <h2 id="map-heading" className="sr-only">Your Map</h2>
            {workspaceState === 'loading' ? <p role="status" className="text-sm text-stone-600">Loading your map…</p> : null}
            {workspaceState === 'error' ? (
              <div role="alert" className="border-2 border-red-800 bg-red-50 p-5">
                <p className="font-bold">Your map could not be loaded.</p>
                <RefreshRetryButton
                  busy={refreshBusy}
                  disabled={refreshDisabled}
                  onRetry={retryNewest}
                />
              </div>
            ) : null}
            {workspaceState === 'repair-required' ? (
              <div role="alert" className="border-2 border-red-900 bg-red-50 p-5">
                <h3 className="text-xl font-black">Your map needs repair</h3>
                <p className="mt-2 text-sm leading-6">Revelio has stopped Method actions to protect your saved work. Please contact support before continuing.</p>
              </div>
            ) : null}
            {(workspaceState === 'ready' || workspaceState === 'empty') && map ? (
              <MethodMap map={map} />
            ) : null}
            {workspaceState === 'empty' && !map ? (
              <div className="max-w-2xl border-2 border-dashed border-black bg-white/70 p-6 sm:p-8">
                <h3 className="font-display text-2xl font-black">Nothing on your map yet</h3>
                <p className="mt-3 text-sm leading-6 text-stone-700">
                  This is the record of what you and Revelio work out together: what pulls you in, why it matters
                  to you, the directions worth trying, and the project you take on first. Nothing lands here until
                  you’ve confirmed it, so you can change your mind in the chat at any point.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

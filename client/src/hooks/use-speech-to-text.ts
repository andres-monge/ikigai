import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '@/lib/i18n';

export type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing';
export type AutomaticCompletionReason = 'time-limit' | 'byte-limit';

export interface SpeechToTextPolicy {
  endpoint: string;
  includeLanguageQuery: boolean;
  headers?: Readonly<Record<string, string>>;
  recordingTimesliceMs?: number;
  maxRecordingMs?: number;
  transcriptionTimeoutMs?: number;
  rollingStopBytes?: number;
  maxUploadBytes: number;
}

/** Opt-in policy for authenticated Method dictation. */
export const METHOD_SPEECH_TO_TEXT_POLICY = {
  endpoint: '/api/agent/audio/transcribe',
  includeLanguageQuery: false,
  headers: { 'X-Nami-Request': '1' },
  recordingTimesliceMs: 250,
  maxRecordingMs: 300_000,
  transcriptionTimeoutMs: 105_000,
  rollingStopBytes: 9 * 1024 * 1024,
  maxUploadBytes: 10 * 1024 * 1024,
} as const satisfies SpeechToTextPolicy;

export interface UseSpeechToTextOptions {
  /** Language hint retained by the legacy questionnaire endpoint. */
  language: Language;
  onTranscription: (textareaId: string, text: string) => void;
  onEmptyTranscription?: () => void;
  onError?: (message: string) => void;
  /** Legacy endpoint override. Prefer `policy` for bounded Method capture. */
  endpoint?: string;
  /** Opt-in request and recording limits. Omission preserves questionnaire defaults. */
  policy?: SpeechToTextPolicy;
}

export interface UseSpeechToTextReturn {
  isSupported: boolean;
  recordingState: RecordingState;
  error: string | null;
  startRecording: (textareaId: string) => void;
  /** Finish capture and upload its complete final Blob. */
  stopRecording: () => void;
  /** Discard capture or upload work without applying a late result. */
  discardRecording: () => void;
  activeTextareaId: string | null;
  /** Persists until the consumer explicitly acknowledges the incomplete result. */
  automaticCompletionReason: AutomaticCompletionReason | null;
  clearAutomaticCompletionReason: () => void;
}

const MAX_RECORDING_MS = 120_000;
const TRANSCRIBE_TIMEOUT_MS = 30_000;
const LEGACY_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const SIZE_LIMIT_MESSAGE =
  'Recording is too large to transcribe. Try a shorter recording or type your answer.';
const TIMEOUT_MESSAGE = 'Transcription timed out. Try again or type your answer.';

interface ActiveAttempt {
  id: number;
  textareaId: string;
  language: Language;
  policy: SpeechToTextPolicy;
  discarded: boolean;
  finishRequested: boolean;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  emittedBytes: number;
  autoStopTimer: ReturnType<typeof setTimeout> | null;
  fetchController: AbortController | null;
  fetchTimer: ReturnType<typeof setTimeout> | null;
  settled: Promise<void>;
  resolveSettled: () => void;
}

function createSettlement(): Pick<ActiveAttempt, 'settled' | 'resolveSettled'> {
  let resolveSettled!: () => void;
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  return { settled, resolveSettled };
}

function getPreferredMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus';
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

let browserSupportCached: boolean | null = null;
function isSpeechSupported(): boolean {
  if (browserSupportCached === null) {
    browserSupportCached =
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined' &&
      getPreferredMimeType() !== '';
  }
  return browserSupportCached;
}

export function _resetBrowserSupportCache(): void {
  browserSupportCached = null;
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function permissionErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'Microphone access denied. Check your browser settings.';
    }
    if (error.name === 'NotFoundError') {
      return 'No microphone found. Please connect a microphone and try again.';
    }
    return `Microphone error: ${error.message}`;
  }
  return 'Failed to start recording. Please try again.';
}

export function useSpeechToText(options: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeTextareaId, setActiveTextareaId] = useState<string | null>(null);
  const [automaticCompletionReason, setAutomaticCompletionReason] =
    useState<AutomaticCompletionReason | null>(null);

  const mountedRef = useRef(true);
  const nextAttemptIdRef = useRef(0);
  const nextStartRequestIdRef = useRef(0);
  const activeAttemptRef = useRef<ActiveAttempt | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const onTranscriptionRef = useRef(options.onTranscription);
  onTranscriptionRef.current = options.onTranscription;
  const onEmptyTranscriptionRef = useRef(options.onEmptyTranscription);
  onEmptyTranscriptionRef.current = options.onEmptyTranscription;
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const isSupported = isSpeechSupported();

  const isCurrent = useCallback(
    (attempt: ActiveAttempt) =>
      mountedRef.current &&
      !attempt.discarded &&
      activeAttemptRef.current === attempt &&
      activeAttemptRef.current.id === attempt.id,
    [],
  );

  const clearAttemptTimers = useCallback((attempt: ActiveAttempt) => {
    if (attempt.autoStopTimer !== null) {
      clearTimeout(attempt.autoStopTimer);
      attempt.autoStopTimer = null;
    }
    if (attempt.fetchTimer !== null) {
      clearTimeout(attempt.fetchTimer);
      attempt.fetchTimer = null;
    }
  }, []);

  const releaseStream = useCallback((attempt: ActiveAttempt) => {
    stopTracks(attempt.stream);
    attempt.stream = null;
  }, []);

  const settleAttempt = useCallback(
    (attempt: ActiveAttempt) => {
      if (!isCurrent(attempt)) return;
      clearAttemptTimers(attempt);
      releaseStream(attempt);
      attempt.fetchController = null;
      attempt.recorder = null;
      attempt.chunks = [];
      activeAttemptRef.current = null;
      attempt.resolveSettled();
      setRecordingState('idle');
      setActiveTextareaId(null);
    },
    [clearAttemptTimers, isCurrent, releaseStream],
  );

  const failAttempt = useCallback(
    (attempt: ActiveAttempt, message: string) => {
      if (!isCurrent(attempt)) return;
      setError(message);
      onErrorRef.current?.(message);
      settleAttempt(attempt);
    },
    [isCurrent, settleAttempt],
  );

  const discardActiveAttempt = useCallback(
    (updateState: boolean) => {
      const attempt = activeAttemptRef.current;
      if (!attempt) return;

      activeAttemptRef.current = null;
      attempt.discarded = true;
      clearAttemptTimers(attempt);
      attempt.fetchController?.abort();
      attempt.fetchController = null;

      const recorder = attempt.recorder;
      attempt.recorder = null;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }

      releaseStream(attempt);
      attempt.chunks = [];
      attempt.resolveSettled();

      if (updateState && mountedRef.current) {
        setRecordingState('idle');
        setActiveTextareaId(null);
      }
    },
    [clearAttemptTimers, releaseStream],
  );

  const transcribeAudio = useCallback(
    async (attempt: ActiveAttempt, audioBlob: Blob) => {
      if (!isCurrent(attempt)) return;

      const separator = attempt.policy.endpoint.includes('?') ? '&' : '?';
      const requestUrl = attempt.policy.includeLanguageQuery
        ? `${attempt.policy.endpoint}${separator}language=${encodeURIComponent(attempt.language)}`
        : attempt.policy.endpoint;
      const controller = new AbortController();
      attempt.fetchController = controller;
      // This budget intentionally starts immediately before fetch so upload time counts.
      attempt.fetchTimer = setTimeout(() => {
        if (!isCurrent(attempt)) return;
        controller.abort();
        failAttempt(attempt, TIMEOUT_MESSAGE);
      }, attempt.policy.transcriptionTimeoutMs ?? TRANSCRIBE_TIMEOUT_MS);

      try {
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': audioBlob.type,
            ...attempt.policy.headers,
          },
          body: audioBlob,
          signal: controller.signal,
          credentials: 'include',
        });

        if (!isCurrent(attempt)) return;
        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: 'Transcription request failed' }));
          if (!isCurrent(attempt)) return;
          throw new Error(body.error || `Server returned ${response.status}`);
        }

        const data = await response.json();
        if (!isCurrent(attempt)) return;

        if (typeof data.text !== 'string' || data.text.trim() === '') {
          onEmptyTranscriptionRef.current?.();
        } else {
          onTranscriptionRef.current(attempt.textareaId, data.text);
        }
        settleAttempt(attempt);
      } catch (caught) {
        if (!isCurrent(attempt)) return;
        const message =
          caught instanceof DOMException && caught.name === 'AbortError'
            ? TIMEOUT_MESSAGE
            : caught instanceof Error
              ? caught.message
              : 'Transcription failed. Try again or type your answer.';
        failAttempt(attempt, message);
      }
    },
    [failAttempt, isCurrent, settleAttempt],
  );

  const finishAttempt = useCallback(
    (attempt: ActiveAttempt, reason?: AutomaticCompletionReason) => {
      if (!isCurrent(attempt) || attempt.finishRequested) return;
      const recorder = attempt.recorder;
      if (!recorder || recorder.state === 'inactive') return;

      attempt.finishRequested = true;
      if (reason) setAutomaticCompletionReason(reason);
      recorder.stop();
    },
    [isCurrent],
  );

  const stopRecording = useCallback(() => {
    const attempt = activeAttemptRef.current;
    if (attempt) finishAttempt(attempt);
  }, [finishAttempt]);

  const discardRecording = useCallback(() => {
    discardActiveAttempt(true);
  }, [discardActiveAttempt]);

  const startRecording = useCallback(
    async (textareaId: string) => {
      const currentOptions = optionsRef.current;
      const startRequestId = ++nextStartRequestIdRef.current;
      const existingAttempt = activeAttemptRef.current;

      if (
        !currentOptions.policy &&
        existingAttempt?.recorder &&
        existingAttempt.recorder.state !== 'inactive'
      ) {
        finishAttempt(existingAttempt);
        await existingAttempt.settled;
        if (!mountedRef.current || startRequestId !== nextStartRequestIdRef.current) return;
      } else {
        discardActiveAttempt(true);
      }

      const policy: SpeechToTextPolicy = currentOptions.policy
        ? {
            ...currentOptions.policy,
            headers: currentOptions.policy.headers
              ? { ...currentOptions.policy.headers }
              : undefined,
          }
        : {
            endpoint: currentOptions.endpoint ?? '/api/transcribe',
            includeLanguageQuery: true,
            maxUploadBytes: LEGACY_MAX_UPLOAD_BYTES,
          };
      const attempt: ActiveAttempt = {
        ...createSettlement(),
        id: ++nextAttemptIdRef.current,
        textareaId,
        language: currentOptions.language,
        policy,
        discarded: false,
        finishRequested: false,
        stream: null,
        recorder: null,
        chunks: [],
        emittedBytes: 0,
        autoStopTimer: null,
        fetchController: null,
        fetchTimer: null,
      };
      activeAttemptRef.current = attempt;
      setError(null);
      setActiveTextareaId(textareaId);
      setRecordingState('requesting');

      if (!isSupported) {
        failAttempt(attempt, 'Audio recording is not supported in this browser.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isCurrent(attempt)) {
          stopTracks(stream);
          return;
        }
        attempt.stream = stream;

        const mimeType = getPreferredMimeType();
        const recorder = new MediaRecorder(stream, { mimeType });
        attempt.recorder = recorder;

        recorder.ondataavailable = (event) => {
          if (!isCurrent(attempt) || event.data.size === 0) return;
          attempt.chunks.push(event.data);
          attempt.emittedBytes += event.data.size;

          if (
            attempt.policy.rollingStopBytes !== undefined &&
            attempt.emittedBytes >= attempt.policy.rollingStopBytes
          ) {
            finishAttempt(attempt, 'byte-limit');
          }
        };

        recorder.onstop = () => {
          if (!isCurrent(attempt)) return;
          if (attempt.autoStopTimer !== null) {
            clearTimeout(attempt.autoStopTimer);
            attempt.autoStopTimer = null;
          }
          releaseStream(attempt);
          attempt.recorder = null;

          const audioBlob = new Blob(attempt.chunks, { type: mimeType });
          attempt.chunks = [];
          if (audioBlob.size === 0) {
            onEmptyTranscriptionRef.current?.();
            settleAttempt(attempt);
            return;
          }
          if (audioBlob.size > attempt.policy.maxUploadBytes) {
            failAttempt(attempt, SIZE_LIMIT_MESSAGE);
            return;
          }

          setRecordingState('processing');
          void transcribeAudio(attempt, audioBlob);
        };

        if (policy.recordingTimesliceMs === undefined) recorder.start();
        else recorder.start(policy.recordingTimesliceMs);
        setRecordingState('recording');

        attempt.autoStopTimer = setTimeout(() => {
          finishAttempt(attempt, 'time-limit');
        }, policy.maxRecordingMs ?? MAX_RECORDING_MS);
      } catch (caught) {
        if (!isCurrent(attempt)) return;
        failAttempt(attempt, permissionErrorMessage(caught));
      }
    },
    [discardActiveAttempt, failAttempt, finishAttempt, isCurrent, isSupported, releaseStream, settleAttempt, transcribeAudio],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardActiveAttempt(false);
    };
  }, [discardActiveAttempt]);

  const clearAutomaticCompletionReason = useCallback(() => {
    setAutomaticCompletionReason(null);
  }, []);

  const exposedRecordingState =
    !options.policy && recordingState === 'requesting' ? 'idle' : recordingState;
  const exposedActiveTextareaId =
    !options.policy && recordingState === 'requesting' ? null : activeTextareaId;

  return {
    isSupported,
    recordingState: exposedRecordingState,
    error,
    startRecording,
    stopRecording,
    discardRecording,
    activeTextareaId: exposedActiveTextareaId,
    automaticCompletionReason,
    clearAutomaticCompletionReason,
  };
}

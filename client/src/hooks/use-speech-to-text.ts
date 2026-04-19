import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Recording lifecycle state machine.
 * - `idle`:       No recording in progress — mic button shows default icon
 * - `recording`:  MediaRecorder is capturing audio — mic button pulses red
 * - `processing`: Audio sent to server for transcription — spinner shown
 */
export type RecordingState = 'idle' | 'recording' | 'processing';

export interface UseSpeechToTextOptions {
  /** Language hint for Groq Whisper ('en' | 'es') */
  language: string;
  /** Called with (textareaId, transcribedText) when transcription succeeds */
  onTranscription: (textareaId: string, text: string) => void;
  /** Called when transcription returns empty text (no speech detected) */
  onEmptyTranscription?: () => void;
  /** Called when an error occurs (permission denied, network failure, etc.) */
  onError?: (message: string) => void;
}

export interface UseSpeechToTextReturn {
  /** Whether the browser supports MediaRecorder + getUserMedia */
  isSupported: boolean;
  /** Current state of the recording lifecycle */
  recordingState: RecordingState;
  /** Human-readable error message, or null */
  error: string | null;
  /** Start recording audio for a specific textarea */
  startRecording: (textareaId: string) => void;
  /** Stop the current recording (triggers transcription) */
  stopRecording: () => void;
  /** ID of the textarea currently being recorded, or null */
  activeTextareaId: string | null;
}

/** Maximum recording duration in milliseconds (2 minutes) */
const MAX_RECORDING_MS = 120_000;

/**
 * Detect the best audio mime type the browser supports.
 * Chrome/Edge/Firefox prefer webm/opus; Safari falls back to mp4.
 */
function getPreferredMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus';
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return 'audio/webm';
  }
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return 'audio/mp4';
  }
  return '';
}

/**
 * Check if the browser supports the required audio APIs.
 */
function checkBrowserSupport(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined' &&
    getPreferredMimeType() !== ''
  );
}

/**
 * Custom hook that manages the full speech-to-text recording lifecycle:
 * feature detection, MediaRecorder control, audio capture, server communication,
 * and state management.
 *
 * Enforces single-active-recording across all hook instances and auto-stops
 * after 120 seconds.
 *
 * @param options - Configuration: language, onTranscription callback, optional error/empty handlers
 * @returns Recording state and control functions
 *
 * @example
 * ```tsx
 * const stt = useSpeechToText({
 *   language: 'en',
 *   onTranscription: (id, text) => appendToTextarea(id, text),
 *   onError: (msg) => toast({ title: 'Error', description: msg, variant: 'destructive' }),
 * });
 *
 * <button onClick={() => stt.startRecording('q1')}>
 *   {stt.recordingState === 'recording' ? 'Stop' : 'Speak'}
 * </button>
 * ```
 */
export function useSpeechToText(options: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const { language, onTranscription, onEmptyTranscription, onError } = options;

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeTextareaId, setActiveTextareaId] = useState<string | null>(null);

  // Refs for cleanup and single-recording enforcement
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mimeTypeRef = useRef<string>('');

  // Keep callbacks fresh without re-creating startRecording/stopRecording
  const onTranscriptionRef = useRef(onTranscription);
  onTranscriptionRef.current = onTranscription;
  const onEmptyTranscriptionRef = useRef(onEmptyTranscription);
  onEmptyTranscriptionRef.current = onEmptyTranscription;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const isSupported = checkBrowserSupport();

  /**
   * Release microphone stream tracks and clear auto-stop timer.
   */
  const cleanup = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  /**
   * Send recorded audio to the transcription endpoint and handle the result.
   */
  const transcribeAudio = useCallback(
    async (audioBlob: Blob, textareaId: string) => {
      setRecordingState('processing');

      try {
        const res = await fetch(`/api/transcribe?language=${encodeURIComponent(language)}`, {
          method: 'POST',
          headers: { 'Content-Type': audioBlob.type },
          body: audioBlob,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Transcription request failed' }));
          throw new Error(body.error || `Server returned ${res.status}`);
        }

        const data = await res.json();

        if (!data.text || data.text.trim() === '') {
          onEmptyTranscriptionRef.current?.();
        } else {
          onTranscriptionRef.current(textareaId, data.text);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Transcription failed. Try again or type your answer.';
        setError(message);
        onErrorRef.current?.(message);
      } finally {
        setRecordingState('idle');
        setActiveTextareaId(null);
      }
    },
    [language],
  );

  /**
   * Stop the current recording. Assembles audio blob and triggers transcription.
   */
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return;
    }

    // The onstop handler (set in startRecording) will assemble the blob
    // and call transcribeAudio.
    recorder.stop();
  }, []);

  /**
   * Start recording audio for a specific textarea.
   * Auto-stops any active recording first (single-recording enforcement).
   */
  const startRecording = useCallback(
    async (textareaId: string) => {
      // Stop any existing recording first
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        // Small delay to let onstop fire before starting new recording
        await new Promise((r) => setTimeout(r, 50));
      }
      cleanup();

      setError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const mimeType = getPreferredMimeType();
        mimeTypeRef.current = mimeType;

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        // Capture the textareaId for use in onstop
        const capturedTextareaId = textareaId;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          // Release stream tracks immediately after stopping
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
          if (autoStopTimerRef.current) {
            clearTimeout(autoStopTimerRef.current);
            autoStopTimerRef.current = null;
          }

          // Only transcribe if we have audio data
          if (blob.size > 0) {
            transcribeAudio(blob, capturedTextareaId);
          } else {
            setRecordingState('idle');
            setActiveTextareaId(null);
          }
        };

        recorder.start();
        setRecordingState('recording');
        setActiveTextareaId(textareaId);

        // Auto-stop after MAX_RECORDING_MS
        autoStopTimerRef.current = setTimeout(() => {
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }, MAX_RECORDING_MS);
      } catch (err) {
        cleanup();
        setRecordingState('idle');
        setActiveTextareaId(null);

        let message: string;
        if (err instanceof DOMException) {
          if (err.name === 'NotAllowedError') {
            message = 'Microphone access denied. Check your browser settings.';
          } else if (err.name === 'NotFoundError') {
            message = 'No microphone found. Please connect a microphone and try again.';
          } else {
            message = `Microphone error: ${err.message}`;
          }
        } else {
          message = 'Failed to start recording. Please try again.';
        }

        setError(message);
        onErrorRef.current?.(message);
      }
    },
    [cleanup, transcribeAudio],
  );

  // Cleanup on unmount — stop recording and release stream
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      cleanup();
    };
  }, [cleanup]);

  return {
    isSupported,
    recordingState,
    error,
    startRecording,
    stopRecording,
    activeTextareaId,
  };
}

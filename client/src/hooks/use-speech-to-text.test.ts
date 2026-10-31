/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetBrowserSupportCache,
  METHOD_SPEECH_TO_TEXT_POLICY,
  useSpeechToText,
  type UseSpeechToTextOptions,
} from './use-speech-to-text';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static stopChunks: Blob[] = [new Blob(['fake-audio'], { type: 'audio/webm' })];

  static isTypeSupported(type: string) {
    return type === 'audio/webm;codecs=opus' || type === 'audio/webm';
  }

  state: RecordingState = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn((timeslice?: number) => {
    this.state = 'recording';
    return timeslice;
  });
  stop = vi.fn(() => {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    for (const chunk of MockMediaRecorder.stopChunks) {
      this.ondataavailable?.({ data: chunk });
    }
    this.onstop?.();
  });

  constructor(
    public stream: MediaStream,
    public options?: MediaRecorderOptions,
  ) {
    MockMediaRecorder.instances.push(this);
  }

  emit(chunk: Blob) {
    this.ondataavailable?.({ data: chunk });
  }
}

const mockGetUserMedia = vi.fn();

function createMockStream() {
  const stop = vi.fn();
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop,
  };
}

function response(text: string) {
  return {
    ok: true,
    json: () => Promise.resolve({ text }),
  };
}

function defaultOptions(overrides: Partial<UseSpeechToTextOptions> = {}): UseSpeechToTextOptions {
  return {
    language: 'en',
    onTranscription: vi.fn(),
    onEmptyTranscription: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetBrowserSupportCache();
  MockMediaRecorder.instances = [];
  MockMediaRecorder.stopChunks = [new Blob(['fake-audio'], { type: 'audio/webm' })];

  Object.defineProperty(globalThis, 'MediaRecorder', {
    value: MockMediaRecorder,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    configurable: true,
    writable: true,
  });

  mockGetUserMedia.mockResolvedValue(createMockStream().stream);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('hello world')));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useSpeechToText', () => {
  it('detects supported and unsupported browsers', () => {
    const supported = renderHook(() => useSpeechToText(defaultOptions()));
    expect(supported.result.current.isSupported).toBe(true);
    supported.unmount();

    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    _resetBrowserSupportCache();
    const unsupported = renderHook(() => useSpeechToText(defaultOptions()));
    expect(unsupported.result.current.isSupported).toBe(false);
  });

  it('keeps the legacy endpoint, language query, and successful callback defaults', async () => {
    const onTranscription = vi.fn();
    const { result } = renderHook(() => useSpeechToText(defaultOptions({
      language: 'es',
      onTranscription,
    })));

    await act(async () => result.current.startRecording('q1'));
    await act(async () => result.current.stopRecording());

    await waitFor(() => expect(onTranscription).toHaveBeenCalledWith('q1', 'hello world'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/transcribe?language=es',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm;codecs=opus' },
        credentials: 'include',
      }),
    );
    expect(result.current.recordingState).toBe('idle');
  });

  it('moves from requesting permission to recording', async () => {
    const permission = deferred<MediaStream>();
    mockGetUserMedia.mockReturnValue(permission.promise);
    const { result } = renderHook(() => useSpeechToText({
      ...defaultOptions(),
      policy: METHOD_SPEECH_TO_TEXT_POLICY,
    }));

    act(() => {
      result.current.startRecording('draft');
    });
    expect(result.current.recordingState).toBe('requesting');
    expect(result.current.activeTextareaId).toBe('draft');

    await act(async () => permission.resolve(createMockStream().stream));
    expect(result.current.recordingState).toBe('recording');
  });

  it('keeps legacy permission requests externally idle while fencing late grants', async () => {
    const permission = deferred<MediaStream>();
    const lateStream = createMockStream();
    mockGetUserMedia.mockReturnValue(permission.promise);
    const { result, unmount } = renderHook(() => useSpeechToText(defaultOptions()));

    act(() => {
      result.current.startRecording('question');
    });
    expect(result.current.recordingState).toBe('idle');
    expect(result.current.activeTextareaId).toBeNull();

    unmount();
    await act(async () => permission.resolve(lateStream.stream));
    expect(lateStream.stop).toHaveBeenCalledOnce();
    expect(MockMediaRecorder.instances).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('finishes a legacy recording before starting the next textarea', async () => {
    const firstUpload = deferred<ReturnType<typeof response>>();
    vi.mocked(fetch)
      .mockReturnValueOnce(firstUpload.promise as Promise<Response>)
      .mockResolvedValueOnce(response('second transcript') as Response);
    const onTranscription = vi.fn();
    const { result } = renderHook(() => useSpeechToText(defaultOptions({ onTranscription })));

    await act(async () => result.current.startRecording('first'));
    let secondStart!: Promise<void>;
    act(() => {
      secondStart = result.current.startRecording('second') as unknown as Promise<void>;
    });

    expect(MockMediaRecorder.instances[0].stop).toHaveBeenCalledOnce();
    expect(MockMediaRecorder.instances).toHaveLength(1);
    await act(async () => firstUpload.resolve(response('first transcript')));
    await act(async () => secondStart);

    expect(onTranscription).toHaveBeenCalledWith('first', 'first transcript');
    expect(MockMediaRecorder.instances).toHaveLength(2);
    expect(result.current.activeTextareaId).toBe('second');
    expect(result.current.recordingState).toBe('recording');
  });

  it('discards pending permission and stops a stream that arrives late', async () => {
    const permission = deferred<MediaStream>();
    const lateStream = createMockStream();
    mockGetUserMedia.mockReturnValue(permission.promise);
    const onTranscription = vi.fn();
    const { result } = renderHook(() => useSpeechToText(defaultOptions({ onTranscription })));

    act(() => {
      result.current.startRecording('draft');
    });
    act(() => result.current.discardRecording());
    expect(result.current.recordingState).toBe('idle');

    await act(async () => permission.resolve(lateStream.stream));
    expect(lateStream.stop).toHaveBeenCalledOnce();
    expect(MockMediaRecorder.instances).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(onTranscription).not.toHaveBeenCalled();
  });

  it('discards recording without uploading and ignores recorder events', async () => {
    const captured = createMockStream();
    mockGetUserMedia.mockResolvedValue(captured.stream);
    const onTranscription = vi.fn();
    const { result } = renderHook(() => useSpeechToText(defaultOptions({ onTranscription })));

    await act(async () => result.current.startRecording('draft'));
    const recorder = MockMediaRecorder.instances[0];
    act(() => result.current.discardRecording());

    recorder.emit(new Blob(['late']));
    recorder.onstop?.();
    expect(captured.stop).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(onTranscription).not.toHaveBeenCalled();
    expect(result.current.recordingState).toBe('idle');
  });

  it('aborts processing and ignores a late fetch result', async () => {
    const upload = deferred<ReturnType<typeof response>>();
    vi.mocked(fetch).mockReturnValue(upload.promise as Promise<Response>);
    const onTranscription = vi.fn();
    const { result } = renderHook(() => useSpeechToText(defaultOptions({ onTranscription })));

    await act(async () => result.current.startRecording('draft'));
    act(() => result.current.stopRecording());
    expect(result.current.recordingState).toBe('processing');
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;

    act(() => result.current.discardRecording());
    expect(signal?.aborted).toBe(true);
    await act(async () => upload.resolve(response('too late')));

    expect(onTranscription).not.toHaveBeenCalled();
    expect(result.current.recordingState).toBe('idle');
  });

  it('fences every callback from a superseded permission attempt', async () => {
    const firstPermission = deferred<MediaStream>();
    const firstStream = createMockStream();
    const secondStream = createMockStream();
    mockGetUserMedia
      .mockReturnValueOnce(firstPermission.promise)
      .mockResolvedValueOnce(secondStream.stream);
    const { result } = renderHook(() => useSpeechToText(defaultOptions()));

    act(() => {
      result.current.startRecording('first');
    });
    await act(async () => result.current.startRecording('second'));
    expect(result.current.activeTextareaId).toBe('second');
    expect(result.current.recordingState).toBe('recording');

    await act(async () => firstPermission.resolve(firstStream.stream));
    expect(firstStream.stop).toHaveBeenCalledOnce();
    expect(result.current.activeTextareaId).toBe('second');
    expect(result.current.recordingState).toBe('recording');
  });

  it('keeps a later recording active when a superseded upload completes', async () => {
    const firstUpload = deferred<ReturnType<typeof response>>();
    vi.mocked(fetch).mockReturnValueOnce(firstUpload.promise as Promise<Response>);
    const onTranscription = vi.fn();
    const { result } = renderHook(() => useSpeechToText(defaultOptions({ onTranscription })));

    await act(async () => result.current.startRecording('first'));
    act(() => result.current.stopRecording());
    const firstSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;

    await act(async () => result.current.startRecording('second'));
    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.activeTextareaId).toBe('second');
    expect(result.current.recordingState).toBe('recording');

    await act(async () => firstUpload.resolve(response('stale transcript')));
    expect(onTranscription).not.toHaveBeenCalled();
    expect(result.current.activeTextareaId).toBe('second');
    expect(result.current.recordingState).toBe('recording');
  });

  it('unmounts as discard without invoking the recorder upload path', async () => {
    const captured = createMockStream();
    mockGetUserMedia.mockResolvedValue(captured.stream);
    const { result, unmount } = renderHook(() => useSpeechToText(defaultOptions()));

    await act(async () => result.current.startRecording('draft'));
    const recorder = MockMediaRecorder.instances[0];
    unmount();

    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(captured.stop).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opts Method into its endpoint, header, no language query, and short timeslices', async () => {
    const { result } = renderHook(() => useSpeechToText({
      ...defaultOptions(),
      policy: METHOD_SPEECH_TO_TEXT_POLICY,
    }));

    await act(async () => result.current.startRecording('draft'));
    expect(MockMediaRecorder.instances[0].start).toHaveBeenCalledWith(250);
    await act(async () => result.current.stopRecording());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/agent/audio/transcribe',
      expect.objectContaining({
        headers: {
          'Content-Type': 'audio/webm;codecs=opus',
          'X-Nami-Request': '1',
        },
      }),
    );
  });

  it('requests one normal Stop at the rolling byte limit and reports an incomplete reason', async () => {
    MockMediaRecorder.stopChunks = [new Blob([new Uint8Array(10)])];
    const { result } = renderHook(() => useSpeechToText({
      ...defaultOptions(),
      policy: METHOD_SPEECH_TO_TEXT_POLICY,
    }));

    await act(async () => result.current.startRecording('draft'));
    const recorder = MockMediaRecorder.instances[0];
    act(() => recorder.emit(new Blob([new Uint8Array(9 * 1024 * 1024)])));

    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(result.current.automaticCompletionReason).toBe('byte-limit');
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const uploaded = vi.mocked(fetch).mock.calls[0]?.[1]?.body as Blob;
    expect(uploaded.size).toBe(9 * 1024 * 1024 + 10);
  });

  it('never uploads a single chunk above the Method final-blob budget', async () => {
    MockMediaRecorder.stopChunks = [];
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechToText({
      ...defaultOptions({ onError }),
      policy: METHOD_SPEECH_TO_TEXT_POLICY,
    }));

    await act(async () => result.current.startRecording('draft'));
    act(() => MockMediaRecorder.instances[0].emit(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)])));

    expect(fetch).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/too large/i));
    expect(result.current.recordingState).toBe('idle');
  });

  it('keeps the delayed final chunk and rejects the complete oversized Blob', async () => {
    MockMediaRecorder.stopChunks = [new Blob([new Uint8Array(1024 * 1024 + 1)])];
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechToText({
      ...defaultOptions({ onError }),
      policy: METHOD_SPEECH_TO_TEXT_POLICY,
    }));

    await act(async () => result.current.startRecording('draft'));
    act(() => MockMediaRecorder.instances[0].emit(new Blob([new Uint8Array(9 * 1024 * 1024)])));

    expect(fetch).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/too large/i));
    expect(result.current.automaticCompletionReason).toBe('byte-limit');
  });

  it('auto-finishes at the time cap with a typed incomplete reason', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSpeechToText({
      ...defaultOptions(),
      policy: METHOD_SPEECH_TO_TEXT_POLICY,
    }));

    await act(async () => result.current.startRecording('draft'));
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(MockMediaRecorder.instances[0].stop).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(180_000));

    expect(MockMediaRecorder.instances[0].stop).toHaveBeenCalledOnce();
    expect(result.current.automaticCompletionReason).toBe('time-limit');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('starts the 30-second timeout with fetch, aborts it, and fences late completion', async () => {
    vi.useFakeTimers();
    const upload = deferred<ReturnType<typeof response>>();
    vi.mocked(fetch).mockReturnValue(upload.promise as Promise<Response>);
    const onTranscription = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechToText(defaultOptions({
      onTranscription,
      onError,
    })));

    await act(async () => result.current.startRecording('draft'));
    act(() => result.current.stopRecording());
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(signal?.aborted).toBe(true);
    expect(result.current.recordingState).toBe('idle');
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/timed out/i));

    await act(async () => upload.resolve(response('late transcript')));
    expect(onTranscription).not.toHaveBeenCalled();
  });

  it('gives a five-minute Method recording a longer transcription budget without changing the legacy timeout', async () => {
    vi.useFakeTimers();
    const upload = deferred<ReturnType<typeof response>>();
    vi.mocked(fetch).mockReturnValue(upload.promise as Promise<Response>);
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechToText({
      ...defaultOptions({ onError }),
      policy: METHOD_SPEECH_TO_TEXT_POLICY,
    }));

    await act(async () => result.current.startRecording('draft'));
    act(() => result.current.stopRecording());
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(signal?.aborted).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(75_000));
    expect(signal?.aborted).toBe(true);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/timed out/i));
  });

  it('preserves useful permission, empty, and provider failure callbacks', async () => {
    const onError = vi.fn();
    mockGetUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    const denied = renderHook(() => useSpeechToText(defaultOptions({ onError })));
    await act(async () => denied.result.current.startRecording('q1'));
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/denied/i));
    denied.unmount();

    const onEmptyTranscription = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(response('') as Response);
    const empty = renderHook(() => useSpeechToText(defaultOptions({ onEmptyTranscription })));
    await act(async () => empty.result.current.startRecording('q1'));
    await act(async () => empty.result.current.stopRecording());
    await waitFor(() => expect(onEmptyTranscription).toHaveBeenCalledOnce());
    empty.unmount();

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'Transcription unavailable' }),
    } as Response);
    const failed = renderHook(() => useSpeechToText(defaultOptions({ onError })));
    await act(async () => failed.result.current.startRecording('q1'));
    await act(async () => failed.result.current.stopRecording());
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Transcription unavailable'));
  });
});

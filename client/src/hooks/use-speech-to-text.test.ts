/**
 * @vitest-environment jsdom
 *
 * @description
 * Unit tests for the useSpeechToText hook.
 *
 * Browser APIs (MediaRecorder, getUserMedia) are mocked since tests
 * run in jsdom which does not implement the MediaStream Recording API.
 *
 * Test focus:
 * - Feature detection (isSupported)
 * - State transitions (idle → recording → processing → idle)
 * - Permission denial error handling
 * - Auto-stop after timeout
 * - Cleanup on unmount
 * - Transcription result and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSpeechToText, _resetBrowserSupportCache, type UseSpeechToTextOptions } from './use-speech-to-text';

/* ------------------------------------------------------------------ */
/*                    MediaRecorder Mock                              */
/* ------------------------------------------------------------------ */

/** Minimal MediaRecorder mock that simulates the recording lifecycle */
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  static isTypeSupported(type: string): boolean {
    return type === 'audio/webm;codecs=opus' || type === 'audio/webm';
  }

  constructor(
    public stream: MediaStream,
    public options?: { mimeType?: string },
  ) {}

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    // Simulate data available then stop
    this.ondataavailable?.({ data: new Blob(['fake-audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

/* ------------------------------------------------------------------ */
/*                    Browser API Mocks Setup                        */
/* ------------------------------------------------------------------ */

const mockGetUserMedia = vi.fn();
const mockTrackStop = vi.fn();

function createMockStream(): MediaStream {
  return {
    getTracks: () => [{ stop: mockTrackStop }],
  } as unknown as MediaStream;
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetBrowserSupportCache();

  // Set up browser API mocks
  Object.defineProperty(global, 'MediaRecorder', {
    value: MockMediaRecorder,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });

  // Default: getUserMedia resolves with a mock stream
  mockGetUserMedia.mockResolvedValue(createMockStream());

  // Default: fetch resolves with transcribed text
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ text: 'hello world' }),
  });
});

/* ------------------------------------------------------------------ */
/*                    Helper                                          */
/* ------------------------------------------------------------------ */

function defaultOptions(overrides?: Partial<UseSpeechToTextOptions>): UseSpeechToTextOptions {
  return {
    language: 'en',
    onTranscription: vi.fn(),
    onEmptyTranscription: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*                    Tests                                            */
/* ------------------------------------------------------------------ */

describe('useSpeechToText', () => {
  describe('feature detection', () => {
    it('returns isSupported=true when MediaRecorder and getUserMedia are available', () => {
      const { result } = renderHook(() => useSpeechToText(defaultOptions()));
      expect(result.current.isSupported).toBe(true);
    });

    it('returns isSupported=false when MediaRecorder is undefined', () => {
      Object.defineProperty(global, 'MediaRecorder', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useSpeechToText(defaultOptions()));
      expect(result.current.isSupported).toBe(false);
    });

    it('returns isSupported=false when getUserMedia is unavailable', () => {
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useSpeechToText(defaultOptions()));
      expect(result.current.isSupported).toBe(false);
    });
  });

  describe('recording lifecycle', () => {
    it('transitions from idle to recording when startRecording is called', async () => {
      const { result } = renderHook(() => useSpeechToText(defaultOptions()));
      expect(result.current.recordingState).toBe('idle');

      await act(async () => {
        result.current.startRecording('q1');
      });

      expect(result.current.recordingState).toBe('recording');
      expect(result.current.activeTextareaId).toBe('q1');
    });

    it('transitions from recording to processing when stopRecording is called', async () => {
      const opts = defaultOptions();
      const { result } = renderHook(() => useSpeechToText(opts));

      // Start recording
      await act(async () => {
        result.current.startRecording('q1');
      });

      // Stop recording — should transition to processing then idle
      await act(async () => {
        result.current.stopRecording();
      });

      // After fetch resolves, should be back to idle
      await waitFor(() => {
        expect(result.current.recordingState).toBe('idle');
      });
    });

    it('calls onTranscription with textarea ID and text on success', async () => {
      const onTranscription = vi.fn();
      const opts = defaultOptions({ onTranscription });
      const { result } = renderHook(() => useSpeechToText(opts));

      await act(async () => {
        result.current.startRecording('q2');
      });

      await act(async () => {
        result.current.stopRecording();
      });

      await waitFor(() => {
        expect(onTranscription).toHaveBeenCalledWith('q2', 'hello world');
      });
    });

    it('calls onEmptyTranscription when server returns empty text', async () => {
      const onEmptyTranscription = vi.fn();
      const onTranscription = vi.fn();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: '' }),
      });

      const opts = defaultOptions({ onTranscription, onEmptyTranscription });
      const { result } = renderHook(() => useSpeechToText(opts));

      await act(async () => {
        result.current.startRecording('q1');
      });
      await act(async () => {
        result.current.stopRecording();
      });

      await waitFor(() => {
        expect(onEmptyTranscription).toHaveBeenCalled();
        expect(onTranscription).not.toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    it('sets error and calls onError when mic permission is denied', async () => {
      const onError = vi.fn();
      mockGetUserMedia.mockRejectedValue(
        new DOMException('Permission denied', 'NotAllowedError'),
      );

      const { result } = renderHook(() => useSpeechToText(defaultOptions({ onError })));

      await act(async () => {
        result.current.startRecording('q1');
      });

      expect(result.current.error).toMatch(/denied/i);
      expect(result.current.recordingState).toBe('idle');
      expect(onError).toHaveBeenCalledWith(expect.stringMatching(/denied/i));
    });

    it('sets error when microphone is not found', async () => {
      const onError = vi.fn();
      mockGetUserMedia.mockRejectedValue(
        new DOMException('No device', 'NotFoundError'),
      );

      const { result } = renderHook(() => useSpeechToText(defaultOptions({ onError })));

      await act(async () => {
        result.current.startRecording('q1');
      });

      expect(result.current.error).toMatch(/no microphone/i);
      expect(onError).toHaveBeenCalled();
    });

    it('calls onError when server returns an error', async () => {
      const onError = vi.fn();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Groq API failed' }),
      });

      const { result } = renderHook(() => useSpeechToText(defaultOptions({ onError })));

      await act(async () => {
        result.current.startRecording('q1');
      });
      await act(async () => {
        result.current.stopRecording();
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Groq API failed/));
        expect(result.current.recordingState).toBe('idle');
      });
    });

    it('calls onError when fetch throws a network error', async () => {
      const onError = vi.fn();
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useSpeechToText(defaultOptions({ onError })));

      await act(async () => {
        result.current.startRecording('q1');
      });
      await act(async () => {
        result.current.stopRecording();
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Network error');
        expect(result.current.recordingState).toBe('idle');
      });
    });
  });

  describe('auto-stop', () => {
    it('auto-stops recording after 120 seconds', async () => {
      vi.useFakeTimers();

      const onTranscription = vi.fn();
      const { result } = renderHook(() => useSpeechToText(defaultOptions({ onTranscription })));

      await act(async () => {
        result.current.startRecording('q1');
      });

      expect(result.current.recordingState).toBe('recording');

      // Advance past the 120 second auto-stop and flush microtasks
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_001);
      });

      // Should have triggered stop → processing → idle
      expect(result.current.recordingState).toBe('idle');

      vi.useRealTimers();
    });
  });

  describe('cleanup', () => {
    it('stops recording and releases stream on unmount', async () => {
      const { result, unmount } = renderHook(() => useSpeechToText(defaultOptions()));

      await act(async () => {
        result.current.startRecording('q1');
      });

      expect(result.current.recordingState).toBe('recording');

      // Unmount should trigger cleanup
      unmount();

      // The mock track.stop should have been called (stream released)
      expect(mockTrackStop).toHaveBeenCalled();
    });
  });

  describe('clears error on new recording', () => {
    it('clears previous error when starting a new recording', async () => {
      const onError = vi.fn();
      mockGetUserMedia
        .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
        .mockResolvedValueOnce(createMockStream());

      const { result } = renderHook(() => useSpeechToText(defaultOptions({ onError })));

      // First attempt fails
      await act(async () => {
        result.current.startRecording('q1');
      });
      expect(result.current.error).toBeTruthy();

      // Second attempt clears error
      await act(async () => {
        result.current.startRecording('q1');
      });
      expect(result.current.error).toBeNull();
    });
  });
});

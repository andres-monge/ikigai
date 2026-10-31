// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetBrowserSupportCache } from '@/hooks/use-speech-to-text';
import { SinglePageQuestionnaire } from './single-page-questionnaire';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

vi.mock('wouter', () => ({ useLocation: () => ['/', vi.fn()] }));
vi.mock('@/hooks/use-create-assessment', () => ({
  useCreateAssessment: () => ({ createAssessment: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-session-storage', () => ({
  useSessionStorage: () => [null, vi.fn()],
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/use-sound-effect', () => ({ useSoundEffect: () => ({ play: vi.fn() }) }));
vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ trackEvent: vi.fn() }) }));

class MockMediaRecorder {
  static isTypeSupported(type: string) {
    return type === 'audio/webm;codecs=opus' || type === 'audio/webm';
  }

  state: RecordingState = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    public stream: MediaStream,
    public options?: MediaRecorderOptions,
  ) {}

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['legacy-audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

describe('SinglePageQuestionnaire speech-to-text defaults', () => {
  beforeEach(() => {
    _resetBrowserSupportCache();
    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: MockMediaRecorder,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      configurable: true,
      writable: true,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'texto dictado' }),
    }));
  });

  afterEach(() => {
    cleanup();
    _resetBrowserSupportCache();
    vi.unstubAllGlobals();
  });

  it('keeps the legacy language endpoint, Start/Stop controls, and transcript insertion', async () => {
    render(<SinglePageQuestionnaire language="es" sessionId="legacy-session" />);

    const startButtons = screen.getAllByRole('button', { name: 'Habla tu respuesta' });
    fireEvent.click(startButtons[0]);

    expect(await screen.findByRole('button', { name: 'Dejar de grabar' })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dejar de grabar' }));
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/transcribe?language=es',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'audio/webm;codecs=opus' },
        }),
      );
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(new Headers(request?.headers).has('X-Nami-Request')).toBe(false);
    expect((screen.getAllByRole('textbox')[0] as HTMLTextAreaElement).value).toBe('texto dictado');
    expect(screen.getAllByRole('button', { name: 'Habla tu respuesta' })).toHaveLength(8);
  });

  it('finishes and inserts speech before switching to a second microphone target', async () => {
    render(<SinglePageQuestionnaire language="es" sessionId="legacy-session" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Habla tu respuesta' })[0]);
    expect(await screen.findByRole('button', { name: 'Dejar de grabar' })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Habla tu respuesta' })[0]);
    });

    await waitFor(() => {
      expect((screen.getAllByRole('textbox')[0] as HTMLTextAreaElement).value)
        .toBe('texto dictado');
    });
    expect(await screen.findByRole('button', { name: 'Dejar de grabar' })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dejar de grabar' }));
    });
    await waitFor(() => {
      expect((screen.getAllByRole('textbox')[1] as HTMLTextAreaElement).value)
        .toBe('texto dictado');
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps submit enabled during a pending legacy permission prompt and cleans a late grant', async () => {
    const permission = deferred<MediaStream>();
    const stop = vi.fn();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(permission.promise);
    const { unmount } = render(
      <SinglePageQuestionnaire language="es" sessionId="legacy-session" />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Habla tu respuesta' })[0]);
    expect((screen.getByTestId('questionnaire-submit') as HTMLButtonElement).disabled).toBe(false);

    unmount();
    await act(async () => {
      permission.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
});

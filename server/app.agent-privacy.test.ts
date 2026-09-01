import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiRequestLogger, createApp } from './app.js';

const { transcribeProtectedAudio } = vi.hoisted(() => {
  // The production provider factory is created during module evaluation; keep
  // this worker deterministic without relying on a developer's ambient key.
  process.env.GROQ_API_KEY = 'test-protected-audio-key';
  return { transcribeProtectedAudio: vi.fn() };
});

vi.mock('ai', async (importOriginal) => {
  const original = await importOriginal<typeof import('ai')>();
  return { ...original, experimental_transcribe: transcribeProtectedAudio };
});

vi.mock('./auth-middleware.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./auth-middleware.js')>();
  const requireAuth: RequestHandler = (_request, response, next) => {
    response.locals.auth = Object.freeze({
      userId: 'opaque-parser-test-user',
      email: 'parser-test@example.com',
      name: 'Parser Test',
      image: null,
    });
    next();
  };

  return { ...original, requireAuth };
});

afterEach(() => {
  transcribeProtectedAudio.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('protected Method logger boundary', () => {
  it('never captures protected response bodies while preserving the legacy logger behavior', async () => {
    const writeLog = vi.fn();
    const app = express();
    app.use(createApiRequestLogger(writeLog));
    app.get('/api/agent/history', (_request, response) => response.json({
      messages: ['PRIVATE_HISTORY_SENTINEL'],
      briefing: 'PRIVATE_BRIEFING_SENTINEL',
      providerBody: 'PRIVATE_PROVIDER_SENTINEL',
    }));
    app.get('/api/legacy-probe', (_request, response) => response.json({ legacy: 'visible-prefix' }));

    const protectedResponse = await request(app).get('/api/agent/history');
    expect(protectedResponse.status).toBe(200);
    expect(writeLog).not.toHaveBeenCalled();

    const legacyResponse = await request(app).get('/api/legacy-probe');
    expect(legacyResponse.status).toBe(200);
    expect(writeLog).toHaveBeenCalledOnce();
    expect(writeLog.mock.calls[0]?.[0]).toContain('visible-prefix');
    expect(JSON.stringify(writeLog.mock.calls)).not.toMatch(/PRIVATE_HISTORY|PRIVATE_BRIEFING|PRIVATE_PROVIDER/);
  });
});

describe('protected Method parser error boundary', () => {
  const cases = [
    {
      label: 'malformed JSON request',
      route: '/api/agent',
      routeLabel: 'agent-turn',
      status: 400,
      errorClass: 'SyntaxError',
      sentinel: 'PRIVATE_MALFORMED_JSON_SENTINEL',
      send: (app: ReturnType<typeof createApp>, sentinel: string) => request(app)
        .post('/api/agent')
        .set('content-type', 'application/json')
        .send(`{"id":"message","message":"${sentinel}`),
    },
    {
      label: 'oversized JSON request',
      route: '/api/agent',
      routeLabel: 'agent-turn',
      status: 413,
      errorClass: 'PayloadTooLargeError',
      sentinel: 'PRIVATE_OVERSIZED_JSON_SENTINEL',
      send: (app: ReturnType<typeof createApp>, sentinel: string) => request(app)
        .post('/api/agent')
        .set('content-type', 'application/json')
        .send({ id: 'message', message: sentinel.repeat(16_384) }),
    },
    {
      label: 'oversized audio request',
      route: '/api/agent/audio/transcribe',
      routeLabel: 'audio-transcription',
      status: 413,
      errorClass: 'PayloadTooLargeError',
      sentinel: 'PRIVATE_OVERSIZED_AUDIO_SENTINEL',
      send: (app: ReturnType<typeof createApp>, sentinel: string) => request(app)
        .post('/api/agent/audio/transcribe')
        .set('content-type', 'audio/webm')
        .send(Buffer.concat([Buffer.from(sentinel), Buffer.alloc(2 * 1024 * 1024 + 1)])),
    },
    {
      label: 'malformed JSON request on an attacker-controlled Method path',
      route: '/api/agent/PRIVATE_PARSER_PATH_SENTINEL',
      routeLabel: 'method-unmatched',
      status: 400,
      errorClass: 'SyntaxError',
      sentinel: 'PRIVATE_PARSER_PATH_SENTINEL',
      send: (app: ReturnType<typeof createApp>, sentinel: string) => request(app)
        .post(`/api/agent/${sentinel}`)
        .set('content-type', 'application/json')
        .send(`{"id":"message","message":"${sentinel}`),
    },
  ] as const;

  it.each(cases)('returns payload-free metadata for a $label', async ({
    route,
    routeLabel,
    status,
    errorClass,
    sentinel,
    send,
  }) => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await send(createApp(), sentinel);

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: 'Agent request failed', errorClass });
    expect(consoleError).toHaveBeenCalledWith(
      'Protected Method request failed',
      expect.objectContaining({
        requestId: expect.any(String),
        route: routeLabel,
        status,
        errorClass,
      }),
    );
    expect(JSON.stringify([response.body, consoleLog.mock.calls, consoleError.mock.calls]))
      .not.toContain(sentinel);
  });
});

describe('protected Method audio provider boundary', () => {
  it('forwards bounded audio, language, and the request abort signal without logging payloads', async () => {
    const audioSentinel = 'PRIVATE_BOUNDED_AUDIO_SENTINEL';
    const transcriptSentinel = 'PRIVATE_AUDIO_TRANSCRIPT_SENTINEL';
    const audio = Buffer.from(audioSentinel);
    vi.stubEnv('AGENT_ENABLED', 'true');
    transcribeProtectedAudio.mockResolvedValueOnce({ text: transcriptSentinel });
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(createApp())
      .post('/api/agent/audio/transcribe?language=es')
      .set('content-type', 'audio/webm')
      .send(audio);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ text: transcriptSentinel });
    expect(transcribeProtectedAudio).toHaveBeenCalledOnce();
    const providerRequest = transcribeProtectedAudio.mock.calls[0]?.[0];
    expect(providerRequest).toEqual(expect.objectContaining({
      audio: expect.any(Buffer),
      abortSignal: expect.any(AbortSignal),
      providerOptions: { groq: { language: 'es' } },
    }));
    expect(providerRequest.audio).toEqual(audio);
    expect(providerRequest.audio.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(providerRequest.abortSignal.aborted).toBe(false);
    expect(JSON.stringify([consoleLog.mock.calls, consoleError.mock.calls]))
      .not.toMatch(/PRIVATE_BOUNDED_AUDIO|PRIVATE_AUDIO_TRANSCRIPT/);
  });

  it('aborts the default transcription call when the protected audio request disconnects', async () => {
    vi.stubEnv('AGENT_ENABLED', 'true');
    let providerStarted!: () => void;
    const providerStartedGate = new Promise<void>((resolve) => { providerStarted = resolve; });
    let providerSignal: AbortSignal | undefined;
    transcribeProtectedAudio.mockImplementationOnce((input: { abortSignal?: AbortSignal }) => {
      providerSignal = input.abortSignal;
      providerStarted();
      return new Promise((_resolve, reject) => {
        const stop = () => reject(
          input.abortSignal?.reason ?? new DOMException('Audio request aborted.', 'AbortError'),
        );
        if (input.abortSignal?.aborted) stop();
        else input.abortSignal?.addEventListener('abort', stop, { once: true });
      });
    });
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createApp();
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP test server.');
      const controller = new AbortController();
      const requestPromise = fetch(`http://127.0.0.1:${address.port}/api/agent/audio/transcribe?language=es`, {
        method: 'POST',
        headers: { 'content-type': 'audio/webm' },
        body: Buffer.from('PRIVATE_ABORTED_AUDIO_SENTINEL'),
        signal: controller.signal,
      }).catch(() => undefined);
      await providerStartedGate;
      controller.abort(new DOMException('Client disconnected.', 'AbortError'));
      await requestPromise;
      await vi.waitFor(() => expect(providerSignal?.aborted).toBe(true));

      expect(transcribeProtectedAudio).toHaveBeenCalledOnce();
      expect(JSON.stringify([consoleLog.mock.calls, consoleError.mock.calls]))
        .not.toContain('PRIVATE_ABORTED_AUDIO_SENTINEL');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

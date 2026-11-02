import express, { type RequestHandler } from 'express';
import request from './test-fixtures/loopback-http.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCareerMap } from '../shared/career-map/index.js';
import { createApiRequestLogger, createApp } from './app.js';
import { normalizeMethodRequestPath } from './routes/agent-logging.js';
import { storage as defaultStorage } from './storage-instance.js';
import { env } from './env.js';

const { transcribeProtectedAudio } = vi.hoisted(() => {
  // The production provider factory is created during module evaluation; keep
  // this worker deterministic without relying on a developer's ambient key.
  process.env.OPENAI_API_KEY = 'test-protected-audio-key';
  process.env.BETTER_AUTH_URL = 'https://nami.test';
  return { transcribeProtectedAudio: vi.fn() };
});

vi.mock('./ai/transcription.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./ai/transcription.js')>();
  return { ...original, transcribeOpenAIAudio: transcribeProtectedAudio };
});

const METHOD_ORIGIN = 'https://nami.test';
const WEBM_HEADER = Buffer.from('1a45dfa39f4286810142f7810142f2810442f381084282847765626d4287810442858102', 'hex');

function protectedAudio(client: Awaited<ReturnType<typeof request>>) {
  return client
    .post('/api/agent/audio/transcribe')
    .set('Origin', METHOD_ORIGIN)
    .set('X-Nami-Request', '1')
    .set('Content-Type', 'audio/webm');
}

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
  it('normalizes only nested Method mount aliases and rejects lookalike prefixes', () => {
    expect(normalizeMethodRequestPath('/api//AGENT/Workspace/')).toBe('/workspace');
    expect(normalizeMethodRequestPath('/api//agentish/workspace')).toBeUndefined();
    expect(normalizeMethodRequestPath('/api/agentish/workspace')).toBeUndefined();
  });

  it('keeps all API response bodies out of logs and leaves Method to its own logger', async () => {
    const writeLog = vi.fn();
    const app = express();
    app.use(createApiRequestLogger(writeLog));
    app.get('/api/agent/history', (_request, response) => response.json({
      messages: ['PRIVATE_HISTORY_SENTINEL'],
      briefing: 'PRIVATE_BRIEFING_SENTINEL',
      providerBody: 'PRIVATE_PROVIDER_SENTINEL',
    }));
    app.get('/api/legacy-probe', (_request, response) => response.json({ legacy: 'visible-prefix' }));

    const protectedResponse = await (await request(app)).get('/api/agent/history');
    expect(protectedResponse.status).toBe(200);
    expect(writeLog).not.toHaveBeenCalled();

    const legacyResponse = await (await request(app)).get('/api/legacy-probe');
    expect(legacyResponse.status).toBe(200);
    expect(writeLog).toHaveBeenCalledOnce();
    expect(writeLog.mock.calls[0]?.[0]).toContain('api_request');
    expect(writeLog.mock.calls[0]?.[0]).not.toContain('visible-prefix');
    expect(JSON.stringify(writeLog.mock.calls)).not.toMatch(/PRIVATE_HISTORY|PRIVATE_BRIEFING|PRIVATE_PROVIDER/);
  });

  it('keeps an actual mixed-case trailing-slash workspace response out of the legacy body logger', async () => {
    const mapSentinel = 'PRIVATE_MIXED_CASE_MAP_SENTINEL';
    const map = createCareerMap(mapSentinel);
    vi.spyOn(defaultStorage, 'loadCareerMap').mockResolvedValueOnce({ status: 'ready', map });
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await (await request(createApp())).get('/api/AGENT/Workspace/');

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain(mapSentinel);
    expect(JSON.stringify(consoleLog.mock.calls)).toContain('workspace-read');
    expect(JSON.stringify([consoleLog.mock.calls, consoleError.mock.calls])).not.toContain(mapSentinel);
    expect(JSON.stringify(consoleLog.mock.calls)).not.toContain('/api/AGENT/Workspace/');
  });

  it('keeps the nested-mount double-separator workspace alias out of the legacy body logger', async () => {
    const mapSentinel = 'PRIVATE_DOUBLE_SEPARATOR_MAP_SENTINEL';
    const map = createCareerMap(mapSentinel);
    vi.spyOn(defaultStorage, 'loadCareerMap').mockResolvedValueOnce({ status: 'ready', map });
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await (await request(createApp())).get('/api//agent/workspace');

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain(mapSentinel);
    expect(JSON.stringify(consoleLog.mock.calls)).toContain('workspace-read');
    expect(JSON.stringify([consoleLog.mock.calls, consoleError.mock.calls])).not.toContain(mapSentinel);
    expect(JSON.stringify(consoleLog.mock.calls)).not.toContain('/api//agent/workspace');
  });
});

describe('protected Method parser error boundary', () => {
  it('keeps non-Method parser payloads and URL tokens out of errors and metadata logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await (await request(createApp()))
      .post('/api/PRIVATE_PATH_SENTINEL?token=PRIVATE_TOKEN_SENTINEL')
      .set('Content-Type', 'application/json')
      .send('{"answer":"PRIVATE_BODY_SENTINEL');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Request failed' });
    expect(error).toHaveBeenCalledWith('API request failed', {
      requestId: response.headers['x-request-id'], errorClass: 'SyntaxError',
    });
    expect(JSON.stringify([response.body, log.mock.calls, error.mock.calls])).not.toContain('PRIVATE_');
  });

  const cases = [
    {
      label: 'malformed JSON request',
      route: '/api/agent',
      routeLabel: 'agent-turn',
      status: 400,
      errorClass: 'SyntaxError',
      sentinel: 'PRIVATE_MALFORMED_JSON_SENTINEL',
      send: async (app: ReturnType<typeof createApp>, sentinel: string) => (await request(app))
        .post('/api/agent')
        .set('Origin', METHOD_ORIGIN).set('X-Nami-Request', '1')
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
      send: async (app: ReturnType<typeof createApp>, sentinel: string) => (await request(app))
        .post('/api/agent')
        .set('Origin', METHOD_ORIGIN).set('X-Nami-Request', '1')
        .set('content-type', 'application/json')
        .send({ id: 'message', message: sentinel.repeat(164_000) }),
    },
    {
      label: 'oversized audio request',
      route: '/api/agent/audio/transcribe',
      routeLabel: 'audio-transcription',
      status: 413,
      errorClass: 'PayloadTooLargeError',
      sentinel: 'PRIVATE_OVERSIZED_AUDIO_SENTINEL',
      send: async (app: ReturnType<typeof createApp>, sentinel: string) => (await request(app))
        .post('/api/agent/audio/transcribe')
        .set('Origin', METHOD_ORIGIN)
        .set('X-Nami-Request', '1')
        .set('content-type', 'audio/webm')
        .send(Buffer.concat([WEBM_HEADER, Buffer.from(sentinel), Buffer.alloc(11 * 1024 * 1024 + 1)])),
    },
    {
      label: 'malformed JSON request on an attacker-controlled Method path',
      route: '/api/agent/PRIVATE_PARSER_PATH_SENTINEL',
      routeLabel: 'method-unmatched',
      status: 400,
      errorClass: 'SyntaxError',
      sentinel: 'PRIVATE_PARSER_PATH_SENTINEL',
      send: async (app: ReturnType<typeof createApp>, sentinel: string) => (await request(app))
        .post(`/api/agent/${sentinel}`)
        .set('content-type', 'application/json')
        .send(`{"id":"message","message":"${sentinel}`),
    },
    {
      label: 'mixed-case trailing-slash malformed Method request',
      route: '/api/AGENT/',
      routeLabel: 'agent-turn',
      status: 400,
      errorClass: 'SyntaxError',
      sentinel: 'PRIVATE_MIXED_CASE_PARSER_SENTINEL',
      send: async (app: ReturnType<typeof createApp>, sentinel: string) => (await request(app))
        .post('/api/AGENT/')
        .set('Origin', METHOD_ORIGIN).set('X-Nami-Request', '1')
        .set('content-type', 'application/json')
        .send(`{"id":"message","message":"${sentinel}`),
    },
    {
      label: 'nested-mount double-separator malformed Method request',
      route: '/api//agent/PRIVATE_DOUBLE_SEPARATOR_PARSER_SENTINEL',
      routeLabel: 'method-unmatched',
      status: 400,
      errorClass: 'SyntaxError',
      sentinel: 'PRIVATE_DOUBLE_SEPARATOR_PARSER_SENTINEL',
      send: async (app: ReturnType<typeof createApp>, sentinel: string) => (await request(app))
        .post(`/api//agent/${sentinel}`)
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
    vi.stubEnv('AGENT_ENABLED', 'true');
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await send(createApp(), sentinel);

    expect(response.status).toBe(status);
    expect(transcribeProtectedAudio).not.toHaveBeenCalled();
    expect(response.body).toEqual({ error: status === 413 && routeLabel === 'agent-turn' ? 'Message too large. Remove or replace a file, or send separately (3 MB total per message).' : 'Agent request failed', errorClass });
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
  it('uses the configured Vercel origin before parsing audio', async () => {
    const originalOrigin = env.BETTER_AUTH_URL;
    vi.stubEnv('VERCEL', '1');
    try {
      for (const value of ['', 'not-a-url', 'http://localhost:5173']) {
        env.BETTER_AUTH_URL = value;
        const response = await protectedAudio(await request(createApp())).send(WEBM_HEADER);
        expect(response.status).toBe(403);
      }

      env.BETTER_AUTH_URL = METHOD_ORIGIN;
      const app = createApp();
      const crossOrigin = await (await request(app))
        .post('/api/agent/audio/transcribe')
        .set('Origin', 'https://other.example')
        .set('X-Nami-Request', '1')
        .set('Content-Type', 'audio/webm')
        .send(WEBM_HEADER);
      const matchingOrigin = await (await request(app))
        .post('/api/agent/audio/transcribe')
        .set('Origin', METHOD_ORIGIN)
        .set('X-Nami-Request', '1')
        .set('Content-Type', 'application/json')
        .send('{}');
      expect(crossOrigin.status).toBe(403);
      expect(matchingOrigin.status).toBe(400);
      expect(transcribeProtectedAudio).not.toHaveBeenCalled();
    } finally {
      env.BETTER_AUTH_URL = originalOrigin;
    }
  });

  it('rejects invalid metadata before parsers and protected request logging', async () => {
    vi.stubEnv('AGENT_ENABLED', 'true');
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createApp();

    const crossOrigin = await (await request(app))
      .post('/api/agent/audio/transcribe')
      .set('Origin', 'https://attacker.example')
      .set('X-Nami-Request', '1')
      .set('Content-Type', 'audio/webm')
      .send(Buffer.concat([WEBM_HEADER, Buffer.from('PRIVATE_EARLY_REJECT_SENTINEL')]));
    const unsupported = await (await request(app))
      .post('/api/agent/audio/transcribe')
      .set('Origin', METHOD_ORIGIN)
      .set('X-Nami-Request', '1')
      .set('Content-Type', 'application/json')
      .send('{"PRIVATE_PREPARSER_SENTINEL":');
    const preflight = await (await request(app))
      .options('/api/agent/audio/transcribe')
      .set('Origin', METHOD_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(crossOrigin.status).toBe(403);
    expect(unsupported.status).toBe(400);
    expect(preflight.status).toBe(405);
    expect(transcribeProtectedAudio).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'malformed',
      body: '{"PRIVATE_DOUBLE_SEPARATOR_MALFORMED_SENTINEL":',
    },
    {
      label: 'oversized',
      body: JSON.stringify({
        value: 'PRIVATE_DOUBLE_SEPARATOR_OVERSIZED_SENTINEL'.repeat(16_384),
      }),
    },
  ])('guards repeated-slash $label JSON before the global parser', async ({ body }) => {
    vi.stubEnv('AGENT_ENABLED', 'true');
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await (await request(createApp()))
      .post('/api//agent/audio/transcribe')
      .set('Origin', METHOD_ORIGIN)
      .set('X-Nami-Request', '1')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Method audio requires WebM or MP4' });
    expect(transcribeProtectedAudio).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('forwards bounded audio, media type, and the request abort signal without logging payloads', async () => {
    const audioSentinel = 'PRIVATE_BOUNDED_AUDIO_SENTINEL';
    const transcriptSentinel = 'PRIVATE_AUDIO_TRANSCRIPT_SENTINEL';
    const audio = Buffer.concat([WEBM_HEADER, Buffer.from(audioSentinel)]);
    vi.stubEnv('AGENT_ENABLED', 'true');
    transcribeProtectedAudio.mockResolvedValueOnce(transcriptSentinel);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await protectedAudio(await request(createApp())).send(audio);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ text: transcriptSentinel });
    expect(transcribeProtectedAudio).toHaveBeenCalledOnce();
    const providerRequest = transcribeProtectedAudio.mock.calls[0]?.[0];
    expect(providerRequest).toEqual(expect.objectContaining({
      audio: expect.any(Buffer),
      mediaType: 'audio/webm',
      abortSignal: expect.any(AbortSignal),
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
      const requestPromise = fetch(`http://127.0.0.1:${address.port}/api/agent/audio/transcribe`, {
        method: 'POST',
        headers: {
          'content-type': 'audio/webm',
          origin: METHOD_ORIGIN,
          'x-nami-request': '1',
        },
        body: Buffer.concat([WEBM_HEADER, Buffer.from('PRIVATE_ABORTED_AUDIO_SENTINEL')]),
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

describe('attachment-sized protected JSON', () => {
  it('admits a valid body above the global parser limit only at agent submission', async () => {
    vi.stubEnv('AGENT_ENABLED', 'true');
    const read = vi.spyOn(defaultStorage, 'getOrCreateCareerMap').mockResolvedValue({ status: 'repair-required', map: null } as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const data = Buffer.alloc(140_000); data.write('%PDF-');
    const response = await (await request(createApp())).post('/api/agent')
      .set('Origin', METHOD_ORIGIN).set('X-Nami-Request', '1')
      .send({ id: 'attachment-body-message', message: '', attachments: [{ name: 'PRIVATE_FILE.pdf', mediaType: 'application/pdf', data: data.toString('base64') }] });
    expect(response.status).toBe(409);
    expect(read).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_FILE');
  });
  it('rejects oversized transport with actionable private errors', async () => {
    vi.stubEnv('AGENT_ENABLED', 'true');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await (await request(createApp())).post('/api/agent')
      .set('Origin', METHOD_ORIGIN).set('X-Nami-Request', '1')
      .send({ id: 'large-message', message: 'PRIVATE_FILE' + 'a'.repeat(4_250_000) });
    expect(response.status).toBe(413);
    expect(response.body.error).toMatch(/Remove or replace/);
    expect(JSON.stringify([response.body, log.mock.calls, error.mock.calls])).not.toContain('PRIVATE_FILE');
  });
});

import request from './test-fixtures/loopback-http.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class AuthConfigurationError extends Error {}
  return {
    AuthConfigurationError,
    getAuth: vi.fn(),
    nodeHandler: vi.fn(),
    toNodeHandler: vi.fn(),
  };
});

vi.mock('./env.js', () => ({
  env: { NODE_ENV: 'test' },
}));

vi.mock('./auth.js', () => ({
  AuthConfigurationError: mocks.AuthConfigurationError,
  getAuth: mocks.getAuth,
  INTERNAL_CLIENT_IP_HEADER: 'x-nami-client-ip',
  resolveTrustedClientIp: () => '127.0.0.1',
}));

vi.mock('better-auth/node', () => ({
  toNodeHandler: mocks.toNodeHandler,
}));

vi.mock('./routes.js', () => ({
  registerRoutes: (app: import('express').Express) => {
    app.get('/api/legacy-probe', (_request, response) => {
      response.json({ anonymous: true });
    });
    app.post('/api/parsed-body-probe', (incoming, response) => {
      response.json({ body: incoming.body });
    });
  },
}));

vi.mock('./routes/agent.js', () => ({
  createAudioTranscriptionMetadataGuard: () => (
    _request: import('express').Request,
    _response: import('express').Response,
    next: import('express').NextFunction,
  ) => next(),
}));

import { createApp } from './app.js';

describe('Express auth integration', () => {
  beforeEach(() => {
    mocks.getAuth.mockReset();
    mocks.nodeHandler.mockReset();
    mocks.toNodeHandler.mockReset();
    mocks.getAuth.mockReturnValue({ handler: vi.fn() });
    mocks.toNodeHandler.mockReturnValue(mocks.nodeHandler);
  });

  it.each([
    ['application/json', '{"provider":"google"}'],
    ['application/x-www-form-urlencoded', 'provider=google&callbackURL=%2F'],
    ['application/json', '{"provider":'],
  ])('passes an unconsumed %s request stream to Better Auth (%s)', async (contentType, payload) => {
    mocks.nodeHandler.mockImplementation((incoming, response) => {
      let body = '';
      incoming.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      incoming.on('end', () => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ body, clientIp: incoming.headers['x-nami-client-ip'] }));
      });
    });

    const response = await (await request(createApp()))
      .post('/api/auth/sign-in/social')
      .set('content-type', contentType)
      .set('x-nami-client-ip', '198.51.100.8')
      .set('x-revelio-client-ip', '203.0.113.9')
      .send(payload)
      .timeout({ response: 1_000, deadline: 2_000 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ body: payload, clientIp: '127.0.0.1' });
  });

  it.each([
    ['application/json', '{"provider":"google"}'],
    ['application/x-www-form-urlencoded', 'provider=google'],
  ])('still parses %s on ordinary non-auth routes', async (contentType, payload) => {
    const response = await (await request(createApp()))
      .post('/api/parsed-body-probe')
      .set('content-type', contentType)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ body: { provider: 'google' } });
    expect(mocks.nodeHandler).not.toHaveBeenCalled();
  });

  it('fails auth closed without taking down anonymous legacy APIs', async () => {
    mocks.getAuth.mockImplementation(() => {
      throw new mocks.AuthConfigurationError();
    });

    const app = createApp();
    const [authResponse, legacyResponse] = await Promise.all([
      (await request(app)).get('/api/auth/get-session'),
      (await request(app)).get('/api/legacy-probe'),
    ]);

    expect(authResponse.status).toBe(503);
    expect(authResponse.body).toEqual({ error: 'Authentication is unavailable' });
    expect(legacyResponse.status).toBe(200);
    expect(legacyResponse.body).toEqual({ anonymous: true });
  });

  it('caches the Better Auth node handler for the app instance', async () => {
    mocks.nodeHandler.mockImplementation((_incoming, response) => {
      response.statusCode = 204;
      response.end();
    });

    const app = createApp();
    const [first, second] = await Promise.all([
      (await request(app)).get('/api/auth/get-session'),
      (await request(app)).get('/api/auth/get-session'),
    ]);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(mocks.getAuth).toHaveBeenCalledTimes(1);
    expect(mocks.toNodeHandler).toHaveBeenCalledTimes(1);
    expect(mocks.nodeHandler).toHaveBeenCalledTimes(2);
  });

  it('sanitizes asynchronous Better Auth failures at the auth boundary', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.nodeHandler.mockRejectedValue(new Error('provider secret leaked in detail'));

    const response = await (await request(createApp())).get('/api/auth/get-session');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Authentication request failed' });
    expect(JSON.stringify(response.body)).not.toContain('provider secret');
    expect(consoleError).toHaveBeenCalledWith('Authentication request failed');
    consoleError.mockRestore();
  });
});

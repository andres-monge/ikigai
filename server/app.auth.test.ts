import request from 'supertest';
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
  INTERNAL_CLIENT_IP_HEADER: 'x-revelio-client-ip',
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
  },
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

  it('mounts the Express v4 auth wildcard before both body parsers', () => {
    const app = createApp();
    const stack = (app as any)._router.stack as Array<any>;
    const authIndex = stack.findIndex((layer) => layer.route?.path === '/api/auth/*');
    const jsonIndex = stack.findIndex((layer) => layer.name === 'jsonParser');
    const urlencodedIndex = stack.findIndex((layer) => layer.name === 'urlencodedParser');

    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBeLessThan(jsonIndex);
    expect(authIndex).toBeLessThan(urlencodedIndex);
  });

  it('passes an unconsumed request stream and a server-overwritten client address to Better Auth', async () => {
    mocks.nodeHandler.mockImplementation((incoming, response) => {
      let body = '';
      incoming.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      incoming.on('end', () => {
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            body,
            clientIp: incoming.headers['x-revelio-client-ip'],
          }),
        );
      });
    });

    const response = await request(createApp())
      .post('/api/auth/sign-in/social')
      .set('x-revelio-client-ip', '198.51.100.8')
      .send({ provider: 'google' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      body: JSON.stringify({ provider: 'google' }),
      clientIp: '127.0.0.1',
    });
  });

  it('fails auth closed without taking down anonymous legacy APIs', async () => {
    mocks.getAuth.mockImplementation(() => {
      throw new mocks.AuthConfigurationError();
    });

    const app = createApp();
    const [authResponse, legacyResponse] = await Promise.all([
      request(app).get('/api/auth/get-session'),
      request(app).get('/api/legacy-probe'),
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
      request(app).get('/api/auth/get-session'),
      request(app).get('/api/auth/get-session'),
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

    const response = await request(createApp()).get('/api/auth/get-session');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Authentication request failed' });
    expect(JSON.stringify(response.body)).not.toContain('provider secret');
    expect(consoleError).toHaveBeenCalledWith('Authentication request failed');
    consoleError.mockRestore();
  });
});

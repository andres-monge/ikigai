import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const { AuthConfigurationError } = vi.hoisted(() => ({
  AuthConfigurationError: class AuthConfigurationError extends Error {},
}));

vi.mock('./auth.js', () => ({
  AuthConfigurationError,
  getAuth: vi.fn(),
}));
import {
  getProtectedIdentity,
  requireAuthWith,
  resolveProtectedIdentity,
} from './auth-middleware.js';

function fakeAuth(session: unknown) {
  return {
    api: {
      getSession: async () => session,
    },
  };
}

describe('server-derived protected identity', () => {
  it('derives the owner only from the Better Auth server session', async () => {
    const identity = await resolveProtectedIdentity(
      { headers: { 'x-user-id': 'spoofed-client-id' } } as never,
      fakeAuth({
        user: {
          id: 'server-user-id',
          email: 'explorer@example.com',
          name: 'Explorer',
          image: null,
        },
        session: { id: 'session-id', token: 'secret-session-token' },
      }) as never,
    );

    expect(identity).toEqual({
      userId: 'server-user-id',
      email: 'explorer@example.com',
      name: 'Explorer',
      image: null,
    });
    expect(identity).not.toHaveProperty('token');
    expect(identity).not.toHaveProperty('providerToken');
  });

  it('returns 401 and no protected payload when the session is absent', async () => {
    const app = express();
    app.get(
      '/protected',
      requireAuthWith(() => fakeAuth(null) as never),
      (_req, res) => res.json({ identity: getProtectedIdentity(res) }),
    );

    const response = await request(app)
      .get('/protected')
      .set('x-user-id', 'spoofed-client-id');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required' });
  });

  it('returns a sanitized 503 when protected auth is not configured', async () => {
    const app = express();
    app.get(
      '/protected',
      requireAuthWith(() => {
        throw new AuthConfigurationError();
      }),
      (_req, res) => res.json({ protected: true }),
    );

    const response = await request(app).get('/protected');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Authentication is unavailable' });
    expect(response.body).not.toHaveProperty('protected');
  });

  it('passes the frozen server identity to a protected handler', async () => {
    const app = express();
    app.get(
      '/protected',
      requireAuthWith(() =>
        fakeAuth({
          user: {
            id: 'server-user-id',
            email: 'explorer@example.com',
            name: 'Explorer',
            image: null,
          },
        }) as never,
      ),
      (_req, res) => {
        const identity = getProtectedIdentity(res);
        res.json({ identity, frozen: Object.isFrozen(identity) });
      },
    );

    const response = await request(app).get('/protected');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      identity: {
        userId: 'server-user-id',
        email: 'explorer@example.com',
        name: 'Explorer',
        image: null,
      },
      frozen: true,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    DATABASE_URL: 'postgresql://test:unused@127.0.0.1/unused',
    BETTER_AUTH_DATABASE_URL: 'postgresql://test:unused@127.0.0.1/auth_test',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:5173',
    AUTH_SIGNUPS_ENABLED: false,
    NODE_ENV: 'test',
  },
  pool: vi.fn(),
  betterAuth: vi.fn((options: unknown) => ({ options })),
}));
vi.mock('./env.js', () => ({ env: mocks.env }));
vi.mock('pg', () => ({ Pool: class { constructor(options: unknown) { mocks.pool(options); } } }));
vi.mock('better-auth', () => ({ betterAuth: mocks.betterAuth }));

describe('lazy auth exact-origin configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.pool.mockClear();
    mocks.betterAuth.mockClear();
  });

  it.each([
    ['test', 'http://localhost:5173'],
    ['development', 'http://localhost:5173'],
    ['production', 'https://revelio-me.vercel.app'],
  ])('initializes %s only at its approved origin', async (nodeEnv, url) => {
    Object.assign(mocks.env, { NODE_ENV: nodeEnv, BETTER_AUTH_URL: url });
    const { getAuth } = await import('./auth.js');
    getAuth();
    expect(mocks.betterAuth).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: url, trustedOrigins: [url],
      advanced: expect.objectContaining({ defaultCookieAttributes: expect.objectContaining({ secure: nodeEnv === 'production' }) }),
    }));
    expect(mocks.pool).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['test', 'http://localhost:5001'],
    ['test', 'http://127.0.0.1:5173'],
    ['test', 'http://localhost:5174'],
    ['production', 'http://localhost:5173'],
    ['production', 'https://other.example.test'],
  ])('rejects an unapproved %s origin before opening a pool', async (nodeEnv, url) => {
    Object.assign(mocks.env, { NODE_ENV: nodeEnv, BETTER_AUTH_URL: url });
    const { getAuth, AuthConfigurationError } = await import('./auth.js');
    expect(getAuth).toThrow(AuthConfigurationError);
    expect(mocks.pool).not.toHaveBeenCalled();
    expect(mocks.betterAuth).not.toHaveBeenCalled();
  });
});

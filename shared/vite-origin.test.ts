import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe('Vite public origin', () => {
  it('requires an explicit origin for a production build outside Vercel', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('BETTER_AUTH_URL', '');
    await expect(import('../vite.config.js')).rejects.toThrow(/BETTER_AUTH_URL origin/);
  });

  it('rejects a localhost origin in a Vercel build', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('BETTER_AUTH_URL', 'https://localhost:5173');
    await expect(import('../vite.config.js')).rejects.toThrow(/BETTER_AUTH_URL origin/);
  });
});

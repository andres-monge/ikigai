import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', async (original) => ({ ...await original(), spawn: mocks.spawn }));
import { createTestEnvironment, runAllTests } from '../scripts/test-all.mjs';

const designatedUrl = 'postgresql://test@127.0.0.1:55432/ikigai_u4_test_admin_launcher';
const authorized = { U4_STORAGE_TEST_DATABASE: '1', U4_STORAGE_TEST_DATABASE_URL: designatedUrl };

describe('full-suite process boundary', () => {
  beforeEach(() => mocks.spawn.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('requires explicit authorization and never falls back to the application URL', () => {
    expect(() => createTestEnvironment({ DATABASE_URL: designatedUrl })).toThrow('U4_STORAGE_TEST_DATABASE=1');
    expect(() => createTestEnvironment({ U4_STORAGE_TEST_DATABASE: '1', DATABASE_URL: designatedUrl })).toThrow('no application database fallback');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it.each([
    'postgresql://test@production.example.test/ikigai_u4_test_admin_launcher',
    'postgresql://test@127.0.0.1:55432/revelio',
    `${designatedUrl}?host=production.example.test`,
  ])('rejects an unsafe target without putting the URL in its error', (url) => {
    expect(() => createTestEnvironment({ ...authorized, U4_STORAGE_TEST_DATABASE_URL: url })).toThrow('explicitly designated disposable database');
    try { createTestEnvironment({ ...authorized, U4_STORAGE_TEST_DATABASE_URL: url }); }
    catch (error) { expect(String(error)).not.toContain(url); }
  });

  it('retains host essentials but replaces app, provider, auth and preload settings', () => {
    const env = createTestEnvironment({
      ...authorized, PATH: '/runtime/bin', HOME: '/test-home', TMPDIR: '/test-temp',
      DATABASE_URL: 'application-secret', BETTER_AUTH_DATABASE_URL: 'auth-secret',
      OPENAI_API_KEY: 'provider-secret', GEMINI_API_KEY: 'provider-secret',
      GOOGLE_CLIENT_SECRET: 'oauth-secret', NODE_OPTIONS: '--require unsafe-preload',
      DOTENV_CONFIG_PATH: '/private/env', ARBITRARY_SECRET: 'private',
    });
    expect(env).toMatchObject({
      PATH: '/runtime/bin', HOME: '/test-home', TMPDIR: '/test-temp', NODE_ENV: 'test',
      U4_STORAGE_TEST_DATABASE: '1', U4_STORAGE_TEST_DATABASE_URL: designatedUrl,
      DATABASE_URL: designatedUrl, OPENAI_API_KEY: '', BETTER_AUTH_DATABASE_URL: '',
      GOOGLE_CLIENT_SECRET: '', AGENT_ENABLED: 'false', AUTH_SIGNUPS_ENABLED: 'false',
    });
    expect(env.GEMINI_API_KEY).toBe('test-key-not-a-credential');
    expect(env).not.toHaveProperty('NODE_OPTIONS');
    expect(env).not.toHaveProperty('DOTENV_CONFIG_PATH');
    expect(env).not.toHaveProperty('ARBITRARY_SECRET');
    expect(JSON.stringify(env)).not.toContain('provider-secret');
  });

  it('forwards arguments to Vitest and returns its nonzero result', async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    mocks.spawn.mockReturnValue(child);
    const completed = runAllTests(['--run', 'server/routes/session.test.ts'], authorized);
    const [command, args, options] = mocks.spawn.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([expect.stringMatching(/node_modules\/vitest\/vitest\.mjs$/), '--run', 'server/routes/session.test.ts']);
    expect(options.env).toEqual(createTestEnvironment(authorized));
    child.emit('close', 7, null);
    await expect(completed).resolves.toEqual({ code: 7, signal: null });
  });

  it('forwards cancellation once and preserves its signal even if Vitest exits cleanly', async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    const handlers = new Map();
    const on = vi.spyOn(process, 'on').mockImplementation((signal, handler) => { handlers.set(signal, handler); return process; });
    const remove = vi.spyOn(process, 'removeListener').mockImplementation(() => process);
    mocks.spawn.mockReturnValue(child);
    const completed = runAllTests(['--run'], authorized);
    handlers.get('SIGTERM')();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('close', 0, null);
    await expect(completed).resolves.toEqual({ code: 0, signal: 'SIGTERM' });
    for (const [signal, handler] of handlers) expect(remove).toHaveBeenCalledWith(signal, handler);
    expect(on).toHaveBeenCalledTimes(3);
  });

  it('reports a child spawn failure and removes signal handlers', async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    const remove = vi.spyOn(process, 'removeListener');
    mocks.spawn.mockReturnValue(child);
    const completed = runAllTests(['--run'], authorized);
    const error = new Error('spawn failed');
    child.emit('error', error);
    await expect(completed).rejects.toBe(error);
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it('the actual CLI exits nonzero before Vitest for an unconfigured run', () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/test-all.mjs', import.meta.url)), '--run'], {
      env: { PATH: process.env.PATH, DATABASE_URL: designatedUrl }, encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('U4_STORAGE_TEST_DATABASE=1');
    expect(result.stderr).not.toContain(designatedUrl);
  });
});

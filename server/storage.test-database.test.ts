import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertDisposableStorageTestUrl } from './storage.test-database-safety.js';

describe('storage integration database safety', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    'postgresql://user:pass@production.example.com/revelio',
    'postgresql://user:pass@127.0.0.1/revelio',
    'postgresql://user:pass@127.0.0.1/postgres',
    'postgresql://postgres@127.0.0.1:55432/ikigai_u4_test_admin_worker?host=production.example.com',
    'postgresql://postgres@127.0.0.1:55432/ikigai_u4_test_admin_worker?dbname=production',
  ])('rejects a non-designated database URL: %s', (connectionString) => {
    expect(() => assertDisposableStorageTestUrl(connectionString)).toThrow(
      'Storage integration tests require an explicitly designated disposable database',
    );
  });

  it('accepts only the designated local admin database namespace', () => {
    expect(assertDisposableStorageTestUrl(
      'postgresql://postgres@127.0.0.1:55432/ikigai_u4_test_admin_worker',
    ).databaseName).toBe('ikigai_u4_test_admin_worker');
  });

  it('keeps the disposable harness separate from the application database URL', () => {
    const source = readFileSync(new URL('./storage.test-database.ts', import.meta.url), 'utf8');
    expect(source).toContain('process.env.U4_STORAGE_TEST_DATABASE_URL');
    expect(source).not.toContain('process.env.DATABASE_URL');
  });

  it('rejects an unsafe database override during application database initialization', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@127.0.0.1/revelio');
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('GEMINI_REASONING_MODEL', 'test-model');
    vi.stubEnv('U4_STORAGE_TEST_DATABASE', '1');
    vi.stubEnv('U4_STORAGE_TEST_DATABASE_URL', 'postgresql://user:pass@127.0.0.1/revelio');
    vi.resetModules();

    await expect(import('./db.js')).rejects.toThrow(
      'Storage integration tests require an explicitly designated disposable database',
    );
  });
});

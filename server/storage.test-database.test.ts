import { describe, expect, it } from 'vitest';
import { assertDisposableStorageTestUrl } from './storage.test-database-safety.js';

describe('storage integration database safety', () => {
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
});

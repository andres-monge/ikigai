import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const storageDatabaseTests = [
  '**/server/storage.test.ts',
  '**/server/storage.career-map.test.ts',
  '**/server/storage.migration.test.ts',
  '**/server/storage.performance.test.ts',
];
const storageDatabaseTestsEnabled = process.env.U4_STORAGE_TEST_DATABASE === '1';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node', // Default environment for server-side testing
    setupFiles: [],
    include: [
      '**/server/**/*.{test,spec}.{js,ts}',
      '**/client/**/*.{test,spec}.{js,ts,jsx,tsx}',
      '**/shared/**/*.{test,spec}.{js,ts}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/worktrees/**',
      '**/tests/**', // E2E tests handled by Playwright
      ...(storageDatabaseTestsEnabled ? [] : storageDatabaseTests),
    ],
    // Force sequential execution for database tests to avoid conflicts
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Run tests sequentially to avoid database conflicts
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, './shared'),
      '@': path.resolve(import.meta.dirname, './client/src'),
    },
  },
});

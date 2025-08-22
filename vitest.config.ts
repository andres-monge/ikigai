import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

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
      '**/tests/**', // E2E tests handled by Playwright
    ],
    // Use pool configuration for different environments instead of deprecated environmentMatchGlobs
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
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

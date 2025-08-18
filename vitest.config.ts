import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node', // Default environment for server-side testing
    environmentMatchGlobs: [
      // Use jsdom for client-side component tests
      ['**/client/**/*.{test,spec}.{js,ts,jsx,tsx}', 'jsdom'],
    ],
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
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, './shared'),
      '@': path.resolve(import.meta.dirname, './client/src'),
    },
  },
});

import { defineConfig, devices } from '@playwright/test';
import { assertDisposableStorageTestUrl } from './server/storage.test-database-safety';

// This suite makes paid Gemini requests and writes anonymous legacy records.
if (process.env.NAMI_LEGACY_E2E !== '1') {
  throw new Error('Paid legacy journey is opt-in. Read docs/runbooks/nami-verification.md, then set NAMI_LEGACY_E2E=1 with an explicit disposable database and provider scope. This is not the Method Chat/Map suite.');
}
if (process.env.U4_STORAGE_TEST_DATABASE !== '1' || !process.env.U4_STORAGE_TEST_DATABASE_URL) {
  throw new Error('Legacy E2E requires U4_STORAGE_TEST_DATABASE=1 and U4_STORAGE_TEST_DATABASE_URL; no application database fallback.');
}
const { connectionString } = assertDisposableStorageTestUrl(process.env.U4_STORAGE_TEST_DATABASE_URL);
if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_REASONING_MODEL) {
  throw new Error('Select GEMINI_API_KEY and GEMINI_REASONING_MODEL explicitly for the legacy run (fixture values suffice for --list only).');
}

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* A paid journey has one owner and no automatic retry. */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Preserve the first paid failure; diagnose before a deliberate rerun. */
  retries: 0,
  /* Drive this paid legacy journey serially. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { outputFolder: '.context/revelio/legacy-e2e/report', open: 'never' }]],
  outputDir: '.context/revelio/legacy-e2e/results',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Traces can contain request bodies; collect only explicitly scoped evidence. */
    trace: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'node --import tsx server/index.ts',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      U4_STORAGE_TEST_DATABASE: '1',
      U4_STORAGE_TEST_DATABASE_URL: connectionString,
      DATABASE_URL: connectionString,
      AGENT_ENABLED: 'false',
      AUTH_SIGNUPS_ENABLED: 'false',
      BETTER_AUTH_DATABASE_URL: '',
      BETTER_AUTH_SECRET: '',
      BETTER_AUTH_URL: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      OPENAI_API_KEY: '',
      GROQ_API_KEY: '',
      YOUTUBE_API_KEY: '',
    },
    timeout: 120 * 1000, // 2 minutes for server startup
  },
});

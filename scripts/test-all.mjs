import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDisposableStorageTestUrl } from '../server/storage.test-database-safety.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A complete test process must never inherit application/provider credentials. */
export function createTestEnvironment(source) {
  if (source.U4_STORAGE_TEST_DATABASE !== '1') {
    throw new Error('Set U4_STORAGE_TEST_DATABASE=1 to authorize the disposable full suite.');
  }
  if (!source.U4_STORAGE_TEST_DATABASE_URL) {
    throw new Error('U4_STORAGE_TEST_DATABASE_URL is required; no application database fallback is allowed.');
  }
  const { connectionString } = assertDisposableStorageTestUrl(source.U4_STORAGE_TEST_DATABASE_URL);
  const environment = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TERM', 'NO_COLOR', 'FORCE_COLOR', 'CI', 'TZ']) {
    if (source[key] !== undefined) environment[key] = source[key];
  }
  return {
    ...environment,
    NODE_ENV: 'test',
    U4_STORAGE_TEST_DATABASE: '1',
    U4_STORAGE_TEST_DATABASE_URL: connectionString,
    DATABASE_URL: connectionString,
    GEMINI_API_KEY: 'test-key-not-a-credential',
    GEMINI_REASONING_MODEL: 'test-model',
    GROQ_API_KEY: '',
    OPENAI_API_KEY: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    BETTER_AUTH_DATABASE_URL: '',
    BETTER_AUTH_SECRET: '',
    BETTER_AUTH_URL: '',
    AGENT_ENABLED: 'false',
    AUTH_SIGNUPS_ENABLED: 'false',
  };
}

export async function runAllTests(args, source = process.env) {
  // Validate before spawning Vitest, so neither its modules nor DB fixtures can
  // initialize when explicit test authorization is absent or unsafe.
  const environment = createTestEnvironment(source);
  const child = spawn(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), ...args], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });
  let requestedSignal;
  const handlers = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => [signal, () => {
    requestedSignal = signal;
    child.kill(signal);
  }]));
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const cleanup = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
  return new Promise((resolveResult, reject) => {
    child.once('error', (error) => { cleanup(); reject(error); });
    child.once('close', (code, signal) => {
      cleanup();
      resolveResult({ code: code ?? 1, signal: requestedSignal ?? signal });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { code, signal } = await runAllTests(process.argv.slice(2));
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Full-suite initialization failed.');
    process.exitCode = 1;
  }
}

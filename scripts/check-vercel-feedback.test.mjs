import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('the actual package audit rejects an embedded feedback email credential', async () => {
  const sentinel = `fictional-feedback-package-secret-${randomUUID()}`;
  const canary = path.resolve('.vercel/output/static', `feedback-audit-${randomUUID()}.txt`);
  await writeFile(canary, sentinel, { flag: 'wx', mode: 0o600 });
  try {
    const checked = spawnSync(process.execPath, ['scripts/check-vercel-function.mjs'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL, RESEND_API_KEY: sentinel },
    });
    assert.notEqual(checked.status, 0, 'Package audit accepted an embedded feedback email credential');
    assert.match(checked.stderr, /Deployment contains an environment secret value/);
    assert.ok(!checked.stderr.includes(sentinel), 'The rejection must not print the credential');
  } finally { await rm(canary, { force: true }); }
});

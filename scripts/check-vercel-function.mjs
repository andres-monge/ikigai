import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
import { configuredAppOrigin } from '../shared/app-origin.ts';
import { checkedMappings, runtimeRoots } from './vercel-file-path-map.mjs';

if (process.versions.node.split('.')[0] !== '24') {
  throw new Error('Vercel function verification requires Node 24');
}

const output = path.resolve('.vercel/output');
const artifact = path.join(output, 'functions/api/index.func');
const allowedOutputRoots = new Set(['builds.json', 'config.json', 'diagnostics', 'functions', 'static']);
const allowedTopLevel = new Set(['.vc-config.json', ...runtimeRoots]);
const expectedSkills = [
  'create-purpose-paths', 'design-path-project', 'form-foundation',
  'guide-path-project', 'interpret-path-project',
];

async function assertSafePackage(root) {
  const outputEntries = await readdir(output);
  const unexpectedOutput = outputEntries.filter((entry) => !allowedOutputRoots.has(entry));
  if (unexpectedOutput.length) throw new Error(`Deployment contains unexpected root paths: ${unexpectedOutput.join(', ')}`);

  const entries = await readdir(root);
  const unexpected = entries.filter((entry) => !allowedTopLevel.has(entry));
  if (unexpected.length) throw new Error(`Function contains unexpected root paths: ${unexpected.join(', ')}`);

  const skillRoot = path.join(root, 'dist/method-skills');
  const skills = (await readdir(skillRoot)).sort();
  if (skills.join(',') !== expectedSkills.join(',')) {
    throw new Error(`Function does not contain exactly the five canonical Method skills: ${skills.join(', ')}`);
  }
  for (const skill of skills) {
    if (!(await stat(path.join(skillRoot, skill, 'SKILL.md'))).isFile()) {
      throw new Error(`Method skill is missing: ${skill}`);
    }
  }

  const secretValues = [];
  if (process.env.RESEND_API_KEY?.length >= 8) secretValues.push(Buffer.from(process.env.RESEND_API_KEY));
  for (const target of ['preview', 'production']) {
    try {
      const envFile = parse(await readFile(path.resolve(`.vercel/.env.${target}.local`)));
      for (const key of [
        'DATABASE_URL', 'BETTER_AUTH_DATABASE_URL', 'BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_SECRET',
        'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'YOUTUBE_API_KEY', 'RESEND_API_KEY',
        'VERCEL_OIDC_TOKEN',
      ]) {
        if (envFile[key]?.length >= 8) secretValues.push(Buffer.from(envFile[key]));
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  async function checkSecrets(itemPath) {
    if (!secretValues.length) return;
    const data = await readFile(itemPath);
    if (secretValues.some((value) => data.includes(value))) {
      throw new Error('Deployment contains an environment secret value');
    }
  }

  let functionMappings = [];
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const itemPath = path.join(directory, entry.name);
      const relative = path.relative(output, itemPath);
      if (entry.isDirectory()) {
        if (entry.name === '.context' || entry.name === '.claude') {
          throw new Error(`Deployment contains private directory: ${relative}`);
        }
        await scan(itemPath);
      } else if (entry.isSymbolicLink()) {
        throw new Error(`Deployment contains symlink: ${relative}`);
      } else if (/^\.env(?:\.|$)|\.(?:pem|key)$/.test(entry.name)) {
        throw new Error(`Deployment contains private file: ${relative}`);
      } else {
        await checkSecrets(itemPath);
        if (entry.name === '.vc-config.json') {
          const mappings = await checkedMappings(JSON.parse(await readFile(itemPath, 'utf8')), process.cwd());
          for (const mapping of mappings) await checkSecrets(mapping.sourcePath);
          if (directory === root) functionMappings = mappings;
        }
      }
    }
  }
  await scan(output);

  const expectedOrigin = configuredAppOrigin(process.env.BETTER_AUTH_URL ?? '', {
    nodeEnv: 'production', vercel: '1',
  });
  if (!expectedOrigin) {
    throw new Error('Set a valid HTTPS BETTER_AUTH_URL origin for the package check');
  }
  const html = await readFile(path.join(output, 'static/index.html'), 'utf8');
  for (const [attribute, name, value] of [
    ['property', 'og:url', `${expectedOrigin}/`],
    ['property', 'og:image', `${expectedOrigin}/assets/og-image.png`],
    ['name', 'twitter:url', `${expectedOrigin}/`],
    ['name', 'twitter:image', `${expectedOrigin}/assets/og-image.png`],
  ]) {
    if (!html.includes(`<meta ${attribute}="${name}" content="${value}"`)) {
      throw new Error(`Deployment share metadata does not match BETTER_AUTH_URL: ${name}`);
    }
  }
  return functionMappings;
}

const probe = `
const app = (await import('./api/index.js')).default;
const { createMethodModuleLoader } = await import('./server/ai/method/loader.js');
const { METHOD_MODULE_KEYS } = await import('./server/ai/method/registry.js');
const loader = await createMethodModuleLoader({ environment: 'production' });
for (const key of METHOD_MODULE_KEYS) {
  const bundle = loader.load({ module: key });
  if (!bundle.sourcePath.includes('/dist/method-skills/')) throw new Error('Skill loaded outside packaged canonical bundle');
}
const server = app.listen(0, '127.0.0.1');
try {
  await new Promise((resolve) => server.once('listening', resolve));
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/agent/workspace');
  if (response.status !== 503) throw new Error('Expected signed-out auth-unavailable boundary, got HTTP ' + response.status);
  const feedbackUrl = 'http://127.0.0.1:' + server.address().port + '/api/feedback';
  const feedbackDenied = await fetch(feedbackUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"fixture":',
  });
  if (feedbackDenied.status !== 403) throw new Error('Packaged feedback metadata admission failed');
  const feedbackSignedOut = await fetch(feedbackUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(process.env.BETTER_AUTH_URL).origin, 'x-nami-request': '1' },
    body: JSON.stringify({ submissionId: '00000000-0000-4000-8000-000000000001', text: 'Fictional package probe', page: 'chat' }),
  });
  if (feedbackSignedOut.status !== 503) throw new Error('Packaged feedback signed-out boundary failed');
  for (const route of ['/analyze/stream', '/action-plan/stream', '/questionnaire/save', '/session/fixture-retired', '/session/start-over', '/transcribe', '/analytics/event']) {
    for (const method of ['GET', 'POST']) {
      const retired = await fetch('http://127.0.0.1:' + server.address().port + '/api' + route, {
        method,
        ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{"fixture":' } : {}),
      });
      if (retired.status !== 410 || (await retired.json()).code !== 'LEGACY_RETIRED') {
        throw new Error('Packaged legacy retirement boundary failed');
      }
    }
  }
  console.log('Function imported; five canonical skills loaded; signed-out API returned 503');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
`;

const isolated = await mkdtemp(path.join(tmpdir(), 'nami-vercel-function-'));
try {
  const mappings = await assertSafePackage(artifact);
  await cp(artifact, isolated, { recursive: true });
  for (const { destination, sourcePath } of mappings) {
    const target = path.join(isolated, destination);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(sourcePath, target);
  }
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: isolated,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      NODE_ENV: 'production', VERCEL: '1', AGENT_ENABLED: 'false', AUTH_SIGNUPS_ENABLED: 'false',
      DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/fixture',
      GEMINI_API_KEY: 'fixture-key-not-a-credential', GEMINI_REASONING_MODEL: 'fixture-model',
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL, RESEND_API_KEY: '', FEEDBACK_FROM_EMAIL: '',
    },
  });
  if (result.status !== 0) {
    throw new Error(`Isolated Node function probe failed: ${result.stderr.trim() || result.stdout.trim() || result.error?.message}`);
  }
  console.log('Isolated Node 24 function imported; five canonical skills loaded; signed-out API returned 503; feedback admission/auth boundaries passed; retired APIs returned JSON 410 before parsing');
  console.log('Entire deployment output contains only expected paths and no embedded environment secrets');
} finally {
  await rm(isolated, { recursive: true, force: true });
}

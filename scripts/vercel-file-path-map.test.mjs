import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { checkedMappings } from './vercel-file-path-map.mjs';

test('preparation removes excluded private file mappings and preserves runtime mappings', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'nami-map-test-'));
  try {
    const root = path.join(fixture, '.vercel/output/functions/api/index.func');
    await mkdir(path.join(root, '.claude'), { recursive: true });
    const config = {
      runtime: 'nodejs24.x', handler: 'api/index.js',
      filePathMap: {
        '.claude/skills/fictional.md': '.claude/skills/fictional.md',
        'server/private.js': '.context/fictional.js',
        'docs/fictional.md': 'server/fixture.js',
        'server/script.js': 'scripts/fixture.js',
        'server/runtime.js': 'server/fixture.js',
      },
    };
    await writeFile(path.join(root, '.vc-config.json'), JSON.stringify(config));
    const result = spawnSync(process.execPath, [path.resolve('scripts/prepare-vercel-output.mjs')], {
      cwd: fixture, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(path.join(root, '.vc-config.json'), 'utf8')), {
      ...config, filePathMap: { 'server/runtime.js': 'server/fixture.js' },
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('mapping sources resolve from the repository, preserving a distinct runtime destination', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'nami-map-test-'));
  try {
    await mkdir(path.join(fixture, 'server'));
    await writeFile(path.join(fixture, 'server/fixture.js'), 'export default 1;');
    assert.deepEqual(await checkedMappings({ filePathMap: {
      'dist/runtime.js': 'server/fixture.js',
    } }, fixture), [{ destination: 'dist/runtime.js', sourcePath: await realpath(path.join(fixture, 'server/fixture.js')) }]);
    assert.deepEqual(await checkedMappings({}, fixture), []);
    assert.deepEqual(await checkedMappings({ filePathMap: {} }, fixture), []);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

for (const filePathMap of [
  { '.claude/fictional.md': 'server/fixture.js' },
  { 'server/runtime.js': '.context/fictional.js' },
  { 'server/runtime.js': 'docs/fictional.md' },
  { 'scripts/fictional.js': 'server/fixture.js' },
  { 'server/runtime.js': 'server/.claude/fictional.js' },
  { '../outside.js': 'server/fixture.js' },
  { 'server/runtime.js': '/outside.js' },
  { 'server/runtime.js': 'server/../.context/fictional.js' },
  { 'server/runtime.js': 'server\\fixture.js' },
  { 'server/runtime.js': 'server/.env.production' },
  { 'server/runtime.js': 'server/fictional.key' },
  { 'server/runtime.js': 'dist/excluded-by-vercelignore.js' },
  { 'server/runtime.js': null },
  null, [], 'invalid',
]) {
  test(`rejects unsafe mapping ${JSON.stringify(filePathMap)}`, async () => {
    await assert.rejects(checkedMappings({ filePathMap }, process.cwd()), /filePathMap/);
  });
}

test('rejects dangling sources even when a matching bundle file exists, and rejects symlink sources', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'nami-map-test-'));
  try {
    await mkdir(path.join(fixture, 'server'));
    await mkdir(path.join(fixture, '.vercel/output/functions/api/index.func/server'), { recursive: true });
    await writeFile(path.join(fixture, '.vercel/output/functions/api/index.func/server/missing.js'), 'fixture');
    const map = { 'server/missing.js': 'server/missing.js' };
    await assert.rejects(checkedMappings({ filePathMap: map }, fixture), /missing source/);
    await symlink('missing.js', path.join(fixture, 'server/dangling.js'));
    await assert.rejects(checkedMappings({ filePathMap: { 'server/dangling.js': 'server/dangling.js' } }, fixture), /missing source/);
    await writeFile(path.join(fixture, 'server/fixture.js'), 'fixture');
    await symlink('fixture.js', path.join(fixture, 'server/link.js'));
    await assert.rejects(checkedMappings({ filePathMap: { 'server/link.js': 'server/link.js' } }, fixture), /without symlinks/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('path policy rejects unsafe mappings independently of source existence checks', async () => {
  for (const [destination, source] of [
    ['.claude/fixture.js', 'server/fixture.js'],
    ['../outside.js', 'server/fixture.js'],
    ['server/fixture.js', '.context/fixture.js'],
    ['server/fixture.js', 'docs/fixture.js'],
    ['scripts/fixture.js', 'server/fixture.js'],
    ['server/fixture.js', 'server/.claude/fixture.js'],
    ['server/fixture.js', '/outside.js'],
    ['server/fixture.js', 'server/../.context/fixture.js'],
    ['server/fixture.js', 'server\\fixture.js'],
    ['server/fixture.js', 'server/.env.production'],
    ['server/fixture.js', 'server/fixture.key'],
    ['server/fixture.js', 'dist/fixture.js'],
    ['server/fixture.js', null],
  ]) {
    await assert.rejects(checkedMappings({ filePathMap: { [destination]: source } }, process.cwd()),
      { message: 'Function filePathMap contains a private or unsupported path' });
  }
});

test('rejects current uploader exclusions while retaining dependency-directory exceptions', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'nami-map-test-'));
  try {
    for (const source of ['server/fixture.test.ts', 'server/dist/fixture.js', 'shared/tests/fixture.js',
      'api/docs/fixture.js', 'server/scripts/fixture.js', 'node_modules/fixture/docs/fixture.js']) {
      await mkdir(path.dirname(path.join(fixture, source)), { recursive: true });
      await writeFile(path.join(fixture, source), 'export default 1;');
      const check = checkedMappings({ filePathMap: { 'server/runtime.js': source } }, fixture);
      if (source.startsWith('node_modules/')) {
        assert.equal((await check).length, 1);
      } else {
        await assert.rejects(check, { message: 'Function filePathMap contains a private or unsupported path' });
      }
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

for (const secret of [false, true]) {
  test(secret ? 'full checker rejects a fictional secret present only in a mapped source without echoing it'
    : 'full checker materializes a required mapped runtime file absent from the physical bundle', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'nami-map-checker-'));
    const sentinel = 'fictional-packaging-sentinel-not-a-credential';
    try {
      async function put(relative, content) {
        const destination = path.join(fixture, relative);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, content);
      }
      for (const source of ['scripts/check-vercel-function.mjs', 'scripts/vercel-file-path-map.mjs', 'shared/app-origin.ts']) {
        await mkdir(path.dirname(path.join(fixture, source)), { recursive: true });
        await cp(path.resolve(source), path.join(fixture, source));
      }
      await symlink(path.resolve('node_modules'), path.join(fixture, 'node_modules'));
      const bundle = '.vercel/output/functions/api/index.func/';
      await put(bundle + '.vc-config.json', JSON.stringify({ filePathMap: { 'server/runtime.js': 'server/runtime.js' } }));
      await put(bundle + 'api/index.js', "export { default } from '../server/runtime.js';");
      await put(bundle + 'package.json', '{"type":"module"}');
      await put(bundle + 'server/ai/method/registry.js', 'export const METHOD_MODULE_KEYS = ["fixture"];');
      await put(bundle + 'server/ai/method/loader.js', `export async function createMethodModuleLoader() {
        return { load() { return { sourcePath: '/dist/method-skills/fixture/SKILL.md' }; } };
      }`);
      for (const skill of ['create-purpose-paths', 'design-path-project', 'form-foundation', 'guide-path-project', 'interpret-path-project']) {
        await put(bundle + `dist/method-skills/${skill}/SKILL.md`, 'fictional fixture');
      }
      await put('.vercel/output/static/index.html', [
        ['property', 'og:url', '/'], ['property', 'og:image', '/assets/og-image.png'],
        ['name', 'twitter:url', '/'], ['name', 'twitter:image', '/assets/og-image.png'],
      ].map(([attribute, name, suffix]) => `<meta ${attribute}="${name}" content="https://fixture.example${suffix}">`).join(''));
      await put('server/runtime.js', `import { createServer } from 'node:http';
        ${secret ? `// ${sentinel}` : ''}
        export default { listen(...args) { return createServer((request, response) => {
          response.setHeader('Content-Type', 'application/json');
          response.statusCode = request.url === '/api/agent/workspace' ? 503 : 410;
          response.end(JSON.stringify({ code: 'LEGACY_RETIRED' }));
        }).listen(...args); } };
      `);
      if (secret) await put('.vercel/.env.production.local', `GEMINI_API_KEY=${sentinel}\n`);
      const result = spawnSync(process.execPath, ['scripts/check-vercel-function.mjs'], {
        cwd: fixture, encoding: 'utf8', timeout: 30_000,
        env: { BETTER_AUTH_URL: 'https://fixture.example' },
      });
      const diagnostic = result.stdout + result.stderr;
      assert.ok(!diagnostic.includes(sentinel));
      if (secret) {
        assert.notEqual(result.status, 0);
        assert.match(diagnostic, /Deployment contains an environment secret value/);
      } else {
        assert.equal(result.status, 0, diagnostic);
        assert.match(diagnostic, /Isolated Node 24 function imported/);
      }
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
}

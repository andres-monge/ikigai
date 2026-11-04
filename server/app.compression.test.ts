import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';

it('keeps the application alive after trailing bytes on a compressed anonymous request', async () => {
  const environment = Object.fromEntries(['PATH', 'HOME', 'USER', 'TMPDIR'].flatMap(key =>
    process.env[key] === undefined ? [] : [[key, process.env[key]]],
  ));
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { createApp } from ${JSON.stringify(new URL('./app.ts', import.meta.url).href)};
    const server = createApp().listen(0, '127.0.0.1', () => process.send(server.address().port));
    process.on('message', () => server.close(() => process.exit(0)));
  `], { env: { ...environment, NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/fixture',
    GEMINI_API_KEY: 'test-key-not-a-credential', GEMINI_REASONING_MODEL: 'test-model',
    AGENT_ENABLED: 'false', AUTH_SIGNUPS_ENABLED: 'false',
  }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let diagnostic = '';
  child.stderr!.on('data', data => { diagnostic += data.toString(); });
  const exited = new Promise<{ code: number | null; signal: string | null }>(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const port = await new Promise<number>((resolve, reject) => {
    child.once('message', value => resolve(Number(value)));
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Fixture exited before listening')));
  });
  async function send(body?: Buffer, compressed = false) {
    return new Promise<number>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path: '/api/compression-fixture',
        method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json',
          'Content-Length': String(body.length), ...(compressed ? { 'Content-Encoding': 'gzip' } : {}) } : {},
      }, response => { response.resume(); response.once('end', () => resolve(response.statusCode!)); });
      req.on('error', reject);
      req.setTimeout(2_000, () => req.destroy(new Error('Fixture request timed out')));
      req.end(body);
    });
  }
  const statuses: number[] = [];
  let failure: unknown;
  let exit: { code: number | null; signal: string | null };
  try {
    const json = Buffer.from('{"fictional":true}');
    statuses.push(await send(json));
    statuses.push(await send(gzipSync(json), true));
    statuses.push(await send(Buffer.concat([gzipSync(json), Buffer.from([0]), Buffer.alloc(100 * 1024, 0x58)]), true));
    await new Promise(resolve => setTimeout(resolve, 200));
    statuses.push(await send());
  } catch (error) {
    failure = error;
  } finally {
    if (child.connected) child.send('close');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3_000);
    exit = await exited;
    clearTimeout(timer);
  }
  expect(exit.code, diagnostic).toBe(0);
  expect(failure).toBeUndefined();
  expect(statuses[0]).toBe(404);
  expect(statuses[1]).toBe(404);
  expect([400, 404]).toContain(statuses[2]);
  expect(statuses[3]).toBe(404);
}, 15_000);

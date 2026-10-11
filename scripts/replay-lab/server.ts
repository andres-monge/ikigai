/** Loopback-only review interface. Never mounts the production app. */
import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createLabStore, LabInputError } from './store.js';

export function createLabApp(store: Awaited<ReturnType<typeof createLabStore>>, port = 5174, assets?: { javascript: string; css: string }) {
  if (port === 5173) throw new LabInputError('Port 5173 is reserved for the main app.');
  const app = express();
  app.disable('x-powered-by');
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = new Set([...allowedHosts].map((host) => `http://${host}`));
  app.use((request, response, next) => {
    if (!allowedHosts.has(request.get('host') ?? '') || (request.get('origin') && !allowedOrigins.has(request.get('origin')!))) return response.status(403).json({ error: 'Loopback origin required.' });
    if (!['GET', 'HEAD'].includes(request.method) && !allowedOrigins.has(request.get('origin') ?? '')) return response.status(403).json({ error: 'Same-origin request required.' });
    response.set('Cache-Control', 'no-store');
    response.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '2mb', strict: true }));
  const route = (method: 'get' | 'post' | 'put', endpoint: string, action: (request: express.Request) => Promise<unknown>) => {
    app[method](endpoint, async (request, response) => {
      try { response.json(await action(request)); }
      catch (error) { response.status(error instanceof LabInputError ? 400 : 500).json({ error: error instanceof LabInputError ? error.message : 'Private experiment operation failed. Inspect local artifacts.' }); }
    });
  };
  route('get', '/api/state', () => store.state());
  route('get', '/api/checkpoints/:id', (request) => store.getCheckpoint(request.params.id));
  route('get', '/api/candidates/:id', (request) => store.getCandidate(request.params.id));
  route('post', '/api/candidates', (request) => store.createCandidate(request.body));
  route('put', '/api/candidates/:id', (request) => store.updateCandidate(request.params.id, request.body));
  route('post', '/api/batch', (request) => store.batch(request.body));
  route('get', '/api/jobs/:id', (request) => store.getJob(request.params.id));
  route('post', '/api/jobs/:id/continue', (request) => store.continueJob(request.params.id, request.body));
  route('put', '/api/jobs/:id/feedback', (request) => store.feedback(request.params.id, request.body));
  app.get('/ui.js', (_request, response) => response.type('application/javascript').send(assets?.javascript ?? ''));
  app.get('/style.css', (_request, response) => response.type('text/css').send(assets?.css ?? ''));
  app.get('/', (_request, response) => response.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revelio experiments</title><link rel="stylesheet" href="/style.css"></head><body><div id="root">Loading local experiments…</div><script type="module" src="/ui.js"></script></body></html>`));
  app.use((_request, response) => response.status(404).json({ error: 'Not found.' }));
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ error: 'Invalid request.' }));
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, envPath, requestedPort = '5174'] = process.argv.slice(2);
  const port = Number(requestedPort);
  if (!root || !envPath || !Number.isInteger(port) || port < 1024 || port > 65535 || port === 5173) {
    console.error('Usage: node --import tsx scripts/replay-lab/server.ts PRIVATE_ROOT ENV_FILE [PORT=5174]'); process.exitCode = 1;
  } else {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    Promise.all([
      createLabStore({ root, envPath }),
      build({ entryPoints: [path.join(directory, 'ui.tsx')], bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } }),
      readFile(path.join(directory, 'style.css'), 'utf8'),
    ]).then(([store, bundle, css]) => {
      const app = createLabApp(store, port, { javascript: bundle.outputFiles[0].text, css });
      const server = app.listen(port, '127.0.0.1', () => console.log(`Revelio experiments: http://127.0.0.1:${port}`));
      server.on('error', () => { console.error('Local interface could not listen.'); process.exitCode = 1; });
    }).catch(() => { console.error('Local interface setup failed. Inspect private configuration.'); process.exitCode = 1; });
  }
}

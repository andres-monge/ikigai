import express, { type RequestHandler } from 'express';
import { gzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import request from '../test-fixtures/loopback-http.js';
import { createFeedbackRouter } from './feedback.js';

it('rejects compressed JSON before authentication, persistence or email', async () => {
  const auth = vi.fn<RequestHandler>((_req, res, next) => { res.locals.auth = { userId: 'fictional', email: 'fictional@example.test' }; next(); });
  const save = vi.fn();
  const notify = vi.fn();
  const app = express();
  app.use('/api/feedback', createFeedbackRouter({ origin: 'http://localhost:5173', requireAuth: auth, storage: { save }, notify }));
  app.use((err: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(err.status ?? 500).json({ error: 'Request failed' }));
  const response = await (await request(app)).post('/api/feedback')
    .set('origin', 'http://localhost:5173').set('x-nami-request', '1')
    .set('content-type', 'application/json').set('content-encoding', 'gzip')
    .send(gzipSync(Buffer.from(JSON.stringify({ submissionId: randomUUID(), text: 'Fictional feedback', page: 'chat' }))));
  expect(response.status).toBe(415);
  expect(auth).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

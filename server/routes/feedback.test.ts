import express, { type RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import request from '../test-fixtures/loopback-http.js';
import { createFeedbackRouter } from './feedback.js';

const signedIn: RequestHandler = (_req, res, next) => { res.locals.auth = { userId: 'owned-user', email: 'fictional@example.test' }; next(); };
function setup(auth = signedIn) {
  const save = vi.fn(async input => ({ ...input, id: randomUUID(), createdAt: new Date(), notification: 'pending' }));
  const notify = vi.fn(async () => 'accepted' as const);
  const app = express();
  app.use('/api/feedback', createFeedbackRouter({ requireAuth: auth, origin: 'http://localhost:5173', storage: { save } as any, notify }));
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status ?? 500).json({ error: 'Request failed' }));
  return { app, save, notify };
}
const body = () => ({ submissionId: randomUUID(), text: 'Make navigation clearer', page: 'chat' });
const post = async (app: express.Express, value = body()) => (await request(app)).post('/api/feedback').set('origin', 'http://localhost:5173').set('x-nami-request', '1').send(value);

describe('feedback API boundary', () => {
  it('uses only session identity and returns durable success without private fields', async () => {
    const { app, save } = setup();
    const response = await post(app);
    expect(response.status).toBe(200);
    expect(save.mock.calls[0][0]).toMatchObject({ userId: 'owned-user', replyEmail: 'fictional@example.test', buildVersion: 'unknown' });
    expect(response.body).toEqual({ id: expect.any(String), saved: true, notification: 'accepted' });
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it.each([
    { ...body(), userId: 'attacker' }, { ...body(), email: 'attacker@example.test' }, { ...body(), to: 'attacker@example.test' },
    { ...body(), text: ' ' }, { ...body(), text: 'a'.repeat(4001) }, { ...body(), page: 'https://attacker.test' },
  ])('rejects forged or invalid fields before save or email', async value => {
    const { app, save, notify } = setup();
    expect((await post(app, value)).status).toBe(400);
    expect(save).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
  });
  it.each(['/api/feedback', '/API/FEEDBACK/'])('rejects malformed metadata before parsing at %s', async path => {
    const { app, save } = setup();
    const response = await (await request(app)).post(path).set('content-type', 'application/json').send('{invalid');
    expect(response.status).toBe(403); expect(save).not.toHaveBeenCalled();
  });
  it('requires a session before parsing and bounds JSON', async () => {
    const auth: RequestHandler = (_req, res) => { res.status(401).json({ error: 'Authentication required' }); };
    const anonymous = setup(auth);
    expect((await post(anonymous.app)).status).toBe(401);
    expect(anonymous.save).not.toHaveBeenCalled();
    const { app, save } = setup();
    expect((await post(app, { ...body(), text: 'a'.repeat(17000) })).status).toBe(413);
    expect(save).not.toHaveBeenCalled();
  });
  it('never claims saved on DB failure; notification failure preserves saved truth', async () => {
    const { app, save, notify } = setup();
    save.mockRejectedValueOnce(new Error('private database information'));
    const failed = await post(app);
    expect(failed.status).toBe(503); expect(failed.body.saved).toBeUndefined(); expect(notify).not.toHaveBeenCalled();
    notify.mockRejectedValueOnce(new Error('private provider information'));
    expect((await post(app)).body).toMatchObject({ saved: true, notification: 'uncertain' });
  });
  it('rejects unsafe server email and non-JSON/method/encoding admission', async () => {
    const unsafe: RequestHandler = (_req, res, next) => { res.locals.auth = { userId: 'owned-user', email: 'bad\r\nBcc:other@example.test' }; next(); };
    expect((await post(setup(unsafe).app)).status).toBe(400);
    const { app, save } = setup();
    expect((await (await request(app)).get('/api/feedback')).status).toBe(405);
    for (const headers of [{ 'content-type': 'text/plain' }, { 'content-encoding': 'gzip' }]) {
      let req = (await request(app)).post('/api/feedback').set('origin', 'http://localhost:5173').set('x-nami-request', '1');
      for (const [key, value] of Object.entries(headers)) req = req.set(key, value);
      expect((await req.send('foo')).status).toBe(415);
    }
    expect(save).not.toHaveBeenCalled();
  });
});

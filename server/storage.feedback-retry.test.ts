import express, { type RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { cleanupStorageTestDatabases, storageTestDatabase as database } from './storage.test-database.js';
import request from './test-fixtures/loopback-http.js';
import { FeedbackStorage } from './feedback/storage.js';
import { notifyFeedback } from './feedback/delivery.js';
import { createFeedbackRouter } from './routes/feedback.js';

afterAll(cleanupStorageTestDatabases);

describe('durable feedback delivery retry admission through HTTP', () => {
  it('blocks reconciliation during a live claim but permits verified acceptance during cooldown', async () => {
    const now = new Date('2032-01-01T12:00:00Z');
    const storage = new FeedbackStorage(database, () => now);
    const row = await storage.save({ userId: randomUUID(), replyEmail: 'fictional@example.test', submissionId: randomUUID(), text: 'Fictional reconciliation', page: 'chat', buildVersion: 'fixture' });
    const claim = await storage.claim(row.id, { from: 'feedback@example.test', to: 'andresmongeliano@gmail.com', reply_to: 'fictional@example.test', subject: 'Nami feedback', text: row.text });
    await expect(storage.reconcile(row.id, 'verified-provider-id')).rejects.toMatchObject({ status: 409 });
    await storage.settle(row.id, claim!.token, 'uncertain');
    expect(await storage.claim(row.id, claim!.row.envelope!)).toBeUndefined();
    await storage.reconcile(row.id, 'verified-provider-id');
    expect(await storage.get(row.id)).toMatchObject({ notification: 'accepted', providerId: 'verified-provider-id', leaseToken: null, leaseUntil: null });
    expect(await storage.claim(row.id, claim!.row.envelope!)).toBeUndefined();
  });

  it.each(['failed', 'uncertain'] as const)('keeps %s reports saved while bounding repeats across instances', async initial => {
    let now = new Date('2032-01-01T12:00:00Z');
    const firstAttempt = now.toISOString();
    const userId = randomUUID();
    const body = { submissionId: randomUUID(), text: 'Fictional feedback', page: 'map' as const };
    const a = new FeedbackStorage(database, () => now);
    const b = new FeedbackStorage(database, () => now);
    const transport = vi.fn(async () => {
      if (transport.mock.calls.length === 1) {
        if (initial === 'uncertain') throw new Error('Synthetic lost response');
        return new Response('{}', { status: 403 });
      }
      return new Response('{"id":"synthetic-provider-id"}');
    });
    function app(storage: FeedbackStorage, email: string, from: string) {
      const router = express();
      const auth: RequestHandler = (_req, res, next) => { res.locals.auth = { userId, email }; next(); };
      router.use('/api/feedback', createFeedbackRouter({ storage, requireAuth: auth, origin: 'http://localhost:5173', notify: row => notifyFeedback(row, storage, { apiKey: 'synthetic', from, fetch: transport }) }));
      return router;
    }
    const appA = app(a, 'original@example.test', 'feedback@example.test');
    const appB = app(b, 'changed@example.test', 'changed-sender@example.test');
    const post = async (target: express.Express, payload = body) => (await request(target)).post('/api/feedback').set('origin', 'http://localhost:5173').set('x-nami-request', '1').send(payload);
    const saved = await post(appA);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ saved: true, notification: initial });
    const recordId = saved.body.id;
    for (let i = 0; i < 4; i++) await a.save({ ...body, submissionId: randomUUID(), userId, replyEmail: 'original@example.test', buildVersion: 'fixture' });
    for (let i = 0; i < 4; i++) {
      const duplicate = await post(appB);
      expect(duplicate.status).toBe(200);
      expect(duplicate.body).toMatchObject({ id: recordId, saved: true, notification: initial });
    }
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await post(appA, { ...body, submissionId: randomUUID() })).status).toBe(429);
    now = new Date(now.getTime() + 31000);
    const recovered = await Promise.all([post(appA), post(appB)]);
    expect(recovered.every(result => result.status === 200 && result.body.saved)).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1][1].body).toBe(transport.mock.calls[0][1].body);
    expect(transport.mock.calls[1][1].headers['Idempotency-Key']).toBe(transport.mock.calls[0][1].headers['Idempotency-Key']);
    expect(JSON.parse(transport.mock.calls[1][1].body)).toMatchObject({ from: 'feedback@example.test', reply_to: 'original@example.test', to: 'andresmongeliano@gmail.com' });
    const row = await b.get(recordId);
    expect(row).toMatchObject({ notification: 'accepted', attempts: 2, providerId: 'synthetic-provider-id' });
    expect(row?.firstAttemptAt?.toISOString()).toBe(firstAttempt);
    await post(appB);
    expect(transport).toHaveBeenCalledTimes(2);
  });
});

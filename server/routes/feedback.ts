import express, { Router, type RequestHandler } from 'express';
import { feedbackInputSchema, safeReplyEmail, type FeedbackResponse } from '../../shared/feedback.js';
import { configuredMethodOrigin } from '../../shared/app-origin.js';
import { requireAuth, getProtectedIdentity } from '../auth-middleware.js';
import { env } from '../env.js';
import { db } from '../db.js';
import { FeedbackAdmissionError, FeedbackStorage, notificationStatus, type FeedbackRecord } from '../feedback/storage.js';

export function createFeedbackRouter(options: {
  requireAuth?: RequestHandler;
  origin?: string;
  storage?: Pick<FeedbackStorage, 'save'>;
  notify?: (row: FeedbackRecord) => Promise<FeedbackResponse['notification']>;
} = {}) {
  const router = Router();
  const storage = options.storage ?? new FeedbackStorage(db);
  const origin = options.origin ?? configuredMethodOrigin(env.BETTER_AUTH_URL, { nodeEnv: env.NODE_ENV, vercel: process.env.VERCEL });
  router.use((_req, res, next) => { res.setHeader('cache-control', 'no-store'); next(); });
  router.all('/', (req, res, next) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    if (!origin || req.get('origin') !== origin || req.get('x-nami-request') !== '1') { res.status(403).json({ error: 'Invalid request metadata' }); return; }
    if (!req.is('application/json') || (req.get('content-encoding') && req.get('content-encoding') !== 'identity')) { res.status(415).json({ error: 'JSON required' }); return; }
    next();
  });
  router.use(options.requireAuth ?? requireAuth);
  router.post('/', express.json({ limit: '16kb', inflate: false }), async (req, res) => {
    const parsed = feedbackInputSchema.safeParse(req.body);
    const identity = getProtectedIdentity(res);
    if (!parsed.success || !safeReplyEmail.safeParse(identity.email).success) { res.status(400).json({ error: 'Invalid feedback' }); return; }
    try {
      const rawVersion = process.env.NAMI_BUILD_VERSION;
      const buildVersion = rawVersion && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(rawVersion) ? rawVersion : 'unknown';
      const row = await storage.save({ ...parsed.data, userId: identity.userId, replyEmail: identity.email, buildVersion });
      let notification = notificationStatus(row);
      if (options.notify) {
        try { notification = await options.notify(row); } catch { notification = 'uncertain'; }
      } else notification = 'unavailable';
      res.json({ id: row.id, saved: true, notification } satisfies FeedbackResponse);
    } catch (error) {
      const status = error instanceof FeedbackAdmissionError ? error.status : 503;
      if (status === 429) res.setHeader('retry-after', '3600');
      res.status(status).json({ error: status === 429 ? 'Please try again later' : status === 409 ? 'Submission changed' : 'Feedback could not be saved' });
    }
  });
  return router;
}

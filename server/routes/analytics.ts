/**
 * @description
 * Analytics event tracking endpoint for funnel metrics.
 *
 * POST /api/analytics/event - Log an analytics event
 *
 * Design decisions:
 * - Always returns 200 to never block the client UX
 * - Errors are logged server-side for debugging
 * - Validates eventType against allowed values
 */

import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../storage.js';

export const analyticsRouter = Router();

/** Allowed event types for analytics tracking */
const ALLOWED_EVENT_TYPES = [
  'visit',
  'start',
  'section',
  'export',
  'start_over',
] as const;

/** Zod schema for analytics event request body */
const analyticsEventSchema = z.object({
  sessionId: z.string().min(1),
  eventType: z.enum(ALLOWED_EVENT_TYPES),
  metadata: z.record(z.unknown()).optional().default({}),
});

/* ------------------------- POST /api/analytics/event ------------------------- */

analyticsRouter.post('/event', async (req, res) => {
  // Validate request body
  const validation = analyticsEventSchema.safeParse(req.body);
  if (!validation.success) {
    // Still return 200 to not block client, but log the validation error
    console.error('[Analytics] Validation error:', validation.error.errors);
    return res.status(200).json({ success: true });
  }

  const { sessionId, eventType, metadata } = validation.data;

  try {
    await storage.logAnalyticsEvent(sessionId, eventType, metadata);
  } catch (err) {
    // Log error but still return success to not block the client
    console.error('[Analytics] Failed to log event:', err);
  }

  res.status(200).json({ success: true });
});

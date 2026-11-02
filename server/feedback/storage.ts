import { randomUUID } from 'node:crypto';
import { and, eq, gt, sql, desc } from 'drizzle-orm';
import { userFeedback } from '../../shared/schema.js';
import type { FeedbackInput, FeedbackResponse } from '../../shared/feedback.js';
import type { Database } from '../db.js';

export type FeedbackRecord = typeof userFeedback.$inferSelect;
export type FeedbackEnvelope = NonNullable<FeedbackRecord['envelope']>;
export class FeedbackAdmissionError extends Error {
  constructor(readonly status: number) { super('Feedback admission failed'); }
}
export const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export function notificationStatus(row: FeedbackRecord, now = new Date()): FeedbackResponse['notification'] {
  if (row.notification === 'accepted') return 'accepted';
  if (row.firstAttemptAt && now.getTime() - row.firstAttemptAt.getTime() >= RETRY_WINDOW_MS) return 'review-required';
  if (row.notification === 'sending') return row.leaseUntil && row.leaseUntil > now ? 'pending' : 'uncertain';
  return row.notification;
}

export class FeedbackStorage {
  constructor(private readonly database: Database, private readonly now = () => new Date()) {}

  async save(input: FeedbackInput & { userId: string; replyEmail: string; buildVersion: string }): Promise<FeedbackRecord> {
    return this.database.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'feedback:' + input.userId}))`);
      const [existing] = await tx.select().from(userFeedback).where(and(eq(userFeedback.userId, input.userId), eq(userFeedback.submissionId, input.submissionId)));
      if (existing) {
        if (existing.text !== input.text || existing.page !== input.page) throw new FeedbackAdmissionError(409);
        return existing;
      }
      const now = this.now();
      const recent = await tx.select({ id: userFeedback.id }).from(userFeedback).where(and(eq(userFeedback.userId, input.userId), gt(userFeedback.createdAt, new Date(now.getTime() - 3600000)))).limit(5);
      if (recent.length >= 5) throw new FeedbackAdmissionError(429);
      const [row] = await tx.insert(userFeedback).values({ ...input, id: randomUUID(), createdAt: now }).returning();
      return row;
    });
  }

  async get(id: string): Promise<FeedbackRecord | undefined> {
    const [row] = await this.database.select().from(userFeedback).where(eq(userFeedback.id, id));
    return row;
  }

  async list() {
    return this.database.select({ id: userFeedback.id, createdAt: userFeedback.createdAt, notification: userFeedback.notification, attempts: userFeedback.attempts, firstAttemptAt: userFeedback.firstAttemptAt }).from(userFeedback).orderBy(desc(userFeedback.createdAt)).limit(100);
  }

  async claim(id: string, envelope: FeedbackEnvelope): Promise<{ row: FeedbackRecord; token: string } | undefined> {
    return this.database.transaction(async tx => {
      const [row] = await tx.select().from(userFeedback).where(eq(userFeedback.id, id)).for('update');
      const now = this.now();
      if (!row || notificationStatus(row, now) === 'accepted' || notificationStatus(row, now) === 'review-required' || (row.leaseUntil && row.leaseUntil > now)) return undefined;
      const token = randomUUID();
      const [claimed] = await tx.update(userFeedback).set({ notification: 'sending', envelope: row.envelope ?? envelope, firstAttemptAt: row.firstAttemptAt ?? now, leaseToken: token, leaseUntil: new Date(now.getTime() + 30000), attempts: row.attempts + 1 }).where(eq(userFeedback.id, id)).returning();
      return { row: claimed, token };
    });
  }

  async unavailable(id: string) {
    await this.database.update(userFeedback).set({ notification: 'unavailable' }).where(and(eq(userFeedback.id, id), eq(userFeedback.notification, 'pending')));
  }

  async settle(id: string, token: string, notification: 'accepted' | 'failed' | 'uncertain', providerId: string | null = null) {
    const rows = await this.database.update(userFeedback).set({ notification, providerId, leaseToken: null, leaseUntil: null }).where(and(eq(userFeedback.id, id), eq(userFeedback.leaseToken, token))).returning({ id: userFeedback.id });
    return rows.length === 1;
  }

  async reconcile(id: string, providerId: string) {
    return this.database.transaction(async tx => {
      const [row] = await tx.select().from(userFeedback).where(eq(userFeedback.id, id)).for('update');
      if (!row || (row.leaseUntil && row.leaseUntil > this.now())) throw new FeedbackAdmissionError(409);
      await tx.update(userFeedback).set({ notification: 'accepted', providerId, leaseToken: null, leaseUntil: null }).where(eq(userFeedback.id, id));
    });
  }
}

import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanupStorageTestDatabases, storageTestDatabase as database, storageTestPool } from './storage.test-database.js';
import { FeedbackStorage } from './feedback/storage.js';

afterAll(cleanupStorageTestDatabases);
const now = new Date('2031-01-01T12:00:00Z');
const store = new FeedbackStorage(database, () => now);
const input = (userId = randomUUID()) => ({ userId, replyEmail: 'fictional@example.test', submissionId: randomUUID(), text: 'Please improve navigation', page: 'map' as const, buildVersion: 'fixture' });

describe('durable feedback admission', () => {
  it('deduplicates concurrent retries and rejects changed payloads without crossing owners', async () => {
    const report = input();
    const rows = await Promise.all(Array.from({ length: 5 }, () => store.save(report)));
    expect(new Set(rows.map(row => row.id)).size).toBe(1);
    expect((await storageTestPool.query('select count(*)::int as count from user_feedback where user_id=$1', [report.userId])).rows[0].count).toBe(1);
    await expect(store.save({ ...report, text: 'changed' })).rejects.toMatchObject({ status: 409 });
    const other = await store.save({ ...report, userId: randomUUID() });
    expect(other.id).not.toBe(rows[0].id);
    expect(rows[0]).toMatchObject({ replyEmail: 'fictional@example.test', notification: 'pending' });
  });
  it('limits new rows transactionally across storage instances but permits saved retries', async () => {
    const userId = randomUUID();
    const reports = Array.from({ length: 6 }, () => input(userId));
    const second = new FeedbackStorage(database, () => now);
    const results = await Promise.allSettled(reports.map((r, i) => (i % 2 ? store : second).save(r)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    const savedIndex = results.findIndex(r => r.status === 'fulfilled');
    expect(await store.save(reports[savedIndex])).toMatchObject({ submissionId: reports[savedIndex].submissionId });
  });
});

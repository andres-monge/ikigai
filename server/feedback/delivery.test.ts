import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { notifyFeedback } from './delivery.js';
import type { FeedbackRecord } from './storage.js';

function fixture() {
  const row = { id: randomUUID(), submissionId: randomUUID(), userId: 'fixture', replyEmail: 'fixture@example.test', text: 'Body <script> & \r\nBcc: nobody@example.test', page: 'map', buildVersion: 'unknown', createdAt: new Date(), notification: 'pending', envelope: null } as FeedbackRecord;
  const storage = { claim: vi.fn(async (_id, envelope) => ({ row: { ...row, envelope }, token: 'claim' })), settle: vi.fn(async () => true), unavailable: vi.fn(), get: vi.fn(async () => row) };
  return { row, storage };
}
describe('feedback email boundary', () => {
  it('sends a fixed plain-text envelope with session Reply-To and a stable server-record key', async () => {
    const { row, storage } = fixture();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'provider-123' }), { status: 200 }));
    expect(await notifyFeedback(row, storage, { apiKey: 'synthetic', from: 'feedback@example.test', fetch })).toBe('accepted');
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(request.body)).toEqual({ from: 'feedback@example.test', to: 'andresmongeliano@gmail.com', reply_to: 'fixture@example.test', subject: 'Nami feedback', text: expect.stringContaining(row.text) });
    expect(request.headers['Idempotency-Key']).toBe(`nami-feedback/${row.id}`);
    expect(storage.settle).toHaveBeenCalledWith(row.id, 'claim', 'accepted', 'provider-123');
  });
  it('does no network work without valid configuration', async () => {
    const { row, storage } = fixture(); const fetch = vi.fn();
    expect(await notifyFeedback(row, storage, { apiKey: '', from: '', fetch })).toBe('unavailable');
    expect(fetch).not.toHaveBeenCalled(); expect(storage.claim).not.toHaveBeenCalled();
  });
  it.each([['timeout', undefined, 'uncertain'], ['rejected', 403, 'failed'], ['server', 503, 'uncertain'], ['throttled', 429, 'failed']])('%s leaves an honest saved notification state', async (_label, status, expected) => {
    const { row, storage } = fixture();
    const fetch = vi.fn(async () => { if (!status) throw new Error('private provider data'); return new Response('{}', { status }); });
    expect(await notifyFeedback(row, storage, { apiKey: 'synthetic', from: 'feedback@example.test', fetch })).toBe(expected);
  });
  it('does not lose saved truth when acceptance status cannot be persisted', async () => {
    const { row, storage } = fixture(); storage.settle.mockRejectedValue(new Error('write failed'));
    const fetch = vi.fn(async () => new Response('{"id":"accepted-id"}'));
    expect(await notifyFeedback(row, storage, { apiKey: 'synthetic', from: 'feedback@example.test', fetch })).toBe('uncertain');
  });
});

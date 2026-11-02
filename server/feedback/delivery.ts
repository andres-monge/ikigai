import { safeReplyEmail, type FeedbackResponse } from '../../shared/feedback.js';
import { notificationStatus, type FeedbackRecord, type FeedbackStorage } from './storage.js';

export const FEEDBACK_RECIPIENT = 'andresmongeliano@gmail.com';
type DeliveryStorage = Pick<FeedbackStorage, 'claim' | 'settle' | 'unavailable' | 'get'>;
export async function notifyFeedback(row: FeedbackRecord, storage: DeliveryStorage, options: {
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): Promise<FeedbackResponse['notification']> {
  if (row.notification === 'accepted') return 'accepted';
  if (!options.apiKey || !safeReplyEmail.safeParse(options.from).success || !safeReplyEmail.safeParse(row.replyEmail).success) {
    await storage.unavailable(row.id);
    return 'unavailable';
  }
  const claim = await storage.claim(row.id, {
    from: options.from, to: FEEDBACK_RECIPIENT, reply_to: row.replyEmail, subject: 'Nami feedback',
    text: `Feedback from: ${row.replyEmail}\nPage: ${row.page === 'map' ? 'Your Map' : 'Chat'}\nTime: ${row.createdAt.toISOString()}\nBuild: ${row.buildVersion}\nFeedback ID: ${row.id}\n\n${row.text}`,
  });
  if (!claim) {
    const latest = await storage.get(row.id);
    return latest ? notificationStatus(latest) : 'uncertain';
  }
  let outcome: 'accepted' | 'failed' | 'uncertain' = 'uncertain';
  let providerId: string | null = null;
  try {
    const response = await (options.fetch ?? fetch)('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `nami-feedback/${row.id}` },
      body: JSON.stringify(claim.row.envelope),
    });
    if (response.ok) {
      const data: unknown = await response.json();
      if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(data.id)) {
        providerId = data.id; outcome = 'accepted';
      }
    } else if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 409) outcome = 'failed';
  } catch { /* The server may have accepted a request whose response was lost. */ }
  try {
    if (!await storage.settle(row.id, claim.token, outcome, providerId)) return 'uncertain';
  } catch { return 'uncertain'; }
  return outcome;
}

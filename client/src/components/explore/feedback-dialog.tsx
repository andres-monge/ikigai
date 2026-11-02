import { useRef, useState } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { feedbackInputSchema, feedbackResponseSchema, type FeedbackInput, type FeedbackResponse } from '@shared/feedback';

const control = 'min-h-11 border-2 border-black px-4 font-display text-xs font-black shadow-[2px_2px_0_rgba(0,0,0,0.65)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50';
export function FeedbackDialog({ page }: { page: 'chat' | 'map' }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<FeedbackResponse['notification'] | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<FeedbackInput | null>(null);
  const inFlight = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const parsed = feedbackInputSchema.safeParse(pending.current ?? { submissionId: crypto.randomUUID(), text, page });
    if (!parsed.success) { setError('Please enter between 1 and 4,000 characters.'); return; }
    pending.current = parsed.data;
    inFlight.current = true; setBusy(true); setError(''); setSaved(null);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'x-nami-request': '1' }, body: JSON.stringify(pending.current),
      });
      if (response.ok) {
        const result = feedbackResponseSchema.parse(await response.json());
        setSaved(result.notification); setText(''); pending.current = null; setUncertain(false);
      } else if ([400, 401, 403, 409, 413, 415, 429].includes(response.status)) {
        if (!uncertain) pending.current = null;
        setError(response.status === 401 ? 'Sign in again to save your feedback. Your text is still here.' : response.status === 429 ? 'Please wait before sending more feedback. Your text is still here.' : 'Your feedback could not be saved. Please check the text and try again.');
      } else throw new Error('Save outcome unknown');
    } catch {
      setUncertain(true);
      setError('We could not confirm the save. Retry to check and save this same feedback safely.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button type="button" className={`${control} bg-white w-full sm:w-auto`}>Send feedback</button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto border-2 border-black bg-white text-stone-900 sm:rounded-none">
      <DialogTitle className="pr-6 font-display text-xl font-black">Send feedback</DialogTitle>
      <DialogDescription className="text-sm text-stone-600">What happened, or what could we improve? Your feedback and signed-in email go to the founder so they can reply. Your conversation is not attached.</DialogDescription>
      {saved !== null ? <div role="status" className="space-y-2 text-sm">
        <p className="font-bold">Feedback saved. Thank you.</p>
        {saved === 'unavailable' || saved === 'failed' ? <p>Email notification is unavailable. Your feedback is saved for review.</p> : null}
        {saved === 'pending' || saved === 'uncertain' || saved === 'review-required' ? <p>Email notification is not confirmed. Your feedback is saved for review.</p> : null}
      </div> : null}
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="feedback-text" className="block text-sm font-bold">Your feedback</label>
        <textarea id="feedback-text" value={text} onChange={event => { setText(event.target.value); setSaved(null); setError(''); }} readOnly={busy || uncertain} maxLength={4000} rows={5} aria-describedby="feedback-limit" className="w-full resize-y border-2 border-black bg-white p-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black" />
        <p id="feedback-limit" className="text-xs text-stone-600">Up to 4,000 characters.</p>
        {error ? <p role="alert" className="text-sm font-bold text-red-800">{error}</p> : null}
        <button type="submit" disabled={busy || !text.trim()} className={`${control} bg-ikigai-yellow`}>{busy ? 'Saving…' : uncertain ? 'Retry save' : 'Send'}</button>
      </form>
    </DialogContent>
  </Dialog>;
}

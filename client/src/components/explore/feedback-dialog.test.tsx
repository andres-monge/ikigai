// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackDialog } from './feedback-dialog';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function open() { fireEvent.click(screen.getByRole('button', { name: 'Send feedback' })); }
function type(text = 'Navigation could be clearer') { fireEvent.change(screen.getByLabelText('Your feedback'), { target: { value: text } }); }
const response = (notification = 'unavailable') => new Response(JSON.stringify({ id: crypto.randomUUID(), saved: true, notification }), { headers: { 'content-type': 'application/json' } });

describe('feedback dialog', () => {
  it('retains text across close/reopen and shows saved success with honest email status', async () => {
    const fetch = vi.fn(async () => response()); vi.stubGlobal('fetch', fetch);
    render(<FeedbackDialog page="map" />); open(); type();
    fireEvent.click(screen.getByRole('button', { name: 'Close' })); open();
    expect((screen.getByLabelText('Your feedback') as HTMLTextAreaElement).value).toBe('Navigation could be clearer');
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    await screen.findByText('Feedback saved. Thank you.');
    expect(screen.getByText(/Email notification is unavailable/)).toBeTruthy();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ page: 'map', text: 'Navigation could be clearer' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('email');
  });
  it('retries an uncertain request with the exact frozen text/key and prevents double sends', async () => {
    let finish!: (value: Response) => void;
    const fetch = vi.fn().mockRejectedValueOnce(new Error('network')).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch); render(<FeedbackDialog page="chat" />); open(); type();
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Your feedback') as HTMLTextAreaElement).readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' })); open();
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true);
    finish(response('accepted')); await screen.findByText('Feedback saved. Thank you.');
  });
  it('a definite rejected save keeps editable text and never shows success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    render(<FeedbackDialog page="chat" />); open(); type();
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true })); await screen.findByRole('alert');
    expect(screen.queryByText('Feedback saved. Thank you.')).toBeNull();
    expect((screen.getByLabelText('Your feedback') as HTMLTextAreaElement).readOnly).toBe(false);
  });
});

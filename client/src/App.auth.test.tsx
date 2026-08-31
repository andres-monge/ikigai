// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useSession, signOut, replaceDocument } = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  replaceDocument: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession, signOut },
}));
vi.mock('@/lib/browser-navigation', () => ({ replaceDocument }));
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));
vi.mock('@/components/header', () => ({ Header: () => <div>Legacy header</div> }));
vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/tooltip', () => ({ TooltipProvider: ({ children }: any) => children }));
vi.mock('@/pages/home', () => ({ Home: () => <div>Legacy questionnaire</div> }));
vi.mock('@/pages/results', () => ({ Results: () => <div>Legacy results</div> }));
vi.mock('@/pages/action-plan', () => ({ ActionPlan: () => <div>Legacy action plan</div> }));
vi.mock('@/pages/not-found', () => ({ NotFound: () => <div>Not found</div> }));
vi.mock('@/pages/login', () => ({ Login: () => <div>Google login</div> }));
vi.mock('@/hooks/use-session-storage', () => ({
  useSessionStorage: (_key: string, initial: unknown) => [initial, vi.fn()],
}));
vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ trackEvent: vi.fn() }),
}));

import App from './App';

describe('canonical auth and legacy route split', () => {
  afterEach(cleanup);

  beforeEach(() => {
    useSession.mockReset();
    signOut.mockReset();
    replaceDocument.mockReset();
    window.sessionStorage.clear();
  });

  it('does not flash a signed-out surface while the root session is loading', () => {
    window.history.replaceState({}, '', '/');
    useSession.mockReturnValue({ data: null, isPending: true });

    render(<App />);

    expect(screen.getByRole('status').textContent).toContain('Checking your session');
    expect(screen.queryByText('Google login')).toBeNull();
    expect(screen.queryByText('Legacy questionnaire')).toBeNull();
  });

  it('sends a signed-out root visitor to /login', async () => {
    window.history.replaceState({}, '', '/');
    useSession.mockReturnValue({ data: null, isPending: false });

    render(<App />);

    await waitFor(() => expect(screen.getByText('Google login')).toBeTruthy());
    expect(window.location.pathname).toBe('/login');
  });

  it('replaces the document after sign-out so stale client session state cannot bounce', async () => {
    window.history.replaceState({}, '', '/');
    useSession.mockReturnValue({
      data: {
        user: { id: 'server-user', name: 'Explorer', email: 'explorer@example.com' },
        session: { id: 'session-id' },
      },
      isPending: false,
    });
    signOut.mockResolvedValue({ data: null, error: null });

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Welcome to Revelio' })).toBeTruthy();
    expect(screen.getByText('explorer@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(replaceDocument).toHaveBeenCalledWith('/login');
    expect(window.location.pathname).toBe('/');
    expect((screen.getByRole('button', { name: 'Signing out…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ['returned', () => signOut.mockResolvedValue({ data: null, error: { message: 'secret' } })],
    ['thrown', () => signOut.mockRejectedValue(new Error('provider secret'))],
  ])('recovers from a %s sign-out failure without leaking detail', async (_kind, arrangeFailure) => {
    window.history.replaceState({}, '', '/');
    useSession.mockReturnValue({
      data: {
        user: { id: 'server-user', name: 'Explorer', email: 'explorer@example.com' },
        session: { id: 'session-id' },
      },
      isPending: false,
    });
    arrangeFailure();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Sign-out could not be completed. Please try again.',
    );
    expect((screen.getByRole('button', { name: 'Sign out' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/provider secret/i)).toBeNull();
  });

  it('keeps /legacy anonymous and does not resolve an auth session', () => {
    window.history.replaceState({}, '', '/legacy');

    render(<App />);

    expect(screen.getByText('Legacy questionnaire')).toBeTruthy();
    expect(screen.getByText('Legacy header')).toBeTruthy();
    expect(useSession).not.toHaveBeenCalled();
  });

  it.each([
    ['/results', 'Legacy results'],
    ['/action-plan', 'Legacy action plan'],
  ])('preserves the anonymous legacy route %s', (path, expected) => {
    window.history.replaceState({}, '', path);

    render(<App />);

    expect(screen.getByText(expected)).toBeTruthy();
    expect(useSession).not.toHaveBeenCalled();
  });
});

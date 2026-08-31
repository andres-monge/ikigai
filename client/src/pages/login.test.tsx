// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { signInSocial } = vi.hoisted(() => ({ signInSocial: vi.fn() }));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { social: signInSocial },
  },
}));

import { Login } from './login';

describe('Google login entry', () => {
  afterEach(cleanup);

  beforeEach(() => {
    signInSocial.mockReset();
    window.history.replaceState({}, '', '/login');
  });

  it('starts only Google OAuth and fixes success/error callbacks', async () => {
    signInSocial.mockResolvedValue({ data: { redirect: true }, error: null });
    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => {
      expect(signInSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: '/',
        errorCallbackURL: '/login',
      });
    });
  });

  it('shows safe paused-signup copy without leaking OAuth details', () => {
    window.history.replaceState({}, '', '/login?error=signup_disabled&detail=provider-secret');
    render(<Login />);

    expect(screen.getByRole('alert').textContent).toContain(
      'New account sign-ups are paused. Existing explorers can still sign in with Google.',
    );
    expect(screen.queryByText(/provider-secret/i)).toBeNull();
  });

  it('turns provider failures into safe retry copy', async () => {
    signInSocial.mockRejectedValue(new Error('provider response with token=secret'));
    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Google sign-in could not be completed. Please try again.',
    );
    expect(screen.queryByText(/token=secret/i)).toBeNull();
  });

  it('turns resolved OAuth failures into safe retry copy', async () => {
    signInSocial.mockResolvedValue({
      data: null,
      error: { message: 'provider response with token=secret' },
    });
    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Google sign-in could not be completed. Please try again.',
    );
    expect(screen.queryByText(/token=secret/i)).toBeNull();
  });
});

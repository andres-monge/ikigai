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

  it('introduces the exploration and offers optional vision reading before Google sign-in', () => {
    render(<Login />);

    expect(screen.getByRole('heading', { name: 'Figure out what to work on next.' })).toBeTruthy();
    expect(screen.getByText('Explore possible paths, try small projects, and learn what actually fulfills you.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Our Vision' }).getAttribute('href')).toBe('/our-vision');
    expect(screen.getByRole('link', { name: 'Nami home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeTruthy();
    expect(signInSocial).not.toHaveBeenCalled();
  });

  it('keeps pending Google sign-in exclusive and allows an explicit retry after a settled handoff stays on page', async () => {
    let settle!: (value: unknown) => void;
    signInSocial.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }))
      .mockResolvedValue({ data: { redirect: true }, error: null });
    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    const pending = screen.getByRole('button', { name: /opening google/i });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pending);
    expect(signInSocial).toHaveBeenCalledTimes(1);

    settle({ data: { redirect: true }, error: null });

    await waitFor(() => {
      expect(signInSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: '/',
        errorCallbackURL: '/login',
      });
      expect((screen.getByRole('button', { name: /continue with google/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(signInSocial).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(signInSocial).toHaveBeenCalledTimes(2);
    await waitFor(() => expect((screen.getByRole('button', { name: /continue with google/i }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
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
    expect((screen.getByRole('button', { name: /continue with google/i }) as HTMLButtonElement).disabled).toBe(false);
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
    expect((screen.getByRole('button', { name: /continue with google/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

const GENERIC_ERROR = 'Google sign-in could not be completed. Please try again.';
const SIGNUPS_PAUSED =
  'New account sign-ups are paused. Existing explorers can still sign in with Google.';

function initialErrorMessage(): string | null {
  const error = new URLSearchParams(window.location.search).get('error');
  if (!error) {
    return null;
  }

  return error === 'signup_disabled' ? SIGNUPS_PAUSED : GENERIC_ERROR;
}

export function Login() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);

  async function handleGoogleSignIn() {
    setIsSigningIn(true);
    setErrorMessage(null);

    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
        errorCallbackURL: '/login?error=oauth_failed',
      });

      if (result.error) {
        setErrorMessage(GENERIC_ERROR);
        setIsSigningIn(false);
      }
    } catch {
      setErrorMessage(GENERIC_ERROR);
      setIsSigningIn(false);
    }
  }

  return (
    <main className="min-h-screen bg-ikigai-beige px-6 py-16 text-slate-900">
      <section className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-ikigai-blue">
          Revelio
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Figure out what to work on next.</h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">
          Sign in to keep your exploration and return to it across sessions.
        </p>

        {errorMessage ? (
          <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSigningIn}
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-md bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
        >
          {isSigningIn ? 'Opening Google…' : 'Continue with Google'}
        </button>

        <p className="mt-4 text-sm text-slate-500">
          Revelio requests only your basic Google identity: name, email, and profile image.
        </p>
      </section>
    </main>
  );
}

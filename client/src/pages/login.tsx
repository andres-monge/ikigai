import { useState } from 'react';
import { SiGoogle } from 'react-icons/si';
import { authClient } from '@/lib/auth-client';
import { PublicHeader } from '@/components/public-header';

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
        errorCallbackURL: '/login',
      });

      if (result.error) {
        setErrorMessage(GENERIC_ERROR);
      }
    } catch {
      setErrorMessage(GENERIC_ERROR);
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ikigai-beige text-stone-900">
      <PublicHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16 sm:py-24">
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <h1 className="max-w-[44rem] text-balance font-display text-4xl font-black leading-[1.12] tracking-tight sm:text-6xl lg:text-[4rem]">Figure out what to work on next.</h1>
          <p className="mt-8 max-w-[39rem] text-balance text-lg leading-relaxed text-stone-600 sm:mt-10 sm:text-2xl">
            Explore possible paths, try small projects, and learn what actually fulfills you.
          </p>

          {errorMessage ? (
            <p role="alert" className="mt-6 w-full max-w-lg border-2 border-red-800 bg-red-50 p-3 text-sm text-red-800">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="mt-10 inline-flex min-h-14 w-full max-w-[22rem] items-center justify-center gap-4 border-2 border-black bg-ikigai-teal px-5 py-4 font-display text-lg font-black text-black shadow-[4px_4px_0_rgba(0,0,0,0.85)] transition-[transform,box-shadow] hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black disabled:cursor-wait disabled:opacity-60 sm:mt-12"
          >
            <SiGoogle aria-hidden="true" className="h-5 w-5 shrink-0" />
            {isSigningIn ? 'Opening Google…' : 'Continue with Google'}
          </button>

          <p className="mt-7 max-w-lg text-sm leading-6 text-stone-600 sm:mt-8">
            Sign in to save your progress and pick up where you left off.
          </p>
        </section>
      </main>
    </div>
  );
}

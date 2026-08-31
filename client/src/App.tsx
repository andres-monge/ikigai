/**
 * Top-level route ownership for the authenticated product and the preserved
 * anonymous questionnaire. Auth state is resolved only on `/` and `/login`;
 * legacy routes do not call Better Auth.
 */

import { useEffect, useRef, useState } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { Analytics } from '@vercel/analytics/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/header';
import { Home } from '@/pages/home';
import { Results } from '@/pages/results';
import { ActionPlan } from '@/pages/action-plan';
import { Login } from '@/pages/login';
import { NotFound } from '@/pages/not-found';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useAnalytics } from '@/hooks/use-analytics';
import { authClient } from '@/lib/auth-client';
import type { Language } from '@/lib/i18n';
import type { FullAssessment } from '@/types/assessment';

function SessionLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-ikigai-beige px-6 text-slate-600"
    >
      Checking your session…
    </main>
  );
}

function AuthenticatedRoot() {
  const { data: session, isPending } = authClient.useSession();
  const [, navigate] = useLocation();
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      navigate('/login', { replace: true });
    }
  }, [isPending, navigate, session]);

  if (isPending || !session) {
    return <SessionLoading />;
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (!result.error) {
        navigate('/login', { replace: true });
      }
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-ikigai-beige px-6 py-16 text-slate-900">
      <section className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-ikigai-blue">
              Revelio
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">Welcome to Revelio</h1>
            <p className="mt-3 text-slate-600">{session.user.email}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>

        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold">Your workspace is ready.</h2>
          <p className="mt-2 max-w-2xl leading-7 text-slate-600">
            Your authenticated exploration experience will appear here as the Revelio Method is added.
          </p>
        </div>
      </section>
    </main>
  );
}

function LoginEntry() {
  const { data: session, isPending } = authClient.useSession();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isPending && session) {
      navigate('/', { replace: true });
    }
  }, [isPending, navigate, session]);

  if (isPending || session) {
    return <SessionLoading />;
  }

  return <Login />;
}

function LegacyApp() {
  const [language, setLanguage] = useSessionStorage<Language>('language', 'en');
  const [sessionId, setSessionId] = useSessionStorage<string>('sessionId', '');
  const [, setSession] = useSessionStorage<FullAssessment | null>('session', null);
  const [location, navigate] = useLocation();
  const { trackEvent } = useAnalytics();
  const hasTrackedVisit = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      const newId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      setSessionId(newId);
    }
  }, [sessionId, setSessionId]);

  useEffect(() => {
    if (!hasTrackedVisit.current && sessionId) {
      trackEvent('visit');
      hasTrackedVisit.current = true;
    }
  }, [sessionId, trackEvent]);

  const handleNavigateHome = () => {
    navigate('/legacy');
  };

  const handleStartOver = async () => {
    const fromPage = location === '/action-plan' ? 'action-plan' : 'results';

    try {
      await fetch('/api/session/start-over', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, fromPage }),
        credentials: 'include',
      });
    } catch (error) {
      console.error('Failed to notify server of start over:', error);
    }

    setSession(null);
    const newId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    setSessionId(newId);
    navigate('/legacy');
  };

  return (
    <TooltipProvider>
      <Header
        language={language}
        onLanguageChange={setLanguage}
        onNavigateHome={handleNavigateHome}
      />
      <main className="mx-auto max-w-7xl bg-ikigai-beige">
        <Switch>
          <Route path="/legacy">
            {() => <Home language={language} sessionId={sessionId} />}
          </Route>
          <Route path="/results">
            {() => (
              <Results
                language={language}
                sessionId={sessionId}
                onStartOver={handleStartOver}
              />
            )}
          </Route>
          <Route path="/action-plan">
            {() => (
              <ActionPlan
                language={language}
                sessionId={sessionId}
                onStartOver={handleStartOver}
              />
            )}
          </Route>
        </Switch>
      </main>
      <Toaster />
      <Analytics />
    </TooltipProvider>
  );
}

function App() {
  return (
    <Switch>
      <Route path="/login" component={LoginEntry} />
      <Route path="/legacy" component={LegacyApp} />
      <Route path="/results" component={LegacyApp} />
      <Route path="/action-plan" component={LegacyApp} />
      <Route path="/" component={AuthenticatedRoot} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default App;

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
import { OurVision } from '@/pages/our-vision';
import { Explore } from '@/pages/explore';
import { NotFound } from '@/pages/not-found';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useAnalytics } from '@/hooks/use-analytics';
import { authClient } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';
import { replaceDocument } from '@/lib/browser-navigation';
import type { Language } from '@/lib/i18n';
import type { FullAssessment } from '@/types/assessment';

function SessionLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-ikigai-beige px-6 text-stone-600"
    >
      Checking your session…
    </main>
  );
}

function hasAuthenticatedUser(
  session: unknown,
): session is { user: { id: string; email: string } } {
  if (!session || typeof session !== 'object' || !('user' in session)) {
    return false;
  }

  const { user } = session;
  return Boolean(
    user
      && typeof user === 'object'
      && 'id' in user
      && typeof user.id === 'string'
      && user.id.trim()
      && 'email' in user
      && typeof user.email === 'string'
      && user.email.trim(),
  );
}

function AuthenticatedRoot() {
  const { data: session, isPending } = authClient.useSession();
  const [, navigate] = useLocation();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !hasAuthenticatedUser(session)) {
      navigate('/login', { replace: true });
    }
  }, [isPending, navigate, session]);

  if (isPending || !hasAuthenticatedUser(session)) {
    return <SessionLoading />;
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSignOutError('Sign-out could not be completed. Please try again.');
        setIsSigningOut(false);
      } else {
        replaceDocument('/login');
      }
    } catch {
      setSignOutError('Sign-out could not be completed. Please try again.');
      setIsSigningOut(false);
    }
  }

  return <Explore
    userEmail={session.user.email}
    isSigningOut={isSigningOut}
    signOutError={signOutError}
    onSignOut={handleSignOut}
  />;
}

function LoginEntry() {
  const { data: session, isPending } = authClient.useSession();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isPending && hasAuthenticatedUser(session)) {
      navigate('/', { replace: true });
    }
  }, [isPending, navigate, session]);

  if (isPending || hasAuthenticatedUser(session)) {
    return <SessionLoading />;
  }

  return <Login />;
}

function createLegacySessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
      setSessionId(createLegacySessionId());
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
    setSessionId(createLegacySessionId());
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
  useTheme();
  return (
    <Switch>
      <Route path="/our-vision" component={OurVision} />
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

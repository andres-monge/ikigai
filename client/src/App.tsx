import { useEffect, useState } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { Login } from '@/pages/login';
import { OurVision } from '@/pages/our-vision';
import { Explore } from '@/pages/explore';
import { NotFound } from '@/pages/not-found';
import { authClient } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';
import { replaceDocument } from '@/lib/browser-navigation';

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

function App() {
  useTheme();
  return (
    <Switch>
      <Route path="/our-vision" component={OurVision} />
      <Route path="/login" component={LoginEntry} />
      <Route path="/legacy">{() => <Redirect to="/login" replace />}</Route>
      <Route path="/results">{() => <Redirect to="/login" replace />}</Route>
      <Route path="/action-plan">{() => <Redirect to="/login" replace />}</Route>
      <Route path="/" component={AuthenticatedRoot} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default App;

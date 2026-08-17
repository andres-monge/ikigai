/**
* @file App.tsx
*
* @description
* Top-level React component for the Purpose Finder SPA. The application
* flow is URL-driven with routes for home, results, and action plan pages.
*
* @dependencies
* - Wouter: lightweight router for React
* - Shared UI primitives: Header, Toaster, TooltipProvider
*/

import { useEffect, useRef } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { Analytics } from '@vercel/analytics/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/header';
import { Home } from '@/pages/home';
import { Results } from '@/pages/results';
import { ActionPlan } from '@/pages/action-plan';
import { NotFound } from '@/pages/not-found';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useAnalytics } from '@/hooks/use-analytics';
import type { Language } from '@/lib/i18n';
import type { FullAssessment } from '@/types/assessment';

function App() {
/* ------------------------------------------------------------------------ */
/*      Global (CROSS-PAGE) STATE      */
/* ------------------------------------------------------------------------ */
const [language, setLanguage] = useSessionStorage<Language>('language', 'en');

/** Anonymous session identifier trusted by the backend */
const [sessionId, setSessionId] = useSessionStorage<string>('sessionId', '');

/** Persisted results used by both Results and Action-Plan pages. */
const [, setSession] = useSessionStorage<FullAssessment | null>(
'session',
null,
);

const [location, navigate] = useLocation();

/* ------------------------------------------------------------------------ */
/*      EFFECTS      */
/* ------------------------------------------------------------------------ */

/** Ensure we always have a sessionId available for API calls. */
useEffect(() => {
if (!sessionId) {
const newId =
Math.random().toString(36).slice(2) + Date.now().toString(36);
setSessionId(newId);
}
}, [sessionId, setSessionId]);

/* ------------------------------------------------------------------------ */
/*      ANALYTICS      */
/* ------------------------------------------------------------------------ */

const { trackEvent } = useAnalytics();

/** Ref to ensure we only fire the visit event once per page load. */
const hasTrackedVisit = useRef(false);

/**
 * Track the 'visit' analytics event once when the app mounts.
 * Uses a ref to ensure only one event is fired even if dependencies change.
 */
useEffect(() => {
  if (!hasTrackedVisit.current && sessionId) {
    trackEvent('visit');
    hasTrackedVisit.current = true;
  }
}, [sessionId, trackEvent]);

/* ------------------------------------------------------------------------ */
/*      GLOBAL EVENT HANDLERS      */
/* ------------------------------------------------------------------------ */



/**
* Navigates to home page without clearing session data.
* Used by the Header logo/title click - preserves existing results.
*/
const handleNavigateHome = () => {
  navigate('/');
};

/**
* Clears current session data and kicks the user back to the landing page.
* Used by the Results page's "Start Over" button.
*
* Calls the API to log a 'start_over' analytics event (with fromPage metadata)
* while preserving session data for analysis.
*/
const handleStartOver = async () => {
// Determine which page the user is starting over from
const fromPage = location === '/action-plan' ? 'action-plan' : 'results';

// Call API to log start_over event (server-side for reliability in serverless)
try {
  await fetch('/api/session/start-over', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, fromPage }),
    credentials: 'include'
  });
} catch (error) {
  // Log error but continue - don't block user from resetting
  console.error('Failed to notify server of start over:', error);
}

// Always reset local state regardless of API result
setSession(null);
// Generate a brand-new session id to avoid contaminating a new run
const newId =
Math.random().toString(36).slice(2) + Date.now().toString(36);
setSessionId(newId);
navigate('/');
};

/* ------------------------------------------------------------------------ */
/*      RENDER      */
/* ------------------------------------------------------------------------ */

return (
<TooltipProvider>
<Header language={language} onLanguageChange={setLanguage} onNavigateHome={handleNavigateHome} />
<main className="max-w-7xl mx-auto bg-ikigai-beige">
<Switch>
{/* Preserved anonymous questionnaire entry for the revamp transition */}
<Route path="/legacy">
{() => <Home language={language} sessionId={sessionId} />}
</Route>

{/* Landing + Inline Questionnaire (SinglePageQuestionnaire to be introduced in Step 2) */}
<Route path="/" component={() => <Home language={language} sessionId={sessionId} />} />

{/* Results */}
<Route
path="/results"
component={() => (
<Results
language={language}
sessionId={sessionId}
onStartOver={handleStartOver}
/>
)}
/>

{/* Action Plan */}
<Route
path="/action-plan"
component={() => (
<ActionPlan
language={language}
sessionId={sessionId}
onStartOver={handleStartOver}
/>
)}
/>

{/* 404 */}
<Route component={NotFound} />
</Switch>
</main>



<Toaster />
<Analytics />
</TooltipProvider>
);
}

export default App;

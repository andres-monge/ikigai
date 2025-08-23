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

import { useState, useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/header';
import { Home } from '@/pages/home';
import { Results } from '@/pages/results';
import { ActionPlan } from '@/pages/action-plan';
import { NotFound } from '@/pages/not-found';
import { useSessionStorage } from '@/hooks/use-session-storage';
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

const [, navigate] = useLocation();

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
/*      GLOBAL EVENT HANDLERS      */
/* ------------------------------------------------------------------------ */



/**
* Clears current session data and kicks the user back to the landing page.
* Used by the Results page's "Start Over" button.
*
* ✨ Step 8 Enhancement ✨
* Now calls the API to delete server-side data before clearing local state.
*/
const handleStartOver = async () => {
// Call API to delete server-side session data
try {
  await fetch('/api/session/start-over', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
    credentials: 'include'
  });
} catch (error) {
  // Log error but continue - don't block user from resetting
  console.error('Failed to clear server session data:', error);
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
<Header language={language} onLanguageChange={setLanguage} onStartOver={handleStartOver} />
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
<Switch>
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
</TooltipProvider>
);
}

export default App;
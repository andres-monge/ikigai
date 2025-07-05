/**
* @file App.tsx
*
* @description
* Top-level React component for the Purpose Finder SPA. After Step 22 the
* application flow is URL-driven instead of a local "state machine".
*
* ✨ **Updates in Step 22** ✨
* - Added `chatContext` state to differentiate between 'discovery' and
*   'action_plan' refinement conversations.
* - `handleOpenChat` now accepts a context parameter.
* - The `<Route>` for `/action-plan` now passes `onOpenChat` and `onStartOver`
*   props, just like the `/results` route, allowing for a consistent user experience.
*
* @dependencies
* - Wouter: lightweight router for React
* - Shared UI primitives: Header, ChatInterface, Toaster, TooltipProvider
*
* @notes
* - The `ChatInterface` component is now passed the `chatContext` prop,
*   which is crucial for the backend to load the correct prompt.
*/

import { useState, useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/header';
import { ChatInterface } from '@/components/chat-interface';
import { Home } from '@/pages/home';
import { Questionnaire } from '@/pages/questionnaire';
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

/** Chat drawer is controlled at the top level so any page can open it. */
const [isChatOpen, setIsChatOpen] = useState(false);
const [chatContext, setChatContext] = useState<'discovery' | 'action_plan'>(
'discovery',
);
/** When refining a single Purpose Path, this holds its ID, otherwise null */
const [chatPathId, setChatPathId] = useState<number | null>(null);

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

const handleOpenChat = (
  context: 'discovery' | 'action_plan',
  /** Optional ID when refining an individual Purpose Path */
  pathId: number | null = null,
) => {
  setChatContext(context);
  setChatPathId(pathId);
  setIsChatOpen(true);
};

const handleCloseChat = () => setIsChatOpen(false);

/**
* Clears current session data and kicks the user back to the landing page.
* Used by the Results page's "Start Over" button.
*/
const handleStartOver = () => {
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
<Header language={language} onLanguageChange={setLanguage} />
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
<Switch>
{/* Landing */}
<Route path="/" component={() => <Home language={language} />} />

{/* Questionnaire */}
<Route
path="/questionnaire"
component={() => (
<Questionnaire
language={language}
sessionId={sessionId}
onNavigate={navigate}
/>
)}
/>

{/* Results */}
<Route
path="/results"
component={() => (
<Results
language={language}
sessionId={sessionId}
onOpenChat={(pathId: number) => handleOpenChat('discovery', pathId)}
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
onOpenChat={() => handleOpenChat('action_plan')}
onStartOver={handleStartOver}
/>
)}
/>

{/* 404 */}
<Route component={NotFound} />
</Switch>
</main>

{/* Global Chat overlay */}
<ChatInterface
key={chatContext}
isOpen={isChatOpen}
onClose={handleCloseChat}
sessionId={sessionId}
language={language}
context={chatContext}
pathId={chatPathId}
/>

<Toaster />
</TooltipProvider>
);
}

export default App;
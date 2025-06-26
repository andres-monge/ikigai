/**
 * @file App.tsx
 *
 * @description
 * Top-level React component for the Purpose Finder SPA.  After Step 18 the
 * application flow is URL-driven instead of a local “state machine”.  The
 * component now:
 *   • Configures <wouter> routes for "/", "/questionnaire", "/results",
 *     and "/action-plan".
 *   • Keeps global UI state that must outlive route changes
 *       – selected language
 *       – anonymous sessionId
 *       – Chat drawer visibility
 *   • Exposes utility callbacks (openChat, startOver) to child routes
 *     through render-prop routes so pages can invoke global behaviours
 *     without context boilerplate.
 *
 * @dependencies
 * - Wouter: lightweight router for React
 * - TanStack Query: no longer imported here; queries/mutations live inside pages
 * - Shared UI primitives: Header, ChatInterface, Toaster, TooltipProvider
 *
 * @notes
 * - Generating a sessionId at first load remains here so *all* pages see a
 *   valid id (used by Questionnaire when calling /api/analyze).
 * - Loading overlays are now handled by individual pages that actually need
 *   them (currently only Questionnaire).
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
import type { AssessmentResults } from '@/types/assessment';

function App() {
  /* ------------------------------------------------------------------------ */
  /*                       GLOBAL (CROSS-PAGE) STATE                          */
  /* ------------------------------------------------------------------------ */
  const [language, setLanguage] = useSessionStorage<Language>('language', 'en');

  /** Anonymous session identifier trusted by the backend */
  const [sessionId, setSessionId] = useSessionStorage<string>('sessionId', '');

  /** Chat drawer is controlled at the top level so any page can open it. */
  const [isChatOpen, setIsChatOpen] = useState(false);

  /** Persisted results used by both Results and Action-Plan pages. */
  const [, setResults] = useSessionStorage<AssessmentResults | null>(
    'results',
    null
  );

  const [, navigate] = useLocation();

  /* ------------------------------------------------------------------------ */
  /*                                EFFECTS                                   */
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
  /*                          GLOBAL EVENT HANDLERS                           */
  /* ------------------------------------------------------------------------ */

  const handleOpenChat = () => setIsChatOpen(true);
  const handleCloseChat = () => setIsChatOpen(false);

  /**
   * Clears current session data and kicks the user back to the landing page.
   * Used by the Results page’s "Start Over" button.
   */
  const handleStartOver = () => {
    setResults(null);
    // Generate a brand-new session id to avoid contaminating a new run
    const newId =
      Math.random().toString(36).slice(2) + Date.now().toString(36);
    setSessionId(newId);
    navigate('/');
  };

  /* ------------------------------------------------------------------------ */
  /*                               RENDER                                     */
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
                onOpenChat={handleOpenChat}
                onStartOver={handleStartOver}
              />
            )}
          />

          {/* Action Plan (placeholder – fleshed out in later steps) */}
          <Route
            path="/action-plan"
            component={() => <ActionPlan language={language} />}
          />

          {/* 404 */}
          <Route component={NotFound} />
        </Switch>
      </main>

      {/* Global Chat overlay */}
      <ChatInterface
        isOpen={isChatOpen}
        onClose={handleCloseChat}
        sessionId={sessionId}
        language={language}
      />

      <Toaster />
    </TooltipProvider>
  );
}

export default App;

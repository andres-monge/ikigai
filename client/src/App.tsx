import { useState } from 'react';
import { Router, Route } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/header';
import { Home } from '@/pages/home';
import { Questionnaire } from '@/pages/questionnaire';
import { Results } from '@/pages/results';
import { ActionPlan } from '@/pages/action-plan';
import { NotFound } from '@/pages/not-found';
import { type Language } from '@/lib/i18n';

const queryClient = new QueryClient();

function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [sessionId] = useState(() => crypto.randomUUID());

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-50">
        <Header language={language} onLanguageChange={setLanguage} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Router>
            <Route path="/" component={() => <Home language={language} />} />
            <Route 
              path="/questionnaire" 
              component={() => <Questionnaire language={language} sessionId={sessionId} />} 
            />
            <Route 
              path="/results" 
              component={() => <Results language={language} sessionId={sessionId} />} 
            />
            <Route 
              path="/action-plan" 
              component={() => <ActionPlan language={language} sessionId={sessionId} />} 
            />
            <Route component={NotFound} />
          </Router>
        </main>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}

export default App;
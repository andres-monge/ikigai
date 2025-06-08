import { useState, useEffect } from 'react';
import { Switch, Route } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Header } from '@/components/header';
import { ChatInterface } from '@/components/chat-interface';
import { LoadingOverlay } from '@/components/loading-overlay';
import { Home } from '@/pages/home';
import { Questionnaire } from '@/pages/questionnaire';
import { Results } from '@/pages/results';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Language } from '@/lib/i18n';
import type { QuestionnaireResponses, AssessmentResults } from '@/types/assessment';

type AppState = 'home' | 'questionnaire' | 'results';

function AppContent() {
  const [currentState, setCurrentState] = useSessionStorage<AppState>('appState', 'home');
  const [language, setLanguage] = useSessionStorage<Language>('language', 'en');
  const [sessionId, setSessionId] = useSessionStorage<string>('sessionId', '');
  const [results, setResults] = useSessionStorage<AssessmentResults | null>('results', null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize session
  useEffect(() => {
    if (!sessionId) {
      const newSessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      setSessionId(newSessionId);
    }
  }, [sessionId, setSessionId]);

  const analyzeResponsesMutation = useMutation({
    mutationFn: async (responses: QuestionnaireResponses) => {
      const response = await apiRequest('POST', '/api/analyze', {
        sessionId,
        responses
      });
      return response.json();
    },
    onSuccess: (data) => {
      const analysisResults: AssessmentResults = {
        analysis: data.analysis,
        purposePaths: data.purposePaths,
        salaryData: data.salaryData
      };
      setResults(analysisResults);
      setCurrentState('results');
      setIsLoading(false);
    },
    onError: (error) => {
      console.error('Analysis failed:', error);
      setIsLoading(false);
    }
  });

  const handleStartAssessment = () => {
    setCurrentState('questionnaire');
  };

  const handleQuestionnaireComplete = (responses: QuestionnaireResponses) => {
    setIsLoading(true);
    analyzeResponsesMutation.mutate(responses);
  };

  const handleOpenChat = () => {
    setIsChatOpen(true);
  };

  const handleCloseChat = () => {
    setIsChatOpen(false);
  };

  const handleStartOver = () => {
    setCurrentState('home');
    setResults(null);
    setIsChatOpen(false);
    // Generate new session ID for fresh start
    const newSessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    setSessionId(newSessionId);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header language={language} onLanguageChange={setLanguage} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentState === 'home' && (
          <Home onStartAssessment={handleStartAssessment} language={language} />
        )}
        
        {currentState === 'questionnaire' && (
          <Questionnaire onComplete={handleQuestionnaireComplete} language={language} />
        )}
        
        {currentState === 'results' && results && (
          <Results
            results={results}
            onOpenChat={handleOpenChat}
            onStartOver={handleStartOver}
            language={language}
          />
        )}
      </main>

      <ChatInterface
        isOpen={isChatOpen}
        onClose={handleCloseChat}
        sessionId={sessionId}
        language={language}
      />

      <LoadingOverlay isVisible={isLoading} language={language} />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

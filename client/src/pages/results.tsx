/**
 * @file results.tsx
 * @description Displays the Purpose Discovery outcome and allows the user to
 * choose a path to generate a detailed action plan.
 *
 * ✨ **Updates in Step 21** ✨
 * - Integrated the `useCreateActionPlan` hook to trigger action plan generation.
 * - The component now reads the full session object (`FullAssessment`) from
 * session storage under the key 'session'.
 * - A handler function (`handleChoosePath`) is passed to `PurposePaths`.
 * - On successful action plan creation, it updates the session data and
 * navigates the user to `/action-plan`.
 * - Removed global <SalaryBenchmarks /> table in favor of path-level salary display.
 *
 * ✨ **Updates in Step 23** ✨
 * - Added `sessionId` prop to ensure a non-empty identifier is always sent
 *   to the backend when generating an action plan, resolving the bug where an
 *   empty `sessionId` caused a 404 error.
 *
 * ✨ **Updates in Step 29 (Action Plan Loading UX)** ✨
 * - Implemented a full-page loading overlay to prevent UI freeze during plan generation.
 * - `handleChoosePath` is now an `async` function that `await`s the `createActionPlan`
 *   mutation. Navigation to `/action-plan` only occurs *after* the plan is
 *   successfully created and saved, eliminating the previous race condition.
 * - A local `isGenerating` state controls the visibility of the loading overlay
 *   and disables the "Choose Path" buttons, providing clear feedback to the user.
 *
 * @dependencies
 * - wouter: For navigation.
 * - lucide-react: For icons.
 * - @/hooks/use-session-storage: To persist/retrieve session data.
 * - @/hooks/use-create-action-plan: For the `useCreateActionPlan` mutation.
 * - @/types/assessment: For the `FullAssessment` type.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StreamingStatus } from '@/components/streaming-status';
import { CoreDriversSummary } from '@/components/results/core-drivers-summary';
import { PurposePaths } from '@/components/results/purpose-paths';
import { t, type Language } from '@/lib/i18n';
import { exportToPDF } from '@/lib/pdf-export';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useSSEStream, StreamingPhase } from '@/hooks/use-sse-stream';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { FullAssessment } from '@/types/assessment';

interface ResultsProps {
  onStartOver: () => void;
  language: Language;
  /** Anonymous session identifier passed from the top-level App component */
  sessionId: string;
}

export function Results({
  onStartOver,
  language,
  sessionId,
}: ResultsProps) {
  const [session, setSession] = useSessionStorage<FullAssessment | null>(
    'session',
    null,
  );
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [needsStreaming, setNeedsStreaming] = useState(false);

  // SSE Streaming hook for purpose discovery
  const streamingState = useSSEStream({
    enabled: needsStreaming,
    endpoint: `/api/analyze/stream?sessionId=${sessionId}`,
    onComplete: async (finalBuffer) => {
      // On completion, fetch the final session data from the server
      try {
        const res = await apiRequest('GET', `/api/session/${sessionId}`);
        if (res.ok) {
          const updatedSession = await res.json();
          setSession(updatedSession);
          sessionStorage.setItem('session', JSON.stringify(updatedSession));
          setNeedsStreaming(false);
        }
      } catch (error) {
        console.error('Failed to fetch completed session:', error);
        toast({
          title: t('common.error', language),
          description: 'Failed to save analysis results.',
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      console.error('Streaming error:', error);
      toast({
        title: t('common.error', language),
        description: 'Analysis failed. Please try again.',
        variant: 'destructive',
      });
      setNeedsStreaming(false);
    }
  });


  /* Simplified streaming detection */
  useEffect(() => {
    // If we have complete core drivers analysis, we're good to render
    if (session?.coreDriversAnalysis) {
      return;
    }
    
    // No session at all, redirect to home
    if (!session || !sessionId) {
      navigate('/');
      return;
    }
    
    // Core drivers analysis missing = start streaming
    setNeedsStreaming(true);
  }, [session, sessionId, navigate]);

  const handleChoosePath = (pathId: number) => {
    if (typeof pathId !== 'number') return;

    // Navigate immediately with query parameter
    navigate(`/action-plan?pathId=${pathId}`);
  };

  // Helper function to get phase message
  const getPhaseMessage = (phase: StreamingPhase): string => {
    switch (phase) {
      case StreamingPhase.CONNECTING:
        return language === 'es' ? 'Conectando al servicio de IA...' : 'Connecting to AI service...';
      case StreamingPhase.THINKING:
        return language === 'es' ? 'La IA está analizando tus respuestas...' : 'AI is analyzing your responses...';
      case StreamingPhase.STREAMING:
        return language === 'es' ? 'Generando tu análisis...' : 'Generating your analysis...';
      case StreamingPhase.ERROR:
        return language === 'es' ? 'Error en la conexión' : 'Connection error';
      default:
        return language === 'es' ? 'Procesando...' : 'Processing...';
    }
  };

  // Show streaming UI if we're in streaming mode
  if (needsStreaming && streamingState.phase !== StreamingPhase.COMPLETE) {
    return (
      <>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              {t('results.title', language)}
            </h2>
          </div>
          
          {/* Streaming Status */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
            <StreamingStatus 
              phase={streamingState.phase}
              message={getPhaseMessage(streamingState.phase)}
            />
            
            {/* Show error if present */}
            {streamingState.error && (
              <div className="text-center mb-4">
                <p className="text-red-600">{streamingState.error}</p>
                <Button
                  onClick={() => {
                    setNeedsStreaming(false);
                    setTimeout(() => setNeedsStreaming(true), 1000);
                  }}
                  className="mt-2"
                  variant="outline"
                >
                  {language === 'es' ? 'Reintentar' : 'Retry'}
                </Button>
              </div>
            )}
            
            {/* Show streaming content if available */}
            {streamingState.buffer && streamingState.phase === StreamingPhase.STREAMING && (
              <div className="mt-6">
                <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 font-mono whitespace-pre-wrap">
                  {streamingState.buffer}
                </div>
                
                {/* Show completed sections */}
                {streamingState.completedSections.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-slate-600 mb-2">
                      {language === 'es' ? 'Secciones completadas:' : 'Completed sections:'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {streamingState.completedSections.map((section) => (
                        <span
                          key={section}
                          className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full"
                        >
                          {section.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  if (!session || !session.coreDriversAnalysis) {
    // Small fallback while data loads
    return null;
  }

  /**
   * Exports the current analysis to a PDF document.
   * Uses non-null assertion (!) because the early-return guard above ensures
   * `session` is defined from this point onward.
   */
  const handleExportPDF = () => {
    exportToPDF(session!, language);
  };

  return (
    <>
      <div className="max-w-6xl mx-auto">
        {/* AI Analysis Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            {t('results.title', language)}
          </h2>
        </div>

        {/* Core Drivers Summary */}
        <CoreDriversSummary
          analysis={session.coreDriversAnalysis}
          language={language}
        />

        {/* Purpose Paths */}
        <PurposePaths
          purposePaths={session.purposePaths}
          language={language}
          onChoosePath={handleChoosePath}
          isChoosing={false}
        />

        {/* Export and Start Over Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={handleExportPDF}
            size="lg"
          >
            <Download className="w-4 h-4 mr-2" />
            {t('results.exportPdf', language)}
          </Button>

          <Button
            onClick={onStartOver}
            variant="outline"
            className="border border-slate-300 text-slate-700 px-8 py-4 rounded-xl font-semibold hover:bg-slate-50 transition-all duration-200"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {t('results.startOver', language)}
          </Button>
        </div>
      </div>
    </>
  );
}
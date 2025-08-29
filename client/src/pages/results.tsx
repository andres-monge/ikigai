/**
 * @file results.tsx
 * @description Displays the Purpose Discovery outcome and allows the user to
 * choose a path to generate a detailed action plan.
 *
 * - Streaming-first approach: Prioritizes real-time AI content generation over cached data
 * - Simplified streaming detection: Starts streaming when `coreDriversAnalysis` is missing
 * - Instant path selection: Navigate immediately to `/action-plan?pathId={selectedPathId}` 
 *   using query parameters for cross-page data transfer (compatible with Wouter routing)
 * - No loading states: Action Plan page handles its own streaming and data loading
 * - Clean separation of concerns: Results page focuses only on displaying analysis and navigation
 *
 * **Architecture Decisions:**
 * - Uses Server-Sent Events (SSE) for real-time AI response streaming
 * - Query parameters over route state for data persistence across page refreshes
 * - Single streaming detection rule: missing core drivers analysis = start streaming
 * - Removed complex fallback chains and loading overlays for MVP simplicity
 *
 * @dependencies
 * - wouter: For navigation and routing.
 * - @/hooks/use-sse-stream: For real-time AI content streaming.
 * - @/hooks/use-session-storage: To persist/retrieve session data.
 * - @/components/streaming-status: Real-time streaming progress indicator.
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
  const [isFetchingSession, setIsFetchingSession] = useState(false);

  // SSE Streaming hook for purpose discovery
  const streamingState = useSSEStream({
    enabled: needsStreaming,
    endpoint: `/api/analyze/stream?sessionId=${sessionId}`,
    onComplete: async () => {
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


  /* Server-as-source-of-truth session management */
  useEffect(() => {
    // No sessionId means we can't proceed at all
    if (!sessionId) {
      navigate('/');
      return;
    }

    // If we have complete core drivers analysis with matching sessionId, we're good to render
    if (session?.coreDriversAnalysis && session.sessionId === sessionId) {
      return;
    }

    // Clear stale session data if sessionId mismatch
    if (session && session.sessionId !== sessionId) {
      console.log('SessionId mismatch detected, clearing stale session data');
      setSession(null);
    }

    // Need to fetch from server if session is missing or has wrong sessionId
    if (!isFetchingSession && (!session || session.sessionId !== sessionId)) {
      setIsFetchingSession(true);
      
      apiRequest('GET', `/api/session/${sessionId}`)
        .then(async (res) => {
          if (res.ok) {
            const serverSession = await res.json();
            setSession(serverSession);
            sessionStorage.setItem('session', JSON.stringify(serverSession));
            
            // Check if we need streaming after fetching
            if (!serverSession.coreDriversAnalysis) {
              setNeedsStreaming(true);
            }
          } else if (res.status === 404) {
            // Session doesn't exist on server, redirect to home
            navigate('/');
            return;
          } else {
            throw new Error(`Server returned ${res.status}`);
          }
        })
        .catch((error) => {
          console.error('Failed to fetch session from server:', error);
          toast({
            title: t('common.error', language),
            description: 'Failed to load your session. Please try again.',
            variant: 'destructive',
          });
          navigate('/');
        })
        .finally(() => {
          setIsFetchingSession(false);
        });
    } else if (session && session.sessionId === sessionId && !session.coreDriversAnalysis && !needsStreaming) {
      // We have the right session but need to start streaming
      setNeedsStreaming(true);
    }
  }, [session?.sessionId, sessionId, isFetchingSession, session?.coreDriversAnalysis, needsStreaming]);

  const handleChoosePath = (pathId: number) => {
    if (typeof pathId !== 'number') return;

    // Validate that pathId exists in current session's purpose paths
    if (!session?.purposePaths?.some(path => path.id === pathId)) {
      console.error('Invalid pathId:', pathId, 'Available paths:', session?.purposePaths?.map(p => p.id));
      return;
    }

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

  // Show loading UI if we're fetching session from server
  if (isFetchingSession) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            {t('results.title', language)}
          </h2>
        </div>
        
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-slate-600">
              {language === 'es' ? 'Cargando tu sesión...' : 'Loading your session...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

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

  if (!session || !session.coreDriversAnalysis || !session.purposePaths || session.purposePaths.length !== 3) {
    // Small fallback while data loads or if session data is incomplete
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
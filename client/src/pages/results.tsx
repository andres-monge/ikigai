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
import { Download, RotateCcw, Rocket, Users, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { CoreDriversSummary } from '@/components/results/core-drivers-summary';
import { PurposePaths } from '@/components/results/purpose-paths';
import { t, type Language } from '@/lib/i18n';
import { exportToPDF } from '@/lib/pdf-export';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useSSEStream, StreamingPhase } from '@/hooks/use-sse-stream';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { FullAssessment } from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Streaming Buffer Extraction Utilities                                     */
/* -------------------------------------------------------------------------- */

/**
 * Extract content between tags, returning partial content if end tag is missing
 */
function extract(text: string, start: string, end: string) {
  const s = text.indexOf(start);
  if (s < 0) return { value: '', complete: false };
  const from = s + start.length;
  const e = text.indexOf(end, from);
  return e >= 0
    ? { value: text.slice(from, e).trim(), complete: true }
    : { value: text.slice(from).trim(), complete: false };
}

/**
 * Extract a section's content between SECTION and END_SECTION tags
 */
function extractSectionContent(buffer: string, sectionName: string) {
  const startTag = `[SECTION:${sectionName}]`;
  const endTag = '[END_SECTION]';
  const startIdx = buffer.indexOf(startTag);
  if (startIdx < 0) return '';
  const endIdx = buffer.indexOf(endTag, startIdx);
  return endIdx >= 0 
    ? buffer.slice(startIdx, endIdx + endTag.length)
    : buffer.slice(startIdx);
}

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
          setNeedsStreaming(false);
        }
      } catch (error) {
        console.error('Failed to fetch completed session:', error);
        toast({
          title: t('common.error', language),
          description: t('results.saveAnalysisError', language),
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      console.error('Streaming error:', error);
      toast({
        title: t('common.error', language),
        description: t('results.analysisFailedError', language),
        variant: 'destructive',
      });
      setNeedsStreaming(false);
    }
  });


  /* Server-as-source-of-truth session management - Effect 1: Session validation and server fetch */
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
      if (process.env.NODE_ENV === 'development') {
        console.log('SessionId mismatch detected, clearing stale session data');
      }
      setSession(null);
      return; // Let the effect re-run with cleared session
    }

    // Need to fetch from server if session is missing or has wrong sessionId
    if (!isFetchingSession && !needsStreaming && (!session || session.sessionId !== sessionId)) {
      setIsFetchingSession(true);
      
      apiRequest('GET', `/api/session/${sessionId}`)
        .then(async (res) => {
          if (res.ok) {
            const serverSession = await res.json();
            setSession(serverSession);
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
            description: t('results.loadSessionError', language),
            variant: 'destructive',
          });
          // Delay navigation slightly to allow user to see the toast
          setTimeout(() => navigate('/'), 2000);
        })
        .finally(() => {
          setIsFetchingSession(false);
        });
    }
  }, [sessionId, session?.sessionId, session?.coreDriversAnalysis, isFetchingSession, needsStreaming, navigate, setSession, toast, language]);

  /* Server-as-source-of-truth session management - Effect 2: Streaming trigger */
  useEffect(() => {
    // Only trigger streaming if we have the right session but missing analysis
    if (session && session.sessionId === sessionId && !session.coreDriversAnalysis && !needsStreaming && !isFetchingSession) {
      setNeedsStreaming(true);
    }
  }, [session?.sessionId, sessionId, session?.coreDriversAnalysis, needsStreaming, isFetchingSession]);

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
      <LoadingState
        title={t('results.title', language)}
        message={t('results.loadingSession', language)}
        language={language}
      />
    );
  }

  // Show streaming UI if we're in streaming mode
  if (needsStreaming && streamingState.phase !== StreamingPhase.COMPLETE) {
    // Debug: Log buffer size to verify chunks are arriving
    console.log(`[DEBUG] Streaming buffer length: ${streamingState.buffer.length}, phase: ${streamingState.phase}`);
    
    // Parse buffer into structured data for progressive UI rendering
    const isCoreDriversComplete = streamingState.completedSections.includes('CORE_DRIVERS');
    const coreDriversSection = extractSectionContent(streamingState.buffer, 'CORE_DRIVERS');
    const coreDrivers = isCoreDriversComplete && session?.coreDriversAnalysis ? 
      session.coreDriversAnalysis : {
        statementSentence: extract(coreDriversSection, '[STATEMENT]', '[/STATEMENT]').value,
        coreThreads: extract(coreDriversSection, '[THREADS]', '[/THREADS]').value
      };

    // Extract each path's data
    const streamingPaths = [1, 2, 3].map(i => {
      const isComplete = streamingState.completedSections.includes(`PATH_${i}`);
      const pathSection = extractSectionContent(streamingState.buffer, `PATH_${i}`);
      
      // If complete and we have session data, use that (frozen)
      if (isComplete && session?.purposePaths?.[i-1]) {
        return session.purposePaths[i-1];
      }
      
      // Otherwise extract from buffer
      const ikigaiSection = extract(pathSection, '[IKIGAI]', '[/IKIGAI]').value;
      
      return {
        id: i,
        title: extract(pathSection, '[TITLE]', '[/TITLE]').value,
        description: extract(pathSection, '[DESCRIPTION]', '[/DESCRIPTION]').value,
        ikigaiAlignment: {
          love: extract(ikigaiSection, '[LOVE]', '[/LOVE]').value,
          goodAt: extract(ikigaiSection, '[GOOD_AT]', '[/GOOD_AT]').value,
          worldNeeds: extract(ikigaiSection, '[WORLD_NEEDS]', '[/WORLD_NEEDS]').value,
          pay: extract(ikigaiSection, '[PAY]', '[/PAY]').value,
        },
        actionStrategy: extract(pathSection, '[ACTION_STRATEGY]', '[/ACTION_STRATEGY]').value,
      };
    });

    return (
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            {t('results.title', language)}
          </h2>
          {/* Streaming indicator */}
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            {getPhaseMessage(streamingState.phase)}
          </div>
        </div>
        
        {/* Core Drivers - render as plain text during streaming */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="space-y-6">
            <p className="text-center font-bold text-slate-800 text-lg">
              {coreDrivers.statementSentence || (
                <span className="inline-block h-6 bg-slate-100 rounded w-3/4 animate-pulse" />
              )}
            </p>
            <div className="text-slate-600 whitespace-pre-wrap">
              {coreDrivers.coreThreads || (
                <>
                  <span className="block h-4 bg-slate-100 rounded w-full mb-2 animate-pulse" />
                  <span className="block h-4 bg-slate-100 rounded w-5/6 mb-2 animate-pulse" />
                  <span className="block h-4 bg-slate-100 rounded w-4/6 animate-pulse" />
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Purpose Paths - inline card rendering without action buttons */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-slate-900 mb-6 text-center">
            {t('results.purposePaths', language)}
          </h3>
          <div className="grid lg:grid-cols-3 gap-6">
            {streamingPaths.map((path, index) => {
              const gradients = ['from-primary to-blue-600', 'from-secondary to-purple-600', 'from-accent to-orange-600'];
              const gradient = gradients[index];
              const icons = [Rocket, Users, Code];
              const Icon = icons[index] || Rocket;
              
              return (
                <div key={path.id} className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
                  <div className={`bg-gradient-to-br ${gradient} p-6 text-white`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xl font-bold">
                        {path.title || <span className="inline-block h-7 bg-white/20 rounded w-3/4 animate-pulse" />}
                      </h4>
                      <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="opacity-90 text-sm">
                      {path.description || <span className="inline-block h-5 bg-white/20 rounded w-full animate-pulse" />}
                    </p>
                  </div>
                  
                  <div className="p-6">
                    {/* Ikigai Alignment */}
                    <div className="mb-6">
                      <h5 className="font-semibold text-slate-900 mb-3">{t('ikigai.alignment', language)}</h5>
                      <div className="space-y-2">
                        {[
                          { key: 'love', color: 'red' },
                          { key: 'goodAt', color: 'blue' },
                          { key: 'worldNeeds', color: 'green' },
                          { key: 'pay', color: 'yellow' }
                        ].map(({ key, color }) => (
                          <div key={key} className="flex items-start">
                            <div className={`w-3 h-3 rounded-full mr-3 flex-shrink-0 mt-0.5 bg-${color}-400`} />
                            <span className="text-sm text-slate-600">
                              <strong>{t(`ikigai.${key}`, language)}:</strong>{' '}
                              {path.ikigaiAlignment[key as keyof typeof path.ikigaiAlignment] || (
                                <span className="inline-block h-4 bg-slate-100 rounded w-32 animate-pulse" />
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Action Strategy */}
                    <div className="bg-slate-50 rounded-lg p-4">
                      <h6 className="font-medium text-slate-900 mb-2">{t('results.actionStrategy', language)}</h6>
                      <p className="text-sm text-slate-600">
                        {path.actionStrategy || (
                          <span className="inline-block h-4 bg-slate-200 rounded w-full animate-pulse" />
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
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
        
        {/* No action buttons during streaming */}
      </div>
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
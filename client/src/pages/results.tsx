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
 * - Uses Vercel AI SDK's useObject hook for structured streaming with type safety
 * - Query parameters over route state for data persistence across page refreshes
 * - Single streaming detection rule: missing core drivers analysis = start streaming
 * - Removed complex fallback chains and loading overlays for MVP simplicity
 *
 * @dependencies
 * - wouter: For navigation and routing.
 * - @ai-sdk/react: For useObject streaming hook with structured data.
 * - @/hooks/use-session-storage: To persist/retrieve session data.
 * - @/types/assessment: For the `FullAssessment` type.
 */

import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { Copy, Check } from 'lucide-react';
import { purposeDiscoveryResultSchema } from '@shared/streaming-schemas';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { CoreDriversSummary } from '@/components/results/core-drivers-summary';
import { PurposePaths } from '@/components/results/purpose-paths';
import { t, type Language } from '@/lib/i18n';
import { exportToPDF } from '@/lib/pdf-export';
import { copyResultsToClipboard } from '@/lib/clipboard-export';
import { useStreamingState, createPollingSchedule, hasPositiveIds } from '@/hooks/use-streaming-state';
import { useToast } from '@/hooks/use-toast';
import { useBackgroundMusic } from '@/hooks/use-background-music';
import { useAnalytics } from '@/hooks/use-analytics';
import type { FullAssessment, PurposePath } from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Streaming Schema - Imported from Shared Source of Truth                  */
/* -------------------------------------------------------------------------- */

// Schema imported from shared location - no more manual synchronization needed!

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
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { trackEvent } = useAnalytics();
  const [needsStreaming, setNeedsStreaming] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  // Background music for streaming experience
  const { play: playBackgroundMusic, stop: stopBackgroundMusic, fadeOut: fadeOutBackgroundMusic } = useBackgroundMusic([
    '/sounds/music-wait-lady-brown.mp3',
    '/sounds/music-wait-feather.mp3',
    '/sounds/music-wait-cats-on-mars.mp3',
    '/sounds/music-wait-lost-woods.mp3',
  ]);
  
  // Shared session management and streaming control
  const { 
    session, 
    setSession, 
    isFetchingSession, 
    isFetchingRef, 
    hasInitiatedStreamingRef 
  } = useStreamingState({ sessionId, language });
  
  // Polling timeout ref for proper cleanup
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // useObject hook for purpose discovery streaming
  const { object, submit, isLoading, error } = useObject({
    api: '/api/analyze/stream',
    schema: purposeDiscoveryResultSchema,
    onFinish: async ({ object }) => {
      // Stop background music when streaming completes
      stopBackgroundMusic();
      
      // Always use streamed data, regardless of session state (fixes race condition)
      if (object) {
        // Create base session from existing or minimal data
        const baseSession = session || { 
          sessionId, 
          language,
          id: 0,
          responses: null,
          coreDriversAnalysis: null,
          chosenPathId: null,
          actionPlan: null,
          purposePaths: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Map streamed purposePaths to match database structure with temporary IDs
        const mappedPurposePaths = object.purposePaths.map((path, index) => ({
          ...path,
          id: -(index + 1), // Temporary negative IDs to avoid conflicts
          assessmentId: baseSession.id || 0
        }));
        
        const updatedSession = {
          ...baseSession,
          coreDriversAnalysis: object.coreDriversAnalysis,
          purposePaths: mappedPurposePaths
        };
        setSession(updatedSession);
        setNeedsStreaming(false);
        
        /**
         * Smart polling to replace temporary negative IDs with real database IDs
         *
         * Background: After streaming completes, the frontend immediately assigns temporary
         * negative IDs (-1, -2, -3) to allow UI rendering. Meanwhile, the backend saves
         * the data to the database with real positive IDs. This process can take 20-25 seconds.
         *
         * This polling function checks the database at exponential intervals (500ms, 1000ms,
         * 2000ms, 4000ms, 8000ms) until positive IDs are found, then replaces the temporary
         * negative IDs with the real ones. This prevents 404 errors when users navigate to
         * the Action Plan page.
         */
        const startSmartPolling = () => {
          const delays = createPollingSchedule(); // [500, 1000, 2000, 4000, 8000]

          const pollForPositiveIds = async (attemptIndex: number) => {
            try {
              const res = await fetch(`/api/session/${sessionId}`, {
                cache: 'no-store',
                credentials: 'include'
              });
              if (res.ok) {
                const dbSession = await res.json();

                // Check for complete data with positive IDs
                if (dbSession.coreDriversAnalysis &&
                    dbSession.purposePaths?.length === 3 &&
                    hasPositiveIds(dbSession.purposePaths)) {
                  // Success! Replace negative IDs with positive database IDs
                  setSession(dbSession);
                  pollingTimeoutRef.current = null;
                  return; // Success, stop polling
                }

                // Data not ready yet, continue polling if attempts remain
                if (attemptIndex < delays.length - 1) {
                  pollingTimeoutRef.current = setTimeout(() => {
                    pollForPositiveIds(attemptIndex + 1);
                  }, delays[attemptIndex]);
                } else {
                  // All retries exhausted - continue with negative IDs (graceful degradation)
                  pollingTimeoutRef.current = null;
                }
              }
            } catch (error) {
              // Network error - still try again if attempts remain
              if (attemptIndex < delays.length - 1) {
                pollingTimeoutRef.current = setTimeout(() => {
                  pollForPositiveIds(attemptIndex + 1);
                }, delays[attemptIndex]);
              } else {
                pollingTimeoutRef.current = null;
              }
            }
          };

          // Start with first delay (500ms)
          pollingTimeoutRef.current = setTimeout(() => {
            pollForPositiveIds(0);
          }, delays[0]);
        };
        
        startSmartPolling();
      } else {
        // Object is missing - this should not happen with AI SDK but handle gracefully
        toast({
          title: t('common.error', language),
          description: t('results.saveAnalysisError', language),
          variant: 'destructive',
        });
        setNeedsStreaming(false);
      }
    },
    onError: (error) => {
      // Stop background music on streaming error
      stopBackgroundMusic();
      console.error('Streaming error:', error);
      toast({
        title: t('common.error', language),
        description: t('results.analysisFailedError', language),
        variant: 'destructive',
      });
      setNeedsStreaming(false);
    }
  });


  /* Streaming trigger logic - session management handled by hook */
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

    // Don't navigate while still fetching session from server
    if (isFetchingRef.current) {
      return;
    }

    // If session fetch completed but returned null (404), redirect home with toast
    if (!isFetchingSession && !session) {
      toast({
        title: t('common.error', language),
        description: t('results.loadSessionError', language),
        variant: 'destructive',
      });
      navigate('/');
      return;
    }

    // One-shot streaming trigger: only initiate streaming once per session
    const shouldStream = 
      session &&
      session.sessionId === sessionId &&
      !session.coreDriversAnalysis &&
      !isFetchingSession &&
      !hasInitiatedStreamingRef.current;

    if (shouldStream) {
      hasInitiatedStreamingRef.current = true;
      setNeedsStreaming(true);
      // Start background music when streaming begins (satisfies browser autoplay policies)
      playBackgroundMusic();
      submit({ sessionId });
    }
  }, [
    sessionId,
    session?.sessionId,
    !!session?.coreDriversAnalysis,  // Boolean coercion for stability
    isFetchingSession,
    navigate,
    toast,
    language
    // Note: submit intentionally omitted from deps to prevent infinite loops
  ]);

  // Cleanup polling timeout on unmount
  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, []);

  // Fade out music when streaming content starts appearing
  useEffect(() => {
    if (object && needsStreaming) {
      fadeOutBackgroundMusic(500); // 500ms smooth fade
    }
  }, [object, needsStreaming, fadeOutBackgroundMusic]);

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

  // Helper function to get streaming status message
  const getStreamingMessage = (): string => {
    return t('results.streaming', language);
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
  if (needsStreaming && isLoading) {
    // Use partial object data for progressive rendering
    const coreDrivers = object?.coreDriversAnalysis || {};
    const streamingPaths = object?.purposePaths || [];

    // Ensure we have 3 paths for consistent UI, filling gaps with empty objects
    const normalizedPaths = [0, 1, 2].map(i => {
      const streamingPath = streamingPaths[i];
      return {
        id: i + 1,
        title: streamingPath?.title || '',
        description: streamingPath?.description || '',
        ikigaiAlignment: {
          love: streamingPath?.ikigaiAlignment?.love || '',
          goodAt: streamingPath?.ikigaiAlignment?.goodAt || '',
          meaning: streamingPath?.ikigaiAlignment?.meaning || '',
          pay: streamingPath?.ikigaiAlignment?.pay || '',
        },
        actionStrategy: streamingPath?.actionStrategy || '',
      };
    });

    return (
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center my-6">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            {t('results.title', language)}
          </h2>
          {/* Streaming indicator */}
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            {getStreamingMessage()}
          </div>
        </div>
        
        {/* Core Drivers - render as plain text during streaming */}
        <div className="retro-card-results p-8 mb-8">
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
            {normalizedPaths.map((path, index) => {
              const gradients = ['gradient-ikigai-teal', 'gradient-ikigai-pink', 'gradient-ikigai-orange'];
              const gradient = gradients[index];

              return (
                <div key={path.id} className="retro-card-results overflow-hidden flex flex-col">
                  <div className={`${gradient} p-6 text-white`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xl font-bold">
                        {path.title || <span className="inline-block h-7 bg-white/20 rounded w-3/4 animate-pulse" />}
                      </h4>
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
                          { key: 'love', colorClass: 'bg-ikigai-teal' },
                          { key: 'meaning', colorClass: 'bg-ikigai-pink' },
                          { key: 'goodAt', colorClass: 'bg-ikigai-yellow' },
                          { key: 'pay', colorClass: 'bg-ikigai-orange' }
                        ].map(({ key, colorClass }) => (
                          <div key={key} className="flex items-start">
                            <div className={`w-3 h-3 ${colorClass} rounded-full mr-3 flex-shrink-0 mt-1`} />
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
                    <div className="bg-ikigai-beige rounded-none p-4">
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
        {error && (
          <div className="text-center mb-4">
            <p className="text-red-600">{error.message || 'Streaming error occurred'}</p>
            <Button
              onClick={() => {
                setNeedsStreaming(false);
                setTimeout(() => {
                  setNeedsStreaming(true);
                  submit({ sessionId });
                }, 1000);
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

  // Only return null if there's truly no data - be more forgiving about purposePaths
  if (!session || !session.coreDriversAnalysis) {
    return null;
  }
  
  // Defensive check for purposePaths
  if (!session.purposePaths || session.purposePaths.length === 0) {
    return (
      <div className="max-w-6xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">
          {t('results.title', language)}
        </h2>
        <p>Analysis complete, but purpose paths are loading...</p>
      </div>
    );
  }

  /**
   * Exports the current analysis to a PDF document.
   * Uses non-null assertion (!) because the early-return guard above ensures
   * `session` is defined from this point onward.
   */
  const handleExportPDF = () => {
    trackEvent('export', { page: 'results', type: 'pdf' });
    exportToPDF(session!, language);
  };

  /**
   * Copies the results to clipboard in dual format (HTML + Markdown).
   * Shows visual feedback with check icon and toast notification.
   */
  const handleCopyToClipboard = async () => {
    if (!session) return;
    trackEvent('export', { page: 'results', type: 'copy' });
    setIsCopying(true);
    try {
      await copyResultsToClipboard(session, language);
      setJustCopied(true);
      toast({
        title: t('results.copiedSuccess', language),
        duration: 1000,
      });
      // Reset the "copied" state after 2 seconds
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      toast({
        title: t('common.error', language),
        description: t('results.copyError', language),
        variant: 'destructive',
      });
    } finally {
      setIsCopying(false);
    }
  };

  const handleStartOver = () => {
    onStartOver();
  };

  return (
    <>
      <div className="max-w-6xl mx-auto">
        {/* AI Analysis Header */}
        <div className="relative my-6">
          <h2 className="text-3xl font-bold text-slate-900 mb-4 text-center">
            {t('results.title', language)}
          </h2>
          <button
            onClick={handleCopyToClipboard}
            disabled={isCopying}
            className="absolute right-0 top-0 p-2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
            title={t('results.copyToClipboard', language)}
          >
            {justCopied ? (
              <Check className="w-5 h-5 text-green-500" />
            ) : (
              <Copy className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Core Drivers Summary */}
        <CoreDriversSummary
          analysis={session.coreDriversAnalysis}
          language={language}
        />

        {/* Purpose Paths */}
        <PurposePaths
          purposePaths={session.purposePaths || []}
          language={language}
          onChoosePath={handleChoosePath}
          isChoosing={false}
        />

        {/* Export and Start Over Actions */}
        <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center pb-4">
          <Button
            onClick={handleExportPDF}
            variant="retro-yellow"
            className="px-8 h-10 text-sm"
          >
            {t('results.exportPdf', language)}
          </Button>

          <Button
            onClick={handleStartOver}
            variant="retro-light-grey"
            className="px-8 h-10 text-sm"
          >
            {t('results.startOver', language)}
          </Button>
        </div>
      </div>
    </>
  );
}
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
import { Download, RotateCcw, Rocket, Users, Code } from 'lucide-react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { CoreDriversSummary } from '@/components/results/core-drivers-summary';
import { PurposePaths } from '@/components/results/purpose-paths';
import { t, type Language } from '@/lib/i18n';
import { exportToPDF } from '@/lib/pdf-export';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { FullAssessment } from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Streaming Schema for useObject Hook                                       */
/* -------------------------------------------------------------------------- */

/**
 * Zod schema for the purpose discovery result structure
 * 
 * IMPORTANT: This schema must stay synchronized with the backend's 
 * purposeDiscoveryResultSchema in server/ai/schemas.ts (lines 38-61)
 * Any changes to the backend schema structure must be reflected here.
 */
const purposeDiscoverySchema = z.object({
  coreDriversAnalysis: z.object({
    statementSentence: z.string(),
    coreThreads: z.string(),
  }),
  purposePaths: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      ikigaiAlignment: z.object({
        love: z.string(),
        goodAt: z.string(),
        worldNeeds: z.string(),
        pay: z.string(),
      }),
      actionStrategy: z.string(),
    })
  ),
});

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
  
  // One-shot streaming trigger to prevent infinite loops
  const hasInitiatedStreamingRef = useRef(false);

  // useObject hook for purpose discovery streaming
  const { object, submit, isLoading, error } = useObject({
    api: '/api/analyze/stream',
    schema: purposeDiscoverySchema,
    onFinish: async ({ object }) => {
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
        
        // Background fetch to get DB-persisted version after delay
        setTimeout(async () => {
          try {
            const res = await fetch(`/api/session/${sessionId}`, { 
              cache: 'no-store', 
              credentials: 'include' 
            });
            if (res.ok) {
              const dbSession = await res.json();
              
              // Only apply DB session if it has complete data (prevent downgrades)
              if (dbSession.coreDriversAnalysis && dbSession.purposePaths?.length === 3) {
                setSession(dbSession);
              }
            }
          } catch (error) {
            console.error('Background session fetch failed (non-critical):', error);
          }
        }, 1000);
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
      console.error('Streaming error:', error);
      toast({
        title: t('common.error', language),
        description: t('results.analysisFailedError', language),
        variant: 'destructive',
      });
      setNeedsStreaming(false);
    }
  });


  /* Unified session management and streaming trigger with one-shot pattern */
  useEffect(() => {
    // Reset streaming ref if sessionId changes (new assessment)
    if (!sessionId || (session && session.sessionId !== sessionId)) {
      hasInitiatedStreamingRef.current = false;
    }

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
      return; // Don't continue to streaming logic while fetching
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
      submit({ sessionId });
    }
  }, [
    sessionId,
    session?.sessionId,
    !!session?.coreDriversAnalysis,  // Boolean coercion for stability
    isFetchingSession,
    needsStreaming,
    navigate,
    setSession,
    toast,
    language
    // Note: submit intentionally omitted from deps to prevent infinite loops
  ]);

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
    return language === 'es' ? 'Generando tu análisis...' : 'Generating your analysis...';
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
          worldNeeds: streamingPath?.ikigaiAlignment?.worldNeeds || '',
          pay: streamingPath?.ikigaiAlignment?.pay || '',
        },
        actionStrategy: streamingPath?.actionStrategy || '',
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
            {getStreamingMessage()}
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
            {normalizedPaths.map((path, index) => {
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
          purposePaths={session.purposePaths || []}
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
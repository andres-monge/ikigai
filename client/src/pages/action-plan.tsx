/**
 * @file action-plan.tsx
 *
 * @description
 * Displays the detailed, step-by-step action plan for the user's chosen
 * purpose path. This is the final interactive page before refinement or export.
 *
 * ✨ **New in Step 24** ✨
 * - The "Export to PDF" button is now fully functional.
 * - Imported and connected the `exportActionPlanToPDF` function from `lib/pdf-export`.
 * - The `handleExportPDF` function now calls the export utility with the
 * necessary data (action plan, path title, and language).
 * - Removed the previous "Coming Soon" toast message.
 *
 * @dependencies
 * - wouter, lucide-react, @/hooks, @/components, @/lib, @/types
 */

import { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';
import {
  Lightbulb,
  GraduationCap,
  Download,
  MessageCircle,
  ArrowLeft,
  ClipboardCheck,
} from 'lucide-react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { z } from 'zod';
import { actionPlanResultSchema } from '@shared/streaming-schemas';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useStreamingState, createPollingSchedule, hasPositiveIds } from '@/hooks/use-streaming-state';
import { t, type Language } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { exportActionPlanToPDF } from '@/lib/pdf-export';
import { useToast } from '@/hooks/use-toast';
import type { FullAssessment, ActionPlan, PurposePath, Milestone, SkillToLearn, YoutubeVideo } from '@/types/assessment';

interface ActionPlanProps {
  language: Language;
  sessionId: string;
  onStartOver: () => void;
}

/* -------------------------------------------------------------------------- */
/* Streaming Schema - Imported from Shared Source of Truth                  */
/* -------------------------------------------------------------------------- */

// Schema imported from shared location - no more manual synchronization needed!

export function ActionPlan({
  language,
  sessionId,
}: ActionPlanProps) {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [needsStreaming, setNeedsStreaming] = useState(false);
  const [sessionData, setSessionData] = useState<FullAssessment | null>(null);
  
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

  // Extract pathId from URL query parameters and resolve effective pathId
  const searchString = useSearch();
  const queryPathId = new URLSearchParams(searchString).get('pathId');
  const parsedPathId = queryPathId ? parseInt(queryPathId, 10) : null;
  // Prioritize URL pathId, then sessionData, then session chosenPathId
  const effectivePathId = (parsedPathId && !isNaN(parsedPathId)) ? 
    parsedPathId : 
    (sessionData?.chosenPathId || session?.chosenPathId);

  const actionPlan = session?.actionPlan;
  const chosenPath = useMemo(() => {
    const currentSession = sessionData || session;
    if (!currentSession || !effectivePathId) return null;
    return currentSession.purposePaths?.find((p: PurposePath) => 
      p.id === effectivePathId || p.id === Number(effectivePathId)
    ) || null;
  }, [session, sessionData, effectivePathId]);

  // useObject hook for action plan streaming
  const { object, submit, isLoading: isStreamingLoading, error } = useObject({
    api: '/api/action-plan/stream',
    schema: actionPlanResultSchema,
    onFinish: async ({ object }) => {
      // Always preserve streamed data, regardless of session state (fixes race condition)
      if (object) {
        // Create base session from existing data or minimal fallback
        const baseSession = session || sessionData || { 
          sessionId,
          language,
          id: 0,
          responses: null,
          coreDriversAnalysis: null,
          chosenPathId: effectivePathId,
          actionPlan: null,
          purposePaths: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Clean any fake YouTube data that might have been generated during streaming
        const cleanedObject = {
          ...object,
          milestones: object.milestones.map(m => ({
            ...m,
            skills: m.skills?.map(s => ({ skill: s.skill, youtubeLinks: [] })) || []
          }))
        };
        
        const updatedSession = {
          ...baseSession,
          actionPlan: cleanedObject,
          chosenPathId: effectivePathId || baseSession?.chosenPathId || null
        };
        setSessionData(updatedSession);
        setNeedsStreaming(false);
        
        // Update the hook's session state (which handles sessionStorage automatically)
        setSession(updatedSession);
        
        /**
         * Smart polling for YouTube video enrichment
         *
         * Background: After the action plan streaming completes, the backend performs
         * post-processing to enrich each skill with real YouTube video links. This
         * enrichment happens asynchronously after the initial streaming is done.
         *
         * This polling function checks the database at exponential intervals (500ms, 1000ms,
         * 2000ms, 4000ms, 8000ms) until YouTube videos appear in the data, then updates
         * the UI with the enriched content.
         */
        const startEnrichmentPolling = () => {
          const delays = createPollingSchedule(); // [500, 1000, 2000, 4000, 8000]

          const pollForEnrichedData = async (attemptIndex: number) => {
            try {
              const res = await fetch(`/api/session/${sessionId}?t=${Date.now()}`, {
                cache: 'no-store',
                credentials: 'include'
              });
              if (res.ok) {
                const enrichedSession = await res.json();

                // Check for complete enriched data with YouTube videos
                if (enrichedSession.actionPlan?.milestones?.length > 0) {
                  const hasRealYouTubeData = enrichedSession.actionPlan.milestones.some((m: Milestone) =>
                    m.skills?.some((s: SkillToLearn) => s.youtubeLinks && s.youtubeLinks.length > 0)
                  );

                  if (hasRealYouTubeData || enrichedSession.actionPlan.milestones.length > cleanedObject.milestones.length) {
                    // Success! Update with enriched data
                    setSessionData(enrichedSession);
                    setSession(enrichedSession);
                    pollingTimeoutRef.current = null;
                    return; // Success, stop polling
                  }
                }

                // Data not enriched yet, continue polling if attempts remain
                if (attemptIndex < delays.length - 1) {
                  pollingTimeoutRef.current = setTimeout(() => {
                    pollForEnrichedData(attemptIndex + 1);
                  }, delays[attemptIndex]);
                } else {
                  // All retries exhausted - continue without YouTube videos (graceful degradation)
                  pollingTimeoutRef.current = null;
                }
              }
            } catch (error) {
              // Network error - still try again if attempts remain
              if (attemptIndex < delays.length - 1) {
                pollingTimeoutRef.current = setTimeout(() => {
                  pollForEnrichedData(attemptIndex + 1);
                }, delays[attemptIndex]);
              } else {
                pollingTimeoutRef.current = null;
              }
            }
          };

          // Start with first delay (500ms)
          pollingTimeoutRef.current = setTimeout(() => {
            pollForEnrichedData(0);
          }, delays[0]);
        };
        
        startEnrichmentPolling();
      } else {
        // Object is missing - this should not happen with AI SDK but handle gracefully
        toast({
          title: t('common.error', language),
          description: 'Failed to generate action plan.',
          variant: 'destructive',
        });
        setNeedsStreaming(false);
      }
    },
    onError: (error) => {
      console.error('Streaming error:', error);
      toast({
        title: t('common.error', language),
        description: 'Action plan generation failed. Please try again.',
        variant: 'destructive',
      });
      setNeedsStreaming(false);
    }
  });


  /* Streaming trigger logic with path validation - session management handled by hook */
  useEffect(() => {
    const currentSession = sessionData || session;

    // No sessionId means we can't proceed at all
    if (!sessionId) {
      navigate('/');
      return;
    }

    // Don't make navigation decisions while still fetching session
    if (isFetchingRef.current) {
      return;
    }

    // If session fetch completed but returned null (404), redirect to results
    if (!isFetchingSession && !currentSession) {
      navigate('/results');
      return;
    }

    // If we have complete action plan with matching sessionId and pathId, we're good to render
    if (currentSession?.actionPlan && currentSession.sessionId === sessionId && 
        currentSession.chosenPathId === effectivePathId) {
      return;
    }

    // Need to resolve effectivePathId from session if not available
    if (!effectivePathId && currentSession?.chosenPathId) {
      // Path exists in session but not in URL - this is fine, continue with session's path
      return;
    }

    // No valid path to work with, redirect to results
    if (!effectivePathId) {
      navigate('/results');
      return;
    }

    // Validate pathId exists in purpose paths
    if (currentSession?.purposePaths) {
      const validPath = currentSession.purposePaths.some(p => p.id === effectivePathId);
      if (!validPath) {
        navigate('/results');
        return;
      }
    }

    // One-shot streaming trigger: only initiate streaming once per session/path combination
    const shouldStream = 
      currentSession &&
      currentSession.sessionId === sessionId &&
      (!currentSession.actionPlan || queryPathId !== null) &&
      effectivePathId &&
      !isFetchingSession &&
      !hasInitiatedStreamingRef.current;

    if (shouldStream) {
      hasInitiatedStreamingRef.current = true;
      setNeedsStreaming(true);
      submit({ sessionId, pathId: effectivePathId });
    }
  }, [
    sessionId,
    effectivePathId,
    session?.sessionId,
    !!session?.actionPlan,  // Boolean coercion for stability
    sessionData?.actionPlan,  // Track sessionData changes too
    queryPathId,
    isFetchingSession,
    navigate
    // Note: submit and setSessionData intentionally omitted from deps to prevent infinite loops
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

  // Helper function to get streaming status message
  const getStreamingMessage = (): string => {
    return language === 'es' ? 'Generando tu plan de acción...' : 'Generating your action plan...';
  };

  if (isFetchingSession) {
    return <ActionPlanSkeleton />;
  }

  // Show streaming UI if we're in streaming mode
  if (needsStreaming && isStreamingLoading) {
    // Use partial object data for progressive rendering
    const streamingMilestones = object?.milestones || [];

    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            {t('actionPlan.title', language)}
          </h2>
          <p className="text-lg text-slate-600 mb-4">
            {t('actionPlan.subtitle', language)}
          </p>
          {chosenPath && (
            <div className="inline-block bg-slate-100 text-slate-800 font-semibold px-4 py-2 rounded-lg">
              {t('actionPlan.chosenPath', language)}: {chosenPath.title}
            </div>
          )}
          
          {/* Streaming indicator */}
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600 mt-4">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            {getStreamingMessage()}
          </div>
        </div>
        
        {/* Progressive Milestones Rendering */}
        <div className="space-y-8">
          {[0, 1, 2, 3, 4].map((idx) => {
            const milestone = streamingMilestones[idx];
            const icons = [Lightbulb, GraduationCap, ClipboardCheck, Lightbulb, GraduationCap];
            const Icon = icons[idx] || Lightbulb;
            
            return (
              <Card key={idx}>
                <CardHeader className="flex flex-row gap-4 items-start">
                  <Icon className={`w-8 h-8 shrink-0 ${idx % 2 === 0 ? 'text-amber-500' : 'text-blue-600'}`} />
                  <div className="flex-1">
                    <CardTitle className="flex justify-between items-center">
                      <span>
                        {milestone?.title || (
                          <span className="inline-block h-6 bg-slate-100 rounded w-3/4 animate-pulse" />
                        )}
                      </span>
                      <span className="text-sm font-normal text-slate-500">
                        {milestone?.timeline || (
                          <span className="inline-block h-4 bg-slate-100 rounded w-20 animate-pulse" />
                        )}
                      </span>
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Actions */}
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4" />
                      {t('actionPlan.actions', language)}
                    </h4>
                    <ul className="list-disc list-inside space-y-2 text-slate-700">
                      {milestone?.actions && milestone.actions.length > 0 ? (
                        milestone.actions.filter((action): action is string => !!action).map((action: string, i: number) => (
                          <li key={i}>{action}</li>
                        ))
                      ) : (
                        <>
                          <li><span className="inline-block h-4 bg-slate-100 rounded w-full animate-pulse" /></li>
                          <li><span className="inline-block h-4 bg-slate-100 rounded w-5/6 animate-pulse" /></li>
                          <li><span className="inline-block h-4 bg-slate-100 rounded w-4/6 animate-pulse" /></li>
                        </>
                      )}
                    </ul>
                  </div>

                  {/* Skills placeholder */}
                  {(milestone?.skills && milestone.skills.length > 0 || !milestone) && (
                    <div>
                      <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                        <GraduationCap className="w-4 h-4" />
                        {t('actionPlan.skills', language)}
                      </h4>
                      <div className="space-y-3">
                        {milestone?.skills?.map((skill, i: number) => skill && (
                          <div key={i}>
                            <p className="font-medium text-slate-700 mb-1">{skill.skill}</p>
                            <div className="text-sm text-slate-500">Learning resources will be added...</div>
                          </div>
                        )) || (
                          <div>
                            <span className="inline-block h-4 bg-slate-100 rounded w-32 animate-pulse" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        {/* Show error if present */}
        {error && (
          <div className="text-center mt-8">
            <p className="text-red-600">{error.message || 'Streaming error occurred'}</p>
            <Button
              onClick={() => {
                hasInitiatedStreamingRef.current = false;
                setNeedsStreaming(false);
                setTimeout(() => {
                  setNeedsStreaming(true);
                  submit({ sessionId, pathId: effectivePathId });
                }, 1000);
              }}
              className="mt-2"
              variant="outline"
            >
              {language === 'es' ? 'Reintentar' : 'Retry'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Use sessionData as primary source (updated by streaming), session as initial data only
  const currentSession = sessionData || session;
  const currentActionPlan = currentSession?.actionPlan;
  const currentChosenPath = chosenPath;

  // Only return null if there's truly no action plan data
  if (!currentActionPlan) {
    return null;
  }

  // Handle missing chosen path gracefully - show action plan with generic header
  if (!currentChosenPath) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            {t('actionPlan.title', language)}
          </h2>
          <p className="text-lg text-slate-600 mb-4">
            {t('actionPlan.subtitle', language)}
          </p>
          <div className="inline-block bg-slate-100 text-slate-800 font-semibold px-4 py-2 rounded-lg">
            Your Action Plan
          </div>
        </div>
        
        {/* Render milestones even without chosen path details */}
        <div className="space-y-8">
          {currentActionPlan.milestones.map((ms: Milestone, idx: number) => (
            <Card key={idx}>
              <CardHeader className="flex flex-row gap-4 items-start">
                {idx % 2 === 0 ? (
                  <Lightbulb className="w-8 h-8 text-amber-500 shrink-0" />
                ) : (
                  <GraduationCap className="w-8 h-8 text-blue-600 shrink-0" />
                )}
                <div className="flex-1">
                  <CardTitle className="flex justify-between items-center">
                    <span>{ms.title || `Milestone ${idx + 1}`}</span>
                    <span className="text-sm font-normal text-slate-600">{ms.timeline}</span>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pl-16">
                <div className="space-y-4">
                  {ms.actions && ms.actions.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-2">{t('actionPlan.actions', language)}</h4>
                      <ul className="space-y-1">
                        {ms.actions.map((action: string, actionIdx: number) => (
                          <li key={actionIdx} className="flex items-start">
                            <span className="w-2 h-2 bg-slate-400 rounded-full mr-3 mt-2 flex-shrink-0" />
                            <span className="text-slate-700">{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
          <Button
            onClick={() => navigate('/results')}
            size="lg"
            disabled={isStreamingLoading}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('actionPlan.backToResults', language)}
          </Button>
        </div>
      </div>
    );
  }

  const handleExportPDF = () => {
    // This check is for TypeScript, but the button is only rendered when this
    // data is available anyway.
    if (!currentActionPlan || !currentChosenPath) return;

    exportActionPlanToPDF(currentActionPlan, currentChosenPath.title, language);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header Section */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">
          {t('actionPlan.title', language)}
        </h2>
        <p className="text-lg text-slate-600 mb-4">
          {t('actionPlan.subtitle', language)}
        </p>
        <div className="inline-block bg-slate-100 text-slate-800 font-semibold px-4 py-2 rounded-lg">
          {t('actionPlan.chosenPath', language)}: {currentChosenPath.title}
        </div>
      </div>

      {/* Milestones Section */}
      <div className="space-y-8">
        {currentActionPlan.milestones.map((ms: Milestone, idx: number) => (
          <Card key={idx}>
            <CardHeader className="flex flex-row gap-4 items-start">
              {/* Icon rotation for variety */}
              {idx % 2 === 0 ? (
                <Lightbulb className="w-8 h-8 text-amber-500 shrink-0" />
              ) : (
                <GraduationCap className="w-8 h-8 text-blue-600 shrink-0" />
              )}
              <div className="flex-1">
                <CardTitle className="flex justify-between items-center">
                  <span>{ms.title}</span>
                  <span className="text-sm font-normal text-slate-500">{ms.timeline}</span>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Actions */}
              <div>
                <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" />
                  {t('actionPlan.actions', language)}
                </h4>
                <ul className="list-disc list-inside space-y-2 text-slate-700">
                  {ms.actions.map((act: string, i: number) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              </div>

              {/* Skills (if any) */}
              {ms.skills && ms.skills.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4" />
                    {t('actionPlan.skills', language)}
                  </h4>
                  <div className="space-y-3">
                    {ms.skills.map((skill: SkillToLearn, i: number) => (
                      <div key={i}>
                        <p className="font-medium text-slate-700 mb-1">{skill.skill}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {skill.youtubeLinks.map((video: YoutubeVideo, j: number) => (
                            <a
                              key={j}
                              href={video.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block group"
                            >
                              <img
                                src={video.thumbnailUrl}
                                alt={video.title}
                                className="w-full h-32 object-cover rounded-lg shadow-sm group-hover:opacity-90 transition-opacity"
                              />
                              <p className="mt-1 text-sm text-slate-700 group-hover:text-primary transition-colors">
                                {video.title}
                              </p>
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
        <Button
          onClick={() => navigate('/results')}
          variant="outline"
          className="order-last sm:order-first"
          disabled={isStreamingLoading}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('actionPlan.backToPaths', language)}
        </Button>
        <Button onClick={handleExportPDF} size="lg">
          <Download className="w-4 h-4 mr-2" />
          {t('actionPlan.exportPdf', language)}
        </Button>
      </div>
    </div>
  );
}

/**
 * @description A skeleton component to show while the action plan is loading.
 */
const ActionPlanSkeleton = () => (
  <div className="max-w-4xl mx-auto py-8 px-4">
    <div className="text-center mb-12">
      <Skeleton className="w-16 h-16 rounded-full mx-auto mb-4" />
      <Skeleton className="h-8 w-64 mx-auto mb-2" />
      <Skeleton className="h-6 w-96 mx-auto mb-4" />
      <Skeleton className="h-10 w-48 mx-auto" />
    </div>
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  </div>
);
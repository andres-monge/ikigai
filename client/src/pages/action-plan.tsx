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
  GraduationCap,
  ClipboardCheck,
  Target,
  Copy,
  Check,
} from 'lucide-react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { z } from 'zod';
import { actionPlanResultSchema } from '@shared/streaming-schemas';
import { Button } from '@/components/ui/button';
import { useStreamingState, createPollingSchedule, hasPositiveIds } from '@/hooks/use-streaming-state';
import { t, type Language } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { exportActionPlanToPDF } from '@/lib/pdf-export';
import { copyActionPlanToClipboard } from '@/lib/clipboard-export';
import { useToast } from '@/hooks/use-toast';
import { useBackgroundMusic } from '@/hooks/use-background-music';
import { useAnalytics } from '@/hooks/use-analytics';
import type { FullAssessment, ActionPlan, PurposePath, Milestone, SkillToLearn } from '@/types/assessment';

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
  onStartOver,
}: ActionPlanProps) {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { trackEvent } = useAnalytics();
  const [needsStreaming, setNeedsStreaming] = useState(false);
  const [sessionData, setSessionData] = useState<FullAssessment | null>(null);
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
      // Stop background music when streaming completes
      stopBackgroundMusic();
      
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
        
        const updatedSession = {
          ...baseSession,
          actionPlan: object,
          chosenPathId: effectivePathId || baseSession?.chosenPathId || null
        };
        setSessionData(updatedSession);
        setNeedsStreaming(false);
        
        // Update the hook's session state (which handles sessionStorage automatically)
        setSession(updatedSession);
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
      // Stop background music on streaming error
      stopBackgroundMusic();
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
      // Start background music when streaming begins (satisfies browser autoplay policies)
      playBackgroundMusic();
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

  // Fade out music when streaming content starts appearing
  useEffect(() => {
    if (object && needsStreaming) {
      fadeOutBackgroundMusic(500); // 500ms smooth fade
    }
  }, [object, needsStreaming, fadeOutBackgroundMusic]);

  // Helper function to get streaming status message
  const getStreamingMessage = (): string => {
    return t('actionPlan.streaming', language);
  };

  // Handler functions (defined before early returns to avoid hoisting issues)
  const handleExportPDF = () => {
    // This check is for TypeScript, but the button is only rendered when this
    // data is available anyway.
    if (!currentActionPlan || !currentChosenPath) return;

    trackEvent('export', { page: 'action-plan', type: 'pdf' });
    exportActionPlanToPDF(currentActionPlan, currentChosenPath.title, language);
  };

  /**
   * Copies the action plan to clipboard in dual format (HTML + Markdown).
   * Shows visual feedback with check icon and toast notification.
   */
  const handleCopyToClipboard = async () => {
    if (!currentActionPlan || !currentChosenPath) return;
    trackEvent('export', { page: 'action-plan', type: 'copy' });
    setIsCopying(true);
    try {
      await copyActionPlanToClipboard(currentActionPlan, currentChosenPath, language);
      setJustCopied(true);
      toast({
        title: t('actionPlan.copiedSuccess', language),
        duration: 1000,
      });
      // Reset the "copied" state after 2 seconds
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      toast({
        title: t('common.error', language),
        description: t('actionPlan.copyError', language),
        variant: 'destructive',
      });
    } finally {
      setIsCopying(false);
    }
  };

  const handleBackToPaths = () => {
    navigate('/results');
  };

  const handleStartOver = () => {
    onStartOver();
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
        <div className="retro-card-results p-6 mb-12 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            {t('actionPlan.title', language)}
          </h2>
          {chosenPath && (
            <p className="text-slate-800 font-semibold text-lg mb-4">
              {t('actionPlan.chosenPath', language)}: {chosenPath.title}
            </p>
          )}
          <p className="text-base text-slate-600 mb-4">
            {t('actionPlan.subtitle', language)}
          </p>
          
          {/* Streaming indicator */}
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            {getStreamingMessage()}
          </div>
        </div>
        
        {/* Progressive Milestones Rendering */}
        <div className="space-y-8">
          {[0, 1, 2, 3, 4].map((idx) => {
            const milestone = streamingMilestones[idx];
            
            return (
              <div key={idx} className="retro-card-results p-6">
                <div className="flex flex-row gap-4 items-start mb-4">
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-semibold">
                        {milestone?.title || (
                          <span className="inline-block h-6 bg-slate-100 rounded w-3/4 animate-pulse" />
                        )}
                      </h3>
                      <span className="text-sm font-normal text-slate-500">
                        {milestone?.timeline || (
                          <span className="inline-block h-4 bg-slate-100 rounded w-20 animate-pulse" />
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {/* Actions */}
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-ikigai-teal" />
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

                  {/* Checkpoint */}
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                      <Target className="w-4 h-4 text-ikigai-teal" />
                      {t('actionPlan.checkpoint', language)}
                    </h4>
                    {milestone?.checkpoint ? (
                      <p className="text-slate-700">{milestone.checkpoint}</p>
                    ) : (
                      <span className="inline-block h-4 bg-slate-100 rounded w-5/6 animate-pulse" />
                    )}
                  </div>

                  {/* Skills placeholder */}
                  {(milestone?.skills && milestone.skills.length > 0 || !milestone) && (
                    <div>
                      <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-ikigai-teal" />
                        {t('actionPlan.skills', language)}
                      </h4>
                      <div className="space-y-3">
                        {milestone?.skills?.map((skill, i: number) => skill && (
                          <div key={i}>
                            <p className="font-medium text-slate-700">{skill.skill}</p>
                          </div>
                        )) || (
                          <div>
                            <span className="inline-block h-4 bg-slate-100 rounded w-32 animate-pulse" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
        <div className="retro-card-results p-6 mb-12 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            {t('actionPlan.title', language)}
          </h2>
          <p className="text-slate-800 font-semibold text-lg mb-4">
            Your Action Plan
          </p>
          <p className="text-base text-slate-600">
            {t('actionPlan.subtitle', language)}
          </p>
        </div>
        
        {/* Render milestones even without chosen path details */}
        <div className="space-y-8">
          {currentActionPlan.milestones.map((ms: Milestone, idx: number) => (
            <div key={idx} data-testid="milestone-card" className="retro-card-results p-6">
              <div className="flex flex-row gap-4 items-start mb-4">
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-semibold">{ms.title || `Milestone ${idx + 1}`}</h3>
                    <span className="text-sm font-normal text-slate-600">{ms.timeline}</span>
                  </div>
                </div>
              </div>
              <div className="pl-12">
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
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
          <Button
            data-testid="back-to-paths"
            onClick={handleBackToPaths}
            variant="retro-light-grey"
            className="px-8 h-10 text-sm"
            disabled={isStreamingLoading}
          >
            {t('actionPlan.backToResults', language)}
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
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header Section */}
      <div className="retro-card-results p-6 mb-12 text-center relative">
        <button
          onClick={handleCopyToClipboard}
          disabled={isCopying}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          title={t('actionPlan.copyToClipboard', language)}
        >
          {justCopied ? (
            <Check className="w-5 h-5 text-green-500" />
          ) : (
            <Copy className="w-5 h-5" />
          )}
        </button>
        <h2 className="text-3xl font-bold text-slate-900 mb-4">
          {t('actionPlan.title', language)}
        </h2>
        <p className="text-slate-800 font-semibold text-lg mb-4">
          {t('actionPlan.chosenPath', language)}: {currentChosenPath.title}
        </p>
        <p className="text-base text-slate-600">
          {t('actionPlan.subtitle', language)}
        </p>
      </div>

      {/* Milestones Section */}
      <div className="space-y-8">
        {currentActionPlan.milestones.map((ms: Milestone, idx: number) => (
          <div key={idx} data-testid="milestone-card" className="retro-card-results p-6">
            <div className="flex flex-row gap-4 items-start mb-4">
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-semibold">{ms.title}</h3>
                  <span className="text-sm font-normal text-slate-500">{ms.timeline}</span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {/* Actions */}
              <div>
                <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-ikigai-teal" />
                  {t('actionPlan.actions', language)}
                </h4>
                <ul className="list-disc list-inside space-y-2 text-slate-700">
                  {ms.actions.map((act: string, i: number) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              </div>

              {/* Checkpoint */}
              {ms.checkpoint && (
                <div>
                  <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4 text-ikigai-teal" />
                    {t('actionPlan.checkpoint', language)}
                  </h4>
                  <p className="text-slate-700">{ms.checkpoint}</p>
                </div>
              )}

              {/* Skills (if any) */}
              {ms.skills && ms.skills.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-ikigai-teal" />
                    {t('actionPlan.skills', language)}
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-slate-700">
                    {ms.skills.map((skill: SkillToLearn, i: number) => (
                      <li key={i}>{skill.skill}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
        <Button
          data-testid="back-to-paths"
          onClick={handleBackToPaths}
          variant="retro-light-grey"
          className="px-8 h-10 text-sm order-last sm:order-first"
          disabled={isStreamingLoading}
        >
          {t('actionPlan.backToPaths', language)}
        </Button>
        <Button
          data-testid="export-pdf"
          onClick={handleExportPDF}
          variant="retro-yellow"
          className="px-8 h-10 text-sm"
        >
          {t('actionPlan.exportPdf', language)}
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
  );
}

/**
 * @description A skeleton component to show while the action plan is loading.
 */
const ActionPlanSkeleton = () => (
  <div className="max-w-4xl mx-auto py-8 px-4">
    <div className="retro-card-results p-6 mb-12 text-center">
      <Skeleton className="h-8 w-64 mx-auto mb-4" />
      <Skeleton className="h-6 w-96 mx-auto mb-4" />
      <Skeleton className="h-4 w-80 mx-auto" />
    </div>
    <div className="space-y-8">
      <div className="retro-card-results p-6">
        <div className="mb-4">
          <Skeleton className="h-7 w-1/2 mb-2" />
          <Skeleton className="h-4 w-1/4" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
      <div className="retro-card-results p-6">
        <div className="mb-4">
          <Skeleton className="h-7 w-1/2 mb-2" />
          <Skeleton className="h-4 w-1/4" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  </div>
);
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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useGetSession } from '@/hooks/use-get-session';
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
/* Streaming Schema for useObject Hook                                       */
/* -------------------------------------------------------------------------- */

/**
 * Zod schema for the action plan result structure
 * 
 * IMPORTANT: This schema must stay synchronized with the backend's 
 * actionPlanResultSchema in server/ai/schemas.ts
 * Any changes to the backend schema structure must be reflected here.
 */
const actionPlanSchema = z.object({
  milestones: z.array(
    z.object({
      title: z.string(),
      timeline: z.string(),
      actions: z.array(z.string()),
      skills: z.array(
        z.object({
          skill: z.string(),
          youtubeLinks: z.array(
            z.object({
              title: z.string(),
              url: z.string(),
              thumbnailUrl: z.string(),
            })
          ),
        })
      ).optional(),
    })
  ),
});

export function ActionPlan({
  language,
  sessionId,
}: ActionPlanProps) {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [needsStreaming, setNeedsStreaming] = useState(false);
  const [sessionData, setSessionData] = useState<FullAssessment | null>(null);
  
  // One-shot streaming trigger to prevent infinite loops
  const hasInitiatedStreamingRef = useRef(false);

  const { data: session, isLoading: isSessionLoading, isError } = useGetSession(sessionId);

  // Extract pathId from URL query parameters and resolve effective pathId
  const searchString = useSearch();
  const queryPathId = new URLSearchParams(searchString).get('pathId');
  const parsedPathId = queryPathId ? parseInt(queryPathId, 10) : null;
  const effectivePathId = (parsedPathId && !isNaN(parsedPathId)) ? parsedPathId : (sessionData || session)?.chosenPathId;

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
    schema: actionPlanSchema,
    onFinish: async ({ object }) => {
      // Immediately update local state with streamed data (eliminates race condition)
      if (object && session) {
        const updatedSession = {
          ...session,
          actionPlan: object,
          chosenPathId: effectivePathId || session?.chosenPathId || null
        };
        setSessionData(updatedSession);
        setNeedsStreaming(false);
        
        // Persist to sessionStorage for consistency and page refresh support
        sessionStorage.setItem('session', JSON.stringify(updatedSession));
      } else {
        // Fallback to old behavior if object is missing
        try {
          const res = await fetch(`/api/session/${sessionId}`, { 
            cache: 'no-store', 
            credentials: 'include' 
          });
          if (!res.ok) {
            throw new Error(`${res.status}: ${res.statusText}`);
          }
          const updatedSession = await res.json();
          setSessionData(updatedSession);
          setNeedsStreaming(false);
        } catch (error) {
          console.error('Failed to fetch completed session:', error);
          toast({
            title: t('common.error', language),
            description: 'Failed to save action plan.',
            variant: 'destructive',
          });
        }
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


  /* Unified session management and streaming trigger with one-shot pattern */
  useEffect(() => {
    // Reset streaming ref if sessionId or pathId changes (new assessment or path selection)
    if (!sessionId || !effectivePathId || (session && session.sessionId !== sessionId)) {
      hasInitiatedStreamingRef.current = false;
    }

    const currentSession = sessionData || session;

    // No sessionId means we can't proceed at all
    if (!sessionId) {
      navigate('/');
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
    queryPathId,
    navigate
    // Note: submit and setSessionData intentionally omitted from deps to prevent infinite loops
  ]);

  // Helper function to get streaming status message
  const getStreamingMessage = (): string => {
    return language === 'es' ? 'Generando tu plan de acción...' : 'Generating your action plan...';
  };

  if (isSessionLoading) {
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

  // Use sessionData if available, otherwise fall back to session
  const currentSession = sessionData || session;
  const currentActionPlan = currentSession?.actionPlan;
  const currentChosenPath = chosenPath;

  if (isError || !currentActionPlan || !currentChosenPath) {
    // This state should ideally be brief due to the redirect guard.
    return null;
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
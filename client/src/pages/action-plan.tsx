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

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import {
  Lightbulb,
  GraduationCap,
  Download,
  MessageCircle,
  ArrowLeft,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useGetActionPlan } from '@/hooks/use-get-action-plan';
import { useSSEStream, StreamingPhase } from '@/hooks/use-sse-stream';
import { t, type Language } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { StreamingStatus } from '@/components/streaming-status';
import { exportActionPlanToPDF } from '@/lib/pdf-export';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { FullAssessment, ActionPlan, PurposePath, Milestone, SkillToLearn, YoutubeVideo } from '@/types/assessment';

interface ActionPlanProps {
  language: Language;
  sessionId: string;
  onStartOver: () => void;
}

export function ActionPlan({
  language,
  sessionId,
}: ActionPlanProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [needsStreaming, setNeedsStreaming] = useState(false);
  const [sessionData, setSessionData] = useState<FullAssessment | null>(null);

  const { data: session, isLoading, isError } = useGetActionPlan(sessionId);

  const actionPlan = session?.actionPlan;
  const chosenPath = useMemo(() => {
    const currentSession = sessionData || session;
    if (!currentSession || !currentSession.chosenPathId) return null;
    return (
      currentSession.purposePaths.find((p: PurposePath) => p.id === currentSession.chosenPathId) || null
    );
  }, [session, sessionData]);

  // Get chosenPathId for streaming
  const chosenPathId = useMemo(() => {
    const currentSession = sessionData || session;
    return currentSession?.chosenPathId;
  }, [session, sessionData]);

  // SSE Streaming hook for action plan
  const streamingState = useSSEStream({
    enabled: needsStreaming && !!chosenPathId,
    endpoint: `/api/action-plan/stream?sessionId=${sessionId}&chosenPathId=${chosenPathId || ''}`,
    onComplete: async (finalBuffer) => {
      // On completion, fetch the final session data from the server
      try {
        const res = await apiRequest('GET', `/api/session/${sessionId}`);
        if (res.ok) {
          const updatedSession = await res.json();
          setSessionData(updatedSession);
          setNeedsStreaming(false);
        }
      } catch (error) {
        console.error('Failed to fetch completed session:', error);
        toast({
          title: t('common.error', language),
          description: 'Failed to save action plan.',
          variant: 'destructive',
        });
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


  /* Data availability check and streaming setup */
  useEffect(() => {
    const checkActionPlanData = async () => {
      // Use sessionData if available (from streaming), otherwise use hook data
      const currentSession = sessionData || session;
      const currentActionPlan = currentSession?.actionPlan;
      
      // If we have complete action plan, we're good
      if (currentActionPlan?.milestones && currentActionPlan.milestones.length > 0) {
        return;
      }
      
      // If still loading from the hook, wait
      if (isLoading) {
        return;
      }
      
      // Try to fetch fresh data from server
      try {
        const res = await apiRequest('GET', `/api/session/${sessionId}`);
        if (res.ok) {
          const serverSession = await res.json();
          if (serverSession?.actionPlan?.milestones && serverSession.actionPlan.milestones.length > 0) {
            // Complete action plan found on server
            setSessionData(serverSession);
            return;
          }
          
          // No action plan but has chosen path - can stream
          if (serverSession?.chosenPathId && serverSession?.purposePaths?.length > 0) {
            setSessionData(serverSession);
            setNeedsStreaming(true);
            return;
          }
        }
      } catch (error) {
        console.error('Failed to fetch session from server:', error);
      }
      
      // No session data or chosen path, redirect to results
      navigate('/results');
    };
    
    checkActionPlanData();
  }, [isLoading, session, sessionData, sessionId, navigate]);

  // Helper function to get phase message
  const getPhaseMessage = (phase: StreamingPhase): string => {
    switch (phase) {
      case StreamingPhase.CONNECTING:
        return language === 'es' ? 'Conectando al servicio de IA...' : 'Connecting to AI service...';
      case StreamingPhase.THINKING:
        return language === 'es' ? 'La IA está creando tu plan de acción...' : 'AI is creating your action plan...';
      case StreamingPhase.STREAMING:
        return language === 'es' ? 'Generando tus hitos...' : 'Generating your milestones...';
      case StreamingPhase.ENRICHING:
        return language === 'es' ? 'Buscando recursos de aprendizaje...' : 'Finding learning resources...';
      case StreamingPhase.ERROR:
        return language === 'es' ? 'Error en la conexión' : 'Connection error';
      default:
        return language === 'es' ? 'Procesando...' : 'Processing...';
    }
  };

  if (isLoading) {
    return <ActionPlanSkeleton />;
  }

  // Show streaming UI if we're in streaming mode
  if (needsStreaming && streamingState.phase !== StreamingPhase.COMPLETE) {
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
                    {language === 'es' ? 'Hitos completados:' : 'Completed milestones:'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {streamingState.completedSections.map((section) => (
                      <span
                        key={section}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {section.replace('MILESTONE_', 'Milestone ').replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
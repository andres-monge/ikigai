/**
 * @file action-plan.tsx
 *
 * @description
 * Complete Action Plan page implementation (Step 22). Displays the detailed
 * action plan with side projects, skills to learn, and networking suggestions.
 * Uses Accordion for skills section and Cards for other content.
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Download, MessageCircle, ExternalLink, Lightbulb, Users, BookOpen } from 'lucide-react';
import { useGetActionPlan } from '@/hooks/use-assessment';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { t, type Language } from '@/lib/i18n';
import type { FullAssessment } from '@/types/assessment';

interface ActionPlanProps {
  language: Language;
  onOpenChat: () => void;
}

export function ActionPlan({ language, onOpenChat }: ActionPlanProps) {
  const [session] = useSessionStorage<FullAssessment | null>('session', null);
  const [, navigate] = useLocation();
  
  const { data: sessionData, isLoading, error } = useGetActionPlan(
    session?.sessionId ?? ''
  );

  // Redirect if no session
  useEffect(() => {
    if (!session?.sessionId) {
      navigate('/');
    }
  }, [session, navigate]);

  // Use session data from storage or fetched data
  const currentSession = sessionData ?? session;
  const actionPlan = currentSession?.actionPlan;
  const chosenPathId = currentSession?.chosenPathId;
  const chosenPath = currentSession?.purposePaths?.find(path => path.id === chosenPathId);

  const handleExportPdf = () => {
    // TODO: Implement PDF export in Step 24
    console.log('PDF export functionality will be implemented in Step 24');
  };

  const handleBackToResults = () => {
    navigate('/results');
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !actionPlan) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full mb-6">
          <ExternalLink className="text-red-600 w-10 h-10" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
          {t('actionPlan.noActionPlan', language)}
        </h2>
        <Button onClick={handleBackToResults} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('actionPlan.backToResults', language)}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Button
          onClick={handleBackToResults}
          variant="ghost"
          className="p-0 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('actionPlan.backToResults', language)}
        </Button>
        
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {t('actionPlan.title', language)}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">
            {t('actionPlan.subtitle', language)}
          </p>
          {chosenPath && (
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 rounded-lg p-4 border border-primary/20">
              <h2 className="font-semibold text-primary mb-1">{chosenPath.title}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">{chosenPath.description}</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          <Button onClick={handleExportPdf} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            {t('actionPlan.exportPdf', language)}
          </Button>
          <Button onClick={onOpenChat} variant="outline">
            <MessageCircle className="w-4 h-4 mr-2" />
            {t('actionPlan.refineWithNami', language)}
          </Button>
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-8">
        {/* Side Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              {t('actionPlan.sideProjects.title', language)}
            </CardTitle>
            <CardDescription>
              {t('actionPlan.sideProjects.description', language)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {actionPlan.sideProjectIdeas.map((idea, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-medium text-primary">{index + 1}</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{idea}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Skills to Learn */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              {t('actionPlan.skills.title', language)}
            </CardTitle>
            <CardDescription>
              {t('actionPlan.skills.description', language)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {actionPlan.skillsToLearn.map((skillData, index) => (
                <AccordionItem key={index} value={`skill-${index}`}>
                  <AccordionTrigger className="text-left">
                    {skillData.skill}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                        Recommended learning resources:
                      </p>
                      {skillData.youtubeLinks.map((video, videoIndex) => (
                        <a
                          key={videoIndex}
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <div className="w-10 h-10 bg-red-500 rounded flex items-center justify-center flex-shrink-0">
                            <ExternalLink className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {video.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              YouTube
                            </p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-slate-400" />
                        </a>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* People to Network With */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              {t('actionPlan.networking.title', language)}
            </CardTitle>
            <CardDescription>
              {t('actionPlan.networking.description', language)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {actionPlan.peopleToNetworkWith.map((person, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Users className="w-3 h-3 text-primary" />
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{person}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

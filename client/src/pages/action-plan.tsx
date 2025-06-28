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

import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  Lightbulb,
  GraduationCap,
  Users2,
  Download,
  MessageCircle,
  ArrowLeft,
  Youtube,
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useGetActionPlan } from '@/hooks/use-get-action-plan';
import { t, type Language } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { exportActionPlanToPDF } from '@/lib/pdf-export';

interface ActionPlanProps {
  language: Language;
  sessionId: string;
  onOpenChat: () => void;
  onStartOver: () => void;
}

export function ActionPlan({
  language,
  sessionId,
  onOpenChat,
}: ActionPlanProps) {
  const [, navigate] = useLocation();

  const { data: session, isLoading, isError } = useGetActionPlan(sessionId);

  const actionPlan = session?.actionPlan;
  const chosenPath = useMemo(() => {
    if (!session || !session.chosenPathId) return null;
    return (
      session.purposePaths.find((p) => p.id === session.chosenPathId) || null
    );
  }, [session]);

  useEffect(() => {
    // On first load, if we're not loading and there's no plan, redirect.
    // This handles page refreshes or direct navigation.
    if (!isLoading && !actionPlan) {
      navigate('/questionnaire');
    }
  }, [isLoading, actionPlan, navigate]);

  if (isLoading) {
    return <ActionPlanSkeleton />;
  }

  if (isError || !actionPlan || !chosenPath) {
    // This state should ideally be brief due to the redirect guard.
    return null;
  }

  const handleExportPDF = () => {
    // This check is for TypeScript, but the button is only rendered when this
    // data is available anyway.
    if (!actionPlan || !chosenPath) return;

    exportActionPlanToPDF(actionPlan, chosenPath.title, language);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header Section */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 gradient-primary rounded-full mb-4 shadow-lg">
          <ClipboardCheck className="text-white w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">
          {t('actionPlan.title', language)}
        </h2>
        <p className="text-lg text-slate-600 mb-4">
          {t('actionPlan.subtitle', language)}
        </p>
        <div className="inline-block bg-slate-100 text-slate-800 font-semibold px-4 py-2 rounded-lg">
          {t('actionPlan.chosenPath', language)}: {chosenPath.title}
        </div>
      </div>

      <div className="space-y-8">
        {/* Section 1: Side Project Ideas */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Lightbulb className="w-8 h-8 text-amber-500" />
            <div>
              <CardTitle>{t('actionPlan.sideProjects', language)}</CardTitle>
              <CardDescription>
                {t('actionPlan.sideProjectsDescription', language)}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-slate-700">
              {actionPlan.sideProjectIdeas.map((idea, i) => (
                <li key={i}>{idea}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Section 2: Skills to Learn */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <GraduationCap className="w-8 h-8 text-blue-600" />
            <div>
              <CardTitle>{t('actionPlan.skillsToLearn', language)}</CardTitle>
              <CardDescription>
                {t('actionPlan.skillsToLearnDescription', language)}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {actionPlan.skillsToLearn.map((skillItem, i) => (
                <AccordionItem value={`item-${i}`} key={i}>
                  <AccordionTrigger className="font-semibold text-base">
                    {skillItem.skill}
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-3 pt-2">
                      {skillItem.youtubeLinks.map((video, j) => (
                        <li key={j} className="flex items-start gap-3">
                          <Youtube className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                          <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-700 hover:text-primary hover:underline underline-offset-2 transition-colors"
                          >
                            {video.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Section 3: People to Network With */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Users2 className="w-8 h-8 text-emerald-600" />
            <div>
              <CardTitle>
                {t('actionPlan.peopleToNetworkWith', language)}
              </CardTitle>
              <CardDescription>
                {t('actionPlan.peopleToNetworkWithDescription', language)}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-slate-700">
              {actionPlan.peopleToNetworkWith.map((person, i) => (
                <li key={i}>{person}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
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
        <Button onClick={onOpenChat} variant="secondary" size="lg">
          <MessageCircle className="w-4 h-4 mr-2" />
          {t('actionPlan.refineWithNami', language)}
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
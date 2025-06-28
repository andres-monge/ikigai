/**
 * @file results.tsx
 * @description Displays the Purpose Discovery outcome and allows the user to
 * choose a path to generate a detailed action plan.
 *
 * ✨ **Updates in Step 21** ✨
 * - Integrated the `useCreateActionPlan` hook to trigger action plan generation.
 * - The component now reads the full session object (`FullAssessment`) from
 * session storage under the key 'session'.
 * - A handler function (`handleChoosePath`) is passed to `PurposePaths`.
 * - On successful action plan creation, it updates the session data and
 * navigates the user to `/action-plan`.
 * - Removed global <SalaryBenchmarks /> table in favor of path-level salary display.
 *
 * ✨ **Updates in Step 23** ✨
 * - Added `sessionId` prop to ensure a non-empty identifier is always sent
 *   to the backend when generating an action plan, resolving the bug where an
 *   empty `sessionId` caused a 404 error.
 *
 * @dependencies
 * - wouter: For navigation.
 * - lucide-react: For icons.
 * - @/hooks/use-session-storage: To persist/retrieve session data.
 * - @/hooks/use-assessment: For the `useCreateActionPlan` mutation.
 * - @/types/assessment: For the `FullAssessment` type.
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Sparkles, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoreDriversSummary } from '@/components/results/core-drivers-summary';
import { PurposePaths } from '@/components/results/purpose-paths';
import { t, type Language } from '@/lib/i18n';
import { exportToPDF } from '@/lib/pdf-export';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useCreateActionPlan } from '@/hooks/use-assessment';
import { useToast } from '@/hooks/use-toast';
import type { FullAssessment } from '@/types/assessment';

interface ResultsProps {
  /** Opens the chat drawer for refining a specific path */
  onOpenChat: (pathId: number) => void;
  onStartOver: () => void;
  language: Language;
  /** Anonymous session identifier passed from the top-level App component */
  sessionId: string;
}

export function Results({ onOpenChat, onStartOver, language, sessionId }: ResultsProps) {
  const [session, setSession] = useSessionStorage<FullAssessment | null>(
    'session',
    null,
  );
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { createActionPlan, isPending: isActionPlanPending } =
    useCreateActionPlan({
      sessionId,
      onSuccess: (updatedSession) => {
        setSession(updatedSession);
        navigate('/action-plan');
      },
      onError: (error) => {
        console.error('Action plan generation failed:', error);
        toast({
          title: t('common.error', language),
          description: 'Could not generate an action plan. Please try again.',
          variant: 'destructive',
        });
      },
    });

  /* Redirect guard */
  useEffect(() => {
    if (!session || !session.purposePaths || !session.coreDriversAnalysis) {
      navigate('/questionnaire');
    }
  }, [session, navigate]);

  const handleChoosePath = (pathId: number) => {
    if (typeof pathId === 'number') {
      createActionPlan(pathId);
    }
  };

  if (!session || !session.coreDriversAnalysis) {
    // Small fallback while redirect effect runs or for invalid state
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
    <div className="max-w-6xl mx-auto">
      {/* AI Analysis Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 gradient-primary rounded-full mb-4">
          <Sparkles className="text-white text-xl" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-4">
          {t('results.title', language)}
        </h2>
        <p className="text-lg text-slate-600">
          {t('results.subtitle', language)}
        </p>
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
        onOpenChat={onOpenChat}
        isChoosing={isActionPlanPending}
      />

      {/* Export and Start Over Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button
          onClick={handleExportPDF}
          className="gradient-primary text-white px-8 py-4 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
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
  );
}
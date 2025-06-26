/**
 * @file results.tsx
 *
 * @description
 * Displays the Purpose Discovery outcome. After Step 18 the component no
 * longer expects the heavy `results` prop; instead it reads the data from
 * `sessionStorage`. If the user refreshes or lands on this route without a
 * valid `results` object, we redirect to `/questionnaire`.
 *
 * As of Step 21, this page now orchestrates the transition to the Action Plan.
 * It uses the `useCreateActionPlan` hook to trigger the generation and
 * navigates to the `/action-plan` route upon success. It also displays a
 * loading overlay during this process.
 *
 * @dependencies
 * - wouter: For navigation (`useLocation`)
 * - lucide-react: For icons
 * - Shadcn Button: For UI actions
 * - Custom hooks: `useSessionStorage`, `useCreateActionPlan`, `useToast`
 * - Child components: `CoreDriversSummary`, `PurposePaths`, `SalaryBenchmarks`,
 * `LoadingOverlay`
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Sparkles, Download, MessageCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoreDriversSummary } from '@/components/results/core-drivers-summary';
import { PurposePaths } from '@/components/results/purpose-paths';
import { SalaryBenchmarks } from '@/components/results/salary-benchmarks';
import { LoadingOverlay } from '@/components/loading-overlay';
import { t, type Language } from '@/lib/i18n';
import { exportToPDF } from '@/lib/pdf-export';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useCreateActionPlan } from '@/hooks/use-assessment';
import { useToast } from '@/hooks/use-toast';
import type { AssessmentResults } from '@/types/assessment';

interface ResultsProps {
  onOpenChat: () => void;
  onStartOver: () => void;
  language: Language;
}

export function Results({ onOpenChat, onStartOver, language }: ResultsProps) {
  const [results, setResults] = useSessionStorage<AssessmentResults | null>(
    'results',
    null,
  );
  const [sessionId] = useSessionStorage<string | null>('sessionId', null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { createActionPlan, isPending: isCreatingActionPlan } =
    useCreateActionPlan({
      sessionId: sessionId!,
      onSuccess: (data) => {
        // The full session data, including the new action plan, is returned.
        // Persist it so the next page can use it.
        setResults(data);
        navigate('/action-plan');
      },
      onError: () => {
        toast({
          title: t('error.genericTitle', language),
          description: t('error.actionPlanGeneration', language),
          variant: 'destructive',
        });
      },
    });

  /* Redirect guard */
  useEffect(() => {
    if (!results || !sessionId) {
      navigate('/questionnaire');
    }
  }, [results, sessionId, navigate]);

  const handleChoosePath = (pathId: number) => {
    // Should be caught by useEffect guard, but check again for type safety
    if (!sessionId) return;
    createActionPlan({ chosenPathId: pathId });
  };

  if (!results) {
    // Small fallback while redirect effect runs
    return null;
  }

  const handleExportPDF = () => exportToPDF(results, language);

  return (
    <div className="max-w-6xl mx-auto relative">
      <LoadingOverlay
        isVisible={isCreatingActionPlan}
        text={t('results.generatingPlan', language)}
      />

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
      <CoreDriversSummary analysis={results.analysis} language={language} />

      {/* Purpose Paths */}
      <PurposePaths
        purposePaths={results.purposePaths}
        language={language}
        onChoosePath={handleChoosePath}
        isChoosingPath={isCreatingActionPlan}
      />

      {/* Salary Benchmarks */}
      <SalaryBenchmarks salaryData={results.salaryData} language={language} />

      {/* Export and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button
          onClick={handleExportPDF}
          className="gradient-primary text-white px-8 py-4 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
        >
          <Download className="w-4 h-4 mr-2" />
          {t('results.exportPdf', language)}
        </Button>

        <Button
          onClick={onOpenChat}
          variant="outline"
          className="border-2 border-primary text-primary px-8 py-4 rounded-xl font-semibold hover:bg-primary hover:text-white transition-all duration-200"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          {t('results.refineWithNami', language)}
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
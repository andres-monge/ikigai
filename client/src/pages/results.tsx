import { Sparkles, Download, MessageCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoreDriversSummary } from '@/components/results/core-drivers-summary';
import { PurposePaths } from '@/components/results/purpose-paths';
import { SalaryBenchmarks } from '@/components/results/salary-benchmarks';
import { t, type Language } from '@/lib/i18n';
import { exportToPDF } from '@/lib/pdf-export';
import type { AssessmentResults } from '@/types/assessment';

interface ResultsProps {
  results: AssessmentResults;
  onOpenChat: () => void;
  onStartOver: () => void;
  language: Language;
}

export function Results({ results, onOpenChat, onStartOver, language }: ResultsProps) {
  const handleExportPDF = () => {
    exportToPDF(results, language);
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
      <CoreDriversSummary analysis={results.analysis} language={language} />

      {/* Purpose Paths */}
      <PurposePaths purposePaths={results.purposePaths} language={language} />

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

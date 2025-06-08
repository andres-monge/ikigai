import { Lightbulb } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';
import type { CoreDrivers } from '@/types/assessment';

interface CoreDriversSummaryProps {
  analysis: CoreDrivers;
  language: Language;
}

export function CoreDriversSummary({ analysis, language }: CoreDriversSummaryProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
      <div className="flex items-center mb-6">
        <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center mr-3">
          <Lightbulb className="text-white w-4 h-4" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">
          {t('results.coreDrivers', language)}
        </h3>
      </div>
      
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="border-l-4 border-primary pl-4">
            <h4 className="font-semibold text-slate-900 mb-2">
              🌟 {t('drivers.energy', language)}
            </h4>
            <p className="text-slate-600">{analysis.energy}</p>
          </div>
          
          <div className="border-l-4 border-secondary pl-4">
            <h4 className="font-semibold text-slate-900 mb-2">
              ⚡ {t('drivers.edge', language)}
            </h4>
            <p className="text-slate-600">{analysis.edge}</p>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="border-l-4 border-success pl-4">
            <h4 className="font-semibold text-slate-900 mb-2">
              🌍 {t('drivers.impact', language)}
            </h4>
            <p className="text-slate-600">{analysis.impact}</p>
          </div>
          
          <div className="border-l-4 border-accent pl-4">
            <h4 className="font-semibold text-slate-900 mb-2">
              💰 {t('drivers.economic', language)}
            </h4>
            <p className="text-slate-600">{analysis.economic}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

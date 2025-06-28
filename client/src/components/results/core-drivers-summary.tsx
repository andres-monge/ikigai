import { Lightbulb } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';
import type { CoreDrivers } from '@/types/assessment';

interface CoreDriversSummaryProps {
  analysis: CoreDrivers;
  language: Language;
}

/**
 * @file core-drivers-summary.tsx
 *
 * @description
 * React component that renders the four "Core Drivers" paragraphs (Energy, Edge,
 * Impact, and Economic Reality) derived from the AI-generated assessment
 * analysis. The component is **presentational only** – it receives the
 * `CoreDrivers` analysis object and currently selected `language` string via
 * props and displays the localised section headers with the associated text.
 *
 * Inputs:
 *  - `analysis` (`CoreDrivers`): The object containing the four driver
 *    explanations returned by the backend. Note that the economic driver field
 *    is now standardised to `economicReality` across the entire codebase.
 *  - `language` (`Language`): ISO language code used by the i18n helper `t` to
 *    translate static labels.
 *
 * There is purposely *no* business logic or side-effects in this component so
 * it remains easily testable and reusable.
 */

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
            <p className="text-slate-600">{analysis.economicReality}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

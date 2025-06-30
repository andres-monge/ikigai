import { Lightbulb } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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

export function CoreDriversSummary({
  analysis,
  language,
}: CoreDriversSummaryProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
      <div className="flex items-center mb-6">
        <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center mr-3">
          <Lightbulb className="text-white w-4 h-4" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">
          {t('results.yourIkigai', language) || 'Your Ikigai'}
        </h3>
      </div>

      <div className="space-y-6">
        <p className="text-center font-bold text-slate-800 text-lg">
          {analysis.statementSentence}
        </p>
        <div className="prose prose-slate max-w-none">
          <ReactMarkdown
            components={{
              p: ({ node, ...props }) => (
                <p className="text-slate-600" {...props} />
              ),
              ol: ({ node, ...props }) => (
                <ol className="list-decimal list-inside space-y-2" {...props} />
              ),
              li: ({ node, ...props }) => (
                <li className="text-slate-600" {...props} />
              ),
            }}
          >
            {analysis.coreThreads}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

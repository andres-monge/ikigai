
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
  /**
   * Normalize the coreThreads text to ensure proper markdown formatting.
   * The AI sometimes generates inline numbered lists like "1. Text 2. Text 3. Text"
   * instead of properly formatted markdown with line breaks between items.
   * This function ensures each numbered item starts on a new line.
   */
  const normalizedCoreThreads = analysis.coreThreads
    .replace(/(\d+\.)/g, '\n$1') // Add newline before each number
    .trim(); // Remove leading/trailing whitespace

  return (
    <div className="retro-card-results p-8 mb-8">


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
                <ol className="list-decimal list-outside ml-6 space-y-3" {...props} />
              ),
              li: ({ node, ...props }) => (
                <li className="text-slate-600 pl-2" {...props} />
              ),
            }}
          >
            {normalizedCoreThreads}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

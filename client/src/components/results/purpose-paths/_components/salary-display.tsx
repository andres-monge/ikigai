/**
 * @file salary-display.tsx
 *
 * @description
 * React component responsible for rendering salary benchmark information for a
 * single Purpose Path. This implementation replaces the former global
 * <SalaryBenchmarks /> table by embedding salary data directly inside each path
 * card, improving contextual relevance and reducing vertical scroll.
 *
 * The component displays the following:
 *   1. A three-column grid for Entry, Mid, and Senior compensation ranges.
 *   2. The primary geographical location for the data set.
 *   3. A collapsible list of external sources.
 *
 * @prop {Array<SalaryData>} salaryData – Array coming from the backend. Each
 *       object represents salary data for a specific seniority level in the
 *       same location. Although the backend may return multiple rows, the
 *       current UI groups them assuming identical `location` & `sources`. If
 *       the array is empty, nothing is rendered.
 * @prop {Language} language – User-selected language code used for i18n.
 *
 * @remarks
 * Edge Cases & Validation:
 *   • If `salaryData` is empty or all fields are null, the component bails out
 *     early—making the salary section optional per path.
 *   • Null values are displayed as "—" to communicate missing data without
 *     breaking the grid layout.
 *   • All outbound links open in a new tab and are marked `rel="noopener
 *     noreferrer"` for security.
 */

import { ExternalLink } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';
import type { SalaryData } from '@/types/assessment';

export interface SalaryDisplayProps {
  /**
   * Raw salary data coming from the backend for the given Purpose Path. The
   * `title` field is omitted because it is implicit in the surrounding card.
   */
  salaryData: Omit<SalaryData, 'title'>[];
  /** Selected language for localisation */
  language: Language;
}

export function SalaryDisplay({ salaryData, language }: SalaryDisplayProps) {
  // ----- Early exit ---------------------------------------------------------
  if (!salaryData?.length) return null;

  // The API currently returns one aggregated object per path. In case that
  // changes we fallback to the first element.
  const data = salaryData[0];

  const { entryLevel, midLevel, seniorLevel, location, sources } = data;
  const hasAnyValues = entryLevel || midLevel || seniorLevel;

  if (!hasAnyValues && !location) return null; // Nothing useful to show

  return (
    <div className="mt-6 bg-slate-50 rounded-lg p-4">
      {/* Section Title */}
      <h6 className="font-medium text-slate-900 mb-4">
        {t('results.salaryBenchmarks', language)}
      </h6>

      {/* Salary Grid ---------------------------------------------------------*/}
      <div className="grid grid-cols-3 gap-4 text-center mb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
            {language === 'en' ? 'Entry' : 'Inicial'}
          </p>
          <p className="text-sm text-slate-700">
            {entryLevel ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
            {language === 'en' ? 'Mid' : 'Medio'}
          </p>
          <p className="text-sm text-slate-700">
            {midLevel ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
            {language === 'en' ? 'Senior' : 'Senior'}
          </p>
          <p className="text-sm text-slate-700">
            {seniorLevel ?? '—'}
          </p>
        </div>
      </div>

      {/* Location ------------------------------------------------------------*/}
      {location && (
        <p className="text-xs text-slate-600 mb-4">
          <strong className="font-semibold text-slate-700">
            {language === 'en' ? 'Location:' : 'Ubicación:'}
          </strong>{' '}
          {location}
        </p>
      )}

      {/* Sources -------------------------------------------------------------*/}
      {Array.isArray(sources) && sources.length > 0 && (
        <div className="text-xs text-slate-600 space-y-1">
          <p className="font-medium text-slate-700">
            {language === 'en' ? 'Sources' : 'Fuentes'}
          </p>
          {sources.map((src, idx) => (
            <p key={idx} className="flex items-center">
              •{' '}
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline ml-1 inline-flex items-center"
              >
                {src}
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </p>
          ))}
        </div>
      )}
    </div>
  );
} 
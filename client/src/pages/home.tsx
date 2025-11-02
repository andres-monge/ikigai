/**
 * @file home.tsx
 *
 * @description
 * Landing (“Welcome”) page.  Step 18 removes the `onStartAssessment` callback
 * prop – navigation is achieved directly via `wouter` so the component is
 * completely self-contained inside the router.
 */

import { UserX, ArrowRight } from 'lucide-react';
import React from 'react';
import { useLocation } from 'wouter';
import { t, type Language } from '@/lib/i18n';
import { SinglePageQuestionnaire } from '@/components/questionnaire/single-page-questionnaire';
import { useSessionStorage } from '@/hooks/use-session-storage';
import type { FullAssessment } from '@/types/assessment';

interface HomeProps {
  /** Current UI language */
  language: Language;
  /** Anonymous session identifier used by backend API calls */
  sessionId: string;
}

export function Home({ language, sessionId }: HomeProps) {
  const [, navigate] = useLocation();
  const [session] = useSessionStorage<FullAssessment | null>('session', null);

  // Check if user has existing results (only check local cache, don't fetch from server)
  const hasResults = session?.coreDriversAnalysis || (session?.purposePaths?.length ?? 0) > 0;

  return (
    <div className="text-center mb-12">
      <div className="max-w-3xl mx-auto">
        {/* Resume banner - only show if results exist */}
        {hasResults && (
          <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 mb-6 flex items-center justify-center">
            <button
              onClick={() => navigate('/results')}
              className="text-blue-900 font-medium hover:text-blue-700 transition-colors flex items-center gap-2"
            >
              {t('home.returnToPaths', language)}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Hero */}
        <div
          className="relative mb-8 rounded-2xl overflow-hidden shadow-xl p-6"
          style={{
            backgroundColor: '#fff9f3'
          }}
        >
          <div className="text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
              {t('welcome.title', language)}
            </h2>
            
            {/* Image container */}
            <div className="mx-auto my-4 max-w-sm">
              <img 
                src="/assets/ikigai-circles-866.png" 
                alt=""
                className="w-full h-auto"
              />
            </div>

            {/* Subtitle */}
            <p className="text-xl md:text-2xl font-bold text-gray-900 mt-4 opacity-70">
              {t('welcome.description', language)}
            </p>
          </div>
        </div>

        {/* Inline single-page questionnaire – introduced in Step 2 */}
        <div className="mt-12">
          <SinglePageQuestionnaire language={language} sessionId={sessionId} />
        </div>

        <div className="flex justify-center mt-6 space-x-8 text-sm text-slate-500">
          <div className="flex items-center">
            <UserX className="w-4 h-4 mr-2 text-accent" />
            <span>{t('welcome.noAccount', language)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

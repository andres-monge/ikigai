/**
 * @file home.tsx
 *
 * @description
 * Landing (“Welcome”) page.  Step 18 removes the `onStartAssessment` callback
 * prop – navigation is achieved directly via `wouter` so the component is
 * completely self-contained inside the router.
 */

import { UserX } from 'lucide-react';
import React from 'react';
import { t, type Language } from '@/lib/i18n';
import { SinglePageQuestionnaire } from '@/components/questionnaire/single-page-questionnaire';

interface HomeProps {
  /** Current UI language */
  language: Language;
  /** Anonymous session identifier used by backend API calls */
  sessionId: string;
}

export function Home({ language, sessionId }: HomeProps) {

  return (
    <div className="text-center mb-12">
      <div className="max-w-3xl mx-auto">
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

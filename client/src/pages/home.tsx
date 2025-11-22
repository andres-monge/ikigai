/**
 * @file home.tsx
 *
 * @description
 * Landing (“Welcome”) page.  Step 18 removes the `onStartAssessment` callback
 * prop – navigation is achieved directly via `wouter` so the component is
 * completely self-contained inside the router.
 */

import { ArrowRight } from 'lucide-react';
import React from 'react';
import { useLocation } from 'wouter';
import { t, type Language } from '@/lib/i18n';
import { SinglePageQuestionnaire } from '@/components/questionnaire/single-page-questionnaire';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { useSoundEffect } from '@/hooks/use-sound-effect';
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
  const { play: playReturnSound } = useSoundEffect('/sounds/click-return.mp3');

  // Check if user has existing results (only check local cache, don't fetch from server)
  const hasResults = session?.coreDriversAnalysis || (session?.purposePaths?.length ?? 0) > 0;

  const handleReturnToPaths = () => {
    navigate('/results');
  };

  return (
    <>
      {/* Resume banner - only show if results exist */}
      {hasResults && (
        <div className="bg-ikigai-cream w-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
            <div className="retro-card-results p-5 flex items-center justify-center animate-fade-in-up">
              <button
                onPointerDown={playReturnSound}
                onClick={handleReturnToPaths}
                className="text-slate-800 font-bold hover:opacity-70 transition-opacity flex items-center gap-2 text-lg"
              >
                {t('home.returnToPaths', language)}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="bg-ikigai-cream p-10 md:p-16 text-center animate-fade-in-up delay-100 rounded-none border-0">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-black mb-8 text-gray-900 tracking-tight">
            {t('welcome.title', language)}
          </h1>

          {/* Image container */}
          <div className="mx-auto my-8 max-w-lg">
            <img
              src="/assets/ikigai-circles-866.png"
              alt="Ikigai diagram showing the intersection of what you love, what you're good at, what the world needs, and what you can be paid for"
              className="w-full h-auto"
            />
          </div>

          {/* Subtitle */}
          <p className="text-2xl md:text-3xl font-bold text-gray-800 mt-8 leading-relaxed">
            {t('welcome.description', language)}
          </p>
        </div>
      </div>

      {/* Questionnaire */}
      <div className="bg-ikigai-beige animate-fade-in-up delay-200">
        <SinglePageQuestionnaire language={language} sessionId={sessionId} />
      </div>
    </>
  );
}

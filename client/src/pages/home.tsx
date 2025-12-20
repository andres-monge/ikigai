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
import { motion } from 'framer-motion';
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
      {/* Resume banner - only show if results exist (full-bleed) */}
      {hasResults && (
        <motion.div
          className="bg-ikigai-cream w-screen ml-[calc(-50vw+50%)]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
            <div className="retro-card-results p-5 flex items-center justify-center">
              <motion.button
                onPointerDown={playReturnSound}
                onClick={handleReturnToPaths}
                className="text-slate-800 font-bold hover:opacity-70 transition-opacity flex items-center gap-2 text-lg"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {t('home.returnToPaths', language)}
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Hero Section - full-bleed to extend cream background edge-to-edge */}
      <motion.div
        className="bg-ikigai-cream p-10 md:p-16 text-center rounded-none border-0 w-screen ml-[calc(-50vw+50%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <div className="max-w-7xl mx-auto">
          <motion.h1
            className="text-5xl md:text-7xl font-black mb-8 text-gray-900 tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          >
            {t('welcome.title', language)}
          </motion.h1>

          {/* Image container */}
          <motion.div
            className="mx-auto my-8 max-w-lg"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
          >
            <img
              src="/assets/ikigai-circles-866.png"
              alt="Ikigai diagram showing the intersection of what you love, what you're good at, what the world needs, and what you can be paid for"
              className="w-full h-auto"
            />
          </motion.div>

          {/* Subtitle */}
          <motion.p
            className="text-2xl md:text-3xl font-bold text-gray-800 mt-8 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
          >
            {t('welcome.description', language)}
          </motion.p>
        </div>
      </motion.div>

      {/* Questionnaire */}
      <motion.div
        className="bg-ikigai-beige"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8, ease: "easeOut" }}
      >
        <SinglePageQuestionnaire language={language} sessionId={sessionId} />
      </motion.div>
    </>
  );
}

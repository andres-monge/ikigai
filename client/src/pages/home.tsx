/**
 * @file home.tsx
 *
 * @description
 * Landing (“Welcome”) page.  Step 18 removes the `onStartAssessment` callback
 * prop – navigation is achieved directly via `wouter` so the component is
 * completely self-contained inside the router.
 */

import { PlayCircle, Clock, UserX, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t, type Language } from '@/lib/i18n';
import { useLocation } from 'wouter';

interface HomeProps {
  language: Language;
}

export function Home({ language }: HomeProps) {
  const [, navigate] = useLocation();

  /** Kick-off the questionnaire flow */
  const handleStart = () => navigate('/questionnaire');

  return (
    <div className="text-center mb-12">
      <div className="max-w-3xl mx-auto">
        {/* Hero */}
        <div
          className="relative h-64 mb-8 rounded-2xl overflow-hidden shadow-xl"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&h=400')",
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary/80 to-secondary/80 flex items-center justify-center">
            <div className="text-center text-white">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                {t('welcome.title', language)}
              </h2>
              <p className="text-xl opacity-90">{t('welcome.subtitle', language)}</p>
            </div>
          </div>
        </div>

        <p className="text-lg text-slate-600 mb-8 leading-relaxed">
          {t('welcome.description', language)}
        </p>

        <Button
          onClick={handleStart}
          variant="secondary"
          className="px-8 py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
        >
          <PlayCircle className="w-5 h-5 mr-2" />
          {t('welcome.startButton', language)}
        </Button>

        <div className="flex justify-center mt-6 space-x-8 text-sm text-slate-500">
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-2 text-accent" />
            <span>{t('welcome.duration', language)}</span>
          </div>
          <div className="flex items-center">
            <UserX className="w-4 h-4 mr-2 text-accent" />
            <span>{t('welcome.noAccount', language)}</span>
          </div>
          <div className="flex items-center">
            <Download className="w-4 h-4 mr-2 text-accent" />
            <span>{t('welcome.pdfExport', language)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

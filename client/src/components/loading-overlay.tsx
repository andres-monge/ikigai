import { Sparkles } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';

interface LoadingOverlayProps {
  isVisible: boolean;
  language: Language;
}

export function LoadingOverlay({
  isVisible,
  language,
}: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md mx-4 text-center flex flex-col items-center justify-center min-h-[200px]">
        <div className="w-16 h-16 gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="text-white text-xl animate-pulse" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">
          {t('loading.title', language)}
        </h3>
        <p className="text-slate-600">
          {t('loading.description', language)}
        </p>
      </div>
    </div>
  );
}

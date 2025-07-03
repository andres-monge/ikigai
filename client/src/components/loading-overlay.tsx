import { Sparkles } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';

interface LoadingOverlayProps {
  isVisible: boolean;
  language: Language;
  /** Optional title to display. Falls back to a default "Thinking..." */
  title?: string;
  /** Optional description to display. Falls back to a default "Analyzing your answers..." */
  description?: string;
}

export function LoadingOverlay({
  isVisible,
  language,
  title,
  description,
}: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md mx-4 text-center">
        <div className="w-16 h-16 gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="text-white text-xl animate-pulse" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">
          {title || t('loading.thinking', language)}
        </h3>
        <p className="text-slate-600 mb-4">
          {description || t('loading.analyzing', language)}
        </p>
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div className="gradient-primary h-2 rounded-full animate-pulse w-3/5"></div>
        </div>
      </div>
    </div>
  );
}

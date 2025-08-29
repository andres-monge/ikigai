/**
 * @file loading-state.tsx
 * @description Reusable loading state component with consistent styling
 * and internationalization support.
 */

import { t, type Language } from '@/lib/i18n';

interface LoadingStateProps {
  /** The main title to display */
  title: string;
  /** The loading message to display */
  message: string;
  /** Current language for any additional i18n needs */
  language: Language;
}

export function LoadingState({ title, message, language }: LoadingStateProps) {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">
          {title}
        </h2>
      </div>
      
      <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
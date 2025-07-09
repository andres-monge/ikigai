import { useState } from 'react';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t, type Language } from '@/lib/i18n';

interface HeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

export function Header({ language, onLanguageChange }: HeaderProps) {
  return (
    <header className="bg-white shadow-sm border-b border-slate-200">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
            <Compass className="text-white text-sm" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            {t('header.title', language)}
          </h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <Button
              variant={language === 'en' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onLanguageChange('en')}
              className="px-3 py-1 text-sm font-medium"
            >
              EN
            </Button>
            <Button
              variant={language === 'es' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onLanguageChange('es')}
              className="px-3 py-1 text-sm font-medium"
            >
              ES
            </Button>
          </div>
          

        </div>
      </nav>
    </header>
  );
}

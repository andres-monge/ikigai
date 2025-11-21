import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t, type Language } from '@/lib/i18n';

interface HeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onNavigateHome: () => void;
}

export function Header({ language, onLanguageChange, onNavigateHome }: HeaderProps) {
  const handleNavigateHome = () => {
    onNavigateHome();
  };

  const handleLanguageChange = (lang: Language) => {
    onLanguageChange(lang);
  };

  return (
    <header className="bg-white shadow-sm border-b border-slate-200">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <button
          onClick={handleNavigateHome}
          className="flex items-center space-x-3 hover:opacity-80 transition-opacity cursor-pointer group"
        >
          <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
            <Compass className="text-white text-sm" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 group-hover:text-primary transition-colors">
            {t('header.title', language)}
          </h1>
        </button>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center gap-3">
            <Button
              variant={language === 'en' ? 'retro-sm' : 'retro-inactive'}
              size="sm"
              onClick={() => handleLanguageChange('en')}
              className="px-4 py-1 text-sm"
            >
              EN
            </Button>
            <Button
              variant={language === 'es' ? 'retro-sm' : 'retro-inactive'}
              size="sm"
              onClick={() => handleLanguageChange('es')}
              className="px-4 py-1 text-sm"
            >
              ES
            </Button>
          </div>


        </div>
      </nav>
    </header>
  );
}

import { Rocket, Users, Code } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';
import type { PurposePath } from '@/types/assessment';

interface PurposePathsProps {
  purposePaths: PurposePath[];
  language: Language;
}

export function PurposePaths({ purposePaths, language }: PurposePathsProps) {
  const getIcon = (index: number) => {
    const icons = [Rocket, Users, Code];
    const Icon = icons[index] || Rocket;
    return Icon;
  };

  const getGradient = (index: number) => {
    const gradients = [
      'from-primary to-blue-600',
      'from-secondary to-purple-600', 
      'from-success to-teal-600'
    ];
    return gradients[index] || gradients[0];
  };

  return (
    <div className="mb-8">
      <h3 className="text-2xl font-bold text-slate-900 mb-6 text-center">
        {t('results.purposePaths', language)}
      </h3>
      
      <div className="grid lg:grid-cols-3 gap-6">
        {purposePaths.map((path, index) => {
          const Icon = getIcon(index);
          const gradient = getGradient(index);
          
          return (
            <div key={index} className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300">
              <div className={`bg-gradient-to-br ${gradient} p-6 text-white`}>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xl font-bold">{path.title}</h4>
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <p className="opacity-90 text-sm">{path.description}</p>
              </div>
              
              <div className="p-6">
                <div className="mb-6">
                  <h5 className="font-semibold text-slate-900 mb-3">
                    {language === 'en' ? 'Ikigai Alignment' : 'Alineación Ikigai'}
                  </h5>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-400 rounded-full mr-3"></div>
                      <span className="text-sm text-slate-600">
                        <strong>{language === 'en' ? 'Love:' : 'Amor:'}</strong> {path.ikigaiAlignment.love}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-blue-400 rounded-full mr-3"></div>
                      <span className="text-sm text-slate-600">
                        <strong>{language === 'en' ? 'Good at:' : 'Bueno en:'}</strong> {path.ikigaiAlignment.goodAt}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
                      <span className="text-sm text-slate-600">
                        <strong>{language === 'en' ? 'World needs:' : 'El mundo necesita:'}</strong> {path.ikigaiAlignment.worldNeeds}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-yellow-400 rounded-full mr-3"></div>
                      <span className="text-sm text-slate-600">
                        <strong>{language === 'en' ? 'Pay:' : 'Pago:'}</strong> {path.ikigaiAlignment.pay}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-slate-50 rounded-lg p-4">
                  <h6 className="font-medium text-slate-900 mb-2">
                    {language === 'en' ? 'Action Strategy' : 'Estrategia de Acción'}
                  </h6>
                  <p className="text-sm text-slate-600">{path.actionStrategy}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

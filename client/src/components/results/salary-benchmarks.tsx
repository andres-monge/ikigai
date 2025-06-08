import { Clock, ExternalLink } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';
import type { SalaryData } from '@/types/assessment';

interface SalaryBenchmarksProps {
  salaryData: SalaryData[];
  language: Language;
}

export function SalaryBenchmarks({ salaryData, language }: SalaryBenchmarksProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-slate-900">
          {t('results.salaryBenchmarks', language)}
        </h3>
        <div className="flex items-center text-sm text-slate-500">
          <Clock className="w-4 h-4 mr-1" />
          <span>{language === 'en' ? 'Updated hourly' : 'Actualizado cada hora'}</span>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-4 px-2 font-semibold text-slate-900">
                {language === 'en' ? 'Career Path' : 'Trayectoria Profesional'}
              </th>
              <th className="text-left py-4 px-2 font-semibold text-slate-900">
                {language === 'en' ? 'Entry Level' : 'Nivel Inicial'}
              </th>
              <th className="text-left py-4 px-2 font-semibold text-slate-900">
                {language === 'en' ? 'Mid Level' : 'Nivel Medio'}
              </th>
              <th className="text-left py-4 px-2 font-semibold text-slate-900">
                {language === 'en' ? 'Senior Level' : 'Nivel Senior'}
              </th>
              <th className="text-left py-4 px-2 font-semibold text-slate-900">
                {language === 'en' ? 'Location' : 'Ubicación'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {salaryData.map((data, index) => (
              <tr key={index}>
                <td className="py-4 px-2 font-medium text-slate-900">{data.title}</td>
                <td className="py-4 px-2 text-slate-600">{data.entryLevel}</td>
                <td className="py-4 px-2 text-slate-600">{data.midLevel}</td>
                <td className="py-4 px-2 text-slate-600">{data.seniorLevel}</td>
                <td className="py-4 px-2 text-slate-600">{data.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-6 pt-4 border-t border-slate-200">
        <h4 className="font-medium text-slate-900 mb-3">
          {language === 'en' ? 'Data Sources' : 'Fuentes de Datos'}
        </h4>
        <div className="space-y-1 text-sm text-slate-600">
          {salaryData[0]?.sources?.map((source, index) => (
            <p key={index}>
              • <a 
                href={source} 
                className="text-primary hover:underline inline-flex items-center"
                target="_blank"
                rel="noopener noreferrer"
              >
                {source}
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

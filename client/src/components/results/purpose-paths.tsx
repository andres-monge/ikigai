/**
 * @file purpose-paths.tsx
 * @description Renders the three AI-generated "Purpose Path" cards.
 *
 * ✨ **Updates in Step 21** ✨
 * - Added a "Choose this Path & Get Plan" button to each card.
 * - Component now accepts an `onChoosePath` callback prop, which is
 * invoked with the path ID when the user clicks the new button.
 * - Added an `isChoosing` prop to disable buttons during mutation.
 *
 * @dependencies
 * - lucide-react: For icons.
 * - @/lib/i18n: For internationalization.
 * - @/types/assessment: For the `PurposePath` type.
 * - @/components/ui/button: For the new action button.
 */
import { Rocket, Users, Code, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t, type Language } from '@/lib/i18n';
import type { PurposePathWithSalary } from '@/types/assessment';
import { SalaryDisplay } from './purpose-paths/_components/salary-display';

interface PurposePathsProps {
  purposePaths: PurposePathWithSalary[];
  language: Language;
  /**
   * Callback function invoked when the user selects a path.
   * @param pathId The ID of the chosen path.
   */
  onChoosePath: (pathId: number) => void;
  /**
   * If true, indicates the action plan is being generated, and disables buttons.
   */
  isChoosing: boolean;
}

export function PurposePaths({
  purposePaths,
  language,
  onChoosePath,
  isChoosing,
}: PurposePathsProps) {
  const getIcon = (index: number) => {
    const icons = [Rocket, Users, Code];
    return icons[index] || Rocket;
  };

  const getGradient = (index: number) => {
    const gradients = [
      'from-primary to-blue-600',
      'from-secondary to-purple-600',
      'from-accent to-orange-600',
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
            <div
              key={path.id || index}
              className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col justify-between hover:shadow-xl transition-all duration-300"
            >
              <div>
                <div
                  className={`bg-gradient-to-br ${gradient} p-6 text-white`}
                >
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
                      {t('ikigai.alignment', language)}
                    </h5>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-red-400 rounded-full mr-3 flex-shrink-0"></div>
                        <span className="text-sm text-slate-600">
                          <strong>{t('ikigai.love', language)}:</strong>{' '}
                          {path.ikigaiAlignment.love}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-blue-400 rounded-full mr-3 flex-shrink-0"></div>
                        <span className="text-sm text-slate-600">
                          <strong>{t('ikigai.goodAt', language)}:</strong>{' '}
                          {path.ikigaiAlignment.goodAt}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-green-400 rounded-full mr-3 flex-shrink-0"></div>
                        <span className="text-sm text-slate-600">
                          <strong>{t('ikigai.worldNeeds', language)}:</strong>{' '}
                          {path.ikigaiAlignment.worldNeeds}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <div className="w-3 h-3 bg-yellow-400 rounded-full mr-3 flex-shrink-0"></div>
                        <span className="text-sm text-slate-600">
                          <strong>{t('ikigai.pay', language)}:</strong>{' '}
                          {path.ikigaiAlignment.pay}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4">
                    <h6 className="font-medium text-slate-900 mb-2">
                      {t('results.actionStrategy', language)}
                    </h6>
                    <p className="text-sm text-slate-600">
                      {path.actionStrategy}
                    </p>
                  </div>

                  {/* Embedded Salary Information */}
                  <SalaryDisplay
                    salaryData={path.salaryData}
                    language={language}
                  />
                </div>
              </div>

              {/* Action Button */}
              <div className="p-6 pt-0">
                {typeof path.id === 'number' && (
                  <Button
                    onClick={() => onChoosePath(path.id!)}
                    className="w-full gradient-primary text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                    disabled={isChoosing}
                  >
                    {isChoosing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    {t('results.choosePathAndGetPlan', language)}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
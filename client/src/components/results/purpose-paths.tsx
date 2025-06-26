/**
 * @file purpose-paths.tsx
 *
 * @description
 * This component renders the three generated "Purpose Paths" in a grid layout.
 * Each path is displayed on a card with its title, description, and alignment
 * to the four Ikigai dimensions.
 *
 * As of Step 21, it now includes a button on each card for the user to select
 * a path and trigger the generation of a detailed action plan.
 *
 * @dependencies
 * - lucide-react: For icons (Rocket, Users, Code, Award)
 * - i18n: For localization of UI strings
 * - Shadcn Button: For the "Choose Path" action
 *
 * @props
 * - purposePaths: An array of PurposePath objects to display.
 * - language: The current display language.
 * - onChoosePath: A callback function invoked with the path ID when a user
 * selects a path.
 * - isChoosingPath: A boolean to disable the buttons while an action plan is
 * being generated.
 */
import { Rocket, Users, Code, Award } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';
import type { PurposePath } from '@/types/assessment';
import { Button } from '@/components/ui/button';

interface PurposePathsProps {
  purposePaths: PurposePath[];
  language: Language;
  onChoosePath: (pathId: number) => void;
  isChoosingPath: boolean;
}

export function PurposePaths({
  purposePaths,
  language,
  onChoosePath,
  isChoosingPath,
}: PurposePathsProps) {
  const getIcon = (index: number) => {
    const icons = [Rocket, Users, Code];
    const Icon = icons[index] || Rocket;
    return Icon;
  };

  const getGradient = (index: number) => {
    const gradients = [
      'from-primary to-blue-600',
      'from-secondary to-purple-600',
      'from-success to-teal-600',
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
              key={path.id} // Use the stable path ID as the key
              className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col"
            >
              <div className={`bg-gradient-to-br ${gradient} p-6 text-white`}>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xl font-bold">{path.title}</h4>
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <p className="opacity-90 text-sm">{path.description}</p>
              </div>

              <div className="p-6 flex-grow flex flex-col">
                <div className="mb-6">
                  <h5 className="font-semibold text-slate-900 mb-3">
                    {t('results.ikigaiAlignment', language)}
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
                        <strong>
                          {t('ikigai.worldNeeds', language)}:
                        </strong>{' '}
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

                <div className="bg-slate-50 rounded-lg p-4 flex-grow">
                  <h6 className="font-medium text-slate-900 mb-2">
                    {t('results.actionStrategy', language)}
                  </h6>
                  <p className="text-sm text-slate-600">
                    {path.actionStrategy}
                  </p>
                </div>

                <div className="mt-6">
                  <Button
                    onClick={() => onChoosePath(path.id)}
                    disabled={isChoosingPath}
                    className="w-full gradient-primary text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Award className="w-4 h-4 mr-2" />
                    {t('results.choosePathButton', language)}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
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
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t, type Language } from '@/lib/i18n';
import type { PurposePath } from '@/types/assessment';

interface PurposePathsProps {
  purposePaths: PurposePath[];
  language: Language;
  /**
   * Callback invoked when the user selects a path to generate an action plan.
   */
  onChoosePath: (pathId: number) => void;
  /**
   * If true, indicates the action plan is being generated, and disables buttons.
   */
  isChoosing: boolean;
}

/**
 * Purpose path color scheme configuration.
 * Maps each path index to its associated colors and styles.
 */
const IKIGAI_PATH_COLORS = [
  { gradient: 'gradient-ikigai-teal', buttonVariant: 'retro-teal' as const },
  { gradient: 'gradient-ikigai-pink', buttonVariant: 'retro-pink' as const },
  { gradient: 'gradient-ikigai-orange', buttonVariant: 'retro-orange' as const },
] as const;

/**
 * Ikigai alignment concepts with associated colors.
 * Used to render the alignment dots with matching colors.
 */
const IKIGAI_CONCEPTS = [
  { key: 'love', colorClass: 'bg-ikigai-teal', label: 'ikigai.love' },
  { key: 'goodAt', colorClass: 'bg-ikigai-yellow', label: 'ikigai.goodAt' },
  { key: 'worldNeeds', colorClass: 'bg-ikigai-pink', label: 'ikigai.worldNeeds' },
  { key: 'pay', colorClass: 'bg-ikigai-orange', label: 'ikigai.pay' },
] as const;

export function PurposePaths({
  purposePaths,
  language,
  onChoosePath,
  isChoosing,
}: PurposePathsProps) {
  const handleChoosePath = (pathId: number) => {
    onChoosePath(pathId);
  };

  return (
    <div className="mb-8">
      <h3 className="text-2xl font-bold text-slate-900 mb-6 text-center">
        {t('results.purposePaths', language)}
      </h3>

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-y-0 lg:grid-rows-[auto_1fr_auto]">
        {purposePaths.map((path, index) => {
          const pathColor = IKIGAI_PATH_COLORS[index] || IKIGAI_PATH_COLORS[0];

          return (
            <div
              key={path.id || index}
              className="retro-card-results overflow-hidden flex flex-col lg:grid lg:grid-rows-subgrid lg:row-span-3 transition-all duration-300"
            >
              <div
                className={`${pathColor.gradient} p-6 text-white`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xl font-bold">{path.title}</h4>
                </div>
                <p className="opacity-90 text-sm">{path.description}</p>
              </div>

              <div className="p-6 flex flex-col justify-between">
                <div className="mb-6">
                  <h5 className="font-semibold text-slate-900 mb-3">
                    {t('ikigai.alignment', language)}
                  </h5>
                  <div className="space-y-2">
                    {IKIGAI_CONCEPTS.map(({ key, colorClass, label }) => (
                      <div key={key} className="flex items-start">
                        <div className={`w-3 h-3 ${colorClass} rounded-full mr-3 flex-shrink-0 mt-1`} />
                        <span className="text-sm text-slate-600">
                          <strong>{t(label as any, language)}:</strong>{' '}
                          {path.ikigaiAlignment[key as keyof typeof path.ikigaiAlignment]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-ikigai-beige rounded-none p-4">
                  <h6 className="font-medium text-slate-900 mb-2">
                    {t('results.actionStrategy', language)}
                  </h6>
                  <p className="text-sm text-slate-600">
                    {path.actionStrategy}
                  </p>
                </div>
              </div>

              <div className="p-6 pt-0">
                {typeof path.id === 'number' && (
                  <Button
                    onClick={() => handleChoosePath(path.id!)}
                    variant={pathColor.buttonVariant}
                    className="w-full mb-3"
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
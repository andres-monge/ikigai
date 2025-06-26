/**
 * @file action-plan.tsx
 *
 * @description
 * Skeleton page for the detailed Action Plan feature (Steps 21-24).  At this
 * stage it only communicates that the feature is coming soon, preventing 404s
 * when users or developers hit /action-plan.
 */

import { ClipboardList } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';

interface ActionPlanProps {
  language: Language;
}

export function ActionPlan({ language }: ActionPlanProps) {
  return (
    <div className="max-w-3xl mx-auto text-center py-16">
      <div className="inline-flex items-center justify-center w-20 h-20 gradient-primary rounded-full mb-6 shadow-lg">
        <ClipboardList className="text-white w-10 h-10" />
      </div>
      <h2 className="text-3xl font-bold text-slate-900 mb-4">
        {t('actionPlan.comingSoonTitle', language)}
      </h2>
      <p className="text-lg text-slate-600">
        {t('actionPlan.comingSoonBody', language)}
      </p>
    </div>
  );
}

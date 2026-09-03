import type { OperationAttempts } from './explore-state';

const operationNames: Record<string, string> = {
  'confirm-why': 'Why',
  'select-purpose-path': 'Purpose Path',
  'confirm-purpose-path-revision': 'Purpose Paths',
  'present-first-project-framing': 'Path Project framing',
  'deliver-first-project-framing': 'Path Project framing',
  'abandon-first-project-framing': 'Path Project framing',
  'accept-first-project': 'Path Project',
};

const statusStyles = {
  Saving: 'border-amber-700 bg-amber-50 text-amber-950',
  Saved: 'border-emerald-700 bg-emerald-50 text-emerald-950',
  Conflict: 'border-orange-800 bg-orange-50 text-orange-950',
  Rejected: 'border-red-800 bg-red-50 text-red-950',
  Failed: 'border-red-800 bg-red-50 text-red-950',
} as const;

export function OperationStatusList({ attempts }: { attempts: OperationAttempts }) {
  const values = Object.values(attempts).slice(-5);
  if (values.length === 0) return null;
  return (
    <div aria-label="Save status" className="space-y-2">
      {values.map((attempt) => (
        <p
          key={`${attempt.turnId}/${attempt.messageId}/${attempt.operationId}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={`border-l-4 px-3 py-2 text-xs font-bold ${statusStyles[attempt.status]}`}
        >
          {operationNames[attempt.operation] ?? 'Your map'}: {attempt.status}
          {attempt.status === 'Conflict' ? ' — refresh and try again.' : null}
          {attempt.status === 'Rejected' ? ' — review the current state.' : null}
          {attempt.status === 'Failed' ? ' — save not confirmed; review the latest map.' : null}
        </p>
      ))}
    </div>
  );
}

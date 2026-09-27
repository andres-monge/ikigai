import { describe, expect, it } from 'vitest';
import { firstRejectedOperationDiagnostic, formatRejectedOperationDiagnostic } from '../../scripts/eval-revelio-rejection-diagnostic.mjs';

describe('Method evaluation rejection diagnostics', () => {
  it('shows the reducer reason and counts without leaking card content', () => {
    const diagnostic = JSON.parse(formatRejectedOperationDiagnostic({
      type: 'revise-purpose-paths',
      status: 'rejected',
      rejectionCode: 'revision-conflict',
      revisionInputShape: {
        sourceMatches: true,
        changedPositions: 2,
        reusedPathRevisionWithChangedContent: true,
        secretCardText: 'PRIVATE CARD TEXT',
      },
      pathSetCountBefore: 1,
      pathSetCountAfter: 1,
      mapRevisionBefore: 4,
      authoritativeRevision: 4,
      sourceIdReused: false,
      secretCardText: 'PRIVATE CARD TEXT',
    }));

    expect(diagnostic.rejectionCode).toBe('revision-conflict');
    expect(diagnostic.pathSetCountBefore).toBe(1);
    expect(diagnostic.pathSetCountAfter).toBe(1);
    expect(diagnostic.revisionInputShape.reusedPathRevisionWithChangedContent).toBe(true);
    expect(JSON.stringify(diagnostic)).not.toContain('PRIVATE CARD TEXT');
  });

  it('finds a rejected operation even when a later model step completes', () => {
    const diagnostic = firstRejectedOperationDiagnostic([
      { type: 'append-foundation-evidence', status: 'committed' },
      { type: 'revise-purpose-paths', status: 'rejected', rejectionCode: 'stale-target', pathSetCountBefore: 1, pathSetCountAfter: 1 },
      { type: 'append-foundation-evidence', status: 'committed' },
    ]);

    expect(JSON.parse(diagnostic).rejectionCode).toBe('stale-target');
    expect(firstRejectedOperationDiagnostic([{ type: 'revise-purpose-paths', status: 'committed' }])).toBeNull();
  });
});

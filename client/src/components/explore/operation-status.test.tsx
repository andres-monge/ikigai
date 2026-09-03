// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { OperationStatusData } from '@shared/streaming-schemas';
import { OperationStatusList } from './operation-status';

afterEach(cleanup);

describe('OperationStatusList', () => {
  it('announces every application-owned status with explicit recovery language', () => {
    const statuses = ['Saving', 'Saved', 'Conflict', 'Rejected', 'Failed'] as const;
    const attempts = Object.fromEntries(statuses.map((status, index) => {
      const value: OperationStatusData = {
        version: 1, turnId: `turn-${index}`, messageId: `message-${index}`, operationId: `operation-${index}`,
        operation: 'confirm-why', status,
        sequence: status === 'Saving' ? 0 : 1,
        authoritativeRevision: status === 'Saving' ? null : index,
      } as OperationStatusData;
      return [`turn-${index}/message-${index}/operation-${index}`, value];
    }));
    render(<OperationStatusList attempts={attempts} />);
    expect(screen.getAllByRole('status')).toHaveLength(5);
    expect(screen.getByText(/Why: Saved/)).toBeTruthy();
    expect(screen.getByText(/Conflict — refresh and try again/)).toBeTruthy();
    expect(screen.getByText(/Rejected — review the current state/)).toBeTruthy();
    expect(screen.getByText(/Failed — save not confirmed; review the latest map/)).toBeTruthy();
  });
});

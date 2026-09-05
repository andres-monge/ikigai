import { describe, expect, it } from 'vitest';
import { careerMapOperationSchemas } from '@shared/career-map';
import { connectedU5DeterministicOperations, interactionOwnership } from './interaction-ownership';

describe('interaction ownership', () => {
  it('owns every canonical operation with only the two Chat Start cases as direct UI actions', () => {
    expect(Object.keys(interactionOwnership).sort()).toEqual(Object.keys(careerMapOperationSchemas).sort());
    expect(Object.entries(interactionOwnership)
      .filter(([, value]) => value.owner === 'deterministic-ui')
      .map(([operation]) => operation)
      .sort()).toEqual([...connectedU5DeterministicOperations].sort());
    expect([...connectedU5DeterministicOperations].sort()).toEqual([
      'confirm-purpose-path-revision',
      'select-purpose-path',
    ]);
    expect(Object.values(interactionOwnership).every((value) => value.reason.length > 0)).toBe(true);
  });
});

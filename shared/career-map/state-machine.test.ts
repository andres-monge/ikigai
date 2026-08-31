import { describe, expect, it } from 'vitest';
import {
  applyCareerMapOperation,
  careerMapSchema,
  createCareerMap,
  deriveMethodCheckpoint,
  isOperationTypeAvailable,
  type CareerMap,
  type CareerMapOperation,
  type PurposePathInput,
} from './index';

const iso = (n: number) => `2026-08-31T12:${String(n % 60).padStart(2, '0')}:00.000Z`;
const present = (n: number) => ({ kind: 'model-presentation' as const, assistantTurnId: `assistant-${n}`, turnSequence: n, completed: true as const, presentedAt: iso(n) });
const act = (n: number) => ({ kind: 'user-message' as const, actionId: `action-${n}`, turnId: `user-${n}`, turnSequence: n, occurredAt: iso(n) });
const pathInputs = (seed: number): [PurposePathInput, PurposePathInput, PurposePathInput] => [0, 1, 2].map((offset) => ({
  id: `path-${seed}-${offset}`, revision: 1, name: `Path ${seed}.${offset}`,
  servesWhy: `Serve the Why with method ${offset}`, possibility: `Possibility ${offset}`,
  evidence: [`Evidence ${offset}`], centralUnknown: `Unknown ${offset}`, projectPreview: `Project ${offset}`, practicalFit: `Practical fit ${offset}`,
})) as [PurposePathInput, PurposePathInput, PurposePathInput];

function make<T extends CareerMapOperation['type']>(map: CareerMap, type: T, payload: Extract<CareerMapOperation, { type: T }>['payload'], source = `${type}-${map.revision + 1}`): Extract<CareerMapOperation, { type: T }> {
  return { type, sourceId: source, expectedRevision: map.revision, occurredAt: iso(map.revision + 1), payload } as Extract<CareerMapOperation, { type: T }>;
}

function committed(map: CareerMap, operation: CareerMapOperation): CareerMap {
  const result = applyCareerMapOperation(map, operation);
  expect(result.status).toBe('committed');
  expect(careerMapSchema.safeParse(result.map).success).toBe(true);
  const checkpoint = deriveMethodCheckpoint(result.map);
  expect(checkpoint.module).toBeTruthy();
  expect(Array.isArray(checkpoint.availableOperations)).toBe(true);
  for (const type of checkpoint.availableOperations) {
    expect(isOperationTypeAvailable(result.map, type)).toBe(true);
  }
  return result.map;
}

describe('model-based Method state machine', () => {
  it('generates legal lifecycle sequences and keeps validation, selector totality, and replay stable', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      let map = createCareerMap(`explorer-${seed}`);
      let sequence = seed * 10;

      const proposal = make(map, 'propose-why', {
        why: { id: `why-${seed}`, revision: 1, statement: `Use complexity to help people act (${seed}).`, serves: 'People making difficult choices', pointOfView: 'Useful insight changes behavior' },
        presentation: present(sequence),
      }, `why-source-${seed}`);
      map = committed(map, proposal);
      const replay = applyCareerMapOperation(map, proposal);
      expect(replay.status).toBe('replayed');
      expect(replay.map).toEqual(map);

      sequence += 1;
      map = committed(map, make(map, 'confirm-why', { whyId: `why-${seed}`, whyRevision: 1, action: act(sequence) }));
      sequence += 1;
      map = committed(map, make(map, 'propose-purpose-paths', { setId: `set-${seed}`, setRevision: 1, paths: pathInputs(seed), presentation: present(sequence) }));
      sequence += 1;
      const selectedIndex = seed % 3;
      map = committed(map, make(map, 'select-purpose-path', { setId: `set-${seed}`, setRevision: 1, pathId: `path-${seed}-${selectedIndex}`, pathRevision: 1, action: act(sequence) }));
      sequence += 1;
      map = committed(map, make(map, 'propose-first-project', { project: { id: `project-${seed}`, revision: 1, title: `Real project ${seed}`, outcome: 'A real person uses the result', audience: 'A firsthand beneficiary', whyWanted: 'The result matters now', learningGoal: 'Learn from doing the work', firstVersion: 'One useful version', firstStep: 'Talk to the beneficiary', decisionQuestion: 'Do I want to keep going?', evidenceCue: 'Notice energy and resistance' }, presentation: present(sequence) }));
      sequence += 1;
      map = committed(map, make(map, 'accept-first-project', { projectId: `project-${seed}`, projectRevision: 1, action: act(sequence) }));
      sequence += 1;
      map = committed(map, make(map, 'update-project-work-status', { projectId: `project-${seed}`, projectRevision: 1, status: seed % 2 === 0 ? 'in-progress' : 'stopped', action: act(sequence) }));
      sequence += 1;
      map = committed(map, make(map, 'open-reflection', { reflectionId: `reflection-${seed}`, revision: 1, projectId: `project-${seed}`, projectRevision: 1, action: act(sequence) }));
      sequence += 1;
      map = committed(map, make(map, 'append-reflection-evidence', { reflectionId: `reflection-${seed}`, reflectionRevision: 1, evidence: { id: `evidence-${seed}`, revision: 1, observation: 'The real work changed what I want to test next.', signal: seed % 2 === 0 ? 'voluntary-pull' : 'resistance', interpretation: 'The next choice should use this firsthand evidence', provenance: act(sequence) } }));
      sequence += 1;
      map = committed(map, make(map, 'close-reflection', { reflectionId: `reflection-${seed}`, reflectionRevision: 1, action: act(sequence) }));
      sequence += 1;
      const wantsToContinue = seed % 3 !== 0;
      map = committed(map, make(map, 'record-continue-choice', { id: `continue-${seed}`, revision: 1, reflectionId: `reflection-${seed}`, reflectionRevision: 1, wantsToContinue, action: act(sequence) }));
      sequence += 1;
      map = committed(map, make(map, 'record-next-move', { id: `move-${seed}`, revision: 1, continueChoiceId: `continue-${seed}`, continueChoiceRevision: 1, kind: wantsToContinue ? 'explore-further' : 'return-to-paths', action: act(sequence) }));

      expect(deriveMethodCheckpoint(map).module).toBe(wantsToContinue ? 'design-path-project' : 'create-purpose-paths');
      expect(map.pathSets.every((set) => set.paths.length === 3)).toBe(true);
      expect(map.pathSets.flatMap((set) => set.paths).filter((path) => path.selection === 'active')).toHaveLength(1);
    }
  });
});

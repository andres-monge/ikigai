import legacyProof from '../../shared/career-map/test-fixtures/legacy-proof-v2.json';
import {
  applyCareerMapOperation,
  readCareerMap,
  type CareerMap,
  type CareerMapOperation,
  type PathProjectInput,
} from '../../shared/career-map/index.js';

/** Test-only history built through public operations, retaining the V2 tail. */
export function repeatingLearningFixture(explorerId: string, revisions = 300) {
  const legacy = {
    ...structuredClone(legacyProof), explorerId,
    operationHistory: legacyProof.operationHistory.map((receipt) => ({
      ...receipt, moduleVersion: 'performance@1',
    })),
  };
  const baseline = readCareerMap(legacy);
  let map: CareerMap = baseline;
  const operations: CareerMapOperation[] = [];
  const at = (sequence: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, sequence)).toISOString();
  const action = () => ({ kind: 'user-message' as const, actionId: `${explorerId}-action-${map.revision + 1}`, turnId: `${explorerId}-turn-${map.revision + 1}`, turnSequence: map.revision + 1, occurredAt: at(map.revision + 1) });
  const presentation = () => ({ kind: 'model-presentation' as const, assistantTurnId: `${explorerId}-turn-${map.revision + 1}`, turnSequence: map.revision + 1, completed: true as const, presentedAt: at(map.revision + 1) });
  function commit<T extends CareerMapOperation['type']>(type: T, payload: Extract<CareerMapOperation, { type: T }>['payload']) {
    if (map.revision >= revisions) return;
    const operation = { type, payload, sourceId: `${explorerId}-${type}-${map.revision + 1}`, expectedRevision: map.revision, occurredAt: at(map.revision + 1) } as CareerMapOperation;
    const result = applyCareerMapOperation(map, operation);
    if (result.status !== 'committed') throw new Error(`Repeating fixture ${operation.sourceId}: ${JSON.stringify(result)}`);
    operations.push(operation);
    map = result.map;
    map.operationHistory.at(-1)!.moduleVersion = 'performance@1';
  }
  commit('record-route-outcome', { id: `${explorerId}-retained-outcome`, revision: 1, doorId: 'door-2', doorRevision: 1, result: 'no-response', learning: 'The explorer reported no response; retain this separately from path evidence.', action: action() });
  for (let cycle = 0; map.revision < revisions; cycle += 1) {
    const key = `${explorerId}-cycle-${cycle}`;
    const projectId = `${key}-project-1`;
    const simple = (number: number): PathProjectInput => ({ id: `${key}-project-${number}`, revision: 1, briefFormat: 'simple-v1', relationship: 'unrelated', title: `Try independent work ${cycle}/${number}`, learningGoal: 'Notice energy and uncertainty while making something unrelated to the selected path.', firstVersion: `One useful sketch ${number}: ${'x'.repeat(512)}`, firstStep: 'Spend twenty minutes trying one real example.' });
    commit('request-new-project', { action: action() });
    commit('propose-follow-on-projects', { setId: `${key}-options`, setRevision: 1, projects: [simple(1), simple(2), simple(3)], presentation: presentation() });
    commit('select-follow-on-project', { setId: `${key}-options`, setRevision: 1, projectId, projectRevision: 1, action: action() });
    commit('update-project-work-status', { projectId, projectRevision: 1, status: 'in-progress', action: action() });
    commit('open-reflection', { reflectionId: `${key}-reflection`, revision: 1, projectId, projectRevision: 1, action: action() });
    commit('append-reflection-evidence', { reflectionId: `${key}-reflection`, reflectionRevision: 1, evidence: { id: `${key}-evidence`, revision: 1, observation: `I voluntarily returned to independent work ${cycle}: ${'x'.repeat(1024)}`, signal: 'voluntary-pull', interpretation: 'Keep testing the work without inventing path alignment.', provenance: action() } });
    commit('close-reflection', { reflectionId: `${key}-reflection`, reflectionRevision: 1, action: action() });
    commit('record-continue-choice', { id: `${key}-choice`, revision: 1, reflectionId: `${key}-reflection`, reflectionRevision: 1, wantsToContinue: true, scope: 'project', action: action() });
    commit('record-path-focus', { id: `${key}-focus`, revision: 1, pathId: 'path-2', pathRevision: 1, action: action() });
    commit('record-next-move', { id: `${key}-move`, revision: 1, continueChoiceId: `${key}-choice`, continueChoiceRevision: 1, kind: 'explore-further', action: action() });
  }
  return { legacy, baseline, map, operations };
}

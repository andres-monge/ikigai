import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { careerMaps, careerMapHistory } from '../shared/schema.js';
import { repeatingLearningFixture } from './test-fixtures/repeating-learning.js';
import { afterAll, describe, expect, it } from 'vitest';
import {
  careerMapSchema,
  type CareerMapOperation,
} from '../shared/career-map/index.js';
import {
  createWorkspaceActionPersistenceContext,
  MethodOwnerBusyError,
  PostgresStorage,
  type AgentTurnRecord,
} from './storage.js';
import {
  cleanupStorageTestDatabases,
  storageTestDatabase,
} from './storage.test-database.js';

export const CAREER_MAP_FALSIFICATION_BOUNDS = {
  serializedBytes: 1_048_576,
  validationP95Ms: 50,
  transactionP95Ms: 250,
  concurrentAttempts: 16,
  concurrentSettleMs: 5_000,
} as const;

const runId = `u4-performance-${process.pid}-${randomUUID()}`;
const storage = new PostgresStorage({ database: storageTestDatabase });
const owners = new Set<string>();
const at = (sequence: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, sequence)).toISOString();
const owner = (suffix: string) => {
  const value = `${runId}-${suffix}`;
  owners.add(value);
  return value;
};

function evidenceOperation(
  expectedRevision: number,
  sourceId: string,
  contentSize = 1_024,
): CareerMapOperation {
  return {
    type: 'append-foundation-evidence',
    sourceId,
    expectedRevision,
    occurredAt: at(expectedRevision + 1),
    payload: {
      evidence: {
        id: `${sourceId}-evidence`,
        revision: 1,
        category: 'firsthand-evidence',
        content: `Observed long-lived explorer evidence ${expectedRevision}: ${'x'.repeat(contentSize)}`,
        provenance: {
          kind: 'user-message',
          actionId: `${sourceId}-action`,
          turnId: `${sourceId}-turn`,
          turnSequence: expectedRevision + 1,
          occurredAt: at(expectedRevision + 1),
        },
      },
    },
  };
}

function boundPerformanceOperation(
  turn: AgentTurnRecord,
  operation: CareerMapOperation,
) {
  const context = createWorkspaceActionPersistenceContext(turn, {
    turnSequence: operation.expectedRevision + 1,
    occurredAt: operation.occurredAt,
  });
  const bind = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(bind);
    const record = value as Record<string, unknown>;
    if (record.kind === 'user-message' || record.kind === 'ui-action') return context.action;
    if (record.kind === 'model-presentation') return context.presentation;
    return Object.fromEntries(Object.entries(record).map(([key, nested]) => [key, bind(nested)]));
  };
  return { context, operation: bind(operation) as CareerMapOperation };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

afterAll(async () => {
  try {
    for (const userId of owners) await storage.eraseMethodData(userId);
  } finally {
    await cleanupStorageTestDatabases();
  }
});

describe('career-map durable-shape falsification bounds', () => {
  it('records serialized size and full-document validation bounds for a long-lived map', () => {
    const fixture = repeatingLearningFixture(`${runId}-fixture`).map;
    expect(fixture.projects.length).toBeGreaterThan(20);
    expect(fixture.reflections.length).toBeGreaterThan(20);
    expect(fixture.pathFocusCommitments.length).toBeGreaterThan(20);
    expect(new Set(fixture.operationHistory.map((receipt) => receipt.operationType)).size).toBeGreaterThan(10);
    expect(fixture.proofRevisions).toHaveLength(1);
    expect(fixture.sideDoorSets).toHaveLength(1);
    expect(fixture.routeOutcomes).toHaveLength(1);
    const serializedBytes = Buffer.byteLength(JSON.stringify(fixture));
    for (let warmup = 0; warmup < 5; warmup += 1) careerMapSchema.parse(fixture);
    const validationSamples: number[] = [];
    for (let sample = 0; sample < 30; sample += 1) {
      const started = performance.now();
      careerMapSchema.parse(fixture);
      validationSamples.push(performance.now() - started);
    }
    const validationP95Ms = percentile(validationSamples, 0.95);
    console.info('U4_PERFORMANCE_SHAPE', JSON.stringify({
      fixtureRevisions: fixture.revision,
      projects: fixture.projects.length,
      reflections: fixture.reflections.length,
      optionSets: fixture.projectOptionSets.length,
      focusCommitments: fixture.pathFocusCommitments.length,
      serializedBytes,
      validationP95Ms,
      bounds: CAREER_MAP_FALSIFICATION_BOUNDS,
    }));
    expect(serializedBytes).toBeLessThanOrEqual(CAREER_MAP_FALSIFICATION_BOUNDS.serializedBytes);
    expect(validationP95Ms).toBeLessThanOrEqual(CAREER_MAP_FALSIFICATION_BOUNDS.validationP95Ms);
  });

  it('records transaction latency and concurrent CAS settlement bounds', async () => {
    const latencyOwner = owner('latency');
    await storage.getOrCreateCareerMap(latencyOwner);
    const hotPathBaseRevision = 280;
    const base = repeatingLearningFixture(latencyOwner, hotPathBaseRevision).map;
    await storageTestDatabase.update(careerMaps).set({
      schemaVersion: base.schemaVersion, revision: base.revision, document: base,
    }).where(eq(careerMaps.userId, latencyOwner));
    await storageTestDatabase.insert(careerMapHistory).values(base.operationHistory.map((receipt, index) => ({
      userId: latencyOwner, operationSourceId: receipt.sourceId, operationType: receipt.operationType,
      payloadFingerprint: receipt.payloadFingerprint, baseRevision: index, resultRevision: receipt.resultRevision,
      result: receipt, confirmationProvenance: receipt.confirmationProvenance,
      moduleVersion: receipt.moduleVersion!, committedAt: new Date(receipt.committedAt),
    })));
    expect((await storage.loadCareerMap(latencyOwner)).status).toBe('ready');
    const tail = repeatingLearningFixture(latencyOwner).operations.filter((operation) => operation.expectedRevision >= hotPathBaseRevision);
    const transactionSamples: number[] = [];
    for (const operation of tail) {
      // Separate durable turns keep proposal/selection and reflection authority real.
      const revision = operation.expectedRevision;
      const startedTurn = await storage.beginWorkspaceActionTurn({
        userId: latencyOwner, clientMessageId: `${runId}-latency-message-${revision}`,
        requestFingerprint: `${runId}-latency-request-${revision}`,
        turnId: `${runId}-latency-turn-${revision}`, leaseId: `${runId}-latency-lease-${revision}`,
      });
      expect(startedTurn.status).toBe('started');
      if (startedTurn.status !== 'started') throw new Error('Performance turn did not start.');
      const bounded = boundPerformanceOperation(startedTurn.turn, operation);
      const started = performance.now();
      const result = await storage.persistCareerMapOperation({
        userId: latencyOwner, leaseId: startedTurn.turn.leaseId, ...bounded, moduleVersion: 'performance@1',
      });
      transactionSamples.push(performance.now() - started);
      expect(result.status, operation.type).toBe('committed');
      expect((await storage.completeAgentTurn({ userId: latencyOwner, turnId: startedTurn.turn.turnId, leaseId: startedTurn.turn.leaseId }))?.status).toBe('completed');
    }
    const raceTurn = await storage.beginWorkspaceActionTurn({
      userId: latencyOwner, clientMessageId: `${runId}-race-message`, requestFingerprint: `${runId}-race-request`,
      turnId: `${runId}-race-turn`, leaseId: `${runId}-race-lease`,
    });
    expect(raceTurn.status).toBe('started');
    if (raceTurn.status !== 'started') throw new Error('Race turn did not start.');
    const transactionP95Ms = percentile(transactionSamples, 0.95);

    const concurrentStarted = performance.now();
    const settlements = await Promise.allSettled(
      Array.from({ length: CAREER_MAP_FALSIFICATION_BOUNDS.concurrentAttempts }, (_, index) =>
        storage.persistCareerMapOperation({
          userId: latencyOwner,
          leaseId: raceTurn.turn.leaseId,
          ...boundPerformanceOperation(
            raceTurn.turn,
            evidenceOperation(300, `${runId}-race-source-${index}`),
          ),
          moduleVersion: 'performance@1',
        })),
    );
    const concurrentSettleMs = performance.now() - concurrentStarted;
    const unexpectedFailure = settlements.find(
      (settlement) => settlement.status === 'rejected'
        && !(settlement.reason instanceof MethodOwnerBusyError),
    );
    if (unexpectedFailure?.status === 'rejected') throw unexpectedFailure.reason;
    const results = settlements.flatMap(
      (settlement) => settlement.status === 'fulfilled' ? [settlement.value] : [],
    );
    const ownerBusy = settlements.filter(
      (settlement) => settlement.status === 'rejected'
        && settlement.reason instanceof MethodOwnerBusyError,
    ).length;
    const committed = results.filter((result) => result.status === 'committed').length;
    const history = await storage.listCareerMapHistory(latencyOwner);
    console.info('U4_PERFORMANCE_DATABASE', JSON.stringify({
      runtime: process.version,
      transactionSamples: transactionSamples.length,
      hotPathBaseRevision,
      operationTypes: [...new Set(tail.map((operation) => operation.type))],
      transactionP95Ms,
      concurrentAttempts: settlements.length,
      ownerBusy,
      concurrentSettleMs,
      committed,
      bounds: CAREER_MAP_FALSIFICATION_BOUNDS,
    }));
    expect(transactionP95Ms).toBeLessThanOrEqual(CAREER_MAP_FALSIFICATION_BOUNDS.transactionP95Ms);
    expect(concurrentSettleMs).toBeLessThanOrEqual(CAREER_MAP_FALSIFICATION_BOUNDS.concurrentSettleMs);
    expect(committed).toBe(1);
    expect(results.length + ownerBusy).toBe(CAREER_MAP_FALSIFICATION_BOUNDS.concurrentAttempts);
    expect(history).toHaveLength(301);
  }, 30_000);
});

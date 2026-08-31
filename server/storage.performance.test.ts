import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  applyCareerMapOperation,
  careerMapSchema,
  createCareerMap,
  type CareerMap,
  type CareerMapOperation,
} from '../shared/career-map/index.js';
import {
  createWorkspaceActionPersistenceContext,
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
  if (operation.type !== 'append-foundation-evidence') throw new Error('Unexpected performance operation.');
  return {
    context,
    operation: {
      ...operation,
      payload: {
        evidence: { ...operation.payload.evidence, provenance: context.action },
      },
    } as CareerMapOperation,
  };
}

function longLivedFixture(revisions = 300): CareerMap {
  let map = createCareerMap(`${runId}-fixture`);
  for (let index = 0; index < revisions; index += 1) {
    const result = applyCareerMapOperation(
      map,
      evidenceOperation(map.revision, `${runId}-fixture-source-${index}`),
    );
    if (result.status !== 'committed') throw new Error(`Fixture failed at revision ${index}: ${result.status}`);
    map = result.map;
  }
  return map;
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
    const fixture = longLivedFixture();
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
    const latencyTurn = {
      userId: latencyOwner,
      clientMessageId: `${runId}-latency-message`,
      requestFingerprint: `${runId}-latency-request`,
      turnId: `${runId}-latency-turn`,
      leaseId: `${runId}-latency-lease`,
    };
    const startedTurn = await storage.beginWorkspaceActionTurn(latencyTurn);
    expect(startedTurn.status).toBe('started');
    if (startedTurn.status !== 'started') throw new Error('Performance turn did not start.');
    const durableLatencyTurn = startedTurn.turn;
    const hotPathBaseRevision = 280;
    for (let revision = 0; revision < hotPathBaseRevision; revision += 1) {
      const bounded = boundPerformanceOperation(
        durableLatencyTurn,
        evidenceOperation(revision, `${runId}-latency-source-${revision}`),
      );
      const result = await storage.persistCareerMapOperation({
        userId: latencyOwner,
        leaseId: latencyTurn.leaseId,
        ...bounded,
        moduleVersion: 'performance@1',
      });
      expect(result.status).toBe('committed');
    }
    const transactionSamples: number[] = [];
    for (let revision = hotPathBaseRevision; revision < 300; revision += 1) {
      const started = performance.now();
      const bounded = boundPerformanceOperation(
        durableLatencyTurn,
        evidenceOperation(revision, `${runId}-latency-source-${revision}`),
      );
      const result = await storage.persistCareerMapOperation({
        userId: latencyOwner,
        leaseId: latencyTurn.leaseId,
        ...bounded,
        moduleVersion: 'performance@1',
      });
      transactionSamples.push(performance.now() - started);
      expect(result.status).toBe('committed');
    }
    const transactionP95Ms = percentile(transactionSamples, 0.95);

    const concurrentStarted = performance.now();
    const results = await Promise.all(
      Array.from({ length: CAREER_MAP_FALSIFICATION_BOUNDS.concurrentAttempts }, (_, index) =>
        storage.persistCareerMapOperation({
          userId: latencyOwner,
          leaseId: latencyTurn.leaseId,
          ...boundPerformanceOperation(
            durableLatencyTurn,
            evidenceOperation(300, `${runId}-race-source-${index}`),
          ),
          moduleVersion: 'performance@1',
        })),
    );
    const concurrentSettleMs = performance.now() - concurrentStarted;
    const committed = results.filter((result) => result.status === 'committed').length;
    const history = await storage.listCareerMapHistory(latencyOwner);
    console.info('U4_PERFORMANCE_DATABASE', JSON.stringify({
      runtime: process.version,
      transactionSamples: transactionSamples.length,
      hotPathBaseRevision,
      transactionP95Ms,
      concurrentAttempts: results.length,
      concurrentSettleMs,
      committed,
      bounds: CAREER_MAP_FALSIFICATION_BOUNDS,
    }));
    expect(transactionP95Ms).toBeLessThanOrEqual(CAREER_MAP_FALSIFICATION_BOUNDS.transactionP95Ms);
    expect(concurrentSettleMs).toBeLessThanOrEqual(CAREER_MAP_FALSIFICATION_BOUNDS.concurrentSettleMs);
    expect(committed).toBe(1);
    expect(history).toHaveLength(301);
  }, 30_000);
});

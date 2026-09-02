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
  evidenceAssociationBytes: 16_384,
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

  it('enforces persisted shape and sourced-write latency bounds for a realistic v2 association', async () => {
    const researchOwner = owner('research-association');
    await storage.getOrCreateCareerMap(researchOwner);
    const startedTurn = await storage.beginWorkspaceActionTurn({
      userId: researchOwner,
      clientMessageId: `${runId}-research-message`,
      requestFingerprint: `${runId}-research-request`,
      turnId: `${runId}-research-turn`,
      leaseId: `${runId}-research-lease`,
    });
    expect(startedTurn.status).toBe('started');
    if (startedTurn.status !== 'started') throw new Error('Research performance turn did not start.');

    const firstContext = createWorkspaceActionPersistenceContext(startedTurn.turn, {
      turnSequence: 1,
      occurredAt: at(1),
    });
    const proposedWhy = await storage.persistCareerMapOperation({
      userId: researchOwner,
      leaseId: startedTurn.turn.leaseId,
      context: firstContext,
      moduleVersion: 'performance-research@1',
      operation: {
        type: 'propose-why',
        sourceId: `${runId}-research-propose-why`,
        expectedRevision: 0,
        occurredAt: at(1),
        payload: {
          why: {
            id: `${runId}-research-why`,
            revision: 1,
            statement: 'Make career experiments easier to trust.',
            serves: 'People choosing their next move',
            pointOfView: 'Small, sourced experiments make uncertainty useful.',
          },
          presentation: firstContext.presentation,
        },
      },
    });
    expect(proposedWhy.status).toBe('committed');

    const secondContext = createWorkspaceActionPersistenceContext(startedTurn.turn, {
      turnSequence: 2,
      occurredAt: at(2),
    });
    const confirmedWhy = await storage.persistCareerMapOperation({
      userId: researchOwner,
      leaseId: startedTurn.turn.leaseId,
      context: secondContext,
      moduleVersion: 'performance-research@1',
      operation: {
        type: 'confirm-why',
        sourceId: `${runId}-research-confirm-why`,
        expectedRevision: 1,
        occurredAt: at(2),
        payload: {
          whyId: `${runId}-research-why`,
          whyRevision: 1,
          action: secondContext.action,
        },
      },
    });
    expect(confirmedWhy.status).toBe('committed');

    const exactClaim = 'A weekend prototype can test demand before a career change.';
    const source = {
      kind: 'cited-research' as const,
      bindingVersion: 2 as const,
      sourceHandle: `${runId}-research-source-handle`,
      providerCallId: `${runId}-research-provider-call`,
      providerResultId: `${runId}-research-provider-result`,
      targetId: `${runId}-research-path-1`,
      targetRevision: 2,
      canonicalField: 'purposePath.practicalFit',
      exactClaim,
      url: 'https://example.com/career-experiment',
      retrievedAt: at(3),
      title: 'Career experiment field guide',
      excerpt: `Practical note: ${exactClaim}`,
      support: 'server-validated' as const,
      citation: {
        start: 16,
        end: 16 + exactClaim.length,
        exactClaimStart: 16,
        exactClaimEnd: 16 + exactClaim.length,
        textHash: 'b'.repeat(64),
      },
    };
    const attempt = await storage.recordResearchAttempt(
      researchOwner,
      startedTurn.turn.leaseId,
      {
        schemaVersion: 2,
        id: `${runId}-research-attempt`,
        status: 'succeeded',
        checkpoint: 'create-purpose-paths',
        moduleVersion: 'performance-research@1',
        targetId: source.targetId,
        targetRevision: 2,
        attemptedAt: at(3),
        sources: [source],
      },
    );
    const thirdContext = createWorkspaceActionPersistenceContext(startedTurn.turn, {
      turnSequence: 3,
      occurredAt: at(3),
    });
    const paths = [1, 2, 3].map((number) => ({
      id: `${runId}-research-path-${number}`,
      revision: 1,
      name: `Research-backed path ${number}`,
      servesWhy: `Serve the confirmed Why through path ${number}`,
      possibility: `Test a practical career possibility ${number}`,
      evidence: [`Relevant experience ${number}`],
      centralUnknown: `Whether demand exists for path ${number}`,
      projectPreview: `Run a small prototype for path ${number}`,
      practicalFit: number === 1 ? exactClaim : `A bounded test is available for path ${number}.`,
      ...(number === 1 ? { sources: [source] } : {}),
    })) as NonNullable<Extract<CareerMapOperation, { type: 'propose-purpose-paths' }>['payload']['paths']>;
    const sourcedWriteStarted = performance.now();
    const proposedPaths = await storage.persistCareerMapOperation({
      userId: researchOwner,
      leaseId: startedTurn.turn.leaseId,
      context: thirdContext,
      moduleVersion: 'performance-research@1',
      operation: {
        type: 'propose-purpose-paths',
        sourceId: `${runId}-research-propose-paths`,
        expectedRevision: 2,
        occurredAt: at(3),
        payload: {
          setId: `${runId}-research-path-set`,
          setRevision: 1,
          paths,
          presentation: thirdContext.presentation,
        },
      },
    });
    const sourcedTransactionMs = performance.now() - sourcedWriteStarted;
    expect(proposedPaths.status).toBe('committed');
    const associations = await storage.listResearchSourceAssociations(researchOwner);
    expect(associations).toHaveLength(1);
    const evidenceAssociationBytes = Buffer.byteLength(JSON.stringify({ attempt, associations }));
    console.info('U4_PERFORMANCE_RESEARCH_ASSOCIATION', JSON.stringify({
      sourceCount: 'sources' in attempt ? attempt.sources.length : 0,
      associationCount: associations.length,
      evidenceAssociationBytes,
      sourcedTransactionMs,
      bounds: CAREER_MAP_FALSIFICATION_BOUNDS,
    }));
    expect(evidenceAssociationBytes).toBeLessThanOrEqual(
      CAREER_MAP_FALSIFICATION_BOUNDS.evidenceAssociationBytes,
    );
    expect(sourcedTransactionMs).toBeLessThanOrEqual(
      CAREER_MAP_FALSIFICATION_BOUNDS.transactionP95Ms,
    );
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
    const settlements = await Promise.allSettled(
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

    const whyId = `${runId}-long-lived-why`;
    const whyContext = createWorkspaceActionPersistenceContext(durableLatencyTurn, {
      turnSequence: 302,
      occurredAt: at(302),
    });
    expect((await storage.persistCareerMapOperation({
      userId: latencyOwner,
      leaseId: latencyTurn.leaseId,
      context: whyContext,
      moduleVersion: 'performance-research@1',
      operation: {
        type: 'propose-why',
        sourceId: `${runId}-long-lived-propose-why`,
        expectedRevision: 301,
        occurredAt: at(302),
        payload: {
          why: {
            id: whyId,
            revision: 1,
            statement: 'Make long-lived career evidence practical to explore.',
            serves: 'People testing a consequential next move',
            pointOfView: 'Small sourced experiments make uncertainty useful.',
          },
          presentation: whyContext.presentation,
        },
      },
    })).status).toBe('committed');

    const confirmContext = createWorkspaceActionPersistenceContext(durableLatencyTurn, {
      turnSequence: 303,
      occurredAt: at(303),
    });
    expect((await storage.persistCareerMapOperation({
      userId: latencyOwner,
      leaseId: latencyTurn.leaseId,
      context: confirmContext,
      moduleVersion: 'performance-research@1',
      operation: {
        type: 'confirm-why',
        sourceId: `${runId}-long-lived-confirm-why`,
        expectedRevision: 302,
        occurredAt: at(303),
        payload: { whyId, whyRevision: 1, action: confirmContext.action },
      },
    })).status).toBe('committed');

    const exactClaim = 'A weekend prototype can test demand before a career change.';
    const source = {
      kind: 'cited-research' as const,
      bindingVersion: 2 as const,
      sourceHandle: `${runId}-long-lived-source-handle`,
      providerCallId: `${runId}-long-lived-provider-call`,
      providerResultId: `${runId}-long-lived-provider-result`,
      targetId: `${runId}-long-lived-path-1`,
      targetRevision: 303,
      canonicalField: 'purposePath.practicalFit',
      exactClaim,
      url: 'https://example.com/long-lived-career-experiment?edition=1',
      retrievedAt: at(304),
      title: 'Long-lived career experiment field guide',
      excerpt: `Practical note: ${exactClaim}`,
      support: 'server-validated' as const,
      citation: {
        start: 16,
        end: 16 + exactClaim.length,
        exactClaimStart: 16,
        exactClaimEnd: 16 + exactClaim.length,
        textHash: 'c'.repeat(64),
      },
    };
    const attempt = await storage.recordResearchAttempt(
      latencyOwner,
      latencyTurn.leaseId,
      {
        schemaVersion: 2,
        id: `${runId}-long-lived-research-attempt`,
        status: 'succeeded',
        checkpoint: 'create-purpose-paths',
        moduleVersion: 'performance-research@1',
        targetId: source.targetId,
        targetRevision: 303,
        attemptedAt: at(304),
        sources: [source],
      },
    );
    const pathContext = createWorkspaceActionPersistenceContext(durableLatencyTurn, {
      turnSequence: 304,
      occurredAt: at(304),
    });
    const paths = [1, 2, 3].map((number) => ({
      id: `${runId}-long-lived-path-${number}`,
      revision: 1,
      name: `Long-lived research path ${number}`,
      servesWhy: `Serve the confirmed Why through path ${number}`,
      possibility: `Test a practical career possibility ${number}`,
      evidence: [`Relevant experience ${number}`],
      centralUnknown: `Whether demand exists for path ${number}`,
      projectPreview: `Run a small prototype for path ${number}`,
      practicalFit: number === 1 ? exactClaim : `A bounded test is available for path ${number}.`,
      ...(number === 1 ? { sources: [source] } : {}),
    })) as NonNullable<Extract<CareerMapOperation, { type: 'propose-purpose-paths' }>['payload']['paths']>;
    const sourcedWriteStarted = performance.now();
    const proposedPaths = await storage.persistCareerMapOperation({
      userId: latencyOwner,
      leaseId: latencyTurn.leaseId,
      context: pathContext,
      moduleVersion: 'performance-research@1',
      operation: {
        type: 'propose-purpose-paths',
        sourceId: `${runId}-long-lived-propose-paths`,
        expectedRevision: 303,
        occurredAt: at(304),
        payload: {
          setId: `${runId}-long-lived-path-set`,
          setRevision: 1,
          paths,
          presentation: pathContext.presentation,
        },
      },
    });
    const sourcedTransactionMs = performance.now() - sourcedWriteStarted;
    expect(proposedPaths.status).toBe('committed');

    const associated = await storage.getOrCreateCareerMap(latencyOwner);
    expect(associated.status).toBe('ready');
    if (associated.status !== 'ready') throw new Error('Long-lived associated map was not ready.');
    const associations = await storage.listResearchSourceAssociations(latencyOwner);
    const finalHistory = await storage.listCareerMapHistory(latencyOwner);
    const associatedMapBytes = Buffer.byteLength(JSON.stringify(associated.map));
    const evidenceAssociationBytes = Buffer.byteLength(JSON.stringify({ attempt, associations }));
    for (let warmup = 0; warmup < 5; warmup += 1) careerMapSchema.parse(associated.map);
    const associatedValidationSamples: number[] = [];
    for (let sample = 0; sample < 30; sample += 1) {
      const started = performance.now();
      careerMapSchema.parse(associated.map);
      associatedValidationSamples.push(performance.now() - started);
    }
    const associatedValidationP95Ms = percentile(associatedValidationSamples, 0.95);
    console.info('U4_PERFORMANCE_LONG_LIVED_ASSOCIATION', JSON.stringify({
      foundationRevisions: 300,
      concurrentResultRevision: 301,
      finalRevision: associated.map.revision,
      historyRows: finalHistory.length,
      sourceCount: 'sources' in attempt ? attempt.sources.length : 0,
      associationCount: associations.length,
      associatedMapBytes,
      evidenceAssociationBytes,
      sourcedTransactionMs,
      associatedValidationP95Ms,
      bounds: CAREER_MAP_FALSIFICATION_BOUNDS,
    }));
    expect(associated.map.revision).toBe(304);
    expect(finalHistory).toHaveLength(304);
    expect(associations).toHaveLength(1);
    expect(associatedMapBytes).toBeLessThanOrEqual(CAREER_MAP_FALSIFICATION_BOUNDS.serializedBytes);
    expect(evidenceAssociationBytes).toBeLessThanOrEqual(
      CAREER_MAP_FALSIFICATION_BOUNDS.evidenceAssociationBytes,
    );
    expect(sourcedTransactionMs).toBeLessThanOrEqual(
      CAREER_MAP_FALSIFICATION_BOUNDS.transactionP95Ms,
    );
    expect(associatedValidationP95Ms).toBeLessThanOrEqual(
      CAREER_MAP_FALSIFICATION_BOUNDS.validationP95Ms,
    );
  }, 30_000);
});

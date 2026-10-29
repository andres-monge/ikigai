import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  cleanupStorageTestDatabases,
  storageTestConnectionString,
  storageTestDatabase as db,
  storageTestPool,
} from './storage.test-database.js';
import {
  ConversationMappingConflictError,
  CareerMapRepairRequiredError,
  DEFAULT_TURN_LEASE_MS,
  createAgentTurnPersistenceContext,
  createWorkspaceActionPersistenceContext,
  MethodErasurePendingError,
  PostgresStorage,
  TurnLeaseIdentityConflictError,
  TurnLeaseLostError,
  type AgentTurnRecord,
  type StorageFaultStage,
} from './storage.js';
import {
  agentConversationMappings,
  agentTurnLeases,
  agentTurns,
  careerMapDrafts,
  careerMapHistory,
  careerMaps,
  methodErasureJobs,
} from '../shared/schema.js';
import {
  type CareerMapOperation,
  type PathProjectInput,
  type PurposePathInput,
  type SideDoorInput,
} from '../shared/career-map/index.js';
import legacyProof from '../shared/career-map/test-fixtures/legacy-proof-v2.json';
import { readCareerMap } from '../shared/career-map/model';
import { createCareerMap as createV2Map } from '../shared/career-map/legacy-v2/model';
import { ConversationHistoryProviderError } from './ai/history.js';
import { repeatingLearningFixture } from './test-fixtures/repeating-learning.js';
import {
  createMethodResetDependencies,
  databaseIdentity,
  runMethodReset,
} from '../scripts/reset-method-data.js';

const runId = `u4-${process.pid}-${randomUUID()}`;
const owners = new Set<string>();
let now = new Date('2030-01-01T00:00:00.000Z');
const storage = new PostgresStorage({ database: db, now: () => now });
const id = (value: string) => `${runId}-${value}`;
const owner = (value: string) => {
  const userId = id(`owner-${value}`);
  owners.add(userId);
  return userId;
};
const at = (offset = 0) => new Date(now.getTime() + offset).toISOString();
const framingText = "The point of a project is not to succeed, it's to learn if it's something you'd want to pursue. Think of projects like dating: you start with something chill and low commitment, then invest more only if each date makes you want another.";
const acceptancePhrase = 'I explicitly accept this Path Project.';
const acceptanceQuestion = `Will you explicitly accept this Path Project by replying “${acceptancePhrase}”?`;

function action(sequence: number) {
  return {
    kind: 'user-message' as const,
    actionId: id(`action-${sequence}`),
    turnId: id(`user-turn-${sequence}`),
    turnSequence: sequence,
    occurredAt: at(sequence),
  };
}

function presentation(sequence: number) {
  return {
    kind: 'model-presentation' as const,
    assistantTurnId: id(`assistant-turn-${sequence}`),
    turnSequence: sequence,
    completed: true as const,
    presentedAt: at(sequence),
  };
}

function evidenceOperation(
  expectedRevision: number,
  sourceId: string,
  content = 'I voluntarily keep returning to systems problems.',
): CareerMapOperation {
  return {
    type: 'append-foundation-evidence',
    sourceId,
    expectedRevision,
    occurredAt: at(expectedRevision + 1),
    payload: {
      evidence: {
        id: id(`evidence-${sourceId}`),
        revision: 1,
        category: 'fascination',
        content,
        provenance: action(expectedRevision + 1),
      },
    },
  };
}

function paths(): [PurposePathInput, PurposePathInput, PurposePathInput] {
  return [1, 2, 3].map((number) => ({
    id: id(`path-${number}`),
    revision: 1,
    name: `Path ${number}`,
    servesWhy: `Serve the confirmed Why through approach ${number}`,
    possibility: `A useful possibility ${number}`,
    evidence: [`Evidence ${number}`],
    centralUnknown: `Unknown ${number}`,
    projectPreview: `Project preview ${number}`,
    practicalFit: `Can start beside current work ${number}`,
  })) as [PurposePathInput, PurposePathInput, PurposePathInput];
}

function researchablePaths(): [PurposePathInput, PurposePathInput, PurposePathInput] {
  return paths().map((path, index) => ({
    ...path,
    name: [
      'Public-interest decision tools',
      'Community research practice',
      'Learning and facilitation practice',
    ][index]!,
    possibility: [
      'Design decision-support tools for public-interest teams',
      'Research public community decision patterns',
      'Facilitate practical learning for community teams',
    ][index]!,
    projectPreview: [
      'Prototype a small public decision guide',
      'Publish a bounded public research note',
      'Run a small public learning workshop',
    ][index]!,
  })) as [PurposePathInput, PurposePathInput, PurposePathInput];
}

function project(projectId: string): PathProjectInput {
  return {
    id: projectId,
    revision: 1,
    title: `Project ${projectId}`,
    outcome: 'A colleague can use a real decision aid.',
    audience: 'A colleague with a live decision',
    whyWanted: 'Reduce avoidable decision friction',
    learningGoal: 'Learn whether product iteration creates voluntary pull',
    firstVersion: 'A one-page interactive prototype',
    firstStep: 'Interview one colleague about a live decision',
    decisionQuestion: 'Do I want to keep improving tools like this?',
    evidenceCue: 'Notice energy or resistance during iteration',
  };
}

function sideDoors(): [SideDoorInput, SideDoorInput, SideDoorInput] {
  return [1, 2, 3].map((number) => ({
    id: id(`door-${number}`),
    revision: 1,
    name: `Door ${number}`,
    target: `Relevant community ${number}`,
    proofValue: `Proof value ${number}`,
    contribution: `Contribution ${number}`,
    firstMove: `First move ${number}`,
    accessConstraints: [`Constraint ${number}`],
  })) as [SideDoorInput, SideDoorInput, SideDoorInput];
}

async function beginTurn(
  userId: string,
  suffix = 'one',
  origin: 'agent-turn' | 'workspace-action' = 'workspace-action',
) {
  await storage.getOrCreateCareerMap(userId);
  const input = {
    userId,
    clientMessageId: id(`message-${suffix}`),
    requestFingerprint: id(`request-${suffix}`),
    turnId: id(`turn-${suffix}`),
    leaseId: id(`lease-${suffix}`),
  };
  const result = origin === 'agent-turn'
    ? await storage.beginAgentTurn(input)
    : await storage.beginWorkspaceActionTurn(input);
  expect(result.status).toBe('started');
  if (result.status !== 'started') throw new Error('Test fixture turn did not start.');
  return result.turn;
}

async function persist(userId: string, leaseId: string, operation: CareerMapOperation) {
  return storage.persistCareerMapOperation(await boundPersistenceInput({
    userId,
    leaseId,
    operation,
    moduleVersion: 'method-test@1',
  }));
}

async function persistCompletedSequence(
  userId: string,
  suffix: string,
  operations: CareerMapOperation[],
): Promise<AgentTurnRecord[]> {
  const turns: AgentTurnRecord[] = [];
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]!;
    const turn = await beginTurn(userId, `${suffix}-${index + 1}`, 'agent-turn');
    const result = await persist(userId, turn.leaseId, operation);
    expect(result.status, `${operation.type} fixture failed`).toBe('committed');

    const delivery = operations[index + 1];
    const framingDelivery = operation.type === 'present-first-project-framing'
      && delivery?.type === 'deliver-first-project-framing'
      ? delivery
      : undefined;
    const completed = await storage.completeAgentTurn({
      userId,
      turnId: turn.turnId,
      leaseId: turn.leaseId,
      ...(framingDelivery ? { assistantText: framingDelivery.payload.assistantText } : {}),
    });
    expect(completed?.status, `${operation.type} turn completion failed`).toBe('completed');
    if (!completed || completed.status !== 'completed') {
      throw new Error(`${operation.type} fixture turn did not complete.`);
    }
    if (framingDelivery) {
      expect(completed.terminalResult, 'framing delivery did not commit').toMatchObject({
        operationCommitted: true,
        revision: framingDelivery.expectedRevision + 1,
      });
    }
    turns.push(completed);
    if (framingDelivery) index += 1;
  }
  return turns;
}

async function seedPendingFirstProject(userId: string, suffix: string) {
  const projectId = id(`${suffix}-project`);
  const operations: CareerMapOperation[] = [
    { type: 'propose-why', sourceId: id(`${suffix}-why-propose`), expectedRevision: 0, occurredAt: at(1), payload: { why: { id: id(`${suffix}-why`), revision: 1, statement: 'Make useful decisions easier.', serves: 'People facing complex choices', pointOfView: 'Actionable clarity creates agency.' }, presentation: presentation(1) } },
    { type: 'confirm-why', sourceId: id(`${suffix}-why-confirm`), expectedRevision: 1, occurredAt: at(2), payload: { whyId: id(`${suffix}-why`), whyRevision: 1, action: action(2) } },
    { type: 'propose-purpose-paths', sourceId: id(`${suffix}-paths`), expectedRevision: 2, occurredAt: at(3), payload: { setId: id(`${suffix}-path-set`), setRevision: 1, paths: paths(), presentation: presentation(3) } },
    { type: 'select-purpose-path', sourceId: id(`${suffix}-path-select`), expectedRevision: 3, occurredAt: at(4), payload: { setId: id(`${suffix}-path-set`), setRevision: 1, pathId: id('path-1'), pathRevision: 1, action: action(4) } },
    { type: 'propose-first-project', sourceId: id(`${suffix}-project-propose`), expectedRevision: 4, occurredAt: at(5), payload: { project: project(projectId), presentation: presentation(5) } },
  ];
  await persistCompletedSequence(userId, `${suffix}-setup`, operations);
  return projectId;
}

async function persistPendingFraming(
  userId: string,
  turn: AgentTurnRecord,
  projectId: string,
  suffix: string,
) {
  const context = createAgentTurnPersistenceContext(turn, { turnSequence: 6, occurredAt: at(6) });
  const result = await storage.persistCareerMapOperation({
    userId,
    leaseId: turn.leaseId,
    context,
    operation: {
      type: 'present-first-project-framing',
      sourceId: id(`${suffix}-framing`),
      expectedRevision: 5,
      occurredAt: at(6),
      payload: {
        projectId,
        projectRevision: 1,
        locale: 'en',
        framingText,
        acceptancePhrase,
        acceptanceQuestion,
        moduleVersion: '1.1.1',
        presentation: context.presentation,
      },
    },
    moduleVersion: '1.1.1',
  });
  expect(result.status).toBe('committed');
}

function provenanceTiming(operation: CareerMapOperation) {
  const candidates: Array<{ turnSequence: number; occurredAt: string }> = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    if ((record.kind === 'user-message' || record.kind === 'ui-action')
      && typeof record.turnSequence === 'number' && typeof record.occurredAt === 'string') {
      candidates.push({ turnSequence: record.turnSequence, occurredAt: record.occurredAt });
    }
    if (record.kind === 'model-presentation'
      && typeof record.turnSequence === 'number' && typeof record.presentedAt === 'string') {
      candidates.push({ turnSequence: record.turnSequence, occurredAt: record.presentedAt });
    }
    Object.values(record).forEach(visit);
  };
  visit(operation.payload);
  return candidates.sort((left, right) => right.turnSequence - left.turnSequence)[0]
    ?? { turnSequence: operation.expectedRevision + 1, occurredAt: operation.occurredAt };
}

function bindOperationProvenance(
  value: unknown,
  context: ReturnType<typeof createWorkspaceActionPersistenceContext>,
): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => bindOperationProvenance(item, context));
  const record = value as Record<string, unknown>;
  if (record.kind === 'user-message' || record.kind === 'ui-action') return context.action;
  if (record.kind === 'model-presentation') return context.presentation;
  return Object.fromEntries(
    Object.entries(record).map(([key, nested]) => [key, bindOperationProvenance(nested, context)]),
  );
}

async function boundPersistenceInput(input: {
  userId: string;
  leaseId: string;
  operation: CareerMapOperation;
  moduleVersion: string;
}) {
  const [turn] = await db.select().from(agentTurns).where(and(
    eq(agentTurns.userId, input.userId),
    eq(agentTurns.leaseId, input.leaseId),
  ));
  if (!turn) throw new Error('Test fixture is missing its durable turn.');
  const context = turn.origin === 'agent-turn'
    ? createAgentTurnPersistenceContext(turn, provenanceTiming(input.operation))
    : createWorkspaceActionPersistenceContext(turn, provenanceTiming(input.operation));
  return {
    ...input,
    context,
    operation: bindOperationProvenance(input.operation, context) as CareerMapOperation,
  };
}

async function eraseOwner(userId: string) {
  await storage.eraseMethodData(userId, {
    deleteConversationItemsAndConversation: async () => undefined,
  });
}

beforeEach(() => {
  now = new Date('2030-01-01T00:00:00.000Z');
});
afterAll(async () => {
  try {
    for (const userId of owners) await eraseOwner(userId);
  } finally {
    await cleanupStorageTestDatabases();
  }
});

describe('PostgresStorage Method map, history, and ownership', () => {
  it('creates and loads one validated career map for its owner', async () => {
    const userId = owner('create');
    const created = await storage.getOrCreateCareerMap(userId);
    const loaded = await storage.loadCareerMap(userId);
    expect(created.status).toBe('ready');
    expect(loaded).toEqual(created);
    if (loaded.status === 'ready') {
      expect(loaded.map.explorerId).toBe(userId);
      expect(loaded.map.schemaVersion).toBe(3);
      expect(loaded.map.revision).toBe(0);
    }
    const missingOwner = owner('other');
    expect(await storage.loadCareerMap(missingOwner)).toEqual({ status: 'not-found' });
    expect((await storage.beginAgentTurn({
      userId: missingOwner,
      clientMessageId: id('missing-map-message'),
      requestFingerprint: id('missing-map-request'),
      turnId: id('missing-map-turn'),
      leaseId: id('missing-map-lease'),
    })).status).toBe('map-required');
  });

  it('loads V2 without writing a migration, then persists the next mutation as V3', async () => {
    const userId = owner('legacy-v2');
    await storage.getOrCreateCareerMap(userId);
    const legacy = createV2Map(userId);
    await db.update(careerMaps).set({ schemaVersion: 2, document: legacy as never }).where(eq(careerMaps.userId, userId));
    const before = (await db.select().from(careerMaps).where(eq(careerMaps.userId, userId)))[0];
    expect(await storage.loadCareerMap(userId)).toMatchObject({ status: 'ready', map: { schemaVersion: 3, revision: 0, pathFocusCommitments: [] } });
    expect((await db.select().from(careerMaps).where(eq(careerMaps.userId, userId)))[0]).toEqual(before);
    const turn = await beginTurn(userId, 'legacy-v2');
    const result = await persist(userId, turn.leaseId, evidenceOperation(0, id('legacy-v2-source')));
    expect(result.status).toBe('committed');
    const persisted = (await db.select().from(careerMaps).where(eq(careerMaps.userId, userId)))[0];
    expect(persisted.schemaVersion).toBe(3);
    expect(persisted.revision).toBe(1);
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(1);
  });

  it('commits map CAS and matching append-only history atomically', async () => {
    const userId = owner('cas');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'cas');
    const [left, right] = await Promise.all([
      persist(userId, turn.leaseId, evidenceOperation(0, id('source-cas-left'))),
      persist(userId, turn.leaseId, evidenceOperation(0, id('source-cas-right'))),
    ]);
    expect([left.status, right.status].sort()).toEqual(['committed', 'rejected']);
    const rejected = left.status === 'rejected' ? left : right;
    if (rejected.status === 'rejected') expect(rejected.error.code).toBe('revision-conflict');
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') expect(loaded.map.revision).toBe(1);
    const history = await storage.listCareerMapHistory(userId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ baseRevision: 0, resultRevision: 1, moduleVersion: 'method-test@1' });
  });

  it('returns exact-once replay and rejects a different payload for the same source identity', async () => {
    const userId = owner('replay');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'replay');
    const operation = evidenceOperation(0, id('source-replay'));
    expect((await persist(userId, turn.leaseId, operation)).status).toBe('committed');
    expect((await persist(userId, turn.leaseId, operation)).status).toBe('replayed');
    expect((await persist(userId, turn.leaseId, {
      ...operation,
      expectedRevision: 999,
      occurredAt: at(99),
    })).status).toBe('replayed');
    const collision = await persist(userId, turn.leaseId, evidenceOperation(0, id('source-replay'), 'A materially different payload.'));
    expect(collision.status).toBe('rejected');
    if (collision.status === 'rejected') expect(collision.error.code).toBe('source-id-reused');
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(1);
  });

  it('observes request cancellation without acquiring the owner advisory lock', async () => {
    const userId = owner('abort-lock-wait');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'abort-lock-wait');
    let reachedFence!: () => void;
    let releaseFence!: () => void;
    const fenceReached = new Promise<void>((resolve) => { reachedFence = resolve; });
    const fenceRelease = new Promise<void>((resolve) => { releaseFence = resolve; });
    const blockingAbort = new AbortController();
    const blockingStorage = new PostgresStorage({
      database: db,
      now: () => now,
      faultInjector: async (stage) => {
        if (stage === 'before-map-update') {
          reachedFence();
          await fenceRelease;
        }
      },
    });
    const blockingInput = await boundPersistenceInput({
      userId,
      leaseId: turn.leaseId,
      operation: evidenceOperation(0, id('abort-lock-blocking-operation')),
      moduleVersion: 'method-test@1',
    });
    const blockingWrite = blockingStorage.persistCareerMapOperation({
      ...blockingInput,
      abortSignal: blockingAbort.signal,
    });
    await fenceReached;

    const waitingAbort = new AbortController();
    const waitingInput = await boundPersistenceInput({
      userId,
      leaseId: turn.leaseId,
      operation: evidenceOperation(0, id('abort-lock-waiting-operation')),
      moduleVersion: 'method-test@1',
    });
    const waitingWrite = storage.persistCareerMapOperation({
      ...waitingInput,
      abortSignal: waitingAbort.signal,
    });
    waitingAbort.abort();
    await expect(waitingWrite).rejects.toMatchObject({ name: 'AbortError' });

    blockingAbort.abort();
    releaseFence();
    await expect(blockingWrite).rejects.toMatchObject({ name: 'AbortError' });
    expect(await storage.listCareerMapHistory(userId)).toEqual([]);
    expect(await storage.loadCareerMap(userId)).toMatchObject({ status: 'ready', map: { revision: 0 } });
  });

  it('rolls back an operation when the current lease expires at the final commit fence', async () => {
    const userId = owner('final-lease-fence');
    let fenceNow = new Date(now);
    const fenceStorage = new PostgresStorage({
      database: db,
      now: () => fenceNow,
      faultInjector: (stage) => {
        if (stage === 'before-commit') fenceNow = new Date(fenceNow.getTime() + 400_000);
      },
    });
    await fenceStorage.getOrCreateCareerMap(userId);
    const started = await fenceStorage.beginWorkspaceActionTurn({
      userId,
      clientMessageId: id('final-fence-message'),
      requestFingerprint: id('final-fence-request'),
      turnId: id('final-fence-turn'),
      leaseId: id('final-fence-lease'),
    });
    expect(started.status).toBe('started');
    if (started.status !== 'started') throw new Error('Final-fence turn did not start.');
    const operation = evidenceOperation(0, id('final-fence-operation'));
    const context = createWorkspaceActionPersistenceContext(started.turn, provenanceTiming(operation));
    if (operation.type !== 'append-foundation-evidence') throw new Error('Unexpected final-fence operation.');
    operation.payload.evidence.provenance = context.action;
    expect(await fenceStorage.persistCareerMapOperation({
      userId,
      leaseId: started.turn.leaseId,
      context,
      operation,
      moduleVersion: 'method-test@1',
    })).toMatchObject({ status: 'lease-lost' });
    expect(await storage.listCareerMapHistory(userId)).toEqual([]);
    expect(await storage.loadCareerMap(userId)).toMatchObject({ status: 'ready', map: { revision: 0 } });
  });

  it('binds action and presentation provenance to the active durable turn', async () => {
    const userId = owner('durable-provenance-boundary');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'durable-provenance-boundary', 'agent-turn');
    const firstContext = createAgentTurnPersistenceContext(turn, {
      turnSequence: 1,
      occurredAt: at(1),
    });
    const firstOperation = evidenceOperation(0, id('durable-provenance-first'));
    if (firstOperation.type !== 'append-foundation-evidence') throw new Error('Unexpected fixture operation.');
    firstOperation.payload.evidence.provenance = firstContext.action;
    expect((await storage.persistCareerMapOperation({
      userId, leaseId: turn.leaseId, context: firstContext,
      operation: firstOperation, moduleVersion: 'method-test@1',
    })).status).toBe('committed');

    const currentContext = createAgentTurnPersistenceContext(turn, {
      turnSequence: 2,
      occurredAt: at(2),
    });
    for (const [suffix, provenance] of [
      ['kind', { ...currentContext.action, kind: 'ui-action' }],
      ['turn', { ...currentContext.action, turnId: id('forged-turn') }],
      ['action', { ...currentContext.action, actionId: id('forged-action') }],
    ] as const) {
      const forged = evidenceOperation(1, id(`durable-provenance-forged-${suffix}`));
      if (forged.type !== 'append-foundation-evidence') throw new Error('Unexpected fixture operation.');
      forged.payload.evidence.provenance = provenance;
      const rejected = await storage.persistCareerMapOperation({
        userId, leaseId: turn.leaseId, context: currentContext,
        operation: forged, moduleVersion: 'method-test@1',
      });
      expect(rejected.status).toBe('rejected');
      if (rejected.status === 'rejected') expect(rejected.error.code).toBe('invalid-operation');
    }

    const proposal: CareerMapOperation = {
      type: 'propose-why', sourceId: id('durable-provenance-why'), expectedRevision: 1, occurredAt: at(2),
      payload: {
        why: {
          id: id('durable-provenance-why-record'), revision: 1,
          statement: 'Help people learn through action.', serves: 'Career explorers',
          pointOfView: 'Firsthand evidence creates agency.',
        },
        presentation: currentContext.presentation,
      },
    };
    expect((await storage.persistCareerMapOperation({
      userId, leaseId: turn.leaseId, context: currentContext,
      operation: proposal, moduleVersion: 'method-test@1',
    })).status).toBe('committed');

    const confirmationContext = createAgentTurnPersistenceContext(turn, {
      turnSequence: 3,
      occurredAt: at(3),
    });
    const sameTurnConfirmation: CareerMapOperation = {
      type: 'confirm-why', sourceId: id('durable-provenance-same-turn-confirm'),
      expectedRevision: 2, occurredAt: at(3),
      payload: {
        whyId: id('durable-provenance-why-record'), whyRevision: 1,
        action: confirmationContext.action,
      },
    };
    const sameTurn = await storage.persistCareerMapOperation({
      userId, leaseId: turn.leaseId, context: confirmationContext,
      operation: sameTurnConfirmation, moduleVersion: 'method-test@1',
    });
    expect(sameTurn.status).toBe('rejected');
    if (sameTurn.status === 'rejected') expect(sameTurn.error.code).toBe('confirmation-not-auditable');

    const forgedUi = structuredClone(sameTurnConfirmation);
    if (forgedUi.type !== 'confirm-why') throw new Error('Unexpected fixture operation.');
    forgedUi.sourceId = id('durable-provenance-forged-ui');
    forgedUi.payload.action.kind = 'ui-action';
    const forgedUiResult = await storage.persistCareerMapOperation({
      userId, leaseId: turn.leaseId, context: confirmationContext,
      operation: forgedUi, moduleVersion: 'method-test@1',
    });
    expect(forgedUiResult.status).toBe('rejected');
    if (forgedUiResult.status === 'rejected') expect(forgedUiResult.error.code).toBe('invalid-operation');

    const relabeledContext = {
      ...confirmationContext,
      origin: 'workspace-action' as const,
      action: { ...confirmationContext.action, kind: 'ui-action' as const },
    };
    const relabeledOperation = structuredClone(sameTurnConfirmation);
    if (relabeledOperation.type !== 'confirm-why') throw new Error('Unexpected fixture operation.');
    relabeledOperation.sourceId = id('durable-provenance-relabeled-workspace');
    relabeledOperation.payload.action = relabeledContext.action;
    const relabeledResult = await storage.persistCareerMapOperation({
      userId, leaseId: turn.leaseId, context: relabeledContext,
      operation: relabeledOperation, moduleVersion: 'method-test@1',
    });
    expect(relabeledResult.status).toBe('rejected');
    if (relabeledResult.status === 'rejected') expect(relabeledResult.error.code).toBe('invalid-operation');

    expect(() => createWorkspaceActionPersistenceContext(turn, {
      turnSequence: 3,
      occurredAt: at(3),
    })).toThrow(/durable agent-turn turn/);
    await storage.completeAgentTurn({
      userId, turnId: turn.turnId, leaseId: turn.leaseId,
    });
    const workspaceTurn = await beginTurn(
      userId,
      'durable-provenance-workspace-confirm',
      'workspace-action',
    );
    const workspaceContext = createWorkspaceActionPersistenceContext(workspaceTurn, {
      turnSequence: 3,
      occurredAt: at(3),
    });
    const workspaceConfirmation = structuredClone(sameTurnConfirmation);
    if (workspaceConfirmation.type !== 'confirm-why') throw new Error('Unexpected fixture operation.');
    workspaceConfirmation.sourceId = id('durable-provenance-workspace-confirm');
    workspaceConfirmation.payload.action = workspaceContext.action;
    expect((await storage.persistCareerMapOperation({
      userId, leaseId: workspaceTurn.leaseId, context: workspaceContext,
      operation: workspaceConfirmation, moduleVersion: 'method-test@1',
    })).status).toBe('committed');
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(3);
  });

  it('accepts conversational confirmation only from a later turn after completed presentation', async () => {
    for (const [terminal, expectedStatus] of [
      ['completed', 'committed'],
      ['cancelled', 'rejected'],
    ] as const) {
      const userId = owner(`presentation-terminal-${terminal}`);
      await storage.getOrCreateCareerMap(userId);
      const presentationTurn = await beginTurn(
        userId,
        `presentation-terminal-${terminal}-first`,
        'agent-turn',
      );
      const presentationContext = createAgentTurnPersistenceContext(presentationTurn, {
        turnSequence: 1,
        occurredAt: at(1),
      });
      expect((await storage.persistCareerMapOperation({
        userId, leaseId: presentationTurn.leaseId, context: presentationContext,
        operation: {
          type: 'propose-why', sourceId: id(`presentation-terminal-${terminal}-propose`),
          expectedRevision: 0, occurredAt: at(1),
          payload: {
            why: {
              id: id(`presentation-terminal-${terminal}-why`), revision: 1,
              statement: 'Make action a source of useful evidence.', serves: 'Career explorers',
              pointOfView: 'Completed reflection should guide the next choice.',
            },
            presentation: presentationContext.presentation,
          },
        },
        moduleVersion: 'method-test@1',
      })).status).toBe('committed');
      if (terminal === 'completed') {
        await storage.completeAgentTurn({
          userId, turnId: presentationTurn.turnId, leaseId: presentationTurn.leaseId,
        });
      } else {
        await storage.cancelAgentTurn({
          userId, turnId: presentationTurn.turnId, leaseId: presentationTurn.leaseId,
        });
      }

      const confirmationTurn = await beginTurn(
        userId,
        `presentation-terminal-${terminal}-second`,
        'agent-turn',
      );
      const confirmationContext = createAgentTurnPersistenceContext(confirmationTurn, {
        turnSequence: 2,
        occurredAt: at(2),
      });
      const result = await storage.persistCareerMapOperation({
        userId, leaseId: confirmationTurn.leaseId, context: confirmationContext,
        operation: {
          type: 'confirm-why', sourceId: id(`presentation-terminal-${terminal}-confirm`),
          expectedRevision: 1, occurredAt: at(2),
          payload: {
            whyId: id(`presentation-terminal-${terminal}-why`), whyRevision: 1,
            action: confirmationContext.action,
          },
        },
        moduleVersion: 'method-test@1',
      });
      expect(result.status).toBe(expectedStatus);
      if (result.status === 'rejected') expect(result.error.code).toBe('confirmation-not-auditable');
    }
  });

  it.each<StorageFaultStage>(['before-map-update', 'after-map-update-before-history', 'before-commit'])
  ('rolls back map and history when fault injection fires at %s', async (stage) => {
    const userId = owner(`fault-${stage}`);
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, `fault-${stage}`);
    const faulting = new PostgresStorage({
      database: db,
      now: () => now,
      faultInjector: (current) => {
        if (current === stage) throw new Error(`fault:${stage}`);
      },
    });
    await expect(faulting.persistCareerMapOperation(await boundPersistenceInput({
      userId,
      leaseId: turn.leaseId,
      operation: evidenceOperation(0, id(`source-${stage}`)),
      moduleVersion: 'method-test@1',
    }))).rejects.toThrow(`fault:${stage}`);
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') expect(loaded.map.revision).toBe(0);
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(0);
  });

  it('persists downstream invalidation and sibling selection as one validated document', async () => {
    const userId = owner('lineage');
    await storage.getOrCreateCareerMap(userId);
    const operations: CareerMapOperation[] = [
      { type: 'propose-why', sourceId: id('l-why-1'), expectedRevision: 0, occurredAt: at(1), payload: { why: { id: id('l-why'), revision: 1, statement: 'Serve useful learning.', serves: 'Career explorers', pointOfView: 'Action creates knowledge.' }, presentation: presentation(1) } },
      { type: 'confirm-why', sourceId: id('l-why-2'), expectedRevision: 1, occurredAt: at(2), payload: { whyId: id('l-why'), whyRevision: 1, action: action(2) } },
      { type: 'propose-purpose-paths', sourceId: id('l-paths-1'), expectedRevision: 2, occurredAt: at(3), payload: { setId: id('l-set'), setRevision: 1, paths: paths(), presentation: presentation(3) } },
      { type: 'select-purpose-path', sourceId: id('l-paths-2'), expectedRevision: 3, occurredAt: at(4), payload: { setId: id('l-set'), setRevision: 1, pathId: id('path-1'), pathRevision: 1, action: action(4) } },
      { type: 'revise-why', sourceId: id('l-why-3'), expectedRevision: 4, occurredAt: at(5), payload: { why: { id: id('l-why-2'), revision: 1, statement: 'Serve useful action.', serves: 'Career explorers', pointOfView: 'Evidence should create agency.' }, supersedesWhyId: id('l-why'), presentation: presentation(5) } },
      { type: 'confirm-why', sourceId: id('l-why-4'), expectedRevision: 5, occurredAt: at(6), payload: { whyId: id('l-why-2'), whyRevision: 1, action: action(6) } },
    ];
    await persistCompletedSequence(userId, 'lineage', operations);
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') {
      expect(loaded.map.pathSets[0].paths.map((path) => path.selection)).toEqual(['active', 'parked', 'parked']);
      expect(loaded.map.invalidations.some((item) => item.status === 'pending' && item.targetKind === 'path-set')).toBe(true);
    }
  });

  it('persists project-proposal replacement as one revision and one history result', async () => {
    const userId = owner('project-replacement');
    await storage.getOrCreateCareerMap(userId);
    const firstProjectId = id('project-original');
    const replacementProjectId = id('project-replacement');
    const operations: CareerMapOperation[] = [
      { type: 'propose-why', sourceId: id('pr-why-propose'), expectedRevision: 0, occurredAt: at(1), payload: { why: { id: id('pr-why'), revision: 1, statement: 'Make useful decisions easier.', serves: 'People facing complex choices', pointOfView: 'Actionable clarity creates agency.' }, presentation: presentation(1) } },
      { type: 'confirm-why', sourceId: id('pr-why-confirm'), expectedRevision: 1, occurredAt: at(2), payload: { whyId: id('pr-why'), whyRevision: 1, action: action(2) } },
      { type: 'propose-purpose-paths', sourceId: id('pr-paths'), expectedRevision: 2, occurredAt: at(3), payload: { setId: id('pr-path-set'), setRevision: 1, paths: paths(), presentation: presentation(3) } },
      { type: 'select-purpose-path', sourceId: id('pr-path-select'), expectedRevision: 3, occurredAt: at(4), payload: { setId: id('pr-path-set'), setRevision: 1, pathId: id('path-1'), pathRevision: 1, action: action(4) } },
      { type: 'propose-first-project', sourceId: id('pr-project-propose'), expectedRevision: 4, occurredAt: at(5), payload: { project: project(firstProjectId), presentation: presentation(5) } },
      { type: 'replace-project-proposal', sourceId: id('pr-project-replace'), expectedRevision: 5, occurredAt: at(6), payload: { projectId: firstProjectId, projectRevision: 1, replacement: project(replacementProjectId), presentation: presentation(6) } },
    ];
    await persistCompletedSequence(userId, 'project-replacement', operations);
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') {
      expect(loaded.map.projects.at(-1)?.id).toBe(replacementProjectId);
      expect(loaded.map.projects.at(-1)?.number).toBe(1);
      expect(loaded.map.revision).toBe(6);
    }
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(6);
  });

  it('delivers first-project framing atomically with the exact completed assistant turn', async () => {
    const userId = owner('framing-delivery');
    await storage.getOrCreateCareerMap(userId);
    const projectId = await seedPendingFirstProject(userId, 'framing-delivery');
    const framingTurn = await beginTurn(userId, 'framing-delivery-turn', 'agent-turn');
    await persistPendingFraming(userId, framingTurn, projectId, 'framing-delivery');

    const completed = await storage.completeAgentTurn({
      userId,
      turnId: framingTurn.turnId,
      leaseId: framingTurn.leaseId,
      assistantText: `${framingText}\n\n${acceptanceQuestion}`,
      result: { kind: 'completed', revision: 6, operationCommitted: true, refetch: true },
    });

    expect(completed).toMatchObject({
      status: 'completed',
      terminalResult: { revision: 7, operationCommitted: true },
    });
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded).toMatchObject({
      status: 'ready',
      map: {
        revision: 7,
        projects: [expect.objectContaining({
          id: projectId,
          acceptanceFraming: expect.objectContaining({
            status: 'delivered',
            assistantTurnId: framingTurn.turnId,
            framingText,
            acceptancePhrase,
            acceptanceQuestion,
          }),
        })],
      },
    });
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(7);
  });

  it.each(['cancelled', 'failed'] as const)(
    'clears pending first-project framing when its initiating turn is %s',
    async (terminal) => {
      const userId = owner(`framing-${terminal}`);
      await storage.getOrCreateCareerMap(userId);
      const projectId = await seedPendingFirstProject(userId, `framing-${terminal}`);
      const framingTurn = await beginTurn(userId, `framing-${terminal}-turn`, 'agent-turn');
      await persistPendingFraming(userId, framingTurn, projectId, `framing-${terminal}`);

      if (terminal === 'cancelled') {
        await storage.cancelAgentTurn({ userId, turnId: framingTurn.turnId, leaseId: framingTurn.leaseId });
      } else {
        await storage.failAgentTurn({
          userId, turnId: framingTurn.turnId, leaseId: framingTurn.leaseId,
          errorClass: 'InjectedFailure',
        });
      }

      const loaded = await storage.loadCareerMap(userId);
      expect(loaded).toMatchObject({ status: 'ready', map: { revision: 7 } });
      if (loaded.status === 'ready') {
        expect(loaded.map.projects.find((candidate) => candidate.id === projectId)?.acceptanceFraming)
          .toBeUndefined();
      }
    },
  );

  it('rolls back malformed framing delivery and leaves the project safely re-framable after failure cleanup', async () => {
    const userId = owner('framing-malformed');
    await storage.getOrCreateCareerMap(userId);
    const projectId = await seedPendingFirstProject(userId, 'framing-malformed');
    const framingTurn = await beginTurn(userId, 'framing-malformed-turn', 'agent-turn');
    await persistPendingFraming(userId, framingTurn, projectId, 'framing-malformed');

    await expect(storage.completeAgentTurn({
      userId,
      turnId: framingTurn.turnId,
      leaseId: framingTurn.leaseId,
      assistantText: `Preface. ${framingText}\n\n${acceptanceQuestion}`,
    })).rejects.toMatchObject({ name: 'FramingDeliveryError' });
    expect(await storage.loadCareerMap(userId)).toMatchObject({
      status: 'ready', map: { revision: 6, projects: [expect.objectContaining({ acceptanceFraming: expect.objectContaining({ status: 'pending' }) })] },
    });
    await storage.failAgentTurn({
      userId, turnId: framingTurn.turnId, leaseId: framingTurn.leaseId,
      errorClass: 'FramingDeliveryError',
    });
    const cleaned = await storage.loadCareerMap(userId);
    expect(cleaned).toMatchObject({ status: 'ready', map: { revision: 7 } });
    if (cleaned.status === 'ready') {
      expect(cleaned.map.projects.find((candidate) => candidate.id === projectId)?.acceptanceFraming)
        .toBeUndefined();
    }
  });

  it('fails closed instead of completing first-project framing on a repair-required map', async () => {
    const userId = owner('framing-repair-completion');
    await storage.getOrCreateCareerMap(userId);
    const projectId = await seedPendingFirstProject(userId, 'framing-repair-completion');
    const framingTurn = await beginTurn(userId, 'framing-repair-completion-turn', 'agent-turn');
    await persistPendingFraming(userId, framingTurn, projectId, 'framing-repair-completion');
    await db.update(careerMaps).set({ repairRequired: true }).where(eq(careerMaps.userId, userId));
    const [beforeCleanup] = await db.select().from(careerMaps).where(eq(careerMaps.userId, userId));

    await expect(storage.completeAgentTurn({
      userId,
      turnId: framingTurn.turnId,
      leaseId: framingTurn.leaseId,
      assistantText: `${framingText}\n\n${acceptanceQuestion}`,
    })).rejects.toBeInstanceOf(CareerMapRepairRequiredError);
    expect((await storage.getAgentTurn(userId, framingTurn.clientMessageId))?.status).toBe('pending');

    expect(await storage.failAgentTurn({
      userId,
      turnId: framingTurn.turnId,
      leaseId: framingTurn.leaseId,
      errorClass: 'CareerMapRepairRequiredError',
    })).toMatchObject({ status: 'failed' });
    expect(await storage.getTurnLease(userId)).toBeUndefined();
    expect((await db.select().from(careerMaps).where(eq(careerMaps.userId, userId)))[0])
      .toEqual(beforeCleanup);
    expect((await storage.loadCareerMap(userId)).status).toBe('repair-required');
    await eraseOwner(userId);
  });

  it('cancels a pending framing turn without mutating a repair-required map', async () => {
    const userId = owner('framing-repair-cancellation');
    await storage.getOrCreateCareerMap(userId);
    const projectId = await seedPendingFirstProject(userId, 'framing-repair-cancellation');
    const framingTurn = await beginTurn(userId, 'framing-repair-cancellation-turn', 'agent-turn');
    await persistPendingFraming(userId, framingTurn, projectId, 'framing-repair-cancellation');
    await db.update(careerMaps).set({ repairRequired: true }).where(eq(careerMaps.userId, userId));
    const [beforeCleanup] = await db.select().from(careerMaps).where(eq(careerMaps.userId, userId));

    expect(await storage.cancelAgentTurn({
      userId,
      turnId: framingTurn.turnId,
      leaseId: framingTurn.leaseId,
    })).toMatchObject({ status: 'cancelled' });

    expect(await storage.getTurnLease(userId)).toBeUndefined();
    expect((await db.select().from(careerMaps).where(eq(careerMaps.userId, userId)))[0])
      .toEqual(beforeCleanup);
    expect((await storage.loadCareerMap(userId)).status).toBe('repair-required');
    await eraseOwner(userId);
  });

  it('loads a pre-U7 schema-version-2 accepted first project without acceptance framing', async () => {
    const userId = owner('legacy-accepted-project');
    await storage.getOrCreateCareerMap(userId);
    const projectId = await seedPendingFirstProject(userId, 'legacy-accepted');
    const framingTurn = await beginTurn(userId, 'legacy-accepted-framing', 'agent-turn');
    await persistPendingFraming(userId, framingTurn, projectId, 'legacy-accepted');
    await storage.completeAgentTurn({
      userId, turnId: framingTurn.turnId, leaseId: framingTurn.leaseId,
      assistantText: `${framingText}\n\n${acceptanceQuestion}`,
    });
    const acceptanceTurn = await beginTurn(userId, 'legacy-accepted-confirm', 'workspace-action');
    const acceptanceContext = createWorkspaceActionPersistenceContext(acceptanceTurn, {
      turnSequence: 7, occurredAt: at(7),
    });
    expect((await storage.persistCareerMapOperation({
      userId,
      leaseId: acceptanceTurn.leaseId,
      context: acceptanceContext,
      operation: {
        type: 'accept-first-project', sourceId: id('legacy-accepted-confirm'),
        expectedRevision: 7, occurredAt: at(7), payload: {
          projectId, projectRevision: 1, action: acceptanceContext.action,
        },
      },
      moduleVersion: '1.1.1',
    })).status).toBe('committed');
    const current = await storage.loadCareerMap(userId);
    if (current.status !== 'ready') throw new Error('Accepted project fixture did not load.');
    const legacyDocument = structuredClone(current.map);
    const accepted = legacyDocument.projects.find((candidate) => candidate.id === projectId);
    if (!accepted) throw new Error('Accepted project fixture is missing.');
    delete accepted.acceptanceFraming;
    await db.update(careerMaps)
      .set({ document: legacyDocument })
      .where(eq(careerMaps.userId, userId));

    const loaded = await storage.loadCareerMap(userId);
    expect(loaded).toMatchObject({
      status: 'ready',
      map: { schemaVersion: 3, projects: [expect.objectContaining({ id: projectId, agreementStatus: 'accepted' })] },
    });
    if (loaded.status === 'ready') {
      expect(loaded.map.projects.find((candidate) => candidate.id === projectId)?.acceptanceFraming)
        .toBeUndefined();
    }
  });

  it('persists Side Door selection with one active and two parked siblings atomically', async () => {
    const userId = owner('side-door-selection');
    await storage.getOrCreateCareerMap(userId);
    const legacy = structuredClone(legacyProof);
    legacy.explorerId = userId;
    legacy.revision = 18;
    legacy.operationHistory = legacy.operationHistory.slice(0, 18).map((receipt) => ({ ...receipt, moduleVersion: 'method-test@1' }));
    legacy.sideDoorSets = [];
    const normalized = readCareerMap(legacy);
    await db.update(careerMaps).set({ schemaVersion: 2, revision: legacy.revision, document: legacy as never }).where(eq(careerMaps.userId, userId));
    await db.insert(careerMapHistory).values(normalized.operationHistory.map((receipt, index) => ({
      userId,
      operationSourceId: receipt.sourceId,
      operationType: receipt.operationType,
      payloadFingerprint: receipt.payloadFingerprint,
      baseRevision: index,
      resultRevision: receipt.resultRevision,
      result: receipt,
      confirmationProvenance: receipt.confirmationProvenance,
      moduleVersion: receipt.moduleVersion!,
      committedAt: new Date(receipt.committedAt),
    })));
    const operations: CareerMapOperation[] = [
      { type: 'propose-side-doors', sourceId: id('sd-19'), expectedRevision: 18, occurredAt: at(19), payload: { setId: id('sd-door-set'), setRevision: 1, doors: sideDoors(), presentation: presentation(19) } },
      { type: 'select-side-door', sourceId: id('sd-20'), expectedRevision: 19, occurredAt: at(20), payload: { setId: id('sd-door-set'), setRevision: 1, doorId: id('door-2'), doorRevision: 1, action: action(20) } },
    ];
    await persistCompletedSequence(userId, 'side-door-selection', operations);
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') {
      const doors = loaded.map.sideDoorSets.at(-1)?.doors ?? [];
      expect(doors.filter((door) => door.selection === 'active')).toHaveLength(1);
      expect(doors.filter((door) => door.selection === 'parked')).toHaveLength(2);
    }
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(20);
  });

  it('never marks a valid map for repair while an atomic writer is between row and history updates', async () => {
    const userId = owner('load-write-race');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'load-write-race');
    let reachedMidpoint!: () => void;
    let releaseWriter!: () => void;
    const midpoint = new Promise<void>((resolve) => { reachedMidpoint = resolve; });
    const release = new Promise<void>((resolve) => { releaseWriter = resolve; });
    const gated = new PostgresStorage({
      database: db,
      now: () => now,
      faultInjector: async (stage) => {
        if (stage === 'after-map-update-before-history') {
          reachedMidpoint();
          await release;
        }
      },
    });
    const write = gated.persistCareerMapOperation(await boundPersistenceInput({
      userId,
      leaseId: turn.leaseId,
      operation: evidenceOperation(0, id('load-write-race-source')),
      moduleVersion: 'method-test@1',
    }));
    await midpoint;
    let loadSettled = false;
    const concurrentLoad = storage.loadCareerMap(userId).finally(() => { loadSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loadSettled).toBe(false);
    releaseWriter();
    expect((await write).status).toBe('committed');
    expect((await concurrentLoad).status).toBe('ready');
    expect((await storage.loadCareerMap(userId)).status).toBe('ready');
  });
});

describe('PostgresStorage lease and client-message turns', () => {
  it('persists and replays canonical commit truth when reply delivery fails after a saved operation', async () => {
    const userId = owner('u5-saved-reply-failure');
    await storage.getOrCreateCareerMap(userId);
    const active = await beginTurn(userId, 'u5-saved-reply-failure', 'agent-turn');
    const internalContextItemId = id('u5-failed-internal-context');

    const failed = await storage.failAgentTurn({
      userId,
      turnId: active.turnId,
      leaseId: active.leaseId,
      errorClass: 'NoOutputGeneratedError',
      result: {
        revision: 2,
        operationCommitted: true,
        internalContextItemIds: [internalContextItemId],
      },
    });

    expect(failed).toMatchObject({
      status: 'failed',
      terminalResult: {
        kind: 'failed',
        refetch: true,
        errorClass: 'NoOutputGeneratedError',
        revision: 2,
        operationCommitted: true,
        internalContextItemIds: [internalContextItemId],
      },
    });
    expect(await storage.getTurnLease(userId)).toBeUndefined();

    const replay = await storage.beginAgentTurn({
      userId,
      clientMessageId: active.clientMessageId,
      requestFingerprint: active.requestFingerprint,
      turnId: id('u5-saved-reply-failure-retry-turn'),
      leaseId: id('u5-saved-reply-failure-retry-lease'),
    });
    expect(replay).toMatchObject({
      status: 'terminal',
      shouldInvokeModel: false,
      turn: {
        status: 'failed',
        terminalResult: { kind: 'failed', revision: 2, operationCommitted: true },
      },
    });
  });

  it('keeps provisioning cleanup and display recovery metadata durable across terminalization', async () => {
    const userId = owner('u5-provisioning-recovery');
    const turn = await beginTurn(userId, 'u5-provisioning-recovery', 'agent-turn');
    const conversationId = id('u5-provisioning-orphan');
    await storage.recordConversationProvisioning({
      userId, turnId: turn.turnId, leaseId: turn.leaseId, conversationId,
    });
    expect(await storage.listPendingConversationProvisioning(userId)).toEqual([{
      userId, turnId: turn.turnId, conversationId,
    }]);
    const terminal = await storage.cancelAgentTurn({
      userId, turnId: turn.turnId, leaseId: turn.leaseId,
      result: {
        kind: 'cancelled', stopped: true, refetch: true,
        displayRecovery: {
          status: 'pending', userTextDigest: 'a'.repeat(64), retainPartial: false,
        },
      },
    });
    expect(terminal).toMatchObject({
      status: 'cancelled',
      terminalResult: {
        conversationProvisioning: { status: 'pending', conversationId },
        displayRecovery: { status: 'pending', retainPartial: false },
      },
    });
    await storage.backfillAgentTurnDisplayProjection({
      userId, turnId: turn.turnId,
      displayProjection: { userItemId: id('u5-recovered-user'), assistantItemIds: [] },
    });
    const recoveredTerminal = (await storage.getAgentTurn(userId, turn.clientMessageId))?.terminalResult;
    expect(recoveredTerminal).toMatchObject({
      displayProjection: { userItemId: id('u5-recovered-user'), assistantItemIds: [] },
      conversationProvisioning: { status: 'pending', conversationId },
    });
    expect(recoveredTerminal).not.toHaveProperty('displayRecovery');
    await storage.resolveConversationProvisioning({ userId, turnId: turn.turnId, conversationId });
    expect(await storage.listPendingConversationProvisioning(userId)).toEqual([]);
  });

  it('includes every mapped and unbound provider Conversation in full Method erasure', async () => {
    const userId = owner('u5-provisioning-erasure');
    const turn = await beginTurn(userId, 'u5-provisioning-erasure', 'agent-turn');
    const mapped = id('u5-mapped-conversation');
    const orphan = id('u5-unbound-conversation');
    await storage.setConversationMapping(userId, turn.leaseId, mapped);
    await storage.recordConversationProvisioning({
      userId, turnId: turn.turnId, leaseId: turn.leaseId, conversationId: orphan,
    });
    const deleted: string[] = [];
    expect(await storage.eraseMethodData(userId, {
      deleteConversationItemsAndConversation: async (conversationId) => { deleted.push(conversationId); },
    })).toEqual({ status: 'complete' });
    expect(new Set(deleted)).toEqual(new Set([mapped, orphan]));
    expect(await storage.listPendingConversationProvisioning(userId)).toEqual([]);
    expect(await storage.getConversationMapping(userId)).toBeUndefined();
  });

  it('generation-fences a provider Conversation returned after local erasure removed its turn', async () => {
    const userId = owner('u5-late-provisioning-after-erasure');
    const turn = await beginTurn(userId, 'u5-late-provisioning-after-erasure', 'agent-turn');
    expect(await storage.eraseMethodData(userId)).toEqual({ status: 'complete' });
    const lateConversationId = id('u5-late-provisioning-conversation');

    await storage.recordConversationProvisioning({
      userId, turnId: turn.turnId, leaseId: turn.leaseId, conversationId: lateConversationId,
    });

    expect(await storage.getMethodErasureJob(userId)).toMatchObject({
      conversationId: lateConversationId, status: 'pending-provider',
    });
    const deleted: string[] = [];
    expect(await storage.eraseMethodData(userId, {
      deleteConversationItemsAndConversation: async (conversationId) => { deleted.push(conversationId); },
    })).toEqual({ status: 'complete' });
    expect(deleted).toEqual([lateConversationId]);
    expect(await storage.getMethodErasureJob(userId)).toBeUndefined();
  });

  it('starts one model invocation when identical client messages race and rejects changed reuse', async () => {
    const userId = owner('message-race');
    await storage.getOrCreateCareerMap(userId);
    const input = {
      userId,
      clientMessageId: id('message-race-id'),
      requestFingerprint: id('message-race-fingerprint'),
      turnId: id('message-race-turn'),
      leaseId: id('message-race-lease'),
    };
    const results = await Promise.all([
      storage.beginAgentTurn(input),
      storage.beginAgentTurn(input),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['attached', 'started']);
    expect(results.filter((result) => result.status === 'started')).toHaveLength(1);
    const reused = await storage.beginAgentTurn({
      ...input,
      requestFingerprint: id('message-race-changed-fingerprint'),
    });
    expect(reused.status).toBe('message-id-reused');
  });

  it('rejects a non-opaque client message id at the durable turn boundary', async () => {
    const userId = owner('unsafe-client-message-id');
    await storage.getOrCreateCareerMap(userId);
    const unsafeClientMessageId = `${id('unsafe-message')}\nPRIVATE_DURABLE_ID_SENTINEL`;

    await expect(storage.beginAgentTurn({
      userId,
      clientMessageId: unsafeClientMessageId,
      requestFingerprint: id('unsafe-message-fingerprint'),
      turnId: id('unsafe-message-turn'),
      leaseId: id('unsafe-message-lease'),
    })).rejects.toBeDefined();
    expect(await storage.getAgentTurn(userId, unsafeClientMessageId)).toBeUndefined();
    expect(await storage.getTurnLease(userId)).toBeUndefined();
  });

  it('conflicts while active, attaches without reinvocation, expires, and reclaims with fencing', async () => {
    const userId = owner('lease');
    const first = await beginTurn(userId, 'lease-first');
    const attached = await storage.beginWorkspaceActionTurn(first);
    expect(attached.status).toBe('attached');
    if (attached.status === 'attached') expect(attached.shouldInvokeModel).toBe(false);
    const second = { ...first, clientMessageId: id('message-lease-second'), requestFingerprint: id('request-lease-second'), turnId: id('turn-lease-second'), leaseId: id('lease-lease-second') };
    expect((await storage.beginWorkspaceActionTurn(second)).status).toBe('conflict');
    now = new Date(now.getTime() + 400_000);
    const reclaimed = await storage.beginWorkspaceActionTurn(second);
    expect(reclaimed.status).toBe('started');
    if (reclaimed.status === 'started') expect(reclaimed.reclaimedTurnId).toBe(first.turnId);
    expect((await storage.getAgentTurn(userId, first.clientMessageId))?.status).toBe('failed');
    expect(await storage.releaseTurnLease(userId, first.turnId, first.leaseId)).toBe(false);
    expect((await storage.getTurnLease(userId))?.leaseId).toBe(second.leaseId);
  });

  it('terminalizes a pending turn before explicitly releasing its lease', async () => {
    const userId = owner('explicit-release');
    const turn = await beginTurn(userId, 'explicit-release');
    expect(await storage.releaseTurnLease(userId, turn.turnId, turn.leaseId)).toBe(true);
    expect(await storage.getTurnLease(userId)).toBeUndefined();
    expect(await storage.getAgentTurn(userId, turn.clientMessageId)).toMatchObject({
      status: 'failed',
      terminalResult: { errorClass: 'TurnLeaseReleased', refetch: true },
    });
    expect(await storage.auditCareerMapIntegrity()).toMatchObject({
      pendingTurnsWithoutLease: 0,
      invalidLeases: 0,
      zeroInvalid: true,
    });
  });

  it('allows one winner when two new messages race to reclaim an expired lease', async () => {
    const userId = owner('reclaim-race');
    const expired = await beginTurn(userId, 'reclaim-race-expired');
    now = new Date(now.getTime() + 400_000);
    const left = {
      userId,
      clientMessageId: id('reclaim-left-message'), requestFingerprint: id('reclaim-left-request'),
      turnId: id('reclaim-left-turn'), leaseId: id('reclaim-left-lease'),
    };
    const right = {
      userId,
      clientMessageId: id('reclaim-right-message'), requestFingerprint: id('reclaim-right-request'),
      turnId: id('reclaim-right-turn'), leaseId: id('reclaim-right-lease'),
    };
    const results = await Promise.all([
      storage.beginAgentTurn(left),
      storage.beginAgentTurn(right),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['conflict', 'started']);
    const winner = results.find((result) => result.status === 'started');
    const loser = results.find((result) => result.status === 'conflict');
    if (winner?.status === 'started' && loser?.status === 'conflict') {
      expect(loser.activeTurnId).toBe(winner.turn.turnId);
    }
    expect((await storage.getAgentTurn(userId, expired.clientMessageId))?.status).toBe('failed');
  });

  it('clears pending first-project framing exactly once when a new turn reclaims its expired lease', async () => {
    const userId = owner('framing-expired-reclaim');
    await storage.getOrCreateCareerMap(userId);
    const projectId = await seedPendingFirstProject(userId, 'framing-expired-reclaim');
    const framingTurn = await beginTurn(userId, 'framing-expired-reclaim-turn', 'agent-turn');
    await persistPendingFraming(userId, framingTurn, projectId, 'framing-expired-reclaim');
    now = new Date(now.getTime() + 400_000);

    const replacement = await beginTurn(userId, 'framing-expired-reclaim-replacement', 'agent-turn');

    expect(replacement.turnId).not.toBe(framingTurn.turnId);
    expect((await storage.getAgentTurn(userId, framingTurn.clientMessageId))?.status).toBe('failed');
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded).toMatchObject({ status: 'ready', map: { revision: 7 } });
    if (loaded.status === 'ready') {
      expect(loaded.map.projects.find((candidate) => candidate.id === projectId)?.acceptanceFraming)
        .toBeUndefined();
      expect(loaded.map.operationHistory.filter((receipt) => receipt.operationType === 'abandon-first-project-framing'))
        .toHaveLength(1);
    }
  });

  it('rejects lease-token ABA reuse after expiry', async () => {
    const userId = owner('lease-token-aba');
    const first = await beginTurn(userId, 'lease-token-aba-first');
    now = new Date(now.getTime() + 400_000);
    await expect(storage.beginAgentTurn({
      userId,
      clientMessageId: id('lease-token-aba-second-message'),
      requestFingerprint: id('lease-token-aba-second-request'),
      turnId: id('lease-token-aba-second-turn'),
      leaseId: first.leaseId,
    })).rejects.toBeInstanceOf(TurnLeaseIdentityConflictError);
    expect((await storage.getAgentTurn(userId, first.clientMessageId))?.status).toBe('pending');
    expect((await storage.getTurnLease(userId))?.turnId).toBe(first.turnId);
    await beginTurn(userId, 'lease-token-aba-valid-second');
  });

  it('fences terminal completion after lease expiry and releases the stale lease', async () => {
    const userId = owner('expired-terminal');
    const turn = await beginTurn(userId, 'expired-terminal');
    now = new Date(now.getTime() + 400_000);
    const completed = await storage.completeAgentTurn({
      userId,
      turnId: turn.turnId,
      leaseId: turn.leaseId,
    });
    expect(completed).toMatchObject({
      status: 'failed',
      terminalResult: { reason: 'lease-expired', refetch: true },
    });
    expect(await storage.getTurnLease(userId)).toBeUndefined();
  });

  it('aborts successful completion before terminal update while cancellation still persists', async () => {
    const userId = owner('completion-abort-fence');
    const turn = await beginTurn(userId, 'completion-abort-fence');
    const controller = new AbortController();
    const abortingStorage = new PostgresStorage({
      database: db,
      now: () => now,
      faultInjector: (stage) => {
        if (stage === 'before-turn-completion-update') controller.abort();
      },
    });
    await expect(abortingStorage.completeAgentTurn({
      userId,
      turnId: turn.turnId,
      leaseId: turn.leaseId,
      result: { kind: 'completed', refetch: true },
      abortSignal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(await storage.getAgentTurn(userId, turn.clientMessageId)).toMatchObject({ status: 'pending' });
    expect(await storage.cancelAgentTurn({
      userId,
      turnId: turn.turnId,
      leaseId: turn.leaseId,
      result: { kind: 'cancelled', stopped: true, refetch: true },
    })).toMatchObject({ status: 'cancelled' });
    expect(await storage.getTurnLease(userId)).toBeUndefined();
  });

  it('resamples lease time after completion waits for the owner lock', async () => {
    const userId = owner('completion-lock-expiry');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'completion-lock-expiry');
    let reachedFence!: () => void;
    let releaseFence!: () => void;
    const fenceReached = new Promise<void>((resolve) => { reachedFence = resolve; });
    const fenceRelease = new Promise<void>((resolve) => { releaseFence = resolve; });
    const blockingStorage = new PostgresStorage({
      database: db,
      now: () => now,
      faultInjector: async (stage) => {
        if (stage === 'before-map-update') {
          reachedFence();
          await fenceRelease;
        }
      },
    });
    const blockingWrite = blockingStorage.persistCareerMapOperation(await boundPersistenceInput({
      userId,
      leaseId: turn.leaseId,
      operation: evidenceOperation(0, id('completion-lock-expiry-write')),
      moduleVersion: 'method-test@1',
    }));
    await fenceReached;
    const completion = storage.completeAgentTurn({
      userId,
      turnId: turn.turnId,
      leaseId: turn.leaseId,
      result: { kind: 'completed', refetch: true },
    });
    now = new Date(now.getTime() + 400_000);
    releaseFence();
    expect(await blockingWrite).toMatchObject({ status: 'lease-lost' });
    expect(await completion).toMatchObject({ status: 'failed' });
    expect(await storage.getAgentTurn(userId, turn.clientMessageId)).toMatchObject({ status: 'failed' });
    expect(await storage.getTurnLease(userId)).toBeUndefined();
  });

  it('recovers an expired retry of the same message as terminal without invoking again', async () => {
    const userId = owner('same-message-expired');
    const turn = await beginTurn(userId, 'same-message-expired');
    now = new Date(now.getTime() + 400_000);
    const recovered = await storage.beginWorkspaceActionTurn(turn);
    expect(recovered.status).toBe('terminal');
    if (recovered.status === 'terminal') {
      expect(recovered.shouldInvokeModel).toBe(false);
      expect(recovered.turn).toMatchObject({
        status: 'failed',
        terminalResult: { reason: 'lease-expired', refetch: true },
      });
    }
    expect(await storage.getTurnLease(userId)).toBeUndefined();
    expect((await storage.beginWorkspaceActionTurn(turn)).status).toBe('terminal');
  });

  it('fences completion against a concurrent reclaim after expiry', async () => {
    const userId = owner('finish-reclaim-race');
    const first = await beginTurn(userId, 'finish-reclaim-first');
    now = new Date(now.getTime() + 400_000);
    const second = {
      userId,
      clientMessageId: id('finish-reclaim-second-message'),
      requestFingerprint: id('finish-reclaim-second-request'),
      turnId: id('finish-reclaim-second-turn'),
      leaseId: id('finish-reclaim-second-lease'),
    };
    const [finished, reclaimed] = await Promise.all([
      storage.completeAgentTurn({ userId, turnId: first.turnId, leaseId: first.leaseId }),
      storage.beginAgentTurn(second),
    ]);
    expect(finished?.status).toBe('failed');
    expect(reclaimed.status).toBe('started');
    expect((await storage.getTurnLease(userId))?.leaseId).toBe(second.leaseId);
  });

  it.each(['completed', 'cancelled', 'failed'] as const)('releases the lease on the %s terminal path', async (terminal) => {
    const userId = owner(`terminal-${terminal}`);
    const turn = await beginTurn(userId, `terminal-${terminal}`);
    const result = terminal === 'completed'
      ? await storage.completeAgentTurn({ userId, turnId: turn.turnId, leaseId: turn.leaseId })
      : terminal === 'cancelled'
        ? await storage.cancelAgentTurn({ userId, turnId: turn.turnId, leaseId: turn.leaseId })
        : await storage.failAgentTurn({ userId, turnId: turn.turnId, leaseId: turn.leaseId, errorClass: 'InjectedFailure' });
    expect(result?.status).toBe(terminal);
    expect(await storage.getTurnLease(userId)).toBeUndefined();
    expect((await beginTurn(userId, `terminal-${terminal}-next`)).turnId).not.toBe(turn.turnId);
  });

  it('recovers completed and cancelled message identities without invoking again', async () => {
    const completedOwner = owner('completed-recovery');
    const completed = await beginTurn(completedOwner, 'completed-recovery');
    const completedResult = { responseId: id('completed-response'), revision: 17, refetch: true };
    await storage.completeAgentTurn({
      userId: completedOwner, turnId: completed.turnId, leaseId: completed.leaseId, result: completedResult,
    });
    const completedRetry = await storage.beginWorkspaceActionTurn(completed);
    expect(completedRetry.status).toBe('terminal');
    if (completedRetry.status === 'terminal') {
      expect(completedRetry.shouldInvokeModel).toBe(false);
      expect(completedRetry.turn).toMatchObject({ status: 'completed', terminalResult: completedResult });
    }
    const cancelledOwner = owner('cancelled-recovery');
    const cancelled = await beginTurn(cancelledOwner, 'cancelled-recovery');
    const cancelledResult = { stopped: true, reason: 'explorer-requested', refetch: true };
    await storage.cancelAgentTurn({
      userId: cancelledOwner, turnId: cancelled.turnId, leaseId: cancelled.leaseId, result: cancelledResult,
    });
    const cancelledRetry = await storage.beginWorkspaceActionTurn(cancelled);
    expect(cancelledRetry.status).toBe('terminal');
    if (cancelledRetry.status === 'terminal') {
      expect(cancelledRetry.shouldInvokeModel).toBe(false);
      expect(cancelledRetry.turn).toMatchObject({ status: 'cancelled', terminalResult: cancelledResult });
    }
  });

  it('isolates identical client and operation identities across users', async () => {
    const leftOwner = owner('isolation-left');
    const rightOwner = owner('isolation-right');
    await Promise.all([storage.getOrCreateCareerMap(leftOwner), storage.getOrCreateCareerMap(rightOwner)]);
    const shared = { clientMessageId: id('shared-message'), requestFingerprint: id('shared-request'), turnId: id('left-turn'), leaseId: id('left-lease') };
    expect((await storage.beginWorkspaceActionTurn({ userId: leftOwner, ...shared })).status).toBe('started');
    expect((await storage.beginWorkspaceActionTurn({ userId: rightOwner, ...shared, turnId: id('right-turn'), leaseId: id('right-lease') })).status).toBe('started');
    expect((await persist(leftOwner, shared.leaseId, evidenceOperation(0, id('shared-source')))).status).toBe('committed');
    expect((await persist(rightOwner, id('right-lease'), evidenceOperation(0, id('shared-source')))).status).toBe('committed');
    expect(await storage.listCareerMapHistory(leftOwner)).toHaveLength(1);
    expect(await storage.listCareerMapHistory(rightOwner)).toHaveLength(1);
  });

  it('allows one logical operation under a reclaimed lease race', async () => {
    const userId = owner('expiry-race');
    await storage.getOrCreateCareerMap(userId);
    const first = await beginTurn(userId, 'expiry-race-first');
    now = new Date(now.getTime() + 400_000);
    const second = await beginTurn(userId, 'expiry-race-second');
    expect(second.leaseId).toBe(id('lease-expiry-race-second'));
    await storage.setConversationMapping(userId, second.leaseId, id('expiry-race-conversation'));
    await expect(storage.saveCareerMapDraft({
      userId, leaseId: first.leaseId, id: id('expiry-race-stale-draft'), kind: 'outreach', content: { text: 'stale' },
    })).rejects.toBeInstanceOf(TurnLeaseLostError);
    await expect(storage.setConversationMapping(userId, first.leaseId, id('expiry-race-stale-conversation')))
      .rejects.toBeInstanceOf(TurnLeaseLostError);
    expect(await storage.getConversationMapping(userId)).toBe(id('expiry-race-conversation'));
    const operation = evidenceOperation(0, id('expiry-race-source'));
    const [oldResult, currentLeft, currentRight] = await Promise.all([
      persist(userId, first.leaseId, operation),
      persist(userId, id('lease-expiry-race-second'), operation),
      persist(userId, id('lease-expiry-race-second'), operation),
    ]);
    expect(oldResult.status).toBe('lease-lost');
    expect([currentLeft.status, currentRight.status].sort()).toEqual(['committed', 'replayed']);
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(1);
  });
});

describe('PostgresStorage repair, erasure, and integrity', () => {
  it.each(['corrupt', 'unsupported', 'sticky'] as const)(
    'blocks turn acquisition before lease or turn writes for a %s repair row',
    async (scenario) => {
      const userId = owner(`repair-turn-gate-${scenario}`);
      const created = await storage.getOrCreateCareerMap(userId);
      expect(created.status).toBe('ready');
      if (created.status !== 'ready') return;
      if (scenario === 'corrupt') {
        await db.update(careerMaps)
          .set({ document: { ...created.map, pathSets: [{ id: 'broken' }] } as never })
          .where(eq(careerMaps.userId, userId));
      } else if (scenario === 'unsupported') {
        await db.update(careerMaps)
          .set({ schemaVersion: 999, document: { ...created.map, schemaVersion: 999 } as never })
          .where(eq(careerMaps.userId, userId));
      } else {
        await db.update(careerMaps)
          .set({ repairRequired: true })
          .where(eq(careerMaps.userId, userId));
      }

      const result = await storage.beginAgentTurn({
        userId,
        clientMessageId: id(`repair-turn-gate-${scenario}-message`),
        requestFingerprint: id(`repair-turn-gate-${scenario}-request`),
        turnId: id(`repair-turn-gate-${scenario}-turn`),
        leaseId: id(`repair-turn-gate-${scenario}-lease`),
      });
      expect(result.status).toBe('repair-required');
      expect(await db.select().from(agentTurns).where(eq(agentTurns.userId, userId))).toHaveLength(0);
      expect(await db.select().from(agentTurnLeases).where(eq(agentTurnLeases.userId, userId))).toHaveLength(0);
      expect((await db.select({ repairRequired: careerMaps.repairRequired })
        .from(careerMaps).where(eq(careerMaps.userId, userId)))[0]?.repairRequired).toBe(true);
      await eraseOwner(userId);
    },
  );

  it.each(['corrupt', 'unsupported', 'sticky'] as const)(
    'blocks every auxiliary Method write for a %s repair row while preserving terminal cleanup',
    async (scenario) => {
      const userId = owner(`repair-aux-gate-${scenario}`);
      const created = await storage.getOrCreateCareerMap(userId);
      expect(created.status).toBe('ready');
      if (created.status !== 'ready') return;
      const turn = await beginTurn(userId, `repair-aux-gate-${scenario}`);
      if (scenario === 'corrupt') {
        await db.update(careerMaps)
          .set({ document: { ...created.map, pathSets: [{ id: 'broken' }] } as never })
          .where(eq(careerMaps.userId, userId));
      } else if (scenario === 'unsupported') {
        await db.update(careerMaps)
          .set({ schemaVersion: 999, document: { ...created.map, schemaVersion: 999 } as never })
          .where(eq(careerMaps.userId, userId));
      } else {
        await db.update(careerMaps)
          .set({ repairRequired: true })
          .where(eq(careerMaps.userId, userId));
      }

      await expect(storage.saveCareerMapDraft({
        userId, leaseId: turn.leaseId, id: id(`repair-aux-gate-${scenario}-draft`),
        kind: 'outreach', content: { text: 'must not persist' },
      })).rejects.toBeInstanceOf(CareerMapRepairRequiredError);
      await expect(storage.setConversationMapping(
        userId,
        turn.leaseId,
        id(`repair-aux-gate-${scenario}-conversation`),
      )).rejects.toBeInstanceOf(CareerMapRepairRequiredError);

      expect(await db.select().from(careerMapDrafts)
        .where(eq(careerMapDrafts.userId, userId))).toHaveLength(0);
      expect(await db.select().from(agentConversationMappings)
        .where(eq(agentConversationMappings.userId, userId))).toHaveLength(0);
      expect(await db.select().from(agentTurns).where(eq(agentTurns.userId, userId))).toHaveLength(1);
      expect(await db.select().from(agentTurnLeases).where(eq(agentTurnLeases.userId, userId))).toHaveLength(1);
      const [beforeCleanup] = await db.select().from(careerMaps).where(eq(careerMaps.userId, userId));

      expect(await storage.failAgentTurn({
        userId, turnId: turn.turnId, leaseId: turn.leaseId, errorClass: 'RepairRequired',
      })).toMatchObject({ status: 'failed' });
      expect(await storage.getTurnLease(userId)).toBeUndefined();
      expect((await db.select().from(careerMaps).where(eq(careerMaps.userId, userId)))[0])
        .toEqual(beforeCleanup);
      expect((await storage.loadCareerMap(userId)).status).toBe('repair-required');
      await eraseOwner(userId);
    },
  );

  it.each([
    ['unsupported-schema', (document: Record<string, unknown>) => ({ rowVersion: 999, document: { ...document, schemaVersion: 999 } })],
    ['invalid-document', (document: Record<string, unknown>) => ({ rowVersion: 3, document: { ...document, pathSets: [{ id: 'broken' }] } })],
    ['owner-mismatch', (document: Record<string, unknown>) => ({ rowVersion: 3, document: { ...document, explorerId: id('someone-else') } })],
  ] as const)('fails invalid persisted rows closed as repair-required: %s', async (reason, corrupt) => {
    const userId = owner(`repair-${reason}`);
    const created = await storage.getOrCreateCareerMap(userId);
    expect(created.status).toBe('ready');
    if (created.status !== 'ready') return;
    const changed = corrupt(created.map as unknown as Record<string, unknown>);
    await db.update(careerMaps).set({ schemaVersion: changed.rowVersion, document: changed.document as never }).where(eq(careerMaps.userId, userId));
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('repair-required');
    if (loaded.status === 'repair-required') expect(loaded.reason).toBe(reason);
    await eraseOwner(userId);
  });

  it.each(['malformed-cardinality', 'duplicate-active', 'dangling-basis'] as const)(
    'fails closed for a persisted %s career-map invariant break',
    async (scenario) => {
      const userId = owner(`repair-${scenario}`);
      await storage.getOrCreateCareerMap(userId);
      const operations: CareerMapOperation[] = [
        { type: 'propose-why', sourceId: id(`${scenario}-1`), expectedRevision: 0, occurredAt: at(1), payload: { why: { id: id(`${scenario}-why`), revision: 1, statement: 'Make evidence useful.', serves: 'People facing choices', pointOfView: 'Evidence should create agency.' }, presentation: presentation(1) } },
        { type: 'confirm-why', sourceId: id(`${scenario}-2`), expectedRevision: 1, occurredAt: at(2), payload: { whyId: id(`${scenario}-why`), whyRevision: 1, action: action(2) } },
        { type: 'propose-purpose-paths', sourceId: id(`${scenario}-3`), expectedRevision: 2, occurredAt: at(3), payload: { setId: id(`${scenario}-set`), setRevision: 1, paths: paths(), presentation: presentation(3) } },
        { type: 'select-purpose-path', sourceId: id(`${scenario}-4`), expectedRevision: 3, occurredAt: at(4), payload: { setId: id(`${scenario}-set`), setRevision: 1, pathId: id('path-1'), pathRevision: 1, action: action(4) } },
      ];
      await persistCompletedSequence(userId, `repair-${scenario}`, operations);
      const loaded = await storage.loadCareerMap(userId);
      expect(loaded.status).toBe('ready');
      if (loaded.status !== 'ready') return;
      const corrupted = structuredClone(loaded.map);
      if (scenario === 'malformed-cardinality') corrupted.pathSets[0].paths.pop();
      if (scenario === 'duplicate-active') corrupted.pathSets[0].paths[1].selection = 'active';
      if (scenario === 'dangling-basis') corrupted.pathSets[0].basisWhy.id = id('missing-why');
      await db.update(careerMaps)
        .set({ document: corrupted as never })
        .where(eq(careerMaps.userId, userId));
      expect(await storage.loadCareerMap(userId)).toMatchObject({
        status: 'repair-required',
        reason: 'invalid-document',
      });
      await eraseOwner(userId);
    },
  );

  it('keeps repair-required sticky until a reviewed repair explicitly clears it', async () => {
    const userId = owner('repair-sticky');
    const created = await storage.getOrCreateCareerMap(userId);
    expect(created.status).toBe('ready');
    if (created.status !== 'ready') return;
    await db.update(careerMaps)
      .set({ document: { ...created.map, explorerId: id('wrong-owner') } })
      .where(eq(careerMaps.userId, userId));
    expect((await storage.loadCareerMap(userId)).status).toBe('repair-required');
    await db.update(careerMaps)
      .set({ document: created.map })
      .where(eq(careerMaps.userId, userId));
    expect((await storage.loadCareerMap(userId)).status).toBe('repair-required');
    await eraseOwner(userId);
  });

  it('fails closed when the append-only history result no longer matches the map receipt', async () => {
    const userId = owner('repair-history');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'repair-history');
    expect((await persist(userId, turn.leaseId, evidenceOperation(0, id('repair-history-source')))).status)
      .toBe('committed');
    await db.update(careerMapHistory)
      .set({ result: { corrupted: true } as never })
      .where(eq(careerMapHistory.userId, userId));
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded).toMatchObject({ status: 'repair-required', reason: 'history-mismatch' });
    await eraseOwner(userId);
  });

  it('fails closed when valid history provenance differs from the map receipt', async () => {
    const userId = owner('repair-provenance');
    await storage.getOrCreateCareerMap(userId);
    const [, confirmationTurn] = await persistCompletedSequence(userId, 'repair-provenance', [
      {
        type: 'propose-why',
        sourceId: id('repair-provenance-propose'),
        expectedRevision: 0,
        occurredAt: at(1),
        payload: {
          why: {
            id: id('repair-provenance-why'),
            revision: 1,
            statement: 'Make useful choices easier.',
            serves: 'People facing consequential choices',
            pointOfView: 'Evidence should create agency.',
          },
          presentation: presentation(1),
        },
      },
      {
        type: 'confirm-why',
        sourceId: id('repair-provenance-confirm'),
        expectedRevision: 1,
        occurredAt: at(2),
        payload: {
          whyId: id('repair-provenance-why'),
          whyRevision: 1,
          action: action(2),
        },
      },
    ]);
    if (!confirmationTurn) throw new Error('Confirmation fixture turn is missing.');
    await db.update(careerMapHistory)
      .set({
        confirmationProvenance: {
          kind: 'user-message',
          actionId: id('different-valid-action'),
          turnId: confirmationTurn.turnId,
          turnSequence: 2,
          occurredAt: at(2),
        },
      })
      .where(and(
        eq(careerMapHistory.userId, userId),
        eq(careerMapHistory.resultRevision, 2),
      ));

    expect(await storage.loadCareerMap(userId)).toMatchObject({
      status: 'repair-required',
      reason: 'history-mismatch',
    });
    await eraseOwner(userId);
  });

  it('fails closed when history module attribution differs from the map receipt', async () => {
    const userId = owner('repair-module-version');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'repair-module-version');
    expect((await persist(
      userId,
      turn.leaseId,
      evidenceOperation(0, id('repair-module-version-source')),
    )).status).toBe('committed');
    await db.update(careerMapHistory)
      .set({ moduleVersion: 'forged-module@9' })
      .where(eq(careerMapHistory.userId, userId));

    expect(await storage.loadCareerMap(userId)).toMatchObject({
      status: 'repair-required',
      reason: 'history-mismatch',
    });
    await eraseOwner(userId);
  });

  it('retries provider erasure from a non-content-bearing marker and leaves no Method orphan', async () => {
    const userId = owner('erasure');
    await storage.getOrCreateCareerMap(userId);
    const fixture = repeatingLearningFixture(userId, 31);
    await db.update(careerMaps).set({ schemaVersion: 2, revision: fixture.legacy.revision, document: fixture.legacy as never }).where(eq(careerMaps.userId, userId));
    await db.insert(careerMapHistory).values(fixture.baseline.operationHistory.map((receipt, index) => ({
      userId, operationSourceId: receipt.sourceId, operationType: receipt.operationType,
      payloadFingerprint: receipt.payloadFingerprint, baseRevision: index,
      resultRevision: receipt.resultRevision, result: receipt,
      confirmationProvenance: receipt.confirmationProvenance,
      moduleVersion: receipt.moduleVersion!, committedAt: new Date(receipt.committedAt),
    })));
    await persistCompletedSequence(userId, 'erasure-map', fixture.operations);
    const populated = await storage.loadCareerMap(userId);
    expect(populated.status).toBe('ready');
    if (populated.status !== 'ready') throw new Error('Erasure fixture must load before deletion.');
    expect(populated.map.schemaVersion).toBe(3);
    expect(populated.map.provisionalCommitment).toEqual(fixture.baseline.provisionalCommitment);
    expect(populated.map.proofRevisions).toEqual(fixture.baseline.proofRevisions);
    expect(populated.map.sideDoorSets).toEqual(fixture.baseline.sideDoorSets);
    expect(populated.map.routeOutcomes).toHaveLength(1);
    expect(populated.map.projects.at(-1)).toMatchObject({ briefFormat: 'simple-v1', relationship: 'unrelated', agreementStatus: 'accepted' });
    expect(populated.map.projectOptionSets.at(-1)?.basisAction?.sourceId).toBe(`${userId}-request-new-project-22`);
    expect(populated.map.reflections.at(-1)).toMatchObject({ status: 'closed', evidence: [expect.objectContaining({ signal: 'voluntary-pull' })] });
    expect(populated.map.continueChoices.at(-1)).toMatchObject({ scope: 'project', wantsToContinue: true });
    expect(populated.map.pathFocusCommitments).toHaveLength(1);
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(31);
    const turn = await beginTurn(userId, 'erasure-auxiliary');
    await storage.saveCareerMapDraft({ userId, leaseId: turn.leaseId, id: id('draft'), kind: 'outreach', content: { text: 'private draft' } });
    await storage.setConversationMapping(userId, turn.leaseId, id('conversation'));
    await storage.setConversationMapping(userId, turn.leaseId, id('conversation'));
    await expect(storage.setConversationMapping(userId, turn.leaseId, id('different-conversation')))
      .rejects.toBeInstanceOf(ConversationMappingConflictError);
    let attempts = 0;
    const providerTargets: string[] = [];
    const provider = { deleteConversationItemsAndConversation: async (conversationId: string) => {
      providerTargets.push(conversationId);
      attempts += 1;
      if (attempts === 1) throw new Error('provider unavailable');
    } };
    expect((await storage.eraseMethodData(userId, provider)).status).toBe('pending-provider');
    expect(await storage.loadCareerMap(userId)).toEqual({ status: 'not-found' });
    expect(await storage.getAgentTurn(userId, turn.clientMessageId)).toBeUndefined();
    expect(await db.select().from(agentTurns).where(eq(agentTurns.userId, userId))).toHaveLength(0);
    expect(await storage.getTurnLease(userId)).toBeUndefined();
    expect(await storage.getConversationMapping(userId)).toBeUndefined();
    expect(await storage.getMethodErasureJob(userId)).toMatchObject({ status: 'failed-provider' });
    const marker = await storage.getMethodErasureJob(userId);
    expect(Object.keys(marker!).sort()).toEqual([
      'conversationId', 'createdAt', 'errorClass', 'jobId', 'status', 'updatedAt', 'userId',
    ].sort());
    expect(await storage.auditCareerMapIntegrity()).toMatchObject({
      pendingErasureJobs: 1,
      zeroInvalid: false,
    });
    expect(await storage.getOrCreateCareerMap(userId)).toEqual({ status: 'erasure-pending' });
    expect((await storage.beginAgentTurn({
      userId,
      clientMessageId: id('erasure-blocked-message'),
      requestFingerprint: id('erasure-blocked-request'),
      turnId: id('erasure-blocked-turn'),
      leaseId: id('erasure-blocked-lease'),
    })).status).toBe('erasure-pending');
    expect((await storage.persistCareerMapOperation({
      userId,
      leaseId: id('erasure-blocked-lease'),
      context: {} as never,
      operation: evidenceOperation(0, id('erasure-blocked-operation')),
      moduleVersion: 'method-test@1',
    })).status).toBe('erasure-pending');
    await expect(storage.saveCareerMapDraft({
      userId, leaseId: id('erasure-blocked-lease'), id: id('erasure-blocked-draft'), kind: 'outreach', content: { text: 'blocked' },
    })).rejects.toBeInstanceOf(MethodErasurePendingError);
    await expect(storage.setConversationMapping(userId, id('erasure-blocked-lease'), id('erasure-blocked-conversation')))
      .rejects.toBeInstanceOf(MethodErasurePendingError);
    expect((await storage.eraseMethodData(userId, provider)).status).toBe('complete');
    expect(await storage.getMethodErasureJob(userId)).toBeUndefined();
    expect(attempts).toBe(2);
    expect(providerTargets).toEqual([id('conversation'), id('conversation')]);
    const [history, drafts, turns, leases, mappings, jobs] = await Promise.all([
      db.select().from(careerMapHistory).where(eq(careerMapHistory.userId, userId)),
      db.select().from(careerMapDrafts).where(eq(careerMapDrafts.userId, userId)),
      db.select().from(agentTurns).where(eq(agentTurns.userId, userId)),
      db.select().from(agentTurnLeases).where(eq(agentTurnLeases.userId, userId)),
      db.select().from(agentConversationMappings).where(eq(agentConversationMappings.userId, userId)),
      db.select().from(methodErasureJobs).where(eq(methodErasureJobs.userId, userId)),
    ]);
    expect([history, drafts, turns, leases, mappings, jobs]
      .every((rows) => rows.length === 0)).toBe(true);
  });

  it('preserves provider HTTP classification for operator retry policy', async () => {
    const userId = owner('erasure-provider-classification');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'erasure-provider-classification');
    await storage.setConversationMapping(userId, turn.leaseId, id('classified-conversation'));

    expect(await storage.eraseMethodData(userId, {
      deleteConversationItemsAndConversation: async () => {
        throw new ConversationHistoryProviderError('delete', 401);
      },
    })).toMatchObject({
      status: 'pending-provider',
      errorClass: 'ConversationHistoryProviderError',
      httpStatus: 401,
      retryable: false,
    });
    const firstGeneration = await storage.getMethodErasureJob(userId);
    expect(await storage.eraseMethodData(userId, {
      deleteConversationItemsAndConversation: async () => {
        throw new ConversationHistoryProviderError('delete', 503);
      },
    })).toMatchObject({
      status: 'pending-provider',
      errorClass: 'ConversationHistoryProviderError',
      httpStatus: 503,
      retryable: true,
    });
    const secondGeneration = await storage.getMethodErasureJob(userId);
    expect(secondGeneration?.jobId).not.toBe(firstGeneration?.jobId);
    expect(await storage.eraseMethodData(userId, {
      deleteConversationItemsAndConversation: async () => undefined,
    })).toEqual({ status: 'complete' });
  });

  it('runs dry-run and strict active-lease execution through the scoped disposable storage binding', async () => {
    const userId = owner('reset-dependencies');
    const email = `${userId}@example.test`;
    await storage.getOrCreateCareerMap(userId);
    await beginTurn(userId, 'reset-dependencies-active-lease');
    await storageTestPool.query('CREATE SCHEMA IF NOT EXISTS auth');
    await storageTestPool.query(`
      CREATE TABLE IF NOT EXISTS auth."user" (
        id text PRIMARY KEY,
        email text NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS auth."account" (
        id text PRIMARY KEY,
        "providerId" text NOT NULL,
        "accountId" text NOT NULL,
        "userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS auth."session" (
        id text PRIMARY KEY,
        "userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE
      )
    `);
    await storageTestPool.query('INSERT INTO auth."user" (id, email) VALUES ($1, $2)', [userId, email]);
    await storageTestPool.query(
      'INSERT INTO auth."account" (id, "providerId", "accountId", "userId") VALUES ($1, $2, $3, $4)',
      [id('reset-account'), 'google', id('google-account'), userId],
    );
    await storageTestPool.query('INSERT INTO auth."session" (id, "userId") VALUES ($1, $2)', [
      id('reset-session'), userId,
    ]);

    const resetRuntime = {
      nodeEnv: 'development',
      databaseUrl: storageTestConnectionString,
      authDatabaseUrl: storageTestConnectionString,
      betterAuthSecret: 't'.repeat(32),
      openAiApiKey: 'disposable-test-key',
    };
    const resources = await createMethodResetDependencies(resetRuntime, {
      createProvider: () => ({ deleteConversationItemsAndConversation: async () => undefined }),
    });
    try {
      expect(await resources.dependencies.resolveAuthTargets(email)).toEqual([{
        id: userId,
        email,
        accounts: [{ id: id('reset-account'), providerId: 'google', accountId: id('google-account') }],
        sessionCount: 1,
      }]);
      expect(await resources.dependencies.inspectMethodData(userId)).toMatchObject({
        careerMaps: 1,
        activeLeases: 1,
        expiredLeases: 0,
        erasureJobs: 0,
      });
      const expectedDatabase = databaseIdentity(storageTestConnectionString).canonicalEndpoint;
      const resetOptions = {
        environment: 'development' as const,
        email,
        expectedDatabase,
        execute: false,
        retries: 2,
      };
      const output: string[] = [];
      const dependencies = { ...resources.dependencies, write: (line: string) => output.push(line) };
      expect((await runMethodReset(resetOptions, resetRuntime, dependencies)).exitCode).toBe(0);
      const confirmation = output.find((line) => line.startsWith('Confirmation token: '))
        ?.slice('Confirmation token: '.length);
      expect(confirmation).toBeTruthy();
      expect((await runMethodReset(
        { ...resetOptions, execute: true, confirmation }, resetRuntime, dependencies,
      )).exitCode).toBe(1);
      expect(output.join('\n')).toContain('unexpired Method lease');
      expect((await storage.loadCareerMap(userId)).status).toBe('ready');
      expect(await storage.getMethodErasureJob(userId)).toBeUndefined();
    } finally {
      await resources.close();
      await storageTestPool.query('DELETE FROM auth."user" WHERE id = $1', [userId]);
    }
  });

  it('strict reset refuses an unexpired lease under the owner lock but ignores an expired lease', async () => {
    const userId = owner('strict-reset-active-lease');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'strict-reset-active-lease');
    let providerCalls = 0;
    const provider = {
      deleteConversationItemsAndConversation: async () => { providerCalls += 1; },
    };
    const inspected = await storage.inspectMethodDataState(userId);

    expect(await storage.eraseMethodData(userId, provider, {
      strictReset: true,
      expectedStateFingerprint: inspected.stateFingerprint,
    })).toEqual({
      status: 'active-lease',
    });
    expect((await storage.loadCareerMap(userId)).status).toBe('ready');
    expect(await storage.getAgentTurn(userId, turn.clientMessageId)).toBeDefined();
    expect(await storage.getMethodErasureJob(userId)).toBeUndefined();
    expect(providerCalls).toBe(0);

    now = new Date(now.getTime() + DEFAULT_TURN_LEASE_MS + 1);
    expect(await storage.eraseMethodData(userId, provider, {
      strictReset: true,
      expectedStateFingerprint: inspected.stateFingerprint,
    })).toEqual({
      status: 'complete',
    });
    expect((await storage.loadCareerMap(userId)).status).toBe('not-found');
  });

  it('holds the owner lock across the strict lease check and local reset', async () => {
    const userId = owner('strict-reset-race');
    await storage.getOrCreateCareerMap(userId);
    let checked!: () => void;
    let release!: () => void;
    const strictCheckReached = new Promise<void>((resolve) => { checked = resolve; });
    const continueReset = new Promise<void>((resolve) => { release = resolve; });
    const gated = new PostgresStorage({
      database: db,
      now: () => now,
      faultInjector: async (stage) => {
        if (stage === 'after-strict-reset-lease-check') {
          checked();
          await continueReset;
        }
      },
    });
    const inspected = await storage.inspectMethodDataState(userId);

    const reset = gated.eraseMethodData(userId, {
      deleteConversationItemsAndConversation: async () => undefined,
    }, {
      strictReset: true,
      expectedStateFingerprint: inspected.stateFingerprint,
    });
    await strictCheckReached;
    const competingTurn = storage.beginAgentTurn({
      userId,
      clientMessageId: id('strict-reset-race-message'),
      requestFingerprint: id('strict-reset-race-fingerprint'),
      turnId: id('strict-reset-race-turn'),
      leaseId: id('strict-reset-race-lease'),
    });
    let competingSettled = false;
    void competingTurn.then(() => { competingSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(competingSettled).toBe(false);
    release();

    expect(await reset).toEqual({ status: 'complete' });
    expect(await competingTurn).toEqual({ status: 'map-required' });
    expect(await storage.getTurnLease(userId)).toBeUndefined();
  });

  it('strict reset detects a same-count full-row mutation before deleting', async () => {
    const userId = owner('strict-reset-same-count-state');
    await storage.getOrCreateCareerMap(userId);
    const inspected = await storage.inspectMethodDataState(userId);
    await db.update(careerMaps).set({ updatedAt: new Date(now.getTime() + 1_000) })
      .where(eq(careerMaps.userId, userId));

    expect(await storage.eraseMethodData(userId, undefined, {
      strictReset: true,
      expectedStateFingerprint: inspected.stateFingerprint,
    })).toEqual({ status: 'state-changed' });
    expect((await storage.loadCareerMap(userId)).status).toBe('ready');
    expect(await storage.getMethodErasureJob(userId)).toBeUndefined();
  });

  it('strict reset detects a turn completed between inspection and the locked erase', async () => {
    const userId = owner('strict-reset-completed-turn');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'strict-reset-completed-turn');
    const inspected = await storage.inspectMethodDataState(userId);
    await storage.completeAgentTurn({
      userId,
      turnId: turn.turnId,
      leaseId: turn.leaseId,
      result: { outcome: 'completed-after-inspection' },
    });

    expect(await storage.eraseMethodData(userId, undefined, {
      strictReset: true,
      expectedStateFingerprint: inspected.stateFingerprint,
    })).toEqual({ status: 'state-changed' });
    expect((await storage.loadCareerMap(userId)).status).toBe('ready');
    expect(await storage.getMethodErasureJob(userId)).toBeUndefined();
  });

  it('recovers when provider deletion succeeds before local marker cleanup fails', async () => {
    const userId = owner('erasure-marker-cleanup');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'erasure-marker-cleanup');
    await storage.setConversationMapping(userId, turn.leaseId, id('erasure-marker-conversation'));
    let failMarkerDelete = true;
    const faulting = new PostgresStorage({
      database: db,
      now: () => now,
      faultInjector: (stage) => {
        if (stage === 'before-erasure-marker-delete' && failMarkerDelete) {
          failMarkerDelete = false;
          throw new Error('marker cleanup unavailable');
        }
      },
    });
    let providerCalls = 0;
    const idempotentProvider = {
      deleteConversationItemsAndConversation: async () => {
        providerCalls += 1;
        // The second invocation represents the provider's already-absent success path.
      },
    };
    expect(await faulting.eraseMethodData(userId, idempotentProvider)).toMatchObject({
      status: 'pending-provider',
      errorClass: 'Error',
    });
    expect(await storage.getMethodErasureJob(userId)).toMatchObject({ status: 'failed-provider' });
    expect((await faulting.eraseMethodData(userId, idempotentProvider)).status).toBe('complete');
    expect(providerCalls).toBe(2);
    expect(await storage.getMethodErasureJob(userId)).toBeUndefined();
    expect((await storage.getOrCreateCareerMap(userId)).status).toBe('ready');
  });

  it('generation-fences a late provider result from a newer erasure marker', async () => {
    const userId = owner('erasure-generation');
    await storage.getOrCreateCareerMap(userId);
    const firstTurn = await beginTurn(userId, 'erasure-generation-first');
    await storage.setConversationMapping(userId, firstTurn.leaseId, id('erasure-generation-conversation-1'));
    let providerStarted!: () => void;
    let releaseProvider!: () => void;
    const started = new Promise<void>((resolve) => { providerStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const lateFirstErasure = storage.eraseMethodData(userId, {
      deleteConversationItemsAndConversation: async () => {
        providerStarted();
        await release;
      },
    });
    await started;
    expect((await storage.eraseMethodData(userId, {
      deleteConversationItemsAndConversation: async () => undefined,
    })).status).toBe('complete');

    expect((await storage.getOrCreateCareerMap(userId)).status).toBe('ready');
    const secondTurn = await beginTurn(userId, 'erasure-generation-second');
    await storage.setConversationMapping(userId, secondTurn.leaseId, id('erasure-generation-conversation-2'));
    expect((await storage.eraseMethodData(userId, {
      deleteConversationItemsAndConversation: async () => { throw new Error('newer provider unavailable'); },
    })).status).toBe('pending-provider');
    const newerJob = await storage.getMethodErasureJob(userId);
    expect(newerJob).toMatchObject({ conversationId: id('erasure-generation-conversation-2') });

    releaseProvider();
    await lateFirstErasure;
    expect(await storage.getMethodErasureJob(userId)).toMatchObject({ jobId: newerJob?.jobId });
    expect(await storage.getOrCreateCareerMap(userId)).toEqual({ status: 'erasure-pending' });
    expect((await storage.eraseMethodData(userId, {
      deleteConversationItemsAndConversation: async () => undefined,
    })).status).toBe('complete');
  });

  it('reports a zero-invalid pre-pilot fixture audit', async () => {
    const userId = owner('integrity');
    await storage.getOrCreateCareerMap(userId);
    const audit = await storage.auditCareerMapIntegrity();
    expect(audit.invalidRecords).toEqual([]);
    expect(audit.orphanHistory).toBe(0);
    expect(audit.orphanDrafts).toBe(0);
    expect(audit.orphanTurns).toBe(0);
    expect(audit.orphanLeases).toBe(0);
    expect(audit.orphanConversationMappings).toBe(0);
    expect(audit.invalidLeases).toBe(0);
    expect(audit.pendingTurnsWithoutLease).toBe(0);
    expect(audit.pendingErasureJobs).toBe(0);
    expect(audit.zeroInvalid).toBe(true);
  });
});

describe('durable current-report project proceeding', () => {
  it('binds report and correction to owned turns, preserves reports, and replays without duplicate state', async () => {
    const userId = owner('work-report-provenance');
    const projectId = await seedPendingFirstProject(userId,'work-report-provenance');
    const turn = await beginTurn(userId,'work-report-current','agent-turn');
    const context = createAgentTurnPersistenceContext(turn,{turnSequence:6,occurredAt:at(6)});
    const operation: CareerMapOperation = {type:'report-project-work',sourceId:id('work-report'),expectedRevision:5,occurredAt:at(6),payload:{projectId,projectRevision:1,status:'completed',reportedActivity:'I finished the interviews.',action:context.action}};
    const input = {userId,leaseId:turn.leaseId,context,operation,moduleVersion:'report-test@1'};
    expect(await storage.persistCareerMapOperation({...input,operation:{...operation,payload:{...operation.payload,action:{...context.action,turnId:id('forged-report-turn')}}}})).toMatchObject({status:'rejected',error:{code:'invalid-operation'}});
    const controller = new AbortController();controller.abort();
    await expect(storage.persistCareerMapOperation({...input,abortSignal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
    expect(await storage.loadCareerMap(userId)).toMatchObject({status:'ready',map:{revision:5,projects:[expect.objectContaining({agreementStatus:'suggested',workStatus:'not-started'})]}});
    expect(await storage.persistCareerMapOperation(input)).toMatchObject({status:'committed',map:{revision:6,projects:[expect.objectContaining({agreementStatus:'accepted',workStatus:'completed',proceedingReport:{sourceId:operation.sourceId,projectId,projectRevision:1,action:context.action,reportedActivity:operation.payload.reportedActivity}})]}});
    expect(await storage.persistCareerMapOperation(input)).toMatchObject({status:'replayed',map:{revision:6}});
    await storage.completeAgentTurn({userId,turnId:turn.turnId,leaseId:turn.leaseId});
    const correctionTurn = await beginTurn(userId,'work-report-correction','agent-turn');
    const correctionContext = createAgentTurnPersistenceContext(correctionTurn,{turnSequence:7,occurredAt:at(7)});
    const correction: CareerMapOperation = {type:'correct-project-work-status',sourceId:id('work-report-correction'),expectedRevision:6,occurredAt:at(7),payload:{projectId,projectRevision:1,latestActionId:context.action.actionId,expectedStatus:'completed',status:'in-progress',reportedActivity:'I have one more interview to do.',action:correctionContext.action}};
    expect(await storage.persistCareerMapOperation({userId,leaseId:correctionTurn.leaseId,context:correctionContext,operation:correction,moduleVersion:'report-test@1'})).toMatchObject({status:'committed',map:{revision:7}});
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') throw new Error('Reported project did not load.');
    expect(loaded.map.projects[0].confirmation).toBeUndefined();
    expect(loaded.map.projects[0].acceptanceFraming).toBeUndefined();
    expect(loaded.map.projects[0].workUpdates).toEqual([
      {status:'completed',action:context.action,sourceId:operation.sourceId,reportedActivity:'I finished the interviews.'},
      {status:'in-progress',action:correctionContext.action,sourceId:correction.sourceId,reportedActivity:'I have one more interview to do.',correctsActionId:context.action.actionId},
    ]);
    expect(loaded.map.operationHistory).toHaveLength(7);
  });

  it('rolls back report-derived proceeding, progress and receipt together on a transaction failure', async () => {
    const userId=owner('work-report-rollback');
    const projectId=await seedPendingFirstProject(userId,'work-report-rollback');
    const before=await storage.loadCareerMap(userId);
    const turn=await beginTurn(userId,'work-report-rollback-current','agent-turn');
    const context=createAgentTurnPersistenceContext(turn,{turnSequence:6,occurredAt:at(6)});
    const faulting=new PostgresStorage({database:db,now:()=>now,faultInjector:(stage)=>{if(stage==='after-map-update-before-history')throw new Error('synthetic report transaction fault');}});
    await expect(faulting.persistCareerMapOperation({userId,leaseId:turn.leaseId,context,moduleVersion:'report-test@1',operation:{type:'report-project-work',sourceId:id('work-report-rollback-op'),expectedRevision:5,occurredAt:at(6),payload:{projectId,projectRevision:1,status:'in-progress',reportedActivity:'I arranged the first interview.',action:context.action}}})).rejects.toThrow('synthetic report transaction fault');
    expect(await storage.loadCareerMap(userId)).toEqual(before);
    expect(await db.select().from(careerMapHistory).where(eq(careerMapHistory.userId,userId))).toHaveLength(5);
  });
});

import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  cleanupStorageTestDatabases,
  storageTestDatabase as db,
} from './storage.test-database.js';
import {
  ConversationMappingConflictError,
  CareerMapRepairRequiredError,
  createAgentTurnPersistenceContext,
  createWorkspaceActionPersistenceContext,
  MethodErasurePendingError,
  PostgresStorage,
  ResearchAttemptConflictError,
  ResearchAttemptSourceError,
  TurnLeaseIdentityConflictError,
  TurnLeaseLostError,
  type StorageFaultStage,
} from './storage.js';
import { compileCareerMapBriefing } from './ai/briefing.js';
import {
  loadConversationHistory,
} from './ai/history.js';
import { createMethodModuleLoader } from './ai/method/loader.js';
import { NativeSearchEvidenceLedger } from './ai/research.js';
import { createMethodTools, executeWorkspaceTool, refreshMethodState } from './ai/tools.js';
import {
  agentConversationMappings,
  agentTurnLeases,
  agentTurns,
  careerMapDrafts,
  careerMapEvidenceAssociations,
  careerMapHistory,
  careerMapResearchAttempts,
  careerMaps,
  methodErasureJobs,
} from '../shared/schema.js';
import {
  normalizeResearchClaim,
  type CareerMapOperation,
  type PathProjectInput,
  type PurposePathInput,
  type ResearchAttempt,
  type SideDoorInput,
} from '../shared/career-map/index.js';

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

function paths(
  sourceUrl = 'https://example.com/path-source',
  includeValidatedSource = false,
): [PurposePathInput, PurposePathInput, PurposePathInput] {
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
    ...(number === 1 && includeValidatedSource ? {
      sources: [{
        kind: 'cited-research' as const,
        bindingVersion: 2 as const,
        sourceHandle: id('source-handle'),
        providerCallId: id('provider-call'),
        providerResultId: id('provider-result'),
        targetId: id('path-1'),
        targetRevision: 2,
        canonicalField: 'purposePath.practicalFit',
        exactClaim: 'Can start beside current work 1',
        url: sourceUrl,
        retrievedAt: at(3),
        title: 'Current public source',
        excerpt: 'Can start beside current work 1',
        support: 'server-validated' as const,
        citation: {
          start: 0,
          end: 31,
          exactClaimStart: 0,
          exactClaimEnd: 31,
          textHash: 'a'.repeat(64),
        },
      }],
    } : {}),
  })) as [PurposePathInput, PurposePathInput, PurposePathInput];
}

function amendedAttempt(input: {
  id: string;
  status: 'pending' | 'succeeded' | 'insufficient' | 'failed';
  targetId: string;
  targetRevision: number;
  sources?: NonNullable<PurposePathInput['sources']>;
  checkpoint?: 'form-foundation' | 'create-purpose-paths';
  errorClass?: string;
}) {
  return {
    schemaVersion: 2 as const,
    id: input.id,
    status: input.status,
    checkpoint: input.checkpoint ?? 'create-purpose-paths' as const,
    moduleVersion: 'method-test@1',
    targetId: input.targetId,
    targetRevision: input.targetRevision,
    attemptedAt: at(4),
    sources: input.sources ?? [],
    ...(input.errorClass ? { errorClass: input.errorClass } : {}),
  };
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
  const context = createWorkspaceActionPersistenceContext(turn, provenanceTiming(input.operation));
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
      expect(loaded.map.schemaVersion).toBe(2);
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

  it('round-trips cited map provenance and insufficient research attempts without making a proposal', async () => {
    const userId = owner('provenance');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'provenance');
    const basisOperations: CareerMapOperation[] = [
      {
        type: 'propose-why', sourceId: id('source-why-propose'), expectedRevision: 0, occurredAt: at(1),
        payload: { why: { id: id('why'), revision: 1, statement: 'I work to make complex choices humane.', serves: 'People facing important choices', pointOfView: 'Clarity should create agency.' }, presentation: presentation(1) },
      },
      {
        type: 'confirm-why', sourceId: id('source-why-confirm'), expectedRevision: 1, occurredAt: at(2),
        payload: { whyId: id('why'), whyRevision: 1, action: action(2) },
      },
    ];
    for (const operation of basisOperations) expect((await persist(userId, turn.leaseId, operation)).status).toBe('committed');
    const attempt = amendedAttempt({
      id: id('research-attempt'), status: 'succeeded', targetId: id('path-1'), targetRevision: 2,
      sources: paths(undefined, true)[0].sources,
    });
    const [validatedSource] = attempt.sources;
    if (!validatedSource || validatedSource.kind !== 'cited-research' || !('bindingVersion' in validatedSource)) {
      throw new Error('Missing amended cited source fixture.');
    }
    const insufficientSource = {
      ...validatedSource,
      support: 'cited-provenance' as const,
      sourceHandle: id('insufficient-source-handle'),
      providerResultId: id('insufficient-provider-result'),
      url: 'https://example.com/insufficient-source',
      title: 'An incomplete research result',
      excerpt: undefined,
    };
    const insufficientAttempt = amendedAttempt({
      id: id('insufficient-research-attempt'), status: 'insufficient', targetId: id('path-1'),
      targetRevision: 2, sources: [insufficientSource],
    });
    await expect(storage.recordResearchAttempt(userId, turn.leaseId, {
      ...attempt,
      id: id('unsupported-research-attempt'),
      sources: [{ ...validatedSource, sourceHandle: id('unsupported-source'), excerpt: undefined }],
    })).rejects.toThrow();
    expect(await storage.recordResearchAttempt(userId, turn.leaseId, attempt)).toEqual(attempt);
    expect(await storage.recordResearchAttempt(userId, turn.leaseId, insufficientAttempt)).toEqual(insufficientAttempt);
    const proposedPaths: CareerMapOperation = {
      type: 'propose-purpose-paths', sourceId: id('source-paths'), expectedRevision: 2, occurredAt: at(3),
      payload: { setId: id('path-set'), setRevision: 1, paths: paths(undefined, true), presentation: presentation(3) },
    };
    const insufficientlyGrounded = structuredClone(proposedPaths);
    if (insufficientlyGrounded.type === 'propose-purpose-paths') {
      insufficientlyGrounded.payload.paths[0].sources![0] = insufficientSource;
    }
    const insufficientlyGroundedResult = await persist(userId, turn.leaseId, insufficientlyGrounded);
    expect(insufficientlyGroundedResult.status).toBe('rejected');
    if (insufficientlyGroundedResult.status === 'rejected') {
      expect(insufficientlyGroundedResult.error.code).toBe('invalid-operation');
    }
    const fabricatedProvenance = structuredClone(proposedPaths);
    if (fabricatedProvenance.type === 'propose-purpose-paths') {
      fabricatedProvenance.payload.paths[0].sources![0] = {
        kind: 'cited-research',
        support: 'cited-provenance',
        sourceHandle: id('fabricated-provenance-handle'),
        url: 'https://example.com/fabricated-provenance',
        retrievedAt: at(3),
        title: 'Unresolved source',
      };
    }
    const fabricatedProvenanceResult = await persist(userId, turn.leaseId, fabricatedProvenance);
    expect(fabricatedProvenanceResult.status).toBe('rejected');
    if (fabricatedProvenanceResult.status === 'rejected') {
      expect(fabricatedProvenanceResult.error.code).toBe('invalid-operation');
    }
    const fabricated = structuredClone(proposedPaths);
    if (fabricated.type === 'propose-purpose-paths') {
      fabricated.payload.paths[0].sources![0] = {
        ...fabricated.payload.paths[0].sources![0],
        providerResultId: id('fabricated-result'),
      } as never;
    }
    const fabricatedResult = await persist(userId, turn.leaseId, fabricated);
    expect(fabricatedResult.status).toBe('rejected');
    if (fabricatedResult.status === 'rejected') expect(fabricatedResult.error.code).toBe('invalid-operation');
    expect((await persist(userId, turn.leaseId, proposedPaths)).status).toBe('committed');
    expect(await storage.listResearchSourceAssociations(userId)).toEqual([
      expect.objectContaining({
        userId,
        attemptId: attempt.id,
        turnId: turn.turnId,
        leaseId: turn.leaseId,
        operationSourceId: id('source-paths'),
        resultRevision: 3,
        sourceHandle: validatedSource.sourceHandle,
        association: expect.objectContaining({
          checkpoint: 'create-purpose-paths',
          canonicalField: 'purposePath.practicalFit',
          exactClaim: 'Can start beside current work 1',
          providerCallId: id('provider-call'),
          providerResultId: id('provider-result'),
          support: 'server-validated',
        }),
      }),
    ]);
    const [storedAssociation] = await db.select()
      .from(careerMapEvidenceAssociations)
      .where(eq(careerMapEvidenceAssociations.userId, userId));
    await db.update(careerMapEvidenceAssociations)
      .set({ association: { ...storedAssociation.association, checkpoint: 'form-foundation' } })
      .where(eq(careerMapEvidenceAssociations.id, storedAssociation.id));
    expect(await storage.auditCareerMapIntegrity()).toMatchObject({
      invalidRecords: expect.arrayContaining([{
        userId,
        reason: 'evidence-association-mismatch',
      }]),
      zeroInvalid: false,
    });
    await db.update(careerMapEvidenceAssociations)
      .set({ association: storedAssociation.association })
      .where(eq(careerMapEvidenceAssociations.id, storedAssociation.id));
    const [storedAttempt] = await db.select()
      .from(careerMapResearchAttempts)
      .where(and(
        eq(careerMapResearchAttempts.userId, userId),
        eq(careerMapResearchAttempts.id, attempt.id),
      ));
    const forgedModuleVersion = 'forged-method-module@9';
    await db.update(careerMapResearchAttempts)
      .set({ attempt: { ...attempt, moduleVersion: forgedModuleVersion } })
      .where(eq(careerMapResearchAttempts.id, storedAttempt.id));
    await db.update(careerMapEvidenceAssociations)
      .set({ association: { ...storedAssociation.association, moduleVersion: forgedModuleVersion } })
      .where(eq(careerMapEvidenceAssociations.id, storedAssociation.id));
    expect(await storage.auditCareerMapIntegrity()).toMatchObject({
      invalidRecords: expect.arrayContaining([{
        userId,
        reason: 'evidence-association-mismatch',
      }]),
      zeroInvalid: false,
    });
    await db.update(careerMapResearchAttempts)
      .set({ attempt: storedAttempt.attempt })
      .where(eq(careerMapResearchAttempts.id, storedAttempt.id));
    await db.update(careerMapEvidenceAssociations)
      .set({ association: storedAssociation.association })
      .where(eq(careerMapEvidenceAssociations.id, storedAssociation.id));
    expect(await storage.recordResearchAttempt(userId, turn.leaseId, attempt)).toEqual(attempt);
    await expect(storage.recordResearchAttempt(userId, turn.leaseId, {
      ...attempt,
      status: 'insufficient',
    })).rejects.toThrow('Research attempt identity was reused');
    const otherUserId = owner('provenance-other');
    await storage.getOrCreateCareerMap(otherUserId);
    const otherTurn = await beginTurn(otherUserId, 'provenance-other');
    expect((await persist(otherUserId, otherTurn.leaseId, {
      ...basisOperations[0], sourceId: id('other-why-propose'), expectedRevision: 0,
    })).status).toBe('committed');
    expect((await persist(otherUserId, otherTurn.leaseId, {
      ...basisOperations[1], sourceId: id('other-why-confirm'), expectedRevision: 1,
    })).status).toBe('committed');
    const crossUserSource = await persist(otherUserId, otherTurn.leaseId, {
      ...proposedPaths,
      sourceId: id('other-source-paths'),
    });
    expect(crossUserSource.status).toBe('rejected');
    if (crossUserSource.status === 'rejected') expect(crossUserSource.error.code).toBe('invalid-operation');
    expect(await storage.listResearchAttempts(userId)).toEqual([attempt, insufficientAttempt]);
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') expect(loaded.map.pathSets[0].paths[0].sources?.[0]).toEqual(attempt.sources[0]);
    const history = await storage.listCareerMapHistory(userId);
    expect(history[1].confirmationProvenance).toEqual({
      kind: 'ui-action',
      actionId: turn.clientMessageId,
      turnId: turn.turnId,
      turnSequence: 2,
      occurredAt: at(2),
    });
    await db.delete(careerMapResearchAttempts).where(eq(careerMapResearchAttempts.userId, userId));
    expect(await storage.loadCareerMap(userId)).toMatchObject({
      status: 'repair-required',
      reason: 'evidence-association-mismatch',
    });
    await eraseOwner(userId);
  });

  it('authorizes only an exact normalized member of the purpose-path evidence field', async () => {
    const userId = owner('research-evidence-array');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'research-evidence-array');
    expect((await persist(userId, turn.leaseId, {
      type: 'propose-why', sourceId: id('evidence-array-why-propose'), expectedRevision: 0, occurredAt: at(1),
      payload: { why: { id: id('evidence-array-why'), revision: 1, statement: 'Make career evidence usable.', serves: 'People testing a next move', pointOfView: 'Exact evidence should remain attributable.' }, presentation: presentation(1) },
    })).status).toBe('committed');
    expect((await persist(userId, turn.leaseId, {
      type: 'confirm-why', sourceId: id('evidence-array-why-confirm'), expectedRevision: 1, occurredAt: at(2),
      payload: { whyId: id('evidence-array-why'), whyRevision: 1, action: action(2) },
    })).status).toBe('committed');

    const exactClaim = 'Café apprenticeship evidence';
    const source = (suffix: string, canonicalField: string, claim: string) => ({
      kind: 'cited-research' as const,
      bindingVersion: 2 as const,
      sourceHandle: id(`evidence-array-handle-${suffix}`),
      providerCallId: id(`evidence-array-call-${suffix}`),
      providerResultId: id(`evidence-array-result-${suffix}`),
      targetId: id('path-1'),
      targetRevision: 2,
      canonicalField,
      exactClaim: claim,
      url: `https://example.com/evidence-array/${suffix}`,
      retrievedAt: at(3),
      title: `Evidence array source ${suffix}`,
      excerpt: claim,
      support: 'server-validated' as const,
      citation: {
        start: 0,
        end: claim.length,
        exactClaimStart: 0,
        exactClaimEnd: claim.length,
        textHash: 'd'.repeat(64),
      },
    });
    const exactEvidenceSource = source('exact', 'purposePath.evidence', exactClaim);
    const nonmemberSource = source('nonmember', 'purposePath.evidence', 'Absent evidence');
    const arbitraryArraySource = source('arbitrary-array', 'purposePath.sources', exactClaim);
    const wrongFieldSource = source('wrong-field', 'purposePath.projectPreview', exactClaim);
    for (const [suffix, citedSource] of [
      ['exact', exactEvidenceSource],
      ['nonmember', nonmemberSource],
      ['arbitrary-array', arbitraryArraySource],
      ['wrong-field', wrongFieldSource],
    ] as const) {
      await storage.recordResearchAttempt(userId, turn.leaseId, amendedAttempt({
        id: id(`evidence-array-attempt-${suffix}`),
        status: 'succeeded',
        targetId: id('path-1'),
        targetRevision: 2,
        sources: [citedSource],
      }));
    }

    const operationWith = (suffix: string, citedSource: typeof exactEvidenceSource): CareerMapOperation => {
      const candidatePaths = paths();
      candidatePaths[0] = {
        ...candidatePaths[0],
        evidence: ['Cafe\u0301 apprenticeship evidence', 'A separate firsthand observation'],
        sources: [citedSource],
      };
      return {
        type: 'propose-purpose-paths',
        sourceId: id(`evidence-array-paths-${suffix}`),
        expectedRevision: 2,
        occurredAt: at(3),
        payload: {
          setId: id(`evidence-array-set-${suffix}`),
          setRevision: 1,
          paths: candidatePaths,
          presentation: presentation(3),
        },
      };
    };
    for (const [suffix, citedSource] of [
      ['nonmember', nonmemberSource],
      ['arbitrary-array', arbitraryArraySource],
      ['wrong-field', wrongFieldSource],
    ] as const) {
      const rejected = await persist(userId, turn.leaseId, operationWith(suffix, citedSource));
      expect(rejected.status).toBe('rejected');
      if (rejected.status === 'rejected') expect(rejected.error.code).toBe('invalid-operation');
    }

    expect((await persist(
      userId,
      turn.leaseId,
      operationWith('exact', exactEvidenceSource),
    )).status).toBe('committed');
    expect(await storage.listResearchSourceAssociations(userId)).toEqual([
      expect.objectContaining({
        sourceHandle: exactEvidenceSource.sourceHandle,
        association: expect.objectContaining({
          canonicalField: 'purposePath.evidence',
          exactClaim,
        }),
      }),
    ]);
  });

  it.each(['changed-field', 'wrong-parent', 'wrong-target-revision'] as const)(
    'fails load and integrity validation when a v2 evidence association has a %s corruption',
    async (scenario) => {
      const userId = owner(`research-load-association-${scenario}`);
      await storage.getOrCreateCareerMap(userId);
      const turn = await beginTurn(userId, `research-load-association-${scenario}`);
      expect((await persist(userId, turn.leaseId, {
        type: 'propose-why',
        sourceId: id(`research-load-association-${scenario}-why-propose`),
        expectedRevision: 0,
        occurredAt: at(1),
        payload: {
          why: {
            id: id(`research-load-association-${scenario}-why`),
            revision: 1,
            statement: 'Make exact career evidence usable.',
            serves: 'People testing a next move',
            pointOfView: 'Durable provenance must remain bound to canonical truth.',
          },
          presentation: presentation(1),
        },
      })).status).toBe('committed');
      expect((await persist(userId, turn.leaseId, {
        type: 'confirm-why',
        sourceId: id(`research-load-association-${scenario}-why-confirm`),
        expectedRevision: 1,
        occurredAt: at(2),
        payload: {
          whyId: id(`research-load-association-${scenario}-why`),
          whyRevision: 1,
          action: action(2),
        },
      })).status).toBe('committed');

      const candidatePaths = paths();
      const exactClaim = normalizeResearchClaim(candidatePaths[0].evidence[0]);
      const source = {
        kind: 'cited-research' as const,
        bindingVersion: 2 as const,
        sourceHandle: id(`research-load-association-${scenario}-handle`),
        providerCallId: id(`research-load-association-${scenario}-call`),
        providerResultId: id(`research-load-association-${scenario}-result`),
        targetId: candidatePaths[0].id,
        targetRevision: 2,
        canonicalField: 'purposePath.evidence',
        exactClaim,
        url: `https://example.com/research-load-association/${scenario}`,
        retrievedAt: at(3),
        title: `Research load association ${scenario}`,
        excerpt: exactClaim,
        support: 'server-validated' as const,
        citation: {
          start: 0,
          end: exactClaim.length,
          exactClaimStart: 0,
          exactClaimEnd: exactClaim.length,
          textHash: 'e'.repeat(64),
        },
      };
      candidatePaths[0].sources = [source];
      const attempt = amendedAttempt({
        id: id(`research-load-association-${scenario}-attempt`),
        status: 'succeeded',
        targetId: candidatePaths[0].id,
        targetRevision: 2,
        sources: [source],
      });
      await storage.recordResearchAttempt(userId, turn.leaseId, attempt);
      expect((await persist(userId, turn.leaseId, {
        type: 'propose-purpose-paths',
        sourceId: id(`research-load-association-${scenario}-paths`),
        expectedRevision: 2,
        occurredAt: at(3),
        payload: {
          setId: id(`research-load-association-${scenario}-set`),
          setRevision: 1,
          paths: candidatePaths,
          presentation: presentation(3),
        },
      })).status).toBe('committed');

      const loaded = await storage.loadCareerMap(userId);
      expect(loaded.status).toBe('ready');
      if (loaded.status !== 'ready') return;
      const corrupted = structuredClone(loaded.map);
      const [firstPath, secondPath] = corrupted.pathSets[0].paths;
      const [persistedSource] = firstPath.sources ?? [];
      if (!persistedSource || persistedSource.kind !== 'cited-research'
        || !('bindingVersion' in persistedSource) || persistedSource.bindingVersion !== 2
      ) throw new Error('Missing v2 cited source fixture.');

      if (scenario === 'changed-field') {
        firstPath.evidence[0] = 'The cited canonical evidence was changed after commit.';
      } else if (scenario === 'wrong-parent') {
        firstPath.sources = [];
        secondPath.sources = [persistedSource];
      } else {
        persistedSource.targetRevision = 1;
        const revisedAttempt = {
          ...attempt,
          targetRevision: 1,
          sources: [{ ...attempt.sources[0], targetRevision: 1 }],
        };
        await db.update(careerMapResearchAttempts)
          .set({ attempt: revisedAttempt })
          .where(and(
            eq(careerMapResearchAttempts.userId, userId),
            eq(careerMapResearchAttempts.id, attempt.id),
          ));
        const [associationRow] = await db.select()
          .from(careerMapEvidenceAssociations)
          .where(eq(careerMapEvidenceAssociations.userId, userId));
        await db.update(careerMapEvidenceAssociations)
          .set({
            association: {
              ...associationRow.association,
              targetRevision: 1,
            },
          })
          .where(eq(careerMapEvidenceAssociations.id, associationRow.id));
      }
      await db.update(careerMaps)
        .set({ document: corrupted })
        .where(eq(careerMaps.userId, userId));

      expect(await storage.loadCareerMap(userId)).toMatchObject({
        status: 'repair-required',
        reason: 'evidence-association-mismatch',
      });
      expect(await storage.auditCareerMapIntegrity()).toMatchObject({
        invalidRecords: expect.arrayContaining([{
          userId,
          reason: 'evidence-association-mismatch',
        }]),
        zeroInvalid: false,
      });
      await eraseOwner(userId);
    },
  );

  it('dual-reads and temporarily accepts predecessor attempts during expand-contract rollout', async () => {
    const userId = owner('research-expand-contract');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'research-expand-contract');
    const legacyAttempt = {
      id: id('legacy-research-attempt'),
      status: 'failed' as const,
      queryCategory: 'purpose-path-practical-fit',
      attemptedAt: at(),
      sources: [],
      errorClass: 'ProviderFailure',
    };
    await db.insert(careerMapResearchAttempts).values({
      id: legacyAttempt.id,
      userId,
      turnId: turn.turnId,
      leaseId: turn.leaseId,
      attempt: legacyAttempt,
    });

    expect(await storage.listResearchAttempts(userId)).toEqual([legacyAttempt]);
    expect((await storage.loadCareerMap(userId)).status).toBe('ready');
    await expect(storage.recordResearchAttempt(userId, turn.leaseId, legacyAttempt)).resolves.toEqual(legacyAttempt);

    const newLegacyAttempt = {
      ...legacyAttempt,
      id: id('new-legacy-research-attempt'),
      queryCategory: 'current-predecessor-writer',
    };
    await expect(storage.recordResearchAttempt(userId, turn.leaseId, newLegacyAttempt)).resolves.toEqual(newLegacyAttempt);
    await expect(storage.recordResearchAttempt(userId, turn.leaseId, {
      ...newLegacyAttempt,
      errorClass: 'ChangedPayload',
    })).rejects.toBeInstanceOf(ResearchAttemptConflictError);
    expect(await storage.listResearchSourceAssociations(userId)).toEqual([]);
  });

  it('keeps predecessor source authorization isolated from v2 exact associations', async () => {
    const userId = owner('research-expand-contract-source');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'research-expand-contract-source');
    expect((await persist(userId, turn.leaseId, {
      type: 'propose-why', sourceId: id('legacy-source-why-propose'), expectedRevision: 0, occurredAt: at(1),
      payload: { why: { id: id('legacy-source-why'), revision: 1, statement: 'Keep rollout evidence usable.', serves: 'Returning explorers', pointOfView: 'Compatibility must not weaken new proof.' }, presentation: presentation(1) },
    })).status).toBe('committed');
    expect((await persist(userId, turn.leaseId, {
      type: 'confirm-why', sourceId: id('legacy-source-why-confirm'), expectedRevision: 1, occurredAt: at(2),
      payload: { whyId: id('legacy-source-why'), whyRevision: 1, action: action(2) },
    })).status).toBe('committed');

    const legacySource = {
      kind: 'cited-research' as const,
      sourceHandle: id('legacy-source-handle'),
      providerResultId: id('legacy-provider-result'),
      url: 'https://example.com/legacy-source',
      retrievedAt: at(3),
      title: 'Predecessor source',
      excerpt: 'Current predecessor writer evidence.',
      support: 'server-validated' as const,
    };
    await storage.recordResearchAttempt(userId, turn.leaseId, {
      id: id('legacy-source-attempt'),
      status: 'succeeded',
      queryCategory: 'purpose-path-practical-fit',
      attemptedAt: at(3),
      sources: [legacySource],
    });

    const v2Paths = paths(undefined, true);
    const legacyAttemptCannotAuthorizeV2 = await persist(userId, turn.leaseId, {
      type: 'propose-purpose-paths', sourceId: id('legacy-attempt-v2-source'), expectedRevision: 2, occurredAt: at(3),
      payload: { setId: id('legacy-attempt-v2-set'), setRevision: 1, paths: v2Paths, presentation: presentation(3) },
    });
    expect(legacyAttemptCannotAuthorizeV2.status).toBe('rejected');

    const v2Attempt = amendedAttempt({
      id: id('v2-attempt-for-cross-format-negative'),
      status: 'succeeded',
      targetId: id('path-1'),
      targetRevision: 2,
      sources: v2Paths[0].sources,
    });
    await storage.recordResearchAttempt(userId, turn.leaseId, v2Attempt);
    const v2Source = v2Attempt.sources[0];
    const legacyCounterpart = {
      kind: 'cited-research' as const,
      sourceHandle: v2Source.sourceHandle,
      providerResultId: v2Source.providerResultId,
      url: v2Source.url,
      retrievedAt: v2Source.retrievedAt,
      ...(v2Source.title ? { title: v2Source.title } : {}),
      ...(v2Source.excerpt ? { excerpt: v2Source.excerpt } : {}),
      support: v2Source.support,
    };
    const counterpartPaths = paths();
    counterpartPaths[0].sources = [legacyCounterpart];
    const v2AttemptCannotAuthorizeLegacy = await persist(userId, turn.leaseId, {
      type: 'propose-purpose-paths', sourceId: id('v2-attempt-legacy-source'), expectedRevision: 2, occurredAt: at(3),
      payload: { setId: id('v2-attempt-legacy-set'), setRevision: 1, paths: counterpartPaths, presentation: presentation(3) },
    });
    expect(v2AttemptCannotAuthorizeLegacy.status).toBe('rejected');

    const legacyPaths = paths();
    legacyPaths[0].sources = [legacySource];
    expect((await persist(userId, turn.leaseId, {
      type: 'propose-purpose-paths', sourceId: id('legacy-source-paths'), expectedRevision: 2, occurredAt: at(3),
      payload: { setId: id('legacy-source-set'), setRevision: 1, paths: legacyPaths, presentation: presentation(3) },
    })).status).toBe('committed');
    expect(await storage.listResearchSourceAssociations(userId)).toEqual([]);
    expect(await storage.loadCareerMap(userId)).toMatchObject({ status: 'ready', map: { revision: 3 } });
  });

  it('loads predecessor maps with the source volume and title lengths accepted before U4', async () => {
    const userId = owner('legacy-source-volume');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'legacy-source-volume');
    expect((await persist(userId, turn.leaseId, {
      type: 'propose-why', sourceId: id('legacy-volume-why-propose'), expectedRevision: 0, occurredAt: at(1),
      payload: { why: { id: id('legacy-volume-why'), revision: 1, statement: 'Preserve trusted history.', serves: 'Returning explorers', pointOfView: 'Rollouts must read predecessor data.' }, presentation: presentation(1) },
    })).status).toBe('committed');
    expect((await persist(userId, turn.leaseId, {
      type: 'confirm-why', sourceId: id('legacy-volume-why-confirm'), expectedRevision: 1, occurredAt: at(2),
      payload: { whyId: id('legacy-volume-why'), whyRevision: 1, action: action(2) },
    })).status).toBe('committed');
    expect((await persist(userId, turn.leaseId, {
      type: 'propose-purpose-paths', sourceId: id('legacy-volume-paths'), expectedRevision: 2, occurredAt: at(3),
      payload: { setId: id('legacy-volume-set'), setRevision: 1, paths: paths(), presentation: presentation(3) },
    })).status).toBe('committed');

    const legacySources = Array.from({ length: 16 }, (_, index) => ({
      kind: 'cited-research' as const,
      sourceHandle: id(`legacy-volume-source-${index}`),
      providerResultId: id(`legacy-volume-result-${index}`),
      url: `https://example.com/legacy-volume/${index}`,
      retrievedAt: at(3),
      title: index === 0 ? 't'.repeat(600) : `Legacy title ${index}`,
      excerpt: `Legacy support ${index}`,
      support: 'server-validated' as const,
    }));
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') throw new Error('Legacy source fixture map did not load.');
    const predecessorMap = structuredClone(loaded.map);
    predecessorMap.pathSets[0].paths[0].sources = legacySources;
    await db.update(careerMaps)
      .set({ document: predecessorMap })
      .where(eq(careerMaps.userId, userId));
    await db.insert(careerMapResearchAttempts).values({
      id: id('legacy-volume-attempt'),
      userId,
      turnId: turn.turnId,
      leaseId: turn.leaseId,
      attempt: {
        id: id('legacy-volume-attempt'),
        status: 'succeeded',
        queryCategory: 'purpose-path-practical-fit',
        attemptedAt: at(3),
        sources: legacySources,
      },
    });

    const predecessorLoad = await storage.loadCareerMap(userId);
    expect(predecessorLoad.status).toBe('ready');
    if (predecessorLoad.status === 'ready') {
      expect(predecessorLoad.map.pathSets[0].paths[0].sources).toEqual(legacySources);
    }
    expect(await storage.auditCareerMapIntegrity()).toMatchObject({ zeroInvalid: true });
  });

  it('rolls back map, history, and exact association together on a sourced-write fault', async () => {
    const userId = owner('sourced-atomic-fault');
    const faultingStorage = new PostgresStorage({
      database: db,
      now: () => now,
      faultInjector: (stage) => {
        if (stage === 'after-evidence-association-before-history') throw new Error('injected association fault');
      },
    });
    await faultingStorage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'sourced-atomic-fault');
    expect((await persist(userId, turn.leaseId, {
      type: 'propose-why', sourceId: id('atomic-why-propose'), expectedRevision: 0, occurredAt: at(1),
      payload: { why: { id: id('atomic-why'), revision: 1, statement: 'Make choices humane.', serves: 'People choosing', pointOfView: 'Evidence should help.' }, presentation: presentation(1) },
    })).status).toBe('committed');
    expect((await persist(userId, turn.leaseId, {
      type: 'confirm-why', sourceId: id('atomic-why-confirm'), expectedRevision: 1, occurredAt: at(2),
      payload: { whyId: id('atomic-why'), whyRevision: 1, action: action(2) },
    })).status).toBe('committed');
    const sourcedPaths = paths(undefined, true);
    await storage.recordResearchAttempt(userId, turn.leaseId, amendedAttempt({
      id: id('atomic-research'), status: 'succeeded', targetId: id('path-1'),
      targetRevision: 2, sources: sourcedPaths[0].sources,
    }));
    const operation: CareerMapOperation = {
      type: 'propose-purpose-paths', sourceId: id('atomic-paths'), expectedRevision: 2, occurredAt: at(3),
      payload: { setId: id('atomic-path-set'), setRevision: 1, paths: sourcedPaths, presentation: presentation(3) },
    };

    await expect(faultingStorage.persistCareerMapOperation(await boundPersistenceInput({
      userId, leaseId: turn.leaseId, operation, moduleVersion: 'method-test@1',
    }))).rejects.toThrow('injected association fault');
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(2);
    expect(await storage.listResearchSourceAssociations(userId)).toEqual([]);
    expect(await storage.loadCareerMap(userId)).toMatchObject({ status: 'ready', map: { revision: 2 } });
  });

  it('rolls back attempts and sourced writes when the request aborts at the final local fence', async () => {
    const userId = owner('abort-fence');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'abort-fence');
    expect((await persist(userId, turn.leaseId, {
      type: 'propose-why', sourceId: id('abort-why-propose'), expectedRevision: 0, occurredAt: at(1),
      payload: { why: { id: id('abort-why'), revision: 1, statement: 'Keep cancellation truthful.', serves: 'People waiting for a result', pointOfView: 'Aborted work must not become canonical.' }, presentation: presentation(1) },
    })).status).toBe('committed');
    expect((await persist(userId, turn.leaseId, {
      type: 'confirm-why', sourceId: id('abort-why-confirm'), expectedRevision: 1, occurredAt: at(2),
      payload: { whyId: id('abort-why'), whyRevision: 1, action: action(2) },
    })).status).toBe('committed');

    const sourcedPaths = paths(undefined, true);
    const durableAttempt = amendedAttempt({
      id: id('abort-durable-attempt'), status: 'succeeded', targetId: id('path-1'),
      targetRevision: 2, sources: sourcedPaths[0].sources,
    });
    await storage.recordResearchAttempt(userId, turn.leaseId, durableAttempt);
    const writeAbort = new AbortController();
    const abortingWriteStorage = new PostgresStorage({
      database: db,
      now: () => now,
      faultInjector: (stage) => {
        if (stage === 'before-commit') writeAbort.abort();
      },
    });
    const sourcedOperation: CareerMapOperation = {
      type: 'propose-purpose-paths', sourceId: id('abort-paths'), expectedRevision: 2, occurredAt: at(3),
      payload: { setId: id('abort-path-set'), setRevision: 1, paths: sourcedPaths, presentation: presentation(3) },
    };
    await expect(abortingWriteStorage.persistCareerMapOperation({
      ...await boundPersistenceInput({
        userId, leaseId: turn.leaseId, operation: sourcedOperation, moduleVersion: 'method-test@1',
      }),
      abortSignal: writeAbort.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });

    const attemptAbort = new AbortController();
    const abortingAttemptStorage = new PostgresStorage({
      database: db,
      now: () => now,
      faultInjector: (stage) => {
        if (stage === 'before-research-attempt-insert') attemptAbort.abort();
      },
    });
    await expect(abortingAttemptStorage.recordResearchAttempt(userId, turn.leaseId, amendedAttempt({
      id: id('abort-withheld-attempt'),
      status: 'failed',
      targetId: id('abort-withheld-target'),
      targetRevision: 2,
      errorClass: 'ProviderCancelled',
    }), attemptAbort.signal)).rejects.toMatchObject({ name: 'AbortError' });

    expect(await storage.listResearchAttempts(userId)).toEqual([durableAttempt]);
    expect(await storage.listResearchSourceAssociations(userId)).toEqual([]);
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(2);
    expect(await storage.loadCareerMap(userId)).toMatchObject({ status: 'ready', map: { revision: 2 } });
    expect(await storage.getAgentTurn(userId, turn.clientMessageId)).toMatchObject({ status: 'pending' });
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
    const waitingAttempt = storage.recordResearchAttempt(userId, turn.leaseId, amendedAttempt({
      id: id('abort-lock-waiting-attempt'),
      status: 'failed',
      targetId: id('abort-lock-target'),
      targetRevision: 0,
      checkpoint: 'form-foundation',
      errorClass: 'ProviderCancelled',
    }), waitingAbort.signal);
    waitingAbort.abort();
    await expect(waitingAttempt).rejects.toMatchObject({ name: 'AbortError' });

    blockingAbort.abort();
    releaseFence();
    await expect(blockingWrite).rejects.toMatchObject({ name: 'AbortError' });
    expect(await storage.listResearchAttempts(userId)).toEqual([]);
    expect(await storage.listResearchSourceAssociations(userId)).toEqual([]);
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

  it('binds user-supplied sources to server provenance and keeps them out of research attempts', async () => {
    const userId = owner('user-source-boundary');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'user-source-boundary', 'agent-turn');
    const proposalContext = createAgentTurnPersistenceContext(turn, {
      turnSequence: 1,
      occurredAt: at(1),
    });
    expect((await storage.persistCareerMapOperation({
      userId, leaseId: turn.leaseId, context: proposalContext,
      operation: {
        type: 'propose-why', sourceId: id('user-source-why-propose'), expectedRevision: 0, occurredAt: at(1),
        payload: {
          why: {
            id: id('user-source-why'), revision: 1, statement: 'Make useful inquiry possible.',
            serves: 'People facing unclear choices', pointOfView: 'Firsthand evidence should guide action.',
          },
          presentation: proposalContext.presentation,
        },
      },
      moduleVersion: 'method-test@1',
    })).status).toBe('committed');
    await storage.completeAgentTurn({ userId, turnId: turn.turnId, leaseId: turn.leaseId });
    const confirmationTurn = await beginTurn(userId, 'user-source-confirm', 'workspace-action');
    const confirmationContext = createWorkspaceActionPersistenceContext(confirmationTurn, {
      turnSequence: 2,
      occurredAt: at(2),
    });
    expect((await storage.persistCareerMapOperation({
      userId, leaseId: confirmationTurn.leaseId, context: confirmationContext,
      operation: {
        type: 'confirm-why', sourceId: id('user-source-why-confirm'), expectedRevision: 1, occurredAt: at(2),
        payload: { whyId: id('user-source-why'), whyRevision: 1, action: confirmationContext.action },
      },
      moduleVersion: 'method-test@1',
    })).status).toBe('committed');

    await storage.completeAgentTurn({
      userId, turnId: confirmationTurn.turnId, leaseId: confirmationTurn.leaseId,
    });
    const sourceTurn = await beginTurn(userId, 'user-source-paths', 'agent-turn');
    const sourceContext = createAgentTurnPersistenceContext(sourceTurn, {
      turnSequence: 3,
      occurredAt: at(3),
    });
    const safeUserSource = {
      kind: 'user-supplied-source' as const,
      label: 'Explorer-provided professional association page',
      url: 'https://example.com/explorer-source',
      recordedBy: sourceContext.action,
    };
    await expect(storage.recordResearchAttempt(userId, sourceTurn.leaseId, {
      id: id('user-source-smuggled-research'), status: 'succeeded', queryCategory: 'purpose-path',
      attemptedAt: at(3), sources: [safeUserSource],
    })).rejects.toBeInstanceOf(ResearchAttemptSourceError);

    const sourcedPaths = paths();
    sourcedPaths[0].sources = [safeUserSource];
    const sourceOperation: CareerMapOperation = {
      type: 'propose-purpose-paths', sourceId: id('user-source-paths'), expectedRevision: 2, occurredAt: at(3),
      payload: {
        setId: id('user-source-path-set'), setRevision: 1,
        paths: sourcedPaths, presentation: sourceContext.presentation,
      },
    };

    const forgedRecordedBy = structuredClone(sourceOperation);
    if (forgedRecordedBy.type !== 'propose-purpose-paths') throw new Error('Unexpected fixture operation.');
    const forgedSource = forgedRecordedBy.payload.paths[0].sources?.[0];
    if (!forgedSource || forgedSource.kind !== 'user-supplied-source') throw new Error('Missing user source fixture.');
    forgedSource.recordedBy = { ...sourceContext.action, actionId: id('forged-user-source-action') };
    const forgedResult = await storage.persistCareerMapOperation({
      userId, leaseId: sourceTurn.leaseId, context: sourceContext,
      operation: forgedRecordedBy, moduleVersion: 'method-test@1',
    });
    expect(forgedResult.status).toBe('rejected');

    for (const [scheme, url] of [
      ['javascript', 'javascript:alert(1)'],
      ['http', 'http://example.com/insecure'],
      ['file', 'file:///tmp/private-source'],
      ['ftp', 'ftp://example.com/source'],
    ]) {
      const unsafeUrl = structuredClone(sourceOperation);
      if (unsafeUrl.type !== 'propose-purpose-paths') throw new Error('Unexpected fixture operation.');
      const unsafeSource = unsafeUrl.payload.paths[0].sources?.[0];
      if (!unsafeSource || unsafeSource.kind !== 'user-supplied-source') throw new Error('Missing user source fixture.');
      unsafeSource.url = url;
      unsafeUrl.sourceId = id(`user-source-unsafe-${scheme}`);
      const unsafeResult = await storage.persistCareerMapOperation({
        userId, leaseId: sourceTurn.leaseId, context: sourceContext,
        operation: unsafeUrl, moduleVersion: 'method-test@1',
      });
      expect(unsafeResult.status).toBe('rejected');
    }

    expect((await storage.persistCareerMapOperation({
      userId, leaseId: sourceTurn.leaseId, context: sourceContext,
      operation: sourceOperation, moduleVersion: 'method-test@1',
    })).status).toBe('committed');
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') {
      expect(loaded.map.pathSets[0].paths[0].sources).toEqual([safeUserSource]);
      expect(compileCareerMapBriefing(loaded.map).markdown)
        .toContain('Explorer-provided source: Explorer-provided professional association page');
    }
    expect(await storage.listResearchAttempts(userId)).toEqual([]);
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(3);
  });

  it('preserves an exact sourced canonical sibling across a later-turn path combination', async () => {
    const userId = owner('cross-turn-combination-source');
    await storage.getOrCreateCareerMap(userId);
    const firstTurn = await beginTurn(userId, 'cross-turn-combination-first');
    expect((await persist(userId, firstTurn.leaseId, {
      type: 'propose-why', sourceId: id('combination-why-propose'), expectedRevision: 0, occurredAt: at(1),
      payload: { why: { id: id('combination-why'), revision: 1, statement: 'I work to make complex choices humane.', serves: 'People facing important choices', pointOfView: 'Clarity should create agency.' }, presentation: presentation(1) },
    })).status).toBe('committed');
    expect((await persist(userId, firstTurn.leaseId, {
      type: 'confirm-why', sourceId: id('combination-why-confirm'), expectedRevision: 1, occurredAt: at(2),
      payload: { whyId: id('combination-why'), whyRevision: 1, action: action(2) },
    })).status).toBe('committed');
    const originalPaths = paths(undefined, true);
    await storage.recordResearchAttempt(userId, firstTurn.leaseId, {
      ...amendedAttempt({
        id: id('combination-research'), status: 'succeeded', targetId: id('path-1'),
        targetRevision: 2, sources: originalPaths[0].sources,
      }),
      attemptedAt: at(3),
    });
    expect((await persist(userId, firstTurn.leaseId, {
      type: 'propose-purpose-paths', sourceId: id('combination-paths-propose'), expectedRevision: 2, occurredAt: at(3),
      payload: { setId: id('combination-set-1'), setRevision: 1, paths: originalPaths, presentation: presentation(3) },
    })).status).toBe('committed');
    expect(await storage.completeAgentTurn({
      userId, turnId: firstTurn.turnId, leaseId: firstTurn.leaseId, result: { revision: 3 },
    })).toMatchObject({ status: 'completed' });

    const secondTurn = await beginTurn(userId, 'cross-turn-combination-second');
    const unsourced = paths();
    const combined = await persist(userId, secondTurn.leaseId, {
      type: 'combine-purpose-paths', sourceId: id('combination-paths-combine'), expectedRevision: 3, occurredAt: at(4),
      payload: {
        sourceSetId: id('combination-set-1'), sourceSetRevision: 1,
        combinedPathIds: [originalPaths[1].id, originalPaths[2].id],
        replacementSetId: id('combination-set-2'), replacementSetRevision: 1,
        paths: [
          originalPaths[0],
          { ...unsourced[1], id: id('combination-merged'), name: 'Combined humane practice' },
          { ...unsourced[2], id: id('combination-new-third'), name: 'New third direction' },
        ],
        presentation: presentation(4),
      },
    });
    expect(combined.status).toBe('committed');
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') {
      expect(loaded.map.pathSets.at(-1)?.paths[0].sources).toEqual(originalPaths[0].sources);
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
    const turn = await beginTurn(userId, 'lineage');
    const operations: CareerMapOperation[] = [
      { type: 'propose-why', sourceId: id('l-why-1'), expectedRevision: 0, occurredAt: at(1), payload: { why: { id: id('l-why'), revision: 1, statement: 'Serve useful learning.', serves: 'Career explorers', pointOfView: 'Action creates knowledge.' }, presentation: presentation(1) } },
      { type: 'confirm-why', sourceId: id('l-why-2'), expectedRevision: 1, occurredAt: at(2), payload: { whyId: id('l-why'), whyRevision: 1, action: action(2) } },
      { type: 'propose-purpose-paths', sourceId: id('l-paths-1'), expectedRevision: 2, occurredAt: at(3), payload: { setId: id('l-set'), setRevision: 1, paths: paths(), presentation: presentation(3) } },
      { type: 'select-purpose-path', sourceId: id('l-paths-2'), expectedRevision: 3, occurredAt: at(4), payload: { setId: id('l-set'), setRevision: 1, pathId: id('path-1'), pathRevision: 1, action: action(4) } },
      { type: 'revise-why', sourceId: id('l-why-3'), expectedRevision: 4, occurredAt: at(5), payload: { why: { id: id('l-why-2'), revision: 1, statement: 'Serve useful action.', serves: 'Career explorers', pointOfView: 'Evidence should create agency.' }, supersedesWhyId: id('l-why'), presentation: presentation(5) } },
      { type: 'confirm-why', sourceId: id('l-why-4'), expectedRevision: 5, occurredAt: at(6), payload: { whyId: id('l-why-2'), whyRevision: 1, action: action(6) } },
    ];
    for (const operation of operations) expect((await persist(userId, turn.leaseId, operation)).status).toBe('committed');
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
    const turn = await beginTurn(userId, 'project-replacement');
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
    for (const operation of operations) expect((await persist(userId, turn.leaseId, operation)).status).toBe('committed');
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') {
      expect(loaded.map.projects.at(-1)?.id).toBe(replacementProjectId);
      expect(loaded.map.projects.at(-1)?.number).toBe(1);
      expect(loaded.map.revision).toBe(6);
    }
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(6);
  });

  it('persists Side Door selection with one active and two parked siblings atomically', async () => {
    const userId = owner('side-door-selection');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'side-door-selection');
    const projectId = id('sd-project');
    const operations: CareerMapOperation[] = [
      { type: 'propose-why', sourceId: id('sd-1'), expectedRevision: 0, occurredAt: at(1), payload: { why: { id: id('sd-why'), revision: 1, statement: 'Make complex work more useful.', serves: 'People doing consequential work', pointOfView: 'Evidence should change action.' }, presentation: presentation(1) } },
      { type: 'confirm-why', sourceId: id('sd-2'), expectedRevision: 1, occurredAt: at(2), payload: { whyId: id('sd-why'), whyRevision: 1, action: action(2) } },
      { type: 'propose-purpose-paths', sourceId: id('sd-3'), expectedRevision: 2, occurredAt: at(3), payload: { setId: id('sd-path-set'), setRevision: 1, paths: paths(), presentation: presentation(3) } },
      { type: 'select-purpose-path', sourceId: id('sd-4'), expectedRevision: 3, occurredAt: at(4), payload: { setId: id('sd-path-set'), setRevision: 1, pathId: id('path-1'), pathRevision: 1, action: action(4) } },
      { type: 'propose-first-project', sourceId: id('sd-5'), expectedRevision: 4, occurredAt: at(5), payload: { project: project(projectId), presentation: presentation(5) } },
      { type: 'accept-first-project', sourceId: id('sd-6'), expectedRevision: 5, occurredAt: at(6), payload: { projectId, projectRevision: 1, action: action(6) } },
      { type: 'open-reflection', sourceId: id('sd-7'), expectedRevision: 6, occurredAt: at(7), payload: { reflectionId: id('sd-reflection'), revision: 1, projectId, projectRevision: 1, action: action(7) } },
      { type: 'append-reflection-evidence', sourceId: id('sd-8'), expectedRevision: 7, occurredAt: at(8), payload: { reflectionId: id('sd-reflection'), reflectionRevision: 1, evidence: { id: id('sd-learning'), revision: 1, observation: 'I kept iterating voluntarily.', signal: 'voluntary-pull', interpretation: 'The work may fit.', provenance: action(8) } } },
      { type: 'close-reflection', sourceId: id('sd-9'), expectedRevision: 8, occurredAt: at(9), payload: { reflectionId: id('sd-reflection'), reflectionRevision: 1, action: action(9) } },
      { type: 'record-continue-choice', sourceId: id('sd-10'), expectedRevision: 9, occurredAt: at(10), payload: { id: id('sd-continue'), revision: 1, reflectionId: id('sd-reflection'), reflectionRevision: 1, wantsToContinue: true, action: action(10) } },
      { type: 'record-next-move', sourceId: id('sd-11'), expectedRevision: 10, occurredAt: at(11), payload: { id: id('sd-move'), revision: 1, continueChoiceId: id('sd-continue'), continueChoiceRevision: 1, kind: 'commit-provisionally', action: action(11) } },
      { type: 'record-peer-exposure', sourceId: id('sd-12'), expectedRevision: 11, occurredAt: at(12), payload: { exposure: { id: id('sd-peer'), revision: 1, subjectKind: 'community', subject: 'Relevant practitioners', insight: 'Concrete cases create trust.' }, presentation: presentation(12) } },
      { type: 'confirm-peer-exposure', sourceId: id('sd-13'), expectedRevision: 12, occurredAt: at(13), payload: { exposureId: id('sd-peer'), exposureRevision: 1, action: action(13) } },
      { type: 'complete-provisional-commitment', sourceId: id('sd-14'), expectedRevision: 13, occurredAt: at(14), payload: { id: id('sd-commitment'), revision: 1, intentId: `intent-${id('sd-move')}`, action: action(14) } },
      { type: 'propose-proof-inventory', sourceId: id('sd-15'), expectedRevision: 14, occurredAt: at(15), payload: { proof: { id: id('sd-proof'), revision: 1, artifacts: ['Prototype'], problemsSolved: ['Decision friction'], peopleHelped: ['One colleague'], usefulQualities: ['Synthesis'], knowledge: ['Decision design'], relationships: ['Practitioner'], pointsOfView: ['Evidence changes action'], shareableMaterial: ['Case note'] }, presentation: presentation(15) } },
      { type: 'confirm-proof-inventory', sourceId: id('sd-16'), expectedRevision: 15, occurredAt: at(16), payload: { proofId: id('sd-proof'), proofRevision: 1, action: action(16) } },
      { type: 'propose-side-doors', sourceId: id('sd-17'), expectedRevision: 16, occurredAt: at(17), payload: { setId: id('sd-door-set'), setRevision: 1, doors: sideDoors(), presentation: presentation(17) } },
      { type: 'select-side-door', sourceId: id('sd-18'), expectedRevision: 17, occurredAt: at(18), payload: { setId: id('sd-door-set'), setRevision: 1, doorId: id('door-2'), doorRevision: 1, action: action(18) } },
    ];
    for (const operation of operations) {
      const result = await persist(userId, turn.leaseId, operation);
      expect(result.status, `${operation.type} failed`).toBe('committed');
    }
    const loaded = await storage.loadCareerMap(userId);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') {
      const doors = loaded.map.sideDoorSets.at(-1)?.doors ?? [];
      expect(doors.filter((door) => door.selection === 'active')).toHaveLength(1);
      expect(doors.filter((door) => door.selection === 'parked')).toHaveLength(2);
    }
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(18);
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

  it('composes the U5 coordinator, map operation, research, durable projection, replay, cancellation, and lease release', async () => {
    const userId = owner('u5-production-composition');
    const workspaceTurn = await beginTurn(userId, 'u5-workspace', 'workspace-action');
    const conversationId = id('u5-conversation');
    await storage.setConversationMapping(userId, workspaceTurn.leaseId, conversationId);

    const envelope = await executeWorkspaceTool({
      runtime: {
        storage,
        loader: await createMethodModuleLoader(),
        userId,
        turn: workspaceTurn,
        timing: { turnSequence: 1, occurredAt: at(1) },
      },
      expectedRevision: 0,
      operationType: 'append-foundation-evidence',
      operationId: id('u5-operation'),
      rawInput: {
        id: id('u5-evidence'), revision: 1, category: 'fascination',
        content: 'I keep returning to public decision-support patterns.',
      },
    });
    expect(envelope).toMatchObject({
      status: 'committed', operation: 'append-foundation-evidence',
      authoritativeRevision: 1, derivedModule: 'form-foundation',
    });
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(1);
    const completedWorkspace = await storage.completeAgentTurn({
      userId, turnId: workspaceTurn.turnId, leaseId: workspaceTurn.leaseId,
      result: { kind: 'workspace-result', refetch: true, operationEnvelope: envelope },
    });
    expect(completedWorkspace?.status).toBe('completed');
    expect(await storage.getTurnLease(userId)).toBeUndefined();
    const workspaceReplay = await storage.beginWorkspaceActionTurn({
      userId,
      clientMessageId: workspaceTurn.clientMessageId,
      requestFingerprint: workspaceTurn.requestFingerprint,
      turnId: id('u5-workspace-retry-turn'),
      leaseId: id('u5-workspace-retry-lease'),
    });
    expect(workspaceReplay).toMatchObject({
      status: 'terminal', shouldInvokeModel: false,
      turn: { status: 'completed', terminalResult: { kind: 'workspace-result', operationEnvelope: envelope } },
    });

    const runSeedOperation = async (
      suffix: string,
      operationType: Parameters<typeof executeWorkspaceTool>[0]['operationType'],
      rawInput: unknown,
    ) => {
      const seedTurn = await beginTurn(userId, suffix, 'workspace-action');
      const current = await storage.loadCareerMap(userId);
      if (current.status !== 'ready') throw new Error('Expected a ready Career Map before the seed operation.');
      const result = await executeWorkspaceTool({
        runtime: {
          storage, loader: await createMethodModuleLoader(), userId, turn: seedTurn,
          timing: { turnSequence: now.getTime(), occurredAt: at() },
        },
        expectedRevision: current.map.revision,
        operationType,
        operationId: id(`${suffix}-operation`),
        rawInput,
      });
      expect(result.status).toBe('committed');
      expect((await storage.completeAgentTurn({
        userId, turnId: seedTurn.turnId, leaseId: seedTurn.leaseId,
        result: { kind: 'workspace-result', refetch: true, operationEnvelope: result },
      }))?.status).toBe('completed');
      return seedTurn;
    };
    const whyId = id('u5-why');
    const proposedWhyTurn = await runSeedOperation('u5-propose-why', 'propose-why', {
      id: whyId, revision: 1,
      statement: 'Help public teams make consequential choices with less friction.',
      serves: 'Public-interest teams facing consequential choices',
      pointOfView: 'Small decision aids can turn ambiguity into useful evidence.',
    });
    const confirmedWhyTurn = await beginTurn(userId, 'u5-confirm-why', 'workspace-action');
    const beforeWhyConfirmation = await storage.loadCareerMap(userId);
    if (beforeWhyConfirmation.status !== 'ready') throw new Error('Expected a ready Career Map before confirming the Why.');
    const confirmedWhy = await executeWorkspaceTool({
      runtime: {
        storage, loader: await createMethodModuleLoader(), userId, turn: confirmedWhyTurn,
        timing: { turnSequence: now.getTime() + 1, occurredAt: at(1) },
      },
      expectedRevision: beforeWhyConfirmation.map.revision,
      operationType: 'confirm-why',
      operationId: id('u5-confirm-why-operation'),
      rawInput: {
        whyId, whyRevision: 1,
        presentedInTurnId: proposedWhyTurn.turnId,
        sourceMessageId: confirmedWhyTurn.clientMessageId,
      },
    });
    expect(confirmedWhy.status).toBe('committed');
    expect((await storage.completeAgentTurn({
      userId, turnId: confirmedWhyTurn.turnId, leaseId: confirmedWhyTurn.leaseId,
      result: { kind: 'workspace-result', refetch: true, operationEnvelope: confirmedWhy },
    }))?.status).toBe('completed');
    const suggestedSetId = id('u5-suggested-paths');
    await runSeedOperation('u5-propose-paths', 'propose-purpose-paths', {
      setId: suggestedSetId,
      setRevision: 1,
      paths: researchablePaths(),
    });
    expect(await storage.listCareerMapHistory(userId)).toHaveLength(4);

    const agentTurn = await beginTurn(userId, 'u5-agent', 'agent-turn');
    const fact = 'Public teams test decision aids through small bounded artifacts.';
    const research = new NativeSearchEvidenceLedger({
      storage,
      userId,
      turnId: agentTurn.turnId,
      leaseId: agentTurn.leaseId,
      now: () => now,
      handleSecret: new Uint8Array(32).fill(7),
    });
    const providerCallId = id('u5-provider-call');
    const providerResultId = id('u5-provider-result');
    const url = 'https://example.com/public-pattern';
    const searchCall = {
      type: 'tool-call', toolName: 'web_search', toolCallId: providerCallId,
      providerExecuted: true, input: { action: { type: 'search', query: 'current public decision aids' } },
    };
    const searchResult = {
      type: 'tool-result', toolName: 'web_search', toolCallId: providerCallId,
      providerExecuted: true,
      output: { action: { type: 'search', sources: [{ id: providerResultId, url, snippet: fact }] } },
    };
    const researchResult = await research.captureSettledStep({
      content: [
        searchCall,
        searchResult,
        {
          type: 'text', text: fact,
          providerMetadata: {
            openai: { annotations: [{ type: 'url_citation', url, start_index: 0, end_index: fact.length }] },
          },
        },
      ],
      toolCalls: [searchCall],
      toolResults: [searchResult],
      response: {
        body: {
          output: [{
            type: 'web_search_call', id: providerCallId,
            action: { type: 'search', sources: [{ id: providerResultId, url, text: fact }] },
            results: [{ id: providerResultId, url, text: fact }],
          }],
        },
      },
    }, [{
      targetId: id('path-1'), targetRevision: 4,
      canonicalField: 'purposePath.practicalFit', exactClaim: fact,
    }], {
      checkpoint: 'create-purpose-paths', moduleVersion: 'create-purpose-paths@test',
    });
    expect(researchResult).toMatchObject({
      status: 'succeeded',
      minted: [{ canonicalField: 'purposePath.practicalFit', support: 'server-validated' }],
    });
    expect(await storage.listResearchAttempts(userId)).toHaveLength(1);

    const userItemId = id('u5-user-item');
    const assistantItemId = id('u5-assistant-item');
    const completedAgent = await storage.completeAgentTurn({
      userId, turnId: agentTurn.turnId, leaseId: agentTurn.leaseId,
      result: {
        kind: 'completed', refetch: true, revision: 4,
        displayProjection: { userItemId, assistantItemIds: [assistantItemId] },
      },
    });
    expect(completedAgent?.status).toBe('completed');
    const history = await loadConversationHistory({
      storage,
      userId,
      client: {
        listItems: async () => ({
          data: [
            { id: assistantItemId, type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Safe authoritative answer' }] },
            { id: id('u5-pre-result-item'), type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Premature mutation claim' }] },
            { id: userItemId, type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Safe prompt' }] },
          ],
          hasMore: false,
        }),
      },
    });
    expect(history.messages.map((message) => message.id)).toEqual([userItemId, assistantItemId]);
    const agentReplay = await storage.beginAgentTurn({
      userId,
      clientMessageId: agentTurn.clientMessageId,
      requestFingerprint: agentTurn.requestFingerprint,
      turnId: id('u5-agent-retry-turn'),
      leaseId: id('u5-agent-retry-lease'),
    });
    expect(agentReplay).toMatchObject({ status: 'terminal', shouldInvokeModel: false, turn: { status: 'completed' } });

    const cancelledTurn = await beginTurn(userId, 'u5-cancelled', 'agent-turn');
    const cancelled = await storage.cancelAgentTurn({
      userId, turnId: cancelledTurn.turnId, leaseId: cancelledTurn.leaseId,
      result: { kind: 'cancelled', stopped: true, refetch: true, revision: 4, operationCommitted: false },
    });
    expect(cancelled).toMatchObject({ status: 'cancelled', terminalResult: { stopped: true, operationCommitted: false } });
    expect(await storage.getTurnLease(userId)).toBeUndefined();
    expect(await storage.releaseTurnLease(userId, cancelledTurn.turnId, cancelledTurn.leaseId)).toBe(false);
    const cancelledReplay = await storage.beginAgentTurn({
      userId,
      clientMessageId: cancelledTurn.clientMessageId,
      requestFingerprint: cancelledTurn.requestFingerprint,
      turnId: id('u5-cancelled-retry-turn'),
      leaseId: id('u5-cancelled-retry-lease'),
    });
    expect(cancelledReplay).toMatchObject({ status: 'terminal', shouldInvokeModel: false, turn: { status: 'cancelled' } });
    expect((await storage.listAgentTurns(userId)).map((turn) => turn.status).sort()).toEqual([
      'cancelled', 'completed', 'completed', 'completed', 'completed', 'completed',
    ]);
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

  it('rejects lease-token ABA reuse after expiry', async () => {
    const userId = owner('lease-token-aba');
    const first = await beginTurn(userId, 'lease-token-aba-first');
    const attempt = {
      ...amendedAttempt({
        id: id('lease-token-aba-research'), status: 'failed', targetId: id('lease-token-aba-target'),
        targetRevision: 0, checkpoint: 'form-foundation', errorClass: 'NoResults',
      }),
      attemptedAt: at(),
    };
    await storage.recordResearchAttempt(userId, first.leaseId, attempt);
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
    const second = await beginTurn(userId, 'lease-token-aba-valid-second');
    await expect(storage.recordResearchAttempt(userId, second.leaseId, attempt))
      .rejects.toBeInstanceOf(ResearchAttemptConflictError);
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
    await expect(storage.recordResearchAttempt(userId, first.leaseId, {
      ...amendedAttempt({
        id: id('expiry-race-stale-research'), status: 'failed', targetId: id('expiry-race-target'),
        targetRevision: 0, checkpoint: 'form-foundation', errorClass: 'StaleWorker',
      }),
      attemptedAt: at(),
    })).rejects.toBeInstanceOf(TurnLeaseLostError);
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

      await expect(storage.recordResearchAttempt(userId, turn.leaseId, {
        ...amendedAttempt({
          id: id(`repair-aux-gate-${scenario}-research`), status: 'failed',
          targetId: id(`repair-aux-gate-${scenario}-target`), targetRevision: 0,
          checkpoint: 'form-foundation',
        }),
        attemptedAt: at(),
        errorClass: 'RepairGateFixture',
      })).rejects.toBeInstanceOf(CareerMapRepairRequiredError);
      await expect(storage.saveCareerMapDraft({
        userId, leaseId: turn.leaseId, id: id(`repair-aux-gate-${scenario}-draft`),
        kind: 'outreach', content: { text: 'must not persist' },
      })).rejects.toBeInstanceOf(CareerMapRepairRequiredError);
      await expect(storage.setConversationMapping(
        userId,
        turn.leaseId,
        id(`repair-aux-gate-${scenario}-conversation`),
      )).rejects.toBeInstanceOf(CareerMapRepairRequiredError);

      expect(await db.select().from(careerMapResearchAttempts)
        .where(eq(careerMapResearchAttempts.userId, userId))).toHaveLength(0);
      expect(await db.select().from(careerMapDrafts)
        .where(eq(careerMapDrafts.userId, userId))).toHaveLength(0);
      expect(await db.select().from(agentConversationMappings)
        .where(eq(agentConversationMappings.userId, userId))).toHaveLength(0);
      expect(await db.select().from(agentTurns).where(eq(agentTurns.userId, userId))).toHaveLength(1);
      expect(await db.select().from(agentTurnLeases).where(eq(agentTurnLeases.userId, userId))).toHaveLength(1);

      expect(await storage.failAgentTurn({
        userId, turnId: turn.turnId, leaseId: turn.leaseId, errorClass: 'RepairRequired',
      })).toMatchObject({ status: 'failed' });
      expect(await storage.getTurnLease(userId)).toBeUndefined();
      await eraseOwner(userId);
    },
  );

  it.each([
    ['unsupported-schema', (document: Record<string, unknown>) => ({ rowVersion: 999, document: { ...document, schemaVersion: 999 } })],
    ['invalid-document', (document: Record<string, unknown>) => ({ rowVersion: 2, document: { ...document, pathSets: [{ id: 'broken' }] } })],
    ['owner-mismatch', (document: Record<string, unknown>) => ({ rowVersion: 2, document: { ...document, explorerId: id('someone-else') } })],
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
      const turn = await beginTurn(userId, `repair-${scenario}`);
      const operations: CareerMapOperation[] = [
        { type: 'propose-why', sourceId: id(`${scenario}-1`), expectedRevision: 0, occurredAt: at(1), payload: { why: { id: id(`${scenario}-why`), revision: 1, statement: 'Make evidence useful.', serves: 'People facing choices', pointOfView: 'Evidence should create agency.' }, presentation: presentation(1) } },
        { type: 'confirm-why', sourceId: id(`${scenario}-2`), expectedRevision: 1, occurredAt: at(2), payload: { whyId: id(`${scenario}-why`), whyRevision: 1, action: action(2) } },
        { type: 'propose-purpose-paths', sourceId: id(`${scenario}-3`), expectedRevision: 2, occurredAt: at(3), payload: { setId: id(`${scenario}-set`), setRevision: 1, paths: paths(), presentation: presentation(3) } },
        { type: 'select-purpose-path', sourceId: id(`${scenario}-4`), expectedRevision: 3, occurredAt: at(4), payload: { setId: id(`${scenario}-set`), setRevision: 1, pathId: id('path-1'), pathRevision: 1, action: action(4) } },
      ];
      for (const operation of operations) expect((await persist(userId, turn.leaseId, operation)).status).toBe('committed');
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
    const turn = await beginTurn(userId, 'repair-provenance');
    expect((await persist(userId, turn.leaseId, {
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
    })).status).toBe('committed');
    expect((await persist(userId, turn.leaseId, {
      type: 'confirm-why',
      sourceId: id('repair-provenance-confirm'),
      expectedRevision: 1,
      occurredAt: at(2),
      payload: {
        whyId: id('repair-provenance-why'),
        whyRevision: 1,
        action: action(2),
      },
    })).status).toBe('committed');
    await db.update(careerMapHistory)
      .set({
        confirmationProvenance: {
          kind: 'ui-action',
          actionId: id('different-valid-action'),
          turnId: turn.turnId,
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
    const turn = await beginTurn(userId, 'erasure');
    expect((await persist(userId, turn.leaseId, {
      type: 'propose-why', sourceId: id('erasure-why-propose'), expectedRevision: 0, occurredAt: at(1),
      payload: { why: { id: id('erasure-why'), revision: 1, statement: 'Erase Method data completely.', serves: 'Explorers leaving the pilot', pointOfView: 'Deletion must include exact evidence links.' }, presentation: presentation(1) },
    })).status).toBe('committed');
    expect((await persist(userId, turn.leaseId, {
      type: 'confirm-why', sourceId: id('erasure-why-confirm'), expectedRevision: 1, occurredAt: at(2),
      payload: { whyId: id('erasure-why'), whyRevision: 1, action: action(2) },
    })).status).toBe('committed');
    const erasurePaths = paths(undefined, true);
    await storage.recordResearchAttempt(userId, turn.leaseId, amendedAttempt({
      id: id('erasure-research'), status: 'succeeded', targetId: id('path-1'), targetRevision: 2,
      sources: erasurePaths[0].sources,
    }));
    expect((await persist(userId, turn.leaseId, {
      type: 'propose-purpose-paths', sourceId: id('erasure-paths'), expectedRevision: 2, occurredAt: at(3),
      payload: { setId: id('erasure-path-set'), setRevision: 1, paths: erasurePaths, presentation: presentation(3) },
    })).status).toBe('committed');
    expect(await storage.listResearchSourceAssociations(userId)).toHaveLength(1);
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
    expect(await storage.getAgentTurn(userId, id('message-erasure'))).toBeUndefined();
    expect(await storage.getTurnLease(userId)).toBeUndefined();
    expect(await storage.getConversationMapping(userId)).toBeUndefined();
    expect(await storage.getMethodErasureJob(userId)).toMatchObject({ status: 'failed-provider' });
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
    await expect(storage.recordResearchAttempt(userId, id('erasure-blocked-lease'), {
      ...amendedAttempt({
        id: id('erasure-blocked-research'), status: 'failed', targetId: id('erasure-blocked-target'),
        targetRevision: 0, checkpoint: 'form-foundation', errorClass: 'Blocked',
      }),
      attemptedAt: at(),
    })).rejects.toBeInstanceOf(MethodErasurePendingError);
    await expect(storage.saveCareerMapDraft({
      userId, leaseId: id('erasure-blocked-lease'), id: id('erasure-blocked-draft'), kind: 'outreach', content: { text: 'blocked' },
    })).rejects.toBeInstanceOf(MethodErasurePendingError);
    await expect(storage.setConversationMapping(userId, id('erasure-blocked-lease'), id('erasure-blocked-conversation')))
      .rejects.toBeInstanceOf(MethodErasurePendingError);
    expect((await storage.eraseMethodData(userId, provider)).status).toBe('complete');
    expect(await storage.getMethodErasureJob(userId)).toBeUndefined();
    expect(attempts).toBe(2);
    expect(providerTargets).toEqual([id('conversation'), id('conversation')]);
    const [history, research, associations, drafts, turns, leases, mappings, jobs] = await Promise.all([
      db.select().from(careerMapHistory).where(eq(careerMapHistory.userId, userId)),
      db.select().from(careerMapResearchAttempts).where(eq(careerMapResearchAttempts.userId, userId)),
      db.select().from(careerMapEvidenceAssociations).where(eq(careerMapEvidenceAssociations.userId, userId)),
      db.select().from(careerMapDrafts).where(eq(careerMapDrafts.userId, userId)),
      db.select().from(agentTurns).where(eq(agentTurns.userId, userId)),
      db.select().from(agentTurnLeases).where(eq(agentTurnLeases.userId, userId)),
      db.select().from(agentConversationMappings).where(eq(agentConversationMappings.userId, userId)),
      db.select().from(methodErasureJobs).where(eq(methodErasureJobs.userId, userId)),
    ]);
    expect([history, research, associations, drafts, turns, leases, mappings, jobs]
      .every((rows) => rows.length === 0)).toBe(true);
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

  it('fails the integrity audit for malformed or identity-mismatched research rows', async () => {
    const userId = owner('invalid-research-audit');
    await storage.getOrCreateCareerMap(userId);
    const turn = await beginTurn(userId, 'invalid-research-audit');
    await db.insert(careerMapResearchAttempts).values([
      {
        id: id('malformed-research-row'), userId, turnId: turn.turnId, leaseId: turn.leaseId,
        attempt: { id: id('malformed-research-row') } as never,
      },
      {
        id: id('mismatched-research-row'), userId, turnId: turn.turnId, leaseId: turn.leaseId,
        attempt: {
          id: id('different-attempt-id'), status: 'failed', queryCategory: 'audit',
          attemptedAt: at(), sources: [], errorClass: 'AuditFixture',
        },
      },
    ]);
    expect(await storage.auditCareerMapIntegrity()).toMatchObject({
      orphanResearchAttempts: 0,
      invalidResearchAttempts: 2,
      zeroInvalid: false,
    });
    await eraseOwner(userId);
  });

  it('reports a zero-invalid pre-pilot fixture audit', async () => {
    const userId = owner('integrity');
    await storage.getOrCreateCareerMap(userId);
    const audit = await storage.auditCareerMapIntegrity();
    expect(audit.invalidRecords).toEqual([]);
    expect(audit.orphanHistory).toBe(0);
    expect(audit.orphanResearchAttempts).toBe(0);
    expect(audit.invalidResearchAttempts).toBe(0);
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

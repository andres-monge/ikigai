import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  applyCareerMapOperation,
  createCareerMap,
  type CareerMap,
  type CareerMapOperation,
} from '../../shared/career-map/index.js';
import type { IStorage, PersistCareerMapResult } from '../storage.js';
import { createMethodModuleLoader } from './method/loader.js';
import {
  createMethodTools,
  executeMethodOperation,
  executeWorkspaceTool,
  refreshMethodState,
} from './tools.js';

const at = (second: number) => `2030-02-01T00:00:${String(second).padStart(2, '0')}.000Z`;
const userAction = (sequence: number, turnId = `user-turn-${sequence}`) => ({
  kind: 'user-message' as const,
  actionId: `message-${sequence}`,
  turnId,
  turnSequence: sequence,
  occurredAt: at(sequence),
});

function pendingWhy(presentationTurn = 'prior-assistant-turn'): CareerMap {
  const result = applyCareerMapOperation(createCareerMap('explorer-1'), {
    type: 'propose-why', sourceId: 'proposal-source', expectedRevision: 0, occurredAt: at(1),
    payload: {
      why: {
        id: 'why-1', revision: 1, statement: 'Make action create useful self-knowledge.',
        serves: 'People testing career directions', pointOfView: 'Reality is stronger than speculation.',
      },
      presentation: {
        kind: 'model-presentation', assistantTurnId: presentationTurn,
        turnSequence: 1, completed: true, presentedAt: at(1),
      },
    },
  });
  if (result.status !== 'committed') throw new Error('Fixture proposal failed.');
  return result.map;
}

function pendingProject(): CareerMap {
  let map = pendingWhy();
  const apply = (operation: CareerMapOperation) => {
    const result = applyCareerMapOperation(map, operation);
    if (result.status !== 'committed') throw new Error(`Fixture ${operation.type} failed.`);
    map = result.map;
  };
  apply({
    type: 'confirm-why', sourceId: 'confirm-why-source', expectedRevision: map.revision, occurredAt: at(2),
    payload: { whyId: 'why-1', whyRevision: 1, action: userAction(2) },
  });
  const path = (number: number) => ({
    id: `path-${number}`, revision: 1, name: `Path ${number}`,
    servesWhy: `Serve the Why through ${number}`, possibility: `Possibility ${number}`,
    evidence: [`Evidence ${number}`], centralUnknown: `Unknown ${number}`,
    projectPreview: `Project ${number}`, practicalFit: `Fit ${number}`,
  });
  apply({
    type: 'propose-purpose-paths', sourceId: 'propose-paths-source', expectedRevision: map.revision, occurredAt: at(3),
    payload: {
      setId: 'set-1', setRevision: 1, paths: [path(1), path(2), path(3)],
      presentation: {
        kind: 'model-presentation', assistantTurnId: 'paths-turn', turnSequence: 3,
        completed: true, presentedAt: at(3),
      },
    },
  });
  apply({
    type: 'select-purpose-path', sourceId: 'select-path-source', expectedRevision: map.revision, occurredAt: at(4),
    payload: { setId: 'set-1', setRevision: 1, pathId: 'path-2', pathRevision: 1, action: userAction(4) },
  });
  apply({
    type: 'propose-first-project', sourceId: 'propose-project-source', expectedRevision: map.revision, occurredAt: at(5),
    payload: {
      project: {
        id: 'project-1', revision: 1, title: 'Test project', outcome: 'A useful artifact',
        audience: 'The explorer', whyWanted: 'Test the path', learningGoal: 'Learn from action',
        firstVersion: 'A one-week prototype', firstStep: 'Schedule the first session',
        decisionQuestion: 'Does the path fit?', evidenceCue: 'Specific firsthand signals',
      },
      presentation: {
        kind: 'model-presentation', assistantTurnId: 'project-presentation-turn', turnSequence: 5,
        completed: true, presentedAt: at(5),
      },
    },
  });
  return map;
}

class ReducerStorage {
  readonly persist = vi.fn(async (input: { operation: CareerMapOperation }): Promise<PersistCareerMapResult> => {
    const result = applyCareerMapOperation(this.map, input.operation);
    if (result.status === 'committed' || result.status === 'replayed') this.map = result.map;
    return result;
  });

  constructor(public map: CareerMap) {}

  loadCareerMap = vi.fn(async () => ({ status: 'ready' as const, map: this.map }));
  persistCareerMapOperation = this.persist;
}

function runtime(storage: ReducerStorage, origin: 'agent-turn' | 'workspace-action' = 'agent-turn') {
  return {
    storage: storage as unknown as Pick<IStorage, 'loadCareerMap' | 'persistCareerMapOperation'>,
    userId: 'explorer-1',
    turn: {
      turnId: 'current-turn', leaseId: 'current-lease', clientMessageId: 'current-message',
      requestFingerprint: 'current-fingerprint', origin,
    },
    timing: { turnSequence: 2, occurredAt: at(2) },
  };
}

describe('strict state-specific Method tools', () => {
  it('contains no external-action surface and marks every tool strict', async () => {
    const storage = new ReducerStorage(pendingWhy());
    const loader = await createMethodModuleLoader();
    const prepared = await refreshMethodState(storage, loader, 'explorer-1');
    const tools = createMethodTools({
      ...runtime(storage), loader, surface: 'agent-turn', prepared: { current: prepared },
    });
    const names = Object.keys(tools);
    expect(names).not.toEqual(expect.arrayContaining([
      'send', 'publish', 'apply', 'submit', 'message', 'email', 'post', 'external_action',
    ]));
    expect(Object.values(tools).every((candidate) => candidate.strict === true)).toBe(true);
  });

  it('rejects ambiguous assent and multiple confirmation targets at the strict schema boundary', async () => {
    const storage = new ReducerStorage(pendingWhy());
    const loader = await createMethodModuleLoader();
    const prepared = await refreshMethodState(storage, loader, 'explorer-1');
    const tools = createMethodTools({
      ...runtime(storage), loader, surface: 'agent-turn', prepared: { current: prepared },
    });
    const schema = tools.confirm_why.inputSchema as z.ZodTypeAny;

    expect(schema.safeParse({ assent: 'yes' }).success).toBe(false);
    expect(schema.safeParse({
      targets: [
        { whyId: 'why-1', whyRevision: 1 },
        { whyId: 'why-2', whyRevision: 1 },
      ],
      presentedInTurnId: 'prior-assistant-turn',
      sourceMessageId: 'current-message',
    }).success).toBe(false);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it.each([
    ['same-turn self confirmation', { presentedInTurnId: 'current-turn', sourceMessageId: 'current-message', whyRevision: 1 }],
    ['wrong source message', { presentedInTurnId: 'prior-assistant-turn', sourceMessageId: 'edited-message', whyRevision: 1 }],
    ['stale revision', { presentedInTurnId: 'prior-assistant-turn', sourceMessageId: 'current-message', whyRevision: 2 }],
    ['invented target', { presentedInTurnId: 'prior-assistant-turn', sourceMessageId: 'current-message', whyRevision: 1, whyId: 'why-ambiguous' }],
  ])('rejects %s without guessing or persisting', async (_label, mismatch) => {
    const map = pendingWhy(mismatch.presentedInTurnId === 'current-turn' ? 'current-turn' : 'prior-assistant-turn');
    const storage = new ReducerStorage(map);
    const loader = await createMethodModuleLoader();
    const prepared = await refreshMethodState(storage, loader, 'explorer-1');
    const tools = createMethodTools({
      ...runtime(storage), loader, surface: 'agent-turn', prepared: { current: prepared },
    });
    const result = await tools.confirm_why.execute?.({
      whyId: mismatch.whyId ?? 'why-1',
      whyRevision: mismatch.whyRevision,
      presentedInTurnId: mismatch.presentedInTurnId,
      sourceMessageId: mismatch.sourceMessageId,
    }, { toolCallId: 'confirm-call', messages: [] } as never);

    expect(result).toMatchObject({ status: 'rejected' });
    if (_label === 'same-turn self confirmation') {
      // The exact target reaches the lifecycle authority, which rejects the
      // same-turn user-message confirmation as non-auditable.
      expect(result).toMatchObject({ errorClass: 'confirmation-not-auditable' });
      expect(storage.persist).toHaveBeenCalledOnce();
    } else {
      expect(result).toMatchObject({ errorClass: 'ConfirmationTargetMismatchError' });
      expect(storage.persist).not.toHaveBeenCalled();
    }
  });

  it('re-derives a stale prepared step as a conflict and never retries stale arguments', async () => {
    const loader = await createMethodModuleLoader();
    const storage = new ReducerStorage(createCareerMap('explorer-1'));
    const prepared = await refreshMethodState(storage, loader, 'explorer-1');
    const externallyCommitted = applyCareerMapOperation(storage.map, {
      type: 'append-foundation-evidence', sourceId: 'external-write', expectedRevision: 0, occurredAt: at(1),
      payload: {
        evidence: {
          id: 'evidence-external', revision: 1, category: 'fascination', content: 'A new external write',
          provenance: userAction(1),
        },
      },
    });
    if (externallyCommitted.status !== 'committed') throw new Error('Conflict fixture failed.');
    storage.map = externallyCommitted.map;

    const result = await executeMethodOperation({
      ...runtime(storage), loader, surface: 'agent-turn', prepared,
      sourceId: 'stale-call', operationType: 'append-foundation-evidence',
      payload: {
        evidence: {
          id: 'evidence-stale', revision: 1, category: 'fascination', content: 'Stale write',
          provenance: userAction(2),
        },
      },
    });

    expect(result).toMatchObject({
      status: 'conflict', authoritativeRevision: 1, derivedModule: 'form-foundation',
      errorClass: 'stale-step-context', retryable: true,
    });
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('normalizes an exact semantic retry as an idempotent replay', async () => {
    const loader = await createMethodModuleLoader();
    const storage = new ReducerStorage(createCareerMap('explorer-1'));
    const payload = {
      evidence: {
        id: 'evidence-1', revision: 1, category: 'fascination' as const, content: 'I keep returning to this problem.',
        provenance: userAction(2, 'current-turn'),
      },
    };
    const common = {
      ...runtime(storage), loader, surface: 'agent-turn' as const,
      sourceId: 'exact-operation-id', operationType: 'append-foundation-evidence' as const, payload,
    };
    expect((await executeMethodOperation(common)).status).toBe('committed');
    const replay = await executeMethodOperation(common);
    expect(replay).toMatchObject({ status: 'idempotent-replay', authoritativeRevision: 1 });
    expect(storage.persist).toHaveBeenCalledTimes(2);
  });

  it('returns the same reducer envelope for an agent confirmation and a workspace confirmation', async () => {
    const loader = await createMethodModuleLoader();
    const agentStorage = new ReducerStorage(pendingWhy());
    const workspaceStorage = new ReducerStorage(pendingWhy());
    const agentPrepared = await refreshMethodState(agentStorage, loader, 'explorer-1');
    const agentTools = createMethodTools({
      ...runtime(agentStorage), loader, surface: 'agent-turn', prepared: { current: agentPrepared },
    });
    const exact = {
      whyId: 'why-1', whyRevision: 1, presentedInTurnId: 'prior-assistant-turn', sourceMessageId: 'current-message',
    };
    const agentResult = await agentTools.confirm_why.execute?.(exact, { toolCallId: 'parity-operation', messages: [] } as never);
    const workspaceResult = await executeWorkspaceTool({
      runtime: { ...runtime(workspaceStorage, 'workspace-action'), loader },
      operationType: 'confirm-why', operationId: 'parity-operation', rawInput: exact,
    });

    expect(agentResult).toEqual(workspaceResult);
    expect(agentStorage.map.foundation.whyRevisions.at(-1)?.status).toBe('confirmed');
    expect(workspaceStorage.map.foundation.whyRevisions.at(-1)?.status).toBe('confirmed');
  });

  it('rejects the U7 first-project acceptance boundary identically on agent and workspace without a write', async () => {
    const loader = await createMethodModuleLoader();
    const agentStorage = new ReducerStorage(pendingProject());
    const workspaceStorage = new ReducerStorage(pendingProject());
    const agentPrepared = await refreshMethodState(agentStorage, loader, 'explorer-1');
    const agentTools = createMethodTools({
      ...runtime(agentStorage), loader, surface: 'agent-turn', prepared: { current: agentPrepared },
    });
    const exact = {
      projectId: 'project-1', projectRevision: 1,
      presentedInTurnId: 'project-presentation-turn', sourceMessageId: 'current-message',
    };
    const agentResult = await agentTools.accept_first_project.execute?.(
      exact,
      { toolCallId: 'accept-project-operation', messages: [] } as never,
    );
    const workspaceResult = await executeWorkspaceTool({
      runtime: { ...runtime(workspaceStorage, 'workspace-action'), loader },
      operationType: 'accept-first-project', operationId: 'accept-project-operation', rawInput: exact,
    });

    expect(agentResult).toEqual(workspaceResult);
    expect(agentResult).toMatchObject({
      status: 'rejected', errorClass: 'next-module-not-registered',
      derivedModule: 'design-path-project',
    });
    expect(agentStorage.persist).not.toHaveBeenCalled();
    expect(workspaceStorage.persist).not.toHaveBeenCalled();
  });
});

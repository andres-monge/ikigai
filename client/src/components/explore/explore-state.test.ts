import { describe, expect, it } from 'vitest';
import type { OperationStatusData } from '@shared/streaming-schemas';
import {
  consumeAgentStreamLine,
  failUnresolvedOperationAttempts,
  operationAttemptKey,
  reduceOperationAttempts,
  terminalStatusForEnvelope,
  type AgentStreamState,
} from './explore-state';

const saving = (overrides: Partial<OperationStatusData> = {}): OperationStatusData => ({
  version: 1,
  turnId: 'turn-1',
  messageId: 'message-1',
  operationId: 'operation-1',
  operation: 'confirm-why',
  authoritativeRevision: null,
  status: 'Saving',
  sequence: 0,
  ...overrides,
} as OperationStatusData);

const terminal = (
  status: 'Saved' | 'Conflict' | 'Rejected' | 'Failed',
  overrides: Partial<OperationStatusData> = {},
): OperationStatusData => ({
  ...saving(),
  authoritativeRevision: status === 'Saved' ? 2 : 1,
  status,
  sequence: 1,
  ...overrides,
} as OperationStatusData);

describe('operation attempt correlation', () => {
  it('tracks independent operation identities and ignores crossed or late events', () => {
    let attempts = reduceOperationAttempts({}, saving());
    attempts = reduceOperationAttempts(attempts, saving({
      turnId: 'turn-2', messageId: 'message-2', operationId: 'operation-2',
    }));
    attempts = reduceOperationAttempts(attempts, terminal('Saved'));
    attempts = reduceOperationAttempts(attempts, terminal('Failed'));
    attempts = reduceOperationAttempts(attempts, terminal('Conflict', {
      turnId: 'turn-2', messageId: 'wrong-message', operationId: 'operation-2',
    }));

    expect(Object.keys(attempts)).toHaveLength(2);
    expect(attempts[operationAttemptKey(saving())]?.status).toBe('Saved');
    expect(attempts['turn-2/message-2/operation-2']?.status).toBe('Saving');
  });

  it('maps replay to Saved and never exposes replay as a user-facing status', () => {
    expect(terminalStatusForEnvelope('idempotent-replay')).toBe('Saved');
    expect(terminalStatusForEnvelope('committed')).toBe('Saved');
    expect(terminalStatusForEnvelope('conflict')).toBe('Conflict');
    expect(terminalStatusForEnvelope('rejected')).toBe('Rejected');
  });

  it('terminalizes only newly unresolved Saving attempts when a stream ends', () => {
    const prior = saving({ turnId: 'prior', messageId: 'prior', operationId: 'prior' });
    const current = saving();
    const attempts = {
      [operationAttemptKey(prior)]: prior,
      [operationAttemptKey(current)]: current,
    };
    const result = failUnresolvedOperationAttempts(attempts, new Set([operationAttemptKey(prior)]));
    expect(result[operationAttemptKey(prior)]?.status).toBe('Saving');
    expect(result[operationAttemptKey(current)]?.status).toBe('Failed');
  });
});

describe('agent stream consumption', () => {
  it('keeps Saved when later narration fails', () => {
    const initial: AgentStreamState = { text: '', citations: [], attempts: {}, providerFailed: false };
    const savedPart = JSON.stringify({
      type: 'data-operation-status', id: 'operation-1', data: terminal('Saved'), transient: true,
    });
    const afterSaved = consumeAgentStreamLine(initial, `data: ${JSON.stringify({
      type: 'data-operation-status', id: 'operation-1', data: saving(), transient: true,
    })}`);
    const completed = consumeAgentStreamLine(afterSaved, `data: ${savedPart}`);
    const failed = consumeAgentStreamLine(completed, `data: ${JSON.stringify({
      type: 'error', errorText: 'The agent request failed.',
    })}`);

    expect(failed.attempts['turn-1/message-1/operation-1']?.status).toBe('Saved');
    expect(failed.providerFailed).toBe(true);
  });

  it('accumulates split text events but treats unknown stream content as inert', () => {
    let state: AgentStreamState = { text: '', citations: [], attempts: {}, providerFailed: false };
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({ type: 'text-delta', id: 't', delta: 'Hello ' })}`);
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({ type: 'text-delta', id: 't', delta: '<img src=https://evil.test>' })}`);
    state = consumeAgentStreamLine(state, 'data: {bad json');
    expect(state.text).toBe('Hello <img src=https://evil.test>');
  });

  it('retains only validated claim-linked citations', () => {
    let state: AgentStreamState = { text: '', citations: [], attempts: {}, providerFailed: false };
    const citation = {
      version: 1 as const,
      citationId: 'citation-1',
      turnId: 'turn-1',
      messageId: 'message-1',
      textHash: 'a'.repeat(64),
      exactClaim: 'A supported claim.',
      start: 0,
      end: 18,
      url: 'https://example.com/research',
      title: 'Example research',
      support: 'server-validated' as const,
    };

    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({
      type: 'data-claim-citation', id: citation.citationId, data: citation,
    })}`);
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({
      type: 'data-claim-citation', id: citation.citationId, data: citation,
    })}`);
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({
      type: 'data-claim-citation', id: 'crossed-id', data: citation,
    })}`);

    expect(state.citations).toEqual([citation]);
  });

  it('treats an error finish as provider failure', () => {
    const initial: AgentStreamState = { text: '', citations: [], attempts: {}, providerFailed: false };
    const result = consumeAgentStreamLine(initial, `data: ${JSON.stringify({
      type: 'finish', finishReason: 'error',
    })}`);

    expect(result.providerFailed).toBe(true);
  });
});

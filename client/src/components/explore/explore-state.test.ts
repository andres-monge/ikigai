import { describe, expect, it } from 'vitest';
import { consumeAgentStreamLine, type AgentStreamState } from './explore-state';

const initial = (): AgentStreamState => ({
  text: '', citations: [], operationEvents: [], providerFailed: false,
});

const status = (sequence: 0 | 1, value: 'Saving' | 'Saved' = sequence === 0 ? 'Saving' : 'Saved') => ({
  version: 1, turnId: 'turn-1', messageId: 'message-1', operationId: 'operation-1',
  operation: 'select-purpose-path', authoritativeRevision: sequence === 0 ? null : 2,
  status: value, sequence,
});

describe('agent stream assembly', () => {
  it('collects validated correlated operation events without owning their visible lifecycle', () => {
    let state = consumeAgentStreamLine(initial(), `data: ${JSON.stringify({
      type: 'data-operation-status', id: 'operation-1', data: status(0), transient: true,
    })}`);
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({
      type: 'data-operation-status', id: 'operation-1', data: status(1), transient: true,
    })}`);
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({
      type: 'data-operation-status', id: 'operation-1', data: status(1), transient: true,
    })}`);
    expect(state.operationEvents).toEqual([status(0), status(1)]);
  });

  it('accumulates split text, citations, and provider failure while ignoring malformed input', () => {
    let state = consumeAgentStreamLine(initial(), `data: ${JSON.stringify({ type: 'text-delta', id: 't', delta: 'Hello ' })}`);
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({ type: 'text-delta', id: 't', delta: '<unsafe>' })}`);
    state = consumeAgentStreamLine(state, 'data: {bad json');
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({ type: 'finish', finishReason: 'error' })}`);
    expect(state.text).toBe('Hello <unsafe>');
    expect(state.providerFailed).toBe(true);
  });

  it('keeps one schema-valid citation and rejects duplicate or invalid citation parts', () => {
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
    const part = { type: 'data-claim-citation', id: citation.citationId, data: citation };

    let state = consumeAgentStreamLine(initial(), `data: ${JSON.stringify(part)}`);
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify(part)}`);
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({ ...part, id: 'crossed-citation-id' })}`);
    state = consumeAgentStreamLine(state, `data: ${JSON.stringify({
      ...part,
      data: { ...citation, citationId: 'citation-2', url: 'http://example.com/not-allowed' },
      id: 'citation-2',
    })}`);

    expect(state.citations).toEqual([citation]);
  });
});

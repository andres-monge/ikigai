import { describe, expect, it, vi } from 'vitest';
import { createCareerMap } from '../../shared/career-map/index.js';
import type { AgentTurnRecord, IStorage } from '../storage.js';
import { reconcileCancelledToolCalls } from './cancelled-tool-calls.js';

function fixture() {
  const past = { userId: 'owner', turnId: 'past', clientMessageId: 'past-message', status: 'cancelled', terminalResult: { kind: 'cancelled', internalContextItemIds: ['context'] } } as AgentTurnRecord;
  const turn = { userId: 'owner', turnId: 'current', clientMessageId: 'current-message', leaseId: 'lease', status: 'pending' } as AgentTurnRecord;
  let items: Record<string, unknown>[] = [
    { id: 'context', type: 'message', role: 'user', content: [] },
    { id: 'call', type: 'function_call', name: 'propose_why', call_id: 'call-id', status: 'completed' },
  ];
  const lease = { userId: 'owner', turnId: turn.turnId, leaseId: turn.leaseId, expiresAt: new Date('2999-01-01') };
  const storage = {
    listAgentTurns: vi.fn(async () => [past, turn]),
    getAgentTurn: vi.fn(async (_user: string, id: string) => id === past.clientMessageId ? past : turn),
    getConversationMapping: vi.fn(async () => 'conversation'),
    getTurnLease: vi.fn(async () => lease),
    loadCareerMap: vi.fn(async () => ({ status: 'ready', map: createCareerMap('owner') })),
  };
  const client = {
    listItems: vi.fn(async (_input?: { abortSignal?: AbortSignal }) => ({ data: items, hasMore: false })),
    deleteConversationItem: vi.fn(async ({ itemId }: { itemId: string }) => { items = items.filter(item => item.id !== itemId); }),
  };
  const run = () => reconcileCancelledToolCalls({ storage: storage as unknown as IStorage, client, userId: 'owner', conversationId: 'conversation', turn, operationId: (turnId, callId) => `${turnId}:${callId}`, abortSignal: new AbortController().signal });
  return { past, turn, items, lease, storage, client, run };
}

describe('cancelled provider call reconciliation', () => {
  it('is idempotent and keeps user messages and paired tool calls', async () => {
    const f = fixture();
    f.items.push({ id: 'paired', type: 'function_call', call_id: 'paired' }, { id: 'output', type: 'function_call_output', call_id: 'paired' });
    await f.run(); await f.run();
    expect(f.client.deleteConversationItem).toHaveBeenCalledOnce();
    expect((await f.client.listItems()).data.map(item => item.id)).toEqual(['context', 'paired', 'output']);
  });
  it.each(['mapping', 'lease', 'expired', 'current', 'past'])('rejects changed %s ownership without deletion', async (change) => {
    const f = fixture();
    if (change === 'mapping') f.storage.getConversationMapping.mockResolvedValue('other');
    if (change === 'lease') f.lease.leaseId = 'other';
    if (change === 'expired') f.lease.expiresAt = new Date(0);
    if (change === 'current') f.turn.status = 'completed';
    if (change === 'past') f.storage.getAgentTurn.mockImplementation(async (_user, id) => id === f.past.clientMessageId ? { ...f.past, status: 'pending' } : f.turn);
    await expect(f.run()).rejects.toThrow();
    expect(f.client.deleteConversationItem).not.toHaveBeenCalled();
  });
  it.each(['unknown-context', 'duplicate-call', 'non-method', 'incomplete'])('fails closed on %s protocol evidence', async (change) => {
    const f = fixture();
    if (change === 'unknown-context') f.items.splice(1, 0, { id: 'unknown', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'context\n' + JSON.stringify({ version: 1, marker: 'ctx_' + 'a'.repeat(32) }) }] });
    if (change === 'duplicate-call') f.items.push({ ...f.items[1], id: 'duplicate' });
    if (change === 'non-method') f.items[1].name = 'unknown_tool';
    if (change === 'incomplete') f.items[1].status = 'in_progress';
    await expect(f.run()).rejects.toThrow();
    expect(f.client.deleteConversationItem).not.toHaveBeenCalled();
  });
  it('ends a stalled provider preflight within its own timeout without deleting items', async () => {
    const f = fixture();
    const nativeTimeout = AbortSignal.timeout;
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(1));
    f.client.listItems.mockImplementation(input => new Promise((_resolve, reject) => {
      const unbounded = setTimeout(() => reject(new Error('Preflight still waiting')), 50);
      input!.abortSignal!.addEventListener('abort', () => {
        clearTimeout(unbounded); reject(input!.abortSignal!.reason);
      }, { once: true });
    }));
    try {
      await expect(f.run()).rejects.toMatchObject({ name: 'TimeoutError' });
      expect(timeout).toHaveBeenCalledWith(10_000);
      expect(f.client.deleteConversationItem).not.toHaveBeenCalled();
    } finally { timeout.mockRestore(); }
  });
  it('ignores foreign cancelled turns without accessing their provider history', async () => {
    const f = fixture(); f.past.userId = 'other';
    await f.run();
    expect(f.client.listItems).not.toHaveBeenCalled();
    expect(f.client.deleteConversationItem).not.toHaveBeenCalled();
  });
  it('retries only remaining items after a partial provider deletion failure', async () => {
    const f = fixture();
    f.items.push({ ...f.items[1], id: 'second', call_id: 'second-call' });
    const remove = f.client.deleteConversationItem.getMockImplementation()!;
    f.client.deleteConversationItem.mockImplementationOnce(remove).mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(f.run()).rejects.toThrow('provider unavailable');
    await f.run();
    expect(f.client.deleteConversationItem.mock.calls.map(([input]) => input.itemId)).toEqual(['call', 'second', 'second']);
  });
  it('stops after a mapping change between item deletions', async () => {
    const f = fixture();
    f.items.push({ ...f.items[1], id: 'second', call_id: 'second-call' });
    const remove = f.client.deleteConversationItem.getMockImplementation()!;
    f.client.deleteConversationItem.mockImplementation(async input => { await remove(input); f.storage.getConversationMapping.mockResolvedValue('erased'); });
    await expect(f.run()).rejects.toThrow('OwnershipLost');
    expect(f.client.deleteConversationItem).toHaveBeenCalledOnce();
  });
});

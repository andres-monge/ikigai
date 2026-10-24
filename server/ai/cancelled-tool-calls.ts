import type { AgentTurnRecord, IStorage } from '../storage.js';
import {
  listConversationItems,
  providerInternalContextMarker,
  resolveInternalContextItemIds,
  type ConversationItemsClient,
} from './history.js';
import { OPERATION_TO_TOOL_NAME } from './tools.js';

// A cancelled stream can leave a stored call whose output was never sent.
// Remove that protocol item only; the canonical operation receipt remains authoritative.
export async function reconcileCancelledToolCalls(input: {
  storage: IStorage;
  client: ConversationItemsClient;
  userId: string;
  conversationId: string;
  turn: AgentTurnRecord;
  operationId: (turnId: string, callId: string) => string;
  abortSignal: AbortSignal;
}): Promise<void> {
  const { storage, client, userId, conversationId, turn } = input;
  const turns = await storage.listAgentTurns(userId);
  const cancelled = turns.filter(candidate => candidate.userId === userId
    && candidate.status === 'cancelled' && candidate.terminalResult?.kind === 'cancelled');
  if (!cancelled.length) return;
  const abortSignal = AbortSignal.any([input.abortSignal, AbortSignal.timeout(10_000)]);
  const assertOwner = async () => {
    abortSignal.throwIfAborted();
    const [lease, current, mapping] = await Promise.all([
      storage.getTurnLease(userId),
      storage.getAgentTurn(userId, turn.clientMessageId),
      storage.getConversationMapping(userId),
    ]);
    if (mapping !== conversationId || current?.status !== 'pending'
      || current.userId !== userId || current.turnId !== turn.turnId || current.leaseId !== turn.leaseId
      || lease?.userId !== userId || lease.turnId !== turn.turnId || lease.leaseId !== turn.leaseId
      || lease.expiresAt.getTime() <= Date.now()) throw new Error('CancelledToolRecoveryOwnershipLost');
  };
  await assertOwner();
  const items = await listConversationItems({ client, conversationId, abortSignal });
  const contexts = new Map<string, AgentTurnRecord[]>();
  for (const candidate of turns.filter(candidate => candidate.userId === userId)) {
    const terminal = candidate.terminalResult;
    const ids = Array.isArray(terminal?.internalContextItemIds)
      ? terminal.internalContextItemIds.filter((id): id is string => typeof id === 'string') : [];
    const markers = Array.isArray(terminal?.internalContextMarkers)
      ? terminal.internalContextMarkers.filter((marker): marker is string => typeof marker === 'string') : [];
    const resolved = resolveInternalContextItemIds(items, markers);
    for (const id of new Set([...ids, ...resolved.itemIds])) {
      contexts.set(id, [...(contexts.get(id) ?? []), candidate]);
    }
  }
  const records = items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  const outputs = new Set(records.filter(item => item.type === 'function_call_output').map(item => item.call_id));
  const callCounts = new Map<unknown, number>();
  for (const item of records.filter(item => item.type === 'function_call')) {
    callCounts.set(item.call_id, (callCounts.get(item.call_id) ?? 0) + 1);
  }
  const operations = new Map<string, string>(Object.entries(OPERATION_TO_TOOL_NAME).map(([operation, name]) => [name, operation]));
  const candidates: Array<{ itemId: string; callId: string; operation: string; owner: AgentTurnRecord }> = [];
  let owner: AgentTurnRecord | undefined;
  for (const item of records) {
    const owners = typeof item.id === 'string' ? contexts.get(item.id) : undefined;
    if (owners || providerInternalContextMarker(item)) owner = owners?.length === 1 ? owners[0] : undefined;
    if (item.type !== 'function_call' || outputs.has(item.call_id)) continue;
    const operation = typeof item.name === 'string' ? operations.get(item.name) : undefined;
    if (!owner || !cancelled.includes(owner) || owner.turnId === turn.turnId
      || item.status !== 'completed' || typeof item.id !== 'string' || !item.id.length || item.id.length > 200
      || typeof item.call_id !== 'string' || !item.call_id.length || callCounts.get(item.call_id) !== 1
      || !operation) throw new Error('UnboundCancelledToolCall');
    candidates.push({ itemId: item.id, callId: item.call_id, operation, owner });
  }
  for (const candidate of candidates) {
    await assertOwner();
    const previous = await storage.getAgentTurn(userId, candidate.owner.clientMessageId);
    if (previous?.userId !== userId || previous.turnId !== candidate.owner.turnId
      || previous.status !== 'cancelled' || previous.terminalResult?.kind !== 'cancelled') {
      throw new Error('CancelledToolRecoveryOwnershipLost');
    }
    const state = await storage.loadCareerMap(userId);
    if (state.status !== 'ready') throw new Error('CancelledToolRecoveryStateUnavailable');
    const receipt = state.map.operationHistory.find(receipt => receipt.sourceId === input.operationId(previous.turnId, candidate.callId));
    if (receipt && receipt.operationType !== candidate.operation) throw new Error('CancelledToolRecoveryReceiptMismatch');
    if (!client.deleteConversationItem) throw new Error('CancelledToolRecoveryUnavailable');
    await client.deleteConversationItem({ conversationId, itemId: candidate.itemId, abortSignal });
  }
  await assertOwner();
}

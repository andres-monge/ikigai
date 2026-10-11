import { describe, expect, it, vi } from 'vitest';
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as agentModule from './agent.js';
import { createCareerMap, applyCareerMapOperation } from '../../shared/career-map/index.js';
import { createAgentTurnPersistenceContext, type IStorage } from '../storage.js';
import { createReplayStorage, createReplayFetch, runReplay, replayPrefixPreserved } from '../../scripts/replay-revelio.js';

const turn = { userId: 'replay-user', turnId: 'replay-turn', clientMessageId: 'message-replay', leaseId: 'replay-lease', requestFingerprint: 'replay-fingerprint', origin: 'agent-turn' as const };
const operation = { type: 'append-foundation-evidence' as const, sourceId: 'replay-op', expectedRevision: 0, occurredAt: '2026-10-02T10:00:00.000Z', payload: { evidence: { id: 'replay-evidence', revision: 1, category: 'fascination' as const, content: 'Making useful tools', provenance: { kind: 'user-message' as const, actionId: turn.clientMessageId, turnId: turn.turnId, turnSequence: 1, occurredAt: '2026-10-02T10:00:00.000Z' } } } };
function input(): Parameters<IStorage['persistCareerMapOperation']>[0] { return { userId: turn.userId, leaseId: turn.leaseId, context: createAgentTurnPersistenceContext(turn, { turnSequence: 1, occurredAt: operation.occurredAt }), operation, moduleVersion: 'replay-test' }; }

describe('isolated Revelio replay', () => {
  it('accepts provider-added empty output-text defaults without accepting changed history', () => {
    const prior = [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Confirmed direction.' }] }, { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Yes.' }] }];
    const seeded = prior.map((item, index) => ({ ...item, id: `msg_${index}`, status: 'completed', content: item.content.map(part => part.type === 'output_text' ? { ...part, annotations: [], logprobs: [] } : part) }));
    expect(replayPrefixPreserved(seeded, prior)).toBe(true);
    expect(replayPrefixPreserved([...seeded].reverse(), prior)).toBe(false);
    expect(replayPrefixPreserved(seeded.slice(1), prior)).toBe(false);
    for (const changedPart of [{ text: 'Changed.' }, { annotations: [{ type: 'url_citation', url: 'https://example.com' }] }, { logprobs: [{ token: 'Changed', logprob: -1 }] }]) {
      const changed = structuredClone(seeded);
      Object.assign(changed[0].content[0], changedPart);
      expect(replayPrefixPreserved(changed, prior)).toBe(false);
    }
    const changedRole = structuredClone(seeded);
    changedRole[0].role = 'user';
    expect(replayPrefixPreserved(changedRole, prior)).toBe(false);
  });
  it('ends a stalled provider request at the replay deadline', async () => {
    const deadline = AbortSignal.timeout(20);
    const guarded = createReplayFetch(async (request) => new Promise<Response>((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
    }), deadline);
    await expect(guarded('https://api.openai.com/v1/conversations', { method: 'POST', body: '{}' })).rejects.toMatchObject({ name: 'TimeoutError' });
  });
  it.each(['while reading', 'before stream starts'])('cancels a stalled response stream when the deadline expires %s', async (timing) => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'replay-deadline-')));
    let streamCancelled = false;
    vi.spyOn(agentModule, 'createMethodAgent').mockReturnValue({ stream: async ({ abortSignal }: { abortSignal: AbortSignal }) => {
      if (timing === 'before stream starts') await new Promise<void>((resolve) => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
      return {
        stream: new ReadableStream({ cancel() { streamCancelled = true; } }),
        internalContextMarkers: Promise.resolve([]), providerVisibleText: () => '', canonicalPurposePathsOffer: () => false,
      };
    } } as never);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id: 'conv_replay' }), { headers: { 'content-type': 'application/json' } }));
    try {
      await cp(path.resolve('server/ai/method/skills'), path.join(root, 'instructions/skills'), { recursive: true });
      await writeFile(path.join(root, 'instructions/base.txt'), 'Exact private instructions.');
      await writeFile(path.join(root, 'env'), 'OPENAI_API_KEY=unused-test-value');
      await writeFile(path.join(root, 'case.json'), JSON.stringify({ label: 'Stalled response', sourceConversationId: 'conv_source', initialMap: createCareerMap(turn.userId), priorTurns: [], priorItems: [], currentMessage: 'Offer paths.', historicalReply: '', provenance: {} }));
      await expect(runReplay({ casePath: path.join(root, 'case.json'), instructionsPath: path.join(root, 'instructions'), outputPath: path.join(root, 'output'), envPath: path.join(root, 'env'), deadlineMs: 50 })).rejects.toMatchObject({ name: 'TimeoutError' });
      expect(streamCancelled).toBe(true);
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); }
  });
  it('preserves engine output and binding diagnostics when an empty final reply prevents continuation', async () => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'replay-diagnostics-')));
    const output = path.join(root, 'output');
    vi.spyOn(agentModule, 'createMethodAgent').mockReturnValue({ stream: async () => ({
      stream: new ReadableStream({ start(controller) { controller.close(); } }),
      internalContextMarkers: Promise.resolve([]), providerVisibleText: () => '', canonicalPurposePathsOffer: () => false,
    }) } as never);
    vi.stubGlobal('fetch', async (request: Request) => new Response(JSON.stringify(
      new URL(request.url).pathname === '/v1/conversations' ? { id: 'conv_replay' } : { data: [], has_more: false },
    ), { headers: { 'content-type': 'application/json' } }));
    try {
      await cp(path.resolve('server/ai/method/skills'), path.join(root, 'instructions/skills'), { recursive: true });
      await writeFile(path.join(root, 'instructions/base.txt'), 'Exact private instructions.');
      await writeFile(path.join(root, 'env'), 'OPENAI_API_KEY=unused-test-value');
      await writeFile(path.join(root, 'case.json'), JSON.stringify({ label: 'Empty final reply', sourceConversationId: 'conv_source', initialMap: createCareerMap(turn.userId), priorTurns: [], priorItems: [], currentMessage: 'Offer paths.', historicalReply: '', provenance: {} }));
      await expect(runReplay({ casePath: path.join(root, 'case.json'), instructionsPath: path.join(root, 'instructions'), outputPath: output, envPath: path.join(root, 'env'), captureContinuation: true })).rejects.toThrow('Replay terminal history unavailable');
      expect(JSON.parse(await readFile(path.join(output, 'result.json'), 'utf8'))).toMatchObject({ reply: '', canonicalPurposePathsOffer: false, errors: [] });
      expect(JSON.parse(await readFile(path.join(output, 'terminal-history-diagnostic.json'), 'utf8'))).toMatchObject({ bindingComplete: true, projectionAvailable: false, replyLength: 0, providerVisibleReplyLength: 0 });
      expect(JSON.parse(await readFile(path.join(output, 'provider-requests.json'), 'utf8'))).toEqual([]);
      await expect(readFile(path.join(output, 'continuation.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); }
  });
  it('commits only to the clone, preserves reducer replay/rejection, and returns independent reads', async () => {
    const source = createCareerMap(turn.userId);
    const storage = createReplayStorage(source, [], turn);
    const first = await storage.persistCareerMapOperation(input());
    expect(first.status).toBe('committed');
    expect(source.revision).toBe(0);
    expect((await storage.persistCareerMapOperation(input())).status).toBe('replayed');
    const wrongRevision = { ...input(), operation: { ...operation, sourceId: 'new-op', expectedRevision: 0 } };
    expect((await storage.persistCareerMapOperation(wrongRevision)).status).toBe('rejected');
    const loaded = await storage.loadCareerMap(turn.userId);
    loaded.map.revision = 999;
    expect((await storage.loadCareerMap(turn.userId)).map.revision).toBe(1);
  });
  it('rejects a wrong owner or turn and an aborted write before mutation', async () => {
    const storage = createReplayStorage(createCareerMap(turn.userId), [], turn);
    await expect(storage.loadCareerMap('other-user')).rejects.toThrow();
    await expect(storage.persistCareerMapOperation({ ...input(), leaseId: 'live-lease' })).rejects.toThrow();
    await expect(storage.persistCareerMapOperation({ ...input(), context: { ...input().context, turnId: 'live-turn' } })).rejects.toThrow();
    const abort = new AbortController(); abort.abort();
    await expect(storage.persistCareerMapOperation({ ...input(), abortSignal: abort.signal })).rejects.toThrow();
    expect((await storage.loadCareerMap(turn.userId)).map.revision).toBe(0);
  });
  it('accepts confirmation only from a completed prior presentation, preserving the parent map', async () => {
    const at = '2026-10-03T10:00:00.000Z';
    const proposed = applyCareerMapOperation(createCareerMap(turn.userId), {
      type: 'propose-why', sourceId: 'proposal', expectedRevision: 0, occurredAt: at,
      payload: { why: { id: 'why-one', revision: 1, statement: 'Make difficult choices actionable.', serves: 'People in transition', pointOfView: 'Clarity should help people act.' }, presentation: { kind: 'model-presentation', assistantTurnId: 'prior-proposal-turn', turnSequence: 1, completed: true, presentedAt: at } },
    });
    expect(proposed.status).toBe('committed');
    if (proposed.status !== 'committed') throw new Error('Invalid proposal fixture.');
    const context = createAgentTurnPersistenceContext(turn, { turnSequence: 2, occurredAt: at });
    const confirmation: Parameters<IStorage['persistCareerMapOperation']>[0] = { userId: turn.userId, leaseId: turn.leaseId, context,
      moduleVersion: 'replay-test', operation: { type: 'confirm-why', sourceId: 'confirmation', expectedRevision: 1, occurredAt: at, payload: { whyId: 'why-one', whyRevision: 1, action: context.action } } };
    const unavailable = createReplayStorage(proposed.map, [], turn);
    expect((await unavailable.persistCareerMapOperation(confirmation)).status).toBe('rejected');
    expect((await unavailable.loadCareerMap(turn.userId)).map.revision).toBe(1);
    const prior = { ...turn, turnId: 'prior-proposal-turn', status: 'completed' as const, terminalResult: { kind: 'completed', displayProjection: { userItemId: 'prior-user', assistantItemIds: ['prior-assistant'] } }, createdAt: new Date(at), updatedAt: new Date(at), terminalAt: new Date(at) };
    const available = createReplayStorage(proposed.map, [prior], turn);
    expect((await available.persistCareerMapOperation(confirmation)).status).toBe('committed');
    expect((await available.loadCareerMap(turn.userId)).map.foundation.whyRevisions[0].status).toBe('confirmed');
    expect(proposed.map.foundation.whyRevisions[0].status).toBe('suggested');
  });
  it('blocks writes to source Conversations, live databases and application endpoints', async () => {
    let calls = 0;
    const guarded = createReplayFetch(async () => { calls += 1; return new Response(JSON.stringify({ id: 'conv_replay' }), { headers: { 'content-type': 'application/json' } }); });
    await expect(guarded('https://api.openai.com/v1/responses', { method: 'POST', body: JSON.stringify({ conversation: 'conv_source' }) })).rejects.toThrow();
    await expect(guarded('http://localhost:5173/api/agent', { method: 'POST' })).rejects.toThrow();
    await expect(guarded('https://example.neon.tech/sql', { method: 'POST' })).rejects.toThrow();
    expect(calls).toBe(0);
    await guarded('https://api.openai.com/v1/conversations', { method: 'POST', body: '{}' });
    await guarded('https://api.openai.com/v1/responses', { method: 'POST', body: JSON.stringify({ conversation: 'conv_replay' }) });
    await guarded('https://api.openai.com/v1/conversations/conv_replay/items', { method: 'POST', body: '{"items":[]}' });
    await expect(guarded('https://api.openai.com/v1/conversations/conv_source/items', { method: 'POST', body: '{}' })).rejects.toThrow();
    await guarded('https://api.openai.com/v1/conversations/conv_replay/items?limit=100&order=asc', { method: 'GET' });
    await guarded('https://api.openai.com/v1/conversations/conv_replay/items?limit=20&order=desc&after=msg_123', { method: 'GET' });
    await expect(guarded('https://api.openai.com/v1/conversations/conv_source/items?limit=100&order=asc')).rejects.toThrow();
    await expect(guarded('https://api.openai.com/v1/conversations/conv_replay/items?limit=1000&order=asc')).rejects.toThrow();
    await expect(guarded('https://api.openai.com/v1/conversations/conv_replay/items?limit=100&order=asc&extra=source')).rejects.toThrow();
    await expect(guarded('https://api.openai.com/v1/conversations/conv_replay/items?limit=100&order=asc&after=../source')).rejects.toThrow();
    expect(calls).toBe(5);
  });
});

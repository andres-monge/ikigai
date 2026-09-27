import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  conversationHistoryPageSchema,
  NORMALIZED_HISTORY_MAX_CITATIONS,
  NORMALIZED_HISTORY_MAX_PARTS,
  NORMALIZED_HISTORY_MAX_TEXT_LENGTH,
} from '../../shared/streaming-schemas.js';
import {
  ConversationHistoryProviderError,
  OpenAIConversationClient,
  createConversationHistoryCursorCodec,
  listRecentConversationItems,
  loadConversationHistory,
  normalizeConversationItems,
  resolveAssistantDisplayProjection,
  resolveDisplayProjection,
  resolveInternalContextItemIds,
} from './history.js';
import { PURPOSE_PATHS_OFFER_ENGLISH } from './method/base-instructions.js';

function textDigest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function durableTurn(input: {
  turnId: string;
  status?: 'pending' | 'completed' | 'cancelled' | 'failed';
  userItemId?: string;
  assistantItemId?: string;
  assistantItemIds?: string[];
  terminalResult?: Record<string, unknown> | null;
  createdAt?: string;
  origin?: 'agent-turn' | 'workspace-action';
}) {
  const status = input.status ?? 'completed';
  const occurredAt = new Date(input.createdAt ?? '2030-01-01T00:00:00.000Z');
  return {
    turnId: input.turnId,
    userId: 'explorer-1',
    clientMessageId: `${input.turnId}-message`,
    requestFingerprint: `${input.turnId}-fingerprint`,
    origin: input.origin ?? 'agent-turn' as const,
    leaseId: `${input.turnId}-lease`,
    status,
    terminalResult: input.terminalResult !== undefined
      ? input.terminalResult
      : status === 'completed' ? {
        kind: 'completed', refetch: true,
        displayProjection: {
          userItemId: input.userItemId ?? `${input.turnId}-user-item`,
          assistantItemIds: input.assistantItemIds
            ?? [input.assistantItemId ?? `${input.turnId}-assistant-item`],
        },
      } : status === 'pending' ? null : { kind: status, refetch: true },
    createdAt: occurredAt,
    updatedAt: occurredAt,
    terminalAt: status === 'pending' ? null : occurredAt,
  };
}

describe('protected OpenAI Conversation history adapter', () => {
  it('hydrates the canonical offer from a provider-bound revised set without exposing model prose', async () => {
    const rawReply = 'The three paths have changed. Which would you pick?';
    const turn = durableTurn({
      turnId: 'revised-paths', userItemId: 'revision-user', assistantItemId: 'revision-assistant',
      terminalResult: {
        kind: 'completed', refetch: true, canonicalPurposePathsOffer: true,
        displayProjection: { userItemId: 'revision-user', assistantItemIds: ['revision-assistant-a', 'revision-assistant'] },
      },
    });
    const loaded = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [turn]),
      },
      client: { listItems: vi.fn(async () => ({
        data: [
          { id: 'revision-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Which would you pick?' }] },
          { id: 'revision-assistant-a', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The three paths have changed. ' }] },
          { id: 'revision-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Revise two paths.' }] },
        ],
        hasMore: false,
      })) },
      userId: 'explorer-1',
    });

    expect(loaded.messages).toHaveLength(2);
    expect(loaded.messages[1]).toMatchObject({
      id: 'revision-assistant', role: 'assistant', isFinalAssistantItem: true,
      parts: [{ type: 'text', text: PURPOSE_PATHS_OFFER_ENGLISH }],
    });
    expect(JSON.stringify(loaded.messages)).not.toContain(rawReply);
    expect(JSON.stringify(loaded.messages)).not.toContain('Which would you pick?');
  });

  it('returns an empty bootstrap without calling the provider when no server mapping exists', async () => {
    const listItems = vi.fn();
    const result = await loadConversationHistory({
      storage: { getConversationMapping: vi.fn(async () => undefined), listAgentTurns: vi.fn(async () => []) },
      client: { listItems },
      userId: 'explorer-1',
    });
    expect(result).toEqual({ status: 'empty', messages: [] });
    expect(listItems).not.toHaveBeenCalled();
  });

  it('derives the Conversation from the owner mapping and fills a bounded page newest-first', async () => {
    const listItems = vi.fn()
      .mockResolvedValueOnce({
        data: [{ id: 'message-2', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Second' }] }],
        hasMore: true,
        lastId: 'message-2',
      })
      .mockResolvedValueOnce({
        data: [{ id: 'message-1', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'First' }] }],
        hasMore: false,
      });
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [
          durableTurn({ turnId: 'turn-1', userItemId: 'message-1', assistantItemId: 'not-present-1' }),
          durableTurn({ turnId: 'turn-2', userItemId: 'not-present-2', assistantItemId: 'message-2', createdAt: '2030-01-01T00:00:01.000Z' }),
        ]),
      },
      client: { listItems },
      userId: 'explorer-1',
    });
    expect(listItems).toHaveBeenNthCalledWith(1, expect.objectContaining({
      conversationId: 'conversation-server-owned',
      after: undefined,
      limit: 40,
      order: 'desc',
    }));
    expect(listItems).toHaveBeenNthCalledWith(2, expect.objectContaining({ after: 'message-2', limit: 39 }));
    expect(result.messages.map((message) => message.id)).toEqual(['message-1', 'message-2']);
  });

  it('bounds newest-first display hydration and resumes older pages through an opaque server cursor', async () => {
    const newest = Array.from({ length: 3 }, (_, index) => ({
      id: `new-${index}`,
      type: 'message',
      role: index % 2 === 0 ? 'assistant' : 'user',
      content: [{ type: index % 2 === 0 ? 'output_text' : 'input_text', text: `New ${index}` }],
    }));
    const older = [{
      id: 'old-0', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Old 0' }],
    }];
    const turns = [
      durableTurn({ turnId: 'old', userItemId: 'old-0', assistantItemId: 'absent-old' }),
      durableTurn({ turnId: 'new-user', userItemId: 'new-1', assistantItemId: 'absent-new' }),
      durableTurn({ turnId: 'new-assistant-0', userItemId: 'absent-0', assistantItemId: 'new-0' }),
      durableTurn({ turnId: 'new-assistant-2', userItemId: 'absent-2', assistantItemId: 'new-2' }),
    ];
    const listItems = vi.fn()
      .mockResolvedValueOnce({ data: newest, hasMore: true, lastId: 'provider-page-token' })
      .mockResolvedValueOnce({ data: older, hasMore: false });
    const storage = {
      getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
      listAgentTurns: vi.fn(async () => turns),
    };
    const cursorCodec = createConversationHistoryCursorCodec('cursor-test-secret-at-least-32-characters');

    const first = await loadConversationHistory({
      storage, client: { listItems }, userId: 'explorer-1', pageSize: 3, cursorCodec,
    });
    expect(first.messages.map((message) => message.id)).toEqual(['new-2', 'new-1', 'new-0']);
    expect(first).toHaveProperty('olderCursor');
    expect(first.olderCursor).not.toContain('provider-page-token');
    expect(first.olderCursor).not.toContain('conversation-server-owned');
    expect(listItems).toHaveBeenCalledTimes(1);
    expect(listItems).toHaveBeenNthCalledWith(1, expect.objectContaining({
      after: undefined, limit: 3, order: 'desc',
    }));

    const second = await loadConversationHistory({
      storage,
      client: { listItems },
      userId: 'explorer-1',
      pageSize: 3,
      cursorCodec,
      cursor: first.olderCursor,
    });
    expect(second.messages.map((message) => message.id)).toEqual(['old-0']);
    expect(second).not.toHaveProperty('olderCursor');
    expect(listItems).toHaveBeenNthCalledWith(2, expect.objectContaining({
      after: 'provider-page-token', limit: 3, order: 'desc',
    }));
  });

  it('marks exactly the eighth and final assistant display item across newest and older pages', async () => {
    const assistants = Array.from({ length: 8 }, (_, index) => ({
      id: `eight-assistant-${index + 1}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: `Display item ${index + 1}` }],
    }));
    const turn = durableTurn({
      turnId: 'eight-items',
      userItemId: 'eight-user',
      assistantItemIds: assistants.map((item) => item.id),
    });
    const listItems = vi.fn()
      .mockResolvedValueOnce({
        data: [...assistants.slice(4)].reverse(),
        hasMore: true,
        lastId: 'eight-page-boundary',
      })
      .mockResolvedValueOnce({
        data: [
          ...assistants.slice(0, 4).reverse(),
          { id: 'eight-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Show the comparison.' }] },
        ],
        hasMore: false,
      });
    const storage = {
      getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
      listAgentTurns: vi.fn(async () => [turn]),
    };
    const cursorCodec = createConversationHistoryCursorCodec('cursor-test-secret-at-least-32-characters');

    const newest = await loadConversationHistory({
      storage, client: { listItems }, userId: 'explorer-1', pageSize: 4, cursorCodec,
    });
    const older = await loadConversationHistory({
      storage, client: { listItems }, userId: 'explorer-1', pageSize: 5,
      cursorCodec, cursor: newest.olderCursor,
    });

    expect(newest.messages.map((message) => message.id)).toEqual([
      'eight-assistant-5', 'eight-assistant-6', 'eight-assistant-7', 'eight-assistant-8',
    ]);
    expect(older.messages.map((message) => message.id)).toEqual([
      'eight-user', 'eight-assistant-1', 'eight-assistant-2', 'eight-assistant-3', 'eight-assistant-4',
    ]);
    const hydrated = [...older.messages, ...newest.messages];
    expect(hydrated.filter((message) => message.turn?.turnId === 'eight-items')).toHaveLength(9);
    expect(hydrated.filter((message) => message.isFinalAssistantItem)).toEqual([
      expect.objectContaining({
        id: 'eight-assistant-8',
        role: 'assistant',
        turn: { turnId: 'eight-items', status: 'completed' },
      }),
    ]);
  });

  it('rejects a cursor minted for another Conversation without provider access', async () => {
    const secret = 'cursor-test-secret-at-least-32-characters';
    const cursor = createConversationHistoryCursorCodec(secret)
      .encode({ conversationId: 'conversation-other', after: 'provider-after' });
    const cursorCodec = createConversationHistoryCursorCodec(secret);
    expect(cursorCodec.decode(cursor)).toEqual({
      conversationId: 'conversation-other', after: 'provider-after',
    });
    const listItems = vi.fn();
    await expect(loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-owner'),
        listAgentTurns: vi.fn(async () => []),
      },
      client: { listItems },
      userId: 'explorer-1',
      cursor,
      cursorCodec,
    })).rejects.toBeInstanceOf(ConversationHistoryProviderError);
    expect(listItems).not.toHaveBeenCalled();
  });

  it('fails closed instead of issuing an unstable older cursor when no codec is injected', async () => {
    await expect(loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-owner'),
        listAgentTurns: vi.fn(async () => [durableTurn({
          turnId: 'cursor-required', userItemId: 'missing-user', assistantItemId: 'visible-assistant',
        })]),
      },
      client: {
        listItems: vi.fn(async () => ({
          data: [{
            id: 'visible-assistant', type: 'message', role: 'assistant',
            content: [{ type: 'output_text', text: 'Visible' }],
          }],
          hasMore: true,
          lastId: 'visible-assistant',
        })),
      },
      userId: 'explorer-1',
      pageSize: 1,
    })).rejects.toBeInstanceOf(ConversationHistoryProviderError);
  });

  it('reads one newest page for terminal projection and restores chronological order', async () => {
    const listItems = vi.fn(async () => ({
      data: [{ id: 'newest' }, { id: 'older' }],
      hasMore: true,
      lastId: 'older',
    }));

    await expect(listRecentConversationItems({
      client: { listItems },
      conversationId: 'conversation-server-owned',
    })).resolves.toEqual([{ id: 'older' }, { id: 'newest' }]);
    expect(listItems).toHaveBeenCalledOnce();
    expect(listItems).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-server-owned',
      limit: 100,
      order: 'desc',
    }));
  });

  it('projects only completed durable-turn display text and ignores raw pre-tool, rejected, conflicted, and aborted provider text', async () => {
    const providerSentinels = ['PRE_TOOL_ASSISTANT_SENTINEL', 'REJECTED_STEP_SENTINEL', 'CONFLICT_STEP_SENTINEL', 'ABORTED_STEP_SENTINEL', 'RAW_PROVIDER_PAYLOAD_SENTINEL'];
    const listItems = vi.fn(async () => ({
      data: [
        { id: 'safe-user-item', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Safe user' }] },
        ...providerSentinels.map((text, index) => ({
        id: `raw-${index}`, type: 'message', role: 'assistant',
        content: [{ type: 'output_text', text }], raw: { payload: text },
        })),
        { id: 'safe-assistant-item', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Safe authoritative narration' }] },
      ].reverse(),
      hasMore: false,
    }));
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [
          durableTurn({ turnId: 'completed', userItemId: 'safe-user-item', assistantItemId: 'safe-assistant-item' }),
          durableTurn({ turnId: 'cancelled', status: 'cancelled', createdAt: '2030-01-01T00:00:01.000Z' }),
          durableTurn({ turnId: 'failed', status: 'failed', createdAt: '2030-01-01T00:00:02.000Z' }),
        ]),
      },
      client: { listItems },
      userId: 'explorer-1',
    });

    expect(result.messages).toMatchObject([
      { id: 'safe-user-item', role: 'user', parts: [{ type: 'text', text: 'Safe user' }] },
      { id: 'safe-assistant-item', role: 'assistant', parts: [{ type: 'text', text: 'Safe authoritative narration' }] },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/PRE_TOOL|REJECTED|CONFLICT|ABORTED|RAW_PROVIDER/);
  });

  it('projects authoritative committed, conflict, and rejected narration while excluding each pre-result assistant step', async () => {
    const outcomes = ['committed', 'conflict', 'rejected'];
    const data = outcomes.flatMap((outcome) => [
      { id: `${outcome}-user`, type: 'message', role: 'user', content: [{ type: 'input_text', text: `${outcome} request` }] },
      { id: `${outcome}-pre`, type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `${outcome} premature claim` }] },
      { id: `${outcome}-final`, type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `${outcome} authoritative narration` }] },
    ]);
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => outcomes.map((outcome) => durableTurn({
          turnId: outcome,
          userItemId: `${outcome}-user`,
          assistantItemId: `${outcome}-final`,
        }))),
      },
      client: { listItems: vi.fn(async () => ({ data: [...data].reverse(), hasMore: false })) },
      userId: 'explorer-1',
    });

    expect(result.messages.map((message) => message.id)).toEqual(outcomes.flatMap((outcome) => [
      `${outcome}-user`, `${outcome}-final`,
    ]));
    expect(JSON.stringify(result)).not.toContain('premature claim');
  });

  it('recovers a completed pending projection after provider eventual consistency and backfills only provider item ids', async () => {
    const userText = 'Help me understand what this pattern might mean.';
    const safeAssistantText = 'It may point to work where you can test an idea in the real world.';
    const pendingTurn = durableTurn({
      turnId: 'eventual-completed',
      terminalResult: {
        kind: 'completed',
        refetch: true,
        displayRecovery: {
          status: 'pending',
          userTextDigest: textDigest(userText),
          assistantTextDigest: textDigest(safeAssistantText),
          assistantTextLength: safeAssistantText.length,
          retainPartial: false,
        },
      },
    });
    const backfillAgentTurnDisplayProjection = vi.fn(async () => undefined);
    const storage = {
      getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
      listAgentTurns: vi.fn(async () => [pendingTurn]),
      backfillAgentTurnDisplayProjection,
    };
    const listItems = vi.fn()
      .mockRejectedValueOnce(new ConversationHistoryProviderError('list', 503))
      .mockResolvedValueOnce({
        data: [
          { id: 'eventual-assistant-b', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'test an idea in the real world.' }] },
          { id: 'eventual-assistant-a', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'It may point to work where you can ' }] },
        ],
        hasMore: true,
        lastId: 'eventual-assistant-a',
      })
      .mockResolvedValueOnce({
        data: [
          { id: 'unsafe-pre-tool', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'UNSAFE_PRE_TOOL_CLAIM' }] },
          { id: 'eventual-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: userText }] },
        ],
        hasMore: false,
      });

    await expect(loadConversationHistory({
      storage,
      client: { listItems },
      userId: 'explorer-1',
    })).rejects.toBeInstanceOf(ConversationHistoryProviderError);

    const recovered = await loadConversationHistory({
      storage,
      client: { listItems },
      userId: 'explorer-1',
    });

    expect(recovered.messages).toMatchObject([
      { id: 'eventual-user', role: 'user', parts: [{ type: 'text', text: userText }] },
      { id: 'eventual-assistant-a', role: 'assistant', parts: [{ type: 'text', text: 'It may point to work where you can ' }] },
      { id: 'eventual-assistant-b', role: 'assistant', parts: [{ type: 'text', text: 'test an idea in the real world.' }] },
    ]);
    expect(listItems).toHaveBeenNthCalledWith(3, expect.objectContaining({ after: 'eventual-assistant-a' }));
    expect(backfillAgentTurnDisplayProjection).toHaveBeenCalledOnce();
    expect(backfillAgentTurnDisplayProjection).toHaveBeenCalledWith({
      userId: 'explorer-1',
      turnId: 'eventual-completed',
      displayProjection: {
        userItemId: 'eventual-user',
        assistantItemIds: ['eventual-assistant-a', 'eventual-assistant-b'],
      },
    });
    expect(JSON.stringify(pendingTurn.terminalResult)).not.toContain(userText);
    expect(JSON.stringify(pendingTurn.terminalResult)).not.toContain(safeAssistantText);
    expect(JSON.stringify(recovered)).not.toContain('UNSAFE_PRE_TOOL_CLAIM');
  });

  it('recovers a cancelled safe natural partial with stopped metadata and excludes surrounding unsafe assistant text', async () => {
    const userText = 'I am not ready to decide yet.';
    const safePartial = 'That makes sense. We can stay with';
    const cancelledTurn = durableTurn({
      turnId: 'cancelled-partial',
      status: 'cancelled',
      terminalResult: {
        kind: 'cancelled',
        stopped: true,
        refetch: true,
        displayRecovery: {
          status: 'pending',
          userTextDigest: textDigest(userText),
          assistantTextDigest: textDigest(safePartial),
          assistantTextLength: safePartial.length,
          retainPartial: true,
        },
      },
    });
    const backfillAgentTurnDisplayProjection = vi.fn(async () => undefined);
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [cancelledTurn]),
        backfillAgentTurnDisplayProjection,
      },
      client: {
        listItems: vi.fn(async () => ({
          data: [
            { id: 'cancelled-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: userText }] },
            { id: 'cancelled-pre-tool', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'UNSAFE_PRE_TOOL_TEXT' }] },
            { id: 'cancelled-safe-partial', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: safePartial }] },
            { id: 'cancelled-aborted', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'UNSAFE_ABORTED_TEXT' }] },
          ].reverse(),
          hasMore: false,
        })),
      },
      userId: 'explorer-1',
    });

    expect(result.messages).toMatchObject([
      {
        id: 'cancelled-user', role: 'user', parts: [{ type: 'text', text: userText }],
        turn: { turnId: 'cancelled-partial', status: 'cancelled' },
      },
      {
        id: 'cancelled-safe-partial',
        role: 'assistant',
        parts: [{ type: 'text', text: safePartial }],
        turn: { turnId: 'cancelled-partial', status: 'cancelled' },
        isFinalAssistantItem: true,
        deliveryStatus: 'stopped',
      },
    ]);
    expect(backfillAgentTurnDisplayProjection).toHaveBeenCalledWith({
      userId: 'explorer-1',
      turnId: 'cancelled-partial',
      displayProjection: {
        userItemId: 'cancelled-user',
        assistantItemIds: ['cancelled-safe-partial'],
      },
    });
    expect(JSON.stringify(cancelledTurn.terminalResult)).not.toContain(userText);
    expect(JSON.stringify(cancelledTurn.terminalResult)).not.toContain(safePartial);
    expect(JSON.stringify(result)).not.toMatch(/UNSAFE_PRE_TOOL_TEXT|UNSAFE_ABORTED_TEXT/);
  });

  it('reconciles repeated user text to distinct durable turns without cross-wiring assistants', async () => {
    const repeatedUser = 'Tell me what this means.';
    const stoppedPartial = 'The first answer started here';
    const completedAnswer = 'The later answer completed safely.';
    const turns = [
      durableTurn({
        turnId: 'repeated-cancelled', status: 'cancelled',
        terminalResult: {
          kind: 'cancelled', stopped: true, refetch: true,
          displayRecovery: {
            status: 'pending', userTextDigest: textDigest(repeatedUser),
            assistantTextDigest: textDigest(stoppedPartial), assistantTextLength: stoppedPartial.length,
            retainPartial: true,
          },
        },
      }),
      durableTurn({
        turnId: 'repeated-completed',
        terminalResult: {
          kind: 'completed', refetch: true,
          displayRecovery: {
            status: 'pending', userTextDigest: textDigest(repeatedUser),
            assistantTextDigest: textDigest(completedAnswer), assistantTextLength: completedAnswer.length,
            retainPartial: false,
          },
        },
      }),
    ];
    const backfillAgentTurnDisplayProjection = vi.fn(async () => undefined);
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => turns),
        backfillAgentTurnDisplayProjection,
      },
      client: {
        listItems: vi.fn(async () => ({
          data: [
            { id: 'first-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: repeatedUser }] },
            { id: 'first-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: stoppedPartial }] },
            { id: 'second-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: repeatedUser }] },
            { id: 'second-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: completedAnswer }] },
          ].reverse(),
          hasMore: false,
        })),
      },
      userId: 'explorer-1',
    });

    expect(result.messages).toMatchObject([
      { id: 'first-user', role: 'user', parts: [{ type: 'text', text: repeatedUser }] },
      { id: 'first-assistant', role: 'assistant', parts: [{ type: 'text', text: stoppedPartial }], deliveryStatus: 'stopped' },
      { id: 'second-user', role: 'user', parts: [{ type: 'text', text: repeatedUser }] },
      { id: 'second-assistant', role: 'assistant', parts: [{ type: 'text', text: completedAnswer }] },
    ]);
    expect(backfillAgentTurnDisplayProjection).toHaveBeenCalledTimes(2);
  });

  it('uses durable turn order to recover identical repeated user and assistant content', async () => {
    const repeatedUser = 'Please repeat that.';
    const repeatedAssistant = 'The same safe answer.';
    const recovery = {
      status: 'pending' as const,
      userTextDigest: textDigest(repeatedUser),
      assistantTextDigest: textDigest(repeatedAssistant),
      assistantTextLength: repeatedAssistant.length,
    };
    const turns = [
      durableTurn({
        turnId: 'identical-cancelled', status: 'cancelled',
        terminalResult: {
          kind: 'cancelled', stopped: true, refetch: true,
          displayRecovery: { ...recovery, retainPartial: true },
        },
      }),
      durableTurn({
        turnId: 'identical-completed',
        terminalResult: {
          kind: 'completed', refetch: true,
          displayRecovery: { ...recovery, retainPartial: false },
        },
      }),
    ];
    const backfillAgentTurnDisplayProjection = vi.fn(async () => undefined);
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => turns),
        backfillAgentTurnDisplayProjection,
      },
      client: {
        listItems: vi.fn(async () => ({
          data: [
            { id: 'identical-user-1', type: 'message', role: 'user', content: [{ type: 'input_text', text: repeatedUser }] },
            { id: 'identical-assistant-1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: repeatedAssistant }] },
            { id: 'identical-user-2', type: 'message', role: 'user', content: [{ type: 'input_text', text: repeatedUser }] },
            { id: 'identical-assistant-2', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: repeatedAssistant }] },
          ].reverse(),
          hasMore: false,
        })),
      },
      userId: 'explorer-1',
    });

    expect(result.messages.map((message) => [message.id, message.deliveryStatus])).toEqual([
      ['identical-user-1', undefined], ['identical-assistant-1', 'stopped'],
      ['identical-user-2', undefined], ['identical-assistant-2', undefined],
    ]);
    expect(backfillAgentTurnDisplayProjection).toHaveBeenCalledTimes(2);
  });

  it('recovers failed display items read-only, cancelled user-only turns, and excludes incomplete turns', async () => {
    const pendingText = 'PENDING_USER_TEXT';
    const failedText = 'FAILED_USER_TEXT';
    const completedWithoutAssistant = 'COMPLETED_WITHOUT_ASSISTANT';
    const cancelledUserText = 'Keep my question, but stop the answer.';
    const turns = [
      durableTurn({
        turnId: 'incomplete',
        status: 'pending',
        terminalResult: {
          displayRecovery: {
            status: 'pending', userTextDigest: textDigest(pendingText),
            assistantTextDigest: textDigest('UNSAFE_INCOMPLETE_ASSISTANT'),
            assistantTextLength: 'UNSAFE_INCOMPLETE_ASSISTANT'.length, retainPartial: true,
          },
        },
      }),
      durableTurn({
        turnId: 'aborted-failed',
        status: 'failed',
        terminalResult: {
          kind: 'failed', refetch: true,
          displayRecovery: {
            status: 'pending', userTextDigest: textDigest(failedText),
            assistantTextDigest: textDigest('UNSAFE_ABORTED_ASSISTANT'),
            assistantTextLength: 'UNSAFE_ABORTED_ASSISTANT'.length, retainPartial: true,
          },
        },
      }),
      durableTurn({
        turnId: 'completed-without-assistant',
        terminalResult: {
          kind: 'completed', refetch: true,
          displayRecovery: {
            status: 'pending', userTextDigest: textDigest(completedWithoutAssistant),
            retainPartial: false,
          },
        },
      }),
      durableTurn({
        turnId: 'cancelled-user-only',
        status: 'cancelled',
        terminalResult: {
          kind: 'cancelled', stopped: true, refetch: true,
          displayRecovery: {
            status: 'pending', userTextDigest: textDigest(cancelledUserText), retainPartial: false,
          },
        },
      }),
    ];
    const backfillAgentTurnDisplayProjection = vi.fn(async () => undefined);
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => turns),
        backfillAgentTurnDisplayProjection,
      },
      client: {
        listItems: vi.fn(async () => ({
          data: [
            { id: 'incomplete-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: pendingText }] },
            { id: 'incomplete-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'UNSAFE_INCOMPLETE_ASSISTANT' }] },
            { id: 'failed-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: failedText }] },
            { id: 'failed-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'UNSAFE_ABORTED_ASSISTANT' }] },
            { id: 'completed-user-only', type: 'message', role: 'user', content: [{ type: 'input_text', text: completedWithoutAssistant }] },
            { id: 'completed-pre-tool', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'UNSAFE_PRE_TOOL_WITHOUT_FINAL' }] },
            { id: 'cancelled-user-only', type: 'message', role: 'user', content: [{ type: 'input_text', text: cancelledUserText }] },
            { id: 'cancelled-unretained', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'UNSAFE_UNRETAINED_PARTIAL' }] },
          ].reverse(),
          hasMore: false,
        })),
      },
      userId: 'explorer-1',
    });

    expect(result.messages).toMatchObject([
      { id: 'failed-user', role: 'user', parts: [{ type: 'text', text: failedText }], turn: { turnId: 'aborted-failed', status: 'failed' } },
      { id: 'failed-assistant', role: 'assistant', parts: [{ type: 'text', text: 'UNSAFE_ABORTED_ASSISTANT' }], turn: { turnId: 'aborted-failed', status: 'failed' }, isFinalAssistantItem: true },
      { id: 'cancelled-user-only', role: 'user', parts: [{ type: 'text', text: cancelledUserText }] },
    ]);
    expect(backfillAgentTurnDisplayProjection).toHaveBeenCalledTimes(2);
    expect(backfillAgentTurnDisplayProjection).toHaveBeenCalledWith({
      userId: 'explorer-1',
      turnId: 'cancelled-user-only',
      displayProjection: { userItemId: 'cancelled-user-only', assistantItemIds: [] },
    });
    expect(result.messages.filter((message) => (
      message.turn?.turnId === 'cancelled-user-only' && message.role === 'assistant'
    ))).toEqual([]);
    expect(result.messages.filter((message) => (
      message.turn?.turnId === 'cancelled-user-only' && message.isFinalAssistantItem
    ))).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/PENDING|COMPLETED_WITHOUT|UNSAFE_INCOMPLETE|UNSAFE_PRE_TOOL|UNSAFE_UNRETAINED/);
  });

  it('matches repeated text only to the latest exact user turn and its exact assistant suffix', () => {
    const repeatedUser = 'Please explain the result.';
    const repeatedAssistant = 'Here is the authoritative result.';
    const projection = resolveDisplayProjection([
      { id: 'old-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: repeatedUser }] },
      { id: 'old-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: repeatedAssistant }] },
      { id: 'new-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: repeatedUser }] },
      { id: 'pre-result', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Premature claim.' }] },
      { id: 'new-assistant-a', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Here is the ' }] },
      { id: 'new-assistant-b', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'authoritative result.' }] },
    ], repeatedUser, repeatedAssistant);

    expect(projection).toEqual({
      userItemId: 'new-user', assistantItemIds: ['new-assistant-a', 'new-assistant-b'],
    });
  });

  it('projects a direct continuation from its exact internal boundary without exposing a user item', async () => {
    const assistantText = 'Aquí tienes un primer proyecto concreto.';
    const items = [
      { id: 'prior-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Elijo el primer camino.' }] },
      { id: 'prior-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Una respuesta anterior.' }] },
      { id: 'direct-internal', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'SERVER REFRESH CONTEXT — private' }] },
      { id: 'direct-assistant-a', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Aquí tienes un ' }] },
      { id: 'direct-assistant-b', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'primer proyecto concreto.' }] },
    ];
    const projection = resolveAssistantDisplayProjection(
      items,
      assistantText,
      new Set(['direct-internal']),
    );
    expect(projection).toEqual({
      assistantItemIds: ['direct-assistant-a', 'direct-assistant-b'],
    });

    const loaded = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [durableTurn({
          turnId: 'direct-workspace-turn',
          origin: 'workspace-action',
          terminalResult: {
            kind: 'workspace-result', refetch: true,
            internalContextItemIds: ['direct-internal'],
            assistantDisplayProjection: projection,
          },
        })]),
      },
      client: {
        listItems: vi.fn(async () => ({ data: [...items].reverse(), hasMore: false })),
      },
      userId: 'explorer-1',
    });

    expect(loaded.messages).toMatchObject([
      {
        id: 'direct-assistant-a', role: 'assistant',
        turn: { turnId: 'direct-workspace-turn', status: 'completed' },
      },
      {
        id: 'direct-assistant-b', role: 'assistant', isFinalAssistantItem: true,
        turn: { turnId: 'direct-workspace-turn', status: 'completed' },
      },
    ]);
    expect(JSON.stringify(loaded.messages)).not.toMatch(/prior-|SERVER REFRESH CONTEXT|direct-internal/);
  });

  it('excludes developer, system, reasoning, tool, compaction, and non-display content', () => {
    const items = [
      { id: 'system', type: 'message', role: 'system', content: [{ type: 'input_text', text: 'BRIEFING_SENTINEL' }] },
      { id: 'developer', type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'PRIVATE_PROMPT' }] },
      { id: 'reasoning', type: 'reasoning', content: 'PRIVATE_REASONING' },
      { id: 'tool', type: 'function_call', arguments: 'PRIVATE_TOOL_ARGUMENTS' },
      { id: 'tool-output', type: 'function_call_output', output: 'PRIVATE_TOOL_OUTPUT' },
      { id: 'compaction', type: 'compaction', encrypted_content: 'PRIVATE_COMPACTION' },
      { id: 'user', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Visible user text' }, { type: 'input_image', image_url: 'private' }] },
      { id: 'assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Visible answer' }, { type: 'refusal', refusal: 'private' }] },
    ];
    const normalized = normalizeConversationItems(items);
    expect(normalized).toEqual([
      { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Visible user text' }] },
      { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Visible answer' }] },
    ]);
    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toMatch(/BRIEFING|PRIVATE|image_url/);
  });

  it('excludes repository-recorded internal user context by item id without treating it as a turn boundary', async () => {
    const items = [
      { id: 'visible-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Please continue.' }] },
      { id: 'internal-refresh', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'INTERNAL CONTENT THAT MUST NOT BE PREFIX FILTERED' }] },
      { id: 'visible-answer', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Here is the authoritative continuation.' }] },
    ];
    expect(resolveDisplayProjection(
      items,
      'Please continue.',
      'Here is the authoritative continuation.',
      new Set(['internal-refresh']),
    )).toEqual({ userItemId: 'visible-user', assistantItemIds: ['visible-answer'] });
    expect(normalizeConversationItems(items, undefined, new Set(['internal-refresh']))).toEqual([
      { id: 'visible-user', role: 'user', parts: [{ type: 'text', text: 'Please continue.' }] },
      { id: 'visible-answer', role: 'assistant', parts: [{ type: 'text', text: 'Here is the authoritative continuation.' }] },
    ]);

    const backfillAgentTurnDisplayProjection = vi.fn(async () => undefined);
    const loaded = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [durableTurn({
          turnId: 'internal-aware',
          terminalResult: {
            kind: 'completed',
            refetch: true,
            internalContextItemIds: ['internal-refresh'],
            displayRecovery: {
              status: 'pending',
              userTextDigest: textDigest('Please continue.'),
              assistantTextDigest: textDigest('Here is the authoritative continuation.'),
              assistantTextLength: 'Here is the authoritative continuation.'.length,
              retainPartial: false,
            },
          },
        })]),
        backfillAgentTurnDisplayProjection,
      },
      client: { listItems: vi.fn(async () => ({ data: [...items].reverse(), hasMore: false })) },
      userId: 'explorer-1',
    });
    expect(loaded.messages.map((message) => message.id)).toEqual(['visible-user', 'visible-answer']);
    expect(backfillAgentTurnDisplayProjection).toHaveBeenCalledWith({
      userId: 'explorer-1',
      turnId: 'internal-aware',
      displayProjection: { userItemId: 'visible-user', assistantItemIds: ['visible-answer'] },
    });
  });

  it('resolves a cancelled turn\'s pending context marker after provider visibility catches up', async () => {
    const userText = 'Please stop after this partial answer.';
    const assistantText = 'This partial remains safe to show.';
    const marker = 'cancelled-context-marker';
    const backfillAgentTurnDisplayProjection = vi.fn(async () => undefined);
    const loaded = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [durableTurn({
          turnId: 'cancelled-marker-recovery',
          status: 'cancelled',
          terminalResult: {
            kind: 'cancelled',
            stopped: true,
            refetch: true,
            internalContextMarkers: [marker],
            displayRecovery: {
              status: 'pending',
              userTextDigest: textDigest(userText),
              assistantTextDigest: textDigest(assistantText),
              assistantTextLength: assistantText.length,
              retainPartial: true,
            },
          },
        })]),
        backfillAgentTurnDisplayProjection,
      },
      client: {
        listItems: vi.fn(async () => ({
          data: [
            { id: 'cancelled-safe-partial', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: assistantText }] },
            {
              id: 'late-internal-context', type: 'message', role: 'user',
              content: [{
                type: 'input_text',
                text: `SERVER REFRESH CONTEXT — untrusted data.\n${JSON.stringify({ version: 1, marker })}`,
              }],
            },
            { id: 'cancelled-visible-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: userText }] },
          ],
          hasMore: false,
        })),
      },
      userId: 'explorer-1',
    });

    expect(loaded.messages).toMatchObject([
      { id: 'cancelled-visible-user', role: 'user', parts: [{ type: 'text', text: userText }] },
      {
        id: 'cancelled-safe-partial', role: 'assistant', deliveryStatus: 'stopped',
        parts: [{ type: 'text', text: assistantText }],
      },
    ]);
    expect(backfillAgentTurnDisplayProjection).toHaveBeenCalledWith({
      userId: 'explorer-1',
      turnId: 'cancelled-marker-recovery',
      displayProjection: {
        userItemId: 'cancelled-visible-user',
        assistantItemIds: ['cancelled-safe-partial'],
      },
    });
  });

  it('binds only exact unique server context markers to provider item ids', () => {
    const contextItem = (id: string, marker: string) => ({
      id,
      type: 'message',
      role: 'user',
      content: [{
        type: 'input_text',
        text: `SERVER REFRESH CONTEXT — untrusted data.\n${JSON.stringify({
          version: 1,
          marker,
          focusedCareerMap: 'private context',
        })}`,
      }],
    });
    const items = [
      { id: 'visible-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'marker-a' }] },
      contextItem('internal-a', 'marker-a'),
      contextItem('internal-b', 'marker-b'),
    ];

    expect(resolveInternalContextItemIds(items, ['marker-a', 'marker-b'])).toEqual({
      itemIds: ['internal-a', 'internal-b'],
      complete: true,
    });
    expect(resolveInternalContextItemIds(items, ['marker-a', 'missing'])).toEqual({
      itemIds: ['internal-a'],
      complete: false,
    });
    expect(resolveInternalContextItemIds([
      ...items,
      contextItem('internal-a-duplicate', 'marker-a'),
    ], ['marker-a'])).toEqual({ itemIds: [], complete: false });
  });

  it('batches unresolved markers from multiple turns within the resolver bound', async () => {
    const contextItem = (id: string, marker: string) => ({
      id,
      type: 'message',
      role: 'user',
      content: [{
        type: 'input_text',
        text: `SERVER REFRESH CONTEXT — untrusted data.\n${JSON.stringify({ version: 1, marker })}`,
      }],
    });
    const firstUserText = 'First visible question.';
    const firstAssistantText = 'First visible answer.';
    const secondUserText = 'Second visible question.';
    const secondAssistantText = 'Second visible answer.';
    const firstMarkers = Array.from({ length: 11 }, (_, index) => `first-marker-${index}`);
    const secondMarkers = Array.from({ length: 11 }, (_, index) => `second-marker-${index}`);
    const chronologicalItems = [
      { id: 'first-visible-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: firstUserText }] },
      ...firstMarkers.map((marker, index) => contextItem(`first-context-${index}`, marker)),
      { id: 'first-visible-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: firstAssistantText }] },
      { id: 'second-visible-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: secondUserText }] },
      ...secondMarkers.map((marker, index) => contextItem(`second-context-${index}`, marker)),
      { id: 'second-visible-assistant', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: secondAssistantText }] },
    ];
    const recovery = (userText: string, assistantText: string, markers: string[]) => ({
      kind: 'completed',
      refetch: true,
      internalContextMarkers: markers,
      displayRecovery: {
        status: 'pending',
        userTextDigest: textDigest(userText),
        assistantTextDigest: textDigest(assistantText),
        assistantTextLength: assistantText.length,
        retainPartial: false,
      },
    });

    const loaded = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [
          durableTurn({
            turnId: 'first-turn',
            terminalResult: recovery(firstUserText, firstAssistantText, firstMarkers),
          }),
          durableTurn({
            turnId: 'second-turn',
            createdAt: '2030-01-01T00:00:01.000Z',
            terminalResult: recovery(secondUserText, secondAssistantText, secondMarkers),
          }),
        ]),
      },
      client: {
        listItems: vi.fn(async () => ({ data: [...chronologicalItems].reverse(), hasMore: false })),
      },
      userId: 'explorer-1',
    });

    expect(loaded.messages.map((message) => message.id)).toEqual([
      'first-visible-user',
      'first-visible-assistant',
      'second-visible-user',
      'second-visible-assistant',
    ]);
  });

  it('preserves only sanitized exact-span HTTPS citation parts on allowed assistant messages', async () => {
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [durableTurn({
          turnId: 'cited', userItemId: 'cited-user', assistantItemId: 'cited-assistant',
        })]),
      },
      client: {
        listItems: vi.fn(async () => ({
          data: [
            { id: 'cited-assistant', type: 'message', role: 'assistant', content: [{
              type: 'output_text',
              text: 'The official media type is application/json.',
              annotations: [
                { type: 'url_citation', start_index: 27, end_index: 43, url: 'https://example.com/a/../fact#fragment', title: '  Provider\u0000 title ' },
                { type: 'url_citation', start_index: 27, end_index: 43, url: 'javascript:alert(1)', title: 'Unsafe' },
                { type: 'url_citation', start_index: 999, end_index: 1000, url: 'https://example.com/out-of-range' },
              ],
            }], rawSearch: 'PRIVATE_RAW_SEARCH' },
            { id: 'cited-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'What is the media type?' }] },
          ],
          hasMore: false,
        })),
      },
      userId: 'explorer-1',
    });
    expect(result.messages).toMatchObject([
      { id: 'cited-user', role: 'user', parts: [{ type: 'text', text: 'What is the media type?' }] },
      {
        id: 'cited-assistant',
        role: 'assistant',
        parts: [{ type: 'text', text: 'The official media type is application/json.' }],
        sources: [{
          type: 'source-url',
          sourceId: expect.stringMatching(/^citation_/),
          url: 'https://example.com/fact',
          title: 'Provider title',
        }],
        citations: [{
          version: 1,
          citationId: expect.stringMatching(/^citation_/),
          turnId: 'cited',
          messageId: 'cited-assistant',
          textHash: textDigest('The official media type is application/json.'),
          exactClaim: 'application/json',
          start: 27,
          end: 43,
          url: 'https://example.com/fact',
          title: 'Provider title',
          support: 'cited-provenance',
        }],
      },
    ]);
    const citedMessage = result.messages[1];
    expect(citedMessage.sources?.[0]).toMatchObject({
      sourceId: citedMessage.citations?.[0].citationId,
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_RAW_SEARCH|javascript|out-of-range|fragment/);
  });

  it('binds multipart citation hashes and spans to the same joined display text', async () => {
    const prefix = 'Current registry: ';
    const claim = 'application/json';
    const joinedText = `${prefix}${claim}`;
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [durableTurn({
          turnId: 'multipart-cited',
          userItemId: 'multipart-user',
          assistantItemId: 'multipart-assistant',
        })]),
      },
      client: {
        listItems: vi.fn(async () => ({
          data: [
            {
              id: 'multipart-assistant',
              type: 'message',
              role: 'assistant',
              content: [
                { type: 'output_text', text: prefix },
                {
                  type: 'output_text',
                  text: claim,
                  annotations: [{
                    type: 'url_citation',
                    start_index: 0,
                    end_index: claim.length,
                    url: 'https://example.com/registry',
                  }],
                },
              ],
            },
            { id: 'multipart-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Which type?' }] },
          ],
          hasMore: false,
        })),
      },
      userId: 'explorer-1',
    });

    expect(result.messages[1]?.citations).toEqual([
      expect.objectContaining({
        turnId: 'multipart-cited',
        messageId: 'multipart-assistant',
        textHash: textDigest(joinedText),
        exactClaim: claim,
        start: prefix.length,
        end: joinedText.length,
      }),
    ]);
  });

  it('bounds oversized provider history before returning the browser contract', async () => {
    const claim = 'application/json';
    const prefix = 'The official media type is ';
    const claimStart = prefix.length;
    const visiblePrefix = `${prefix}${claim}.`;
    const oversizedText = visiblePrefix.padEnd(NORMALIZED_HISTORY_MAX_TEXT_LENGTH + 1, 'x');
    const invalidProviderId = `assistant id with spaces ${'z'.repeat(150)}`;
    const retainedTailParts = Array.from(
      { length: NORMALIZED_HISTORY_MAX_PARTS - 1 },
      (_, index) => ({ type: 'output_text', text: `part-${index}` }),
    );
    const discardedTailParts = Array.from({ length: 4 }, (_, index) => ({
      type: 'output_text',
      text: `discarded-${index}`,
    }));
    const annotations = [
      {
        type: 'url_citation',
        start_index: NORMALIZED_HISTORY_MAX_TEXT_LENGTH,
        end_index: NORMALIZED_HISTORY_MAX_TEXT_LENGTH + 1,
        url: 'https://example.com/truncated-claim',
      },
      ...Array.from({ length: NORMALIZED_HISTORY_MAX_CITATIONS + 5 }, (_, index) => ({
        type: 'url_citation',
        start_index: claimStart,
        end_index: claimStart + claim.length,
        url: `https://example.com/source-${index}`,
      })),
    ];
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [durableTurn({
          turnId: 'oversized-provider-history',
          userItemId: 'oversized-user',
          assistantItemId: invalidProviderId,
        })]),
      },
      client: {
        listItems: vi.fn(async () => ({
          data: [
            {
              id: invalidProviderId,
              type: 'message',
              role: 'assistant',
              content: [
                { type: 'output_text', text: oversizedText, annotations },
                ...retainedTailParts,
                ...discardedTailParts,
              ],
            },
            {
              id: 'oversized-user',
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'What is the media type?' }],
            },
          ],
          hasMore: false,
        })),
      },
      userId: 'explorer-1',
    });

    expect(conversationHistoryPageSchema.safeParse(result).success).toBe(true);
    const assistant = result.messages[1];
    expect(assistant?.id).toMatch(/^message_[A-Za-z0-9_-]{32}$/u);
    expect(assistant?.parts).toHaveLength(NORMALIZED_HISTORY_MAX_PARTS);
    expect(assistant?.parts[0]?.text).toHaveLength(NORMALIZED_HISTORY_MAX_TEXT_LENGTH);
    expect(assistant?.parts.at(-1)?.text).toBe(`part-${NORMALIZED_HISTORY_MAX_PARTS - 2}`);
    expect(assistant?.citations).toHaveLength(NORMALIZED_HISTORY_MAX_CITATIONS);
    expect(assistant?.sources).toHaveLength(NORMALIZED_HISTORY_MAX_CITATIONS);
    expect(assistant?.citations?.some((citation) => citation.url.endsWith('/truncated-claim'))).toBe(false);
    const joinedText = assistant?.parts.map((part) => part.text).join('') ?? '';
    expect(assistant?.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        turnId: 'oversized-provider-history',
        messageId: assistant.id,
        textHash: textDigest(joinedText),
        exactClaim: claim,
        start: claimStart,
        end: claimStart + claim.length,
      }),
    ]));
  });

  it('rehydrates an adjacent citation marker to the same claim span and stable turn association used live', async () => {
    const claim = 'The registered media type for JSON is application/json.';
    const text = `${claim} [1]`;
    const markerStart = text.indexOf('[1]');
    const result = await loadConversationHistory({
      storage: {
        getConversationMapping: vi.fn(async () => 'conversation-server-owned'),
        listAgentTurns: vi.fn(async () => [durableTurn({
          turnId: 'marker-turn', userItemId: 'marker-user', assistantItemId: 'marker-assistant',
        })]),
      },
      client: {
        listItems: vi.fn(async () => ({
          data: [
            { id: 'marker-assistant', type: 'message', role: 'assistant', content: [{
              type: 'output_text', text,
              annotations: [{
                type: 'url_citation', start_index: markerStart, end_index: text.length,
                url: 'https://example.com/registry', title: 'Registry',
              }],
            }] },
            { id: 'marker-user', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Verify JSON.' }] },
          ],
          hasMore: false,
        })),
      },
      userId: 'explorer-1',
    });

    expect(result.messages[1]?.citations).toEqual([
      expect.objectContaining({
        turnId: 'marker-turn', messageId: 'marker-assistant', exactClaim: claim,
        start: 0, end: claim.length,
      }),
    ]);
  });

  it('fails a repeated provider cursor instead of looping or returning truncated history', async () => {
    const listItems = vi.fn(async () => ({ data: [], hasMore: true, lastId: 'same-cursor' }));
    await expect(loadConversationHistory({
      storage: { getConversationMapping: vi.fn(async () => 'conversation-1'), listAgentTurns: vi.fn(async () => []) },
      client: { listItems },
      userId: 'explorer-1',
    })).rejects.toBeInstanceOf(ConversationHistoryProviderError);
    expect(listItems).toHaveBeenCalledTimes(2);
  });

  it('redacts provider bodies and Conversation identifiers from failures', async () => {
    const sentinel = 'provider-private-body-sentinel';
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({
      error: { message: sentinel },
    }), { status: 503, headers: { 'content-type': 'application/json' } }));
    const client = new OpenAIConversationClient('private-api-key', fetchImplementation as typeof fetch);
    let failure: unknown;
    try {
      await client.listItems({ conversationId: 'private-conversation-id', limit: 100, order: 'asc' });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      name: 'ConversationHistoryProviderError',
      operation: 'list',
      httpStatus: 503,
    });
    expect(JSON.stringify(failure)).not.toMatch(/provider-private|private-conversation|private-api-key/);
  });

  it('classifies only transport, 429, and 5xx Conversation failures as retryable', () => {
    expect(new ConversationHistoryProviderError('delete').retryable).toBe(true);
    expect(new ConversationHistoryProviderError('delete', 429).retryable).toBe(true);
    expect(new ConversationHistoryProviderError('delete', 503).retryable).toBe(true);
    expect(new ConversationHistoryProviderError('delete', 401).retryable).toBe(false);
    expect(new ConversationHistoryProviderError('delete', 408).retryable).toBe(false);
  });

  it('wraps an internally timed-out cleanup fetch as retryable while preserving caller aborts', async () => {
    const timeout = AbortSignal.abort(new DOMException('timed out', 'TimeoutError'));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout);
    const fetchImplementation = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      return new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new OpenAIConversationClient('private-api-key', fetchImplementation);
    try {
      await expect(client.deleteConversationItemsAndConversation('conv-timeout')).rejects.toMatchObject({
        name: 'ConversationHistoryProviderError',
        retryable: true,
      });
    } finally {
      timeoutSpy.mockRestore();
    }
    const callerAbort = AbortSignal.abort(new DOMException('caller stopped', 'AbortError'));
    await expect(client.listItems({
      conversationId: 'conv-caller-abort',
      limit: 1,
      order: 'asc',
      abortSignal: callerAbort,
    })).rejects.toBe(callerAbort.reason);
  });

  it('deletes every Conversation item in reverse order before the Conversation and treats 404 as idempotent', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const responses = [
      { data: [{ id: 'item-a' }, { id: 'item-b' }], has_more: true, last_id: 'item-b' },
      { data: [{ id: 'item-c' }], has_more: false },
      {}, {}, {}, {},
    ];
    const fetchImplementation = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET' });
      return new Response(JSON.stringify(responses.shift() ?? {}), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    const client = new OpenAIConversationClient('private-api-key', fetchImplementation as typeof fetch);

    await client.deleteConversationItemsAndConversation('conversation-cleanup');

    expect(calls.map((call) => [call.method, call.url.split('/v1')[1]])).toEqual([
      ['GET', '/conversations/conversation-cleanup/items?limit=100&order=asc'],
      ['GET', '/conversations/conversation-cleanup/items?limit=100&order=asc&after=item-b'],
      ['DELETE', '/conversations/conversation-cleanup/items/item-c'],
      ['DELETE', '/conversations/conversation-cleanup/items/item-b'],
      ['DELETE', '/conversations/conversation-cleanup/items/item-a'],
      ['DELETE', '/conversations/conversation-cleanup'],
    ]);

    const absent = new OpenAIConversationClient('private-api-key', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'already absent' } }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch);
    await expect(absent.deleteConversationItemsAndConversation('conversation-absent')).resolves.toBeUndefined();
  });
});

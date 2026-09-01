import { describe, expect, it, vi } from 'vitest';
import {
  ConversationHistoryProviderError,
  OpenAIConversationClient,
  loadConversationHistory,
  normalizeConversationItems,
  resolveDisplayProjection,
} from './history.js';

function durableTurn(input: {
  turnId: string;
  status?: 'completed' | 'cancelled' | 'failed';
  userItemId?: string;
  assistantItemId?: string;
  assistantItemIds?: string[];
  createdAt?: string;
}) {
  const status = input.status ?? 'completed';
  return {
    turnId: input.turnId,
    userId: 'explorer-1',
    clientMessageId: `${input.turnId}-message`,
    requestFingerprint: `${input.turnId}-fingerprint`,
    origin: 'agent-turn' as const,
    leaseId: `${input.turnId}-lease`,
    status,
    terminalResult: status === 'completed' ? {
      kind: 'completed', refetch: true,
      displayProjection: {
        userItemId: input.userItemId ?? `${input.turnId}-user-item`,
        assistantItemIds: input.assistantItemIds
          ?? [input.assistantItemId ?? `${input.turnId}-assistant-item`],
      },
    } : { kind: status, refetch: true },
    createdAt: new Date(input.createdAt ?? '2030-01-01T00:00:00.000Z'),
    updatedAt: new Date(input.createdAt ?? '2030-01-01T00:00:00.000Z'),
    terminalAt: new Date(input.createdAt ?? '2030-01-01T00:00:00.000Z'),
  };
}

describe('protected OpenAI Conversation history adapter', () => {
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

  it('derives the Conversation from the owner mapping and paginates to exhaustion in order', async () => {
    const listItems = vi.fn()
      .mockResolvedValueOnce({
        data: [{ id: 'message-1', type: 'message', role: 'user', content: [{ type: 'input_text', text: 'First' }] }],
        hasMore: true,
        lastId: 'message-1',
      })
      .mockResolvedValueOnce({
        data: [{ id: 'message-2', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Second' }] }],
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
      limit: 100,
      order: 'asc',
    }));
    expect(listItems).toHaveBeenNthCalledWith(2, expect.objectContaining({ after: 'message-1' }));
    expect(result.messages.map((message) => message.id)).toEqual(['message-1', 'message-2']);
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
      ],
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

    expect(result.messages).toEqual([
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
      client: { listItems: vi.fn(async () => ({ data, hasMore: false })) },
      userId: 'explorer-1',
    });

    expect(result.messages.map((message) => message.id)).toEqual(outcomes.flatMap((outcome) => [
      `${outcome}-user`, `${outcome}-final`,
    ]));
    expect(JSON.stringify(result)).not.toContain('premature claim');
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
});

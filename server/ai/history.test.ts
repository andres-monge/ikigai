import { describe, expect, it, vi } from 'vitest';
import {
  ConversationHistoryProviderError,
  OpenAIConversationClient,
  loadConversationHistory,
  normalizeConversationItems,
} from './history.js';

describe('protected OpenAI Conversation history adapter', () => {
  it('returns an empty bootstrap without calling the provider when no server mapping exists', async () => {
    const listItems = vi.fn();
    const result = await loadConversationHistory({
      storage: { getConversationMapping: vi.fn(async () => undefined) },
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
      storage: { getConversationMapping: vi.fn(async () => 'conversation-server-owned') },
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
      storage: { getConversationMapping: vi.fn(async () => 'conversation-1') },
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

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IStorage } from '../storage.js';

const conversationIdSchema = z.string().min(1).max(200);

export interface ConversationItemPage {
  data: unknown[];
  hasMore: boolean;
  lastId?: string;
}

export interface ConversationItemsClient {
  createConversation?(abortSignal?: AbortSignal): Promise<string>;
  listItems(input: {
    conversationId: string;
    after?: string;
    limit: number;
    order: 'asc';
    abortSignal?: AbortSignal;
  }): Promise<ConversationItemPage>;
}

export interface NormalizedHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; text: string }>;
}

export class ConversationHistoryProviderError extends Error {
  readonly code = 'conversation-history-provider-error';
  constructor(readonly operation: 'create' | 'list', readonly httpStatus?: number) {
    super('Conversation history is temporarily unavailable.');
    this.name = 'ConversationHistoryProviderError';
  }
}

function displayText(content: unknown, role: 'user' | 'assistant'): string[] {
  if (!Array.isArray(content)) return [];
  const allowedTypes = role === 'user'
    ? new Set(['input_text', 'text'])
    : new Set(['output_text', 'text']);
  return content.flatMap((part) => {
    if (!part || typeof part !== 'object') return [];
    const record = part as Record<string, unknown>;
    return allowedTypes.has(String(record.type)) && typeof record.text === 'string' && record.text.length > 0
      ? [record.text]
      : [];
  });
}

export function normalizeConversationItems(items: readonly unknown[]): NormalizedHistoryMessage[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (record.type !== 'message' || (record.role !== 'user' && record.role !== 'assistant')) return [];
    if (typeof record.id !== 'string' || record.id.length === 0) return [];
    const texts = displayText(record.content, record.role);
    if (texts.length === 0) return [];
    return [{
      id: record.id,
      role: record.role,
      parts: texts.map((text) => ({ type: 'text' as const, text })),
    }];
  });
}

export async function loadConversationHistory(input: {
  storage: Pick<IStorage, 'getConversationMapping'>;
  client: ConversationItemsClient;
  userId: string;
  abortSignal?: AbortSignal;
}): Promise<{ status: 'empty' | 'ready'; messages: NormalizedHistoryMessage[] }> {
  const mappedConversationId = await input.storage.getConversationMapping(input.userId);
  if (!mappedConversationId) return { status: 'empty', messages: [] };
  const conversationId = conversationIdSchema.parse(mappedConversationId);
  const items: unknown[] = [];
  let after: string | undefined;
  const seenCursors = new Set<string>();
  do {
    if (input.abortSignal?.aborted) throw input.abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
    const page = await input.client.listItems({
      conversationId,
      after,
      limit: 100,
      order: 'asc',
      abortSignal: input.abortSignal,
    });
    if (!Array.isArray(page.data)) throw new ConversationHistoryProviderError('list');
    items.push(...page.data);
    if (!page.hasMore) break;
    if (!page.lastId || seenCursors.has(page.lastId)) throw new ConversationHistoryProviderError('list');
    seenCursors.add(page.lastId);
    after = page.lastId;
  } while (true);
  return { status: 'ready', messages: normalizeConversationItems(items) };
}

export class OpenAIConversationClient implements ConversationItemsClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit, operation: 'create' | 'list', signal?: AbortSignal) {
    let response: Response;
    try {
      response = await this.fetchImplementation(`https://api.openai.com/v1${path}`, {
        ...init,
        signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ConversationHistoryProviderError(operation);
    }
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) throw new ConversationHistoryProviderError(operation, response.status);
    return body;
  }

  async createConversation(abortSignal?: AbortSignal): Promise<string> {
    const body = await this.request('/conversations', {
      method: 'POST',
      body: JSON.stringify({ metadata: { product: 'revelio-method', request: randomUUID() } }),
    }, 'create', abortSignal);
    return conversationIdSchema.parse(body?.id);
  }

  async listItems(input: {
    conversationId: string;
    after?: string;
    limit: number;
    order: 'asc';
    abortSignal?: AbortSignal;
  }): Promise<ConversationItemPage> {
    const params = new URLSearchParams({ limit: String(input.limit), order: input.order });
    if (input.after) params.set('after', input.after);
    const body = await this.request(
      `/conversations/${encodeURIComponent(input.conversationId)}/items?${params}`,
      { method: 'GET' },
      'list',
      input.abortSignal,
    );
    return {
      data: Array.isArray(body?.data) ? body.data : [],
      hasMore: body?.has_more === true,
      lastId: typeof body?.last_id === 'string' ? body.last_id : undefined,
    };
  }
}

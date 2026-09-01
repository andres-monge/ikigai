import { createHash, randomUUID } from 'node:crypto';
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
  deleteConversation?(conversationId: string, abortSignal?: AbortSignal): Promise<void>;
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
  deliveryStatus?: 'stopped';
}

export class ConversationHistoryProviderError extends Error {
  readonly code = 'conversation-history-provider-error';
  constructor(readonly operation: 'create' | 'delete' | 'list', readonly httpStatus?: number) {
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

export function normalizeConversationItems(
  items: readonly unknown[],
  allowed?: ReadonlyMap<string, 'user' | 'assistant'>,
): NormalizedHistoryMessage[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (record.type !== 'message' || (record.role !== 'user' && record.role !== 'assistant')) return [];
    if (typeof record.id !== 'string' || record.id.length === 0) return [];
    if (allowed && allowed.get(record.id) !== record.role) return [];
    const texts = displayText(record.content, record.role);
    if (texts.length === 0) return [];
    return [{
      id: record.id,
      role: record.role,
      parts: texts.map((text) => ({ type: 'text' as const, text })),
    }];
  });
}

const displayProjectionSchema = z.object({
  userItemId: conversationIdSchema,
  assistantItemIds: z.array(conversationIdSchema).max(8)
    .refine((ids) => new Set(ids).size === ids.length),
}).strict();

const textDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const displayRecoverySchema = z.object({
  status: z.literal('pending'),
  userTextDigest: textDigestSchema,
  assistantTextDigest: textDigestSchema.optional(),
  assistantTextLength: z.number().int().positive().max(100_000).optional(),
  retainPartial: z.boolean(),
}).strict().refine((value) => (
  (value.assistantTextDigest === undefined) === (value.assistantTextLength === undefined)
));

function textDigest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function createDisplayRecovery(
  userText: string,
  assistantText: string,
  retainPartial: boolean,
): z.infer<typeof displayRecoverySchema> {
  return {
    status: 'pending',
    userTextDigest: textDigest(userText),
    ...(assistantText.length > 0 ? {
      assistantTextDigest: textDigest(assistantText),
      assistantTextLength: assistantText.length,
    } : {}),
    retainPartial,
  };
}

function messageText(message: NormalizedHistoryMessage): string {
  return message.parts.map((part) => part.text).join('');
}

function resolveRecoveryProjection(
  items: readonly unknown[],
  recovery: z.infer<typeof displayRecoverySchema>,
  claimedUserItemIds: ReadonlySet<string>,
): { userItemId: string; assistantItemIds: string[] } | undefined {
  const normalized = normalizeConversationItems(items);
  const userIndexes = normalized.flatMap((message, index) => (
    message.role === 'user'
      && !claimedUserItemIds.has(message.id)
      && textDigest(messageText(message)) === recovery.userTextDigest
      ? [index]
      : []
  ));
  if (!recovery.assistantTextDigest || !recovery.assistantTextLength) {
    return userIndexes.length > 0
      ? { userItemId: normalized[userIndexes[0]].id, assistantItemIds: [] }
      : undefined;
  }
  const candidates = userIndexes.flatMap((userIndex) => {
    const following = normalized.slice(userIndex + 1);
    const nextUserIndex = following.findIndex((message) => message.role === 'user');
    const assistants = (nextUserIndex < 0 ? following : following.slice(0, nextUserIndex))
      .filter((message) => message.role === 'assistant');
    const matches: NormalizedHistoryMessage[][] = [];
    for (let start = 0; start < assistants.length; start += 1) {
      let candidateText = '';
      for (let end = start; end < Math.min(assistants.length, start + 8); end += 1) {
        candidateText += messageText(assistants[end]);
        if (candidateText.length > recovery.assistantTextLength!) break;
        if (
          candidateText.length === recovery.assistantTextLength
          && textDigest(candidateText) === recovery.assistantTextDigest
        ) matches.push(assistants.slice(start, end + 1));
      }
    }
    return matches.length === 1 ? [{
      userItemId: normalized[userIndex].id,
      assistantItemIds: matches[0].map((message) => message.id),
    }] : [];
  });
  // Durable turns and provider items are both ordered oldest-first. When exact
  // content repeats, consume the earliest still-unclaimed occurrence so each
  // turn remains recoverable without storing transcript content in Postgres.
  return candidates[0];
}

export function resolveDisplayProjection(
  items: readonly unknown[],
  userText: string,
  assistantText: string,
): { userItemId: string; assistantItemIds: string[] } | undefined {
  const normalized = normalizeConversationItems(items);
  const userIndex = normalized.findLastIndex((message) => (
    message.role === 'user' && message.parts.map((part) => part.text).join('') === userText
  ));
  if (userIndex < 0 || assistantText.length === 0) return undefined;
  const following = normalized.slice(userIndex + 1);
  const nextUserIndex = following.findIndex((message) => message.role === 'user');
  const currentTurn = nextUserIndex < 0 ? following : following.slice(0, nextUserIndex);
  const assistants = currentTurn.filter((message) => message.role === 'assistant');
  const assistantTexts = assistants.map(messageText);
  let selectedStart = -1;
  let candidateLength = 0;
  for (let start = assistants.length - 1; start >= 0; start -= 1) {
    candidateLength += assistantTexts[start].length;
    if (candidateLength > assistantText.length) break;
    if (
      candidateLength === assistantText.length
      && assistantTexts.slice(start).join('') === assistantText
    ) {
      selectedStart = start;
      break;
    }
  }
  if (selectedStart < 0) return undefined;
  return displayProjectionSchema.parse({
    userItemId: normalized[userIndex].id,
    assistantItemIds: assistants.slice(selectedStart).slice(-8).map((message) => message.id),
  });
}

export async function listConversationItems(input: {
  client: ConversationItemsClient;
  conversationId: string;
  abortSignal?: AbortSignal;
}): Promise<unknown[]> {
  const items: unknown[] = [];
  let after: string | undefined;
  const seenCursors = new Set<string>();
  do {
    if (input.abortSignal?.aborted) throw input.abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
    const page = await input.client.listItems({
      conversationId: input.conversationId,
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
  return items;
}

export async function loadConversationHistory(input: {
  storage: Pick<IStorage, 'getConversationMapping' | 'listAgentTurns'>
    & Partial<Pick<IStorage, 'backfillAgentTurnDisplayProjection'>>;
  client: ConversationItemsClient;
  userId: string;
  abortSignal?: AbortSignal;
}): Promise<{ status: 'empty' | 'ready'; messages: NormalizedHistoryMessage[] }> {
  const mappedConversationId = await input.storage.getConversationMapping(input.userId);
  if (!mappedConversationId) return { status: 'empty', messages: [] };
  const conversationId = conversationIdSchema.parse(mappedConversationId);
  const [items, turns] = await Promise.all([
    listConversationItems({ client: input.client, conversationId, abortSignal: input.abortSignal }),
    input.storage.listAgentTurns(input.userId),
  ]);
  const allowed = new Map<string, 'user' | 'assistant'>();
  const stoppedAssistantIds = new Set<string>();
  const claimedUserItemIds = new Set<string>();
  const directProjections = new Map<string, z.infer<typeof displayProjectionSchema>>();
  // Claim durable provider ids first so an older digest-only recovery can
  // never steal an item already bound explicitly to another completed turn.
  for (const turn of turns) {
    if (turn.origin !== 'agent-turn' || (turn.status !== 'completed' && turn.status !== 'cancelled')) continue;
    const terminal = turn.terminalResult;
    if (!terminal || terminal.kind !== turn.status) continue;
    const direct = displayProjectionSchema.safeParse(terminal.displayProjection);
    if (!direct.success || claimedUserItemIds.has(direct.data.userItemId)) continue;
    directProjections.set(turn.turnId, direct.data);
    claimedUserItemIds.add(direct.data.userItemId);
  }
  for (const turn of turns) {
    if (turn.origin !== 'agent-turn' || (turn.status !== 'completed' && turn.status !== 'cancelled')) continue;
    const terminal = turn.terminalResult;
    if (!terminal || terminal.kind !== turn.status) continue;
    let projection = directProjections.get(turn.turnId);
    if (!projection) {
      const recovery = displayRecoverySchema.safeParse(terminal.displayRecovery);
      if (!recovery.success) continue;
      if (turn.status === 'completed' && !recovery.data.assistantTextDigest) continue;
      if (turn.status === 'cancelled' && recovery.data.assistantTextDigest && !recovery.data.retainPartial) continue;
      projection = resolveRecoveryProjection(items, recovery.data, claimedUserItemIds);
      if (!projection) continue;
      await input.storage.backfillAgentTurnDisplayProjection?.({
        userId: input.userId,
        turnId: turn.turnId,
        displayProjection: projection,
      }).catch(() => undefined);
    }
    if (turn.status === 'completed' && projection.assistantItemIds.length === 0) continue;
    claimedUserItemIds.add(projection.userItemId);
    allowed.set(projection.userItemId, 'user');
    for (const id of projection.assistantItemIds) {
      allowed.set(id, 'assistant');
      if (turn.status === 'cancelled') stoppedAssistantIds.add(id);
    }
  }
  return {
    status: 'ready',
    messages: normalizeConversationItems(items, allowed).map((message) => (
      message.role === 'assistant' && stoppedAssistantIds.has(message.id)
        ? { ...message, deliveryStatus: 'stopped' as const }
        : message
    )),
  };
}

export class OpenAIConversationClient implements ConversationItemsClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  private async request(
    path: string,
    init: RequestInit,
    operation: 'create' | 'delete' | 'list',
    signal?: AbortSignal,
    allowNotFound = false,
  ) {
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
    if (allowNotFound && response.status === 404) return null;
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

  async deleteConversation(conversationId: string, abortSignal?: AbortSignal): Promise<void> {
    await this.request(`/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
    }, 'delete', abortSignal, true);
  }

  async deleteConversationItemsAndConversation(conversationId: string): Promise<void> {
    let items: unknown[];
    try {
      items = await listConversationItems({
        client: this,
        conversationId,
        abortSignal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (error instanceof ConversationHistoryProviderError && error.httpStatus === 404) return;
      throw error;
    }
    const ids = items.map((item) => (
      item && typeof item === 'object' ? (item as Record<string, unknown>).id : undefined
    ));
    if (ids.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 200)) {
      throw new ConversationHistoryProviderError('delete');
    }
    for (const id of [...ids].reverse() as string[]) {
      await this.request(
        `/conversations/${encodeURIComponent(conversationId)}/items/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        'delete',
        AbortSignal.timeout(5_000),
        true,
      );
    }
    await this.request(
      `/conversations/${encodeURIComponent(conversationId)}`,
      { method: 'DELETE' },
      'delete',
      AbortSignal.timeout(5_000),
      true,
    );
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

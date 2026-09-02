import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { z } from 'zod';
import {
  claimLinkedCitationSchema,
  citationToBrowserSourceUrlPart,
  createBrowserSourceUrlPart,
  type BrowserSourceUrlPart,
  type ClaimLinkedCitation,
} from '../../shared/streaming-schemas.js';
import type { IStorage } from '../storage.js';

const conversationIdSchema = z.string().min(1).max(200);
const providerItemIdSchema = z.string().min(1).max(200);
const HISTORY_PAGE_SIZE = 40;
const MAX_HISTORY_PAGE_SIZE = 100;
const MAX_PROVIDER_PAGES_PER_DISPLAY_PAGE = 5;

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
    order: 'asc' | 'desc';
    abortSignal?: AbortSignal;
  }): Promise<ConversationItemPage>;
}

export interface NormalizedHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; text: string }>;
  sources?: BrowserSourceUrlPart[];
  citations?: ClaimLinkedCitation[];
  deliveryStatus?: 'stopped';
}

export class ConversationHistoryProviderError extends Error {
  readonly code = 'conversation-history-provider-error';
  constructor(readonly operation: 'create' | 'delete' | 'list', readonly httpStatus?: number) {
    super('Conversation history is temporarily unavailable.');
    this.name = 'ConversationHistoryProviderError';
  }
}

const historyCursorPayloadSchema = z.object({
  version: z.literal(1),
  conversationId: conversationIdSchema,
  after: providerItemIdSchema,
}).strict();

export interface ConversationHistoryCursorCodec {
  encode(input: { conversationId: string; after: string }): string;
  decode(cursor: string): { conversationId: string; after: string };
}

/**
 * The provider cursor and Conversation id are encrypted and authenticated, not
 * serialized into a browser-readable token. Callers can supply a stable server
 * secret; the process codec keeps the default API safe without exporting ids.
 */
export function createConversationHistoryCursorCodec(secret: string): ConversationHistoryCursorCodec {
  if (secret.length < 32) throw new Error('Conversation history cursor secret must be at least 32 characters.');
  const key = createHash('sha256').update(secret).digest();
  return {
    encode(input) {
      const payload = historyCursorPayloadSchema.parse({ version: 1, ...input });
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
      return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
    },
    decode(cursor) {
      if (cursor.length > 4_096) throw new Error('Conversation history cursor is invalid.');
      const segments = cursor.split('.');
      if (segments.length !== 3 || segments.some((segment) => !/^[A-Za-z0-9_-]+$/u.test(segment))) {
        throw new Error('Conversation history cursor is invalid.');
      }
      const [ivValue, encryptedValue, tagValue] = segments.map((segment) => Buffer.from(segment, 'base64url'));
      if (ivValue.length !== 12 || tagValue.length !== 16 || encryptedValue.length === 0) {
        throw new Error('Conversation history cursor is invalid.');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, ivValue);
      decipher.setAuthTag(tagValue);
      const decoded = JSON.parse(Buffer.concat([
        decipher.update(encryptedValue),
        decipher.final(),
      ]).toString('utf8')) as unknown;
      const payload = historyCursorPayloadSchema.parse(decoded);
      return { conversationId: payload.conversationId, after: payload.after };
    },
  };
}

function opaqueCitationId(prefix: 'citation' | 'source', value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('base64url').slice(0, 32)}`;
}

function displayContent(
  content: unknown,
  role: 'user' | 'assistant',
  messageId: string,
  turnId?: string,
): Pick<NormalizedHistoryMessage, 'parts' | 'sources' | 'citations'> {
  if (!Array.isArray(content)) return { parts: [] };
  const allowedTypes = role === 'user'
    ? new Set(['input_text', 'text'])
    : new Set(['output_text', 'text']);
  const texts: string[] = [];
  const citations: ClaimLinkedCitation[] = [];
  const seenCitations = new Set<string>();
  let messageOffset = 0;
  for (let partIndex = 0; partIndex < content.length; partIndex += 1) {
    const part = content[partIndex];
    if (!part || typeof part !== 'object') continue;
    const record = part as Record<string, unknown>;
    if (!allowedTypes.has(String(record.type)) || typeof record.text !== 'string' || record.text.length === 0) {
      continue;
    }
    const text = record.text;
    texts.push(text);
    if (role === 'assistant' && turnId && Array.isArray(record.annotations)) {
      for (let annotationIndex = 0; annotationIndex < record.annotations.length; annotationIndex += 1) {
        const annotation = record.annotations[annotationIndex];
        if (!annotation || typeof annotation !== 'object') continue;
        const value = annotation as Record<string, unknown>;
        if (value.type !== 'url_citation'
          || !Number.isInteger(value.start_index)
          || !Number.isInteger(value.end_index)
          || typeof value.url !== 'string'
        ) continue;
        const start = Number(value.start_index);
        const end = Number(value.end_index);
        if (start < 0 || end <= start || end > text.length) continue;
        try {
          const exactClaim = text.slice(start, end).normalize('NFC');
          if (exactClaim.length === 0 || exactClaim.length > 3_000) continue;
          const sourceKey = `${messageId}\u0000${partIndex}\u0000${start}\u0000${end}\u0000${value.url}`;
          const source = createBrowserSourceUrlPart({
            sourceId: opaqueCitationId('source', sourceKey),
            url: value.url,
            ...(typeof value.title === 'string' ? { title: value.title } : {}),
          });
          const dedupeKey = `${messageOffset + start}\u0000${messageOffset + end}\u0000${source.url}`;
          if (seenCitations.has(dedupeKey)) continue;
          seenCitations.add(dedupeKey);
          citations.push(claimLinkedCitationSchema.parse({
            version: 1,
            citationId: opaqueCitationId('citation', sourceKey),
            turnId,
            messageId,
            textHash: createHash('sha256').update(text).digest('hex'),
            exactClaim,
            start: messageOffset + start,
            end: messageOffset + end,
            url: source.url,
            title: source.title ?? null,
            support: 'cited-provenance',
          }));
        } catch {
          // Unsafe, malformed, or non-HTTPS annotations are display-ineligible.
        }
      }
    }
    messageOffset += text.length;
  }
  return {
    parts: texts.map((text) => ({ type: 'text' as const, text })),
    ...(citations.length > 0 ? { sources: citations.map(citationToBrowserSourceUrlPart) } : {}),
    ...(citations.length > 0 ? { citations } : {}),
  };
}

export function normalizeConversationItems(
  items: readonly unknown[],
  allowed?: ReadonlyMap<string, 'user' | 'assistant'>,
  excludedItemIds: ReadonlySet<string> = new Set(),
  turnIdsByMessage: ReadonlyMap<string, string> = new Map(),
): NormalizedHistoryMessage[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (record.type !== 'message' || (record.role !== 'user' && record.role !== 'assistant')) return [];
    if (typeof record.id !== 'string' || record.id.length === 0) return [];
    if (excludedItemIds.has(record.id)) return [];
    if (allowed && allowed.get(record.id) !== record.role) return [];
    const display = displayContent(record.content, record.role, record.id, turnIdsByMessage.get(record.id));
    if (display.parts.length === 0) return [];
    return [{
      id: record.id,
      role: record.role,
      ...display,
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
  return message.parts.flatMap((part) => part.type === 'text' ? [part.text] : []).join('');
}

function resolveRecoveryProjection(
  items: readonly unknown[],
  recovery: z.infer<typeof displayRecoverySchema>,
  claimedUserItemIds: ReadonlySet<string>,
  excludedItemIds: ReadonlySet<string>,
): { userItemId: string; assistantItemIds: string[] } | undefined {
  const normalized = normalizeConversationItems(items, undefined, excludedItemIds);
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
  excludedItemIds: ReadonlySet<string> = new Set(),
): { userItemId: string; assistantItemIds: string[] } | undefined {
  const normalized = normalizeConversationItems(items, undefined, excludedItemIds);
  const userIndex = normalized.findLastIndex((message) => (
    message.role === 'user' && messageText(message) === userText
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

/**
 * Fetch only the newest provider page needed to bind a just-finished turn.
 * History hydration and erasure keep using the exhaustive ascending reader.
 */
export async function listRecentConversationItems(input: {
  client: ConversationItemsClient;
  conversationId: string;
  abortSignal?: AbortSignal;
}): Promise<unknown[]> {
  if (input.abortSignal?.aborted) {
    throw input.abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
  }
  const page = await input.client.listItems({
    conversationId: input.conversationId,
    limit: 100,
    order: 'desc',
    abortSignal: input.abortSignal,
  });
  if (!Array.isArray(page.data)) throw new ConversationHistoryProviderError('list');
  return [...page.data].reverse();
}

type AgentTurnRecord = Awaited<ReturnType<IStorage['listAgentTurns']>>[number];

const internalContextItemIdsSchema = z.array(providerItemIdSchema).max(100);

function internalContextItemIds(turns: readonly AgentTurnRecord[]): Set<string> {
  const ids = new Set<string>();
  for (const turn of turns) {
    const terminal = turn.terminalResult;
    if (!terminal || typeof terminal !== 'object') continue;
    const parsed = internalContextItemIdsSchema.safeParse(
      (terminal as Record<string, unknown>).internalContextItemIds,
    );
    if (!parsed.success) continue;
    for (const id of parsed.data) ids.add(id);
  }
  return ids;
}

function projectConversationHistory(
  items: readonly unknown[],
  turns: readonly AgentTurnRecord[],
  excludedItemIds: ReadonlySet<string>,
): {
  messages: NormalizedHistoryMessage[];
  backfills: Array<{ turnId: string; displayProjection: z.infer<typeof displayProjectionSchema> }>;
} {
  const allowed = new Map<string, 'user' | 'assistant'>();
  const stoppedAssistantIds = new Set<string>();
  const turnIdsByMessage = new Map<string, string>();
  const claimedUserItemIds = new Set<string>();
  const directProjections = new Map<string, z.infer<typeof displayProjectionSchema>>();
  const backfills: Array<{ turnId: string; displayProjection: z.infer<typeof displayProjectionSchema> }> = [];
  // Claim durable provider ids first so an older digest-only recovery can
  // never steal an item already bound explicitly to another completed turn.
  for (const turn of turns) {
    if (turn.origin !== 'agent-turn' || (turn.status !== 'completed' && turn.status !== 'cancelled')) continue;
    const terminal = turn.terminalResult;
    if (!terminal || terminal.kind !== turn.status) continue;
    const direct = displayProjectionSchema.safeParse(terminal.displayProjection);
    if (!direct.success
      || excludedItemIds.has(direct.data.userItemId)
      || direct.data.assistantItemIds.some((id) => excludedItemIds.has(id))
      || claimedUserItemIds.has(direct.data.userItemId)
    ) continue;
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
      projection = resolveRecoveryProjection(items, recovery.data, claimedUserItemIds, excludedItemIds);
      if (!projection) continue;
      backfills.push({
        turnId: turn.turnId,
        displayProjection: projection,
      });
    }
    if (turn.status === 'completed' && projection.assistantItemIds.length === 0) continue;
    claimedUserItemIds.add(projection.userItemId);
    allowed.set(projection.userItemId, 'user');
    turnIdsByMessage.set(projection.userItemId, turn.turnId);
    for (const id of projection.assistantItemIds) {
      allowed.set(id, 'assistant');
      turnIdsByMessage.set(id, turn.turnId);
      if (turn.status === 'cancelled') stoppedAssistantIds.add(id);
    }
  }
  return {
    messages: normalizeConversationItems(items, allowed, excludedItemIds, turnIdsByMessage).map((message) => (
      message.role === 'assistant' && stoppedAssistantIds.has(message.id)
        ? { ...message, deliveryStatus: 'stopped' as const }
        : message
    )),
    backfills,
  };
}

export interface ConversationHistoryPage {
  status: 'empty' | 'ready';
  messages: NormalizedHistoryMessage[];
  olderCursor?: string;
}

export async function loadConversationHistory(input: {
  storage: Pick<IStorage, 'getConversationMapping' | 'listAgentTurns'>
    & Partial<Pick<IStorage, 'backfillAgentTurnDisplayProjection'>>;
  client: ConversationItemsClient;
  userId: string;
  cursor?: string;
  cursorCodec?: ConversationHistoryCursorCodec;
  pageSize?: number;
  abortSignal?: AbortSignal;
}): Promise<ConversationHistoryPage> {
  const mappedConversationId = await input.storage.getConversationMapping(input.userId);
  if (!mappedConversationId) return { status: 'empty', messages: [] };
  const conversationId = conversationIdSchema.parse(mappedConversationId);
  const cursorCodec = input.cursorCodec;
  let after: string | undefined;
  if (input.cursor !== undefined) {
    try {
      if (!cursorCodec) throw new Error('Conversation history cursor codec is required.');
      const decoded = cursorCodec.decode(input.cursor);
      if (decoded.conversationId !== conversationId) throw new Error('Cursor owner mismatch.');
      after = decoded.after;
    } catch {
      throw new ConversationHistoryProviderError('list');
    }
  }
  const pageSize = z.number().int().positive().max(MAX_HISTORY_PAGE_SIZE)
    .parse(input.pageSize ?? HISTORY_PAGE_SIZE);
  const turns = await input.storage.listAgentTurns(input.userId);
  const excludedItemIds = internalContextItemIds(turns);
  const newestFirstItems: unknown[] = [];
  const seenCursors = new Set<string>(after ? [after] : []);
  let providerHasMore = false;
  let nextAfter: string | undefined = after;
  let projection = projectConversationHistory([], turns, excludedItemIds);

  for (let pageCount = 0; pageCount < MAX_PROVIDER_PAGES_PER_DISPLAY_PAGE; pageCount += 1) {
    if (input.abortSignal?.aborted) {
      throw input.abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    const remaining = Math.max(1, pageSize - projection.messages.length);
    const page = await input.client.listItems({
      conversationId,
      after: nextAfter,
      limit: remaining,
      order: 'desc',
      abortSignal: input.abortSignal,
    });
    if (!Array.isArray(page.data) || page.data.length > remaining) {
      throw new ConversationHistoryProviderError('list');
    }
    newestFirstItems.push(...page.data);
    projection = projectConversationHistory([...newestFirstItems].reverse(), turns, excludedItemIds);
    providerHasMore = page.hasMore;
    if (page.hasMore) {
      if (!page.lastId || seenCursors.has(page.lastId)) {
        throw new ConversationHistoryProviderError('list');
      }
      seenCursors.add(page.lastId);
      nextAfter = page.lastId;
    }
    if (!page.hasMore || projection.messages.length >= pageSize) break;
  }

  await Promise.all(projection.backfills.map((backfill) => (
    input.storage.backfillAgentTurnDisplayProjection?.({
      userId: input.userId,
      ...backfill,
    }).catch(() => undefined)
  )));

  let olderCursor: string | undefined;
  if (providerHasMore && nextAfter) {
    if (!cursorCodec) throw new ConversationHistoryProviderError('list');
    olderCursor = cursorCodec.encode({ conversationId, after: nextAfter });
  }

  return {
    status: 'ready',
    messages: projection.messages,
    ...(olderCursor ? { olderCursor } : {}),
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
    order: 'asc' | 'desc';
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

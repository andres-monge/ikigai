import { createHash } from 'node:crypto';
import { providerInternalContextMarker, type ConversationItemsClient } from '../ai/history.js';
import { PURPOSE_PATHS_OFFER_ENGLISH } from '../ai/method/base-instructions.js';
import type { ReportingSnapshot } from './source.js';

type TurnStatus = 'pending' | 'completed' | 'cancelled' | 'failed';
type ReviewTurn = { source: string; status: TurnStatus; origin: 'agent-turn'|'workspace-action'; createdAt: string; terminalAt: string|null };
export type ConversationReview = {
  version: 1;
  participantKey: string;
  databaseObservedAt: string;
  retrievedAt: string;
  status: 'available'|'checked-empty'|'missing-mapping'|'unavailable'|'partial';
  pagination: 'complete'|'partial'|'unavailable'|'missing-mapping';
  contentCoverage: 'complete'|'partial'|'unknown';
  complete: boolean;
  pagesRead: number;
  excludedInternalItems: number;
  messages: Array<{source: string; role: 'user'|'assistant'; text: string; context: 'bound-turn'|'unbound-review-context'|'provider-review-context'; browserPresentation?: string; delivery: 'unknown'; turn?: {source: string;status: TurnStatus}}>; 
  turns: ReviewTurn[];
  gaps: Array<{source: string;reason: 'provider-read-failed'|'invalid-page'|'nonadvancing-cursor'|'cancelled'|'invalid-item'|'conflicting-item'|'unclassified-internal-context'|'internal-context-unresolved'|'unsupported-message-content'|'bound-message-unavailable'|'no-mapping-with-recorded-turns'|'recorded-turn-content-unavailable'}>;
};

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const date = (value: Date|string|null): string|null => value === null ? null : new Date(value).toISOString();

/** Server credentials and ownership resolution belong to the caller; this reader has GET-only authority. */
export async function retrieveConversation(input: {
  participantKey: string;
  snapshot: ReportingSnapshot;
  client: Pick<ConversationItemsClient, 'listItems'>;
  abortSignal?: AbortSignal;
}): Promise<ConversationReview> {
  const { snapshot, participantKey } = input;
  const alias = (kind: string, id: string) => `${participantKey}/${kind}/${hash(`${participantKey}\0${kind}\0${id}`).slice(0,32)}`;
  const report: ConversationReview = {
    version: 1, participantKey, databaseObservedAt: snapshot.observedAt, retrievedAt: new Date().toISOString(),
    status: 'available', pagination: 'complete', contentCoverage: 'complete', complete: false,
    pagesRead: 0, excludedInternalItems: 0, messages: [], gaps: [],
    turns: snapshot.turns.map(turn => ({ source: `turn/${turn.turnId}`, status: turn.status, origin: turn.origin, createdAt: date(turn.createdAt)!, terminalAt: date(turn.terminalAt) })),
  };
  if (!snapshot.conversationId) {
    report.status = 'missing-mapping'; report.pagination = 'missing-mapping'; report.contentCoverage = 'unknown';
    if (snapshot.turns.length) report.gaps.push({source: participantKey, reason: 'no-mapping-with-recorded-turns'});
    return report;
  }

  const items = new Map<string, RecordValue>();
  const seenCursors = new Set<string>();
  let after: string|undefined;
  while (true) {
    if (input.abortSignal?.aborted) {
      report.gaps.push({source: participantKey, reason: 'cancelled'});
      report.pagination = report.pagesRead ? 'partial' : 'unavailable'; break;
    }
    let page;
    try {
      page = await input.client.listItems({conversationId:snapshot.conversationId, after, limit:100, order:'asc', abortSignal:input.abortSignal});
    } catch {
      report.gaps.push({source:participantKey, reason:input.abortSignal?.aborted ? 'cancelled' : 'provider-read-failed'});
      report.pagination = report.pagesRead ? 'partial' : 'unavailable'; break;
    }
    if (!page || !Array.isArray(page.data) || page.data.length > 100 || typeof page.hasMore !== 'boolean') {
      report.gaps.push({source:participantKey, reason:'invalid-page'});
      report.pagination = report.pagesRead ? 'partial' : 'unavailable'; break;
    }
    report.pagesRead++;
    for (const [index,value] of page.data.entries()) {
      const item = record(value);
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 200) {
        report.gaps.push({source:`page/${report.pagesRead}/item/${index+1}`,reason:'invalid-item'});continue;
      }
      const prior = items.get(item.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(item)) report.gaps.push({source:alias('item',item.id),reason:'conflicting-item'});
      if (!prior) items.set(item.id,item);
    }
    if (!page.hasMore) break;
    if (!page.lastId || page.lastId.length > 200 || seenCursors.has(page.lastId)) {
      report.gaps.push({source:participantKey,reason:'nonadvancing-cursor'});report.pagination = 'partial';break;
    }
    seenCursors.add(page.lastId); after = page.lastId;
  }

  const internalIds = new Set<string>();
  const markers = new Set<string>();
  for (const turn of snapshot.turns) {
    const terminal = record(turn.terminalResult);
    for (const id of strings(terminal?.internalContextItemIds)) internalIds.add(id);
    for (const marker of strings(terminal?.internalContextMarkers)) markers.add(marker);
  }
  const foundMarkers = new Set<string>();
  for (const [id,item] of items) {
    const candidate = providerInternalContextMarker(item);
    if (!candidate) continue;
    internalIds.add(id);
    if (markers.has(candidate.marker)) foundMarkers.add(candidate.marker);
    else report.gaps.push({source:alias('item',id),reason:'unclassified-internal-context'});
  }
  if ([...markers].some(marker=>!foundMarkers.has(marker))) report.gaps.push({source:participantKey,reason:'internal-context-unresolved'});
  report.excludedInternalItems = [...items.keys()].filter(id=>internalIds.has(id)).length;

  const bindings = new Map<string, {source:string;status:TurnStatus}>();
  const canonicalPresentations = new Map<string,string>();
  const providerOnlyIds = new Set<string>();
  const firstCompletedOffer = snapshot.turns.findIndex(turn => turn.origin==='agent-turn' && turn.status==='completed' && turn.terminalResult?.kind==='completed' && turn.terminalResult.canonicalPurposePathsOffer===true);
  for (const [turnIndex,turn] of snapshot.turns.entries()) {
    const terminal = record(turn.terminalResult);
    const projection = record(terminal?.displayProjection);
    const assistantProjection = record(terminal?.assistantDisplayProjection);
    const ids = [...strings(projection?.assistantItemIds),...strings(assistantProjection?.assistantItemIds)];
    if (terminal?.canonicalPurposePathsOffer === true && turn.origin==='agent-turn' && (firstCompletedOffer<0 || turnIndex<=firstCompletedOffer)) {
      const assistants = strings(projection?.assistantItemIds);
      const final = assistants.at(-1);
      if (final) canonicalPresentations.set(final,PURPOSE_PATHS_OFFER_ENGLISH);
      for (const id of assistants.slice(0,-1)) providerOnlyIds.add(id);
    }
    if (typeof projection?.userItemId === 'string') ids.unshift(projection.userItemId);
    for (const id of ids) {
      if (internalIds.has(id)) continue;
      bindings.set(id,{source:`turn/${turn.turnId}`,status:turn.status});
      if (!items.has(id)) report.gaps.push({source:alias('item',id),reason:'bound-message-unavailable'});
    }
  }

  // Unlike the browser projection, review keeps every text part without truncation.
  const visible: Array<{id:string;role:'user'|'assistant';text:string}> = [];
  for (const [id,item] of items) {
    if (internalIds.has(id) || item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) continue;
    const parts = Array.isArray(item.content) ? item.content : [];
    const texts: string[] = [];
    let unsupported = !Array.isArray(item.content) || parts.length===0;
    for (const rawPart of parts) {
      const part = record(rawPart);
      const allowed = part && (part.type === 'text' || (item.role === 'user' ? part.type === 'input_text' : part.type === 'output_text'));
      if (allowed && typeof part.text === 'string') texts.push(part.text);
      else if (part?.type === 'refusal' && item.role === 'assistant' && typeof part.refusal === 'string') texts.push(part.refusal);
      else unsupported = true;
    }
    if (unsupported) report.gaps.push({source:alias('item',id),reason:'unsupported-message-content'});
    if (texts.length) visible.push({id,role:item.role,text:texts.join('')});
  }
  // Recovery digests identify human attempts even when the browser has no usable assistant projection.
  for (const turn of snapshot.turns) {
    if (turn.origin !== 'agent-turn') continue;
    const recovery = record(record(turn.terminalResult)?.displayRecovery);
    if (typeof recovery?.userTextDigest !== 'string' || !/^[a-f0-9]{64}$/.test(recovery.userTextDigest)) continue;
    const matchIndex = visible.findIndex(item=>item.role==='user' && !bindings.has(item.id) && hash(item.text)===recovery.userTextDigest);
    if (matchIndex < 0) continue;
    const binding = {source:`turn/${turn.turnId}`,status:turn.status};
    bindings.set(visible[matchIndex].id,binding);
    // Adjacency supplies review context, not proof that a partial reply was delivered.
    for (let index=matchIndex+1; index<visible.length && visible[index].role!=='user'; index++) {
      if (!bindings.has(visible[index].id)) bindings.set(visible[index].id,binding);
    }
  }
  for (const item of visible) {
    const binding = bindings.get(item.id);
    report.messages.push({source:alias('item',item.id),role:item.role,text:item.text,context:providerOnlyIds.has(item.id)?'provider-review-context':binding?'bound-turn':'unbound-review-context',delivery:'unknown',...(canonicalPresentations.has(item.id)?{browserPresentation:canonicalPresentations.get(item.id)}:{}),...(binding?{turn:binding}:{})});
  }
  for (const turn of report.turns) {
    if (turn.origin === 'agent-turn' && !report.messages.some(message=>message.turn?.source===turn.source)) {
      report.gaps.push({source:turn.source,reason:'recorded-turn-content-unavailable'});
    }
  }
  report.contentCoverage = report.pagination==='unavailable' ? 'unknown' : report.gaps.length ? 'partial' : 'complete';
  report.complete = report.pagination==='complete' && report.contentCoverage==='complete';
  report.status = report.pagination==='unavailable' ? 'unavailable' : !report.complete ? 'partial' : !report.messages.length ? 'checked-empty' : 'available';
  report.retrievedAt = new Date().toISOString();
  return report;
}

export function renderConversationMarkdown(report: ConversationReview): string {
  const lines = [`# Conversation review: ${report.participantKey}`, '', `Status: ${report.status}`, `Provider pagination: ${report.pagination}; conversation content: ${report.contentCoverage}`, `Database observed: ${report.databaseObservedAt}; provider read completed: ${report.retrievedAt}`, 'Browser delivery: unknown', '', '## Recorded turns', ''];
  for (const turn of report.turns) lines.push(`- ${turn.source}: ${turn.origin}, ${turn.status}; created ${turn.createdAt}; terminal ${turn.terminalAt??'unknown'}`);
  lines.push('', '## Conversation', '');
  for (const message of report.messages) lines.push(`### ${message.role} — ${message.source}`, '', `${message.context}${message.turn?`; ${message.turn.source}: ${message.turn.status}`:''}; delivery unknown`, '',message.text,...(message.browserPresentation?['','Browser presentation:',message.browserPresentation]:[]),'');
  if (report.gaps.length) {lines.push('## Evidence gaps','');for (const gap of report.gaps) lines.push(`- ${gap.source}: ${gap.reason}`);}
  return lines.join('\n');
}

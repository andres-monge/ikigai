import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  RESEARCH_SOURCE_LIMITS,
  amendedCitedResearchSourceSchema,
  amendedResearchAttemptSchema,
  consultedResearchSourceSchema,
  canonicalizeResearchUrl,
  normalizeResearchClaim,
  type AmendedResearchAttempt,
  type SourceProvenance,
} from '../../shared/career-map/index.js';
import type { IStorage } from '../storage.js';

type UnknownRecord = Record<string, unknown>;

const MAX_PROVIDER_NODES = 20_000;
const MAX_EVIDENCE_EVENTS = 200;
const MAX_MANIFEST_ENTRIES = 48;
const HANDLE_HEX_CHARACTERS = 48;
const CLAIM_CITATION_DISTANCE = 8;
const canonicalFieldPattern = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/u;

export interface NativeSearchStep {
  content?: readonly unknown[];
  toolCalls?: readonly unknown[];
  toolResults?: readonly unknown[];
  sources?: readonly unknown[];
  finishReason?: unknown;
  response?: { body?: unknown } | null;
}

export interface NativeSearchClaimBinding {
  targetId: string;
  targetRevision: number;
  canonicalField: string;
  exactClaim: string;
}

export interface NativeSearchAttemptTarget {
  targetId: string;
  targetRevision: number;
}

export interface ResearchSourceReference {
  handle: string;
  canonicalField: string;
  exactClaim: string;
}

export interface NativeSearchResolutionContext {
  userId: string;
  turnId: string;
  leaseId: string;
  targetId: string;
  targetRevision: number;
}

type SearchAction = 'search' | 'openPage' | 'findInPage';

export type NativeSearchEvidenceEvent =
  | { sequence: number; kind: 'search-call'; providerCallId: string }
  | { sequence: number; kind: 'search-result'; providerCallId: string }
  | { sequence: number; kind: 'provider-action'; providerCallId: string; action: SearchAction }
  | {
      sequence: number;
      kind: 'consulted-source';
      providerCallId: string;
      providerResultId: string;
      url: string;
    }
  | {
      sequence: number;
      kind: 'claim-citation';
      providerCallId: string;
      providerResultId: string;
      canonicalField: string;
      exactClaim: string;
      url: string;
      citation: CitationAssociation;
    };

interface CitationAssociation {
  start: number;
  end: number;
  exactClaimStart: number;
  exactClaimEnd: number;
  textHash: string;
}

export interface ParsedNativeSearchAssociation {
  binding: NativeSearchClaimBinding;
  providerCallId: string;
  providerResultId: string;
  url: string;
  title?: string;
  excerpt?: string;
  support: 'server-validated' | 'cited-provenance';
  citation: CitationAssociation;
  /** Retrieved material can support a claim; it never authorizes a state change. */
  authority: 'none';
}

export interface NativeSearchEvidenceRejection {
  targetId: string;
  targetRevision: number;
  canonicalField: string;
  exactClaim: string;
  reason:
    | 'invalid-binding'
    | 'missing-citation'
    | 'invalid-citation'
    | 'missing-provider-association'
    | 'ambiguous-provider-association';
}

export interface ParsedNativeSearchStep {
  events: NativeSearchEvidenceEvent[];
  associations: ParsedNativeSearchAssociation[];
  rejections: NativeSearchEvidenceRejection[];
  searchObserved: boolean;
}

export interface NativeSearchEvidenceManifestEntry {
  handle: string;
  targetId: string;
  targetRevision: number;
  canonicalField: string;
  exactClaim: string;
  support: 'server-validated' | 'cited-provenance';
  /** Explicitly prevents a lower-priority manifest from being read as authority. */
  authority: 'none';
}

export interface NativeSearchEvidenceCaptureResult {
  status: 'ignored' | 'duplicate' | 'succeeded' | 'insufficient' | 'failed';
  events: NativeSearchEvidenceEvent[];
  rejections: NativeSearchEvidenceRejection[];
  attempts: AmendedResearchAttempt[];
  minted: NativeSearchEvidenceManifestEntry[];
}

export interface NativeSearchEvidenceCaptureContext {
  checkpoint: AmendedResearchAttempt['checkpoint'];
  moduleVersion: string;
}

export class NativeSearchEvidenceError extends Error {
  readonly code = 'invalid-native-search-evidence';

  constructor() {
    super('Native search evidence is invalid for this turn, target, field, and claim.');
    this.name = 'NativeSearchEvidenceError';
  }
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function boundedProviderId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 160
    ? value
    : undefined;
}

function throwIfAborted(abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted) {
    throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
  }
}

function safeCanonicalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > RESEARCH_SOURCE_LIMITS.urlCharacters) return undefined;
  try {
    const canonical = canonicalizeResearchUrl(value);
    return canonical.length <= RESEARCH_SOURCE_LIMITS.urlCharacters ? canonical : undefined;
  } catch {
    return undefined;
  }
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maximum);
}

function walkRecords(value: unknown, visitor: (record: UnknownRecord) => void): void {
  const pending: unknown[] = [value];
  let visited = 0;
  while (pending.length > 0 && visited < MAX_PROVIDER_NODES) {
    const next = pending.shift();
    if (Array.isArray(next)) {
      pending.unshift(...next);
      continue;
    }
    const record = asRecord(next);
    if (!record) continue;
    visited += 1;
    visitor(record);
    pending.unshift(...Object.values(record));
  }
}

interface ResultCandidate {
  providerCallId: string;
  providerResultId: string;
  url: string;
  title?: string;
  contents: string[];
  ambiguousIdentity: boolean;
}

interface MutableResultCandidate {
  explicitIds: Set<string>;
  fallbackResultId: string;
  providerCallId: string;
  url: string;
  titles: string[];
  contents: string[];
}

function resultContent(record: UnknownRecord): string | undefined {
  for (const key of ['text', 'snippet', 'content']) {
    if (typeof record[key] === 'string') return record[key];
  }
  return undefined;
}

function addResultCandidates(
  value: unknown,
  providerCallId: string,
  target: Map<string, MutableResultCandidate>,
  trustResultIdentity = true,
): void {
  walkRecords(value, (record) => {
    const url = safeCanonicalUrl(record.url);
    if (!url) return;
    const key = `${providerCallId}\u0000${url}`;
    const candidate = target.get(key) ?? {
      explicitIds: new Set<string>(),
      fallbackResultId: providerCallId,
      providerCallId,
      url,
      titles: [],
      contents: [],
    };
    const explicitId = trustResultIdentity ? boundedProviderId(record.id) : undefined;
    if (explicitId && explicitId !== providerCallId) candidate.explicitIds.add(explicitId);
    const title = boundedText(record.title, RESEARCH_SOURCE_LIMITS.titleCharacters);
    if (title) candidate.titles.push(title);
    const content = resultContent(record);
    if (content) candidate.contents.push(content);
    target.set(key, candidate);
  });
}

function searchParts(step: NativeSearchStep, kind: 'tool-call' | 'tool-result'): UnknownRecord[] {
  const direct = (step.content ?? []).flatMap((part) => {
    const record = asRecord(part);
    return record?.type === kind
      && record.toolName === 'web_search'
      && record.providerExecuted === true
      ? [record]
      : [];
  });
  if (direct.length > 0) return direct;
  const fallback = kind === 'tool-call' ? step.toolCalls : step.toolResults;
  return (fallback ?? []).flatMap((part) => {
    const record = asRecord(part);
    return record?.toolName === 'web_search' && record.providerExecuted === true ? [record] : [];
  });
}

function rawSearchCalls(step: NativeSearchStep): Map<string, UnknownRecord> {
  const calls = new Map<string, UnknownRecord>();
  walkRecords(step.response?.body, (record) => {
    if (record.type !== 'web_search_call') return;
    const id = boundedProviderId(record.id) ?? boundedProviderId(record.call_id);
    if (id) calls.set(id, record);
  });
  return calls;
}

function normalizedAction(value: unknown): SearchAction | undefined {
  if (value === 'search') return 'search';
  if (value === 'openPage' || value === 'open_page') return 'openPage';
  if (value === 'findInPage' || value === 'find_in_page') return 'findInPage';
  return undefined;
}

function indexedResults(step: NativeSearchStep): {
  calls: UnknownRecord[];
  results: UnknownRecord[];
  candidates: ResultCandidate[];
} {
  const calls = searchParts(step, 'tool-call');
  const results = searchParts(step, 'tool-result');
  const rawCalls = rawSearchCalls(step);
  const mutable = new Map<string, MutableResultCandidate>();

  for (const result of results) {
    const providerCallId = boundedProviderId(result.toolCallId);
    if (!providerCallId) continue;
    addResultCandidates(result.output ?? result.result, providerCallId, mutable);
    const raw = rawCalls.get(providerCallId);
    if (raw) addResultCandidates(raw, providerCallId, mutable);
  }

  if (results.length === 1) {
    const providerCallId = boundedProviderId(results[0]?.toolCallId);
    // AI SDK source-part ids are local display identities, not provider result
    // identities. They may supply a title/URL only when one call makes the join
    // unambiguous.
    if (providerCallId) addResultCandidates(step.sources, providerCallId, mutable, false);
  }

  return {
    calls,
    results,
    candidates: [...mutable.values()].map((candidate) => ({
      providerCallId: candidate.providerCallId,
      providerResultId: [...candidate.explicitIds][0] ?? candidate.fallbackResultId,
      url: candidate.url,
      ...(candidate.titles[0] ? { title: candidate.titles[0] } : {}),
      contents: [...new Set(candidate.contents)],
      ambiguousIdentity: candidate.explicitIds.size > 1,
    })),
  };
}

interface TextCitation {
  text: string;
  textHash: string;
  start: number;
  end: number;
  rawUrl: unknown;
  url?: string;
  title?: string;
}

export interface NativeSearchDisplayCitation {
  citationId: string;
  exactClaim: string;
  start: number;
  end: number;
  textHash: string;
  url: string;
  title?: string;
  support: 'server-validated' | 'cited-provenance';
  authority: 'none';
}

function textCitations(step: NativeSearchStep): TextCitation[] {
  const citations: TextCitation[] = [];
  for (const part of step.content ?? []) {
    const record = asRecord(part);
    if (record?.type !== 'text' || typeof record.text !== 'string') continue;
    const openai = asRecord(asRecord(record.providerMetadata)?.openai);
    const annotations = Array.isArray(openai?.annotations) ? openai.annotations : [];
    for (const value of annotations) {
      const candidate = asRecord(value);
      if (candidate?.type !== 'url_citation') continue;
      const start = candidate.start_index;
      const end = candidate.end_index;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) continue;
      if ((start as number) < 0 || (end as number) <= (start as number) || (end as number) > record.text.length) {
        continue;
      }
      const title = boundedText(candidate.title, RESEARCH_SOURCE_LIMITS.titleCharacters);
      citations.push({
        text: record.text,
        textHash: createHash('sha256').update(record.text).digest('hex'),
        start: start as number,
        end: end as number,
        rawUrl: candidate.url,
        url: safeCanonicalUrl(candidate.url),
        ...(title ? { title } : {}),
      });
    }
  }
  return citations;
}

function normalizedOffsetToOriginal(value: string, offset: number): number | undefined {
  if (value.normalize('NFC') === value) return offset <= value.length ? offset : undefined;
  for (let index = 0; index <= value.length; index += 1) {
    if (value.slice(0, index).normalize('NFC').length === offset) return index;
  }
  return undefined;
}

function exactClaimSpans(text: string, exactClaim: string): Array<{ start: number; end: number }> {
  const normalizedText = text.normalize('NFC');
  const spans: Array<{ start: number; end: number }> = [];
  let from = 0;
  while (from <= normalizedText.length) {
    const start = normalizedText.indexOf(exactClaim, from);
    if (start < 0) break;
    const end = start + exactClaim.length;
    const originalStart = normalizedOffsetToOriginal(text, start);
    const originalEnd = normalizedOffsetToOriginal(text, end);
    if (originalStart !== undefined && originalEnd !== undefined) {
      spans.push({ start: originalStart, end: originalEnd });
    }
    from = Math.max(end, start + 1);
  }
  return spans;
}

function citationClaimScore(
  citation: TextCitation,
  claimSpan: { start: number; end: number },
): number | undefined {
  const overlaps = citation.start < claimSpan.end && citation.end > claimSpan.start;
  const immediatelyFollows = citation.start >= claimSpan.end
    && citation.start - claimSpan.end <= CLAIM_CITATION_DISTANCE;
  if (overlaps) return 0;
  return immediatelyFollows ? citation.start - claimSpan.end + 1 : undefined;
}

function normalizeBinding(binding: NativeSearchClaimBinding): NativeSearchClaimBinding | undefined {
  const exactClaim = normalizeResearchClaim(binding.exactClaim);
  if (!binding.targetId
    || binding.targetId.length > 160
    || !Number.isSafeInteger(binding.targetRevision)
    || binding.targetRevision < 0
    || !canonicalFieldPattern.test(binding.canonicalField)
    || binding.canonicalField.length > 160
    || !exactClaim
    || exactClaim.length > RESEARCH_SOURCE_LIMITS.claimCharacters
  ) return undefined;
  return { ...binding, exactClaim };
}

function normalizeAttemptTarget(target: NativeSearchAttemptTarget): NativeSearchAttemptTarget | undefined {
  if (!target.targetId
    || target.targetId.length > 160
    || !Number.isSafeInteger(target.targetRevision)
    || target.targetRevision < 0
  ) return undefined;
  return target;
}

function safeExcerpt(contents: readonly string[], exactClaim: string): string | undefined {
  for (const value of contents) {
    const normalized = normalizeResearchClaim(value);
    if (normalized.includes(exactClaim)
      && exactClaim.length <= RESEARCH_SOURCE_LIMITS.excerptCharacters
    ) return exactClaim;
  }
  return undefined;
}

function providerErrorClass(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return new Set([
    'APICallError',
    'Error',
    'NoOutputGeneratedError',
    'RetryError',
    'TimeoutError',
    'ToolCallRepairError',
    'TypeValidationError',
  ]).has(name) ? name : 'NativeSearchProviderError';
}

function rejection(
  binding: NativeSearchClaimBinding,
  reason: NativeSearchEvidenceRejection['reason'],
): NativeSearchEvidenceRejection {
  return { ...binding, reason };
}

function eventSequence(events: NativeSearchEvidenceEvent[]): number {
  return events.length;
}

function candidateDisplayClaims(
  text: string,
  citation: TextCitation,
  contents: readonly string[],
): Array<{ exactClaim: string; start: number; end: number; distance: number }> {
  const claims = new Map<string, { exactClaim: string; start: number; end: number; distance: number }>();
  for (const content of contents) {
    const normalized = normalizeResearchClaim(content);
    const candidates = [
      normalized,
      ...(normalized.match(/[^.!?\n]+[.!?](?=\s|$)/gu) ?? []).map((value) => value.trim()),
    ];
    for (const exactClaim of candidates) {
      if (!exactClaim || exactClaim.length > RESEARCH_SOURCE_LIMITS.claimCharacters) continue;
      for (const span of exactClaimSpans(text, exactClaim)) {
        const score = citationClaimScore(citation, span);
        if (score === undefined) continue;
        const key = JSON.stringify([exactClaim, span.start, span.end]);
        claims.set(key, { exactClaim, ...span, distance: score });
      }
    }
  }
  return [...claims.values()].sort((left, right) => (
    left.distance - right.distance
    || right.exactClaim.length - left.exactClaim.length
    || left.start - right.start
  ));
}

function precedingSentenceClaim(
  text: string,
  citationStart: number,
): { exactClaim: string; start: number; end: number } | undefined {
  let end = citationStart;
  while (end > 0 && /\s/u.test(text[end - 1]!)) end -= 1;
  if (end <= 0) return undefined;
  let searchFrom = end - 1;
  if (/[.!?]/u.test(text[searchFrom]!)) searchFrom -= 1;
  let start = 0;
  for (let index = searchFrom; index >= 0; index -= 1) {
    if (text[index] === '\n') {
      start = index + 1;
      break;
    }
    if (/[.!?]/u.test(text[index]!) && /\s/u.test(text[index + 1] ?? '')) {
      start = index + 1;
      break;
    }
  }
  while (start < end && /\s/u.test(text[start]!)) start += 1;
  const exactClaim = normalizeResearchClaim(text.slice(start, end));
  return exactClaim && exactClaim.length <= RESEARCH_SOURCE_LIMITS.claimCharacters
    ? { exactClaim, start, end }
    : undefined;
}

export function resolveNativeSearchCitationClaim(
  text: string,
  start: number,
  end: number,
  supportingContents: readonly string[] = [],
): { exactClaim: string; start: number; end: number } | undefined {
  const citation = { text, start, end } as TextCitation;
  const sourced = candidateDisplayClaims(text, citation, supportingContents)[0];
  if (sourced) return {
    exactClaim: sourced.exactClaim,
    start: sourced.start,
    end: sourced.end,
  };
  const annotated = normalizeResearchClaim(text.slice(start, end));
  const citationMarker = annotated.length <= 64
    && /^(?:\[[^\]]+\]|\([^)]*\d[^)]*\)|[\p{P}\p{S}\d\s]+)$/u.test(annotated);
  if (citationMarker) return precedingSentenceClaim(text, start);
  return annotated && annotated.length <= RESEARCH_SOURCE_LIMITS.claimCharacters
    ? { exactClaim: annotated, start, end }
    : undefined;
}

function displayClaim(
  citation: TextCitation,
  match: ResultCandidate,
): { exactClaim: string; start: number; end: number } | undefined {
  return resolveNativeSearchCitationClaim(
    citation.text,
    citation.start,
    citation.end,
    match.contents,
  );
}

/**
 * Projects settled provider citations for display/history without requiring a
 * prospective canonical-write binding. Provider call/result ids stay server
 * side; an unmatched or ambiguous URL produces no display citation.
 */
export function extractNativeSearchDisplayCitations(
  step: NativeSearchStep,
): NativeSearchDisplayCitation[] {
  const indexed = indexedResults(step);
  const callIds = new Set(indexed.calls.flatMap((call) => {
    const callId = boundedProviderId(call.toolCallId);
    return callId ? [callId] : [];
  }));
  const resultIds = new Set(indexed.results.flatMap((result) => {
    const callId = boundedProviderId(result.toolCallId);
    return callId ? [callId] : [];
  }));
  const projected = new Map<string, NativeSearchDisplayCitation>();
  for (const citation of textCitations(step)) {
    if (!citation.url) continue;
    const matches = indexed.candidates.filter((candidate) => (
      candidate.url === citation.url
      && callIds.has(candidate.providerCallId)
      && resultIds.has(candidate.providerCallId)
      && !candidate.ambiguousIdentity
    ));
    if (matches.length !== 1) continue;
    const match = matches[0]!;
    const claim = displayClaim(citation, match);
    if (!claim) continue;
    const excerpt = safeExcerpt(match.contents, claim.exactClaim);
    const key = JSON.stringify([
      citation.textHash,
      claim.start,
      claim.end,
      citation.url,
    ]);
    projected.set(key, {
      citationId: `cit_${createHash('sha256').update(key).digest('hex').slice(0, 32)}`,
      exactClaim: claim.exactClaim,
      start: claim.start,
      end: claim.end,
      textHash: citation.textHash,
      url: citation.url,
      ...(citation.title ?? match.title ? { title: citation.title ?? match.title } : {}),
      support: excerpt ? 'server-validated' : 'cited-provenance',
      authority: 'none',
    });
  }
  return [...projected.values()].slice(0, RESEARCH_SOURCE_LIMITS.sourcesPerAttempt);
}

/**
 * Deterministically parses one completed AI SDK v7 StepResult. This function
 * never invokes a model or provider and never grants canonical-write authority.
 */
export function parseNativeSearchStep(
  step: NativeSearchStep,
  requestedBindings: readonly NativeSearchClaimBinding[],
): ParsedNativeSearchStep {
  const indexed = indexedResults(step);
  const events: NativeSearchEvidenceEvent[] = [];
  const callIds = new Set(indexed.calls.flatMap((call) => {
    const callId = boundedProviderId(call.toolCallId);
    return callId ? [callId] : [];
  }));
  const resultByCall = new Map(indexed.results.flatMap((result) => {
    const callId = boundedProviderId(result.toolCallId);
    return callId ? [[callId, result] as const] : [];
  }));

  for (const part of step.content ?? []) {
    if (events.length >= MAX_EVIDENCE_EVENTS) break;
    const record = asRecord(part);
    if (!record || record.toolName !== 'web_search' || record.providerExecuted !== true) continue;
    const providerCallId = boundedProviderId(record.toolCallId);
    if (!providerCallId) continue;
    if (record.type === 'tool-call') {
      events.push({ sequence: eventSequence(events), kind: 'search-call', providerCallId });
      continue;
    }
    if (record.type !== 'tool-result') continue;
    events.push({ sequence: eventSequence(events), kind: 'search-result', providerCallId });
    const output = record.output ?? record.result;
    const action = normalizedAction(asRecord(asRecord(output)?.action)?.type);
    if (action && events.length < MAX_EVIDENCE_EVENTS) {
      events.push({ sequence: eventSequence(events), kind: 'provider-action', providerCallId, action });
    }
    for (const candidate of indexed.candidates.filter((entry) => entry.providerCallId === providerCallId)) {
      if (events.length >= MAX_EVIDENCE_EVENTS) break;
      events.push({
        sequence: eventSequence(events),
        kind: 'consulted-source',
        providerCallId,
        providerResultId: candidate.providerResultId,
        url: candidate.url,
      });
    }
  }

  // Some synthetic and future SDK shapes may provide only the convenience
  // arrays. They remain parseable, but no invented ordering is emitted.
  const searchObserved = indexed.calls.length > 0 && indexed.results.length > 0;
  const citations = textCitations(step);
  const associations: ParsedNativeSearchAssociation[] = [];
  const rejections: NativeSearchEvidenceRejection[] = [];
  const validBindings = requestedBindings.flatMap((binding) => {
    const normalized = normalizeBinding(binding);
    return normalized ? [normalized] : [];
  });

  for (const rawBinding of requestedBindings) {
    const binding = normalizeBinding(rawBinding);
    if (!binding) {
      rejections.push(rejection({
        targetId: String(rawBinding.targetId).slice(0, 160),
        targetRevision: Number.isSafeInteger(rawBinding.targetRevision) ? rawBinding.targetRevision : 0,
        canonicalField: String(rawBinding.canonicalField).slice(0, 160),
        exactClaim: normalizeResearchClaim(String(rawBinding.exactClaim)).slice(
          0,
          RESEARCH_SOURCE_LIMITS.claimCharacters,
        ),
      }, 'invalid-binding'));
      continue;
    }
    const related = citations.flatMap((citation) => {
      const allScores = validBindings.flatMap((candidate) => exactClaimSpans(
        citation.text,
        candidate.exactClaim,
      ).flatMap((claimSpan) => {
        const score = citationClaimScore(citation, claimSpan);
        return score === undefined ? [] : [{ score }];
      }));
      const bestScore = allScores.length > 0
        ? Math.min(...allScores.map((candidate) => candidate.score))
        : undefined;
      return exactClaimSpans(citation.text, binding.exactClaim).flatMap((claimSpan) => {
        const score = citationClaimScore(citation, claimSpan);
        return score !== undefined && score === bestScore ? [{ citation, claimSpan }] : [];
      });
    });
    if (related.length === 0) {
      rejections.push(rejection(binding, 'missing-citation'));
      continue;
    }
    if (related.some(({ citation }) => !citation.url)) {
      rejections.push(rejection(binding, 'invalid-citation'));
      continue;
    }

    const resolved = related.map(({ citation, claimSpan }) => {
      const matches = indexed.candidates.filter((candidate) => (
        candidate.url === citation.url
        && callIds.has(candidate.providerCallId)
        && resultByCall.has(candidate.providerCallId)
      ));
      if (matches.length !== 1) return { status: matches.length === 0 ? 'missing' : 'ambiguous' } as const;
      const match = matches[0]!;
      if (match.ambiguousIdentity) return { status: 'ambiguous' } as const;
      const excerpt = safeExcerpt(match.contents, binding.exactClaim);
      return {
        status: 'resolved' as const,
        association: {
          binding,
          providerCallId: match.providerCallId,
          providerResultId: match.providerResultId,
          url: match.url,
          ...(citation.title ?? match.title ? { title: citation.title ?? match.title } : {}),
          ...(excerpt ? { excerpt } : {}),
          support: excerpt ? 'server-validated' as const : 'cited-provenance' as const,
          citation: {
            start: citation.start,
            end: citation.end,
            exactClaimStart: claimSpan.start,
            exactClaimEnd: claimSpan.end,
            textHash: citation.textHash,
          },
          authority: 'none' as const,
        },
      };
    });
    if (resolved.some((candidate) => candidate.status === 'ambiguous')) {
      rejections.push(rejection(binding, 'ambiguous-provider-association'));
      continue;
    }
    if (resolved.some((candidate) => candidate.status === 'missing')) {
      rejections.push(rejection(binding, 'missing-provider-association'));
      continue;
    }
    const unique = new Map<string, ParsedNativeSearchAssociation>();
    for (const candidate of resolved) {
      if (candidate.status !== 'resolved') continue;
      const association = candidate.association;
      const key = JSON.stringify([
        association.providerCallId,
        association.providerResultId,
        association.url,
        association.citation.start,
        association.citation.end,
        association.citation.exactClaimStart,
        association.citation.exactClaimEnd,
      ]);
      unique.set(key, association);
    }
    for (const association of unique.values()) {
      if (associations.length >= MAX_MANIFEST_ENTRIES) break;
      associations.push(association);
      if (events.length < MAX_EVIDENCE_EVENTS) {
        events.push({
          sequence: eventSequence(events),
          kind: 'claim-citation',
          providerCallId: association.providerCallId,
          providerResultId: association.providerResultId,
          canonicalField: association.binding.canonicalField,
          exactClaim: association.binding.exactClaim,
          url: association.url,
          citation: association.citation,
        });
      }
    }
  }

  return { events, associations, rejections, searchObserved };
}

interface StoredEvidenceRecord {
  userId: string;
  turnId: string;
  leaseId: string;
  source: Extract<SourceProvenance, { kind: 'cited-research'; bindingVersion: 2 }>;
}

export interface NativeSearchEvidenceLedgerOptions {
  storage: Pick<IStorage, 'recordResearchAttempt'>;
  userId: string;
  turnId: string;
  leaseId: string;
  now?: () => Date;
  /** Test-only deterministic override; production uses process-random bytes. */
  handleSecret?: Uint8Array;
}

function captureFingerprint(
  parsed: ParsedNativeSearchStep,
  bindings: readonly NativeSearchClaimBinding[],
  context: NativeSearchEvidenceCaptureContext,
): string {
  return createHash('sha256').update(JSON.stringify({
    events: parsed.events,
    bindings: bindings.map((binding) => normalizeBinding(binding) ?? binding),
    context,
    rejections: parsed.rejections,
  })).digest('hex');
}

function bindingTargetKey(binding: NativeSearchAttemptTarget): string {
  return JSON.stringify([binding.targetId, binding.targetRevision]);
}

function consultedSourcesFromEvents(events: readonly NativeSearchEvidenceEvent[]) {
  const actionByCall = new Map(events.flatMap((event) => (
    event.kind === 'provider-action' ? [[event.providerCallId, event.action] as const] : []
  )));
  const unique = new Map<string, ReturnType<typeof consultedResearchSourceSchema.parse>>();
  for (const event of events) {
    if (event.kind !== 'consulted-source') continue;
    const source = consultedResearchSourceSchema.parse({
      providerCallId: event.providerCallId,
      providerResultId: event.providerResultId,
      ...(actionByCall.get(event.providerCallId)
        ? { action: actionByCall.get(event.providerCallId) }
        : {}),
      url: event.url,
    });
    unique.set(JSON.stringify(source), source);
    if (unique.size >= RESEARCH_SOURCE_LIMITS.sourcesPerAttempt) break;
  }
  return [...unique.values()];
}

export class NativeSearchEvidenceLedger {
  private readonly now: () => Date;
  private readonly handleSecret: Uint8Array;
  private readonly handles = new Map<string, StoredEvidenceRecord>();
  private readonly completedCaptures = new Set<string>();
  private readonly capturedEvents: NativeSearchEvidenceEvent[] = [];
  private failureSequence = 0;

  constructor(private readonly options: NativeSearchEvidenceLedgerOptions) {
    this.now = options.now ?? (() => new Date());
    this.handleSecret = options.handleSecret ?? randomBytes(32);
  }

  private handleFor(association: ParsedNativeSearchAssociation): string {
    return `ev_${createHmac('sha256', this.handleSecret).update(JSON.stringify([
      this.options.userId,
      this.options.turnId,
      this.options.leaseId,
      association.providerCallId,
      association.providerResultId,
      association.binding.targetId,
      association.binding.targetRevision,
      association.binding.canonicalField,
      association.binding.exactClaim,
      association.url,
      association.citation.start,
      association.citation.end,
      association.citation.exactClaimStart,
      association.citation.exactClaimEnd,
      association.citation.textHash,
    ])).digest('hex').slice(0, HANDLE_HEX_CHARACTERS)}`;
  }

  private attemptId(captureId: string, targetKey: string): string {
    return `research_${createHmac('sha256', this.handleSecret)
      .update(`${captureId}\u0000${targetKey}`)
      .digest('hex')
      .slice(0, HANDLE_HEX_CHARACTERS)}`;
  }

  async captureSettledStep(
    step: NativeSearchStep,
    bindings: readonly NativeSearchClaimBinding[],
    context: NativeSearchEvidenceCaptureContext,
    abortSignal?: AbortSignal,
    fallbackTargets: readonly NativeSearchAttemptTarget[] = [],
  ): Promise<NativeSearchEvidenceCaptureResult> {
    throwIfAborted(abortSignal);
    const parsed = parseNativeSearchStep(step, bindings);
    if (!parsed.searchObserved) {
      return {
        status: 'ignored',
        events: parsed.events,
        rejections: parsed.rejections,
        attempts: [],
        minted: [],
      };
    }
    const captureId = captureFingerprint(parsed, bindings, context);
    if (this.completedCaptures.has(captureId)) {
      return {
        status: 'duplicate',
        events: parsed.events,
        rejections: parsed.rejections,
        attempts: [],
        minted: [],
      };
    }

    const normalizedBindings = bindings.flatMap((binding) => {
      const normalized = normalizeBinding(binding);
      return normalized ? [normalized] : [];
    });
    const consultedSources = consultedSourcesFromEvents(parsed.events);
    if (normalizedBindings.length === 0) {
      // A valid provider citation proves that the contextual lookup completed,
      // even when the agent has not yet proposed an exact canonical claim. Keep
      // that distinct from a missing/ambiguous citation, but do not manufacture
      // a v2 cited source (and therefore never expose write-authorizing handles)
      // until a later Response supplies exact target/field/claim bindings.
      const unboundSearchStatus = extractNativeSearchDisplayCitations(step).length > 0
        ? 'succeeded' as const
        : 'insufficient' as const;
      const normalizedTargets = fallbackTargets.flatMap((target) => {
        const normalized = normalizeAttemptTarget(target);
        return normalized ? [normalized] : [];
      });
      const targets = new Map(normalizedTargets.map((target) => [bindingTargetKey(target), target]));
      const attemptedAt = this.now().toISOString();
      const attempts = [...targets.entries()].map(([targetKey, target]) => (
        amendedResearchAttemptSchema.parse({
          schemaVersion: 2,
          id: this.attemptId(captureId, targetKey),
          status: unboundSearchStatus,
          checkpoint: context.checkpoint,
          moduleVersion: context.moduleVersion,
          targetId: target.targetId,
          targetRevision: target.targetRevision,
          attemptedAt,
          consultedSources,
          sources: [],
        })
      ));
      for (const attempt of attempts) {
        throwIfAborted(abortSignal);
        await this.options.storage.recordResearchAttempt(
          this.options.userId,
          this.options.leaseId,
          attempt,
          abortSignal,
        );
      }
      this.completedCaptures.add(captureId);
      this.capturedEvents.push(...parsed.events.slice(
        0,
        Math.max(0, MAX_EVIDENCE_EVENTS - this.capturedEvents.length),
      ));
      return {
        status: attempts.length > 0 ? unboundSearchStatus : 'ignored',
        events: parsed.events,
        rejections: parsed.rejections,
        attempts,
        minted: [],
      };
    }

    const targetGroups = new Map<string, NativeSearchClaimBinding[]>();
    for (const binding of normalizedBindings) {
      const key = bindingTargetKey(binding);
      const group = targetGroups.get(key) ?? [];
      group.push(binding);
      targetGroups.set(key, group);
    }

    const stagedRecords: Array<{ handle: string; record: StoredEvidenceRecord }> = [];
    const attempts: AmendedResearchAttempt[] = [];
    const attemptedAt = this.now().toISOString();
    let turnCapacity = Math.max(0, MAX_MANIFEST_ENTRIES - this.handles.size);

    for (const [targetKey, group] of targetGroups) {
      throwIfAborted(abortSignal);
      const target = group[0]!;
      const groupKeys = new Set(group.map((binding) => JSON.stringify([
        binding.targetId,
        binding.targetRevision,
        binding.canonicalField,
        binding.exactClaim,
      ])));
      const eligibleAssociations = parsed.associations.filter((association) => groupKeys.has(JSON.stringify([
        association.binding.targetId,
        association.binding.targetRevision,
        association.binding.canonicalField,
        association.binding.exactClaim,
      ])));
      const uniqueAssociations = new Map(eligibleAssociations.map((association) => [JSON.stringify([
        association.providerCallId,
        association.providerResultId,
        association.binding.targetId,
        association.binding.targetRevision,
        association.binding.canonicalField,
        association.binding.exactClaim,
        association.url,
        association.citation,
      ]), association]));
      const groupAssociations = [...uniqueAssociations.values()].slice(
        0,
        Math.min(RESEARCH_SOURCE_LIMITS.sourcesPerAttempt, turnCapacity),
      );
      const sources = groupAssociations.map((association) => {
        const sourceHandle = this.handleFor(association);
        const source = amendedCitedResearchSourceSchema.parse({
          kind: 'cited-research',
          bindingVersion: 2,
          sourceHandle,
          providerCallId: association.providerCallId,
          providerResultId: association.providerResultId,
          targetId: association.binding.targetId,
          targetRevision: association.binding.targetRevision,
          canonicalField: association.binding.canonicalField,
          exactClaim: association.binding.exactClaim,
          url: association.url,
          retrievedAt: attemptedAt,
          ...(association.title ? { title: association.title } : {}),
          ...(association.excerpt ? { excerpt: association.excerpt } : {}),
          support: association.support,
          citation: association.citation,
        });
        stagedRecords.push({
          handle: sourceHandle,
          record: {
            userId: this.options.userId,
            turnId: this.options.turnId,
            leaseId: this.options.leaseId,
            source,
          },
        });
        return source;
      });
      turnCapacity -= sources.length;
      const attempt = amendedResearchAttemptSchema.parse({
        schemaVersion: 2,
        id: this.attemptId(captureId, targetKey),
        status: sources.length > 0 ? 'succeeded' : 'insufficient',
        checkpoint: context.checkpoint,
        moduleVersion: context.moduleVersion,
        targetId: target.targetId,
        targetRevision: target.targetRevision,
        attemptedAt,
        consultedSources,
        sources,
      });
      attempts.push(attempt);
    }

    for (const attempt of attempts) {
      throwIfAborted(abortSignal);
      await this.options.storage.recordResearchAttempt(
        this.options.userId,
        this.options.leaseId,
        attempt,
        abortSignal,
      );
    }
    throwIfAborted(abortSignal);

    for (const { handle, record } of stagedRecords) this.handles.set(handle, record);
    this.completedCaptures.add(captureId);
    this.capturedEvents.push(...parsed.events.slice(
      0,
      Math.max(0, MAX_EVIDENCE_EVENTS - this.capturedEvents.length),
    ));
    const minted = stagedRecords.map(({ handle, record }) => ({
      handle,
      targetId: record.source.targetId,
      targetRevision: record.source.targetRevision,
      canonicalField: record.source.canonicalField,
      exactClaim: record.source.exactClaim,
      support: record.source.support,
      authority: 'none' as const,
    }));
    return {
      status: minted.length > 0 ? 'succeeded' : 'insufficient',
      events: parsed.events,
      rejections: parsed.rejections,
      attempts,
      minted,
    };
  }

  /** Compatibility spelling for integration callers; the settled boundary is unchanged. */
  captureStep(
    step: NativeSearchStep,
    bindings: readonly NativeSearchClaimBinding[],
    context: NativeSearchEvidenceCaptureContext,
    abortSignal?: AbortSignal,
  ): Promise<NativeSearchEvidenceCaptureResult> {
    return this.captureSettledStep(step, bindings, context, abortSignal);
  }

  async recordFailedAttempt(
    targets: readonly NativeSearchAttemptTarget[],
    context: NativeSearchEvidenceCaptureContext,
    error: unknown,
    abortSignal?: AbortSignal,
  ): Promise<NativeSearchEvidenceCaptureResult> {
    throwIfAborted(abortSignal);
    const normalizedTargets = targets.flatMap((target) => {
      const normalized = normalizeAttemptTarget(target);
      return normalized ? [normalized] : [];
    });
    if (normalizedTargets.length === 0) throw new NativeSearchEvidenceError();
    const groups = new Map<string, NativeSearchAttemptTarget>();
    for (const target of normalizedTargets) groups.set(bindingTargetKey(target), target);
    const attemptedAt = this.now().toISOString();
    const errorClass = providerErrorClass(error);
    const failureId = createHmac('sha256', this.handleSecret).update(JSON.stringify([
      this.options.userId,
      this.options.turnId,
      this.options.leaseId,
      context.checkpoint,
      context.moduleVersion,
      errorClass,
      this.failureSequence++,
    ])).digest('hex');
    const attempts = [...groups.entries()].map(([targetKey, target]) => (
      amendedResearchAttemptSchema.parse({
        schemaVersion: 2,
        id: this.attemptId(`failed_${failureId}`, targetKey),
        status: 'failed',
        checkpoint: context.checkpoint,
        moduleVersion: context.moduleVersion,
        targetId: target.targetId,
        targetRevision: target.targetRevision,
        attemptedAt,
        consultedSources: [],
        sources: [],
        errorClass,
      })
    ));
    for (const attempt of attempts) {
      throwIfAborted(abortSignal);
      await this.options.storage.recordResearchAttempt(
        this.options.userId,
        this.options.leaseId,
        attempt,
        abortSignal,
      );
    }
    throwIfAborted(abortSignal);
    return {
      status: 'failed',
      events: [],
      rejections: [],
      attempts,
      minted: [],
    };
  }

  manifest(): readonly NativeSearchEvidenceManifestEntry[] {
    return [...this.handles.entries()].slice(0, MAX_MANIFEST_ENTRIES)
      .map(([handle, record]) => ({
        handle,
        targetId: record.source.targetId,
        targetRevision: record.source.targetRevision,
        canonicalField: record.source.canonicalField,
        exactClaim: record.source.exactClaim,
        support: record.source.support,
        authority: 'none' as const,
      }));
  }

  events(): readonly NativeSearchEvidenceEvent[] {
    return structuredClone(this.capturedEvents);
  }

  resolveSources(
    references: readonly ResearchSourceReference[],
    expected: NativeSearchResolutionContext,
  ): SourceProvenance[] {
    if (new Set(references.map((reference) => reference.handle)).size !== references.length) {
      throw new NativeSearchEvidenceError();
    }
    return references.map((reference) => {
      const record = this.handles.get(reference.handle);
      const exactClaim = normalizeResearchClaim(reference.exactClaim);
      if (!record
        || record.userId !== expected.userId
        || record.turnId !== expected.turnId
        || record.leaseId !== expected.leaseId
        || record.source.targetId !== expected.targetId
        || record.source.targetRevision !== expected.targetRevision
        || record.source.canonicalField !== reference.canonicalField
        || record.source.exactClaim !== exactClaim
      ) throw new NativeSearchEvidenceError();
      return structuredClone(record.source);
    });
  }
}

export function createNativeSearchEvidenceLedger(
  options: NativeSearchEvidenceLedgerOptions,
): NativeSearchEvidenceLedger {
  return new NativeSearchEvidenceLedger(options);
}

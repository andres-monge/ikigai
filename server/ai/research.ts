import { createHash } from 'node:crypto';

type UnknownRecord = Record<string, unknown>;

const MAX_CITATIONS_PER_STEP = 16;
const MAX_URL_CHARACTERS = 2_048;
const MAX_TITLE_CHARACTERS = 500;
const MAX_CLAIM_CHARACTERS = 2_000;
const CLAIM_CITATION_DISTANCE = 8;

export interface NativeSearchStep {
  content?: readonly unknown[];
  toolCalls?: readonly unknown[];
}

export interface NativeSearchDisplayCitation {
  citationId: string;
  exactClaim: string;
  start: number;
  end: number;
  textHash: string;
  url: string;
  title?: string;
  support: 'cited-provenance';
  authority: 'none';
}

interface TextCitation {
  text: string;
  textHash: string;
  start: number;
  end: number;
  url: string;
  title?: string;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_CHARACTERS) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined;
    parsed.hash = '';
    const normalized = parsed.toString();
    return normalized.length <= MAX_URL_CHARACTERS ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function normalizedOffsetToOriginal(value: string, offset: number): number | undefined {
  if (value.normalize('NFC') === value) return offset <= value.length ? offset : undefined;
  for (let index = 0; index <= value.length; index += 1) {
    if (value.slice(0, index).normalize('NFC').length === offset) return index;
  }
  return undefined;
}

function normalizeClaim(value: string): string {
  return value.normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
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
    if (originalStart !== undefined && originalEnd !== undefined) spans.push({ start: originalStart, end: originalEnd });
    from = Math.max(end, start + 1);
  }
  return spans;
}

function citationClaimScore(
  citation: { start: number; end: number },
  claimSpan: { start: number; end: number },
): number | undefined {
  if (citation.start < claimSpan.end && citation.end > claimSpan.start) return 0;
  const distance = citation.start - claimSpan.end;
  return distance >= 0 && distance <= CLAIM_CITATION_DISTANCE ? distance + 1 : undefined;
}

function precedingSentenceClaim(text: string, citationStart: number) {
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
  const exactClaim = normalizeClaim(text.slice(start, end));
  return exactClaim && exactClaim.length <= MAX_CLAIM_CHARACTERS
    ? { exactClaim, start, end }
    : undefined;
}

export function resolveNativeSearchCitationClaim(
  text: string,
  start: number,
  end: number,
  supportingContents: readonly string[] = [],
): { exactClaim: string; start: number; end: number } | undefined {
  const sourced = supportingContents.flatMap((content) => {
    const normalized = normalizeClaim(content);
    return [normalized, ...(normalized.match(/[^.!?\n]+[.!?](?=\s|$)/gu) ?? []).map((value) => value.trim())];
  }).filter((claim) => claim.length > 0 && claim.length <= MAX_CLAIM_CHARACTERS)
    .flatMap((exactClaim) => exactClaimSpans(text, exactClaim).flatMap((span) => {
      const score = citationClaimScore({ start, end }, span);
      return score === undefined ? [] : [{ exactClaim, ...span, score }];
    }))
    .sort((left, right) => left.score - right.score || right.exactClaim.length - left.exactClaim.length)[0];
  if (sourced) return { exactClaim: sourced.exactClaim, start: sourced.start, end: sourced.end };

  const annotated = normalizeClaim(text.slice(start, end));
  const isMarker = annotated.length <= 64
    && /^(?:\[[^\]]+\]|\([^)]*\d[^)]*\)|[\p{P}\p{S}\d\s]+)$/u.test(annotated);
  if (isMarker) return precedingSentenceClaim(text, start);
  return annotated && annotated.length <= MAX_CLAIM_CHARACTERS
    ? { exactClaim: annotated, start, end }
    : undefined;
}

function textCitations(step: NativeSearchStep): TextCitation[] {
  const citations: TextCitation[] = [];
  for (const part of step.content ?? []) {
    const record = asRecord(part);
    if (record?.type !== 'text' || typeof record.text !== 'string' || record.text.length === 0) continue;
    const openai = asRecord(asRecord(record.providerMetadata)?.openai);
    const annotations = Array.isArray(openai?.annotations) ? openai.annotations : [];
    for (const annotation of annotations) {
      const candidate = asRecord(annotation);
      if (candidate?.type !== 'url_citation') continue;
      const start = candidate.start_index;
      const end = candidate.end_index;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) continue;
      if ((start as number) < 0 || (end as number) <= (start as number) || (end as number) > record.text.length) continue;
      const url = safeHttpsUrl(candidate.url);
      if (!url) continue;
      const title = boundedText(candidate.title, MAX_TITLE_CHARACTERS);
      citations.push({
        text: record.text,
        textHash: createHash('sha256').update(record.text).digest('hex'),
        start: start as number,
        end: end as number,
        url,
        ...(title ? { title } : {}),
      });
    }
  }
  return citations;
}

/** Projects only display-safe provider annotations; citations never authorize canonical state. */
export function extractNativeSearchDisplayCitations(step: NativeSearchStep): NativeSearchDisplayCitation[] {
  const projected = new Map<string, NativeSearchDisplayCitation>();
  for (const citation of textCitations(step)) {
    const claim = resolveNativeSearchCitationClaim(citation.text, citation.start, citation.end);
    if (!claim) continue;
    const key = JSON.stringify([citation.textHash, claim.start, claim.end, citation.url]);
    projected.set(key, {
      citationId: `cit_${createHash('sha256').update(key).digest('hex').slice(0, 32)}`,
      exactClaim: claim.exactClaim,
      start: claim.start,
      end: claim.end,
      textHash: citation.textHash,
      url: citation.url,
      ...(citation.title ? { title: citation.title } : {}),
      support: 'cited-provenance',
      authority: 'none',
    });
  }
  return [...projected.values()].slice(0, MAX_CITATIONS_PER_STEP);
}

import { memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { sanitizeBrowserSourceTitle, type ClaimLinkedCitation } from '@shared/streaming-schemas';
import type { NormalizedHistoryMessage } from './explore-state';

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hProperties?: Record<string, string> };
};

function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const words: number[] = [];
  const bitLength = bytes.length * 8;
  for (const byte of bytes) words.push(byte);
  words.push(0x80);
  while (words.length % 64 !== 56) words.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) words.push(Math.floor(bitLength / (2 ** shift)) & 0xff);
  const primes: number[] = [];
  for (let value = 2; primes.length < 64; value += 1) {
    if (primes.every((prime) => value % prime !== 0)) primes.push(value);
  }
  const constants = primes.map((prime) => Math.floor((Math.cbrt(prime) % 1) * 0x100000000) >>> 0);
  const hash = primes.slice(0, 8).map((prime) => Math.floor((Math.sqrt(prime) % 1) * 0x100000000) >>> 0);
  const rotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));
  for (let offset = 0; offset < words.length; offset += 64) {
    const schedule = new Array<number>(64);
    for (let index = 0; index < 16; index += 1) {
      const cursor = offset + index * 4;
      schedule[index] = ((words[cursor] << 24) | (words[cursor + 1] << 16) | (words[cursor + 2] << 8) | words[cursor + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const left = schedule[index - 15];
      const right = schedule[index - 2];
      const sigma0 = rotate(left, 7) ^ rotate(left, 18) ^ (left >>> 3);
      const sigma1 = rotate(right, 17) ^ rotate(right, 19) ^ (right >>> 10);
      schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index] + schedule[index]) >>> 0;
      const sum0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
}

function citationLabel(citation: ClaimLinkedCitation): string {
  const title = citation.title ? sanitizeBrowserSourceTitle(citation.title) : '';
  if (title) return `Source: ${title}`;
  try {
    return `Source: ${new URL(citation.url).hostname}`;
  } catch {
    return 'Source';
  }
}

function hasSafeCitationUrl(citation: ClaimLinkedCitation): boolean {
  try {
    const url = new URL(citation.url);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function citationLink(citation: ClaimLinkedCitation): ReactNode {
  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label={citationLabel(citation)}
      className="ml-1 inline-flex min-h-6 min-w-6 items-center justify-center border border-black bg-white px-1.5 align-baseline text-[0.7rem] font-extrabold no-underline shadow-[2px_2px_0_rgba(0,0,0,0.65)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
    >
      ↗
    </a>
  );
}

function eligibleCitations(message: NormalizedHistoryMessage, text: string): ClaimLinkedCitation[] {
  if (message.role !== 'assistant' || !message.turn || !message.citations?.length) return [];
  const digest = sha256(text);
  const eligible = (message.citations ?? []).filter((citation) => (
    citation.turnId === message.turn?.turnId
    && citation.messageId === message.id
    && citation.textHash === digest
    && citation.start >= 0
    && citation.end > citation.start
    && citation.end <= text.length
    && text.slice(citation.start, citation.end).normalize('NFC') === citation.exactClaim
    && text.indexOf(citation.exactClaim) === citation.start
    && text.lastIndexOf(citation.exactClaim) === citation.start
    && hasSafeCitationUrl(citation)
  ));
  return eligible.filter((citation) => !eligible.some((other) => (
    other !== citation
    && citation.start < other.end
    && other.start < citation.end
    && (citation.start !== other.start || citation.end !== other.end)
  )));
}

function citationRemarkPlugin(citations: readonly ClaimLinkedCitation[]) {
  return () => (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode, supportedParent: boolean) => {
      if (!node.children) return;
      const parentSupported = supportedParent && [
        'root', 'paragraph', 'heading', 'strong', 'emphasis', 'list', 'listItem',
      ].includes(node.type);
      const nextChildren: MarkdownNode[] = [];
      for (const child of node.children) {
        const start = child.position?.start.offset;
        const end = child.position?.end.offset;
        const matches = parentSupported && child.type === 'text' && typeof child.value === 'string'
          && typeof start === 'number' && typeof end === 'number'
          ? citations.filter((citation) => (
              citation.start >= start
              && citation.end <= end
              && child.value?.slice(citation.start - start, citation.end - start) === citation.exactClaim
            ))
          : [];
        if (matches.length === 0) {
          visit(child, parentSupported);
          nextChildren.push(child);
          continue;
        }
        const value = child.value ?? '';
        let cursor = 0;
        const groupsByRange = new Map<string, ClaimLinkedCitation[]>();
        for (const citation of matches) {
          const key = `${citation.start}:${citation.end}`;
          const group = groupsByRange.get(key);
          if (group) group.push(citation);
          else groupsByRange.set(key, [citation]);
        }
        const groups = Array.from(groupsByRange.values())
          .sort((left, right) => left[0].start - right[0].start || left[0].end - right[0].end);
        for (const group of groups) {
          const claimStart = group[0].start - start!;
          const claimEnd = group[0].end - start!;
          if (claimStart > cursor) nextChildren.push({ type: 'text', value: value.slice(cursor, claimStart) });
          nextChildren.push({ type: 'text', value: value.slice(claimStart, claimEnd) });
          for (const citation of group) {
            nextChildren.push({
              type: 'link',
              url: `nami-citation:${citation.citationId}`,
              children: [{ type: 'text', value: '↗' }],
              data: { hProperties: { 'data-nami-citation': citation.citationId } },
            });
          }
          cursor = claimEnd;
        }
        if (cursor < value.length) nextChildren.push({ type: 'text', value: value.slice(cursor) });
      }
      node.children = nextChildren;
    };
    visit(tree, true);
  };
}

export const SafeMessage = memo(function SafeMessage({ message }: { message: NormalizedHistoryMessage }) {
  const text = message.parts.map((part) => part.text).join('');
  const citations = eligibleCitations(message, text);
  const citationByUrl = new Map(citations.map((citation) => [`nami-citation:${citation.citationId}`, citation]));
  const articleClass = message.role === 'assistant'
    ? 'max-w-none'
    : 'ml-auto w-fit max-w-[85%] border-2 border-black bg-ikigai-cream px-4 py-3';
  return (
    <div className="mx-auto w-full max-w-[38rem]">
      <article aria-label={message.role === 'assistant' ? 'Nami' : 'You'} className={articleClass}>
        {message.role === 'assistant' ? (
          <div className="safe-message break-words text-[1.0625rem] font-medium leading-7 [unicode-bidi:plaintext]">
            <ReactMarkdown
              allowedElements={['p', 'h2', 'h3', 'h4', 'strong', 'em', 'ol', 'ul', 'li', 'a']}
              unwrapDisallowed
              remarkPlugins={[citationRemarkPlugin(citations)]}
              urlTransform={(url) => url.startsWith('nami-citation:') ? url : ''}
              components={{
                a: ({ href, children, node }) => {
                  const marker = node?.properties?.['data-nami-citation'];
                  const citation = typeof marker === 'string' && href ? citationByUrl.get(href) : undefined;
                  return citation ? citationLink(citation) : <>{children}</>;
                },
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[1.0625rem] font-medium leading-7 [unicode-bidi:plaintext]">{text}</p>
        )}
        {message.deliveryStatus === 'stopped' ? (
          <span className="mt-2 inline-block text-xs font-bold text-stone-600">Stopped</span>
        ) : null}
      </article>
    </div>
  );
});

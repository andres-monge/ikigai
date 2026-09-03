import { Fragment, type ReactNode } from 'react';
import { sanitizeBrowserSourceTitle, type ClaimLinkedCitation } from '@shared/streaming-schemas';
import type { NormalizedHistoryMessage } from './explore-state';

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
      key={citation.citationId}
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

function renderCitedText(text: string, citations: readonly ClaimLinkedCitation[]): ReactNode[] {
  const eligible = [...citations]
    .filter((citation) => (
      citation.start >= 0
      && citation.end > citation.start
      && citation.end <= text.length
      && hasSafeCitationUrl(citation)
      && text.slice(citation.start, citation.end).normalize('NFC') === citation.exactClaim
    ))
    .sort((left, right) => left.end - right.end || left.start - right.start);
  const linksAtEnd = new Map<number, ClaimLinkedCitation[]>();
  for (const citation of eligible) {
    linksAtEnd.set(citation.end, [...(linksAtEnd.get(citation.end) ?? []), citation]);
  }
  const boundaries = [...new Set([0, text.length, ...linksAtEnd.keys()])].sort((a, b) => a - b);
  const output: ReactNode[] = [];
  for (let index = 1; index < boundaries.length; index += 1) {
    const start = boundaries[index - 1];
    const end = boundaries[index];
    output.push(<Fragment key={`text-${start}-${end}`}>{text.slice(start, end)}</Fragment>);
    for (const citation of linksAtEnd.get(end) ?? []) output.push(citationLink(citation));
  }
  return output;
}

export function SafeMessage({ message }: { message: NormalizedHistoryMessage }) {
  const text = message.parts.map((part) => part.text).join('');
  return (
    <article
      aria-label={message.role === 'assistant' ? 'Revelio' : 'You'}
      className={message.role === 'assistant'
        ? 'max-w-[92%] border-2 border-black bg-white p-4 shadow-[4px_4px_0_rgba(0,0,0,0.65)]'
        : 'ml-auto max-w-[88%] border-2 border-black bg-ikigai-cream p-4'}
    >
      <p className="mb-2 font-display text-xs font-extrabold uppercase tracking-[0.09em]">
        {message.role === 'assistant' ? 'Revelio' : 'You'}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 [unicode-bidi:plaintext]">
        {renderCitedText(text, message.citations ?? [])}
      </p>
      {message.deliveryStatus === 'stopped' ? (
        <span className="mt-2 inline-block text-xs font-bold text-slate-600">Stopped</span>
      ) : null}
    </article>
  );
}

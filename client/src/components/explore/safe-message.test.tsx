// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClaimLinkedCitation } from '@shared/streaming-schemas';
import type { NormalizedHistoryMessage } from './explore-state';
import { SafeMessage } from './safe-message';

afterEach(cleanup);

const text = 'First supported claim. Second supported claim.';
const textHash = 'cb408a5462b0da77fff6e77fd9299c223eef9c700645ab7391d14798c48bd929';

function assistant(citations: ClaimLinkedCitation[] = [], value = text): NormalizedHistoryMessage {
  return {
    id: 'display-item-1', role: 'assistant',
    turn: { turnId: 'turn-1', status: 'completed' },
    isFinalAssistantItem: true,
    parts: [{ type: 'text', text: value }], citations,
  };
}

function citation(overrides: Partial<ClaimLinkedCitation> = {}): ClaimLinkedCitation {
  return {
    version: 1, citationId: 'citation-1', turnId: 'turn-1', messageId: 'display-item-1',
    textHash, exactClaim: 'First supported claim.', start: 0, end: 22,
    url: 'https://example.com/report', title: 'Example\n report', support: 'cited-provenance',
    ...overrides,
  };
}

describe('SafeMessage', () => {
  it('right-aligns short user bubbles inside the shared conversation column', () => {
    const { rerender } = render(<SafeMessage message={{
      id: 'user-short', role: 'user', parts: [{ type: 'text', text: 'Short reply' }],
    }} />);
    const userArticle = screen.getByRole('article', { name: 'You' });
    expect(userArticle.className.split(' ')).toEqual(expect.arrayContaining(['ml-auto', 'w-fit']));
    expect(userArticle.className.split(' ')).not.toContain('mx-auto');
    expect(userArticle.parentElement?.className.split(' ')).toEqual(expect.arrayContaining([
      'mx-auto', 'w-full', 'max-w-[38rem]',
    ]));

    rerender(<SafeMessage message={assistant([], 'Assistant reply')} />);
    const assistantArticle = screen.getByRole('article', { name: 'Revelio' });
    expect(assistantArticle.parentElement?.className.split(' ')).toEqual(expect.arrayContaining([
      'mx-auto', 'w-full', 'max-w-[38rem]',
    ]));
  });

  it('renders only the supported assistant Markdown structures and keeps user text literal', () => {
    const markdown = '## Heading\n\nA **strong** idea with *care*.\n\n- One\n- Two';
    const { rerender } = render(<SafeMessage message={assistant([], markdown)} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Heading' })).toBeTruthy();
    expect(document.querySelector('strong')?.textContent).toBe('strong');
    expect(document.querySelector('em')?.textContent).toBe('care');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    rerender(<SafeMessage message={{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: '**literal**' }] }} />);
    expect(screen.getByText('**literal**')).toBeTruthy();
    expect(document.querySelector('strong')).toBeNull();
  });

  it('keeps unsupported and hostile constructs inert with no model-authored network element', () => {
    const hostile = [
      '<img src="https://attacker.test/pixel">',
      '<svg onload="fetch(\'https://attacker.test\')"></svg>',
      '[model link](https://attacker.test)',
      '[forged citation](revelio-citation:citation-1)',
      '![tracking](https://attacker.test/pixel.png)',
      '`code()`',
      '> quoted',
    ].join('\n\n');
    render(<SafeMessage message={assistant([], hostile)} />);
    expect(document.body.textContent).toContain('attacker.test/pixel');
    expect(document.body.textContent).toContain('model link');
    expect(document.body.textContent).toContain('code()');
    expect(document.body.textContent).toContain('quoted');
    expect(document.querySelector('a, img, svg, iframe, code, pre, table, blockquote')).toBeNull();
  });

  it('creates only identity-, hash-, range-, URL-, and literal-node-validated citation anchors', () => {
    render(<SafeMessage message={assistant([citation()])} />);
    const link = screen.getByRole('link', { name: 'Source: Example report' });
    expect(link.getAttribute('href')).toBe('https://example.com/report');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(link.closest('p')?.textContent).toContain('First supported claim.↗');
  });

  it('renders one claim followed by every citation sharing its exact span', () => {
    render(<SafeMessage message={assistant([
      citation(),
      citation({
        citationId: 'citation-2',
        url: 'https://example.org/analysis',
        title: 'Second source',
      }),
    ])} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/report',
      'https://example.org/analysis',
    ]);
    const paragraph = links[0].closest('p');
    expect(paragraph?.textContent).toBe('First supported claim.↗↗ Second supported claim.');
    expect(paragraph?.textContent?.match(/First supported claim\./g)).toHaveLength(1);
  });

  it('keeps prose literal and unlinked when citation spans partially overlap', () => {
    const overlappingText = 'Alpha beta gamma delta.';
    const overlappingHash = 'f7d3eb3f03805c9c81cf00be7c3d116195ce0ab390c1c700ec6df0377a89621c';
    render(<SafeMessage message={assistant([
      citation({
        textHash: overlappingHash,
        exactClaim: 'Alpha beta',
        start: 0,
        end: 10,
      }),
      citation({
        citationId: 'citation-2',
        textHash: overlappingHash,
        exactClaim: 'beta gamma',
        start: 6,
        end: 16,
        url: 'https://example.org/analysis',
      }),
    ], overlappingText)} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('p')?.textContent).toBe(overlappingText);
  });

  it.each([
    ['turn mismatch', { turnId: 'other-turn' }],
    ['item mismatch', { messageId: 'other-item' }],
    ['hash mismatch', { textHash: 'a'.repeat(64) }],
    ['range mismatch', { start: 1 }],
    ['unsafe protocol', { url: 'javascript:alert(1)' }],
    ['credential URL', { url: 'https://user:secret@example.com/' }],
  ] as const)('fails closed for %s', (_name, overrides) => {
    render(<SafeMessage message={assistant([citation(overrides)])} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('rejects duplicate and formatting-split claim mappings', () => {
    const duplicate = 'Claim. Claim.';
    const duplicateCitation = citation({
      textHash: '165b5ba9fd19763653597faa42b942720541ddb072d2ac791f409e8481eef136',
      exactClaim: 'Claim.', start: 0, end: 6,
    });
    const { rerender } = render(<SafeMessage message={assistant([duplicateCitation], duplicate)} />);
    expect(screen.queryByRole('link')).toBeNull();

    const split = 'A **supported** claim.';
    rerender(<SafeMessage message={assistant([citation({
      textHash: '5bdf2afc73f69431a4660a43f164fa4437eab222bb79e4007cf81b9df83be039',
      exactClaim: 'A **supported** claim.', start: 0, end: split.length,
    })], split)} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

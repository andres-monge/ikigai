// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { NormalizedHistoryMessage } from './explore-state';
import { SafeMessage } from './safe-message';

afterEach(cleanup);

describe('SafeMessage', () => {
  it('renders hostile assistant markup as text without automatic outbound elements', () => {
    const hostile = [
      '<img src="https://attacker.test/pixel">',
      '<svg onload="fetch(\'https://attacker.test\')"></svg>',
      '<iframe src="https://attacker.test"></iframe>',
      '[javascript](javascript:alert(1))',
      '[data](data:text/html,bad)',
    ].join('\n');
    render(<SafeMessage message={{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: hostile }] }} />);

    expect(screen.getByText(/attacker\.test\/pixel/)).toBeTruthy();
    expect(document.querySelector('img, svg, iframe')).toBeNull();
    expect(document.querySelector('a')).toBeNull();
  });

  it('keeps citations adjacent to claims with safe repeated-link names', () => {
    const text = 'First supported claim. Second supported claim.';
    const message: NormalizedHistoryMessage = {
      id: 'm2', role: 'assistant', parts: [{ type: 'text', text }],
      citations: [
        {
          version: 1, citationId: 'citation-1', turnId: 'turn-1', messageId: 'turn-1',
          textHash: 'a'.repeat(64), exactClaim: 'First supported claim.', start: 0, end: 22,
          url: 'https://example.com/report', title: 'Example\n report', support: 'cited-provenance',
        },
        {
          version: 1, citationId: 'citation-2', turnId: 'turn-1', messageId: 'turn-1',
          textHash: 'b'.repeat(64), exactClaim: 'Second supported claim.', start: 23, end: 46,
          url: 'https://example.com/report', title: null, support: 'cited-provenance',
        },
      ],
    };

    render(<SafeMessage message={message} />);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Source: Example report',
      'Source: example.com',
    ]);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(link.closest('p')?.textContent).toContain('supported claim');
    }
  });

  it('does not create anchors for non-HTTPS or credential-bearing citation inputs', () => {
    const message = {
      id: 'm3', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'Unsafe claim.' }],
      citations: [
        {
          version: 1 as const, citationId: 'bad-1', turnId: 'turn-1', messageId: 'turn-1',
          textHash: 'a'.repeat(64), exactClaim: 'Unsafe claim.', start: 0, end: 13,
          url: 'javascript:alert(1)', title: 'Bad', support: 'cited-provenance' as const,
        },
        {
          version: 1 as const, citationId: 'bad-2', turnId: 'turn-1', messageId: 'turn-1',
          textHash: 'b'.repeat(64), exactClaim: 'Unsafe claim.', start: 0, end: 13,
          url: 'https://user:secret@example.com/', title: 'Bad', support: 'cited-provenance' as const,
        },
      ],
    };
    render(<SafeMessage message={message} />);
    expect(screen.getByText('Unsafe claim.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

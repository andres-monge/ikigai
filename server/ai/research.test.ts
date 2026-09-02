import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractNativeSearchDisplayCitations,
  resolveNativeSearchCitationClaim,
  type NativeSearchStep,
} from './research.js';

function citedStep(input: {
  text: string;
  start: number;
  end: number;
  url?: string;
  title?: string;
  extras?: Record<string, unknown>;
}): NativeSearchStep {
  return {
    content: [{
      type: 'text',
      text: input.text,
      providerMetadata: {
        openai: {
          annotations: [{
            type: 'url_citation',
            url: input.url ?? 'https://example.com/fact',
            start_index: input.start,
            end_index: input.end,
            ...(input.title ? { title: input.title } : {}),
          }],
        },
      },
      ...input.extras,
    }],
  };
}

describe('ordinary native-search citation projection', () => {
  it('contains no durable evidence ledger, provider identity, handle, or storage API', () => {
    const source = readFileSync(new URL('./research.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/EvidenceLedger|recordResearchAttempt|resolveSources/);
    expect(source).not.toMatch(/providerResultId|sourceHandle|AmendedResearchAttempt/);
    expect(source).not.toMatch(/from '..\/storage|from '..\/..\/shared\/career-map/);
  });

  it('projects a bounded exact displayed claim from a sanitized HTTPS annotation', () => {
    const text = 'The official media type is application/json.';
    const claim = 'application/json';
    const result = extractNativeSearchDisplayCitations(citedStep({
      text,
      start: text.indexOf(claim),
      end: text.indexOf(claim) + claim.length,
      url: 'https://example.com/fact#provider-fragment',
      title: '  Provider\u0000   title  ',
      extras: { rawProviderPayload: 'must-not-appear' },
    }));

    expect(result).toEqual([expect.objectContaining({
      citationId: expect.stringMatching(/^cit_[a-f0-9]{32}$/),
      exactClaim: claim,
      start: text.indexOf(claim),
      end: text.indexOf(claim) + claim.length,
      textHash: createHash('sha256').update(text).digest('hex'),
      url: 'https://example.com/fact',
      title: 'Provider title',
      support: 'cited-provenance',
      authority: 'none',
    })]);
    expect(JSON.stringify(result)).not.toContain('must-not-appear');
  });

  it('binds an adjacent citation marker to the preceding displayed sentence', () => {
    const claim = 'The registered media type for JSON is application/json.';
    const text = `${claim} [1]`;
    const start = text.indexOf('[1]');

    expect(resolveNativeSearchCitationClaim(text, start, text.length)).toEqual({
      exactClaim: claim,
      start: 0,
      end: claim.length,
    });
    expect(extractNativeSearchDisplayCitations(citedStep({ text, start, end: text.length })))
      .toEqual([expect.objectContaining({ exactClaim: claim, start: 0, end: claim.length })]);
  });

  it.each([
    ['non-HTTPS URL', 'http://example.com/fact', 0, 4],
    ['credential-bearing URL', 'https://user:secret@example.com/fact', 0, 4],
    ['empty span', 'https://example.com/fact', 2, 2],
    ['out-of-bounds span', 'https://example.com/fact', 0, 99],
  ])('rejects a %s without exposing a citation', (_label, url, start, end) => {
    expect(extractNativeSearchDisplayCitations(citedStep({
      text: 'Fact', start, end, url,
    }))).toEqual([]);
  });

  it('deduplicates identical annotations and caps a display step', () => {
    const content = Array.from({ length: 24 }, (_, index) => ({
      type: 'text',
      text: `Fact ${index}`,
      providerMetadata: { openai: { annotations: [{
        type: 'url_citation', url: `https://example.com/${index}`,
        start_index: 0, end_index: `Fact ${index}`.length,
      }] } },
    }));
    content.push(content[0]!);
    const result = extractNativeSearchDisplayCitations({ content });

    expect(result).toHaveLength(16);
    expect(new Set(result.map((citation) => citation.citationId)).size).toBe(16);
  });
});

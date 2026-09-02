import { describe, expect, it } from 'vitest';
import {
  amendedCitedResearchSourceSchema,
  amendedResearchAttemptSchema,
  canonicalizeResearchUrl,
  persistedResearchAttemptSchema,
  researchSourceAssociationSchema,
  sourceProvenanceSchema,
} from './common.js';
import { purposePathInputSchema } from './paths.js';

const at = '2030-01-01T00:00:00.000Z';

function citedSource(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'cited-research',
    bindingVersion: 2,
    sourceHandle: 'ev_0123456789abcdef',
    providerCallId: 'provider-call-1',
    providerResultId: 'provider-result-1',
    targetId: 'path-1',
    targetRevision: 7,
    canonicalField: 'purposePath.practicalFit',
    exactClaim: 'The official media type for JSON is application/json.',
    url: 'https://www.iana.org/assignments/media-types/application/json',
    retrievedAt: at,
    title: 'IANA media type registration',
    excerpt: 'The official media type for JSON is application/json.',
    support: 'server-validated',
    citation: {
      start: 0,
      end: 57,
      exactClaimStart: 0,
      exactClaimEnd: 57,
      textHash: 'a'.repeat(64),
    },
    ...overrides,
  };
}

function amendedAttempt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    id: 'attempt-1',
    status: 'succeeded',
    checkpoint: 'create-purpose-paths',
    moduleVersion: 'create-purpose-paths@1',
    targetId: 'path-1',
    targetRevision: 7,
    attemptedAt: at,
    sources: [citedSource()],
    ...overrides,
  };
}

function legacyCitedSource(index: number, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'cited-research',
    sourceHandle: `legacy-source-${index}`,
    providerResultId: `legacy-result-${index}`,
    url: `https://example.com/legacy/${index}`,
    retrievedAt: at,
    title: `Legacy source ${index}`,
    excerpt: `Legacy supporting excerpt ${index}`,
    support: 'server-validated',
    ...overrides,
  };
}

describe('amended contextual-research persistence schemas', () => {
  it('writes the no-category shape while the durable reader accepts predecessor rows', () => {
    expect(amendedResearchAttemptSchema.parse(amendedAttempt())).not.toHaveProperty('queryCategory');
    expect(() => amendedResearchAttemptSchema.parse({
      ...amendedAttempt(),
      queryCategory: 'purpose-path-practical-fit',
    })).toThrow();

    expect(persistedResearchAttemptSchema.parse({
      id: 'legacy-attempt',
      status: 'failed',
      queryCategory: 'purpose-path-practical-fit',
      attemptedAt: at,
      sources: [],
      errorClass: 'ProviderFailure',
    })).toMatchObject({ queryCategory: 'purpose-path-practical-fit' });
    expect(persistedResearchAttemptSchema.parse(amendedAttempt())).toMatchObject({ schemaVersion: 2 });
  });

  it('keeps predecessor source and record limits unchanged during expand-contract rollout', () => {
    const legacySources = Array.from({ length: 16 }, (_, index) => legacyCitedSource(index));
    const longLegacyTitle = 't'.repeat(600);
    expect(sourceProvenanceSchema.parse(legacyCitedSource(20, { title: longLegacyTitle })))
      .toMatchObject({ title: longLegacyTitle });
    expect(persistedResearchAttemptSchema.parse({
      id: 'legacy-attempt-with-many-sources',
      status: 'succeeded',
      queryCategory: 'purpose-path-practical-fit',
      attemptedAt: at,
      sources: legacySources.slice(0, 13),
    })).toMatchObject({ sources: expect.arrayContaining(legacySources.slice(0, 13)) });
    expect(purposePathInputSchema.parse({
      id: 'legacy-path',
      revision: 1,
      name: 'Legacy path',
      servesWhy: 'Serve the confirmed Why',
      possibility: 'A legacy possibility',
      evidence: ['Prior evidence'],
      centralUnknown: 'A useful unknown',
      projectPreview: 'A small project',
      practicalFit: 'Fits current constraints',
      sources: legacySources,
    })).toMatchObject({ sources: expect.arrayContaining(legacySources) });
    expect(() => purposePathInputSchema.parse({
      id: 'amended-path',
      revision: 1,
      name: 'Amended path',
      servesWhy: 'Serve the confirmed Why',
      possibility: 'An amended possibility',
      evidence: ['Current evidence'],
      centralUnknown: 'A bounded unknown',
      projectPreview: 'A bounded project',
      practicalFit: 'Fits current constraints',
      sources: Array.from({ length: 5 }, (_, index) => citedSource({
        sourceHandle: `record-source-${index}`,
        providerResultId: `record-result-${index}`,
      })),
    })).toThrow(/At most 4 v2 research bindings/);
    expect(() => amendedResearchAttemptSchema.parse(amendedAttempt({
      sources: Array.from({ length: 13 }, (_, index) => citedSource({
        sourceHandle: `amended-source-${index}`,
        providerResultId: `amended-result-${index}`,
      })),
    }))).toThrow();
  });

  it('binds a cited source to the exact provider result, target revision, field, claim, and citation span', () => {
    expect(sourceProvenanceSchema.parse(citedSource())).toMatchObject({
      bindingVersion: 2,
      providerCallId: 'provider-call-1',
      providerResultId: 'provider-result-1',
      targetId: 'path-1',
      targetRevision: 7,
      canonicalField: 'purposePath.practicalFit',
      support: 'server-validated',
    });
    expect(() => amendedCitedResearchSourceSchema.parse(citedSource({
      exactClaim: 'The official media type for JSON is application\/json.\u212A',
    }))).toThrow(/normalized/);
    expect(() => sourceProvenanceSchema.parse(citedSource({
      url: `https://example.com/${'x'.repeat(2_100)}`,
    }))).toThrow();
    expect(() => amendedCitedResearchSourceSchema.parse(citedSource({
      citation: { start: 70, end: 71, exactClaimStart: 0, exactClaimEnd: 57, textHash: 'a'.repeat(64) },
    }))).toThrow(/claim/);
  });

  it('stores only canonical credential-free HTTPS URLs for v2 bindings', () => {
    expect(canonicalizeResearchUrl('https://EXAMPLE.com:443/a/../b#frag'))
      .toBe('https://example.com/b');
    expect(canonicalizeResearchUrl('https://example.com/search?q=career%20map&lang=en'))
      .toBe('https://example.com/search?q=career%20map&lang=en');
    expect(() => amendedCitedResearchSourceSchema.parse(citedSource({
      url: 'https://EXAMPLE.com:443/a/../b#frag',
    }))).toThrow(/canonical/);
    expect(amendedCitedResearchSourceSchema.parse(citedSource({
      url: 'https://example.com/b',
    })).url).toBe('https://example.com/b');
    for (const url of [
      'http://example.com/result',
      'https://user:password@example.com/result',
      '//example.com/result',
    ]) {
      expect(() => canonicalizeResearchUrl(url)).toThrow();
      expect(() => amendedCitedResearchSourceSchema.parse(citedSource({ url }))).toThrow();
    }
  });

  it('persists a self-contained atomic association without raw retrieved bodies', () => {
    const association = researchSourceAssociationSchema.parse({
      ...citedSource(),
      attemptId: 'attempt-1',
      operationSourceId: 'operation-1',
      resultRevision: 8,
      checkpoint: 'create-purpose-paths',
      moduleVersion: 'create-purpose-paths@1',
    });
    expect(association).not.toHaveProperty('rawBody');
    expect(association).toMatchObject({
      attemptId: 'attempt-1',
      operationSourceId: 'operation-1',
      resultRevision: 8,
      exactClaim: 'The official media type for JSON is application/json.',
    });
  });
});

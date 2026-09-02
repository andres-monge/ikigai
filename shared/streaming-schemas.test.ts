import { describe, expect, it } from 'vitest';
import {
  browserSourceUrlPartSchema,
  citationToBrowserSourceUrlPart,
  claimLinkedCitationSchema,
  createBrowserSourceUrlPart,
  isOperationStatusTransition,
  operationStatusDataSchema,
  operationStatusStreamPartSchema,
} from './streaming-schemas.js';

const saving = {
  version: 1 as const,
  turnId: 'turn_01HZX',
  messageId: 'msg_01HZX',
  operationId: 'op_01HZX',
  operation: 'propose-why' as const,
  authoritativeRevision: null,
  sequence: 0,
  status: 'Saving' as const,
};

describe('browser-safe Method stream contracts', () => {
  it('accepts one correlated Saving to terminal sequence and rejects regressions or crossed operations', () => {
    const saved = {
      ...saving, sequence: 1 as const, status: 'Saved' as const, authoritativeRevision: 8,
    };
    expect(operationStatusDataSchema.parse(saving)).toEqual(saving);
    expect(operationStatusStreamPartSchema.parse({
      type: 'data-operation-status',
      id: saving.operationId,
      data: saving,
      transient: true,
    })).toEqual({
      type: 'data-operation-status',
      id: saving.operationId,
      data: saving,
      transient: true,
    });
    expect(isOperationStatusTransition(undefined, saving)).toBe(true);
    expect(isOperationStatusTransition(saving, saved)).toBe(true);
    expect(isOperationStatusTransition(saved, saving)).toBe(false);
    expect(isOperationStatusTransition(saved, { ...saved, status: 'Failed' })).toBe(false);
    expect(isOperationStatusTransition(saving, { ...saved, operationId: 'op_other' })).toBe(false);
  });

  it('rejects unstable identifiers, invalid status ordering, and payload-bearing extras', () => {
    expect(operationStatusDataSchema.safeParse({ ...saving, turnId: 'user@example.com' }).success).toBe(false);
    expect(operationStatusDataSchema.safeParse({ ...saving, sequence: 1 }).success).toBe(false);
    expect(operationStatusDataSchema.safeParse({ ...saving, status: 'Saved', sequence: 0 }).success).toBe(false);
    expect(operationStatusDataSchema.safeParse({ ...saving, userId: 'stable-user-id' }).success).toBe(false);
    expect(operationStatusDataSchema.safeParse({ ...saving, providerPayload: { private: true } }).success).toBe(false);
    expect(operationStatusDataSchema.safeParse({ ...saving, operation: 'unknown-operation' }).success).toBe(false);
    expect(operationStatusDataSchema.safeParse({ ...saving, errorClass: 'raw provider body' }).success).toBe(false);
    expect(operationStatusStreamPartSchema.safeParse({
      type: 'data-operation-status', id: 'wrong', data: saving, transient: true,
    }).success).toBe(false);
  });

  it('canonicalizes safe HTTPS source parts and strips unsafe title characters', () => {
    expect(createBrowserSourceUrlPart({
      sourceId: 'source_01HZX',
      url: 'https://example.com/a/../fact#private-fragment',
      title: '  Provider\u0000  title  ',
    })).toEqual({
      type: 'source-url',
      sourceId: 'source_01HZX',
      url: 'https://example.com/fact',
      title: 'Provider title',
    });
    expect(() => createBrowserSourceUrlPart({
      sourceId: 'source_01HZX', url: 'http://example.com/fact', title: 'Unsafe',
    })).toThrow();
    expect(() => createBrowserSourceUrlPart({
      sourceId: 'source_01HZX', url: 'https://user:secret@example.com/fact', title: 'Unsafe',
    })).toThrow();
    expect(browserSourceUrlPartSchema.safeParse({
      type: 'source-url', sourceId: 'source_01HZX', url: 'https://example.com/fact', raw: {},
    }).success).toBe(false);
  });

  it('binds a browser citation to one opaque message and a non-empty claim span only', () => {
    const citation = {
      version: 1 as const,
      citationId: 'citation_01HZX',
      turnId: 'turn_01HZX',
      messageId: 'message_01HZX',
      textHash: 'a'.repeat(64),
      exactClaim: 'official media',
      start: 4,
      end: 18,
      url: 'https://example.com/fact',
      title: 'Provider title',
      support: 'cited-provenance' as const,
    };
    expect(claimLinkedCitationSchema.parse(citation)).toEqual(citation);
    expect(citationToBrowserSourceUrlPart(citation)).toEqual({
      type: 'source-url',
      sourceId: citation.citationId,
      url: citation.url,
      title: citation.title,
    });
    expect(claimLinkedCitationSchema.safeParse({
      ...citation, start: 18, end: 18,
    }).success).toBe(false);
    expect(claimLinkedCitationSchema.safeParse({
      ...citation, providerResult: { raw: true },
    }).success).toBe(false);
  });
});

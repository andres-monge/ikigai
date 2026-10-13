import { describe, expect, it } from 'vitest';
import { createCareerMap } from './career-map/index.js';
import {
  browserSourceUrlPartSchema,
  citationToBrowserSourceUrlPart,
  claimLinkedCitationSchema,
  createBrowserSourceUrlPart,
  conversationHistoryPageSchema,
  NORMALIZED_HISTORY_MAX_CITATIONS,
  NORMALIZED_HISTORY_MAX_PARTS,
  NORMALIZED_HISTORY_MAX_TEXT_LENGTH,
  isOperationStatusTransition,
  methodOperationEnvelopeSchema,
  methodWorkspaceResponseSchema,
  normalizedHistoryMessageSchema,
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

  it('rejects a hydrated citation copied across a turn or final display item', () => {
    const message = {
      id: 'message_01HZX', role: 'assistant' as const,
      turn: { turnId: 'turn_01HZX', status: 'completed' as const },
      isFinalAssistantItem: true as const,
      parts: [{ type: 'text' as const, text: 'official media' }],
      citations: [{
        version: 1 as const, citationId: 'citation_01HZX', turnId: 'turn_01HZX',
        messageId: 'message_01HZX', textHash: 'a'.repeat(64), exactClaim: 'official media',
        start: 0, end: 14, url: 'https://example.com/fact', title: null,
        support: 'cited-provenance' as const,
      }],
    };
    expect(normalizedHistoryMessageSchema.safeParse(message).success).toBe(true);
    expect(normalizedHistoryMessageSchema.safeParse({
      ...message,
      citations: [{ ...message.citations[0], turnId: 'turn_other' }],
    }).success).toBe(false);
    expect(normalizedHistoryMessageSchema.safeParse({
      ...message,
      citations: [{ ...message.citations[0], messageId: 'message_other' }],
    }).success).toBe(false);
    expect(normalizedHistoryMessageSchema.safeParse({
      ...message,
      role: 'user',
    }).success).toBe(false);
    expect(normalizedHistoryMessageSchema.safeParse({
      ...message,
      turn: undefined,
    }).success).toBe(false);
  });

  it('allows only bounded browser-safe committed follow-up recovery on a ready workspace', () => {
    const recovery = { kind: 'committed-follow-up-failed', turnId: 'selection-turn', revision: 1 };
    const ready = { status: 'ready', map: createCareerMap('explorer-1'), recovery };
    expect(methodWorkspaceResponseSchema.safeParse(ready).success).toBe(true);
    expect(methodWorkspaceResponseSchema.safeParse({ ...ready, recovery: { ...recovery, errorClass: 'private provider detail' } }).success).toBe(false);
    expect(methodWorkspaceResponseSchema.safeParse({ ...ready, recovery: { ...recovery, revision: -1 } }).success).toBe(false);
    expect(methodWorkspaceResponseSchema.safeParse({ status: 'empty', map: null, recovery }).success).toBe(false);
  });

  it('fails closed on malformed history and unvalidated workspace state', () => {
    expect(conversationHistoryPageSchema.safeParse({
      status: 'empty', messages: [], olderCursor: 'must-not-exist',
    }).success).toBe(false);
    expect(conversationHistoryPageSchema.safeParse({
      status: 'ready', messages: [{
        id: 'message_1', role: 'assistant', parts: [{ type: 'html', text: '<img>' }],
      }],
    }).success).toBe(false);
    expect(methodWorkspaceResponseSchema.safeParse({
      status: 'ready', map: { schemaVersion: 2, revision: 0 },
    }).success).toBe(false);
  });

  it('keeps browser history bounds explicit in the shared transport contract', () => {
    const base = {
      status: 'ready' as const,
      messages: [{
        id: 'message_1',
        role: 'assistant' as const,
        parts: Array.from({ length: NORMALIZED_HISTORY_MAX_PARTS }, () => ({
          type: 'text' as const,
          text: 'x'.repeat(NORMALIZED_HISTORY_MAX_TEXT_LENGTH),
        })),
      }],
    };
    expect(conversationHistoryPageSchema.safeParse(base).success).toBe(true);
    expect(conversationHistoryPageSchema.safeParse({
      ...base,
      messages: [{
        ...base.messages[0],
        parts: [...base.messages[0].parts, { type: 'text', text: 'overflow' }],
      }],
    }).success).toBe(false);
    expect(conversationHistoryPageSchema.safeParse({
      ...base,
      messages: [{
        ...base.messages[0],
        parts: [{ type: 'text', text: 'x'.repeat(NORMALIZED_HISTORY_MAX_TEXT_LENGTH + 1) }],
      }],
    }).success).toBe(false);
    expect(NORMALIZED_HISTORY_MAX_CITATIONS).toBe(100);
  });

  it('accepts operation envelopes from every canonical Method checkpoint', () => {
    expect(methodOperationEnvelopeSchema.safeParse({
      status: 'rejected',
      operation: 'confirm-why',
      authoritativeRevision: 12,
      derivedModule: 'enter-side-doors',
      pendingDecision: { kind: 'side-door-selection', targetId: 'doors-1', targetRevision: 1 },
      errorClass: 'operation-unavailable',
    }).success).toBe(true);

    const whyRevision = {
      status: 'committed' as const,
      operation: 'revise-why' as const,
      authoritativeRevision: 13,
      derivedModule: 'form-foundation' as const,
      pendingDecision: { kind: 'why-confirmation' as const, targetId: 'why-2', targetRevision: 1 },
      invalidatedArtifactClasses: [
        'path-set', 'project', 'reflection', 'next-move', 'peer-exposure',
        'commitment', 'proof', 'side-door-set', 'route-outcome',
      ] as const,
    };
    expect(methodOperationEnvelopeSchema.safeParse(whyRevision).success).toBe(true);
    expect(methodOperationEnvelopeSchema.safeParse({
      ...whyRevision,
      invalidatedArtifactClasses: ['path-set', 'path-set'],
    }).success).toBe(false);
    expect(methodOperationEnvelopeSchema.safeParse({
      ...whyRevision,
      invalidatedArtifactClasses: ['unknown-artifact'],
    }).success).toBe(false);
  });
});

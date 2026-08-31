import { describe, expect, it } from 'vitest';
import {
  classifyFoundationQuestionTopics,
  isPredominantlySpanish,
  matchesPathOperationExpectation,
  summarizeFirstProjectReplacement,
  summarizeFoundationTrace,
  summarizeR22Presentation,
} from './evaluation';
import { R22_CANONICAL_ENGLISH, R22_CANONICAL_SPANISH } from './base-instructions';

describe('Method evaluation assertions', () => {
  it('requires minimum-sufficient privacy-safe Foundation coverage before propose-why', () => {
    const summary = summarizeFoundationTrace([
      { turnIndex: 0, type: 'append-foundation-evidence', evidenceCategory: 'fascination' },
      { turnIndex: 0, type: 'append-foundation-evidence', evidenceCategory: 'importance' },
      { turnIndex: 0, type: 'append-foundation-evidence', evidenceCategory: 'point-of-view' },
      { turnIndex: 0, type: 'append-foundation-evidence', evidenceCategory: 'starting-asset' },
      { turnIndex: 0, type: 'record-reality-constraint', constraintKind: 'income' },
      { turnIndex: 0, type: 'record-reality-constraint', constraintKind: 'time' },
      { turnIndex: 0, type: 'propose-why' },
    ]);

    expect(summary).toEqual({
      proposeWhyTurn: 0,
      evidenceCategories: ['fascination', 'importance', 'point-of-view', 'starting-asset'],
      constraintKinds: ['income', 'time'],
      missingCoverage: [],
      minimumSufficient: true,
    });

    expect(summarizeFoundationTrace([
      { turnIndex: 0, type: 'append-foundation-evidence', evidenceCategory: 'importance' },
      { turnIndex: 0, type: 'append-foundation-evidence', evidenceCategory: 'point-of-view' },
      { turnIndex: 0, type: 'propose-why' },
    ])).toMatchObject({
      missingCoverage: ['fascination', 'starting-asset', 'reality-boundary'],
      minimumSufficient: false,
    });
  });

  it('distinguishes adaptive follow-up topics from an ordinary Why confirmation question', () => {
    expect(classifyFoundationQuestionTopics('Does this provisional Why feel accurate to you?')).toEqual([]);
    expect(classifyFoundationQuestionTopics(
      'What activities make you lose track of time? In ten years, what meaningful change would make you proud? What do people rely on you for? What must a new direction fit around now?',
    )).toEqual([
      'fascination',
      'ten-year-meaning',
      'starting-assets',
      'reality-boundary',
    ]);
    expect(classifyFoundationQuestionTopics('¿Sobre qué temas puedes leer o pensar durante horas?')).toEqual([
      'consumption-thinking-fallback',
    ]);
    expect(classifyFoundationQuestionTopics('Si avanzaras diez años, ¿qué cambio te enorgullecería haber ayudado a crear?')).toEqual([
      'ten-year-meaning',
    ]);
  });

  it('requires Spanish to predominate instead of accepting three injected marker words', () => {
    expect(isPredominantlySpanish('Claro. A partir de ahora seguimos en español. No recomendaré ningún camino.')).toBe(true);
    expect(isPredominantlySpanish('El objetivo no es tener éxito, sino aprender si quieres seguir explorando este camino.')).toBe(true);
    expect(isPredominantlySpanish('The project is ready and the next step is clear; el la que.')).toBe(false);
    expect(isPredominantlySpanish('Gracias. The rest of this response is in English, with el camino and la pregunta added at the end.')).toBe(false);
    expect(isPredominantlySpanish('')).toBe(false);
  });

  it('rejects right-operation/wrong-turn and right-operation/wrong-path false greens', () => {
    const replacement = {
      turnIndex: 2,
      type: 'replace-purpose-path',
      pathIdsBefore: ['path-1', 'path-2', 'path-3'],
      pathIdsAfter: ['path-1', 'replacement', 'path-3'],
      targetPathId: 'path-2',
    };
    expect(matchesPathOperationExpectation([replacement], {
      kind: 'replacement',
      turnIndex: 2,
      targetIndex: 1,
    })).toBe(true);
    expect(matchesPathOperationExpectation([{ ...replacement, turnIndex: 3 }], {
      kind: 'replacement',
      turnIndex: 2,
      targetIndex: 1,
    })).toBe(false);
    expect(matchesPathOperationExpectation([{ ...replacement, targetPathId: 'path-1' }], {
      kind: 'replacement',
      turnIndex: 2,
      targetIndex: 1,
    })).toBe(false);

    const combination = {
      turnIndex: 3,
      type: 'combine-purpose-paths',
      pathIdsBefore: ['path-1', 'path-2', 'path-3'],
      pathIdsAfter: ['path-3', 'merged', 'new-third'],
      combinedPathIds: ['path-1', 'path-2'],
    };
    expect(matchesPathOperationExpectation([combination], {
      kind: 'combination',
      turnIndex: 3,
      combinedIndexes: [0, 1],
      preservedIndex: 2,
    })).toBe(true);
    expect(matchesPathOperationExpectation([{ ...combination, combinedPathIds: ['path-2', 'path-3'] }], {
      kind: 'combination',
      turnIndex: 3,
      combinedIndexes: [0, 1],
      preservedIndex: 2,
    })).toBe(false);
  });

  it('ties rejection-turn replacement, structured grounding, and acceptance to one opaque project id', () => {
    const valid = [
      {
        turnIndex: 4,
        type: 'replace-project-proposal',
        replacementProjectId: 'replacement-project',
        projectGroundingKind: 'firsthand-beneficiary',
        projectGroundingBasisProvided: true,
      },
      { turnIndex: 6, type: 'accept-first-project', projectId: 'replacement-project' },
    ];
    expect(summarizeFirstProjectReplacement(valid, 4)).toMatchObject({
      replacementOnExpectedTurn: true,
      acceptedReplacement: true,
      groundedReplacement: true,
      valid: true,
    });
    expect(summarizeFirstProjectReplacement([
      { ...valid[0], turnIndex: 5 },
      valid[1],
    ], 4).valid).toBe(false);
    expect(summarizeFirstProjectReplacement([
      valid[0],
      { ...valid[1], projectId: 'original-project' },
    ], 4).valid).toBe(false);
    expect(summarizeFirstProjectReplacement([
      { ...valid[0], projectGroundingBasisProvided: false },
      valid[1],
    ], 4).valid).toBe(false);
  });

  it('requires the locale framing alone, then one short question, with no preface or heading', () => {
    const correctEnglish = `${R22_CANONICAL_ENGLISH}\n\nDo you explicitly accept this Path Project?`;
    const correctSpanish = `${R22_CANONICAL_SPANISH}\n\n¿Aceptas explícitamente este Proyecto de Camino?`;
    expect(summarizeR22Presentation(correctEnglish, R22_CANONICAL_ENGLISH).valid).toBe(true);
    expect(summarizeR22Presentation(correctSpanish, R22_CANONICAL_SPANISH).valid).toBe(true);
    expect(summarizeR22Presentation(
      `One useful framing:\n\n${R22_CANONICAL_ENGLISH}\n\nDo you accept?`,
      R22_CANONICAL_ENGLISH,
    ).valid).toBe(false);
    expect(summarizeR22Presentation(
      `## Before you accept\n${R22_CANONICAL_ENGLISH}\n\nDo you accept?`,
      R22_CANONICAL_ENGLISH,
    ).valid).toBe(false);
    expect(summarizeR22Presentation(
      `${R22_CANONICAL_ENGLISH}\n\nDo you accept? Are you sure?`,
      R22_CANONICAL_ENGLISH,
    ).valid).toBe(false);
    expect(summarizeR22Presentation(
      `${R22_CANONICAL_ENGLISH} ${R22_CANONICAL_ENGLISH}\n\nDo you accept?`,
      R22_CANONICAL_ENGLISH,
    ).valid).toBe(false);
  });
});

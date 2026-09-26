import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyFoundationQuestionTopics,
  matchesPathOperationExpectation,
  summarizeFirstProjectReplacement,
  summarizeFoundationTrace,
  summarizeR22Presentation,
} from './evaluation';
import { R22_CANONICAL_ENGLISH } from './base-instructions';

describe('Method evaluation assertions', () => {
  it('executes every declared U7 semantic-intent fixture before retaining its metadata', () => {
    const source = readFileSync(
      new URL('../../../scripts/eval-revelio-method.mjs', import.meta.url),
      'utf8',
    );
    const fixtureBlock = source.slice(
      source.indexOf('const semanticIntentFixtures ='),
      source.indexOf('const northStarRevisionFixtures ='),
    );
    const revisionRunnerBlock = source.slice(
      source.indexOf('async function runNorthStarRevisionFixtures'),
      source.indexOf('function createSyntheticHarness'),
    );

    expect(fixtureBlock.match(/expectedOperation:/g)).toHaveLength(5);
    expect(fixtureBlock.match(/state: 'pending-(?:why|paths)'/g)).toHaveLength(12);
    expect(source).toMatch(/const result = await createSyntheticHarness\([\s\S]*?\}, loader, model\)\.run\(\)/);
    expect(source).toMatch(/reports\.push\(await runSemanticIntentProbe\(fixture, fixtureIndex, loader, model\)\)/);
    expect(source).toMatch(/const semanticIntentReports = await runSemanticIntentFixtures\(loader, model\)/);
    expect(source).toMatch(/semanticPositive: semanticIntentReports\.filter/);
    expect(source).toMatch(/semanticClarification: semanticIntentReports\.filter/);
    expect(source).not.toMatch(/semanticPositive: semanticIntentFixtures\./);
    expect(source).not.toMatch(/semanticClarification: semanticIntentFixtures\./);
    expect(source).toMatch(/const northStarRevisionReports = await runNorthStarRevisionFixtures\(loader, model\)/);
    expect(source).toMatch(/northStarRevision: northStarRevisionReports/);
    expect(revisionRunnerBlock.match(/await createSyntheticHarness\(/g)).toHaveLength(2);
    expect(revisionRunnerBlock).toMatch(/reports\.push\(\{\s*kind,\s*invalidatedArtifactClasses:/);
    expect(revisionRunnerBlock).toMatch(/kind: 'failed-presentation',[\s\S]*?recoveryOperation:/);
    expect(revisionRunnerBlock).toMatch(/assert\(reports\.length === 3/);
    expect(source.indexOf('proveNorthStarRevisionSeedCoverage();'))
      .toBeLessThan(source.indexOf("assert(apiKey, 'OPENAI_API_KEY"));
    expect(source).not.toMatch(/revisionImpactClassCount: northStarRevisionFixtures\./);
    expect(source).not.toMatch(/failedPresentationRecoveryOperation: northStarRevisionFixtures\./);
    expect(source).toMatch(/revise_why: tool\([\s\S]*?current explorer message asks to change[\s\S]*?never use it for an acknowledgment or confirmation/i);
    expect(source).toMatch(/currentUserText\.includes\(value\)/);
    expect(source).toMatch(/evidenceAuthorityViolations\.length === 0/);
    expect(source).toMatch(/retryCount: result\.evidenceAuthorityViolations\.length/);
    expect(source).toMatch(/activeFoundationNarrations\.every\(\(turn\) => turn\.replyShape\.questions === 1\)/);
    expect(source).toMatch(/pausedFoundationNarrations\.every\([\s\S]*?turn\.replyShape\.questions === 0[\s\S]*?turn\.operations\.length === 0/);
  });

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
      firstSufficientTurn: 0,
      proposedAtFirstSufficientTurn: true,
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
      firstSufficientTurn: null,
      proposedAtFirstSufficientTurn: false,
      missingCoverage: ['fascination', 'starting-asset', 'reality-boundary'],
      minimumSufficient: false,
    });

    expect(summarizeFoundationTrace([
      { turnIndex: 0, type: 'append-foundation-evidence', evidenceCategory: 'fascination' },
      { turnIndex: 0, type: 'append-foundation-evidence', evidenceCategory: 'importance' },
      { turnIndex: 1, type: 'append-foundation-evidence', evidenceCategory: 'point-of-view' },
      { turnIndex: 1, type: 'append-foundation-evidence', evidenceCategory: 'starting-asset' },
      { turnIndex: 1, type: 'record-reality-constraint', constraintKind: 'time' },
      { turnIndex: 2, type: 'propose-why' },
    ])).toMatchObject({
      firstSufficientTurn: 1,
      proposeWhyTurn: 2,
      proposedAtFirstSufficientTurn: false,
      minimumSufficient: true,
    });
  });

  it('distinguishes adaptive follow-up topics from an ordinary Why confirmation question', () => {
    expect(classifyFoundationQuestionTopics('Does this North Star feel accurate to you?')).toEqual([]);
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

  it('rejects right-operation/wrong-turn and right-operation/wrong-path false greens', () => {
    const replacement = {
      turnIndex: 2,
      type: 'replace-purpose-path',
      status: 'committed',
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
    expect(matchesPathOperationExpectation([{ ...replacement, status: 'rejected' }], {
      kind: 'replacement',
      turnIndex: 2,
      targetIndex: 1,
    })).toBe(false);
    expect(matchesPathOperationExpectation([{
      ...replacement,
      pathIdsAfter: replacement.pathIdsBefore,
    }], {
      kind: 'replacement',
      turnIndex: 2,
      targetIndex: 1,
    })).toBe(false);

    const combination = {
      turnIndex: 3,
      type: 'combine-purpose-paths',
      status: 'replayed',
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
    expect(matchesPathOperationExpectation([{
      ...combination,
      pathIdsAfter: combination.pathIdsBefore,
    }], {
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
    const alternateFraming = 'A translated framing supplied by the model.';
    const correctAlternate = `${alternateFraming}\n\nWould you accept?`;
    expect(summarizeR22Presentation(correctEnglish, R22_CANONICAL_ENGLISH).valid).toBe(true);
    expect(summarizeR22Presentation(correctAlternate, alternateFraming).valid).toBe(true);
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

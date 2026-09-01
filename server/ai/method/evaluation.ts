export type FoundationQuestionTopic =
  | 'consumption-thinking-fallback'
  | 'fascination'
  | 'ten-year-meaning'
  | 'starting-assets'
  | 'reality-boundary';

export interface PrivacySafeFoundationOperation {
  readonly turnIndex: number;
  readonly type: string;
  readonly status?: string;
  readonly evidenceCategory?: string | null;
  readonly constraintKind?: string | null;
  readonly pathIdsBefore?: readonly string[];
  readonly pathIdsAfter?: readonly string[];
  readonly targetPathId?: string | null;
  readonly combinedPathIds?: readonly string[];
  readonly projectId?: string | null;
  readonly replacementProjectId?: string | null;
  readonly projectGroundingKind?: string | null;
  readonly projectGroundingBasisProvided?: boolean;
}

export interface FoundationTraceSummary {
  readonly proposeWhyTurn: number | null;
  readonly evidenceCategories: string[];
  readonly constraintKinds: string[];
  readonly missingCoverage: string[];
  readonly minimumSufficient: boolean;
}

export type PathOperationExpectation =
  | {
    readonly kind: 'replacement';
    readonly turnIndex: number;
    readonly targetIndex: number;
  }
  | {
    readonly kind: 'combination';
    readonly turnIndex: number;
    readonly combinedIndexes: readonly [number, number];
    readonly preservedIndex: number;
  };

export interface FirstProjectReplacementSummary {
  readonly replacementCount: number;
  readonly replacementTurn: number | null;
  readonly replacementOnExpectedTurn: boolean;
  readonly acceptedReplacement: boolean;
  readonly groundedReplacement: boolean;
  readonly valid: boolean;
}

export interface R22PresentationSummary {
  readonly framingOccurrences: number;
  readonly paragraphCount: number;
  readonly framingIsFirstParagraph: boolean;
  readonly questionCount: number;
  readonly questionCharacters: number;
  readonly shortQuestion: boolean;
  readonly valid: boolean;
}

const requiredEvidenceCategories = [
  'fascination',
  'importance',
  'point-of-view',
  'starting-asset',
] as const;

const spanishTokens = new Set([
  'ahora', 'al', 'aunque', 'aqui', 'asi', 'cada', 'camino', 'claro', 'como', 'con', 'cual', 'cuales',
  'cuando', 'de', 'del', 'donde', 'el', 'ella', 'ellas', 'ellos', 'en', 'es', 'esa', 'esas', 'ese', 'eso',
  'esos', 'espanol', 'esta', 'estas', 'este', 'esto', 'estos', 'explorar', 'fue', 'gracias', 'hasta', 'hay',
  'la', 'las', 'lo', 'los', 'mas', 'muy', 'ningun', 'ninguna', 'o', 'para', 'pero', 'porque', 'por',
  'pregunta', 'proyecto', 'puede', 'puedes', 'que', 'quien', 'quienes', 'quieres', 'seguimos', 'ser', 'si',
  'sin', 'sobre', 'solo', 'son', 'su', 'sus', 'tambien', 'te', 'tu', 'tus', 'un', 'una', 'unas', 'unos',
  'y', 'ya',
]);

const englishTokens = new Set([
  'already', 'also', 'although', 'an', 'and', 'are', 'be', 'because', 'been', 'but', 'by', 'can', 'could',
  'english', 'explore', 'for', 'from', 'here', 'in', 'is', 'it', 'learn', 'more', 'now', 'of', 'only', 'or',
  'our', 'over', 'path', 'project', 'question', 'should', 'that', 'the', 'their', 'there', 'these', 'they',
  'this', 'those', 'until', 'very', 'want', 'was', 'we', 'when', 'where', 'which', 'who', 'with', 'without',
  'work', 'would', 'yes', 'you', 'your',
]);

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function questionFragments(text: string): string[] {
  return text
    .split('?')
    .slice(0, -1)
    .map((fragment) => fragment.split(/[.!\n]/).at(-1)?.trim() ?? '')
    .filter(Boolean)
    .map(normalize);
}

export function summarizeFoundationTrace(
  operations: readonly PrivacySafeFoundationOperation[],
): FoundationTraceSummary {
  const whyIndex = operations.findIndex((operation) => (
    operation.type === 'propose-why'
    && (operation.status === undefined || operation.status === 'committed' || operation.status === 'replayed')
  ));
  const beforeWhy = whyIndex === -1 ? operations : operations.slice(0, whyIndex);
  const committedBeforeWhy = beforeWhy.filter((operation) => (
    operation.status === undefined || operation.status === 'committed' || operation.status === 'replayed'
  ));
  const evidenceCategories = unique(committedBeforeWhy.map((operation) => operation.evidenceCategory));
  const constraintKinds = unique(committedBeforeWhy.map((operation) => operation.constraintKind));
  const missingCoverage: string[] = requiredEvidenceCategories.filter((category) => !evidenceCategories.includes(category));
  if (constraintKinds.length === 0) missingCoverage.push('reality-boundary');

  return {
    proposeWhyTurn: whyIndex === -1 ? null : operations[whyIndex].turnIndex,
    evidenceCategories,
    constraintKinds,
    missingCoverage,
    minimumSufficient: whyIndex !== -1 && missingCoverage.length === 0,
  };
}

export function classifyFoundationQuestionTopics(text: string): FoundationQuestionTopic[] {
  const topics = new Set<FoundationQuestionTopic>();
  for (const question of questionFragments(text)) {
    if (/\b(?:watch|watching|read|reading|listen|listening|think|thinking|leer|lees|leyendo|ver|viendo|mirar|miras|escuchar|escuchas|pensar|piensas|pensando|temas?|contenido)\b/.test(question)) {
      topics.add('consumption-thinking-fallback');
    }
    if (/\b(?:what activities|activities.*lose track|lose track of time|actividad(?:es)?.*(?:absor|pierdes.*tiempo)|que actividad)\b/.test(question)) {
      topics.add('fascination');
    }
    if (/\b(?:ten years?|10 years?|diez anos?|fast-forward|avanzaras.*anos?|meaningful change|cambio.*(?:orgull|crear))\b/.test(question)) {
      topics.add('ten-year-meaning');
    }
    if (/\b(?:people.*rely on you|what.*rely.*you|concrete example|skills?|abilities|que.*personas.*(?:piden|confian)|en que.*(?:apoyan|confian)|ejemplo concreto)\b/.test(question)) {
      topics.add('starting-assets');
    }
    if (/\b(?:fit around|constraints?|income|time available|location|responsibilit|health|risk|encajar.*ahora|ingresos?|tiempo disponible|ubicacion|responsabilidades?|salud|riesgo)\b/.test(question)) {
      topics.add('reality-boundary');
    }
  }
  return [
    'consumption-thinking-fallback',
    'fascination',
    'ten-year-meaning',
    'starting-assets',
    'reality-boundary',
  ].filter((topic): topic is FoundationQuestionTopic => topics.has(topic as FoundationQuestionTopic));
}

export function isPredominantlySpanish(text: string): boolean {
  const tokens = normalize(text).match(/[a-z]+/g) ?? [];
  if (tokens.length === 0) return false;

  const spanishHits = tokens.filter((token) => spanishTokens.has(token)).length;
  const englishHits = tokens.filter((token) => englishTokens.has(token)).length;
  const classifiedHits = spanishHits + englishHits;
  if (classifiedHits === 0) return false;

  return spanishHits >= 3
    && spanishHits / classifiedHits >= 0.7
    && spanishHits / tokens.length >= 0.18;
}

export function matchesPathOperationExpectation(
  operations: readonly PrivacySafeFoundationOperation[],
  expectation: PathOperationExpectation,
): boolean {
  const expectedType = expectation.kind === 'replacement'
    ? 'replace-purpose-path'
    : 'combine-purpose-paths';
  const matches = operations.filter((operation) => (
    operation.type === expectedType && operation.turnIndex === expectation.turnIndex
  ));
  if (matches.length !== 1) return false;

  const operation = matches[0];
  if (operation.status !== 'committed' && operation.status !== 'replayed') return false;
  const before = operation.pathIdsBefore ?? [];
  const after = operation.pathIdsAfter ?? [];
  if (
    before.length !== 3
    || after.length !== 3
    || new Set(before).size !== 3
    || new Set(after).size !== 3
  ) return false;

  if (expectation.kind === 'replacement') {
    const targetId = before[expectation.targetIndex];
    if (!targetId || operation.targetPathId !== targetId) return false;
    const siblings = before.filter((_, index) => index !== expectation.targetIndex);
    const newIds = after.filter((pathId) => !before.includes(pathId));
    return !after.includes(targetId)
      && siblings.every((pathId) => after.includes(pathId))
      && newIds.length === 1;
  }

  const expectedCombined = expectation.combinedIndexes.map((index) => before[index]);
  const actualCombined = operation.combinedPathIds ?? [];
  const preservedId = before[expectation.preservedIndex];
  if (expectedCombined.some((id) => !id) || !preservedId) return false;
  const newIds = after.filter((pathId) => !before.includes(pathId));
  return actualCombined.length === 2
    && new Set(actualCombined).size === 2
    && expectedCombined.every((id) => actualCombined.includes(id))
    && !actualCombined.includes(preservedId)
    && expectedCombined.every((id) => !after.includes(id!))
    && after.includes(preservedId)
    && newIds.length === 2;
}

export function summarizeFirstProjectReplacement(
  operations: readonly PrivacySafeFoundationOperation[],
  expectedTurn: number,
): FirstProjectReplacementSummary {
  const replacements = operations.filter((operation) => operation.type === 'replace-project-proposal');
  const replacement = replacements[0];
  const acceptance = operations.find((operation) => operation.type === 'accept-first-project');
  const replacementOnExpectedTurn = replacements.length === 1 && replacement?.turnIndex === expectedTurn;
  const acceptedReplacement = Boolean(
    replacement?.replacementProjectId
    && acceptance?.projectId === replacement.replacementProjectId,
  );
  const groundedReplacement = Boolean(
    replacement?.projectGroundingBasisProvided
    && (
      replacement.projectGroundingKind === 'explorer-wanted-outcome'
      || replacement.projectGroundingKind === 'firsthand-beneficiary'
    ),
  );

  return {
    replacementCount: replacements.length,
    replacementTurn: replacement?.turnIndex ?? null,
    replacementOnExpectedTurn,
    acceptedReplacement,
    groundedReplacement,
    valid: replacementOnExpectedTurn && acceptedReplacement && groundedReplacement,
  };
}

export function summarizeR22Presentation(
  text: string,
  expectedFraming: string,
): R22PresentationSummary {
  const trimmed = text.trim();
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/) : [];
  const framingOccurrences = expectedFraming ? text.split(expectedFraming).length - 1 : 0;
  const question = paragraphs[1]?.trim() ?? '';
  const questionCount = (question.match(/\?/g) ?? []).length;
  const framingIsFirstParagraph = paragraphs[0]?.trim() === expectedFraming;
  const shortQuestion = paragraphs.length === 2
    && questionCount === 1
    && question.endsWith('?')
    && question.length <= 160;

  return {
    framingOccurrences,
    paragraphCount: paragraphs.length,
    framingIsFirstParagraph,
    questionCount,
    questionCharacters: question.length,
    shortQuestion,
    valid: framingOccurrences === 1 && framingIsFirstParagraph && shortQuestion,
  };
}

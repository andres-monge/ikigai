/**
 * Live U3 evaluation for the first three Revelio Method modules.
 *
 * The harness uses synthetic explorer conversations, the real G1-selected
 * provider route, and the U2 in-memory reducer. Retained output contains only
 * attribution, operation receipts, state shape, and reply-shape assertions.
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createOpenAI } from '@ai-sdk/openai';
import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import {
  applyCareerMapOperation,
  createCareerMap,
  deriveMethodCheckpoint,
  foundationEvidenceSchema,
  invalidationTargetOrder,
  isExactFirstProjectFramingDelivery,
  pathProjectInputSchema,
  purposePathInputSchema,
  realityConstraintSchema,
  whyInputSchema,
} from '../shared/career-map/index.ts';
import {
  BASE_INSTRUCTIONS_VERSION,
  BASE_METHOD_INSTRUCTIONS,
  FIRST_PROJECT_ACCEPTANCE_PHRASE_ENGLISH,
  FIRST_PROJECT_ACCEPTANCE_PHRASE_SPANISH,
  PURPOSE_PATHS_OFFER_ENGLISH,
  PURPOSE_PATHS_OFFER_SPANISH,
  R22_CANONICAL_ENGLISH,
  R22_CANONICAL_SPANISH,
} from '../server/ai/method/base-instructions.ts';
import {
  classifyFoundationQuestionTopics,
  isPredominantlySpanish,
  matchesPathOperationExpectation,
  summarizeFirstProjectReplacement,
  summarizeFoundationTrace,
  summarizeR22Presentation,
} from '../server/ai/method/evaluation.ts';
import { createMethodModuleLoader } from '../server/ai/method/loader.ts';

const allowedModels = new Set(['gpt-5.6-sol']);
const modelId = process.env.REVELIO_METHOD_MODEL || 'gpt-5.6-sol';
const apiKey = process.env.OPENAI_API_KEY;
const requestTimeoutMs = Number(process.env.REVELIO_METHOD_TIMEOUT_MS || 60_000);
const runStartedAt = new Date().toISOString();

class EvaluationAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EvaluationAssertionError';
  }
}

function assert(condition, message) {
  if (!condition) throw new EvaluationAssertionError(message);
}

function expectedR22Framing(scenario) {
  return scenario.openingLanguage === 'en' && scenario.languageChangeTurn === undefined
    ? R22_CANONICAL_ENGLISH
    : R22_CANONICAL_SPANISH;
}

if (!allowedModels.has(modelId)) {
  throw new EvaluationAssertionError(`REVELIO_METHOD_MODEL must be one of the G1 native passing models; received ${modelId}.`);
}
if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
  throw new EvaluationAssertionError('REVELIO_METHOD_TIMEOUT_MS must be a positive integer.');
}

const pathInputSchema = purposePathInputSchema.omit({ id: true, revision: true, sources: true });
const projectInputSchema = pathProjectInputSchema.omit({ id: true, revision: true, sources: true });
const foundationEvidenceToolInputSchema = foundationEvidenceSchema
  .pick({ category: true, content: true })
  .extend({
    category: foundationEvidenceSchema.shape.category.describe(
      'Use fascination only for a specific activity or topic that actually pulls the explorer in. Never classify a statement that they cannot name one as fascination.',
    ),
    content: foundationEvidenceSchema.shape.content.describe(
      'Copy verbatim as one exact substring from the current explorer message. Never summarize or paraphrase it.',
    ),
  })
  .strict();
const realityConstraintToolInputSchema = realityConstraintSchema
  .pick({ kind: true, description: true })
  .extend({
    description: realityConstraintSchema.shape.description.describe(
      'Copy verbatim as one exact substring from the current explorer message. Never summarize or paraphrase it.',
    ),
  })
  .strict();
const whyToolInputSchema = whyInputSchema.omit({ id: true, revision: true });

const projectGroundingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('explorer-wanted-outcome'),
    userSignal: z.string().min(1).max(1_000).describe('The explorer statement showing they personally want this outcome.'),
  }).strict(),
  z.object({
    kind: z.literal('firsthand-beneficiary'),
    relationship: z.string().min(1).max(500).describe('The real relationship connecting the explorer to this beneficiary firsthand.'),
  }).strict(),
]);

const groundedProjectInputSchema = projectInputSchema.extend({
  grounding: projectGroundingSchema,
}).strict();

const operationToTool = {
  'append-foundation-evidence': 'append_foundation_evidence',
  'record-reality-constraint': 'record_reality_constraint',
  'propose-why': 'propose_why',
  'revise-why': 'revise_why',
  'confirm-why': 'confirm_why',
  'propose-purpose-paths': 'propose_purpose_paths',
  'replace-purpose-path': 'replace_purpose_path',
  'combine-purpose-paths': 'combine_purpose_paths',
  'select-purpose-path': 'select_purpose_path',
  'confirm-purpose-path-revision': 'confirm_purpose_path_revision',
  'propose-first-project': 'propose_first_project',
  'replace-project-proposal': 'replace_project_proposal',
  'present-first-project-framing': 'present_first_project_framing',
  'accept-first-project': 'accept_first_project',
};

const semanticIntentFixtures = {
  positive: [
    { label: 'English', userText: "Yes, that's it exactly.", state: 'pending-why', expectedOperation: 'confirm-why' },
    { label: 'German', userText: 'Ja, genau so.', state: 'pending-why', expectedOperation: 'confirm-why' },
    { label: 'Portuguese', userText: 'Sim, é isso mesmo.', state: 'pending-why', expectedOperation: 'confirm-why' },
    { label: 'Russian', userText: 'Да, именно это.', state: 'pending-why', expectedOperation: 'confirm-why' },
    { label: 'bare ordinal', userText: '1', state: 'pending-paths', expectedOperation: 'select-purpose-path' },
  ],
  clarification: [
    { label: 'hedge', userText: 'That may be right, but I am not ready to confirm it.', state: 'pending-why' },
    { label: 'quote', userText: 'You said “Yes, that is it exactly.”', state: 'pending-why' },
    { label: 'question', userText: 'Should I confirm this now?', state: 'pending-why' },
    { label: 'conditional', userText: 'Choose the first path if it can be entirely remote.', state: 'pending-paths' },
    { label: 'generic assent among three', userText: 'Yes.', state: 'pending-paths' },
    { label: 'ambiguous', userText: 'The first or second could work.', state: 'pending-paths' },
    { label: 'multi-target', userText: 'Start the first and second paths.', state: 'pending-paths' },
  ],
};

const northStarRevisionFixtures = {
  zeroImpactClasses: [],
  deepImpactClasses: [
    'path-set', 'project', 'reflection', 'next-move', 'peer-exposure',
    'commitment', 'proof', 'side-door-set', 'route-outcome',
  ],
  acknowledgmentTiming: 'later-user-turn',
  failedPresentationRecoveryOperation: 'revise-why',
};

function proveU7FixtureCoverage() {
  assert(semanticIntentFixtures.positive.map(({ label }) => label).join('|') === 'English|German|Portuguese|Russian|bare ordinal', 'U7 semantic-positive fixture coverage drifted.');
  assert(semanticIntentFixtures.clarification.map(({ label }) => label).join('|') === 'hedge|quote|question|conditional|generic assent among three|ambiguous|multi-target', 'U7 clarification fixture coverage drifted.');
  assert(JSON.stringify(northStarRevisionFixtures.zeroImpactClasses) === '[]', 'U7 zero-impact revision fixture drifted.');
  assert(JSON.stringify(northStarRevisionFixtures.deepImpactClasses) === JSON.stringify(invalidationTargetOrder), 'U7 deep-revision fixture must name the reducer-owned exact artifact classes in order.');
  assert(northStarRevisionFixtures.acknowledgmentTiming === 'later-user-turn', 'U7 revision acknowledgment must be later-turn.');
  assert(northStarRevisionFixtures.failedPresentationRecoveryOperation === 'revise-why', 'U7 failed revision presentation must reuse revise-why.');
  assert(scenarios.some((scenario) => (scenario.foundationExpectations.pauseTurns ?? []).length > 0), 'U7 Foundation fixtures must exercise an explicit pause.');
}

const scenarios = [
  {
    id: 'english-rich',
    openingLanguage: 'en',
    foundationExpectations: {
      requiredFirstTurnQuestionTopics: [],
      forbiddenFirstTurnQuestionTopics: [
        'consumption-thinking-fallback',
        'fascination',
        'ten-year-meaning',
        'starting-assets',
        'reality-boundary',
      ],
    },
    pathOperationExpectation: { kind: 'replacement', turnIndex: 2, targetIndex: 1 },
    projectReplacementTurn: 4,
    requiredOperations: ['replace-purpose-path', 'replace-project-proposal'],
    turns: [
      'I lose track of time when I turn a messy process into a tool someone can actually use. I want small teams to make difficult choices with less waste, and I believe clarity matters only when it changes action. Colleagues already rely on me to explain complex systems and I have built several internal tools they adopted. I can spend five hours a week, need to keep my current income, and must work from Madrid.',
      "Yes, that's it exactly.",
      'I do not like the second path. Replace only that path, keep the other two unchanged, and do not rank the set.',
      '1',
      'I do not want this first project. Replace it with one new project for a real outcome I want or a beneficiary I know firsthand.',
      'The replacement project feels ready. Give me the required project framing now and ask me to accept it, but do not accept it yet.',
      'I accept this Path Project and want to start.',
    ],
  },
  {
    id: 'spanish-opening',
    openingLanguage: 'es',
    foundationExpectations: {
      requiredFirstTurnQuestionTopics: ['consumption-thinking-fallback'],
      forbiddenFirstTurnQuestionTopics: ['ten-year-meaning'],
    },
    pathOperationExpectation: {
      kind: 'combination',
      turnIndex: 3,
      combinedIndexes: [0, 1],
      preservedIndex: 2,
    },
    projectReplacementTurn: 5,
    requiredOperations: ['combine-purpose-paths', 'replace-project-proposal'],
    turns: [
      'No se me ocurre ninguna actividad que me absorba de verdad. En diez años me gustaría haber ayudado a que equipos pequeños tomen decisiones más humanas, porque creo que la claridad debe llevar a una acción propia. La gente me pide que explique sistemas complejos. Tengo cinco horas semanales y necesito mantener mis ingresos.',
      'Suelo leer y pensar durante horas sobre cómo diseñar mejores decisiones, y una vez convertí esas ideas en una guía que mi equipo usó voluntariamente.',
      'Sí, esa Estrella Polar me representa y quiero confirmarla.',
      'Combina el primer y el segundo camino en uno, conserva el tercero y crea un nuevo tercer camino para que el conjunto siga teniendo exactamente tres opciones sin ranking.',
      'Elijo explícitamente el primer camino del conjunto actual.',
      'No quiero un ejercicio de portfolio para un cliente imaginario. Sustituye ese proyecto por uno nuevo con un resultado que yo quiera o para alguien que conozca de primera mano.',
      'El proyecto sustituto está listo. Dame ahora el encuadre obligatorio y pídeme que lo acepte, pero todavía no lo aceptes.',
      'Acepto este Proyecto de Camino y quiero empezar.',
    ],
  },
  {
    id: 'explicit-language-change',
    openingLanguage: 'en',
    languageChangeTurn: 5,
    foundationExpectations: {
      requiredFirstTurnQuestionTopics: ['ten-year-meaning'],
      forbiddenFirstTurnQuestionTopics: [],
      pauseTurns: [1],
    },
    pathOperationExpectation: { kind: 'replacement', turnIndex: 4, targetIndex: 1 },
    requiredOperations: ['replace-purpose-path'],
    turns: [
      'I get absorbed building small tools that turn confusing information into a useful choice. People rely on me for synthesis and I have shipped internal prototypes. I can make five hours a week and must keep my current job, but I am not yet sure what meaningful ten-year change this should serve.',
      'I want to pause here and come back to this tomorrow.',
      'In ten years I would be proud to have helped ordinary teams make consequential choices without depending on experts. I think good systems should transfer agency rather than create dependence.',
      'That North Star is accurate. I want to confirm it.',
      'The second path appeals mainly because its title sounds prestigious. Investigate that distortion and replace or revise it without ranking the alternatives.',
      'A partir de ahora, hablemos en español. Confirma brevemente que has cambiado de idioma sin recomendarme ningún camino.',
      'Elijo explícitamente el primer camino del conjunto actual.',
      'Este proyecto está listo. Dame ahora el encuadre obligatorio en español y pídeme que lo acepte en el siguiente turno.',
      'Acepto este Proyecto de Camino y quiero empezar.',
    ],
  },
];

function timestamp(sequence) {
  return new Date(Date.UTC(2026, 7, 31, 10, 0, sequence)).toISOString();
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

function hasFaithfulSpanishR22(text) {
  const lower = text.toLowerCase();
  return /no es (tener )?(éxito|triunfar)/i.test(lower)
    && /aprend/i.test(lower)
    && /(seguir|continuar|perseguir)/i.test(lower)
    && /citas/i.test(lower)
    && /(poco|bajo|sin mucho) compromiso|relajad|tranquil/i.test(lower)
    && /invi[ea]rt|invert/i.test(lower)
    && /(otra|siguiente)/i.test(lower);
}

function normalizeWords(value) {
  return new Set(value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').match(/[a-z0-9]+/g) || []);
}

function jaccard(left, right) {
  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 1 : intersection / union;
}

function replyShape(text) {
  return {
    characters: text.length,
    paragraphs: text.trim() ? text.trim().split(/\n\s*\n/).length : 0,
    questions: (text.match(/\?/g) || []).length,
  };
}

function visibleAssistantText(result) {
  return result.steps
    .filter((step) => !(step.toolCalls ?? []).some((call) => call.providerExecuted !== true))
    .map((step) => step.text ?? '')
    .join('');
}

function proveU2FirstProjectReplacementBoundary() {
  let map = createCareerMap('synthetic-u3-preflight');
  const at = (sequence) => timestamp(sequence);
  const presentation = (sequence) => ({
    kind: 'model-presentation',
    assistantTurnId: `preflight-assistant-${sequence}`,
    turnSequence: sequence,
    completed: true,
    presentedAt: at(sequence),
  });
  const action = (sequence) => ({
    kind: 'user-message',
    actionId: `preflight-action-${sequence}`,
    turnId: `preflight-user-${sequence}`,
    turnSequence: sequence,
    occurredAt: at(sequence),
  });
  const apply = (type, payload, sequence) => {
    const result = applyCareerMapOperation(map, {
      type,
      sourceId: `preflight-${type}-${sequence}`,
      expectedRevision: map.revision,
      occurredAt: at(sequence),
      payload,
    });
    assert(result.status === 'committed', `U2 preflight could not commit ${type}.`);
    map = result.map;
  };
  const paths = [1, 2, 3].map((number) => ({
    id: `preflight-path-${number}`,
    revision: 1,
    name: `Path ${number}`,
    servesWhy: `Serve the confirmed North Star through mechanism ${number}`,
    possibility: `Possibility ${number}`,
    evidence: [`Evidence ${number}`],
    centralUnknown: `Unknown ${number}`,
    projectPreview: `Project ${number}`,
    practicalFit: `Practical fit ${number}`,
  }));
  const project = (id, title) => ({
    id,
    revision: 1,
    title,
    outcome: 'A real colleague uses a decision aid',
    audience: 'A colleague known firsthand',
    whyWanted: 'Make one current decision easier',
    learningGoal: 'Learn whether iteration creates voluntary pull',
    firstVersion: 'One-page decision aid',
    firstStep: 'Ask the colleague about the live decision',
    decisionQuestion: 'Do I want another iteration?',
    evidenceCue: 'Notice voluntary pull while revising',
  });

  apply('propose-why', {
    why: { id: 'preflight-why', revision: 1, statement: 'Make difficult choices actionable.', serves: 'Small teams', pointOfView: 'Clarity should transfer agency.' },
    presentation: presentation(1),
  }, 1);
  apply('confirm-why', { whyId: 'preflight-why', whyRevision: 1, action: action(2) }, 2);
  apply('propose-purpose-paths', { setId: 'preflight-set', setRevision: 1, paths, presentation: presentation(3) }, 3);
  apply('select-purpose-path', { setId: 'preflight-set', setRevision: 1, pathId: 'preflight-path-1', pathRevision: 1, action: action(4) }, 4);
  apply('propose-first-project', { project: project('preflight-project-1', 'First proposal'), presentation: presentation(5) }, 5);
  apply('replace-project-proposal', {
    projectId: 'preflight-project-1',
    projectRevision: 1,
    replacement: project('preflight-project-2', 'Replacement proposal'),
    presentation: presentation(6),
  }, 6);
  apply('present-first-project-framing', {
    projectId: 'preflight-project-2', projectRevision: 1, locale: 'en',
    framingText: R22_CANONICAL_ENGLISH,
    acceptancePhrase: 'I explicitly accept this Path Project.',
    acceptanceQuestion: 'Will you explicitly accept this Path Project by replying “I explicitly accept this Path Project.”?',
    moduleVersion: 'preflight@1', presentation: presentation(7),
  }, 7);
  apply('deliver-first-project-framing', {
    projectId: 'preflight-project-2', projectRevision: 1,
    assistantText: `${R22_CANONICAL_ENGLISH}\n\nWill you explicitly accept this Path Project by replying “I explicitly accept this Path Project.”?`,
    presentation: presentation(7),
  }, 7);

  const checkpoint = deriveMethodCheckpoint(map);
  assert(
    checkpoint.availableOperations.includes('accept-first-project'),
    'U2 boundary blocks U3: replacing an unaccepted first project must preserve accept-first-project for the replacement.',
  );
}

function stateBriefing(map, checkpoint) {
  const why = map.foundation.whyRevisions.at(-1);
  const pathSet = map.pathSets.at(-1);
  const project = map.projects.at(-1);
  return JSON.stringify({
    revision: map.revision,
    module: checkpoint.module,
    pendingDecision: checkpoint.pendingDecision,
    evidenceCategories: map.foundation.evidence.map((item) => item.category),
    constraintKinds: map.foundation.constraints.map((item) => item.kind),
    why: why ? { id: why.id, revision: why.revision, status: why.status, statement: why.statement, serves: why.serves, pointOfView: why.pointOfView } : null,
    pathSet: pathSet ? {
      id: pathSet.id,
      revision: pathSet.revision,
      status: pathSet.status,
      paths: pathSet.paths.map((item) => ({
        id: item.id,
        revision: item.revision,
        name: item.name,
        servesWhy: item.servesWhy,
        selection: item.selection,
      })),
    } : null,
    project: project ? {
      id: project.id,
      revision: project.revision,
      title: project.title,
      agreementStatus: project.agreementStatus,
      audience: project.audience,
      outcome: project.outcome,
      acceptanceFraming: project.acceptanceFraming ?? null,
    } : null,
  });
}

function createSemanticIntentSeed(fixture, fixtureIndex) {
  const probeId = `semantic-intent-${fixtureIndex + 1}`;
  let map = createCareerMap(probeId);
  const applySeed = (type, payload, sequence) => {
    const result = applyCareerMapOperation(map, {
      type,
      sourceId: `${probeId}-seed-${type}-${sequence}`,
      expectedRevision: map.revision,
      occurredAt: timestamp(sequence),
      payload,
    });
    assert(result.status === 'committed', `${fixture.label}: could not seed ${type}.`);
    map = result.map;
  };
  const seedPresentation = (sequence) => ({
    kind: 'model-presentation',
    assistantTurnId: `${probeId}-assistant-${sequence}`,
    turnSequence: sequence,
    completed: true,
    presentedAt: timestamp(sequence),
  });
  const seedAction = (sequence) => ({
    kind: 'user-message',
    actionId: `${probeId}-action-${sequence}`,
    turnId: `${probeId}-user-${sequence}`,
    turnSequence: sequence,
    occurredAt: timestamp(sequence),
  });

  applySeed('propose-why', {
    why: {
      id: `${probeId}-why`,
      revision: 1,
      statement: 'Help small teams turn difficult choices into clear action.',
      serves: 'Small teams making consequential choices',
      pointOfView: 'Clarity should transfer agency.',
    },
    presentation: seedPresentation(1),
  }, 1);

  if (fixture.state === 'pending-why') {
    return {
      map,
      probeId,
      currentTurnSequence: 3,
      expectedTargetId: `${probeId}-why`,
      priorMessages: [
        { role: 'user', content: 'Help me articulate the direction my work should serve.' },
        {
          role: 'assistant',
          content: 'Your provisional North Star is: Help small teams turn difficult choices into clear action, because clarity should transfer agency. Does that feel accurate?',
        },
      ],
    };
  }

  applySeed('confirm-why', {
    whyId: `${probeId}-why`,
    whyRevision: 1,
    action: seedAction(3),
  }, 3);
  const paths = [1, 2, 3].map((number) => ({
    id: `${probeId}-path-${number}`,
    revision: 1,
    name: ['Decision Tools', 'Team Facilitation', 'Practical Research'][number - 1],
    servesWhy: `Serve the confirmed North Star through mechanism ${number}.`,
    possibility: `Possibility ${number}`,
    evidence: [`Evidence ${number}`],
    centralUnknown: `Unknown ${number}`,
    projectPreview: `Project ${number}`,
    practicalFit: `Practical fit ${number}`,
  }));
  applySeed('propose-purpose-paths', {
    setId: `${probeId}-path-set`,
    setRevision: 1,
    paths,
    presentation: seedPresentation(5),
  }, 5);
  return {
    map,
    probeId,
    currentTurnSequence: 7,
    expectedTargetId: paths[0].id,
    priorMessages: [
      { role: 'user', content: 'Show me three distinct ways to serve my confirmed North Star.' },
      {
        role: 'assistant',
        content: 'Here are the current equal choices: 1. Decision Tools; 2. Team Facilitation; 3. Practical Research.',
      },
    ],
  };
}

function createNorthStarRevisionSeed(kind, fixtureIndex) {
  const probeId = `north-star-revision-${fixtureIndex + 1}`;
  let map = createCareerMap(probeId);
  const presentation = (sequence) => ({
    kind: 'model-presentation',
    assistantTurnId: `${probeId}-assistant-${sequence}`,
    turnSequence: sequence,
    completed: true,
    presentedAt: timestamp(sequence),
  });
  const action = (sequence) => ({
    kind: 'user-message',
    actionId: `${probeId}-action-${sequence}`,
    turnId: `${probeId}-user-${sequence}`,
    turnSequence: sequence,
    occurredAt: timestamp(sequence),
  });
  const commit = (type, payload, sequence) => {
    const result = applyCareerMapOperation(map, {
      type,
      sourceId: `${probeId}-seed-${type}-${sequence}`,
      expectedRevision: map.revision,
      occurredAt: timestamp(sequence),
      payload,
    });
    assert(result.status === 'committed', `${probeId}: could not seed ${type}.`);
    map = result.map;
    return result;
  };
  const paths = [1, 2, 3].map((number) => ({
    id: `${probeId}-path-${number}`,
    revision: 1,
    name: `Path ${number}`,
    servesWhy: `Serve the confirmed North Star through mechanism ${number}.`,
    possibility: `Possibility ${number}`,
    evidence: [`Evidence ${number}`],
    centralUnknown: `Unknown ${number}`,
    projectPreview: `Project preview ${number}`,
    practicalFit: `Practical fit ${number}`,
  }));
  const project = {
    id: `${probeId}-project`,
    revision: 1,
    title: 'Build a real decision aid',
    outcome: 'A colleague uses it for a current decision',
    audience: 'A colleague with a live decision',
    whyWanted: 'Make one current decision easier',
    learningGoal: 'Learn whether iteration creates voluntary pull',
    firstVersion: 'A one-page decision aid',
    firstStep: 'Ask the colleague about the live decision',
    decisionQuestion: 'Do I want another iteration?',
    evidenceCue: 'Notice voluntary pull while revising',
  };

  commit('propose-why', {
    why: {
      id: `${probeId}-why`, revision: 1,
      statement: 'Help small teams turn difficult choices into clear action.',
      serves: 'Small teams making consequential choices',
      pointOfView: 'Clarity should transfer agency.',
    },
    presentation: presentation(1),
  }, 1);
  commit('confirm-why', {
    whyId: `${probeId}-why`, whyRevision: 1, action: action(2),
  }, 2);

  let nextSequence = 3;
  if (kind === 'deep') {
    commit('propose-purpose-paths', {
      setId: `${probeId}-path-set`, setRevision: 1, paths, presentation: presentation(3),
    }, 3);
    commit('select-purpose-path', {
      setId: `${probeId}-path-set`, setRevision: 1,
      pathId: paths[0].id, pathRevision: 1, action: action(4),
    }, 4);
    commit('propose-first-project', { project, presentation: presentation(5) }, 5);
    const acceptanceQuestion = `Will you accept by replying “${FIRST_PROJECT_ACCEPTANCE_PHRASE_ENGLISH}”?`;
    commit('present-first-project-framing', {
      projectId: project.id, projectRevision: 1, locale: 'en',
      framingText: R22_CANONICAL_ENGLISH,
      acceptancePhrase: FIRST_PROJECT_ACCEPTANCE_PHRASE_ENGLISH,
      acceptanceQuestion,
      moduleVersion: 'revision-probe@1',
      presentation: presentation(6),
    }, 6);
    commit('deliver-first-project-framing', {
      projectId: project.id, projectRevision: 1,
      assistantText: `${R22_CANONICAL_ENGLISH}\n\n${acceptanceQuestion}`,
      presentation: presentation(6),
    }, 6);
    commit('accept-first-project', {
      projectId: project.id, projectRevision: 1, action: action(7),
    }, 7);
    commit('open-reflection', {
      reflectionId: `${probeId}-reflection`, revision: 1,
      projectId: project.id, projectRevision: 1, action: action(8),
    }, 8);
    commit('append-reflection-evidence', {
      reflectionId: `${probeId}-reflection`, reflectionRevision: 1,
      evidence: {
        id: `${probeId}-learning`, revision: 1,
        observation: 'I kept improving the useful version.',
        signal: 'voluntary-pull',
        interpretation: 'Iteration may be energizing.',
        provenance: action(9),
      },
    }, 9);
    commit('close-reflection', {
      reflectionId: `${probeId}-reflection`, reflectionRevision: 1, action: action(10),
    }, 10);
    commit('record-continue-choice', {
      id: `${probeId}-continue`, revision: 1,
      reflectionId: `${probeId}-reflection`, reflectionRevision: 1,
      wantsToContinue: true, action: action(11),
    }, 11);
    commit('record-next-move', {
      id: `${probeId}-move`, revision: 1,
      continueChoiceId: `${probeId}-continue`, continueChoiceRevision: 1,
      kind: 'commit-provisionally', action: action(12),
    }, 12);
    commit('record-peer-exposure', {
      exposure: {
        id: `${probeId}-peer`, revision: 1, subjectKind: 'real-person',
        subject: 'A working practitioner', insight: 'Useful work requires repeated facilitation.',
      },
      presentation: presentation(13),
    }, 13);
    commit('confirm-peer-exposure', {
      exposureId: `${probeId}-peer`, exposureRevision: 1, action: action(14),
    }, 14);
    commit('complete-provisional-commitment', {
      id: `${probeId}-commitment`, revision: 1,
      intentId: `intent-${probeId}-move`, action: action(15),
    }, 15);
    commit('propose-proof-inventory', {
      proof: {
        id: `${probeId}-proof`, revision: 1,
        artifacts: ['Decision aid'], problemsSolved: ['Decision friction'], peopleHelped: ['A colleague'],
        usefulQualities: ['Synthesis'], knowledge: ['Decision design'], relationships: ['A practitioner'],
        pointsOfView: ['Evidence should change action'], shareableMaterial: ['A case note'],
      },
      presentation: presentation(16),
    }, 16);
    commit('confirm-proof-inventory', {
      proofId: `${probeId}-proof`, proofRevision: 1, action: action(17),
    }, 17);
    const doors = [1, 2, 3].map((number) => ({
      id: `${probeId}-door-${number}`, revision: 1,
      name: `Side Door ${number}`, target: `Community ${number}`,
      proofValue: `Proof value ${number}`, contribution: `Contribution ${number}`,
      firstMove: `First move ${number}`, accessConstraints: [`Constraint ${number}`],
    }));
    commit('propose-side-doors', {
      setId: `${probeId}-door-set`, setRevision: 1, doors, presentation: presentation(18),
    }, 18);
    commit('select-side-door', {
      setId: `${probeId}-door-set`, setRevision: 1,
      doorId: doors[0].id, doorRevision: 1, action: action(19),
    }, 19);
    commit('record-route-outcome', {
      id: `${probeId}-outcome`, revision: 1,
      doorId: doors[0].id, doorRevision: 1,
      result: 'positive-response', learning: 'The contribution opened a useful conversation.',
      action: action(20),
    }, 20);
    nextSequence = 21;
  }

  commit('open-foundation-revision-focus', {
    reason: 'The explorer wants to refine whom the North Star serves.',
    action: action(nextSequence),
  }, nextSequence);
  nextSequence += 2;
  let failedSuggestedWhyId = null;
  if (kind === 'failed-presentation') {
    failedSuggestedWhyId = `${probeId}-unseen-why`;
    commit('revise-why', {
      why: {
        id: failedSuggestedWhyId, revision: 1,
        statement: 'Help community teams make difficult choices actionable.',
        serves: 'Community teams', pointOfView: 'Clarity should transfer agency.',
      },
      supersedesWhyId: `${probeId}-why`, presentation: presentation(nextSequence),
    }, nextSequence);
    nextSequence += 2;
  }

  return {
    map,
    probeId,
    currentTurnSequence: nextSequence,
    failedSuggestedWhyId,
    priorMessages: [
      { role: 'user', content: 'Help me establish the direction my work should serve.' },
      { role: 'assistant', content: 'Your North Star is confirmed.' },
    ],
  };
}

function proveNorthStarRevisionSeedCoverage() {
  for (const [fixtureIndex, kind] of ['zero', 'deep'].entries()) {
    const seed = createNorthStarRevisionSeed(kind, fixtureIndex);
    const result = applyCareerMapOperation(seed.map, {
      type: 'revise-why',
      sourceId: `${seed.probeId}-preflight-revise`,
      expectedRevision: seed.map.revision,
      occurredAt: timestamp(seed.currentTurnSequence),
      payload: {
        why: {
          id: `${seed.probeId}-preflight-why`, revision: 1,
          statement: 'Help community teams make difficult choices actionable.',
          serves: 'Community teams', pointOfView: 'Clarity should transfer agency.',
        },
        supersedesWhyId: `${seed.probeId}-why`,
        presentation: {
          kind: 'model-presentation',
          assistantTurnId: `${seed.probeId}-assistant-${seed.currentTurnSequence}`,
          turnSequence: seed.currentTurnSequence,
          completed: true,
          presentedAt: timestamp(seed.currentTurnSequence),
        },
      },
    });
    const expectedClasses = kind === 'deep'
      ? northStarRevisionFixtures.deepImpactClasses
      : northStarRevisionFixtures.zeroImpactClasses;
    assert(result.status === 'committed', `${kind}: deterministic revision seed did not accept revise-why.`);
    assert(
      result.status === 'committed'
      && JSON.stringify(result.effects?.invalidatedArtifactClasses) === JSON.stringify(expectedClasses),
      `${kind}: deterministic revision seed produced the wrong impact classes.`,
    );
  }
  const failedSeed = createNorthStarRevisionSeed('failed-presentation', 2);
  assert(
    failedSeed.map.foundation.whyRevisions.find((why) => why.id === failedSeed.failedSuggestedWhyId)?.status === 'suggested',
    'failed-presentation: deterministic seed did not retain the unseen Suggested revision.',
  );
}

async function runSemanticIntentProbe(fixture, fixtureIndex, loader, model) {
  const seed = createSemanticIntentSeed(fixture, fixtureIndex);
  const initialRevision = seed.map.revision;
  const result = await createSyntheticHarness({
    id: seed.probeId,
    initialMap: seed.map,
    initialMessages: seed.priorMessages,
    turnSequenceStart: seed.currentTurnSequence,
    maxSteps: 4,
    maxOutputTokens: 400,
    stopAfterOperations: fixture.expectedOperation ? [fixture.expectedOperation] : [],
    turns: [fixture.userText],
  }, loader, model).run();
  const operations = result.operations;
  const text = result.turns[0]?.replyText.trim() ?? '';

  if (fixture.expectedOperation) {
    assert(operations.length === 1, `${fixture.label}: expected exactly one consequential operation.`);
    assert(operations[0].type === fixture.expectedOperation, `${fixture.label}: expected ${fixture.expectedOperation}, received ${operations[0].type}.`);
    const targetId = fixture.expectedOperation === 'confirm-why'
      ? result.map.foundation.whyRevisions.findLast((item) => item.status === 'confirmed')?.id
      : result.map.pathSets.findLast((item) => item.status === 'active')?.paths.find((item) => item.selection === 'active')?.id;
    assert(targetId === seed.expectedTargetId, `${fixture.label}: operation targeted the wrong canonical record.`);
    assert(operations[0].status === 'committed' || operations[0].status === 'replayed', `${fixture.label}: operation did not commit.`);
    assert(result.map.revision === initialRevision + 1, `${fixture.label}: successful intent probe did not advance one revision.`);
  } else {
    assert(operations.length === 0, `${fixture.label}: clarification fixture performed a consequential operation.`);
    assert(result.map.revision === initialRevision, `${fixture.label}: clarification fixture changed canonical state.`);
    assert(text.length > 0, `${fixture.label}: clarification fixture returned no visible question.`);
    assert(replyShape(text).questions === 1, `${fixture.label}: expected exactly one natural clarifying question.`);
  }

  return {
    label: fixture.label,
    kind: fixture.expectedOperation ? 'positive' : 'clarification',
    state: fixture.state,
    operation: operations[0]?.type ?? null,
    targetMatched: fixture.expectedOperation ? true : null,
    resultingRevision: result.map.revision,
    retryCount: 0,
    replyShape: replyShape(text),
  };
}

async function runSemanticIntentFixtures(loader, model) {
  const reports = [];
  const fixtures = [...semanticIntentFixtures.positive, ...semanticIntentFixtures.clarification];
  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    reports.push(await runSemanticIntentProbe(fixture, fixtureIndex, loader, model));
  }
  assert(reports.length === fixtures.length, 'Not every U7 semantic-intent fixture executed.');
  assert(reports.every((report) => report.retryCount === 0), 'A U7 semantic-intent fixture retried.');
  return reports;
}

async function runNorthStarRevisionFixtures(loader, model) {
  const reports = [];
  for (const [fixtureIndex, kind] of ['zero', 'deep'].entries()) {
    const seed = createNorthStarRevisionSeed(kind, fixtureIndex);
    const expectedClasses = kind === 'deep'
      ? northStarRevisionFixtures.deepImpactClasses
      : northStarRevisionFixtures.zeroImpactClasses;
    const acknowledgment = kind === 'deep'
      ? `I explicitly acknowledge that this revision affects ${expectedClasses.join(', ')}, and I confirm the revised North Star.`
      : 'Yes. I explicitly confirm this revised North Star.';
    const result = await createSyntheticHarness({
      id: seed.probeId,
      initialMap: seed.map,
      initialMessages: seed.priorMessages,
      turnSequenceStart: seed.currentTurnSequence,
      maxSteps: 6,
      maxOutputTokens: 700,
      stopAfterOperations: ['confirm-why'],
      additionalInstructions: kind === 'deep'
        ? 'For this bounded English revision probe, after revise_why returns, visibly name every returned invalidatedArtifactClasses identifier exactly as returned, do not add another class, and do not confirm in that assistant response. Confirmation requires the next explorer message to acknowledge that impact. On that acknowledgment turn, call confirm_why and never revise_why unless the explorer also requests another content change.'
        : 'For this bounded zero-impact revision probe, after revise_why returns an empty invalidatedArtifactClasses list, present the revision without naming impact classes and ask for ordinary confirmation on a later explorer turn. Do not confirm in the revision response. On that confirmation turn, call confirm_why and never revise_why unless the explorer also requests another content change.',
      turns: [
        'Revise my confirmed North Star so it focuses on helping community teams make difficult choices actionable.',
        acknowledgment,
      ],
    }, loader, model).run();
    const reviseOperations = result.operations.filter((operation) => operation.type === 'revise-why');
    const confirmOperations = result.operations.filter((operation) => operation.type === 'confirm-why');
    const proposalText = result.turns[0]?.replyText ?? '';

    assert(
      reviseOperations.length === 1,
      `${kind}: expected exactly one revise-why operation; observed ${reviseOperations.length} with operation sequence ${JSON.stringify(result.operations.map(({ type, turnIndex }) => ({ type, turnIndex })))} and reply shapes ${JSON.stringify(result.turns.map(({ replyShape: shape }) => shape))}.`,
    );
    assert(confirmOperations.length === 1, `${kind}: expected exactly one later confirm-why operation.`);
    assert(
      JSON.stringify(result.operations.map(({ type }) => type)) === JSON.stringify(['revise-why', 'confirm-why']),
      `${kind}: revision probe performed an unexpected consequential operation.`,
    );
    assert(reviseOperations[0].turnIndex === 0, `${kind}: revision did not occur in the proposal turn.`);
    assert(confirmOperations[0].turnIndex === 1, `${kind}: revision confirmation did not wait for a later explorer turn.`);
    assert(
      JSON.stringify(reviseOperations[0].invalidatedArtifactClasses) === JSON.stringify(expectedClasses),
      `${kind}: revise-why returned the wrong exact artifact classes.`,
    );
    assert(
      result.operations.filter((operation) => operation.turnIndex === 0).every((operation) => operation.type !== 'confirm-why'),
      `${kind}: revised North Star was confirmed in the presentation response.`,
    );
    if (kind === 'deep') {
      for (const targetKind of expectedClasses) {
        assert(proposalText.includes(targetKind), `deep: visible proposal omitted the exact ${targetKind} impact class.`);
      }
    } else {
      assert(
        invalidationTargetOrder.every((targetKind) => !proposalText.includes(targetKind)),
        'zero: visible proposal named an impact class despite an empty reducer result.',
      );
    }
    const confirmed = result.map.foundation.whyRevisions.findLast((why) => why.status === 'confirmed');
    assert(confirmed?.id !== `${seed.probeId}-why`, `${kind}: the revised North Star was not confirmed.`);

    reports.push({
      kind,
      invalidatedArtifactClasses: [...reviseOperations[0].invalidatedArtifactClasses],
      operationTurns: result.operations.map(({ type, turnIndex }) => ({ type, turnIndex })),
      proposalReplyShape: replyShape(proposalText),
      resultingRevision: result.map.revision,
      retryCount: 0,
    });
  }

  const failedSeed = createNorthStarRevisionSeed('failed-presentation', 2);
  const failedResult = await createSyntheticHarness({
    id: failedSeed.probeId,
    initialMap: failedSeed.map,
    initialMessages: failedSeed.priorMessages,
    turnSequenceStart: failedSeed.currentTurnSequence,
    maxSteps: 6,
    maxOutputTokens: 700,
    additionalInstructions: 'The currently suggested North Star revision was committed in a prior assistant turn whose presentation failed before becoming visible. Recover by calling revise_why again for a fresh Suggested revision and re-presenting it. Never confirm the unseen revision.',
    turns: ['The previous revision never appeared. Please recover and show the revised North Star now.'],
  }, loader, model).run();
  assert(failedResult.operations.length === 1, 'failed-presentation: expected exactly one recovery operation.');
  assert(
    failedResult.operations[0].type === northStarRevisionFixtures.failedPresentationRecoveryOperation,
    'failed-presentation: recovery did not reuse revise-why.',
  );
  assert(
    failedResult.map.foundation.whyRevisions.find((why) => why.id === failedSeed.failedSuggestedWhyId)?.status === 'superseded',
    'failed-presentation: unseen revision was not superseded.',
  );
  const recovered = failedResult.map.foundation.whyRevisions.findLast((why) => why.status === 'suggested');
  assert(recovered && recovered.id !== failedSeed.failedSuggestedWhyId, 'failed-presentation: no fresh Suggested revision was created.');
  assert(!failedResult.operations.some((operation) => operation.type === 'confirm-why'), 'failed-presentation: unseen revision was confirmed.');
  assert((failedResult.turns[0]?.replyText ?? '').trim().length > 0, 'failed-presentation: recovered revision was not visibly re-presented.');
  reports.push({
    kind: 'failed-presentation',
    recoveryOperation: failedResult.operations[0].type,
    priorRevisionSuperseded: true,
    freshRevisionPresented: true,
    resultingRevision: failedResult.map.revision,
    retryCount: 0,
    proposalReplyShape: replyShape(failedResult.turns[0]?.replyText ?? ''),
  });

  assert(reports.length === 3, 'Not every U7 North Star revision fixture executed.');
  assert(reports.every((report) => report.retryCount === 0), 'A U7 North Star revision fixture retried.');
  return reports;
}

function createSyntheticHarness(scenario, loader, model) {
  let map = scenario.initialMap ?? createCareerMap(`synthetic-${scenario.id}`);
  let operationSequence = 0;
  let currentTurnIndex = -1;
  let currentTurnSequence = 0;
  let currentUserText = '';
  let previousAssistantText = '';
  let firstProjectAccepted = false;
  let requestedOperationCompleted = false;
  const operations = [];
  const preparations = [];
  const turns = [];
  const evidenceAuthorityViolations = [];

  function nextId(kind) {
    operationSequence += 1;
    return `${scenario.id}-${kind}-${operationSequence}`;
  }

  function presentation() {
    return {
      kind: 'model-presentation',
      assistantTurnId: `${scenario.id}-assistant-${currentTurnSequence}`,
      turnSequence: currentTurnSequence,
      completed: true,
      presentedAt: timestamp(currentTurnSequence),
    };
  }

  function userAction() {
    return {
      kind: 'user-message',
      actionId: `${scenario.id}-action-${currentTurnSequence}`,
      turnId: `${scenario.id}-user-${currentTurnSequence}`,
      turnSequence: currentTurnSequence,
      occurredAt: timestamp(currentTurnSequence),
    };
  }

  function userEvidence() {
    return userAction();
  }

  function rejectNonVerbatimEvidence(operation, field, value) {
    if (currentUserText && value && currentUserText.includes(value)) return null;
    evidenceAuthorityViolations.push({
      turnIndex: currentTurnIndex,
      operation,
      field,
      reason: 'UserEvidenceAssociationError',
    });
    const checkpoint = deriveMethodCheckpoint(map);
    return {
      status: 'rejected',
      operation,
      authoritativeRevision: map.revision,
      derivedModule: checkpoint.module,
      pendingDecision: checkpoint.pendingDecision?.kind ?? null,
      errorClass: 'UserEvidenceAssociationError',
      retryable: true,
    };
  }

  function currentSuggestedWhy() {
    return map.foundation.whyRevisions.findLast((item) => item.status === 'suggested');
  }

  function currentPathSet() {
    return map.pathSets.findLast((item) => item.status === 'suggested' || item.status === 'active');
  }

  function currentSuggestedProject() {
    return map.projects.findLast((item) => item.agreementStatus === 'suggested');
  }

  function commit(type, payload, toolCallId, privacySafeObservation = {}, serverOwned = false) {
    const before = deriveMethodCheckpoint(map);
    const beforeSet = currentPathSet();
    if (serverOwned) {
      assert(
        type === 'deliver-first-project-framing' || type === 'abandon-first-project-framing',
        `${scenario.id}: non-terminal operation attempted the server-owned path ${type}.`,
      );
    } else {
      assert(before.availableOperations.includes(type), `${scenario.id}: model called unavailable operation ${type}.`);
    }
    const result = applyCareerMapOperation(map, {
      type,
      sourceId: toolCallId || nextId('source'),
      expectedRevision: map.revision,
      occurredAt: timestamp(operationSequence + currentTurnSequence),
      payload,
    });
    if (result.status === 'committed' || result.status === 'replayed') map = result.map;
    const after = deriveMethodCheckpoint(map);
    const afterSet = currentPathSet();
    operations.push({
      turnIndex: currentTurnIndex,
      type,
      status: result.status,
      evidenceCategory: type === 'append-foundation-evidence' ? payload.evidence.category : null,
      constraintKind: type === 'record-reality-constraint' ? payload.constraint.kind : null,
      targetPathId: type === 'replace-purpose-path' ? payload.replacedPathId : null,
      combinedPathIds: type === 'combine-purpose-paths' ? [...payload.combinedPathIds] : [],
      projectId: type === 'propose-first-project'
        ? payload.project.id
        : type === 'accept-first-project'
          ? payload.projectId
          : null,
      replacementProjectId: type === 'replace-project-proposal' ? payload.replacement.id : null,
      projectGroundingKind: privacySafeObservation.projectGroundingKind ?? null,
      projectGroundingBasisProvided: privacySafeObservation.projectGroundingBasisProvided ?? false,
      invalidatedArtifactClasses: result.status === 'committed' || result.status === 'replayed'
        ? result.effects?.invalidatedArtifactClasses ?? []
        : [],
      authoritativeRevision: map.revision,
      pathIdsBefore: beforeSet?.paths.map((item) => item.id) ?? [],
      pathIdsAfter: afterSet?.paths.map((item) => item.id) ?? [],
      suggestedProjectCount: map.projects.filter((item) => item.agreementStatus === 'suggested').length,
    });
    assert(result.status !== 'rejected', `${scenario.id}: ${type} was rejected by the U2 reducer.`);
    if (scenario.stopAfterOperations?.includes(type)) requestedOperationCompleted = true;
    return {
      status: result.status,
      operation: type,
      authoritativeRevision: map.revision,
      derivedModule: after.module,
      pendingDecision: after.pendingDecision?.kind ?? null,
      invalidatedArtifactClasses: result.status === 'committed' || result.status === 'replayed'
        ? result.effects?.invalidatedArtifactClasses ?? []
        : [],
    };
  }

  const tools = {
    append_foundation_evidence: tool({
      description: 'Record one supported North Star evidence item. The content must be copied verbatim as one exact substring from the current explorer message; never summarize or paraphrase it. Never store a statement that the explorer cannot name an absorbing activity as fascination evidence.',
      inputSchema: foundationEvidenceToolInputSchema,
      execute: ({ category, content }, { toolCallId }) => {
        const rejection = rejectNonVerbatimEvidence('append-foundation-evidence', 'content', content);
        if (rejection) return rejection;
        return commit('append-foundation-evidence', {
          evidence: { id: nextId('evidence'), revision: 1, category, content, provenance: userEvidence() },
        }, toolCallId);
      },
    }),
    record_reality_constraint: tool({
      description: 'Record one current practical reality constraint, including an explicit absence of constraints. The description must be copied verbatim as one exact substring from the current explorer message; never summarize or paraphrase it.',
      inputSchema: realityConstraintToolInputSchema,
      execute: ({ kind, description }, { toolCallId }) => {
        const rejection = rejectNonVerbatimEvidence('record-reality-constraint', 'description', description);
        if (rejection) return rejection;
        return commit('record-reality-constraint', {
          constraint: { id: nextId('constraint'), revision: 1, kind, description, provenance: userEvidence() },
        }, toolCallId);
      },
    }),
    propose_why: tool({
      description: 'Propose one concise North Star only after minimum-sufficient evidence coverage exists. This does not confirm it.',
      inputSchema: whyToolInputSchema,
      execute: (why, { toolCallId }) => commit('propose-why', {
        why: { id: nextId('why'), revision: 1, ...why },
        presentation: presentation(),
      }, toolCallId),
    }),
    revise_why: tool({
      description: "Use only when the current explorer message asks to change the North Star's content or recover a failed presentation; never use it for an acknowledgment or confirmation. Suggest the revision and return its exact affected artifact classes.",
      inputSchema: whyToolInputSchema,
      execute: (why, { toolCallId }) => {
        const confirmed = map.foundation.whyRevisions.findLast((item) => item.status === 'confirmed');
        assert(confirmed, `${scenario.id}: no confirmed North Star is available to revise.`);
        return commit('revise-why', {
          why: { id: nextId('why'), revision: 1, ...why },
          supersedesWhyId: confirmed.id,
          presentation: presentation(),
        }, toolCallId);
      },
    }),
    confirm_why: tool({
      description: 'Confirm the one pending North Star only when the current user message semantically confirms that completed prior presentation.',
      inputSchema: z.object({}).strict(),
      execute: (_input, { toolCallId }) => {
        const why = currentSuggestedWhy();
        assert(why, `${scenario.id}: no suggested North Star is available to confirm.`);
        return commit('confirm-why', { whyId: why.id, whyRevision: why.revision, action: userAction() }, toolCallId);
      },
    }),
    propose_purpose_paths: tool({
      description: 'Propose exactly three distinct, equal, unranked Purpose Paths after the North Star is confirmed.',
      inputSchema: z.object({ paths: z.array(pathInputSchema).length(3) }).strict(),
      execute: ({ paths }, { toolCallId }) => commit('propose-purpose-paths', {
        setId: nextId('path-set'),
        setRevision: 1,
        paths: paths.map((item) => ({ id: nextId('path'), revision: 1, ...item })),
        presentation: presentation(),
      }, toolCallId),
    }),
    replace_purpose_path: tool({
      description: 'Replace exactly one named path in the current three-path set and preserve its two siblings.',
      inputSchema: z.object({ pathId: z.string().min(1), replacement: pathInputSchema }).strict(),
      execute: ({ pathId, replacement }, { toolCallId }) => {
        const set = currentPathSet();
        assert(set?.paths.some((item) => item.id === pathId), `${scenario.id}: replacement target is not in the current path set.`);
        return commit('replace-purpose-path', {
          sourceSetId: set.id,
          sourceSetRevision: set.revision,
          replacedPathId: pathId,
          replacementSetId: nextId('path-set'),
          replacementSetRevision: 1,
          replacement: { id: nextId('path'), revision: 1, ...replacement },
          presentation: presentation(),
        }, toolCallId);
      },
    }),
    combine_purpose_paths: tool({
      description: 'Combine two current paths and atomically preserve one sibling plus a merged path and a new third path.',
      inputSchema: z.object({
        combinedPathIds: z.tuple([z.string().min(1), z.string().min(1)]),
        mergedPath: pathInputSchema,
        newThirdPath: pathInputSchema,
      }).strict(),
      execute: ({ combinedPathIds, mergedPath, newThirdPath }, { toolCallId }) => {
        const set = currentPathSet();
        assert(set, `${scenario.id}: no path set is available to combine.`);
        const combined = new Set(combinedPathIds);
        const preserved = set.paths.find((item) => !combined.has(item.id));
        assert(preserved && combinedPathIds.every((id) => set.paths.some((item) => item.id === id)), `${scenario.id}: invalid combination targets.`);
        const { selection: _selection, equalWeight: _equalWeight, ...preservedInput } = preserved;
        return commit('combine-purpose-paths', {
          sourceSetId: set.id,
          sourceSetRevision: set.revision,
          combinedPathIds,
          replacementSetId: nextId('path-set'),
          replacementSetRevision: 1,
          paths: [
            preservedInput,
            { id: nextId('path'), revision: 1, ...mergedPath },
            { id: nextId('path'), revision: 1, ...newThirdPath },
          ],
          presentation: presentation(),
        }, toolCallId);
      },
    }),
    select_purpose_path: tool({
      description: 'Activate one current Purpose Path only after the user explicitly chooses it. An ordinal choice such as the first path in the current set is exact: resolve it against the canonical path order and call this tool without asking for the generated name.',
      inputSchema: z.object({ pathId: z.string().min(1) }).strict(),
      execute: ({ pathId }, { toolCallId }) => {
        const set = currentPathSet();
        const selected = set?.paths.find((item) => item.id === pathId);
        assert(set && selected, `${scenario.id}: selected path is not in the current set.`);
        return commit('select-purpose-path', {
          setId: set.id,
          setRevision: set.revision,
          pathId: selected.id,
          pathRevision: selected.revision,
          action: userAction(),
        }, toolCallId);
      },
    }),
    confirm_purpose_path_revision: tool({
      description: 'Confirm one path in a revised set only after an explicit user choice.',
      inputSchema: z.object({ pathId: z.string().min(1) }).strict(),
      execute: ({ pathId }, { toolCallId }) => {
        const set = currentPathSet();
        const selected = set?.paths.find((item) => item.id === pathId);
        assert(set && selected, `${scenario.id}: revised selected path is unavailable.`);
        return commit('confirm-purpose-path-revision', {
          setId: set.id,
          setRevision: set.revision,
          pathId: selected.id,
          pathRevision: selected.revision,
          action: userAction(),
        }, toolCallId);
      },
    }),
    propose_first_project: tool({
      description: 'Immediately after committed path selection, propose exactly one grounded first Path Project in the same response. Ground it with either an outcome the explorer explicitly wants or a real beneficiary relationship they can access firsthand. Do not stop to ask permission and do not create follow-on options.',
      inputSchema: groundedProjectInputSchema,
      execute: ({ grounding, ...project }, { toolCallId }) => commit('propose-first-project', {
        project: { id: nextId('project'), revision: 1, ...project },
        presentation: presentation(),
      }, toolCallId, {
        projectGroundingKind: grounding.kind,
        projectGroundingBasisProvided: grounding.kind === 'explorer-wanted-outcome'
          ? grounding.userSignal.length > 0
          : grounding.relationship.length > 0,
      }),
    }),
    replace_project_proposal: tool({
      description: 'Replace the one unaccepted first-project proposal with one new proposal grounded in either an outcome the explorer explicitly wants or a real beneficiary relationship they can access firsthand.',
      inputSchema: groundedProjectInputSchema,
      execute: ({ grounding, ...replacement }, { toolCallId }) => {
        const project = currentSuggestedProject();
        assert(project, `${scenario.id}: no first-project proposal is available to replace.`);
        return commit('replace-project-proposal', {
          projectId: project.id,
          projectRevision: project.revision,
          replacement: { id: nextId('project'), revision: 1, ...replacement },
          presentation: presentation(),
        }, toolCallId, {
          projectGroundingKind: grounding.kind,
          projectGroundingBasisProvided: grounding.kind === 'explorer-wanted-outcome'
            ? grounding.userSignal.length > 0
            : grounding.relationship.length > 0,
        });
      },
    }),
    present_first_project_framing: tool({
      description: 'Record the locale-correct R22 framing once for the pending first project, then emit exactly that framing and one short acceptance question.',
      inputSchema: z.object({
        locale: z.string().min(2).max(35),
        framingText: z.string().min(1).max(2_000),
        acceptancePhrase: z.string().min(1).max(240),
        acceptanceQuestion: z.string().min(1).max(240)
          .refine((value) => /^[^?\uFF1F]*[?\uFF1F]$/u.test(value.replace(/^\u00BF/u, ''))),
      }).strict(),
      execute: ({ locale, framingText, acceptancePhrase, acceptanceQuestion }, { toolCallId }) => {
        const project = currentSuggestedProject();
        assert(project, `${scenario.id}: no first project is available for framing.`);
        assert(framingText === expectedR22Framing(scenario), `${scenario.id}: framing tool did not persist the locale-correct canonical text.`);
        const expectedAcceptancePhrase = expectedR22Framing(scenario) === R22_CANONICAL_ENGLISH
          ? FIRST_PROJECT_ACCEPTANCE_PHRASE_ENGLISH
          : FIRST_PROJECT_ACCEPTANCE_PHRASE_SPANISH;
        assert(acceptancePhrase === expectedAcceptancePhrase, `${scenario.id}: framing tool did not persist the canonical locale acceptance phrase.`);
        assert(acceptanceQuestion.includes(acceptancePhrase), `${scenario.id}: acceptance question did not include the exact persisted phrase.`);
        return commit('present-first-project-framing', {
          projectId: project.id,
          projectRevision: project.revision,
          locale,
          framingText,
          acceptancePhrase,
          acceptanceQuestion,
          moduleVersion: loader.load(deriveMethodCheckpoint(map)).contentVersion,
          presentation: presentation(),
        }, toolCallId);
      },
    }),
    accept_first_project: tool({
      description: 'Accept the pending first project only after the prior completed assistant turn gave the locale-correct R22 framing and the current user explicitly accepts.',
      inputSchema: z.object({}).strict(),
      execute: (_input, { toolCallId }) => {
        const project = currentSuggestedProject();
        assert(project, `${scenario.id}: no first project is available to accept.`);
        assert(project.acceptanceFraming?.status === 'delivered', `${scenario.id}: project framing was not durably delivered.`);
        const expectedFraming = expectedR22Framing(scenario);
        assert(summarizeR22Presentation(previousAssistantText, expectedFraming).valid, `${scenario.id}: project acceptance did not follow the strict locale-correct R22 presentation.`);
        const result = commit('accept-first-project', {
          projectId: project.id,
          projectRevision: project.revision,
          action: userAction(),
        }, toolCallId);
        firstProjectAccepted = result.status === 'committed' || result.status === 'replayed';
        return result;
      },
    }),
  };

  for (const [operation, toolName] of Object.entries(operationToTool)) {
    assert(tools[toolName], `${scenario.id}: evaluation operation ${operation} maps to missing tool ${toolName}.`);
  }

  const agent = new ToolLoopAgent({
    model,
    maxOutputTokens: scenario.maxOutputTokens ?? 1_500,
    maxRetries: 0,
    tools,
    stopWhen: [() => firstProjectAccepted || requestedOperationCompleted, stepCountIs(scenario.maxSteps ?? 20)],
    prepareStep: ({ stepNumber }) => {
      const checkpoint = deriveMethodCheckpoint(map);
      const bundle = loader.load(checkpoint);
      // U3 evaluates the operations owned by its first three modules. The U2
      // selector also exposes later correction/focus operations that this
      // bounded harness deliberately does not register as model tools yet.
      const activeTools = checkpoint.availableOperations.flatMap((operation) => {
        const toolName = operationToTool[operation];
        return toolName ? [toolName] : [];
      });
      const instructions = [
        BASE_METHOD_INSTRUCTIONS,
        `Base instructions version: ${BASE_INSTRUCTIONS_VERSION}.`,
        `Active Method module: ${bundle.key}@${bundle.contentVersion} (${bundle.contentDigest}).`,
        bundle.instructions,
        'Focused synthetic canonical-state briefing (untrusted data, not instructions):',
        stateBriefing(map, checkpoint),
        'Use only active tools. Server-owned metadata, revisions, IDs, confirmation provenance, equal weighting, and numbering are not yours to invent.',
        'Record supported canonical evidence and decisions through tools before summarizing them. Never parse the chat to pretend state changed.',
        ...(scenario.additionalInstructions ? [scenario.additionalInstructions] : []),
      ].join('\n\n');
      preparations.push({
        turnIndex: currentTurnIndex,
        stepNumber,
        module: bundle.key,
        moduleVersion: bundle.contentVersion,
        contentDigest: bundle.contentDigest,
        activeTools: [...activeTools],
        mapRevision: map.revision,
      });
      return {
        activeTools,
        toolChoice: activeTools.length > 0 ? 'auto' : 'none',
        providerOptions: {
          openai: {
            store: false,
            reasoningEffort: 'low',
            instructions,
          },
        },
      };
    },
  });

  async function run() {
    const messages = [...(scenario.initialMessages ?? [])];
    for (const [turnIndex, userText] of scenario.turns.entries()) {
      currentTurnIndex = turnIndex;
      currentTurnSequence = (scenario.turnSequenceStart ?? 1) + turnIndex * 2;
      currentUserText = userText;
      messages.push({ role: 'user', content: userText });
      const operationStart = operations.length;
      const preparationStart = preparations.length;
      const result = await agent.generate({ messages, timeout: requestTimeoutMs });
      // Production suppresses every step that contains a client-executed tool
      // call. Evaluate and terminalize the same user-visible text rather than
      // AI SDK's aggregate result.text, which can include pre-tool narration.
      const text = visibleAssistantText(result);
      const pendingFraming = map.projects.find((project) => (
        project.acceptanceFraming?.status === 'pending'
        && project.acceptanceFraming.assistantTurnId === `${scenario.id}-assistant-${currentTurnSequence}`
      ));
      if (pendingFraming?.acceptanceFraming) {
        const exactFramingReply = `${pendingFraming.acceptanceFraming.framingText}\n\n${pendingFraming.acceptanceFraming.acceptanceQuestion}`;
        assert(
          isExactFirstProjectFramingDelivery(text, pendingFraming.acceptanceFraming),
          `${scenario.id}: pending framing response was not exact; expected ${JSON.stringify(exactFramingReply)}, received ${JSON.stringify(text)}.`,
        );
        commit('deliver-first-project-framing', {
          projectId: pendingFraming.id,
          projectRevision: pendingFraming.revision,
          assistantText: text,
          presentation: presentation(),
        }, `framing-delivery-${currentTurnIndex}`, {}, true);
      }
      messages.push(...result.response.messages);
      const turnPreparations = preparations.slice(preparationStart);
      turns.push({
        turnIndex,
        initialModule: turnPreparations[0]?.module ?? null,
        narrationModule: turnPreparations.at(-1)?.module ?? null,
        moduleVersions: [...new Set(turnPreparations.map((item) => `${item.module}@${item.moduleVersion}`))],
        activeTools: [...new Set(turnPreparations.flatMap((item) => item.activeTools))],
        operations: operations.slice(operationStart).map((item) => ({
          type: item.type,
          status: item.status,
          evidenceCategory: item.evidenceCategory,
          constraintKind: item.constraintKind,
          pathIdsBefore: item.pathIdsBefore,
          pathIdsAfter: item.pathIdsAfter,
          targetPathId: item.targetPathId,
          combinedPathIds: item.combinedPathIds,
          projectId: item.projectId,
          replacementProjectId: item.replacementProjectId,
          projectGroundingKind: item.projectGroundingKind,
          projectGroundingBasisProvided: item.projectGroundingBasisProvided,
          authoritativeRevision: item.authoritativeRevision,
        })),
        resultingRevision: map.revision,
        replyShape: replyShape(text),
        replyLooksSpanish: text ? isPredominantlySpanish(text) : null,
        replyText: text,
      });
      previousAssistantText = text;
    }
    return { map, operations, preparations, turns, evidenceAuthorityViolations };
  }

  return { run };
}

function assessScenario(scenario, result) {
  const { map, operations, turns, evidenceAuthorityViolations } = result;
  const operationTypes = operations.map((item) => item.type);
  const why = map.foundation.whyRevisions.findLast((item) => item.status === 'confirmed');
  const activeSet = map.pathSets.findLast((item) => item.status === 'active');
  const acceptedProject = map.projects.findLast((item) => item.agreementStatus === 'accepted');
  const acceptedOperation = operations.find((item) => item.type === 'accept-first-project');
  const acceptedTurn = acceptedOperation?.turnIndex;
  const framingTurn = acceptedTurn === undefined ? undefined : turns.find((item) => item.turnIndex === acceptedTurn - 1);
  const allReplyText = turns.map((turn) => turn.replyText).join('\n');
  const foundationTrace = summarizeFoundationTrace(operations);
  const firstTurnQuestionTopics = classifyFoundationQuestionTopics(turns[0]?.replyText ?? '');
  const pathOperationMatched = matchesPathOperationExpectation(operations, scenario.pathOperationExpectation);
  const projectReplacement = scenario.projectReplacementTurn === undefined
    ? null
    : summarizeFirstProjectReplacement(operations, scenario.projectReplacementTurn);
  const expectedFraming = expectedR22Framing(scenario);
  const r22Presentation = summarizeR22Presentation(framingTurn?.replyText ?? '', expectedFraming);

  assert(evidenceAuthorityViolations.length === 0, `${scenario.id}: model attempted ${evidenceAuthorityViolations.length} non-verbatim Foundation write(s).`);
  assert(why, `${scenario.id}: no confirmed North Star remained in canonical state.`);
  assert(foundationTrace.minimumSufficient, `${scenario.id}: propose-why preceded minimum-sufficient North Star evidence coverage (${foundationTrace.missingCoverage.join(', ') || 'propose-why missing'}).`);
  assert(foundationTrace.proposedAtFirstSufficientTurn, `${scenario.id}: the North Star was not proposed in the first turn with minimum-sufficient coverage.`);
  for (const topic of scenario.foundationExpectations.requiredFirstTurnQuestionTopics) {
    assert(firstTurnQuestionTopics.includes(topic), `${scenario.id}: first North Star reply did not ask the required ${topic} follow-up.`);
  }
  for (const topic of scenario.foundationExpectations.forbiddenFirstTurnQuestionTopics) {
    assert(!firstTurnQuestionTopics.includes(topic), `${scenario.id}: first North Star reply re-asked the already answered ${topic} area.`);
  }
  assert(activeSet, `${scenario.id}: no active Purpose Path set remained in canonical state.`);
  assert(activeSet.paths.length === 3, `${scenario.id}: active Purpose Path set was not exact-three.`);
  assert(activeSet.paths.every((item) => item.equalWeight === true), `${scenario.id}: Purpose Paths were not equal-weight.`);
  assert(new Set(activeSet.paths.map((item) => item.name.toLowerCase())).size === 3, `${scenario.id}: Purpose Path names were not distinct.`);
  assert(activeSet.paths.filter((item) => item.selection === 'active').length === 1, `${scenario.id}: explicit path selection did not activate exactly one path.`);
  assert(acceptedProject?.number === 1, `${scenario.id}: the single first Path Project was not accepted as project 1.`);
  assert(map.projects.filter((item) => item.agreementStatus === 'accepted').length === 1, `${scenario.id}: more than one first Path Project was accepted.`);
  assert(operations.every((item) => item.status === 'committed' || item.status === 'replayed'), `${scenario.id}: an operation failed to commit.`);
  assert(operations.every((item) => item.suggestedProjectCount <= 1), `${scenario.id}: more than one first-project proposal was current.`);
  assert(operationTypes.indexOf('propose-purpose-paths') > operationTypes.indexOf('confirm-why'), `${scenario.id}: Purpose Paths appeared before the confirmed North Star.`);
  assert(operationTypes.indexOf('propose-first-project') > operationTypes.indexOf('select-purpose-path'), `${scenario.id}: first project appeared before explicit path selection.`);
  for (const required of scenario.requiredOperations) {
    assert(operationTypes.includes(required), `${scenario.id}: required scenario operation ${required} was not observed.`);
  }
  assert(pathOperationMatched, `${scenario.id}: requested path operation used the wrong turn or canonical target.`);

  for (const replacement of operations.filter((item) => item.type === 'replace-purpose-path')) {
    const preserved = replacement.pathIdsBefore.filter((id) => replacement.pathIdsAfter.includes(id));
    assert(replacement.pathIdsAfter.length === 3 && preserved.length === 2, `${scenario.id}: path replacement did not preserve exactly two siblings.`);
  }
  for (const combination of operations.filter((item) => item.type === 'combine-purpose-paths')) {
    assert(combination.pathIdsAfter.length === 3, `${scenario.id}: path combination did not commit a complete three-path set.`);
  }

  for (const operation of operations.filter((item) => ['propose-purpose-paths', 'replace-purpose-path', 'combine-purpose-paths'].includes(item.type))) {
    const offer = turns.find((turn) => turn.turnIndex === operation.turnIndex)?.replyText.trim();
    const expectedOffer = scenario.openingLanguage === 'es'
      || (scenario.languageChangeTurn !== undefined && operation.turnIndex >= scenario.languageChangeTurn)
      ? PURPOSE_PATHS_OFFER_SPANISH
      : PURPOSE_PATHS_OFFER_ENGLISH;
    assert(offer === expectedOffer, `${scenario.id}: Purpose Paths narration was not the one exact concise localized offer.`);
  }

  if (projectReplacement) {
    assert(projectReplacement.replacementOnExpectedTurn, `${scenario.id}: project replacement did not occur on the scripted rejection turn.`);
    assert(projectReplacement.groundedReplacement, `${scenario.id}: replacement project lacked structured wanted-outcome or firsthand-beneficiary grounding.`);
    assert(projectReplacement.acceptedReplacement, `${scenario.id}: acceptance did not target the grounded replacement project.`);
  }

  assert(acceptedTurn !== undefined && framingTurn, `${scenario.id}: acceptance did not have an immediately preceding assistant turn.`);
  assert(r22Presentation.valid, `${scenario.id}: R22 framing was not the exact first paragraph followed by one short acceptance question.`);
  assert(countOccurrences(allReplyText, expectedFraming) === 1, `${scenario.id}: locale-correct R22 framing did not appear exactly once.`);
  if (scenario.openingLanguage !== 'en' || scenario.languageChangeTurn !== undefined) {
    assert(framingTurn.replyLooksSpanish === true, `${scenario.id}: localized R22 framing was not in Spanish.`);
    assert(hasFaithfulSpanishR22(framingTurn.replyText), `${scenario.id}: Spanish R22 framing was not semantically faithful.`);
  }

  assert(scenario.openingLanguage !== 'es' || turns[0].replyLooksSpanish === true, `${scenario.id}: Spanish opening did not receive a Spanish first reply.`);
  if (scenario.languageChangeTurn !== undefined) {
    assert(turns[scenario.languageChangeTurn]?.replyLooksSpanish === true, `${scenario.id}: explicit language change was not mirrored on the next reply.`);
  }

  const foundationNarrations = turns.filter((turn) => turn.narrationModule === 'form-foundation' && turn.replyShape.characters > 0);
  const pauseTurns = new Set(scenario.foundationExpectations.pauseTurns ?? []);
  const activeFoundationNarrations = foundationNarrations.filter((turn) => !pauseTurns.has(turn.turnIndex));
  const pausedFoundationNarrations = foundationNarrations.filter((turn) => pauseTurns.has(turn.turnIndex));
  assert(activeFoundationNarrations.every((turn) => turn.replyShape.questions === 1), `${scenario.id}: every active North Star narration must end with exactly one forward-moving question.`);
  assert(pausedFoundationNarrations.every((turn) => turn.replyShape.questions === 0 && turn.operations.length === 0), `${scenario.id}: an explicit Foundation pause asked a question or mutated canonical state.`);
  assert(turns.every((turn) => turn.replyShape.characters < 4_000), `${scenario.id}: a reply violated the concise response bound.`);
  assert(!/(permanent calling|destiny|scientific fit|fit score|ranked best|best path for you|your true calling|vocación definitiva|destino|puntuación de encaje|mejor camino para ti)/i.test(allReplyText), `${scenario.id}: reply used a forbidden identity, fit, destiny, or ranking claim.`);
  assert(!/(I recommend|I would choose|te recomiendo|yo elegiría)/i.test(allReplyText), `${scenario.id}: reply made an unsolicited recommendation.`);

  const pathPairs = activeSet.paths.flatMap((left, index) => activeSet.paths.slice(index + 1).map((right) => [left, right]));
  const semanticDistinctness = pathPairs.every(([left, right]) => {
    const leftWords = normalizeWords(`${left.name} ${left.servesWhy}`);
    const rightWords = normalizeWords(`${right.name} ${right.servesWhy}`);
    return jaccard(leftWords, rightWords) < 0.8;
  });
  const oneQuestionBrevity = activeFoundationNarrations.every((turn) => turn.replyShape.questions === 1 && turn.replyShape.characters < 1_200)
    && pausedFoundationNarrations.every((turn) => turn.replyShape.questions === 0 && turn.replyShape.characters < 1_200);
  const tone = turns.every((turn) => turn.replyShape.characters < 2_000);
  const qualitative = { tone, oneQuestionBrevity, semanticDistinctness };

  const retainedTurns = turns.map(({ replyText: _replyText, ...turn }) => turn);
  return {
    hardInvariantsPassed: true,
    foundation: {
      ...foundationTrace,
      firstTurnQuestionTopics,
    },
    scriptedOperations: {
      pathOperationMatched,
      projectReplacement,
    },
    r22Presentation,
    qualitative,
    qualitativePassed: Object.values(qualitative).every(Boolean),
    finalState: {
      revision: map.revision,
      confirmedWhy: Boolean(why),
      activePathCount: activeSet.paths.filter((item) => item.selection === 'active').length,
      pathCount: activeSet.paths.length,
      acceptedFirstProject: acceptedProject?.number === 1,
    },
    turns: retainedTurns,
  };
}

function retainedDiagnostic(scenario, result) {
  const checkpoint = deriveMethodCheckpoint(result.map);
  const foundationTrace = summarizeFoundationTrace(result.operations);
  const acceptedOperation = result.operations.find((item) => item.type === 'accept-first-project');
  const framingTurn = acceptedOperation === undefined
    ? undefined
    : result.turns.find((item) => item.turnIndex === acceptedOperation.turnIndex - 1);
  const expectedFraming = expectedR22Framing(scenario);
  return {
    sample: scenario.id,
    revision: result.map.revision,
    module: checkpoint.module,
    pendingDecision: checkpoint.pendingDecision?.kind ?? null,
    operationTypes: result.operations.map((item) => `${item.type}:${item.status}`),
    evidenceAuthorityViolations: result.evidenceAuthorityViolations,
    foundation: {
      ...foundationTrace,
      firstTurnQuestionTopics: classifyFoundationQuestionTopics(result.turns[0]?.replyText ?? ''),
    },
    scriptedOperations: {
      pathOperationMatched: matchesPathOperationExpectation(result.operations, scenario.pathOperationExpectation),
      projectReplacement: scenario.projectReplacementTurn === undefined
        ? null
        : summarizeFirstProjectReplacement(result.operations, scenario.projectReplacementTurn),
    },
    r22Presentation: summarizeR22Presentation(framingTurn?.replyText ?? '', expectedFraming),
    stateShape: {
      whyStatuses: result.map.foundation.whyRevisions.map((item) => item.status),
      pathSetStatuses: result.map.pathSets.map((item) => item.status),
      projectAgreementStatuses: result.map.projects.map((item) => item.agreementStatus),
    },
    turnShapes: result.turns.map(({ replyText: _replyText, ...turn }) => turn),
  };
}

async function packageVersion(packageName) {
  const packageUrl = new URL(`../node_modules/${packageName}/package.json`, import.meta.url);
  const manifest = JSON.parse(await readFile(packageUrl, 'utf8'));
  return manifest.version;
}

async function main() {
  proveU2FirstProjectReplacementBoundary();
  proveU7FixtureCoverage();
  proveNorthStarRevisionSeedCoverage();
  assert(apiKey, 'OPENAI_API_KEY is required for the live Method evaluation.');
  const loader = await createMethodModuleLoader();
  const openai = createOpenAI({ apiKey });
  const model = openai.responses(modelId);
  const semanticIntentReports = await runSemanticIntentFixtures(loader, model);
  const northStarRevisionReports = await runNorthStarRevisionFixtures(loader, model);
  const sampleReports = [];

  for (const scenario of scenarios) {
    const harness = createSyntheticHarness(scenario, loader, model);
    const result = await harness.run();
    try {
      sampleReports.push({ id: scenario.id, retryCount: result.evidenceAuthorityViolations.length, ...assessScenario(scenario, result) });
    } catch (error) {
      console.error(JSON.stringify({ status: 'sample-failed', diagnostic: retainedDiagnostic(scenario, result) }));
      throw error;
    }
  }

  assert(sampleReports.every((sample) => sample.hardInvariantsPassed), 'Not every Method sample passed its hard invariants.');
  if (sampleReports.filter((sample) => sample.qualitativePassed).length < 2) {
    console.error(JSON.stringify({
      status: 'qualitative-gate-failed',
      samples: sampleReports.map((sample) => ({
        id: sample.id,
        qualitative: sample.qualitative,
        turnShapes: sample.turns.map((turn) => turn.replyShape),
      })),
    }));
  }
  assert(sampleReports.filter((sample) => sample.qualitativePassed).length >= 2, 'Fewer than two Method samples passed the qualitative rubric without retries.');

  const report = {
    status: 'pass',
    runStartedAt,
    provider: 'OpenAI Responses through @ai-sdk/openai',
    route: 'AI SDK ToolLoopAgent with prepareStep',
    model: modelId,
    nativePassingSet: [...allowedModels],
    versions: {
      node: process.version,
      ai: await packageVersion('ai'),
      openaiProvider: await packageVersion('@ai-sdk/openai'),
      baseInstructions: BASE_INSTRUCTIONS_VERSION,
      modules: Object.fromEntries(loader.registeredKeys.map((key) => {
        const bundle = loader.load({ module: key });
        return [key, { contentVersion: bundle.contentVersion, contentDigest: bundle.contentDigest }];
      })),
    },
    gate: {
      hardSamples: `${sampleReports.filter((sample) => sample.hardInvariantsPassed).length}/3`,
      qualitativeSamples: `${sampleReports.filter((sample) => sample.qualitativePassed).length}/3`,
      semanticIntentSamples: `${semanticIntentReports.length}/12`,
      northStarRevisionSamples: `${northStarRevisionReports.length}/3`,
      required: 'hard 3/3; qualitative at least 2/3; semantic intent 12/12; North Star revision 3/3; retries 0',
    },
    u7Fixtures: {
      semanticPositive: semanticIntentReports.filter(({ kind }) => kind === 'positive'),
      semanticClarification: semanticIntentReports.filter(({ kind }) => kind === 'clarification'),
      northStarRevision: northStarRevisionReports,
    },
    samples: sampleReports,
    privacy: 'Retained output excludes synthetic messages, reflection content, operation arguments, canonical values, and provider response text.',
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const failure = error instanceof EvaluationAssertionError
    ? { status: 'failed', errorClass: error.name, reason: error.message }
    : { status: 'failed', errorClass: error?.name || 'Error', reason: 'Provider or harness details omitted from retained output.' };
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
});

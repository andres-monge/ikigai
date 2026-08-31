import {
  careerMapSchema,
  deriveMethodCheckpoint,
  type CareerMap,
  type MethodCheckpoint,
  type SourceProvenance,
} from '../../shared/career-map/index.js';

export class CareerMapBriefingError extends Error {
  readonly code = 'repair-required';

  constructor() {
    super('Career map is invalid and cannot enter a model briefing.');
    this.name = 'CareerMapBriefingError';
  }
}

export interface CareerMapBriefing {
  schemaVersion: number;
  mapRevision: number;
  module: MethodCheckpoint['module'];
  pendingDecision: MethodCheckpoint['pendingDecision'];
  markdown: string;
}

function activePath(map: CareerMap) {
  return map.pathSets
    .findLast((set) => set.status === 'active')
    ?.paths.find((path) => path.selection === 'active');
}

function latestAcceptedProject(map: CareerMap) {
  return map.projects
    .filter((project) => project.agreementStatus === 'accepted')
    .sort((left, right) => right.number - left.number)[0];
}

function sourceLine(source: SourceProvenance): string {
  if (source.kind === 'user-supplied-source') {
    return `- User source: ${source.label}${source.url ? ` (${source.url})` : ''}`;
  }
  const title = source.title ?? source.url;
  const result = source.providerResultId ? `; result ${source.providerResultId}` : '';
  const excerpt = source.excerpt ? ` — ${source.excerpt}` : '';
  return `- Research source: ${title} (${source.url}; ${source.support}${result}; retrieved ${source.retrievedAt})${excerpt}`;
}

function appendSources(lines: string[], sources: SourceProvenance[] | undefined): void {
  if (!sources?.length) return;
  lines.push('Sources:');
  lines.push(...sources.map(sourceLine));
}

function appendWhy(lines: string[], map: CareerMap): void {
  const why = map.foundation.whyRevisions.findLast((item) => item.status === 'confirmed');
  if (!why) return;
  lines.push('## Confirmed Why I Work');
  lines.push(`Basis: ${why.id}@${why.revision}`);
  lines.push(why.statement);
  lines.push(`Serves: ${why.serves}`);
  lines.push(`Point of view: ${why.pointOfView}`);
}

function appendPath(lines: string[], map: CareerMap, includeAlternatives: boolean): void {
  const set = map.pathSets.findLast((item) => item.status === 'suggested')
    ?? map.pathSets.findLast((item) => item.status === 'active');
  if (!set) return;
  lines.push('## Purpose Path context');
  lines.push(`Set: ${set.id}@${set.revision}; Why basis: ${set.basisWhy.id}@${set.basisWhy.revision}`);
  const paths = includeAlternatives
    ? set.paths
    : set.paths.filter((path) => path.selection === 'active');
  for (const path of paths) {
    lines.push(`### ${path.name} (${path.id}@${path.revision}; ${path.selection})`);
    lines.push(`Serves Why: ${path.servesWhy}`);
    lines.push(`Central unknown: ${path.centralUnknown}`);
    lines.push(`Practical fit: ${path.practicalFit}`);
    appendSources(lines, path.sources);
  }
}

function appendProject(
  lines: string[],
  map: CareerMap,
  selectedProject?: CareerMap['projects'][number],
): void {
  const suggested = map.projects.findLast((item) => item.agreementStatus === 'suggested');
  const project = selectedProject ?? suggested ?? latestAcceptedProject(map);
  if (!project) return;
  lines.push('## Active Path Project');
  lines.push(`Project ${project.number}: ${project.title} (${project.id}@${project.revision}; ${project.agreementStatus}; ${project.workStatus})`);
  lines.push(`Path basis: ${project.basisPath.id}@${project.basisPath.revision}`);
  lines.push(`Outcome: ${project.outcome}`);
  lines.push(`Learning question: ${project.decisionQuestion}`);
  lines.push(`First step: ${project.firstStep}`);
  appendSources(lines, project.sources);

  const options = map.projectOptionSets.findLast((set) => set.status === 'suggested');
  if (options) {
    lines.push('### Pending equal-weight Path Project options');
    for (const option of options.projects) {
      lines.push(`- ${option.title} (${option.id}@${option.revision}; ${option.selection}) — ${option.decisionQuestion}`);
      appendSources(lines, option.sources);
    }
  }
}

function latestReflectionRevisions(map: CareerMap): CareerMap['reflections'] {
  const latestById = new Map<string, number>();
  for (const reflection of map.reflections) {
    const current = latestById.get(reflection.id);
    if (!current || reflection.revision > current) latestById.set(reflection.id, reflection.revision);
  }
  return map.reflections.filter((reflection) => latestById.get(reflection.id) === reflection.revision);
}

function currentReflectionEvidence(reflection: CareerMap['reflections'][number]) {
  const superseded = new Set(
    reflection.evidence.flatMap((evidence) => evidence.supersedesEvidenceId ? [evidence.supersedesEvidenceId] : []),
  );
  return reflection.evidence.filter((evidence) => !superseded.has(evidence.id));
}

function appendReflection(
  lines: string[],
  map: CareerMap,
  reflection: CareerMap['reflections'][number] | undefined,
): void {
  if (!reflection) return;
  lines.push('## What You Learned');
  lines.push(`Reflection: ${reflection.id}@${reflection.revision}; ${reflection.status}; project ${reflection.projectBasis.id}@${reflection.projectBasis.revision}`);
  for (const evidence of currentReflectionEvidence(reflection)) {
    lines.push(`- ${evidence.signal}: ${evidence.observation} — ${evidence.interpretation}`);
  }
  const choice = map.continueChoices.findLast(
    (item) => item.reflectionBasis.id === reflection.id
      && item.reflectionBasis.revision === reflection.revision,
  );
  if (choice) lines.push(`Continue choice: ${choice.wantsToContinue ? 'continue' : 'return to paths'} (${choice.id}@${choice.revision})`);
  const move = choice
    ? map.nextMoves.findLast(
      (item) => item.continueChoiceBasis.id === choice.id
        && item.continueChoiceBasis.revision === choice.revision,
    )
    : undefined;
  if (move) lines.push(`Next Move: ${move.kind} (${move.id}@${move.revision})`);
}

function reflectionAndProjectForCheckpoint(
  map: CareerMap,
  checkpoint: MethodCheckpoint,
): {
  reflection?: CareerMap['reflections'][number];
  project?: CareerMap['projects'][number];
} {
  const reflections = latestReflectionRevisions(map);
  const currentProject = latestAcceptedProject(map);
  const reflectionFocus = checkpoint.focus?.kind === 'reflection' ? checkpoint.focus : undefined;
  const reflection = reflectionFocus
    ? reflections.find((item) => item.id === reflectionFocus.reflectionId)
    : currentProject
      ? reflections.findLast((item) => item.projectBasis.id === currentProject.id
        && item.projectBasis.revision === currentProject.revision)
      : undefined;
  if (!reflection) return { project: currentProject };
  return {
    reflection,
    project: map.projects.find((item) => item.id === reflection.projectBasis.id
      && item.revision === reflection.projectBasis.revision),
  };
}

function appendProjectLearningEvidence(lines: string[], map: CareerMap): void {
  const projects = map.projects
    .filter((project) => project.agreementStatus === 'accepted')
    .sort((left, right) => left.number - right.number);
  if (!projects.length) return;
  const reflections = latestReflectionRevisions(map);
  lines.push('## Accepted Path Project evidence for proof');
  for (const project of projects) {
    lines.push(`### Project ${project.number}: ${project.title} (${project.id}@${project.revision}; ${project.workStatus})`);
    lines.push(`Outcome: ${project.outcome}`);
    lines.push(`Learning question: ${project.decisionQuestion}`);
    appendSources(lines, project.sources);
    for (const reflection of reflections.filter(
      (item) => item.projectBasis.id === project.id
        && item.projectBasis.revision === project.revision,
    )) {
      lines.push(`Reflection ${reflection.id}@${reflection.revision} (${reflection.status}):`);
      for (const evidence of currentReflectionEvidence(reflection)) {
        lines.push(`- ${evidence.signal}: ${evidence.observation} — ${evidence.interpretation}`);
      }
    }
  }
}

function appendPeers(lines: string[], map: CareerMap): void {
  const path = activePath(map);
  if (!path) return;
  const peers = map.peerExposures.filter(
    (peer) => peer.status !== 'superseded'
      && peer.basisPath.id === path.id
      && peer.basisPath.revision === path.revision,
  );
  if (!peers.length && !map.commitmentIntent) return;
  lines.push('## Relevant peer exposure');
  for (const peer of peers) {
    lines.push(`- ${peer.subjectKind}: ${peer.subject} (${peer.id}@${peer.revision}; ${peer.status}) — ${peer.insight}`);
    appendSources(lines, peer.sources);
  }
  if (map.commitmentIntent) {
    lines.push(`Commitment intent: ${map.commitmentIntent.status} (${map.commitmentIntent.id}@${map.commitmentIntent.revision})`);
  }
}

function appendSideDoors(lines: string[], map: CareerMap): void {
  if (map.provisionalCommitment) {
    lines.push('## Provisional commitment');
    lines.push(`${map.provisionalCommitment.id}@${map.provisionalCommitment.revision}; path ${map.provisionalCommitment.basisPath.id}@${map.provisionalCommitment.basisPath.revision}`);
  }
  const proof = map.proofRevisions.findLast((item) => item.status !== 'superseded');
  if (proof) {
    lines.push('## Proof inventory');
    lines.push(`${proof.id}@${proof.revision}; ${proof.status}; commitment basis ${proof.basisCommitment.id}@${proof.basisCommitment.revision}`);
    lines.push(`Artifacts: ${proof.artifacts.join('; ') || 'none recorded'}`);
    lines.push(`Problems solved: ${proof.problemsSolved.join('; ') || 'none recorded'}`);
  }
  const set = map.sideDoorSets.findLast((item) => item.status !== 'superseded');
  if (!set) return;
  lines.push('## Side Doors');
  lines.push(`Set: ${set.id}@${set.revision}; proof basis ${set.basisProof.id}@${set.basisProof.revision}`);
  for (const door of set.doors) {
    lines.push(`- ${door.name} (${door.id}@${door.revision}; ${door.selection}) — ${door.firstMove}`);
    appendSources(lines, door.sources);
  }
  const doorIds = new Set(set.doors.map((door) => door.id));
  for (const outcome of map.routeOutcomes.filter((item) => doorIds.has(item.doorBasis.id))) {
    lines.push(`Route outcome: ${outcome.result} for ${outcome.doorBasis.id}@${outcome.doorBasis.revision} — ${outcome.learning}`);
  }
}

export function compileCareerMapBriefing(input: unknown): CareerMapBriefing {
  const parsed = careerMapSchema.safeParse(input);
  if (!parsed.success) throw new CareerMapBriefingError();
  const map = parsed.data;
  const checkpoint = deriveMethodCheckpoint(map);
  const lines = [
    '# Revelio career-map briefing',
    `Schema ${map.schemaVersion}; map revision ${map.revision}; active module ${checkpoint.module}.`,
    'Canonical state below outranks conflicting or stale transcript text.',
  ];

  if (checkpoint.review) {
    lines.push('## Repair the earliest stale basis before continuing');
    lines.push(
      `Review ${checkpoint.review.targetKind} ${checkpoint.review.targetId}@${checkpoint.review.targetRevision}; `
      + `invalidated by ${checkpoint.review.basisKind} ${checkpoint.review.basisId}@${checkpoint.review.basisRevision}.`,
    );
  }
  if (checkpoint.focus) {
    lines.push('## Explorer-opened focus');
    lines.push(`${checkpoint.focus.kind}: ${checkpoint.focus.reason}`);
  }
  if (checkpoint.pendingDecision) {
    lines.push('## Pending decision');
    lines.push(`${checkpoint.pendingDecision.kind}: ${checkpoint.pendingDecision.targetId}@${checkpoint.pendingDecision.targetRevision}`);
  }
  appendWhy(lines, map);

  const includeAlternatives = checkpoint.module === 'create-purpose-paths'
    || checkpoint.pendingDecision?.kind === 'path-selection'
    || checkpoint.pendingDecision?.kind === 'path-revision-confirmation'
    || checkpoint.review?.targetKind === 'path-set';
  if (checkpoint.module !== 'form-foundation') appendPath(lines, map, includeAlternatives);

  switch (checkpoint.module) {
    case 'form-foundation': {
      lines.push('## Current Foundation evidence');
      const superseded = new Set(map.foundation.evidence.flatMap((item) => item.supersedesEvidenceId ? [item.supersedesEvidenceId] : []));
      for (const evidence of map.foundation.evidence.filter((item) => !superseded.has(item.id))) {
        lines.push(`- ${evidence.category}: ${evidence.content} (${evidence.id}@${evidence.revision})`);
      }
      for (const constraint of map.foundation.constraints) {
        lines.push(`- Reality boundary — ${constraint.kind}: ${constraint.description}`);
      }
      break;
    }
    case 'create-purpose-paths':
      break;
    case 'design-path-project':
    case 'guide-path-project':
      appendProject(lines, map);
      break;
    case 'interpret-path-project':
      {
        const relevant = reflectionAndProjectForCheckpoint(map, checkpoint);
        appendProject(lines, map, relevant.project);
        appendReflection(lines, map, relevant.reflection);
      }
      break;
    case 'find-relevant-peers':
      appendProject(lines, map);
      appendPeers(lines, map);
      break;
    case 'enter-side-doors':
      appendProjectLearningEvidence(lines, map);
      appendPeers(lines, map);
      appendSideDoors(lines, map);
      break;
  }

  return {
    schemaVersion: map.schemaVersion,
    mapRevision: map.revision,
    module: checkpoint.module,
    pendingDecision: checkpoint.pendingDecision,
    markdown: `${lines.join('\n\n')}\n`,
  };
}

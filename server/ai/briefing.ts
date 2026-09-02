import {
  careerMapSchema,
  deriveMethodCheckpoint,
  selectActivePurposePath,
  selectLatestAcceptedProject,
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
  modelMarkdown: string;
}

type BriefingProjection = 'canonical' | 'model';

function sourceLine(source: SourceProvenance, projection: BriefingProjection): string {
  if (source.kind === 'user-supplied-source') {
    return `- Explorer-provided source: ${source.label}${source.url ? ` (${source.url})` : ''}`;
  }
  if (projection === 'model') {
    return 'bindingVersion' in source
      ? `- Research grounding for ${source.canonicalField} is ${source.support}; retrieved title and content omitted from instructions.`
      : '- Predecessor research provenance recorded server-side; retrieved title and content omitted from instructions.';
  }
  const title = source.title ?? source.url;
  const result = source.providerResultId ? `; result ${source.providerResultId}` : '';
  const excerpt = source.excerpt ? ` — ${source.excerpt}` : '';
  const binding = 'bindingVersion' in source
    ? `; call ${source.providerCallId}; target ${source.targetId}@${source.targetRevision}; field ${source.canonicalField}; exact claim ${JSON.stringify(source.exactClaim)}; citation ${source.citation.start}-${source.citation.end}`
    : '';
  return `- Research source: ${title} (${source.url}; ${source.support}${result}${binding}; retrieved ${source.retrievedAt})${excerpt}`;
}

function appendSources(
  lines: string[],
  sources: SourceProvenance[] | undefined,
  projection: BriefingProjection,
): void {
  if (!sources?.length) return;
  lines.push('Sources:');
  lines.push(...sources.map((source) => sourceLine(source, projection)));
}

function appendWhy(lines: string[], map: CareerMap): void {
  const confirmed = map.foundation.whyRevisions.findLast((item) => item.status === 'confirmed');
  if (confirmed) {
    lines.push('## Confirmed Why I Work');
    lines.push(`Basis: ${confirmed.id}@${confirmed.revision}`);
    lines.push(confirmed.statement);
    lines.push(`Serves: ${confirmed.serves}`);
    lines.push(`Point of view: ${confirmed.pointOfView}`);
  }
  const suggested = map.foundation.whyRevisions.findLast((item) => item.status === 'suggested');
  if (suggested) {
    lines.push('## Suggested Why I Work — pending confirmation');
    lines.push(`Basis: ${suggested.id}@${suggested.revision}; ${suggested.status}`);
    lines.push(suggested.statement);
    lines.push(`Serves: ${suggested.serves}`);
    lines.push(`Point of view: ${suggested.pointOfView}`);
  }
}

function exactRevision<T extends { id: string; revision: number }>(
  records: T[],
  id: string,
  revision: number,
): T | undefined {
  return records.find((record) => record.id === id && record.revision === revision);
}

function pathByRevision(map: CareerMap, id: string, revision: number) {
  return map.pathSets.flatMap((set) => set.paths)
    .find((path) => path.id === id && path.revision === revision);
}

function appendExactPath(
  lines: string[],
  path: ReturnType<typeof pathByRevision>,
  projection: BriefingProjection,
): void {
  if (!path) throw new CareerMapBriefingError();
  lines.push(`Purpose Path: ${path.name} (${path.id}@${path.revision}; ${path.selection})`);
  lines.push(`Serves Why: ${path.servesWhy}`);
  lines.push(`Central unknown: ${path.centralUnknown}`);
  lines.push(`Practical fit: ${path.practicalFit}`);
  appendSources(lines, path.sources, projection);
}

function appendExactProject(
  lines: string[],
  project: CareerMap['projects'][number] | undefined,
  projection: BriefingProjection,
): void {
  if (!project) throw new CareerMapBriefingError();
  lines.push(`Project ${project.number}: ${project.title} (${project.id}@${project.revision}; ${project.agreementStatus}; ${project.workStatus})`);
  lines.push(`Outcome: ${project.outcome}`);
  lines.push(`Learning question: ${project.decisionQuestion}`);
  lines.push(`First step: ${project.firstStep}`);
  appendSources(lines, project.sources, projection);
}

function appendExactReflection(
  lines: string[],
  reflection: CareerMap['reflections'][number] | undefined,
): void {
  if (!reflection) throw new CareerMapBriefingError();
  lines.push(`Reflection: ${reflection.id}@${reflection.revision}; ${reflection.status}`);
  for (const evidence of currentReflectionEvidence(reflection)) {
    lines.push(`- ${evidence.signal}: ${evidence.observation} — ${evidence.interpretation}`);
  }
}

function appendExactReviewContext(
  lines: string[],
  map: CareerMap,
  review: NonNullable<MethodCheckpoint['review']>,
  projection: BriefingProjection,
): void {
  lines.push('## Exact basis-review context');
  lines.push(`Exact review target: ${review.targetKind} ${review.targetId}@${review.targetRevision}`);

  switch (review.targetKind) {
    case 'path-set': {
      const set = exactRevision(map.pathSets, review.targetId, review.targetRevision);
      if (!set) throw new CareerMapBriefingError();
      const why = exactRevision(map.foundation.whyRevisions, set.basisWhy.id, set.basisWhy.revision);
      if (!why) throw new CareerMapBriefingError();
      lines.push(`Direct Why basis: ${why.id}@${why.revision} — ${why.statement}`);
      lines.push(`Purpose Path set: ${set.id}@${set.revision}; ${set.status}`);
      for (const path of set.paths) appendExactPath(lines, path, projection);
      return;
    }
    case 'project': {
      const project = exactRevision(map.projects, review.targetId, review.targetRevision);
      if (!project) throw new CareerMapBriefingError();
      const path = pathByRevision(map, project.basisPath.id, project.basisPath.revision);
      if (!path) throw new CareerMapBriefingError();
      lines.push(`Direct Purpose Path basis: ${path.id}@${path.revision}`);
      appendExactPath(lines, path, projection);
      appendExactProject(lines, project, projection);
      return;
    }
    case 'reflection': {
      const reflection = exactRevision(map.reflections, review.targetId, review.targetRevision);
      if (!reflection) throw new CareerMapBriefingError();
      const project = exactRevision(map.projects, reflection.projectBasis.id, reflection.projectBasis.revision);
      if (!project) throw new CareerMapBriefingError();
      lines.push(`Direct project basis: ${project.id}@${project.revision}`);
      appendExactProject(lines, project, projection);
      appendExactReflection(lines, reflection);
      return;
    }
    case 'next-move': {
      const move = exactRevision(map.nextMoves, review.targetId, review.targetRevision);
      if (!move) throw new CareerMapBriefingError();
      const choice = exactRevision(map.continueChoices, move.continueChoiceBasis.id, move.continueChoiceBasis.revision);
      if (!choice) throw new CareerMapBriefingError();
      const reflection = exactRevision(map.reflections, choice.reflectionBasis.id, choice.reflectionBasis.revision);
      if (!reflection) throw new CareerMapBriefingError();
      lines.push(`Direct continue-choice basis: ${choice.id}@${choice.revision}; ${choice.wantsToContinue ? 'continue' : 'return to paths'}`);
      lines.push(`Next Move: ${move.kind} (${move.id}@${move.revision})`);
      appendExactReflection(lines, reflection);
      return;
    }
    case 'peer-exposure': {
      const peer = exactRevision(map.peerExposures, review.targetId, review.targetRevision);
      if (!peer) throw new CareerMapBriefingError();
      const path = pathByRevision(map, peer.basisPath.id, peer.basisPath.revision);
      if (!path) throw new CareerMapBriefingError();
      lines.push(`Direct Purpose Path basis: ${path.id}@${path.revision}`);
      appendExactPath(lines, path, projection);
      lines.push(`Peer exposure: ${peer.subjectKind}: ${peer.subject} (${peer.id}@${peer.revision}; ${peer.status}) — ${peer.insight}`);
      appendSources(lines, peer.sources, projection);
      return;
    }
    case 'commitment': {
      const intent = map.commitmentIntent?.id === review.targetId
        && map.commitmentIntent.revision === review.targetRevision
        ? map.commitmentIntent
        : undefined;
      const commitment = map.provisionalCommitment?.id === review.targetId
        && map.provisionalCommitment.revision === review.targetRevision
        ? map.provisionalCommitment
        : undefined;
      const target = commitment ?? intent;
      if (!target) throw new CareerMapBriefingError();
      const path = pathByRevision(map, target.basisPath.id, target.basisPath.revision);
      const move = exactRevision(map.nextMoves, target.basisNextMove.id, target.basisNextMove.revision);
      if (!path || !move) throw new CareerMapBriefingError();
      lines.push(`Direct Purpose Path basis: ${path.id}@${path.revision}`);
      lines.push(`Direct Next Move basis: ${move.id}@${move.revision}; ${move.kind}`);
      lines.push(`Commitment: ${target.id}@${target.revision}; ${target.status}`);
      return;
    }
    case 'proof': {
      const proof = exactRevision(map.proofRevisions, review.targetId, review.targetRevision);
      if (!proof || !map.provisionalCommitment
        || map.provisionalCommitment.id !== proof.basisCommitment.id
        || map.provisionalCommitment.revision !== proof.basisCommitment.revision) {
        throw new CareerMapBriefingError();
      }
      lines.push(`Direct commitment basis: ${proof.basisCommitment.id}@${proof.basisCommitment.revision}`);
      lines.push(`Proof: ${proof.id}@${proof.revision}; ${proof.status}`);
      lines.push(`Artifacts: ${proof.artifacts.join('; ') || 'none recorded'}`);
      lines.push(`Problems solved: ${proof.problemsSolved.join('; ') || 'none recorded'}`);
      return;
    }
    case 'side-door-set': {
      const set = exactRevision(map.sideDoorSets, review.targetId, review.targetRevision);
      if (!set) throw new CareerMapBriefingError();
      const proof = exactRevision(map.proofRevisions, set.basisProof.id, set.basisProof.revision);
      if (!proof) throw new CareerMapBriefingError();
      lines.push(`Direct proof basis: ${proof.id}@${proof.revision}`);
      lines.push(`Side Door set: ${set.id}@${set.revision}; ${set.status}`);
      for (const door of set.doors) {
        lines.push(`- ${door.name} (${door.id}@${door.revision}; ${door.selection}) — ${door.firstMove}`);
        appendSources(lines, door.sources, projection);
      }
      return;
    }
    case 'route-outcome': {
      const outcome = exactRevision(map.routeOutcomes, review.targetId, review.targetRevision);
      if (!outcome) throw new CareerMapBriefingError();
      const set = map.sideDoorSets.find((candidate) => candidate.doors.some(
        (door) => door.id === outcome.doorBasis.id && door.revision === outcome.doorBasis.revision,
      ));
      const door = set?.doors.find((candidate) => candidate.id === outcome.doorBasis.id
        && candidate.revision === outcome.doorBasis.revision);
      if (!set || !door) throw new CareerMapBriefingError();
      lines.push(`Direct Side Door basis: ${door.id}@${door.revision}; set ${set.id}@${set.revision}`);
      lines.push(`Route outcome: ${outcome.result} (${outcome.id}@${outcome.revision}) — ${outcome.learning}`);
      return;
    }
  }
}

function appendPath(
  lines: string[],
  map: CareerMap,
  includeAlternatives: boolean,
  projection: BriefingProjection,
): void {
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
    appendSources(lines, path.sources, projection);
  }
}

function appendProject(
  lines: string[],
  map: CareerMap,
  projection: BriefingProjection,
  selectedProject?: CareerMap['projects'][number],
): void {
  const suggested = map.projects.findLast((item) => item.agreementStatus === 'suggested');
  const project = selectedProject ?? suggested ?? selectLatestAcceptedProject(map);
  if (!project) return;
  lines.push('## Active Path Project');
  lines.push(`Project ${project.number}: ${project.title} (${project.id}@${project.revision}; ${project.agreementStatus}; ${project.workStatus})`);
  lines.push(`Path basis: ${project.basisPath.id}@${project.basisPath.revision}`);
  lines.push(`Outcome: ${project.outcome}`);
  lines.push(`Learning question: ${project.decisionQuestion}`);
  lines.push(`First step: ${project.firstStep}`);
  appendSources(lines, project.sources, projection);

  const options = map.projectOptionSets.findLast((set) => set.status === 'suggested');
  if (options) {
    lines.push('### Pending equal-weight Path Project options');
    for (const option of options.projects) {
      lines.push(`- ${option.title} (${option.id}@${option.revision}; ${option.selection}) — ${option.decisionQuestion}`);
      appendSources(lines, option.sources, projection);
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
  const currentProject = selectLatestAcceptedProject(map);
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

function appendProjectLearningEvidence(
  lines: string[],
  map: CareerMap,
  projection: BriefingProjection,
): void {
  const projects = map.projects
    .filter((project) => project.agreementStatus === 'accepted')
    .sort((left, right) => left.number - right.number);
  if (!projects.length) return;
  const reflections = latestReflectionRevisions(map);
  const reflectionsByProject = new Map<string, typeof reflections>();
  for (const reflection of reflections) {
    const key = JSON.stringify([reflection.projectBasis.id, reflection.projectBasis.revision]);
    const projectReflections = reflectionsByProject.get(key) ?? [];
    projectReflections.push(reflection);
    reflectionsByProject.set(key, projectReflections);
  }
  lines.push('## Accepted Path Project evidence for proof');
  for (const project of projects) {
    lines.push(`### Project ${project.number}: ${project.title} (${project.id}@${project.revision}; ${project.workStatus})`);
    lines.push(`Outcome: ${project.outcome}`);
    lines.push(`Learning question: ${project.decisionQuestion}`);
    appendSources(lines, project.sources, projection);
    const projectReflections = reflectionsByProject.get(JSON.stringify([project.id, project.revision])) ?? [];
    for (const reflection of projectReflections) {
      lines.push(`Reflection ${reflection.id}@${reflection.revision} (${reflection.status}):`);
      for (const evidence of currentReflectionEvidence(reflection)) {
        lines.push(`- ${evidence.signal}: ${evidence.observation} — ${evidence.interpretation}`);
      }
    }
  }
}

function appendPeers(lines: string[], map: CareerMap, projection: BriefingProjection): void {
  const path = selectActivePurposePath(map);
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
    appendSources(lines, peer.sources, projection);
  }
  if (map.commitmentIntent) {
    lines.push(`Commitment intent: ${map.commitmentIntent.status} (${map.commitmentIntent.id}@${map.commitmentIntent.revision})`);
  }
}

function appendSideDoors(lines: string[], map: CareerMap, projection: BriefingProjection): void {
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
    appendSources(lines, door.sources, projection);
  }
  const doorRevisions = new Set(set.doors.map((door) => `${door.id}@${door.revision}`));
  for (const outcome of map.routeOutcomes.filter(
    (item) => doorRevisions.has(`${item.doorBasis.id}@${item.doorBasis.revision}`),
  )) {
    lines.push(`Route outcome: ${outcome.result} for ${outcome.doorBasis.id}@${outcome.doorBasis.revision} — ${outcome.learning}`);
  }
}

function renderCareerMapBriefing(
  map: CareerMap,
  checkpoint: MethodCheckpoint,
  projection: BriefingProjection,
): string {
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
    appendExactReviewContext(lines, map, checkpoint.review, projection);
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
  if (checkpoint.module !== 'form-foundation') {
    appendPath(lines, map, includeAlternatives, projection);
  }

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
      appendProject(lines, map, projection);
      break;
    case 'interpret-path-project':
      {
        const relevant = reflectionAndProjectForCheckpoint(map, checkpoint);
        appendProject(lines, map, projection, relevant.project);
        appendReflection(lines, map, relevant.reflection);
      }
      break;
    case 'find-relevant-peers':
      appendProject(lines, map, projection);
      appendPeers(lines, map, projection);
      break;
    case 'enter-side-doors':
      appendProjectLearningEvidence(lines, map, projection);
      appendPeers(lines, map, projection);
      appendSideDoors(lines, map, projection);
      break;
  }

  return `${lines.join('\n\n')}\n`;
}

export function compileCareerMapBriefing(input: unknown): CareerMapBriefing {
  const parsed = careerMapSchema.safeParse(input);
  if (!parsed.success) throw new CareerMapBriefingError();
  const map = parsed.data;
  const checkpoint = deriveMethodCheckpoint(map);

  return {
    schemaVersion: map.schemaVersion,
    mapRevision: map.revision,
    module: checkpoint.module,
    pendingDecision: checkpoint.pendingDecision,
    markdown: renderCareerMapBriefing(map, checkpoint, 'canonical'),
    modelMarkdown: renderCareerMapBriefing(map, checkpoint, 'model'),
  };
}

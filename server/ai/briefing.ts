import {
  readCareerMap,
  deriveMethodCheckpoint,
  exactFirstProjectFramingReply,
  selectActivePurposePath,
  selectCurrentFoundationEvidence,
  selectCurrentRealityConstraints,
  selectCurrentProjectLearning,
  selectCurrentPathFocus,
  type CareerMap,
  type MethodCheckpoint,
  type PathProjectInput,
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

function appendWhy(lines: string[], map: CareerMap): void {
  const confirmed = map.foundation.whyRevisions.findLast((item) => item.status === 'confirmed');
  if (confirmed) {
    lines.push('## Your North Star');
    lines.push(`Basis: ${confirmed.id}@${confirmed.revision}`);
    lines.push(`Content to express as one direction: ${confirmed.statement} — ${confirmed.serves} — ${confirmed.pointOfView}`);
  }
  const suggested = map.foundation.whyRevisions.findLast((item) => item.status === 'suggested');
  if (suggested) {
    lines.push('## Your North Star');
    lines.push(`Basis: ${suggested.id}@${suggested.revision}`);
    lines.push(`Content to express as one direction: ${suggested.statement} — ${suggested.serves} — ${suggested.pointOfView}`);
    if (suggested.supersedesWhyId) {
      lines.push('Confirm only after a completed presentation disclosed the exact revise-why result classes and a later explorer message acknowledges that impact. Never infer classes from this briefing; after a failed presentation, use revise-why again.');
    }
  }
}

function appendFoundationContext(lines: string[], map: CareerMap, forPaths: boolean): void {
  lines.push(forPaths ? '## Current North Star evidence and reality boundary' : '## Current North Star evidence');
  for (const evidence of selectCurrentFoundationEvidence(map.foundation)) {
    lines.push(`- ${evidence.category}: ${evidence.content} (${evidence.id}@${evidence.revision})`);
  }
  for (const constraint of selectCurrentRealityConstraints(map.foundation)) {
    const label = forPaths ? constraint.kind : `Reality boundary — ${constraint.kind}`;
    lines.push(`- ${label}: ${constraint.description}`);
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
): void {
  if (!path) throw new CareerMapBriefingError();
  lines.push(`Purpose Path: ${path.name} (${path.id}@${path.revision}; ${path.selection})`);
  lines.push(`Serves North Star: ${path.servesWhy}`);
  if (path.possibility !== undefined) lines.push(`Possibility: ${path.possibility}`);
  lines.push(`Evidence: ${path.evidence.join('; ')}`);
  lines.push(`Central unknown: ${path.centralUnknown}`);
  lines.push(`Path Project preview: ${path.projectPreview}`);
  lines.push(`Practical fit: ${path.practicalFit}`);
}

function appendProjectBrief(lines: string[], project: PathProjectInput): void {
  lines.push(`Relationship to Purpose Path: ${project.relationship ?? 'linked'}`);
  if (project.relationship === 'unrelated') {
    lines.push('This project is intentionally unrelated to the selected path. Its path basis records historical selection context only. Its learning informs this project; do not infer a decision about that path or rewrite the North Star.');
  }
  if (project.outcome !== undefined) lines.push(`Outcome: ${project.outcome}`);
  if (project.audience !== undefined) lines.push(`Audience: ${project.audience}`);
  if (project.whyWanted !== undefined) lines.push(`Why wanted: ${project.whyWanted}`);
  lines.push(`Learning goal: ${project.learningGoal}`);
  lines.push(`First version: ${project.firstVersion}`);
  if (project.decisionQuestion !== undefined) lines.push(`Learning question: ${project.decisionQuestion}`);
  if (project.evidenceCue !== undefined) lines.push(`Evidence cue: ${project.evidenceCue}`);
  lines.push(`First step: ${project.firstStep}`);
}

function appendProjectWork(lines: string[], project: CareerMap['projects'][number]): void {
  if (!project.workUpdates.length) return;
  const latest = project.workUpdates.at(-1)!;
  lines.push(`Latest work update action: ${latest.action.actionId}; expected status: ${latest.status}. A correction must target this exact latest update.`);
  lines.push('Work updates reported by the explorer:');
  for (const update of project.workUpdates) {
    lines.push(`- ${update.status} (user turn ${update.action.turnSequence}; ${update.action.occurredAt})${update.reportedActivity ? `: ${JSON.stringify(update.reportedActivity)}` : ''}${update.correctsActionId ? `; corrects ${update.correctsActionId}` : ''}`);
  }
}

function appendExactProject(
  lines: string[],
  project: CareerMap['projects'][number] | undefined,
): void {
  if (!project) throw new CareerMapBriefingError();
  lines.push(`Project ${project.number}: ${project.title} (${project.id}@${project.revision}; ${project.agreementStatus}; ${project.workStatus})`);
  lines.push(`Path basis${project.relationship === 'unrelated' ? ' (historical context only)' : ''}: ${project.basisPath.id}@${project.basisPath.revision}`);
  if (project.proceedingReport) lines.push(project.proceedingReport.retractedBy
    ? 'The previous work-report proceeding was explicitly retracted; no prior assent is implied.'
    : `Proceeding from a current work report (user turn ${project.proceedingReport.action.turnSequence}); not evidence of earlier assent or presentation.`);
  appendProjectBrief(lines, project);
  appendProjectWork(lines, project);
  appendFirstProjectFraming(lines, project);
}

function appendFirstProjectFraming(
  lines: string[],
  project: CareerMap['projects'][number],
): void {
  const framing = project.acceptanceFraming;
  if (project.briefFormat === 'simple-v1' || (framing && !framing.acceptanceQuestion)) {
    if (!framing) lines.push('Project presentation: not yet delivered.');
    else if (framing.status === 'pending') {
      lines.push(`Project presentation: pending delivery in ${framing.assistantTurnId}.`);
      lines.push(`Project presentation text: ${JSON.stringify(framing.framingText)}`);
    }
    else lines.push(`Project presentation: delivered in ${framing.presentation!.assistantTurnId}. A later unambiguous semantic acceptance may accept; exact text matching is not required.`);
    return;
  }
  if (!framing) {
    lines.push('First-project framing: not yet presented.');
    return;
  }
  if (framing.status === 'pending') {
    lines.push(`First-project framing: pending delivery in this assistant turn (${framing.assistantTurnId}; locale ${framing.locale}).`);
    lines.push(`The complete visible reply must equal exactly: ${JSON.stringify(exactFirstProjectFramingReply({ ...framing, acceptanceQuestion: framing.acceptanceQuestion! }))}`);
    return;
  }
  lines.push(`First-project framing: delivered once in ${framing.presentation!.assistantTurnId}; locale ${framing.locale}. Do not repeat it.`);
  lines.push(`Acceptance reference copy: ${JSON.stringify(framing.acceptancePhrase)}. A later unambiguous semantic acceptance may accept; exact text matching is not required.`);
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
): void {
  lines.push('## Exact basis-review context');
  lines.push(`Exact review target: ${review.targetKind} ${review.targetId}@${review.targetRevision}`);

  switch (review.targetKind) {
    case 'path-set': {
      const set = exactRevision(map.pathSets, review.targetId, review.targetRevision);
      if (!set) throw new CareerMapBriefingError();
      const why = exactRevision(map.foundation.whyRevisions, set.basisWhy.id, set.basisWhy.revision);
      if (!why) throw new CareerMapBriefingError();
      lines.push(`Direct North Star basis: ${why.id}@${why.revision} — ${why.statement}`);
      lines.push(`Purpose Path set: ${set.id}@${set.revision}; ${set.status}`);
      for (const path of set.paths) appendExactPath(lines, path);
      return;
    }
    case 'project': {
      const project = exactRevision(map.projects, review.targetId, review.targetRevision);
      if (!project) throw new CareerMapBriefingError();
      const path = pathByRevision(map, project.basisPath.id, project.basisPath.revision);
      if (!path) throw new CareerMapBriefingError();
      lines.push(`Direct Purpose Path basis: ${path.id}@${path.revision}`);
      appendExactPath(lines, path);
      appendExactProject(lines, project);
      return;
    }
    case 'reflection': {
      const reflection = exactRevision(map.reflections, review.targetId, review.targetRevision);
      if (!reflection) throw new CareerMapBriefingError();
      const project = exactRevision(map.projects, reflection.projectBasis.id, reflection.projectBasis.revision);
      if (!project) throw new CareerMapBriefingError();
      lines.push(`Direct project basis: ${project.id}@${project.revision}`);
      appendExactProject(lines, project);
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
      appendExactPath(lines, path);
      lines.push(`Peer exposure: ${peer.subjectKind}: ${peer.subject} (${peer.id}@${peer.revision}; ${peer.status}) — ${peer.insight}`);
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
): void {
  const set = map.pathSets.findLast((item) => item.status === 'suggested')
    ?? map.pathSets.findLast((item) => item.status === 'active');
  if (!set) return;
  lines.push('## Purpose Path context');
  lines.push(`Set: ${set.id}@${set.revision}; North Star basis: ${set.basisWhy.id}@${set.basisWhy.revision}`);
  const paths = includeAlternatives
    ? set.paths
    : set.paths.filter((path) => path.selection === 'active');
  for (const path of paths) {
    lines.push(`### ${path.name} (${path.id}@${path.revision}; ${path.selection})`);
    lines.push(`Serves North Star: ${path.servesWhy}`);
    if (path.possibility !== undefined) lines.push(`Possibility: ${path.possibility}`);
    lines.push(`Evidence: ${path.evidence.join('; ')}`);
    lines.push(`Central unknown: ${path.centralUnknown}`);
    lines.push(`Path Project preview: ${path.projectPreview}`);
    lines.push(`Practical fit: ${path.practicalFit}`);
  }
}

function appendProject(
  lines: string[],
  map: CareerMap,
  selectedProject?: CareerMap['projects'][number],
): void {
  const suggested = map.projects.findLast((item) => item.agreementStatus === 'suggested');
  const project = selectedProject ?? suggested ?? selectCurrentProjectLearning(map).project;
  if (project) {
    lines.push('## Active Path Project');
    appendExactProject(lines, project);
    const alternatives = map.projects.filter(item => item.id !== project.id || item.revision !== project.revision);
    if (alternatives.length) {
      lines.push('Other saved project versions (identity references only; do not silently activate or attach their work to the current brief):');
      for (const item of alternatives) lines.push(`- ${JSON.stringify(item.title)}: ${item.id}@${item.revision}; ${item.agreementStatus}; ${item.workStatus}`);
    }
  }

  const options = map.projectOptionSets.findLast((set) => set.status === 'suggested');
  if (options) {
    lines.push('### Pending equal-weight Path Project options');
    lines.push(`Set: ${options.id}@${options.revision}; project number ${options.projectNumber}; historical path context ${options.basisPath.id}@${options.basisPath.revision}`);
    if (options.basisNextMove) lines.push(`Project decision basis: Next Move ${options.basisNextMove.id}@${options.basisNextMove.revision}`);
    if (options.basisAction) lines.push(`Project decision basis: explorer action ${options.basisAction.sourceId}; user turn ${options.basisAction.action.turnSequence}`);
    for (const option of options.projects) {
      lines.push(`#### ${option.title} (${option.id}@${option.revision}; ${option.selection}; equal weight)`);
      appendProjectBrief(lines, option);
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
  if (choice) lines.push(`Continue choice: ${choice.wantsToContinue ? 'continue' : 'return to paths'} (${choice.id}@${choice.revision}; scope ${choice.scope ?? 'path'}; reflection basis ${choice.reflectionBasis.id}@${choice.reflectionBasis.revision})`);
  const move = choice
    ? map.nextMoves.findLast(
      (item) => item.continueChoiceBasis.id === choice.id
        && item.continueChoiceBasis.revision === choice.revision,
    )
    : undefined;
  if (move) lines.push(`Next Move: ${move.kind} (${move.id}@${move.revision}); continue-choice basis ${move.continueChoiceBasis.id}@${move.continueChoiceBasis.revision}; scope ${choice!.scope ?? 'path'}`);
}

function reflectionAndProjectForCheckpoint(
  map: CareerMap,
  checkpoint: MethodCheckpoint,
): {
  reflection?: CareerMap['reflections'][number];
  project?: CareerMap['projects'][number];
} {
  const reflections = latestReflectionRevisions(map);
  const currentProject = selectCurrentProjectLearning(map).project;
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
    appendProjectBrief(lines, project);
    appendProjectWork(lines, project);
    const projectReflections = reflectionsByProject.get(JSON.stringify([project.id, project.revision])) ?? [];
    for (const reflection of projectReflections) {
      lines.push(`Reflection ${reflection.id}@${reflection.revision} (${reflection.status}):`);
      for (const evidence of currentReflectionEvidence(reflection)) {
        lines.push(`- ${evidence.signal}: ${evidence.observation} — ${evidence.interpretation}`);
      }
    }
  }
}

function appendPeers(lines: string[], map: CareerMap): void {
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
    appendExactReviewContext(lines, map, checkpoint.review);
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
    appendPath(lines, map, includeAlternatives);
  }

  const pathFocus = selectCurrentPathFocus(map);
  if (pathFocus && checkpoint.module !== 'form-foundation') {
    lines.push('## Current path focus');
    lines.push(`${pathFocus.id}@${pathFocus.revision}; path ${pathFocus.basisPath.id}@${pathFocus.basisPath.revision}; chosen in user turn ${pathFocus.action.turnSequence}`);
    lines.push('This focus records the explorer’s current wish to pursue this path. Guidance, further projects, reflection and changes of direction remain available.');
  }

  switch (checkpoint.module) {
    case 'form-foundation': {
      appendFoundationContext(lines, map, false);
      break;
    }
    case 'create-purpose-paths':
      appendFoundationContext(lines, map, true);
      break;
    case 'design-path-project':
    case 'guide-path-project': {
      appendFoundationContext(lines, map, true);
      appendProject(lines, map);
      const relevant = reflectionAndProjectForCheckpoint(map, checkpoint);
      appendReflection(lines, map, relevant.reflection);
      break;
    }
    case 'interpret-path-project':
      {
        appendFoundationContext(lines, map, true);
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

  return `${lines.join('\n\n')}\n`;
}

export function compileCareerMapBriefing(input: unknown): CareerMapBriefing {
  let map: CareerMap;
  try {
    map = readCareerMap(input);
  } catch {
    throw new CareerMapBriefingError();
  }
  const checkpoint = deriveMethodCheckpoint(map);
  const markdown = renderCareerMapBriefing(map, checkpoint);

  return {
    schemaVersion: map.schemaVersion,
    mapRevision: map.revision,
    module: checkpoint.module,
    pendingDecision: checkpoint.pendingDecision,
    markdown,
    modelMarkdown: markdown,
  };
}

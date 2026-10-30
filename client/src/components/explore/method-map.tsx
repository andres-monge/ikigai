import {
  deriveMethodCheckpoint,
  selectCurrentFoundationEvidence,
  selectCurrentRealityConstraints,
  selectCurrentProjectLearning,
  selectCurrentPathFocus,
  selectActivePurposePath,
  type CareerMap,
  type MethodModule,
} from '@shared/career-map';
import { humanizeStatus, PurposePathCard } from './purpose-path-card';
import { projectBriefSections } from './project-brief';

interface MethodMapProps {
  map: CareerMap;
}

const moduleLabels: Record<MethodModule, string> = {
  'form-foundation': 'Form Your North Star',
  'create-purpose-paths': 'Create Purpose Paths',
  'design-path-project': 'Design a Path Project',
  'guide-path-project': 'Guide a Path Project',
  'find-relevant-peers': 'Find Relevant Peers',
  'interpret-path-project': 'Interpret a Path Project and Next Move',
  'enter-side-doors': 'Enter Through Side Doors',
};

function SelectionLabel({ selection }: { selection: 'available' | 'active' | 'parked' }) {
  return (
    <span className="inline-block border border-black bg-white px-2 py-1 text-xs font-black uppercase tracking-[0.08em] text-black">
      {humanizeStatus(selection)}
    </span>
  );
}

function CheckpointSummary({ map }: { map: CareerMap }) {
  const checkpoint = deriveMethodCheckpoint(map);
  return (
    <section data-testid="method-checkpoint" className="border-2 border-black bg-black p-5 text-white shadow-[4px_4px_0_rgba(77,182,172,0.8)]">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#ffc107]">Current focus</p>
      <h2 className="mt-2 font-display text-2xl font-black">{moduleLabels[checkpoint.module]}</h2>
    </section>
  );
}


function ProjectCard({
  project,
}: {
  project: CareerMap['projects'][number] | CareerMap['projectOptionSets'][number]['projects'][number];
}) {
  return (
    <article data-testid="path-project-card" className="min-w-0 break-words border-2 border-black bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-xl font-black">{project.title}</h3>
        {'selection' in project ? <SelectionLabel selection={project.selection} /> : null}
      </div>
      {'workStatus' in project ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-extrabold uppercase tracking-[0.08em]">
          {project.proceedingReport && !project.proceedingReport.retractedBy && !project.confirmation
            ? <p>Proceeding from reported work</p>
            : <p>Agreement: {humanizeStatus(project.agreementStatus)}</p>}
          <p>Work: {humanizeStatus(project.workStatus)}</p>
        </div>
      ) : null}
      {'workUpdates' in project && project.workUpdates.at(-1)?.reportedActivity ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{project.workUpdates.at(-1)!.reportedActivity}</p>
      ) : null}
      {project.relationship === 'unrelated' ? (
        <p className="mt-3 text-sm leading-6">Intentionally unrelated to your current Purpose Path.</p>
      ) : null}
      <dl className="mt-4 space-y-4 text-sm leading-6">
        {projectBriefSections(project).map(({ label, text }) => (
          <div key={label}><dt className="method-map-label">{label}</dt><dd className="mt-1 whitespace-pre-wrap">{text}</dd></div>
        ))}
      </dl>
      {!project.briefFormat ? (
        <details className="mt-4 border-t border-slate-300 pt-3">
          <summary className="cursor-pointer text-sm font-bold">Inspect legacy project details</summary>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="method-map-label">Outcome</dt><dd>{project.outcome}</dd></div>
            <div><dt className="method-map-label">Audience</dt><dd>{project.audience}</dd></div>
            <div><dt className="method-map-label">Why this is wanted</dt><dd>{project.whyWanted}</dd></div>
            <div><dt className="method-map-label">Decision question</dt><dd>{project.decisionQuestion}</dd></div>
            <div><dt className="method-map-label">Evidence to notice</dt><dd>{project.evidenceCue}</dd></div>
          </dl>
        </details>
      ) : null}
    </article>
  );
}

function CurrentLearningState({ map, showLearning }: MethodMapProps & { showLearning: boolean }) {
  const { reflection, choice, move: savedMove } = showLearning ? selectCurrentProjectLearning(map) : {};
  const focus = selectCurrentPathFocus(map);
  const move = savedMove?.kind === 'commit-provisionally' && !focus ? undefined : savedMove;
  const focusedPath = focus && map.pathSets.flatMap((set) => set.paths)
    .find((path) => path.id === focus.basisPath.id && path.revision === focus.basisPath.revision);
  return (
    <div className="space-y-5">
      {focus ? (
        <section data-testid="current-path-focus" className="border-2 border-black bg-white p-5">
          <h2 className="text-xl font-black">Focusing on {focusedPath?.name ?? focus.basisPath.id}</h2>
          <p className="mt-2 text-sm leading-6">Keep learning through projects, get help with your work, or reconsider your direction in the chat.</p>
        </section>
      ) : null}
      {reflection ? <ReflectionCard reflection={reflection} current /> : null}
      {move ? (
        <section className="border-2 border-black bg-white p-5">
          <h2 className="text-xl font-black">Your next direction</h2>
          <p className="mt-2 text-sm leading-6">
            {move.kind === 'explore-further' ? 'Explore further with another project.' : null}
            {move.kind === 'commit-provisionally' ? 'You chose to focus on this path and keep learning.' : null}
            {move.kind === 'return-to-paths' ? 'You chose to return to Purpose Paths.' : null}
          </p>
        </section>
      ) : choice ? (
        <section className="border-2 border-black bg-white p-5">
          <h2 className="text-xl font-black">Your learning decision</h2>
          <p className="mt-2 text-sm leading-6">
            {choice.wantsToContinue
              ? `You said you want to continue ${choice.scope === 'project' ? 'this project' : 'exploring this path'}.`
              : `You said you do not want to continue ${choice.scope === 'project' ? 'this project' : 'down this path'}.`}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function ReflectionCard({ reflection, current = false }: { reflection: CareerMap['reflections'][number]; current?: boolean }) {
  return (
    <details data-testid={current ? 'current-project-learning' : undefined} className="border-2 border-black bg-white p-5" open={current && reflection.status === 'open'}>
      <summary className="cursor-pointer font-display text-lg font-black">What You Learned · {reflection.status}</summary>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
        {reflection.evidence.map((item) => <li key={`${item.id}-${item.revision}`}>{item.observation} — {item.interpretation}</li>)}
      </ul>
    </details>
  );
}

function HistoricalMethodState({ map }: MethodMapProps) {
  const routeOutcomes = map.routeOutcomes;
  const pathName = (id: string, revision: number) => map.pathSets
    .flatMap((set) => set.paths)
    .find((path) => path.id === id && path.revision === revision)?.name ?? id;
  const moveName = (id: string, revision: number) => {
    const move = map.nextMoves.find((item) => item.id === id && item.revision === revision);
    return move ? humanizeStatus(move.kind) : id;
  };
  if (!map.peerExposures.length && !map.proofRevisions.length && !map.sideDoorSets.length
    && !routeOutcomes.length && !map.commitmentIntent && !map.provisionalCommitment) return null;
  return (
    <details data-testid="historical-method-records" className="border-2 border-black bg-white p-5">
      <summary className="cursor-pointer font-display text-lg font-black">Historical records · read-only</summary>
      <p className="mt-3 text-sm leading-6">Saved peer, commitment, proof and route history.</p>
      <div className="mt-4 space-y-5">
      {map.peerExposures.map((peer) => (
        <section key={`${peer.id}-${peer.revision}`} className="border-2 border-black bg-white p-5">
          <h2 className="text-xl font-black">Relevant peer insight · {humanizeStatus(peer.status)}</h2>
          <p className="mt-2 text-sm leading-6"><strong>{peer.subject}:</strong> {peer.insight}</p>
        </section>
      ))}
      {map.commitmentIntent ? (
        <section data-testid="commitment-intent" className="border-2 border-black bg-white p-5">
          <p className="method-map-label">Commitment intent · {humanizeStatus(map.commitmentIntent.status)}</p>
          <h2 className="text-xl font-black">Historical commitment intent</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="method-map-label">Purpose Path</dt><dd>{pathName(map.commitmentIntent.basisPath.id, map.commitmentIntent.basisPath.revision)}</dd></div>
            <div><dt className="method-map-label">Next Move</dt><dd>{moveName(map.commitmentIntent.basisNextMove.id, map.commitmentIntent.basisNextMove.revision)}</dd></div>
          </dl>
        </section>
      ) : null}
      {map.provisionalCommitment ? (
        <section data-testid="provisional-commitment" className="border-2 border-black bg-[#dff3f1] p-5">
          <p className="method-map-label">Provisional commitment · {humanizeStatus(map.provisionalCommitment.status)}</p>
          <h2 className="text-xl font-black">Committed provisionally</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="method-map-label">Purpose Path</dt><dd>{pathName(map.provisionalCommitment.basisPath.id, map.provisionalCommitment.basisPath.revision)}</dd></div>
            <div><dt className="method-map-label">Next Move</dt><dd>{moveName(map.provisionalCommitment.basisNextMove.id, map.provisionalCommitment.basisNextMove.revision)}</dd></div>
            <div>
              <dt className="method-map-label">Peer exposure</dt>
              <dd>{map.peerExposures.find((item) => (
                item.id === map.provisionalCommitment?.basisPeerExposure.id
                && item.revision === map.provisionalCommitment.basisPeerExposure.revision
              ))?.subject ?? map.provisionalCommitment.basisPeerExposure.id}</dd>
            </div>
          </dl>
        </section>
      ) : null}
      {map.proofRevisions.map((proof) => (
        <details key={`${proof.id}-${proof.revision}`} className="border-2 border-black bg-white p-5">
          <summary className="cursor-pointer font-display text-lg font-black">Proof inventory · {proof.status}</summary>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <p><strong>Artifacts:</strong> {proof.artifacts.join(' · ') || 'None recorded'}</p>
            <p><strong>Problems solved:</strong> {proof.problemsSolved.join(' · ') || 'None recorded'}</p>
            <p><strong>People helped:</strong> {proof.peopleHelped.join(' · ') || 'None recorded'}</p>
            <p><strong>Useful qualities:</strong> {proof.usefulQualities.join(' · ') || 'None recorded'}</p>
            <p><strong>Knowledge:</strong> {proof.knowledge.join(' · ') || 'None recorded'}</p>
            <p><strong>Relationships:</strong> {proof.relationships.join(' · ') || 'None recorded'}</p>
            <p><strong>Points of view:</strong> {proof.pointsOfView.join(' · ') || 'None recorded'}</p>
            <p><strong>Shareable:</strong> {proof.shareableMaterial.join(' · ') || 'None recorded'}</p>
          </div>
        </details>
      ))}
      {map.sideDoorSets.map((doors) => (
        <section key={`${doors.id}-${doors.revision}`}>
          <h2 className="text-xl font-black">Historical Side Doors · {humanizeStatus(doors.status)}</h2>
          <p className="mt-1 text-sm text-stone-600">Saved routes, shown without ranking.</p>
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {doors.doors.map((door) => (
              <article data-testid="side-door-card" key={`${door.id}-${door.revision}`} className="min-w-0 break-words border-2 border-black bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
                <h3 className="text-lg font-black">{door.name}</h3>
                <p className="mt-2 text-sm"><strong>Who or what:</strong> {door.target}</p>
                <p className="mt-2 text-sm"><strong>Proof value:</strong> {door.proofValue}</p>
                <p className="mt-2 text-sm"><strong>Your useful contribution:</strong> {door.contribution}</p>
                <p className="mt-2 text-sm"><strong>Smallest credible move:</strong> {door.firstMove}</p>
                <p className="mt-2 text-sm"><strong>Access constraints:</strong> {door.accessConstraints.join(' · ')}</p>
                <div className="mt-3"><SelectionLabel selection={door.selection} /></div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {routeOutcomes.length > 0 ? (
        <details className="border-2 border-black bg-white p-5">
          <summary className="cursor-pointer font-display text-lg font-black">Route outcomes</summary>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
            {routeOutcomes.map((outcome) => (
              <li key={`${outcome.id}-${outcome.revision}`}><strong>{outcome.result.replaceAll('-', ' ')}:</strong> {outcome.learning}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs font-bold">Only explorer-reported outcomes appear here. Revelio does not send outreach.</p>
        </details>
      ) : null}
      </div>
    </details>
  );
}

export function MethodMap({ map }: MethodMapProps) {
  const currentEvidence = selectCurrentFoundationEvidence(map.foundation);
  const currentConstraints = selectCurrentRealityConstraints(map.foundation);
  const why = map.foundation.whyRevisions.findLast((item) => item.status !== 'superseded');
  const confirmedWhy = map.foundation.whyRevisions.findLast((item) => item.status === 'confirmed');
  const displayedPathSet = map.pathSets.findLast((item) => item.status !== 'superseded');
  const pathSetMatchesConfirmedWhy = !!displayedPathSet && !!confirmedWhy
    && displayedPathSet.basisWhy.id === confirmedWhy.id
    && displayedPathSet.basisWhy.revision === confirmedWhy.revision;
  const currentLearning = selectCurrentProjectLearning(map);
  const activePath = selectActivePurposePath(map);
  const hasCurrentBasis = (basis: { id: string; revision: number }) => pathSetMatchesConfirmedWhy
    && activePath?.id === basis.id && activePath.revision === basis.revision;
  const showLearning = !!currentLearning.project && hasCurrentBasis(currentLearning.project.basisPath);
  const activeProject = map.projects.findLast((item) => (
    item.agreementStatus === 'suggested' || item === currentLearning.project
  ) && hasCurrentBasis(item.basisPath));
  const historicalProjects = map.projects.filter((project) => project !== activeProject);
  const historicalReflections = map.reflections.filter((reflection) => (!showLearning || reflection !== currentLearning.reflection));
  const optionSet = map.projectOptionSets.findLast((item) => item.status === 'suggested' && hasCurrentBasis(item.basisPath));
  const historicalOptions = map.projectOptionSets.filter((set) => set !== optionSet);
  const historicalChoices = map.continueChoices.filter((choice) => !showLearning || choice !== currentLearning.choice);
  const currentFocus = selectCurrentPathFocus(map);
  const historicalMoves = map.nextMoves.filter((move) => !showLearning || move !== currentLearning.move
    || (move.kind === 'commit-provisionally' && !currentFocus));
  const historicalFocus = map.pathFocusCommitments.filter((focus) => focus !== currentFocus);
  const hasState = currentEvidence.length > 0 || currentConstraints.length > 0
    || why || displayedPathSet || activeProject || optionSet
    || map.reflections.length || map.proofRevisions.length || map.sideDoorSets.length
    || map.commitmentIntent || map.provisionalCommitment || map.pathFocusCommitments.length
    || map.projects.length || map.projectOptionSets.length || map.peerExposures.length || map.routeOutcomes.length;

  if (!hasState) {
    return (
      <section className="max-w-2xl border-2 border-dashed border-black bg-white/70 p-6 sm:p-8">
        <h2 className="font-display text-2xl font-black">Nothing on your map yet</h2>
        <p className="mt-3 text-sm leading-6 text-stone-700">
          This is the record of what you and Revelio work out together: what pulls you in, why it matters to
          you, the directions worth trying, and the project you take on first. Nothing lands here until you’ve
          confirmed it, so you can change your mind in the chat at any point.
        </p>
      </section>
    );
  }

  return (
    <div className="min-w-0 break-words">
      <CheckpointSummary map={map} />
      <div className="mt-8 space-y-8">
      {why ? (
        <section className="max-w-3xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
          <h2 className="text-2xl font-black">Your North Star</h2>
          <p className="mt-3 text-lg font-medium leading-7">{why.statement}</p>
        </section>
      ) : null}

      {displayedPathSet ? (
        <section aria-labelledby="purpose-paths-heading">
          <h2 id="purpose-paths-heading" className="text-3xl font-black">Purpose Paths</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            {!pathSetMatchesConfirmedWhy
              ? 'These paths were created for your previous North Star and are awaiting review.'
              : why?.id !== confirmedWhy?.id || why?.revision !== confirmedWhy?.revision
                ? 'These paths serve your confirmed North Star. A suggested revision may change them.'
                : displayedPathSet.status === 'active'
                  ? 'Your active path and parked alternatives, shown without ranking.'
                  : 'Three equal ways to serve your North Star, shown without ranking.'}
          </p>
          <div className="purpose-path-comparison mt-5">
            <div className="method-path-grid">
              {displayedPathSet.paths.map((path, index) => (
                <PurposePathCard
                  key={`${path.id}-${path.revision}`}
                  path={path}
                  index={index}
                  hasDevelopedProject={map.projects.some((project) => (
                    project.basisPath.id === path.id && project.basisPath.revision === path.revision
                  ))}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {activeProject ? (
        <section aria-labelledby="active-project-heading">
          <p className="method-map-label">
            {activeProject.agreementStatus === 'suggested'
              ? 'One proposal for collaborative refinement'
              : activeProject.proceedingReport && !activeProject.proceedingReport.retractedBy && !activeProject.confirmation
                ? 'Current firsthand experiment'
                : 'Accepted firsthand experiment'}
          </p>
          <h2 id="active-project-heading" className="text-2xl font-black">{activeProject.number === 1 ? 'First Path Project' : `Path Project ${activeProject.number}`}</h2>
          <div className="mt-4">
            <ProjectCard project={activeProject} />
          </div>
        </section>
      ) : null}

      {optionSet ? (
        <section aria-labelledby="follow-on-heading">
          <p className="method-map-label">Exactly three equal choices after a completed loop</p>
          <h2 id="follow-on-heading" className="text-2xl font-black">Path Project {optionSet.projectNumber}</h2>
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {optionSet.projects.map((project) => <ProjectCard key={`${project.id}-${project.revision}`} project={project} />)}
          </div>
        </section>
      ) : null}

        <CurrentLearningState map={map} showLearning={showLearning} />
        {historicalProjects.length || historicalReflections.length || historicalOptions.length || historicalChoices.length || historicalMoves.length || historicalFocus.length ? (
          <details className="border-2 border-black bg-white p-5">
            <summary className="cursor-pointer font-display text-lg font-black">Earlier projects and learning · read-only</summary>
            <div className="mt-4 space-y-5">
              {historicalProjects.map((project) => <ProjectCard key={`${project.id}-${project.revision}`} project={project} />)}
              {historicalReflections.map((reflection) => <ReflectionCard key={`${reflection.id}-${reflection.revision}`} reflection={reflection} />)}
              {historicalOptions.map((set) => (
                <section key={`${set.id}-${set.revision}`}>
                  <h3 className="font-bold">Project {set.projectNumber} options · {humanizeStatus(set.status)}</h3>
                  <div className="mt-4 grid gap-4 xl:grid-cols-3">
                    {set.projects.map((project) => <ProjectCard key={`${project.id}-${project.revision}`} project={project} />)}
                  </div>
                </section>
              ))}
              {historicalChoices.map((choice) => <p key={`${choice.id}-${choice.revision}`} className="text-sm">Earlier continue choice: {choice.wantsToContinue ? 'Yes' : 'No'} · {choice.scope ?? 'path'}</p>)}
              {historicalMoves.map((move) => <p key={`${move.id}-${move.revision}`} className="text-sm">{humanizeStatus(move.kind)}</p>)}
              {historicalFocus.map((focus) => <p key={`${focus.id}-${focus.revision}`} className="text-sm">Earlier path focus: {map.pathSets.flatMap((set) => set.paths).find((path) => path.id === focus.basisPath.id && path.revision === focus.basisPath.revision)?.name ?? focus.basisPath.id}</p>)}
            </div>
          </details>
        ) : null}
        <HistoricalMethodState map={map} />
      </div>
    </div>
  );
}

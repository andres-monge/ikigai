import {
  deriveMethodCheckpoint,
  selectCurrentFoundationEvidence,
  selectCurrentRealityConstraints,
  type CareerMap,
  type MethodModule,
  type PendingDecision,
} from '@shared/career-map';
import { humanizeStatus, PurposePathCard } from './purpose-path-card';

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

const decisionLabels: Record<PendingDecision['kind'], string> = {
  'why-confirmation': 'Confirm your North Star',
  'path-selection': 'Choose a Purpose Path',
  'path-revision-confirmation': 'Confirm the revised Purpose Paths',
  'first-project-confirmation': 'Accept the first Path Project',
  'project-revision-confirmation': 'Confirm the revised Path Project',
  'follow-on-project-selection': 'Choose the next Path Project',
  'continue-choice': 'Decide whether you want to continue',
  'next-move': 'Choose your Next Move',
  'peer-insight-confirmation': 'Confirm the peer insight',
  'commitment-completion': 'Complete the provisional commitment',
  'proof-confirmation': 'Confirm the proof inventory',
  'side-door-selection': 'Choose a Side Door',
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
      <p className="mt-2 text-sm font-semibold">
        {checkpoint.pendingDecision
          ? `Pending decision: ${decisionLabels[checkpoint.pendingDecision.kind]}`
          : checkpoint.review
            ? `Review needed: ${humanizeStatus(checkpoint.review.targetKind)}`
            : checkpoint.focus
              ? `Focused review: ${humanizeStatus(checkpoint.focus.kind)}`
              : 'No formal decision is pending.'}
      </p>
    </section>
  );
}


function ProjectCard({
  project,
  compact = false,
}: {
  project: CareerMap['projects'][number] | CareerMap['projectOptionSets'][number]['projects'][number];
  compact?: boolean;
}) {
  return (
    <article data-testid="path-project-card" className="border-2 border-black bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-xl font-black">{project.title}</h3>
        {'selection' in project ? <SelectionLabel selection={project.selection} /> : null}
      </div>
      {'workStatus' in project ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-extrabold uppercase tracking-[0.08em]">
          <p>Agreement: {humanizeStatus(project.agreementStatus)}</p>
          <p>Work: {humanizeStatus(project.workStatus)}</p>
        </div>
      ) : null}
      <p className="mt-3 text-sm leading-6">{project.outcome}</p>
      <details className="mt-4 border-t border-slate-300 pt-3" open={!compact}>
        <summary className="cursor-pointer text-sm font-bold">Inspect project details</summary>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="method-map-label">Audience</dt><dd>{project.audience}</dd></div>
          <div><dt className="method-map-label">Why this is wanted</dt><dd>{project.whyWanted}</dd></div>
          <div><dt className="method-map-label">Learning goal</dt><dd>{project.learningGoal}</dd></div>
          <div><dt className="method-map-label">First version</dt><dd>{project.firstVersion}</dd></div>
          <div><dt className="method-map-label">First step</dt><dd>{project.firstStep}</dd></div>
          <div><dt className="method-map-label">Decision question</dt><dd>{project.decisionQuestion}</dd></div>
          <div><dt className="method-map-label">Evidence to notice</dt><dd>{project.evidenceCue}</dd></div>
        </dl>
      </details>
    </article>
  );
}

function LaterMethodState({ map }: MethodMapProps) {
  const reflection = map.reflections.at(-1);
  const continueChoice = reflection
    ? map.continueChoices.find((item) => (
      item.reflectionBasis.id === reflection.id
      && item.reflectionBasis.revision === reflection.revision
    ))
    : undefined;
  const nextMove = continueChoice
    ? map.nextMoves.find((item) => (
      item.continueChoiceBasis.id === continueChoice.id
      && item.continueChoiceBasis.revision === continueChoice.revision
    ))
    : undefined;
  const peer = map.peerExposures.findLast((item) => item.status !== 'superseded');
  const proof = map.proofRevisions.findLast((item) => item.status !== 'superseded');
  const doors = map.sideDoorSets.findLast((item) => item.status !== 'superseded');
  const routeOutcomes = map.routeOutcomes;
  const pathName = (id: string, revision: number) => map.pathSets
    .flatMap((set) => set.paths)
    .find((path) => path.id === id && path.revision === revision)?.name ?? id;
  const moveName = (id: string, revision: number) => {
    const move = map.nextMoves.find((item) => item.id === id && item.revision === revision);
    return move ? humanizeStatus(move.kind) : id;
  };
  return (
    <div className="space-y-5">
      {reflection ? (
        <details className="border-2 border-black bg-white p-5" open={reflection.status === 'open'}>
          <summary className="cursor-pointer font-display text-lg font-black">What You Learned · {reflection.status}</summary>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
            {reflection.evidence.map((item) => <li key={`${item.id}-${item.revision}`}>{item.observation} — {item.interpretation}</li>)}
          </ul>
        </details>
      ) : null}
      {nextMove ? (
        <section className="border-2 border-black bg-white p-5">
          <h2 className="text-xl font-black">Next Move</h2>
          <p className="mt-2 text-sm leading-6">
            {nextMove.kind === 'explore-further' ? 'Explore further with another Path Project.' : null}
            {nextMove.kind === 'commit-provisionally' ? 'Commit provisionally and begin Side Doors.' : null}
            {nextMove.kind === 'return-to-paths' ? 'Return to Purpose Paths.' : null}
          </p>
        </section>
      ) : null}
      {continueChoice && !nextMove ? (
        <section className="border-2 border-black bg-white p-5">
          <h2 className="text-xl font-black">Choose your Next Move</h2>
          <p className="mt-2 text-sm leading-6">
            {continueChoice.wantsToContinue
              ? 'You said you want to continue. Choose one formal next step.'
              : 'You said you do not want to continue down this path.'}
          </p>
        </section>
      ) : null}
      {peer ? (
        <section className="border-2 border-black bg-white p-5">
          <h2 className="text-xl font-black">Relevant peer insight</h2>
          <p className="mt-2 text-sm leading-6"><strong>{peer.subject}:</strong> {peer.insight}</p>
        </section>
      ) : null}
      {map.commitmentIntent ? (
        <section data-testid="commitment-intent" className="border-2 border-black bg-white p-5">
          <p className="method-map-label">Commitment intent · {humanizeStatus(map.commitmentIntent.status)}</p>
          <h2 className="text-xl font-black">Provisional commitment is in progress</h2>
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
      {proof ? (
        <details className="border-2 border-black bg-white p-5">
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
      ) : null}
      {doors ? (
        <section>
          <h2 className="text-xl font-black">Side Doors</h2>
          <p className="mt-1 text-sm text-stone-600">Three routes, shown without ranking. Revelio never sends outreach.</p>
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {doors.doors.map((door) => (
              <article data-testid="side-door-card" key={`${door.id}-${door.revision}`} className="border-2 border-black bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
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
      ) : null}
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
  const activeProject = map.projects.findLast((item) => (
    item.agreementStatus === 'suggested' || item.agreementStatus === 'accepted'
  ) && pathSetMatchesConfirmedWhy && displayedPathSet?.paths.some((path) => (
    path.id === item.basisPath.id && path.revision === item.basisPath.revision
  )));
  const optionSet = map.projectOptionSets.findLast((item) => item.status !== 'superseded');
  const hasState = currentEvidence.length > 0 || currentConstraints.length > 0
    || why || displayedPathSet || activeProject || optionSet
    || map.reflections.length || map.proofRevisions.length || map.sideDoorSets.length
    || map.commitmentIntent || map.provisionalCommitment;

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
    <div className="min-w-0">
      <CheckpointSummary map={map} />
      <div className="mt-8 space-y-8">
      {!why && (currentEvidence.length > 0 || currentConstraints.length > 0) ? (
        <section className="max-w-3xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
          <p className="method-map-label">Your North Star in progress</p>
          <h2 className="text-2xl font-black">What we know so far</h2>
          {currentEvidence.length > 0 ? (
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
              {currentEvidence.map((item) => <li key={`${item.id}-${item.revision}`}>{item.content}</li>)}
            </ul>
          ) : null}
          {currentConstraints.length > 0 ? (
            <p className="mt-4 text-sm"><strong>Practical reality:</strong> {currentConstraints.map((item) => item.description).join(' · ')}</p>
          ) : null}
        </section>
      ) : null}
      {why ? (
        <section className="max-w-3xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
          <h2 className="text-2xl font-black">Your North Star</h2>
          <p className="mt-3 text-lg font-medium leading-7">{why.statement}</p>
          <div className="mt-4 border-t border-slate-300 pt-3">
            <p className="mt-3 text-sm"><strong>Point of view:</strong> {why.pointOfView}</p>
            {currentEvidence.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {currentEvidence.map((item) => <li key={`${item.id}-${item.revision}`}>{item.content}</li>)}
              </ul>
            ) : null}
            {currentConstraints.length > 0 ? (
              <p className="mt-3 text-sm"><strong>Practical reality:</strong> {currentConstraints.map((item) => item.description).join(' · ')}</p>
            ) : null}
          </div>
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
              : 'Accepted firsthand experiment'}
          </p>
          <h2 id="active-project-heading" className="text-2xl font-black">{activeProject.number === 1 ? 'First Path Project' : `Path Project ${activeProject.number}`}</h2>
          <div className="mt-4">
            <ProjectCard project={activeProject} compact={activeProject.agreementStatus === 'accepted'} />
          </div>
        </section>
      ) : null}

      {optionSet ? (
        <section aria-labelledby="follow-on-heading">
          <p className="method-map-label">Exactly three equal choices after a completed loop</p>
          <h2 id="follow-on-heading" className="text-2xl font-black">Path Project {optionSet.projectNumber}</h2>
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {optionSet.projects.map((project) => <ProjectCard key={`${project.id}-${project.revision}`} project={project} compact />)}
          </div>
        </section>
      ) : null}

        <LaterMethodState map={map} />
      </div>
    </div>
  );
}

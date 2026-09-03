import {
  deriveMethodCheckpoint,
  selectActivePurposePath,
  type CareerMap,
  type CareerMapOperationType,
  type MethodModule,
  type PendingDecision,
  type PurposePath,
} from '@shared/career-map';

export interface DeterministicOperationRequest {
  type: CareerMapOperationType;
  input: Record<string, unknown>;
}

interface MethodMapProps {
  map: CareerMap;
  busy: boolean;
  onOperation: (operation: DeterministicOperationRequest) => void;
  onConversationPrompt: (prompt: string) => void;
}

const pathStyles = [
  { header: 'bg-[#4db6ac]', project: 'bg-[#dff3f1]' },
  { header: 'bg-[#ffc107]', project: 'bg-[#fff4cc]' },
  { header: 'bg-[#ff6b35]', project: 'bg-[#ffe1d6]' },
] as const;

const buttonClass = 'min-h-11 border-2 border-black bg-white px-3 py-2 font-display text-xs font-black shadow-[2px_2px_0_rgba(0,0,0,0.65)] transition-[transform,box-shadow] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-wait disabled:opacity-50';

const moduleLabels: Record<MethodModule, string> = {
  'form-foundation': 'Form the Foundation',
  'create-purpose-paths': 'Create Purpose Paths',
  'design-path-project': 'Design a Path Project',
  'guide-path-project': 'Guide a Path Project',
  'find-relevant-peers': 'Find Relevant Peers',
  'interpret-path-project': 'Interpret a Path Project and Next Move',
  'enter-side-doors': 'Enter Through Side Doors',
};

const decisionLabels: Record<PendingDecision['kind'], string> = {
  'why-confirmation': 'Confirm your Why I Work',
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

function humanizeStatus(status: string): string {
  return status.replaceAll('-', ' ').replace(/^./u, (first) => first.toUpperCase());
}

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
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#ffc107]">Current Method focus</p>
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

function EvidenceList({ values }: { values: string[] }) {
  return <p className="text-sm leading-6">{values.join(' · ')}</p>;
}

function ConversationButton({
  children,
  prompt,
  disabled,
  onConversationPrompt,
  label,
}: {
  children: string;
  prompt: string;
  disabled: boolean;
  onConversationPrompt: (prompt: string) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={buttonClass}
      disabled={disabled}
      aria-label={label}
      onClick={() => onConversationPrompt(prompt)}
    >
      {children}
    </button>
  );
}

function PurposePathCard({
  path,
  index,
  set,
  hasActivePath,
  busy,
  onOperation,
  onConversationPrompt,
}: {
  path: PurposePath;
  index: number;
  set: CareerMap['pathSets'][number];
  hasActivePath: boolean;
  busy: boolean;
  onOperation: MethodMapProps['onOperation'];
  onConversationPrompt: MethodMapProps['onConversationPrompt'];
}) {
  const style = pathStyles[index];
  const selectable = set.status === 'suggested';
  return (
    <article
      data-testid="purpose-path-card"
      className="method-path-card border-2 border-black bg-white shadow-[6px_6px_0_rgba(0,0,0,0.65)]"
    >
      <header className={`border-b-2 border-black p-5 ${style.header}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-block bg-black px-2 py-1 font-display text-xs font-black uppercase tracking-[0.1em] text-white">
            Path {String(index + 1).padStart(2, '0')}
          </span>
          <SelectionLabel selection={path.selection} />
        </div>
        <h3 className="mt-3 text-xl font-black leading-tight">{path.name}</h3>
        <p className="mt-2 text-sm font-semibold leading-6">{path.servesWhy}</p>
      </header>
      <section className="method-path-band">
        <h4 className="method-map-label">What could become possible</h4>
        <p className="text-sm leading-6">{path.possibility}</p>
      </section>
      <section className="method-path-band">
        <h4 className="method-map-label">Evidence it may fit</h4>
        <EvidenceList values={path.evidence} />
      </section>
      <section className="method-path-band border-y-2 !border-black bg-ikigai-cream">
        <h4 className="method-map-label !text-black">The central unknown</h4>
        <p className="font-display text-lg font-extrabold leading-6">{path.centralUnknown}</p>
      </section>
      <section className={`method-path-band border-y-2 !border-black ${style.project}`}>
        <h4 className="method-map-label !text-black">First project</h4>
        <p className="text-sm leading-6">{path.projectPreview}</p>
      </section>
      <section className="method-path-band">
        <h4 className="method-map-label">How it could fit your life</h4>
        <p className="text-sm leading-6">{path.practicalFit}</p>
      </section>
      <footer className="method-path-band flex flex-wrap items-end gap-2">
        {selectable ? (
          <button
            type="button"
            disabled={busy}
            className={`${buttonClass} ${style.header}`}
            aria-label={`Start path ${index + 1}: ${path.name}`}
            onClick={() => {
              const sourceMessageId = crypto.randomUUID();
              onOperation({
                type: hasActivePath
                  ? 'confirm-purpose-path-revision'
                  : 'select-purpose-path',
                input: {
                  setId: set.id,
                  setRevision: set.revision,
                  pathId: path.id,
                  pathRevision: path.revision,
                  presentedInTurnId: set.presentation.assistantTurnId,
                  sourceMessageId,
                },
              });
            }}
          >
            Start this path
          </button>
        ) : null}
        <ConversationButton
          disabled={busy}
          label={`Rewrite path ${index + 1}: ${path.name}`}
          prompt={`I want to rewrite only “${path.name}” while keeping the other two paths unchanged. Nothing should be selected yet.`}
          onConversationPrompt={onConversationPrompt}
        >
          Rewrite
        </ConversationButton>
        <ConversationButton
          disabled={busy}
          label={`Replace path ${index + 1}: ${path.name}`}
          prompt={`Please replace only “${path.name}” with a meaningfully distinct path. Keep the other two unchanged and do not select anything.`}
          onConversationPrompt={onConversationPrompt}
        >
          Replace
        </ConversationButton>
      </footer>
    </article>
  );
}

function PurposePathContext({
  path,
  busy,
  onConversationPrompt,
  actions = false,
}: {
  path: PurposePath;
  busy: boolean;
  onConversationPrompt: MethodMapProps['onConversationPrompt'];
  actions?: boolean;
}) {
  return (
    <article data-testid={`purpose-path-${path.selection}`} className="border-2 border-black bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black">{path.name}</h3>
          <p className="mt-2 text-sm font-semibold leading-6">{path.servesWhy}</p>
        </div>
        <SelectionLabel selection={path.selection} />
      </div>
      <details className="mt-4 border-t border-slate-300 pt-3">
        <summary className="cursor-pointer text-sm font-bold">Inspect this Purpose Path</summary>
        <div className="mt-3 space-y-3 text-sm leading-6">
          <p><strong>What could become possible:</strong> {path.possibility}</p>
          <p><strong>Evidence it may fit:</strong> {path.evidence.join(' · ')}</p>
          <p><strong>Central unknown:</strong> {path.centralUnknown}</p>
          <p><strong>First project:</strong> {path.projectPreview}</p>
          <p><strong>Practical fit:</strong> {path.practicalFit}</p>
        </div>
      </details>
      {actions ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <ConversationButton
            disabled={busy}
            prompt={`I want to revise “${path.name}” without confirming a new version yet.`}
            onConversationPrompt={onConversationPrompt}
          >
            Revise this path
          </ConversationButton>
          <ConversationButton
            disabled={busy}
            prompt={`Please replace “${path.name}” with a meaningfully distinct path without selecting anything yet.`}
            onConversationPrompt={onConversationPrompt}
          >
            Replace this path
          </ConversationButton>
        </div>
      ) : null}
    </article>
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

function LaterMethodState({
  map,
  busy,
  onConversationPrompt,
}: Pick<MethodMapProps, 'map' | 'busy' | 'onConversationPrompt'>) {
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
          <div className="mt-4 flex flex-wrap gap-2">
            {continueChoice.wantsToContinue ? (
              <>
                <ConversationButton
                  disabled={busy}
                  prompt="I want to explore further with another Path Project."
                  onConversationPrompt={onConversationPrompt}
                >
                  Explore further
                </ConversationButton>
                <ConversationButton
                  disabled={busy}
                  prompt="I want to commit provisionally to this Purpose Path and begin Side Doors."
                  onConversationPrompt={onConversationPrompt}
                >
                  Commit provisionally
                </ConversationButton>
              </>
            ) : (
              <ConversationButton
                disabled={busy}
                prompt="I want to return to Purpose Paths."
                onConversationPrompt={onConversationPrompt}
              >
                Return to Purpose Paths
              </ConversationButton>
            )}
          </div>
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
          <p className="mt-1 text-sm text-slate-600">Three routes, shown without ranking. Revelio never sends outreach.</p>
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

export function MethodMap({ map, busy, onOperation, onConversationPrompt }: MethodMapProps) {
  const why = map.foundation.whyRevisions.findLast((item) => item.status !== 'superseded');
  const suggestedPathSet = map.pathSets.findLast((item) => item.status === 'suggested');
  const activePathSet = map.pathSets.findLast((item) => item.status === 'active');
  const activePath = selectActivePurposePath(map);
  const parkedPaths = activePathSet?.paths.filter((path) => path.selection === 'parked') ?? [];
  const activeProject = map.projects.findLast((item) => (
    item.agreementStatus === 'suggested' || item.agreementStatus === 'accepted'
  ));
  const optionSet = map.projectOptionSets.findLast((item) => item.status !== 'superseded');
  const hasState = why || suggestedPathSet || activePath || activeProject || optionSet
    || map.reflections.length || map.proofRevisions.length || map.sideDoorSets.length
    || map.commitmentIntent || map.provisionalCommitment;

  if (!hasState) {
    return (
      <div className="space-y-8">
        <CheckpointSummary map={map} />
        <section className="border-2 border-dashed border-black bg-white/60 p-8 text-center">
          <h2 className="text-2xl font-black">Your map will take shape here</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
            Start in the conversation. Only validated Method state appears in this panel.
          </p>
        </section>
      </div>
    );
  }

  return (
    <fieldset
      disabled={busy}
      aria-busy={busy}
      aria-describedby={busy ? 'method-actions-disabled-reason' : undefined}
      className="m-0 min-w-0 border-0 p-0"
    >
      <legend className="sr-only">Method workspace</legend>
      <CheckpointSummary map={map} />
      {busy ? (
        <p id="method-actions-disabled-reason" role="status" className="mb-5 mt-5 border-l-4 border-amber-700 bg-amber-50 px-3 py-2 text-sm font-bold">
          Method actions are unavailable until the current turn finishes and the latest map is loaded.
        </p>
      ) : null}
      <div className="mt-8 space-y-8">
      {why ? (
        <section className="max-w-3xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
          <p className="method-map-label">{why.status === 'confirmed' ? 'Confirmed foundation' : 'Suggested foundation'}</p>
          <h2 className="text-2xl font-black">Why You Work</h2>
          <p className="mt-3 text-lg font-medium leading-7">{why.statement}</p>
          <p className="mt-2 text-sm text-slate-600">{why.serves}</p>
          <details className="mt-4 border-t border-slate-300 pt-3">
            <summary className="cursor-pointer text-sm font-bold">Inspect the Foundation</summary>
            <p className="mt-3 text-sm"><strong>Point of view:</strong> {why.pointOfView}</p>
            {map.foundation.evidence.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {map.foundation.evidence.map((item) => <li key={`${item.id}-${item.revision}`}>{item.content}</li>)}
              </ul>
            ) : null}
            {map.foundation.constraints.length > 0 ? (
              <p className="mt-3 text-sm"><strong>Practical reality:</strong> {map.foundation.constraints.map((item) => item.description).join(' · ')}</p>
            ) : null}
          </details>
          <div className="mt-4 flex flex-wrap gap-2">
            {why.status === 'suggested' ? (
              <button
                type="button"
                className={`${buttonClass} bg-[#4db6ac]`}
                disabled={busy}
                onClick={() => {
                  const sourceMessageId = crypto.randomUUID();
                  onOperation({
                    type: 'confirm-why',
                    input: {
                      whyId: why.id,
                      whyRevision: why.revision,
                      presentedInTurnId: why.presentation.assistantTurnId,
                      sourceMessageId,
                    },
                  });
                }}
              >
                Confirm this Why
              </button>
            ) : null}
            <ConversationButton disabled={busy} prompt="I want to revise my Why without confirming a new version yet." onConversationPrompt={onConversationPrompt}>
              Revise this Why
            </ConversationButton>
          </div>
        </section>
      ) : null}

      {activePath ? (
        <section aria-labelledby="active-purpose-path-heading">
          <p className="method-map-label">Current Purpose Path context</p>
          <h2 id="active-purpose-path-heading" className="text-2xl font-black">Your active Purpose Path</h2>
          <div className="mt-4">
            <PurposePathContext
              path={activePath}
              busy={busy}
              onConversationPrompt={onConversationPrompt}
              actions
            />
          </div>
          {parkedPaths.length > 0 ? (
            <details className="mt-4 border-2 border-black bg-white p-4">
              <summary className="cursor-pointer font-display text-base font-black">
                Parked Purpose Paths ({parkedPaths.length})
              </summary>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {parkedPaths.map((path) => (
                  <PurposePathContext
                    key={`${path.id}-${path.revision}`}
                    path={path}
                    busy={busy}
                    onConversationPrompt={onConversationPrompt}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {suggestedPathSet ? (
        <section aria-labelledby="purpose-paths-heading">
          <h2 id="purpose-paths-heading" className="text-3xl font-black">Three ways to serve that</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Each path is a different way of working, not a ranking. Read all three before choosing or changing one.
          </p>
          <div className="method-path-grid mt-5">
            {suggestedPathSet.paths.map((path, index) => (
              <PurposePathCard
                key={`${path.id}-${path.revision}`}
                path={path}
                index={index}
                set={suggestedPathSet}
                hasActivePath={Boolean(activePath)}
                busy={busy}
                onOperation={onOperation}
                onConversationPrompt={onConversationPrompt}
              />
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 border-2 border-black bg-white p-4 shadow-[4px_4px_0_rgba(0,0,0,0.65)]">
            <p className="min-w-[16rem] flex-1 text-sm">Rewriting, replacing, or combining confirms and activates nothing.</p>
            <ConversationButton disabled={busy} prompt="I want to combine two of these Purpose Paths. Ask me which two, then keep the set at exactly three distinct options without selecting one." onConversationPrompt={onConversationPrompt}>
              Combine two paths
            </ConversationButton>
            <ConversationButton disabled={busy} prompt="I have questions about these Purpose Paths before I choose." onConversationPrompt={onConversationPrompt}>
              Ask about these paths
            </ConversationButton>
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
          <div className="mt-4 flex flex-wrap gap-2">
            {activeProject.agreementStatus === 'suggested' ? (
              <ConversationButton disabled={busy} prompt={`I want to accept “${activeProject.title}” as my ${activeProject.number === 1 ? 'first ' : ''}Path Project.`} onConversationPrompt={onConversationPrompt}>Accept this project</ConversationButton>
            ) : null}
            <ConversationButton disabled={busy} prompt={`Please refine “${activeProject.title}” without treating the revision as accepted.`} onConversationPrompt={onConversationPrompt}>Refine</ConversationButton>
            {activeProject.agreementStatus === 'suggested' && activeProject.number === 1 ? (
              <ConversationButton disabled={busy} prompt="This first project does not convince me. Please replace it with one completely new proposal, keeping the same project number." onConversationPrompt={onConversationPrompt}>Suggest something different</ConversationButton>
            ) : null}
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

        <LaterMethodState map={map} busy={busy} onConversationPrompt={onConversationPrompt} />
      </div>
    </fieldset>
  );
}

import type { CareerMapOperationType } from '@shared/career-map';

export type InteractionOwner = 'deterministic-ui' | 'conversation-only';

export interface InteractionOwnership {
  owner: InteractionOwner;
  affordance: string;
  reason: string;
}

/**
 * Compile-time complete ownership for every canonical Career Map operation.
 * U6 connects only exact prior-presentation choices supported by U5. It does
 * not widen the U5 tool registry or pre-implement U7–U9 operations.
 */
export const interactionOwnership = {
  'append-foundation-evidence': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'The explorer’s own words and context are the evidence payload.' },
  'correct-foundation-evidence': { owner: 'conversation-only', affordance: 'Revise this Why / chat', reason: 'A correction must identify the exact user-authored evidence and replacement text.' },
  'record-reality-constraint': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Constraints are explorer-authored facts, not inferred form values.' },
  'propose-why': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Revelio composes the provisional interpretation; the UI never invents canonical text.' },
  'revise-why': { owner: 'conversation-only', affordance: 'Revise this Why', reason: 'Revision is collaborative and remains Suggested until a later action.' },
  'confirm-why': { owner: 'deterministic-ui', affordance: 'Confirm this Why', reason: 'An exact, previously presented Suggested revision can be confirmed atomically.' },
  'propose-purpose-paths': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'The agent must produce a validated exact-three set grounded in the confirmed Why.' },
  'replace-purpose-path': { owner: 'conversation-only', affordance: 'Replace', reason: 'The UI names one path; the agent designs its replacement and atomically preserves exact three.' },
  'combine-purpose-paths': { owner: 'conversation-only', affordance: 'Combine two paths', reason: 'The agent clarifies the pair and creates a distinct third path atomically.' },
  'select-purpose-path': { owner: 'deterministic-ui', affordance: 'Start this path', reason: 'One exact member of a completed initial presentation can be selected directly.' },
  'confirm-purpose-path-revision': { owner: 'deterministic-ui', affordance: 'Start this path on a revised set', reason: 'A revised exact-three set still requires one explicit choice.' },
  'choose-parked-purpose-path': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'This post-loop branch belongs to U8; U6 renders it without widening U5 tools.' },
  'propose-first-project': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'The first project is one agent-designed proposal, not a UI template.' },
  'replace-project-proposal': { owner: 'conversation-only', affordance: 'Suggest something different', reason: 'The agent must replace rather than defend the singular proposal and keep its number.' },
  'accept-first-project': { owner: 'conversation-only', affordance: 'Accept this project', reason: 'U7 owns first-project acceptance; U6 prepares exact language without adding its missing endpoint tool.' },
  'propose-project-revision': { owner: 'conversation-only', affordance: 'Refine', reason: 'The agent designs the revision and keeps it Suggested.' },
  'confirm-project-revision': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U8 owns project-work lifecycle operations and their presentation handshake.' },
  'update-project-work-status': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Work status comes from the explorer’s report and is implemented with U8.' },
  'propose-follow-on-projects': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U8 creates exactly three options only after a completed loop.' },
  'replace-follow-on-project': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'The agent replaces one option while preserving the exact-three invariant in U8.' },
  'select-follow-on-project': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U8 owns explicit post-loop project selection; U6 only renders its canonical result.' },
  'open-reflection': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Reflection may open at any work status and needs the explorer’s context.' },
  'append-reflection-evidence': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Firsthand learning evidence must remain explorer-authored.' },
  'revise-reflection-evidence': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Corrections append lineage instead of editing rendered prose.' },
  'close-reflection': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U8 owns reflection completion and checkpoint re-derivation.' },
  'record-continue-choice': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Whether to continue is discussed before the two formal Next Move choices.' },
  'record-next-move': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U8 owns the exact explore-further or provisional-commitment branch.' },
  'open-peer-focus': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Peer exposure is introduced contextually, never as a forced menu.' },
  'record-peer-exposure': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'The agent may suggest a source, but cannot claim the explorer’s insight.' },
  'revise-peer-exposure': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Revising insight requires first-person context and lineage.' },
  'confirm-peer-exposure': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U8 owns explicit confirmation of the explorer’s decision-relevant insight.' },
  'defer-peer-exposure': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Deferral remains a natural conversation choice and leaves commitment pending.' },
  'complete-provisional-commitment': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U9 completes commitment only after qualifying confirmed exposure.' },
  'propose-proof-inventory': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U9 suggests proof from validated canonical history; unsupported proof stays absent.' },
  'revise-proof-inventory': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Proof correction requires agent re-synthesis and remains Suggested.' },
  'confirm-proof-inventory': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U9 owns the confirmation handshake before Side Doors.' },
  'propose-side-doors': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U9 researches exactly three credible routes or creates no padded set.' },
  'replace-side-door': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'The agent researches a credible replacement without ranking the other routes.' },
  'select-side-door': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'U9 owns explicit route activation; U6 renders active and parked state.' },
  'record-route-outcome': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Outcomes are explorer-reported; the product exposes no send or outreach capability.' },
  'open-foundation-revision-focus': { owner: 'conversation-only', affordance: 'Revise this Why', reason: 'A focus change is conversational and does not rewrite canonical state by itself.' },
  'open-path-revision-focus': { owner: 'conversation-only', affordance: 'Rewrite / Replace / Combine', reason: 'A focus change clarifies intent before any atomic path-set operation.' },
  'close-focus': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'The active module closes focus after the explorer finishes the detour.' },
  'resolve-basis-review': { owner: 'conversation-only', affordance: 'Chat composer', reason: 'Reaffirm, revise, or replace requires reviewing the invalidated basis with the explorer.' },
} as const satisfies Record<CareerMapOperationType, InteractionOwnership>;

export const connectedU5DeterministicOperations = [
  'confirm-why',
  'select-purpose-path',
  'confirm-purpose-path-revision',
] as const satisfies readonly CareerMapOperationType[];

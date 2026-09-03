# U6 deterministic Method presentation matrices

Authority: U6 of `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md`, the incorporated Method Product Contract, and `docs/thesis.md`.

The founder-selected Purpose Paths contract remains `docs/prototypes/revelio-purpose-paths/selected-single-view.html`. Connected U6 implements that selection; it does not reopen the prototype decision. The browser renders validated Career Map JSON and bounded display-safe conversation history. It never derives map state or persistence status by parsing assistant prose.

## Interaction-ownership matrix

`client/src/components/explore/interaction-ownership.ts` is the executable, compile-time-complete `Record<CareerMapOperationType, InteractionOwnership>`. Its focused test compares its keys to the shared operation schema, so adding an operation without assigning ownership fails the test.

“Conversation-only” is intentional ownership, not a missing generic form. It means the explorer initiates the change in chat because the payload needs their words, agent synthesis, contextual clarification, or a delivery unit after U6. The actual canonical write still goes through the narrow domain operation; prose is never parsed into state by the browser. U6 does not widen U5’s tool registry to pre-implement U7–U9.

| Canonical operation | U6 affordance | Owner | Reason |
|---|---|---|---|
| `append-foundation-evidence` | Chat composer | Conversation | Preserve exact explorer-authored evidence and context. |
| `correct-foundation-evidence` | Revise Why / chat | Conversation | Name the exact evidence and append a correction with lineage. |
| `record-reality-constraint` | Chat composer | Conversation | A practical constraint is an explorer-authored fact. |
| `propose-why` | Chat composer | Conversation | Revelio synthesizes a Suggested interpretation; the UI invents no canonical text. |
| `revise-why` | **Revise this Why** | Conversation | Collaboratively create a new Suggested revision without implicit confirmation. |
| `confirm-why` | **Confirm this Why** | Deterministic UI | Exact previously presented target and revision; connected through U5. |
| `propose-purpose-paths` | Chat composer | Conversation | Agent synthesis must satisfy exact-three, distinctness, and confirmed-Why grounding. |
| `replace-purpose-path` | **Replace** | Conversation | Names one path; Revelio designs one replacement while the reducer preserves exact three. |
| `combine-purpose-paths` | **Combine two paths** | Conversation | Clarify the pair and atomically supply a distinct third path. |
| `select-purpose-path` | **Start this path** | Deterministic UI | Select one exact member of the completed initial presentation; connected through U5. |
| `confirm-purpose-path-revision` | **Start this path** on a revised set | Deterministic UI | Explicitly choose one exact member of the completed revised presentation; connected through U5. |
| `choose-parked-purpose-path` | Chat composer | Conversation | Post-loop branch belongs to U8; U6 renders it without widening U5. |
| `propose-first-project` | Chat composer | Conversation | The first project is one thoughtful agent-designed proposal. |
| `replace-project-proposal` | **Suggest something different** | Conversation | Replace rather than defend; preserve the project number and singular presentation. |
| `accept-first-project` | **Accept this project** | Conversation | U7 owns the acceptance operation/tool; U6 prepares explicit language only. |
| `propose-project-revision` | **Refine** | Conversation | Agent designs a Suggested revision; no implicit acceptance. |
| `confirm-project-revision` | Chat composer | Conversation | U8 owns project-work lifecycle operations and handshake. |
| `update-project-work-status` | Chat composer | Conversation | Status comes from the explorer’s report at any supported work state. |
| `propose-follow-on-projects` | Chat composer | Conversation | U8 creates exactly three only after a completed learning loop. |
| `replace-follow-on-project` | Chat composer | Conversation | Replace one option while atomically preserving exact three. |
| `select-follow-on-project` | Chat composer | Conversation | U8 owns explicit post-loop selection; U6 renders canonical active/parked state. |
| `open-reflection` | Chat composer | Conversation | Reflection may open before, during, after stopping, or after completion. |
| `append-reflection-evidence` | Chat composer | Conversation | Firsthand learning remains explorer-authored. |
| `revise-reflection-evidence` | Chat composer | Conversation | Corrections append lineage rather than edit rendered prose. |
| `close-reflection` | Chat composer | Conversation | U8 re-derives the checkpoint after close. |
| `record-continue-choice` | Chat composer | Conversation | Discuss desire to continue before the formal Next Move branch. |
| `record-next-move` | Chat composer | Conversation | Formal options are explore further or commit provisionally; return-to-paths follows “do not continue.” |
| `open-peer-focus` | Chat composer | Conversation | Peer exposure is contextual, not a forced menu. |
| `record-peer-exposure` | Chat composer | Conversation | A source may be suggested, but only the explorer can supply the insight. |
| `revise-peer-exposure` | Chat composer | Conversation | Revise first-person insight with lineage. |
| `confirm-peer-exposure` | Chat composer | Conversation | U8 owns explicit confirmation of decision-relevant insight. |
| `defer-peer-exposure` | Chat composer | Conversation | Deferral leaves commitment pending and remains natural conversation. |
| `complete-provisional-commitment` | Chat composer | Conversation | U9 completes only after qualifying confirmed exposure. |
| `propose-proof-inventory` | Chat composer | Conversation | U9 suggests only proof supported by validated canonical history. |
| `revise-proof-inventory` | Chat composer | Conversation | Re-synthesis stays Suggested until a later confirmation. |
| `confirm-proof-inventory` | Chat composer | Conversation | U9 owns the proof handshake before routes. |
| `propose-side-doors` | Chat composer | Conversation | U9 researches exactly three credible routes or creates no padded set. |
| `replace-side-door` | Chat composer | Conversation | Research one credible replacement without ranking siblings. |
| `select-side-door` | Chat composer | Conversation | U9 owns explicit activation; U6 renders active and parked routes. |
| `record-route-outcome` | Chat composer | Conversation | Outcome is explorer-reported. No browser or agent control sends outreach. |
| `open-foundation-revision-focus` | **Revise this Why** | Conversation | Focus records intent; it does not rewrite state. |
| `open-path-revision-focus` | **Rewrite / Replace / Combine** | Conversation | Clarify intent before an atomic set operation. |
| `close-focus` | Chat composer | Conversation | The module closes the detour after explorer direction. |
| `resolve-basis-review` | Chat composer | Conversation | Reaffirm/revise/replace requires inspecting the invalidated basis. |

Direct U6 actions are `confirm-why`, `select-purpose-path`, and `confirm-purpose-path-revision`. They send the target id, target revision, completed assistant presentation id, one opaque operation id, one opaque client message id, and the current expected map revision to `/api/agent/workspace/operations`. The chat draft is independent and is never cleared by a workspace action.

## UI-state matrix

The “status” column is application-owned. Assistant text cannot populate it. Each operation attempt is keyed by turn/message/operation identity; only `Saving → one terminal` is accepted. Duplicate, crossed, late, and terminal-to-terminal events are ignored. `idempotent-replay` is displayed and announced as `Saved`.

| State | Visible status | Enabled actions | Draft | Focus destination | Recovery | Desktop / phone placement |
|---|---|---|---|---|---|---|
| Initial loading | “Loading your conversation…” and “Loading your map…” independently | Sign out; composer waits for bootstrap but remains editable | Preserved | Existing focus remains | Each read can fail or succeed independently | Split panels / active Chat tab with Your Map available |
| Empty bootstrap | Chat starting prompt; “Your map will take shape here” | Composer + microphone when supported | Preserved | Composer by normal tab order | Send the first message | Split / corresponding tab panels |
| Post-turn refetch | Last safe streamed content remains until bounded newest-page results arrive, then the persisted copy replaces it | Canonical controls disabled until the turn releases; draft editable | Preserved | Composer after chat turn; map heading after workspace action unless the explorer has returned to typing | Fetch newest history page and current map only; retain pages the explorer already loaded without traversing more | Same panel locations; inactive phone draft stays mounted |
| Operation Saving | `<role=status>` “{section}: Saving” | All canonical actions disabled; Stop is available for chat turn | Preserved | Current control/Stop | Await one correlated terminal; an ended stream with unresolved Saving becomes Failed | Above composer / Chat tab above composer |
| Saved | “Saved” announced, including idempotent replay | Re-enabled after terminal refetch | Preserved | Map heading after direct action; composer after chat | Bounded history + map refetch | Status in Chat; updated map alongside / in Your Map tab |
| Conflict / stale revision | “Conflict — refresh and try again” | Disabled during refetch, then derived from latest map | Preserved exactly | Map heading | Reload newest history + authoritative map; explorer retries intentionally | Status in Chat; recovery target in Map |
| Rejected validation | “Rejected — review the current state” | Disabled during refetch, then legal actions only | Preserved exactly | Map heading | Show authoritative map; no retry loop or invented fallback | Status in Chat; map target alongside / tab |
| Failed or unconfirmed write | “Failed — save not confirmed; review the latest map” | Re-enable after refetch | Preserved/restored only when the composer is still empty | Composer for chat; map heading for direct action unless the explorer resumed typing | Bound the recovery read, match the exact operation receipt, then refetch before an intentional retry | Status in Chat; authoritative map wins |
| Saved + reply failure | “Saved” remains plus “map was saved, follow-up reply failed” | Re-enable after refetch | Submitted text restored for optional retry/edit | Composer | Never regress Saved; refetch authoritative map/history | Status in Chat; saved map alongside / Map tab |
| Cancellation before commit | “Stopped”; any observed unresolved Saving terminalizes as Failed | Re-enable after terminal refetch | Submitted text restored only when the composer is still empty; a new draft is never overwritten | Composer | Refetch newest history + map | Partial reply may show Stopped in Chat; map unchanged |
| Cancellation after commit | Saved remains plus “Stopped after a saved change” | Re-enable after terminal refetch | Submitted text restored only when the composer is still empty; a new draft is never overwritten | Composer | Refetch; exact committed operation receipt wins and dedupes replay | Saved status in Chat; updated map alongside / Map tab |
| Ordinary research/provider failure | Reply failure only; no Saving for search/no-tool turns | Re-enable after refetch | Submitted text restored only when the composer is still empty; a new draft is never overwritten | Composer | Retry or continue; ordinary citations remain conversation-only in the live reply and bounded safe history | Chat only; map does not claim research state |
| Insufficient research results | Conversation explains that there is not enough credible material; no persistence status or padded canonical set | Composer remains available after refetch; no unavailable canonical choice is invented | Preserved/restored only when still empty | Composer | Refine the question, provide firsthand context, or try again later | Chat only; validated map remains unchanged |
| History fetch failure | “Conversation could not be loaded” | Retry history; map controls depend on map read | Preserved | Retry button | Retry bounded newest page; never infer empty | Chat / Chat tab |
| Map fetch failure | “Map could not be loaded” | Chat remains usable; canonical controls absent | Preserved | Retry button | Reload canonical map; never parse chat as fallback | Map / Your Map tab |
| Repair required | Alert: “Your map needs repair”; Method actions stopped | Chat for support/context and sign out; no canonical action | Preserved | Repair alert heading by navigation order | Contact support; fail closed | Map / Your Map tab |
| Older history available | “Load older messages” | Explicit older-page button | Preserved | Older-page button; newly prepended history follows | Fetch only the opaque cursor page and dedupe by message id | Chat / Chat tab |
| Microphone unsupported | Disabled “Microphone unavailable” | Text input and Send | Preserved | Composer | Type instead | Composer row in Chat |
| Permission denied / empty / transcription failed | Polite error/empty status; no text inserted | Text input and retry mic | Unchanged | Composer after success; current focus otherwise | Change permission, retry, or type | Composer row; survives phone tab switch |
| Recording / processing / success | “Stop recording” → “Transcribing…” → “Transcription added” | Stop while recording; mic disabled processing | Existing text retained; transcript appended with a space | Composer after insertion | Edit before Send | Composer row; same draft in both phone views |

## Workspace hierarchy and focus destinations

The derived Method checkpoint or pending decision is the first and highest-contrast map section. Confirmed Why, the active Purpose Path, and the current Path Project follow as compact context. Foundation evidence, parked paths, project details, proof, route outcomes, and older conversation pages stay behind explicit `details` or cursor controls. Suggested exact-three comparisons remain fully visible because comparing their equal-weight uncertainty, evidence, and practical fit is the current decision rather than historical context.

| Event | Focus or scroll destination |
|---|---|
| Why confirmation or Purpose Path selection | After the authoritative workspace refetch, focus the **Your Map** heading so the newly derived checkpoint is the next reading position. |
| Direct-action conflict, rejection, or unconfirmed save | After authoritative recovery, focus the **Your Map** heading; if the explorer resumed typing meanwhile, keep focus and scroll in the composer. |
| Reflection, interruption, or any conversation-owned Method action | After the terminal newest-history/map refetch, focus the composer so the explorer can continue; canonical reflection/checkpoint state remains in the map. |
| Chat cancellation before or after commit | After terminal refetch, focus the composer; the application-owned status explains whether the exact operation receipt was saved. |
| Mobile tab click | Reveal the chosen tabpanel without replacing its state; normal tab activation does not move focus away from the tab. |
| Mobile Arrow Left/Right/Home/End | Activate and focus the corresponding Chat or Your Map tab using the roving-tabindex pattern. |
| Conversation-only map action | Switch to Chat and focus the composer with a deterministic, editable prompt; nothing is confirmed or activated. |

## Option-set interaction semantics

| Surface | Revise / replace / request new | Accept / select | Cancel or discuss | Canonical selection effect |
|---|---|---|---|---|
| Purpose Paths | Rewrite, Replace, and Combine prepare explicit conversation text. A revision is a new Suggested exact-three set. | **Start this path** is direct for the exact completed presentation. | **Ask about these paths** stays conversational; leaving the draft unsent or stopping the turn changes no state. | Initial selection activates one and parks two; revised-set confirmation atomically replaces the active selection and parks its siblings. |
| First Path Project | **Refine** requests a Suggested revision; **Suggest something different** requests one replacement with the same project number. | **Accept this project** is explicitly conversation-owned until U7 adds that operation to the agent surface. | Discussion, an unsent draft, or Stop changes no agreement state. | Refinement never accepts the project or advances work status. |
| Follow-on Path Projects | Replacement and request-new stay conversation-owned because U8 owns the lifecycle operation. | Selection stays conversation-owned until U8; the renderer exposes canonical Available, Active, and Parked states. | Discussion or Stop changes no selection. | A later canonical selection activates exactly one and parks its siblings atomically. |
| Side Doors | Replacement/request-new stays conversation-owned because U9 owns research and route operations. | Selection stays conversation-owned until U9; the lightweight renderer exposes canonical Available, Active, and Parked states. | Discussion or Stop sends no outreach and changes no route selection. | A later canonical selection activates one and parks its siblings; refinement never selects a route. |

## Citation and outbound-safety contract

- Conversation text is rendered as inert text nodes, not Markdown HTML. Raw HTML, image syntax, SVG/data/JavaScript URLs, iframes, and event-handler strings cannot create DOM elements or initiate requests.
- Only server-normalized claim citations create anchors. The cited anchor is inserted immediately after the exact claim span both while streaming and after bounded history hydration.
- Anchors accept the shared canonical HTTPS shape and use `target="_blank"`, `rel="noopener noreferrer"`, and `referrerPolicy="no-referrer"`.
- Accessible names are `Source: <sanitized title>` or `Source: <normalized hostname>`. Repeated destinations remain individually named in claim context.
- The map renders canonical strings as text only. It exposes no send, publish, apply, message, image, iframe, generated HTML, or visualization capability.

## Automated and manual evidence boundary

Focused component tests cover exact-three/equal-weight rendering, no preselection/ranking, inert hostile content, adjacent live and hydrated citation handling, independent monotonic operation correlation, replay-as-Saved, exact-receipt recovery, abort terminalization, direct committed/replay/conflict/rejected operation states, stale-refresh exclusion, bounded history projection and paging preservation, Enter-to-send, mobile tab draft preservation, branch-specific Next Move choices, repair-required isolation, and microphone lifecycle/endpoint behavior.

Native elements provide keyboard buttons, textarea, links, `details/summary`, and labeled regions. The phone switcher implements the ARIA tab pattern with roving focus and Left/Right/Home/End keys. Operation and microphone messages use polite live regions; failures use alerts. Reduced-motion suppresses the selected contract’s staggered path entrance.

An actual assistive-technology reading pass and rendered desktop/phone visual inspection require a browser/screen-reader session. They must be reported as manual evidence only when performed; automated semantics are not a substitute for claiming that manual pass.

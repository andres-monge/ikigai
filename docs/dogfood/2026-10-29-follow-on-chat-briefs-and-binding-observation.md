# Follow-on Chat briefs and one binding observation — 2026-10-29

**DF-17 fixed and verified in `952023b`; DF-18 remains unresolved.** The approved U1 change attaches the canonical three follow-on briefs to their exact original final Chat item. The approved U2 capture observed one healthy help turn; it does not explain or retroactively pass the earlier failed selection.

## U1: show the choices where the agent asks the user to choose

Chat now consumes saved project option sets using their presentation provenance, deduplicates set revisions and reuses the existing plain-text brief renderer. Each option has the same title/three-field presentation and weight. The unrelated-project label remains supported. Selected/superseded history stays read-only at the original presenting turn. No prose parsing, selection button, operation, schema, Method instruction or new state framework was added.

The scoped review found one P2: multiple replacements within one presenting turn could show both an intermediate superseded set and its successor, producing six briefs. A schema-valid regression failed for both the same-host chain and earlier-host history control before the correction. The final filter removes only same-host supersession predecessors, retaining genuine earlier-turn presentations. The original review receipt is retained with a resolution record; no second review or peer ran.

## Verification

- Schema-valid missing-brief regression: three status cases failed against the old renderer, then passed with the change. An earlier fixture lacked its required action basis and was discarded as red evidence; the corrected fixture is schema-validated. A remount assertion was scoped to Chat to avoid matching the separately rendered Map.
- Final **74 focused UI checks pass**: 62 Explore and 12 Map. Same-turn replacement and different-turn history regressions pass. Existing first-project/path presentation remains covered.
- Final typecheck and build pass after the review fix and exact server-instrumentation removal. No lint command exists.
- One focused `ce-code-review` completed Ready with fixes; run `20261029-173516-c4887149`. Its sole admitted P2 is resolved and verified. One independent Claude Opus 5.5 pass was requested at low effort; actual model verified, actual effort unverified.
- Actual authenticated Chrome QA at 1280×900 and 390×844, both light/dark: exactly one option-set group with all three briefs, correct original host reply, equal presentation, no buttons, no narrow horizontal overflow. Reload retains identical full brief text, including the already-selected historical set. A final reload after the review fix confirms one set/three briefs again.

Private screenshots capture each viewport/theme and a taller review-only view containing all three briefs. The taller capture is not represented as standard desktop breakpoint proof. Original light theme, default viewport, Chat and empty composer were restored. The authenticated QA tab remains open.

## U2: exactly one approved ordinary help turn

Before sending, dedicated identity, revision 31, Accepted / Not started Project 2, empty draft and zero active leases were verified. The approved question asked how to compare two arrangements without buying anything. It was sent once. No progress report, new decision, selection replay or follow-up was added.

The first reply suggested keeping objects/wording fixed while changing placement, comparing a message in front of the materials versus beside the first-use item, using existing paper/objects and a folded stand without tape. It separated a personal comparison from evidence about newcomers and retained the energy-learning lens. The turn completed durably with **one provider step, zero tool calls and zero canonical operations**. Whole-request duration was **29,157 ms**, not normalized model latency.

Temporary local capture at the existing binding boundary recorded only fixed numeric metadata:

| Field | Observed value |
| --- | --- |
| Attempt | 1 |
| Provider read elapsed | 2,305 ms |
| Read status | 1 = page returned |
| Aborted | 0 |
| Expected markers | 1 |
| Returned items | 100 |
| Has more / cursor present | 1 / 1 |
| Match count by marker index | `[1]` |

The original five-attempt/five-second budget, unique-marker guard, abort/lease behavior and terminal-state rules were unchanged. Diagnostic logging could not change request outcomes. It recorded no IDs, hashes, content, URLs, tokens or provider objects and added no endpoint or retention system. Instrumentation was removed by restoring exact original server bytes/hash, then the main process was restarted without it **before** final build/review/commit. No diagnostic source is included in `952023b`.

**Inference limit:** this is one healthy current help-delivery observation with a single expected marker. The earlier failed selection involved two markers and its failed-attempt pages/timings were not captured. Its cause is still unknown. No timeout/visibility/pagination/duplicate cause, budget increase, relaxed filter, repair or retroactive success is justified.

## Integrity, serving state and handoff

The dedicated map remains revision 31 with 31 operation receipts. Only the one authorized completed help turn was added: 20→21 durable turns. All 20 prior turns, including the Failed selection, remain byte-equal. The selected project stays Accepted / Not started; original learning, old Completed project, North Star, paths, focus commitments and mapping are unchanged. All founder rows remain unchanged; zero active leases. Read-only UI QA added no writes.

Guarded restarts used fresh zero-lease and exact PID/cwd/command/listener checks, retaining existing environment/trace flags. Main serves c615 on 5173 without instrumentation; lab 5174 is unchanged. No founder profile access, signout, push, PR, deployment or heartbeat.

DF-17's presentation gate now passes. The previous overall live-loop verdict remains **QUALIFIED by DF-18**; one healthy help turn is not full reliability or overall founder acceptance. The scoped founder review below approves one actual follow-on presentation; the remaining options and broader MVP/U7/U10/erasure gates remain open.

Minimum next reliability step: keep DF-18 open and preserve its exact failed record. If further investigation is authorized, capture numeric per-attempt binding evidence during the next ordinary request/failure through the existing trace before selecting a cause-specific regression/fix. No further diagnostic variants, paid retries or speculative production correction are authorized by this receipt.

Private ignored `.context/revelio/loop-blockers-implementation-20261029/` retains full first help input/reply, numeric capture, restoration hashes, schema-valid red/green logs, review/resolution, account integrity and actual Chat screenshots/text. Account identities, historical answers and pixels are not copied into Git.

## Founder product review — 2026-10-30

After contextual review of all three sections of the actual QA follow-on **A Self-Serve Materials Spot**, the founder said: “i think this is a good project presentation, i wouldn't change anything”. This is **founder PASS for this example and its current three-section presentation**, with no change chosen.

DF-06's original preparation-scope bundling was already corrected. Its broader verbosity concern remains historical; this review does not authorize shortening, a Method/skill change or a UI rewrite. It does not automatically judge an unreviewed personal customer proposal, the other options or all proposal quality, and does not accept U7 or the full journey. DF-18 remains separate and unresolved.

This update records the coordinator-relayed founder decision only. No application change, new tests, model calls, duplicate review or heartbeat was performed.

For **DF-03**, the founder separately agreed to retain the repeated-discovery finding and observe whether it recurs in future testing. One occurrence is insufficient to establish an instruction, context or model cause. No instruction change or extra test/model run was requested, and no blocker classification beyond the observed impact is assumed.

## DF-07 source-based proposal — 2026-10-30

**Founder decision:** the distinction is clear enough: a path card describes a direction and its initial project idea; a separate current-project card shows the developed project and status. The founder does not expect the path's first-project idea to match every later project change. Only investigation of the stale current-status claim was approved; no implementation or model run is authorized.

After the DF-18 scoped review completed, read-only source inspection found:

- `shared/career-map/paths.ts:23` defines `projectPreview` as saved free text, with no structured project-status field. Inspection of the existing private founder snapshot locates the observed “has not been proposed” claim in that field, without copying personal content or identifiers here.
- `client/src/components/explore/purpose-path-card.tsx:55` labels the field **First project** and renders its saved text directly. There is no hardcoded “not proposed” status to remove. The same card is used for Chat path presentations and read-only Map.
- `shared/career-map/reducer.ts:558` saves a first project separately with an exact `basisPath` ID/revision and its own agreement/work status; replacement also preserves that basis. It does not rewrite the path preview.
- `client/src/components/explore/method-map.tsx:250` already matches current project records to the active path revision; its separate project card renders agreement/work status. Earlier projects and learning remain available read-only. This supports the founder's distinction rather than a synchronization repair.

**Proposed smallest correction, pending coordinator review:** label the saved preview **Initial project idea** in the shared card. When Map has a developed project on that exact path revision, add neutral context beside the preview: “Recorded with this path. See the project card for the developed brief and current status.” Derive that context from existing exact project/path references, without inspecting the preview's prose. Keep the original preview visible and unchanged; this makes any original status language explicitly historical rather than silently replacing it. Chat's original path presentation remains an initial idea without a live status annotation.

Expected implementation scope, only if approved: `purpose-path-card.tsx`, its existing tests, `method-map.tsx` and its existing tests. Verify the initial label, exact linked-project context, absent context for no project or another path revision, preserved preview text and read-only history. No tests were added or run for this proposal. If explicit historical context is insufficient, return for product review rather than parsing or rewriting saved sentences.

No schema, reducer, state machine, saved history, Method instruction, current-project content or Paths V6 redesign is proposed. DF-18 implementation remains separate; this investigation made no application changes, account/browser actions, model calls or restart. Heartbeat remains off.

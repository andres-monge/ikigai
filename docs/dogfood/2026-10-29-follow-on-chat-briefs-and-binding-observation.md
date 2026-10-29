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

DF-17's presentation gate now passes. The previous overall live-loop verdict remains **QUALIFIED by DF-18**; one healthy help turn is not full reliability or founder acceptance. Human review of the actual options and broader MVP/U7/U10/erasure gates remain open.

Minimum next reliability step: keep DF-18 open and preserve its exact failed record. If further investigation is authorized, capture numeric per-attempt binding evidence during the next ordinary request/failure through the existing trace before selecting a cause-specific regression/fix. No further diagnostic variants, paid retries or speculative production correction are authorized by this receipt.

Private ignored `.context/revelio/loop-blockers-implementation-20261029/` retains full first help input/reply, numeric capture, restoration hashes, schema-valid red/green logs, review/resolution, account integrity and actual Chat screenshots/text. Account identities, historical answers and pixels are not copied into Git.

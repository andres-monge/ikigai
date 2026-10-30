# Bounded binding repairs and first live probe — 2026-10-30

Subsequent decision: the admission-grace option below was approved and implemented in `033f8d7`. See [the final policy and single two-marker compatibility check](2026-10-30-binding-admission-grace.md). This receipt preserves the earlier probe's non-discriminating outcome and the proposal as it stood at that time.

**Two independently proven defects are corrected; DF-18's historical cause remains open.** The single approved live probe completed, but did not exercise the intended two-step tool loop. No further model request, retry, historical repair or timeout-policy change followed.

## Implemented and verified

- **`67ce173` (U1):** both terminal-binding closures use remaining attempts after existing typed retryable `ConversationHistoryProviderError`s. The five-attempt ceiling, shared five-second read window, 100 ms delays, 100-item page, non-retryable failure, cancellation and exact binding guards are unchanged. Numeric capture preserves each known HTTP error status and distinguishes a failed read from a returned page.
- **`3bbb4b1` (U2):** resolver and persisted-marker parsing/batching use the actual canonical 50-step agent limit. The constant moved minimally to `server/ai/limits.ts`, avoiding a low-level history dependency on the agent orchestrator; all repository consumers/imports were updated. String limits, uniqueness and exact matching remain strict. This corrects a supported-bound mismatch, **not the original two-marker failure**.
- Six route regressions failed before U1, then all eleven targeted controls passed. Three history checks failed before U2. Final **247 focused checks PASS**, including counterpart-matching oversized/duplicate input controls and historical 11-marker versus 31/30-marker batches. Retained direct projections cannot expose resolved server-context items.
- Credential-isolated `test:all`: **1,038 PASS, two existing bundle skips, 63 files**. Typecheck, build and whitespace checks PASS. A final focused run covers the subsequent test-only assertion strengthening. The owned disposable PostgreSQL cluster is stopped, with zero child test databases left. No test used the application database or provider credentials.
- Five simplification personas completed; the sole applied finding removed a moved explanatory comment. One focused `ce-code-review`, `20261030-170137-4d55b1d2`, completed **Ready to merge**, no findings. Correctness plus one native adversarial read; no external paid peer, extra roster or validator. Original review is retained privately; no duplicate review ran.

## Single approved live request: preserve the non-discriminating outcome

The exact approved constraint request was sent once through normal dedicated-QA Chrome Chat after final code/capture was serving. It completed durably in **26,870 ms**, with **one provider step, zero tools and zero canonical operations**. The agent explicitly said it had no tool available to save the constraint, had not saved it, and had left the project/work/learning unchanged.

**Probe-planning mistake:** I checked that `record_reality_constraint` existed, but failed to check its availability at this exact Guide checkpoint before proposing the live request. `shared/career-map/selector.ts:323` and `toolNamesForCheckpoint` exclude it here. The one-step result therefore is **not two-marker compatibility proof**, does not reproduce DF-18 and does not justify closing it. No constraint capability was added and no favorable retry was made.

| First live numeric capture | Value |
| --- | --- |
| Marker wait / expected count | 1 ms / 1, promise settled |
| Read attempt / elapsed | 1 / 832 ms |
| Page returned / item count | 1 / 100 |
| Has more / cursor present | 1 / 1 |
| Match counts | `[1]` |
| Known HTTP status | 0 = unavailable, not inferred HTTP success |
| Exit | Phase 3, complete 1, 835 ms, no request/deadline abort |

The raw first log, visible reply, screenshot and numeric capture are retained privately. Reload preserves the reply, dedicated identity and unchanged Accepted / Not started project. QA is restored to Chat, light theme, default viewport and empty draft, still signed in.

## Integrity and serving

Founder rows in all five canonical tables are equal before/after. Dedicated map/history/mapping/leases are equal; every prior test turn, including the original Failed selection, is unchanged. Exactly one new Completed QA turn was added: **21→22 turns**, while map revision stays **31**, operation receipts stay **31**, and no constraint was saved. Project, work status and prior learning are byte-equal. Reload adds no further changes; zero active leases.

The guarded restart verified exact PID/cwd/command/listener ownership and fresh zero leases before replacing main PID 1048 with **36150**. Main serves final code from c615 on 5173 with the same development/trace flags; unchanged lab PID **41445** serves 5174. Both return HTTP 200. No pending restart, founder-profile access, push, PR, deployment or heartbeat.

## Engineering assessment and next decision

The remaining deadline-pressure failure is a **reproduced design fragility**, independently of the unknown original trigger. With a shared 5,000 ms read budget and one 100 ms delay, two reads fit only when their combined duration is below 4,900 ms. Two 2.6-second reads cannot fit, even if the second page contains both exact unique markers. The final serving source was exercised again with the actual current Guide fixture and mocked two-step progress operation: an immediate valid page completes, while partial-then-late-valid pages produce a Failed turn after the in-memory operation commits. The later valid page cannot change that settled result. This is the same production router/agent flow, with no live account write or model call.

Observed reads vary substantially: this probe took 832 ms; retained earlier reads took 2,305 and 2,576 ms, and the coordinator supplied a retained 3,273 ms observation. Those are individual observations, not a latency distribution or proof of the failed selection's timing. They nevertheless place an ordinary delayed-visibility retry near or beyond the current budget. The bounded repairs remove avoidable failure mechanisms but do not remove this timing dependency. **Unqualified U7/release acceptance is not established.** No additional founder conversation is needed to establish that engineering limitation.

Two concrete recovery policies are available for coordinator review; **neither is implemented or authorized by this receipt**:

| Policy | Bound and cost | Assessment |
| --- | --- | --- |
| **Keep the five-second admission window; let an already admitted read finish within its own existing five-second cap** | No read starts after the original five seconds; still at most five reads and 100-item pages. A derived absolute read-phase cap of 5+5 = **10 seconds** bounds the last admitted read. Worst-case terminal read tail increases by up to five seconds; no extra model call. Parent cancellation stays immediate. | Recommended smallest widening for the demonstrated partial-then-valid case. A first hanging read still stops at five seconds. Missing/duplicate markers still fail; a valid page must pass the unchanged resolver before completion. Separate admission/read/total timing must be visible in the existing numeric trace. |
| **Explicit two-full-read contract under a shared total cap** | Existing five-second per-read cap, with total read-phase cap derived as 2×5,000+100 = **10,100 ms**. Existing five-attempt maximum remains, but reads may be admitted after the old cutoff. Worst-case read tail increases by 5.1 seconds and may cause more list requests to be dispatched before failure; no extra model call. | Broader policy than admission grace. Choose only if a full retry after a slow first read is the intended guarantee. |

These are explicit timeout-policy choices, not an arbitrary numeric increase hidden in U1/U2. Both proposals concern normal post-model completion only; failure/cancellation recovery keeps its existing 500 ms bound. The separate marker-wait budget, request cancellation, lease/owner checks and exact marker/provenance requirements must remain. Neither policy rewrites an already Failed turn. Before any implementation, approve its bounded latency cost and require model-free partial-then-valid, first-hang, total-cap, no-late-admission (for admission grace), cancellation-during-grace and duplicate/ownership controls. Keeping the current cutoff is also an explicit tradeoff, but leaves the demonstrated valid-eventual-page failure in place; waiting for founder use would not correct it.

## Source-qualified optional live candidate — not sent

The current Guide tools were inspected using the actual checkpoint and agent/router in an isolated clone of the private canonical fixture. Active tools include `update_project_work_status`, but not `record_reality_constraint`. A preprogrammed mock provider successfully executes one status operation followed by a final reply: **two steps, two exact markers, one in-memory operation**, no live state write. The temporary test was removed and retained privately.

If another live two-step compatibility check is separately approved, the source-qualified fictional-QA input is:

> I’ve started A Self-Serve Materials Spot. I put two existing objects on the table and placed a rough message beside them. Please save it as in progress; I haven’t finished. Keep the brief and earlier learning unchanged.

This would explicitly change the **dedicated QA** project's status from Not started to In progress, append its reported-activity update and one operation receipt, and add one new turn. It is not a founder work report, and no such change is inferred or authorized now. The current real QA status remains Not started. Prefer deciding the demonstrated deadline policy before making more live requests merely to seek a failure.

Private ignored `.context/revelio/df18-bounded-fixes-20261030/` retains verification, original review, first probe capture, authoritative comparisons and source-qualified mock proof. The founder's personal conversation remains parked; personal continuation is not required. DF-15 and previously uncompleted MVP/U10/erasure gates are unchanged.

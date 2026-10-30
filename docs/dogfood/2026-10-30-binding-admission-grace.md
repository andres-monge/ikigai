# Terminal binding admission grace — 2026-10-30

The approved repair separates admission from completion of an already admitted provider read. It mitigates the reproduced deadline fragility without changing exact marker binding, ownership, leases, model policy or historical turn truth.

## Timing contract

For normal post-model completion in both existing terminal-binding closures:

- Admit a new read only during the original 5,000 ms read-phase window. Check the monotonic deadline before admission as well as using abort signals.
- Give an admitted read its own 5,000 ms cap, bounded by an absolute 10,000 ms read-phase cap. An already admitted read can finish after admission closes.
- Retain at most five reads, 100 ms inter-attempt delays, a newest 100-item page and retries only for the existing typed retryable provider error.
- A first hanging read still stops at five seconds. This is not a guarantee of two full reads after a hanging first read.
- Keep marker waiting separate. Parent cancellation remains immediate. Failure/cancellation recovery retains its strict, ungraced 500 ms window.

The accepted cost is up to five additional seconds of terminal read waiting, with no additional model call. Missing, duplicate or foreign markers still fail closed. Old failed turns, project selection and earlier learning are not repaired or rewritten.

## Evidence before the live check

Six timing regressions failed on the prior source. The two-read case returns a partial page after 2.6 seconds and a valid page after another 2.6 seconds; the old shared deadline fails before accepting it. Both normal Chat and workspace completion now pass. Controls cover a first hanging read, admission cutoff, a late admitted hanging read, prompt cancellation during grace and immutable capture after a late provider promise settles. Existing strict 500 ms recovery and typed retryability controls pass. The existing missing/duplicate-marker test now also covers foreign request markers.

Numeric capture has separate `admissionBudgetMs`, `perReadBudgetMs`, `totalReadBudgetMs` and `readPhaseElapsedMs`. `admissionClosed` alone does not mean an admitted read timed out: `readDeadlineExpired` and `totalDeadlineExpired` report those causes, and `deadlineAborted` aggregates read/total expiry only. Marker-wait fields retain their original separate meaning. Bounds, numeric validation, privacy filtering, copied match vectors and settled-record immutability remain in place.

Credential-isolated `test:all`: **1,045 PASS, two existing bundle skips, 63 files**. Final focused routes/trace/history/agent run: **254 PASS**. Typecheck, build and whitespace checks pass; no lint command is configured. The owned disposable PostgreSQL cluster is stopped with zero child test databases left. Tests did not use application database or provider credentials.

Five simplification personas completed; the only applied finding removes two comments that repeat the code. Proof tests were preserved. One scoped focused `ce-code-review` completed **Ready to merge**, no findings: `20261030-175551-7e6fd19e`. It included correctness plus one native adversarial read; no external paid peer or repeated prior review. The implementation is committed locally as `033f8d7`.

A fresh read-only account audit finds founder revision 37 / 31 turns and dedicated QA revision 31 / 22 turns, with zero active leases. All ten account-table snapshots equal the retained post-probe baseline: no earlier progress probe was sent. The current QA fixture also passes a model-free preflight using the actual router and eligible Guide tools: `update_project_work_status` is available, the exact approved report produces one synthetic status operation, two model steps and two bound markers. This establishes eligibility, not live provider behavior.

## Serving and guarded restart

The pre-restart callback retained fresh zero active leases and verified the sole main listener, exact command and c615 working directory. The owned lifecycle helper replaced main PID 36150 with **68688**, retaining the same development/trace flags. Main on 5173 and unchanged lab PID **41445** on 5174 both return HTTP 200. All account-table snapshots remain equal after restart; founder stays revision 37 / 31 turns and QA revision 31 / 22 turns. The connected regular Chrome QA profile restores the dedicated identity and saved Chat with an empty draft; founder Chrome and the separate Incognito window are not used for this probe.

## One approved live compatibility check

The exact source-qualified progress report was sent **once**, after verified final code was serving, through the existing connected regular QA Chrome profile. It explicitly reported started work and requested in-progress status while preserving the brief and earlier learning. No real-provider fault or delay injection, status reset, second probe or favorable replay was used.

> I’ve started A Self-Serve Materials Spot. I put two existing objects on the table and placed a rough message beside them. Please save it as in progress; I haven’t finished. Keep the brief and earlier learning unchanged.

The first result completed durably in **34,492 ms**, with **two provider steps (`tool-calls`, `stop`), one tool and one canonical status operation**. The reply acknowledged the project as in progress and offered a next comparison without treating it as finished.

| First live numeric capture | Value |
| --- | --- |
| Marker wait / expected count | 1 ms / 2, promise settled |
| Read attempt / elapsed | 1 / 856 ms |
| Page returned / item count | 1 / 100 |
| Has more / cursor present | 1 / 1 |
| Match counts | `[1, 1]` |
| Known provider HTTP status | 0 = unavailable; not inferred success |
| Exit | Phase 3, complete 1, 860 ms binding total / 859 ms read phase |
| Admission / per-read / total budgets | 5,000 / 5,000 / 10,000 ms |
| Request abort / admission closed / read expiry / total expiry | All 0 |

**Two-marker tool-loop compatibility PASS.** This live read did not require grace. The live result confirms compatibility of the final serving policy with this actual Guide flow; model-free timing tests establish the delayed-read boundary behavior. Neither identifies the original Failed selection's cause. The raw first log, full numeric trace, first visible/settled reply and screenshot are retained privately.

## Integrity and reload

Read-only snapshots show exactly the authorized QA changes: revision **31→32**, turns **22→23**, receipts **31→32**, and one new work update changing the selected project's work status from Not started to In progress. The new turn is Completed with two unique bound context-item IDs and exactly one `update-project-work-status` receipt.

The selected brief and agreement, all earlier learning and other map fields, prior projects, all 22 prior turns including the original Failed selection, and all prior receipts are equal. Founder rows across all five canonical tables are equal. QA conversation mapping is equal, leases are empty and global active leases are zero. Reload leaves all ten account-table snapshots unchanged.

Actual Chat restores the same reply after reload, and Your Map shows **Accepted / In progress** with the unchanged brief and reported activity. QA is left signed in on Chat, light theme, normal viewport, empty composer. No further model request is required. Main remains PID 68688; lab remains PID 41445. No pending restart, push, PR, deployment or heartbeat.

## Readiness recommendation and limits

Proceed to the remaining MVP acceptance gates without an open-ended DF-18 hold for missing historical timing evidence. Three claims remain separate:

1. The independently reproduced typed-retry and supported-marker-bound defects were fixed in the prior bounded-repair commits.
2. The independently reproduced shared-deadline fragility is mitigated by the approved admission-grace policy, with red/green model-free timing evidence and one actual two-marker compatibility pass.
3. The historical selection failure's precise trigger cannot be reconstructed from the retained evidence. It remains recorded as Failed; this result does not rewrite it or claim a historical root-cause proof.

Residual risk is explicit and bounded: no new read after five seconds, no more than five attempts, at most ten seconds of terminal reading, and fail-closed completion if exact unique markers are still unavailable. The 100-item page is unchanged. One live outcome is not a provider-latency distribution or a reliability guarantee. No further founder conversation or repeat probe is justified by this batch. At the time of this engineering assessment, the recommendation advanced bounded reliability only; it did not itself grant U7/MVP acceptance. The subsequent explicit U7 decision is recorded below. Full MVP/U10/erasure, unrelated UI requests and the unresolved in-app Google navigation cause remain separate.

## Founder U7 acceptance — 2026-10-30

The founder explicitly accepted U7: “id say we are ok to accept u7 then.” The decision accepts the current V6 Paths, V4 voice, Shared, Design, Guide and Interpret behavior on the retained actual QA and owner judgments, including the bounded DF-18 assessment and compatibility evidence in `033f8d7` / `63d7ab2`. This closes the attended U7 qualitative/actual-app founder acceptance gate; no further personal-session continuation is required. The active implementation plan and dogfood tracker now record that status.

U8 operational implementation and the evidenced repeating loop are present, with separate release verification remaining. U7 acceptance does not imply acceptance/start of the founder's saved project, repair of prior learning or the original Failed turn, full MVP/U10 or deployment acceptance, completed erasure compliance or metrics. The requested next expansion concerns metrics, pilot disclosure/erasure and release; this documentation decision authorizes no new implementation, planning chat, model/account action, push, PR, deployment or heartbeat. All earlier probe results and historical limits remain intact.

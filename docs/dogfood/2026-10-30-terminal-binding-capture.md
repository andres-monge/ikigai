# Terminal binding capture readiness — 2026-10-30

**Capture installed in `a8bb4ff`; DF-18's cause remains unresolved.** No live model/account turn was sent to test capture. The original follow-on selection remains Failed with `InternalContextBindingError`; its committed project choice and subsequent healthy help turn are not rewritten.

The normal `/api/agent` terminal boundary now retains bounded numeric evidence in the existing opt-in development `MethodLatencyTrace`, emitted through the existing `method_request` response-finish summary. It adds no endpoint, schema, flag, logging channel or retention system. Production and flag-off behavior remain unchanged.

## Evidence contract

| Section | Retained fields |
| --- | --- |
| `markerWait` | Elapsed and existing budget in milliseconds, expected marker count, promise-settled flag, separate request/deadline abort flags |
| `attempts` | Sequential attempt index, read elapsed time, page-return flag, known provider HTTP error status, requested limit, returned count, has-more and cursor-presence flags, full supported per-marker-index match counts, separate abort flags |
| `exit` | Terminal phase, elapsed time, complete flag, existing read budget and separate abort flags |

Flags are numeric 0/1. Unknown page metadata uses -1; HTTP status 0 means unavailable, never an invented successful 200. Exit phases are 0 marker wait, 1 provider read, 2 inter-attempt delay, 3 resolved and 4 exhausted. Durations and counts must be finite/nonnegative; attempts are limited to five. Marker count and vector length use the existing canonical `REVELIO_MAX_AGENT_STEPS` bound of 50. Unsupported oversized records are rejected; supported vectors are neither truncated nor discarded.

The new section contains no IDs, hashes, content, cursor values, URLs, error messages, tokens or provider objects. Its explicit field copies remove extra keys; input/output arrays do not alias stored evidence. The existing outer request log still contains request/turn IDs, unchanged. Recorder exceptions cannot change terminal resolution, and late provider results cannot append or mutate settled capture.

The original separate marker/read timeout windows, five-attempt reader, 100-item pages, exact unique-marker resolver, abort/cancellation, leases and terminal-state/failure rules are preserved. Direct-workspace/history capture is outside this change. The existing response-finish channel may emit no summary for a disconnected HTTP request; cancellation recorder behavior is verified in memory, without adding a close-event logger.

## Verification and review

- Final focused suite: **140 PASS** across route and trace tests; typecheck, build and whitespace checks PASS. No lint command exists. No live provider/model request was used.
- Coverage includes two-marker delayed visibility, missing/duplicate-marker exhaustion, development/production/flag-off gating, known provider error status, recorder exceptions, original bounded timeout, cancellation during read/delay, lease release, late-result immutability, finite bounds and unknown-field stripping.
- Five-persona simplification completed before review; three bounded implementation simplifications applied, with all proof tests preserved at that checkpoint.
- One scoped review, `20261029-182559-cd1365da`, returned **Ready with fixes**. Correctness plus independent Claude Opus 5.5 adversarial pass; low effort requested, actual effort unverified, model and independence verified. No duplicate review/panel.
- Its sole confirmed P2 identified the recorder's original 20-marker bound versus the agent's supported 50 steps. The approved resolution imports the canonical agent bound and retains full vectors. Before the fix, three proof checks failed; afterward, 21- and 50-marker cases pass alongside the 51-marker rejection and existing five-attempt/privacy checks. Original review and resolution are retained privately.

## Serving and integrity

The guarded main restart verified fresh zero active leases, sole port ownership, exact command and c615 checkout before stopping PID 27049. Main PID **1048** serves the capture implementation on 5173 using the same development/latency flags and verified cwd/command. Lab PID **41445** on 5174 was untouched. Both returned HTTP 200 after restart. No browser/session action or paid generation was used; capture is ready for the next separately authorized ordinary request.

Read-only before/after comparison is equal across all five canonical tables for both founder and dedicated accounts, including every prior turn and operation receipt. Founder remains revision 37 / 31 turns; dedicated account remains revision 31 / 21 turns; zero active leases. The selected project remains Accepted / Not started, and the original failed selection is preserved. No account repair, signout, source retry-budget change, push, PR, deployment or heartbeat.

Private ignored `.context/revelio/df18-durable-capture-20261029/` retains red/green logs, final check/build, original review/resolution and integrity evidence. This is observability readiness, not a DF-18 reliability fix, cause diagnosis, successful recapture of the failure or full-journey acceptance.

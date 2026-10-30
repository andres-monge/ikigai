# Proactive terminal-binding diagnosis — 2026-10-30

**DF-18 remains unresolved; two source-level failure mechanisms are reproduced, and a live probe awaits coordinator approval.** No reply-delivery behavior changed, paid model request ran or account message was sent. The founder's personal conversation stays parked.

Subsequent approved implementation and the first live probe are recorded in [the bounded-repair receipt](2026-10-30-bounded-binding-repairs-and-probe.md). It preserves the probe-planning mistake and does not close the original cause or deadline risk. The proposal and pre-implementation evidence below remain historical.

## Retained failure and source flow

The original two-step selection committed its operation and produced visible output with a normal model stop. The durable turn remains Failed with two unresolved markers, revision 31 and `operationCommitted: true`. Its retained trace places terminal start at 29,760 ms and terminal completion at 37,272 ms: **7,512 ms**, including storage/recovery work, not an isolated provider-read measurement. By comparison, the retained healthy six-step continuation spent 4,011 ms in terminal handling; the later one-step help spent 4,970 ms, including its separately observed 2,305 ms provider read. These figures make read-deadline pressure plausible but do not establish the original failed-attempt cause.

`server/ai/agent.ts:572–713` resolves the marker promise in the buffered stream's finalizer. The route gates terminal delivery after consuming that stream, reloads authoritative state, then requires complete marker binding before `completeAgentTurn`. `server/routes/agent.ts:1341–1431` has separate marker-wait and shared read windows of 5,000 ms, up to five reads with 100 ms delays, and one memoized result. The fallback recovery cannot start another read window. `server/ai/history.ts:511–530` reads only the newest 100-item page; the resolver at 458 requires exactly one matching item per marker. Storage completion/lease checks occur afterward and are not bypassed by visible text or a committed operation.

## Model-free boundary probes

The actual router, mocked model/tool loop and fake storage/provider were exercised without calling the live app or provider. Each two-step route case committed one synthetic operation and released its lease once.

| Injected condition | Observed current outcome |
| --- | --- |
| Both unique markers available immediately | Completed, one read |
| First read throws retryable HTTP 503; next page would be valid | Failed, **one read**; four allowed attempts unused |
| Partial first page takes 2,604 ms; second valid page arrives after the shared deadline | Failed at approximately 5,002 ms; second read aborted after 2,295 ms; later valid return cannot mutate settled capture |
| Required marker is on an older page | Five reads of the same newest page, then Failed; cursor never followed |
| Duplicate marker | Five reads, then Failed; exact-unique guard preserved |
| All unique markers present, cardinality 2 / 20 / 21 / 50 | Resolver succeeds for 2/20, rejects the entire 21/50 input |

Nine characterization checks pass for these observed outcomes. Three candidate regression assertions fail against current code: recovery after the retryable 503 and acceptance of the fully present 21/50-marker vectors. Eleven existing focused checks pass across visibility/duplicate/privacy boundaries, bounded recovery, cancellation/late results, refreshed context, first-step-only compaction configuration and abort-before-later-provider-call behavior. Temporary diagnostic test files were removed; no production/test source change is included in this recording.

## Ranked explanation and bounded repair candidates

1. **Shared read deadline / delayed availability:** most plausible original trigger, given the original terminal interval and the actual retained multi-second read observations. The synthetic late-valid case reproduces the user-visible failure with a valid eventual page. Original per-attempt data is missing, so this is not a confirmed historical diagnosis. Increasing deadlines or retry/page counts would be a policy change, not a justified fix here.
2. **Transient provider list error:** confirmed vulnerability in both terminal-binding closures. Any list error exits the loop immediately, including the existing provider error's `retryable` class. The outer catch masks the distinction as incomplete binding. A minimal candidate is to use the remaining existing attempts for that class only, within the unchanged deadline/attempt/delay bounds. Non-retryable errors, cancellation and exact marker matching must still fail closed. Existing all-503 failure coverage must remain, strengthened for bounded exhaustion; add transient-then-valid and non-retryable controls. This mechanism is not proven to have caused the original failure.
3. **Page visibility or genuinely invalid/duplicate provenance:** still possible for the original attempt. A later retained page contains each expected marker exactly once, which does not reconstruct the earlier page. The one-page reader intentionally cannot find older-page markers; no paging expansion or acceptance without exact binding is proposed.

Separately, the resolver and persisted-marker schema cap at 20 while the agent and capture support 50. This is a proven supported-bound mismatch, **not the cause of a two-marker failure**. A bounded candidate aligns those schema/batching limits with the canonical agent bound, retaining unique/length/value guards and rejection above the supported bound. It does not promise that a 100-item page can always contain a long turn. No generic retry framework, deferred-success state, provenance relaxation or historical repair is proposed.

If approved, the source scope is `server/routes/agent.ts` and its existing tests for retry handling in both terminal closures, plus `server/ai/history.ts` and its existing tests for supported marker cardinality. Reuse `REVELIO_MAX_AGENT_STEPS`; do not create another independent limit. Strengthen existing failure/timeout/cancellation coverage rather than replacing fail-closed expectations with unconditional success. Required controls include all-retryable-errors exhaustion, non-retryable error, cancellation/deadline during retry, unique 21/50 markers, 51-marker rejection and duplicate-marker rejection.

## Recommended next discriminator — pending approval

Use one normal dedicated-QA request that should require an application tool followed by a final response, matching the original two-marker shape. Proposed exact input:

> Please save this practical constraint for the fictional QA scenario: Any setup must fit on one existing table. Leave the selected project, work status and prior learning unchanged. Then briefly confirm what you saved.

This requires approval for a paid ordinary model/tool loop, one new durable QA turn and an expected new reality-constraint operation. Expected shape is two provider steps; model behavior and duration are not guaranteed. Estimate: tens of seconds, advisory only, using existing request limits. Founder rows/profile remain untouched. No resend, repair, reset, selection replay, inferred work or favorable retry follows the first outcome.

Before sending: verify exact QA identity, revision 31 / 21 turns, Accepted / Not started project, empty draft, zero active leases and existing development capture. Preserve first trace and before/after canonical rows. Discriminate read timeout (`readReturned: 0`, deadline flag), a returned missing/duplicate vector, known HTTP failure or immediate complete binding. If healthy, record that failure was not reproduced; do not repeat until favorable or close DF-18. If the model does not produce the expected tool-loop shape, preserve that outcome and return for review. Do not repeat late healthy provider reads or introduce a model matrix.

The coordinator should choose the probe and any independently justified bounded repair before `ce-work`. Neither the known error-retry gap nor the >20 bound should be presented as the original root cause without evidence. A cause-specific behavior change still requires the requested review/approval checkpoint.

## Founder decision and retained gates

The founder considers the personal conversation at its natural stopping point: a real user would try the project and return for help or reflection. Personal continuation is **not required**; personal testing is reserved for a need uniquely dependent on that account, and none is currently identified. This coordinator instruction is not acceptance, a work-start report or permission to repair historical learning. The founder says usefulness is good on that front; this is not full U7/release acceptance.

DF-18 reply-delivery reliability remains the immediate U7/release qualification. DF-15's in-app Google-navigation cause remains open separately. Previously uncompleted full-MVP/U10/erasure gates are not advanced by this investigation. DF-03 remains a retained recurrence observation, not a diagnosed instruction defect. No further founder conversation is requested to resolve these engineering gates.

Private ignored `.context/revelio/df18-proactive-debug-20261030/` retains characterization/regression candidates, numeric probe results and logs. No live model request, account message/state write, browser action, source behavior change, server restart, push, PR, deployment or heartbeat occurred.

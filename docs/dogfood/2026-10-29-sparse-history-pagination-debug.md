# Sparse history pagination recovery — 2026-10-29

## Debug Summary

**Problem:** The founder's signed-in Chat became empty after refinement/reload and displayed a history-load error. This bounded `ce-debug` fix starts from `56369a46aa8ce3aab7249321f23cd9a5791931f5`. No issue of record was supplied; targeted issue/PR searches found no matching work.

**Root Cause:** Main PID 82690 was alive and serving HTTP 200. Workspace reads returned HTTP 200 at revision 37 while history repeatedly returned **502 / `ConversationHistoryProviderError`**. This incident was not another unexplained service exit. Evidence was captured before the code-loading restart.

The read-only provider probe reproduced the exact failure in `loadConversationHistory` (`server/ai/history.ts`, pre-fix lines 748–770). It requested descending windows sized to the remaining visible-message budget: limits **40 → 33 → 27**. The provider returned HTTP 200 with **40 → 14 → 0** items, still claiming `has_more: true`; the empty page supplied no last-item cursor. The adapter correctly rejected that inconsistent continuation and the route exposed 502. Thus root HTML health did not establish history API health. The provider-side reason for the sparse/inconsistent window is unknown; no deletion or compaction cause is claimed proven.

Controlled read-only requests with stable 100-item batches crossed the same boundary, returning 71, 96 and 100 items. An exhaustive ascending source capture also retained the older text. Content was recoverable; shrinking the provider request size to the display budget exposed the failing window. No model generation, acceptance replay or account repair was needed.

**Fix:** Keep provider traversal separate from visible pagination. The history loader requests bounded batches of 100 items, retaining the five-call cap. It returns only the newest requested display-page size (default 40; maximum 100). If a batch contains additional display messages, the encrypted older cursor is anchored to the raw provider ID of the oldest returned message, so those older messages are fetched on the next page rather than skipped. Cursor identity is bound before browser-safe ID projection. The existing malformed/repeated-cursor, ownership, internal-context exclusion, display-provenance and citation checks remain intact. There is no exhaustive fallback, new cursor schema, transcript store, provider/model switch or security relaxation.

**Regression and Prevention:** The existing history suite now models sparse provider scan windows with nonreturnable slots and hidden reasoning items. It failed before the fix at the same missing-cursor guard. It now returns exactly the newest 40 plus the older 20 messages, 60 unique IDs and no hidden sentinel. Existing small display-page bounds, final-item anchoring, opaque cursors, recovery/backfills and error-redaction tests remain. Four provider-limit assertions now expect 100-item batches; their visible-page assertions remain strict. The old suite assumed short but progressing pages and did not exercise an empty sparse window reached by shrinking the request.

**Confidence and limits:** High for this reproduced failure and current recovery. The upstream anomaly itself is outside the app's control. Reads remain capped at 100 items × five calls per display page; a provider response that is still malformed or cannot progress at that batch size continues to fail closed. No unbounded scan or retry loop was introduced.

## Post-Fix Quality

**Scope:** `server/ai/history.ts`, its existing test suite, this receipt and the findings tracker. Pre-existing `AGENTS.md`, `server/auth.test.ts`, `server/auth.ts` and `server/index.ts` WIP remain byte-identical and uncommitted. No stash/reset/discard experiment was used: a read-only probe reproduces the failure inside the history adapter while auth/workspace work.

**Simplify and review:** Actual four-reviewer pipeline pass (reuse, quality, efficiency, test value) completed with no findings or edits. Independent targeted manual correctness/privacy review due to unrelated branch work found no actionable issues. Reviewed overscan cursor placement, small display pages, final-item identity, recovery backfills, citations and owner/internal-item boundaries. No duplicate whole-feature or paid cross-model review ran.

**Verification:** All **300 tests across six files** pass: history 40, agent 54, agent routes 129, Explore 55, SafeMessage 13 and streaming schemas 9. Node24 typecheck and production build pass. Diff whitespace check passes; no lint command is configured. Synthetic test configuration prevents live database/model use. Logs: `/tmp/revelio-history-sparse-red.log`, `/tmp/revelio-history-sparse-final-tests.log`, `/tmp/revelio-history-sparse-types.log`, `/tmp/revelio-history-sparse-build.log`.

## Actual signed-in recovery and integrity

The existing founder tab was located through bundled Browser's Chrome inventory after its previous tab ID changed. The enterprise-controlled surface accepted `http://localhost:5173`; no CLI browser or allowlist workaround was used. Initial inspection confirmed empty Chat/error and an empty draft. No message, acceptance or other acting control was submitted.

The fixed loader's read-only provider probe returned 40 newest messages with an older cursor. Reading that cursor returned the remaining 18. All **58 display-safe messages** are unique and match the complete projection of the captured source exactly, including text/citation/turn metadata. The source contains 334 provider items; hidden/non-display items are not promoted into Chat.

Before restarting to load the backend fix, a fresh read-only database snapshot confirmed no active lease and no acceptance operation. Existing saved state is revision **37**, with 31 durable turns and 37 operation records. The latest project is **Suggested / Not started**; prior project revisions are parked/superseded. The latest operations are replacement, natural framing and completed framing delivery, not acceptance.

Only the identified main PID was restarted. Detached Node24 PID **86603**, parent 1, serves the same c615 checkout with the existing project environment, development mode and both latency flags. It started after the source correction. Separate commands confirmed HTTP 200 and the process identity. New runtime logs show history and workspace reads returning HTTP 200. Lab 5174 was left alone. One Browser inspection timed out during the server refresh; the same session/tab was retained and an explicit safe reload succeeded.

Actual Browser verification shows 40 restored Chat messages, no load error and the empty composer preserved. **Load older messages** works. Map retains the active Revelio direction, Design a Path Project and the refined Suggested / Not started proposal. Switching back to Chat and repeating reload succeeds. The existing canonical attachment now displays the revised title and three brief sections in Chat; no separate presentation change was made. This supersedes DF-08's earlier absence observation without claiming its exact earlier timing was independently reconstructed.

Before/after database snapshots are equal across the complete canonical row/document, all 31 durable turns, all 37 operation records, Conversation mapping and lease rows. No acceptance, reset, state repair, resend, provider write or live/paid model call was performed. Diagnostic provider calls were GET/list reads only. Exact source content, private identifiers, request summaries, source-state proof and screenshot remain in ignored `.context/revelio/history-reload-debug-20261029/` (0700; files 0600). Raw provider bodies from the first failing probe were not saved; its sanitized metadata is preserved from the observed tool output, alongside the original failure logs and source capture.

The founder tab remains open on restored Chat, without an ownership handoff mark. The founder can review/refine the existing proposal and make a new acceptance decision when ready; none is inferred here. Saved past reflection, project acceptance and the full repeated loop remain open. Heartbeat is off. No push, PR or deployment occurred.

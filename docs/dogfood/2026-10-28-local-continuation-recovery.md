# Local continuation availability recovery — 2026-10-28

## Debug Summary

**Problem:** The founder's continuation showed an optimistic user bubble, restored the same text to the composer and displayed both temporary-unavailability and history-load errors. This bounded `ce-debug` run starts from `0830262dfb60b4167bbe082daeb60c3574402c0d` on the integration checkout. The restored recap from that commit remained visible. No issue of record was supplied.

**Root Cause:** The local main service was absent. Port 5173 had no listener, the previous PID 17439 no longer existed and a direct HTTP request failed with curl exit 7 / HTTP 000. The prior server log ended after successful history/workspace reads, without a later agent request or application/provider error. The exact reason that process exited was not recorded and is not claimed proven.

The UI behavior follows the existing transport-failure path: `submitMessage` inserts the optimistic bubble before POST (`client/src/pages/explore.tsx:730–739`); a rejected fetch restores the submitted text and shows the generic notice (lines 776–785); its `finally` refresh also cannot reach history, producing the separate history-load banner (lines 788–798 and 1049–1053). Both symptoms have the same unavailable local origin. Existing successful history remains in memory, so the cards and recap can stay visible during the outage.

Read-only repeatable-read database and provider snapshots prove the failed submission never entered a new durable turn or provider message. The map and operation history remained exactly at revision 30, with the same 21 turns and 259 provider items as the previous successful verification. No active lease existed. Therefore there was no committed selection/proposal to recover and no in-flight request to duplicate.

**Fix:** Restore main 5173 as an independent detached Node24 process, rather than leaving its lifetime attached to a long-running exec session. The launcher uses `subprocess.Popen` with `start_new_session=True`, `stdin=DEVNULL`, a private log file and closed inherited descriptors. PID 16189 is its own process-group/session leader and has parent PID 1 after the launching command exits. It runs from `/Users/andresm/.codex/worktrees/c615/ikigai`, using the existing project `.env`, development mode and both latency flags. HTTP 200 and authenticated history/workspace reads were verified across separate commands. No service was killed, no OS job/heartbeat was installed and no app/provider/model/security configuration changed. Lab 5174 had no listener and was left alone.

**Recommended Tests and Prevention:** The repeatable outage check was direct connection failure; after recovery the same origin returned HTTP 200, then the exact requested continuation completed through the normal browser POST. This is an operational correction, not a source-code defect needing a new implementation-mirroring test. Existing Explore coverage for network failures, preserved submissions and validated recovery was rerun: all **54 tests pass**. Local handoffs must use an independent process with redirected standard streams and verify its parent/lifetime, not assume a yielded exec session will persist. The final cross-turn lifetime check belongs to the receiving coordinator after this turn ends.

**Confidence:** High for the immediate outage and safe request recovery; the old process's exit signal/cause remains unknown. No evidence supported a provider schema, V3 state, database, auth or history-projection change. No application source fix was made merely to fit the generic error banner.

## Exact bounded recovery

The enterprise-controlled `@Browser` surface accepted the founder's existing signed-in Chrome tab on approved `http://localhost:5173/`. Before any interaction, the draft was captured verbatim. No attachment or newer draft was present. When the development server returned, Vite refreshed the page and cleared in-memory UI state. History loaded successfully; the captured original text was restored without alteration and submitted **once**, after proving the earlier attempt had no durable/provider footprint and no active lease.

One authorized application request completed HTTP 200 in about 34 seconds: two model steps, one application-tool call and no search. The attempted `confirm_purpose_path_revision` operation was rejected with `ConfirmationTargetMismatchError` because no matching confirmation decision existed. Its guard remained intact. The agent continued with an ordinary question about whether anyone besides the founder has tried the app. It did not accept a project, choose a new path, propose another project, manufacture reflection evidence or reset anything. This guard result is recorded as observed behavior, not treated as the cause of the earlier transport outage.

The successful request added exactly one completed durable turn with a bound user item and 287-character assistant reply. Provider storage added nine items, including internal loop context and the rejected tool exchange; this was one request, not a replay of the failed network submission. Prior turns and the Conversation mapping remain unchanged. The complete canonical map, update timestamp and all 30 operation-history records remain unchanged at **revision 30**. Private before/after source snapshots and diagnostics are retained outside Git.

Browser verification after an explicit reload shows the saved response, an empty composer, no unavailable/history error and the original recap still present once. The founder can resume by answering whether anyone else has tried Revelio. No further message was sent. A private screenshot records the recovered response. The tab is left open on Chat without a handoff/deliverable ownership mark.

## Post-Fix Quality

**Scope:** This receipt only; no application source changes. The four pre-existing integration WIP files (`AGENTS.md`, `server/auth.test.ts`, `server/auth.ts`, `server/index.ts`) remain byte-identical and uncommitted. Historical provider prefixes, capture/lab files, prompts, skills and authority documents were not edited.

**Simplify and review:** Skipped for this operational/docs-only correction. Reviewed the causal transport path and startup parameters directly; no duplicate whole-feature review or paid cross-model review was appropriate. Existing source verification from the preceding code fix remains separate evidence.

**Verification:** Explore 54 tests pass on Node24; log `/tmp/revelio-local-continuation-ui.log`. Direct origin health, parent/session independence, authenticated history/workspace reads, one successful continuation, source-state comparison and browser reload are verified. No changed application code required another typecheck/build. Diff whitespace check passes. The old process exit cause and future host/process shutdown are the practical limits of this local runtime handoff, not grounds for adding an unrequested supervisor.

Private launch metadata, lease check, runtime log and screenshot are under Git recovery metadata at `recovery/local-continuation-20261028`; exact before/after account captures are in the preceding recovery directory with distinct suffixes. Credentials and raw account content are not committed. Heartbeat remains off. No push, PR, deployment or lab run occurred.

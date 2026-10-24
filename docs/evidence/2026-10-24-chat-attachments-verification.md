# Chat attachments verification

Implementation, review corrections and the actual Browser checklist pass on the dedicated test account. The local change is ready for coordinated integration; integration, deployment and U7 acceptance remain the caller's responsibility. No PR, push or deployment.

Base `94415d116840760824665f915fdba71fddf81d0e`; branch `codex/chat-attachments-mvp`; worktree `80dc`. Feature commits: `b7250fb` (U1), `e92a44c` (U2/U3), `9f1ff2a` (review corrections), `c22abbf` (cancelled provider-call continuity), `313f404` (bounded preflight). The plan is the byte-for-byte copy of the primary reviewed `2026-10-24-1612` plan, SHA256 `7624709062924c7c77fb29cd5ff932092b6ebd81e314a42f07b8a74c6f0bbba2`.

## Actual Browser acceptance

Normal authenticated app at approved origin `http://localhost:5173`, current `gpt-6.1-sol`/OpenAI Responses provider, real persistence. Tool: Browser through `cua_repl`, in-app browser, tab 1. The human switched to the dedicated Google test identity; auth and database ownership matched, differed from the preexisting session, and began with zero maps/turns/mappings. Opaque test marker **b7196b226aa91c5f**; identifiers and diagnostic originals remain Git-ignored.

| Scenario | Result and observed evidence |
|---|---|
| Foundation/native paste | Passed on `e92a44c`. Binary clipboard plus native keyboard paste showed removable preview; normal reply read “violet otter” from image content. Reload retained caption/`Image attached`, zero original previews. |
| Picker/all formats | Passed on `e92a44c`. Native + chooser selected PNG/JPEG/WebP/PDF/genuine binary DOC/DOCX together; real reply identified all six unique interior facts absent from caption/filenames. Reload retained plain labels. Word-text/PDF-visual guidance visible. |
| Project/image-only | Passed on `9f1ff2a`, retested on `c22abbf`. Prepared a synthetic first project through normal Foundation/path selection. Captionless WebP produced content-aware clarification, retained `Image attached` after reload, zero previews. Full canonical map exactly unchanged (revision 14 in first run; revision 20 in retest), same Conversation mapping, no acceptance. |
| Limits/correction | Passed. Oversized PDF and combined aggregate rejected before Send while preserving valid files/text. Keyboard removal worked. Fitting images retained original bytes in deterministic checks; roughly 4 MB PNG optimized once, labeled `Image optimized`, and normal real reply read its unique interior sentence. |
| Busy paste | Corrected and retested on `9f1ff2a`. Native paste while four large images prepared produced recoverable wait/reselect feedback; no silent discard, queue or invented clipboard event. |
| Stop/reload/next | Passed on `c22abbf`, no new reset/manual cleanup. Real PDF request reached visible `Saving…`; Stop succeeded. Newer draft stayed unchanged; explicit restore replaced it with original caption and PDF. Reload retained user caption/document label. Next normal message completed successfully. Exhaustive provider listing afterwards had zero unmatched calls; canonical operation source IDs remained unique. |
| Keyboard/mobile | Passed on `e92a44c`. At 375×812 no horizontal overflow; Shift-Tab reached Add attachments, Enter opened native chooser, keyboard removal worked. Viewport restored. |
| Console/failure recovery | Final Browser console error list empty. A naturally observed provider protocol failure was reproduced, fixed and retested as described below; deterministic tests cover other forced failures. |

Synthetic fixtures: `visual.png`, `visual.jpg`, `visual.webp`, `brief.pdf`, `brief.doc`, `brief.docx`, `paste.png`, `large.png`, aggregate and oversized fixtures. Screenshots and logs live under `.context/attachments/`, including `browser-stop-fixed-newer-draft.png`, `browser-stop-fixed-reload.png`, `browser-stop-fixed-followup.png`, `browser-image-only-fixed-reload.png`, `browser-final-continuation.png`, `image-only-fixed-result.json`, `provider-stop-fixed-after.log`, and `continuity-ledger-result.json`.

## Implementation checks

U1 shared-contract test was observed red before implementation; U2 composer missing-control test was observed red before UI changes. Existing route/agent/tool/privacy/history/recovery tests were inspected and retained. Added byte/type/signature/fingerprint/privacy limits, original bytes, immutable drafts, preview cleanup, caption-only authority and labels-only completed/failed/cancelled history coverage. No persistence schema or attachment store was introduced; R7 was narrowly amended.

- Nine focused suites: **366 passed** (`verification-tests.log`); subsequent review corrections: **312 passed** across five affected suites (`review-fixes-tests.log`); final composer **54 passed**; decoder **11 passed**.
- Cancellation regression observed red in both committed and never-executed cases, then green. Final affected route/history/reconciliation suites: **179 passed** (`cancel-final-tests.log`), including the timeout regression and marker-only cancellation route. Coverage includes owner/lease/mapping changes, paired/unknown calls, partial deletion failure and idempotence.
- `npm run check` and production build passed after cancellation fix (`cancel-final-check.log`, `cancel-final-build.log`). Existing nonfatal bundle-size/Browserslist warnings remain; no lint script is configured.
- Earlier bounded provider diagnostic accepted/read all six synthetic formats using `store:false`, no Conversation/app state. This diagnostic proves compatibility only; the separate actual Browser checklist above supplies E2E evidence.

## Declared Node 24 runtime verification

Final bounded verification used **Node v24.19.0**, matching `package.json`'s `24.x` engine, on tested HEAD `e1149e17d5e922ff09f8d344ff37bc9e0691ac29`. Production code remains unchanged from `313f404`; this follow-up changes evidence only. Earlier logs/review reruns used Node v22.22.0; the checks below supply the declared-runtime acceptance rather than relabeling those historical results.

Process-scoped commands (no global configuration or dependency changes):

```sh
export PATH='/Users/andresm/.nvm/versions/node/v24.19.0/bin':"$PATH"
node -p 'JSON.stringify({version:process.version,executable:process.execPath})'
# Same unreachable dummy test environment as the earlier route tests:
npm test -- server/ai/cancelled-tool-calls.test.ts server/routes/agent.test.ts server/ai/history.test.ts --run
npm run check
npm run build
```

Version/executable probe returned `v24.19.0` and `/Users/andresm/.nvm/versions/node/v24.19.0/bin/node`; `command -v node` and `command -v npm` both resolved inside that installation. **179/179 tests**, typecheck and production build passed. Logs: `.context/attachments/node24-verification-runtime.json`, `node24-tests.log`, `node24-check.log`, `node24-build.log`.

The normal candidate started with that direct Node executable, `-r dotenv/config --import tsx server/index.ts`, unchanged primary `DOTENV_CONFIG_PATH`, development mode and the exact existing runtime patch. `lsof` verified listener PID **87780**, its executable at the Node 24 path, and cwd in worktree `80dc`. Fresh auth-only browser inspection matched the same dedicated test identity. Exactly one ordinary continuation completed through the real provider; reload retained its caption/reply, the console had zero errors, and the full canonical map and Conversation mapping stayed identical (revision **20 → 20**). No reset or repeated journey/matrix. Evidence: `.context/attachments/node24-runtime-receipt.json`, `node24-browser-state-result.json`, `browser-node24-continuation-reload.png`, `node24-candidate-server.log`.

Stopped only PID 87780 (session 35012) after verification. `lsof` confirms no 5173 listener, matching the pre-window state; no other checkout was started and 5174 was untouched.

## Review and observed failure corrections

Phase-2 ce-simplify-code review completed with five reviewers; applied one signature-switch simplification and removed two redundant comments. Protected proof tests retained.

Full scoped ce-code-review of `94415d1..e92a44c` completed with eleven reviewer outcomes and independent validation. Receipt `/tmp/compound-engineering-501/ce-code-review/20261024-170230-329f5add/review.json`, retained `.context/attachments/review.json`. Original verdict Not ready: two confirmed findings, corrected in `9f1ff2a` and retested:

- Attachment-only turns could otherwise confirm an exact pending choice. Existing user-action construction now rejects an explicitly empty caption; file context/labels do not become human choices or authored evidence. Presentation-only operations and existing direct UI authority remain available. No semantic acceptance regex or new confirmation policy.
- Second paste during preparation was silently dropped. Immediate inline wait/reselect feedback now preserves files/text and remains until next selection/removal. No queue.

Actual Stop after a canonical save exposed an additional provider continuity defect: abort prevented the SDK's next request from delivering the tool output, leaving a completed unmatched `function_call`; a subsequent text-only request failed with provider HTTP 400 “No tool output found for function call”. The saved revision and attachment labels survived. `ce-debug` reproduced the same failure at the route boundary before fixing it in `c22abbf`.

The next leased turn now removes only an unmatched completed Method call positively bound to a durable same-owner cancelled turn. It validates current pending turn/lease/mapping, cancelled ownership and canonical receipt type, preserving all user/assistant messages, paired calls and canonical operations. It neither guesses a result nor reruns a write. A separate ephemeral synthetic provider probe confirmed exact orphan deletion permits continuation and cleaned up that probe Conversation. The actual corrupted test Conversation subsequently continued through the normal Browser route with the saved proposal intact; a fresh Stop/reload/next sequence then passed without reset. The first cancellation retained committed revision 18; the fresh cancellation stopped before a new write (revision 20). Both have resolved display projection; later framing completion is existing Method behavior, not duplicate replay. An early diagnostic false digest comparison was caused by reading `displayRecovery` after normal projection backfill removed it; projection resolved successfully.

The confirmed preflight timeout correction in `313f404` combines route cancellation with a ten-second total provider-history repair deadline; its stalled-provider regression was red before the correction and green afterwards. A final ordinary Browser continuation on `313f404` completed with a natural reply, unchanged revision 20 and a clean console. Formal cancellation review completed eight lenses and independent validation on `9f1ff2a..c22abbf`: verdict **Ready with fixes**, one confirmed P2 (finite timeout). Receipt `/tmp/compound-engineering-501/ce-code-review/20261024-174937-95efaf36/review.json`, retained `.context/attachments/cancellation-review.json`. Separate `post-review-validation.json` independently inspected exact `c22abbf..313f404` and reran all four targeted cases: timeout resolved, marker-only gap covered, no new findings. Retained copy `.context/attachments/cancellation-post-review-validation.json`. Exhaustive provider scanning after a cancellation remains a deliberate positive-binding cost; concrete current-scale regression was not established, and no unsafe completed-turn shortcut or new persistent repair flags were introduced. Both formal reviews used local adversarial fallback: sanctioned transport could not exclude unrelated runtime WIP from the reviewed diff. No source was sent to an external peer.

## Runtime and test-state provenance

Only the exact uncommitted `server/auth.ts`, `server/auth.test.ts`, `server/index.ts` delta inspected read-only in `c615` was copied here: localhost auth default and port 5001 → 5173. They remain uncommitted, excluded from feature commits. Patch `.context/attachments/runtime-5173.patch`; dependency symlink uses `c615`'s existing install. Integration/primary WIP and lab port 5174 were untouched. There was no prior 5173 listener; The window is closed: only this run's candidates were stopped after verification (final Node 24 PID 87780, session 35012); `lsof` confirms no 5173 listener. No other checkout was started.

An initial insufficient Boolean auth probe allowed normal `/login` to redirect to a preexisting unidentified session and bootstrap read-only workspace/history requests. Inspection stopped at the header/loading state before reading conversation content or submitting anything. The human then switched accounts explicitly, followed by exact test-owner verification.

One early synthetic Foundation request was interrupted by this run editing a client test file, causing Vite full reload and the same unmatched-call failure. Evidence was preserved; the already authorized exact-test-only `method:reset` dry-run/execution was used once with verified database/account, preserving Google identity. The normal app then rebuilt the synthetic project. No further reset was used to make Stop pass. Subsequent source edits occurred between live Browser turns. No founder-state mutation occurred.

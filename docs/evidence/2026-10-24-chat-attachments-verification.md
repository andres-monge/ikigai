# Chat attachments verification

Base: `94415d116840760824665f915fdba71fddf81d0e`, branch `codex/chat-attachments-mvp` in worktree `80dc`. Plan copied byte-for-byte from the primary checkout's reviewed 2026-10-24-1612 plan. Native inline ce-work; caller owns final review/integration. No PR/push/deploy.

## Runtime provenance

Only the exact uncommitted `server/auth.ts`, `server/auth.test.ts`, `server/index.ts` delta inspected read-only in worktree `c615` was applied here: localhost auth and server port 5001 → 5173. These three files remain uncommitted, separate from feature commits. Local patch: `.context/attachments/runtime-5173.patch`. Integration and primary WIP untouched. Dependencies link to the integration checkout's existing installation. No app process switched.

## U1

Behavior changed: real inline multimodal content, validated limits/types, labels and content-bound replay fingerprint. Inspected existing shared schemas, route, agent, tools and full-app privacy tests. Shared contract test was observed red before production implementation (module missing). Added shared/decoder, route byte/fingerprint and full-app large JSON/privacy coverage; retained existing authority/tool and continuation regressions unchanged.

Focused command: `npm test -- shared/chat-attachments.test.ts server/ai/chat-attachments.test.ts server/routes/agent.test.ts server/ai/agent.test.ts server/app.agent-privacy.test.ts server/ai/tools.test.ts --run` with dummy test-only environment (no database/provider used). **272 passed**. `npm run check` passed. Local logs: `.context/attachments/u1-tests.log`, `u1-check.log`.

Early real-provider diagnostic: six bounded calls, `gpt-6.1-sol`, current OpenAI Responses adapter, inline data, non-PDF passthrough, `store:false`, no Conversation/account/app state. PNG/JPEG/WebP/PDF/genuine binary DOC/DOCX each accepted and identified its unique interior fact absent from filename and caption. Synthetic fixtures and diagnostic source/log: `.context/attachments/fixtures/`, `provider-smoke.ts`, `provider-smoke.log`. This is provider compatibility evidence, **not Browser E2E**.

## Browser acceptance

Pending. Browser plugin discovery shows a separate in-app browser with no tabs; Chrome contains an existing Revelio tab and must be treated as founder state. No founder page/history opened. Dedicated Google test account is available per parent but not yet authenticated/verified. Candidate readiness and main-origin window must be coordinated before any process replacement. All checklist scenarios remain not tested.

## U2 and U3 implementation checks

U2 evidence: new composer test observed red before UI changes (missing file control), recorded in `.context/attachments/u2-red.log`. Composer and preparation helper checks cover actual outgoing base64, attachment-only Send, preservation of text/valid files on type/aggregate errors, native-event fixture image paste, preview URL release, Stop with a newer draft and explicit replacement, and one image encoding at preserved dimensions. Event fixtures are deterministic component evidence, not native Browser paste. U2 initial focused run: **56 passed**.

U3 regressions add completed/failed/cancelled reload projection with text labels only and retained text at the history ceiling. Existing history paging, erasure, failed-after-save and canonical reply tests remain unchanged. No production history/storage/schema changes were needed. R7 in the active revamp plan is narrowly amended for this input surface. Filename shortening preserves extensions and removes directional controls. Added explicit noncanonical-base64 and caption-authorship boundary checks.

Latest combined focused command includes the six U1 suites plus `server/ai/history.test.ts`, `client/src/pages/explore.test.tsx` and `client/src/components/explore/prepare-attachment.test.ts`: **366 passed across 9 files**. Logs: `.context/attachments/verification-tests.log`, `check.log`, `build.log`. Typecheck and production build passed; existing build size/Browserslist warnings are nonfatal. No lint script is configured.

Phase-2 ce-simplify-code review completed with five read-only reviewers: applied one quality improvement (signature switch) and two comment deletions; reuse/efficiency/test deletion findings: zero; protected proof tests retained. One evidence defect was covered by an additional noncanonical-base64 assertion. The fingerprint compatibility comment remains because it describes persisted replay identity. No final shipping/code-review gate is claimed; caller owns it.

Implementation checks passed; actual Browser verification pending. U3 acceptance and final Definition of Done are incomplete until the named Browser checklist runs on the dedicated verified test identity at the coordinated main origin.

## Scoped review and corrections

Installed ce-code-review completed full scoped review of `94415d1..e92a44c`, with eleven reviewer outcomes and independent validation. Receipt: `/tmp/compound-engineering-501/ce-code-review/20261024-170230-329f5add/review.json` (retained copy `.context/attachments/review.json`). Original verdict: **Not ready**, two confirmed findings. Cross-model peer was unavailable because the sanctioned transport cannot exclude unrelated runtime WIP from its working-tree diff; local adversarial review covered the lens. No feature/runtime source was sent externally.

- P1: an otherwise exact confirmation tool call could authorize a choice on an attachment-only turn. Reproduced red at tools and normal route boundaries for empty-caption North Star/path/project choices. Corrected user-action construction to reject an explicitly empty human caption with the existing evidence-association error; presentation/context operations and existing direct UI authority remain available. No semantic acceptance regex or new confirmation policy was introduced. Route admission always supplies the caption (including empty), while omitted caption in trusted existing internal seams retains its prior contract.
- P2: a second paste while a file was preparing was cancelled without feedback. Reproduced red with preparation pending. Corrected to an immediate recoverable inline instruction to wait and paste/select again, preserving existing valid files and text. The warning remains when the initial preparation finishes; the next selection/removal clears it. No queue added.

Red receipts: `.context/attachments/authority-red.log`, `busy-paste-red.log`. Five affected suites passed **312 tests**, including the new rejection paths, existing text/direct continuation semantics and draft recovery; `npm run check` passed. Added an exact 100,000-character caption-plus-label admission check; decoder suite now has 11 passing tests. Production build passed after the corrections. Actual Browser acceptance is still in progress; final corrected commit and affected scenario retests will be recorded below.

## Browser window and identity

No 5173 listener existed before the authorized window. Candidate startup used the primary environment through `DOTENV_CONFIG_PATH` and normal development auth/database/provider. Listener owner/cwd and launch command are recorded privately in `.context/attachments/candidate.json`; lab5174 was untouched. On window close, stop only the candidate process started by this run.

The initial auth Boolean probe was insufficient to establish no existing session: normal `/login` redirected to an unidentified workspace and auto-started its read-only bootstrap. Inspection stopped at the header/loading state, before reading conversation contents or submitting anything. The human manually signed out/switched and explicitly reported signing into the dedicated test account. Subsequent auth-only exact identity matched the auth database and differed from that first session. Test marker: **b7196b226aa91c5f**. App/auth canonical databases matched; initial owner-scoped inventory had zero maps, turns and Conversation mappings. No reset was needed. Private identity fields remain Git-ignored.

Native Browser evidence on `e92a44c`: binary clipboard write plus native keyboard paste produced a removable image preview; real reply identified its unique interior fact. Reload retained caption/`Image attached`, with zero preview images. Native plus chooser selected PNG/JPEG/WebP/PDF/genuine DOC/DOCX together; the real reply identified all six interior facts, and reload preserved plain labels without originals. Oversize and aggregate rejection preserved valid files and text. A roughly 4 MB PNG optimized once, showed `Image optimized`, and the real reply read its interior sentence. At 375x812 there was no horizontal overflow; Shift-Tab reached Add attachments, Enter opened the native chooser, and keyboard removal worked. Stop with a newer draft exposed explicit replacement and restored the exact prior caption/document in memory. Screenshots: `.context/attachments/browser-*.png`.

One synthetic Foundation turn was interrupted by Vite's full-page reload when this run edited a client test file during the live request. Its saved evidence survived through the existing cancelled-turn path. This is an induced development interruption, not a successful normal-flow/Stop acceptance claim; further source edits must occur between Browser turns. The earlier immediate Stop occurred before a provider turn was retained, so provider-retained Stop/reload must still be checked explicitly on the corrected candidate.

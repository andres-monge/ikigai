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

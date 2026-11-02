# Nami verification scenarios and coverage

Use [Verify Nami](nami-verification.md) for target/access, real-request policy, recipes, evidence and cleanup. Select focused checks for every behavior change, broaden for the boundary changed or final release, and explain omissions. This matrix is the single maintained check-selection source; current code and active contracts win over dated evidence.

## Choose by change

| Change | Checks and proof |
|---|---|
| UI/routes/public content/theme | Focused `client/src/App.auth.test.tsx`, `pages/login.test.tsx`, `pages/our-vision.test.tsx`, `pages/explore.test.tsx`, relevant `components/explore/*test*`, `lib/theme.test.tsx`; affected rendered local page at desktop/mobile and light/dark as relevant. Inspect affected keyboard/focus/status/tree/contrast/responsiveness. Build for shipped assets/origin. |
| State/history/persistence/cancellation | Relevant `shared/career-map/*test*`, `server/ai/tools.test.ts`, `agent.test.ts`, `history.test.ts`, `cancelled-tool-calls.test.ts`, `server/routes/agent.test.ts`, `client/src/pages/explore.test.tsx`; guarded disposable storage suites for storage changes. Real selected action + canonical receipt/state + Chat/Map reload. |
| Auth/origin/cookies/signup | `server/auth*.test.ts`, `server/app.auth.test.ts`, `server/app.agent-privacy.test.ts`, `shared/app-origin.test.ts`, route ownership/origin/header/media-type tests; exact-origin build/artifact checks. Real Google callback and returning session on intended remote origin before release. |
| Prompt/model/tools/modules | Existing Method loader/evaluation/adoption, briefing/agent/tools tests with fake-model scenarios for invariants; purpose-selected real provider/model evaluation for actual integration/behavior. Record versions, first failure and available usage. No arbitrary new call quota. |
| Packaging/runtime/dependencies/deployment | Node24 type/build checks, relevant existing regression suites, `verify:vercel-preview` and `verify:vercel-production` as applicable; actual function import, five active skills, whole-output privacy and origin audit. After approved prebuilt upload, actual rendered/runtime remote proof. |
| Legacy retirement / API mounts / logging | `server/app.legacy-retirement.test.ts`, app auth/privacy tests, `client/src/App.auth.test.tsx`; retired namespaces return JSON410 for every method before parsing/storage/provider work, even with malformed bodies or agent enabled. Check bearer/content log sentinels, page redirects and current Method/audio guards. Retained module/storage fixtures are compatibility-only; no paid legacy browser run. |
| Docs-only | Links, IDs, source facts and gate coherence. Cold-entry proof when verification instructions change; no automatic paid/full-release replay. |
| Final candidate | `npm run check`, guarded `npm run test:all -- --run` on disposable PostgreSQL, exact-origin `npm run build`, both Vercel target artifact checks, coverage roll-up below and all applicable deployed rows. |

No existing Method Playwright file is assumed: `tests/explore.spec.ts` does not exist. `npm run test:e2e` is disabled after the 2026-11-02 retirement, even with its former opt-in. Historical paid legacy passes do not prove current Method/auth or retirement.

## Final deployed proof

These rows add a compact actual deployed integration proof to deterministic and accepted historical coverage. They remain pending until performed on a specifically approved target/configuration/write scope. Use the designated QA account; preserve its history and choose the smallest additive action from its real checkpoint. Do not restart Foundation just to replay accepted founder coverage.

| Scenario | Action → observable proof | Refresh when |
|---|---|---|
| Public entry | Signed-out landing, direct `/our-vision` load/refresh and same-tab return; Google entry; exact approved share image/absolute tags; mobile light/dark and relevant keyboard/semantic layout checks. | Routes/assets/theme/origin changes; final release. |
| Google and returning session | Real Google callback at the exact origin, visible QA identity and authorized workspace; logout/login and returning-session/reload. No credentials/consent values in evidence. | Auth/origin/config changes; final release. Platform protection alone cannot pass. |
| Meaningful saved turn | From current QA state, send a useful request producing a streamed reply and small additive saved change; match receipt/revision/entity, visible Chat attachment, Map and reload. | Relevant agent/state changes; final release. Real provider/model/DB requests required. |
| Repeating continuation | From an appropriate Guide/Interpret/Design checkpoint, take a legitimate next decision and verify saved next state plus reload. | Relevant loop changes; final release. Accepted founder coverage remains accepted, not replayed wholesale. |
| Stop and recovery | Interrupt a useful turn safely, establish committed truth/status, reload and resume without duplicate mutation. Keep any already committed save. | Relevant stream/cancel/recovery changes; final release. Existing deterministic race tests cover exact timings; live smoke supplements them. |
| Runtime/release linkage | Immutable deployment/project matches checked prebuilt artifact/source/configuration, assets and allowlisted correlated logs; retired page URLs return to login, known retired APIs return JSON410, and agent/signup policy matches approved configuration. | Candidate/target/config changes. Fixture503 is startup-only; broken old production is not fallback. |

For auth-enabled local integration, apply the same real-turn/saved-state/reload standard on `http://localhost:5173` after confirming identity and data ownership. Record it as local evidence. It does not pass the deployed rows.

## Active requirement coverage

The following roll-up classifies **every Method requirement, flow and acceptance example**. The requirement identifiers here refer to [the Method contract](../plans/2026-08-29-1133-feat-revelio-method-plan.md), not a new behavior specification. Grouped ranges cover each member; the tests/evidence are complementary, not claims that every behavior is deterministic. Read the contract's exact rule before modifying it.

| Contract coverage | Status and current check/evidence home | Freshness rule |
|---|---|---|
| R1–R4 philosophy/voice | Active: `docs/thesis.md`, repository Method skill text, `server/ai/method/evaluation.test.ts`, `v6-adoption.test.ts`; qualitative evidence in [accepted founder assessment](../dogfood/2026-10-30-binding-admission-grace.md#founder-u7-acceptance--2026-10-30). | Relevant prompt/module changes need focused live behavioral proof; no fresh pass inferred from source review alone. |
| R5–R12 Foundation | Active: `shared/career-map/reducer.test.ts`, `server/ai/briefing.test.ts`, `selector.test.ts`, `server/ai/tools.test.ts`, `briefing.test.ts`, Method evaluation/adoption; accepted founder assessment. | Focused tests for intent/state changes; relevant live Foundation proof when changed. |
| R13–R17 three distinct unranked Paths | Active: reducer/tools/evaluation/adoption, `client/src/components/explore/purpose-path-card.test.tsx`, `pages/explore.test.tsx`; accepted V6 Paths evidence via founder assessment. | Relevant live/desktop/mobile proof for changed path generation/presentation. |
| R18–R25 and R48 project design/help/updates/later options | Active: reducer/selector/briefing/tools/agent suites, `client/src/pages/explore.test.tsx`; [repeating-loop evidence](../evidence/2026-10-13-repeating-learning-mvp.md) and [conversational-state evidence](../plans/2026-10-29-1119-fix-conversational-project-state-plan.md). | Changed write/continuation behavior needs real scoped action + persisted state/reload; retain historical evidence only for unchanged scope. |
| R26–R33 reflection/Next Move/focus | Active: reducer/selector/briefing/tools/agent/evaluation suites and repeating-loop evidence; approved Interpret decision guidance remains normative. | Changed qualitative reflection/decisions require focused live proof; final release uses a legitimate existing QA continuation. |
| R34–R40 formal Peers/proof/Side Doors | Deferred: [deferred features](../method/deferred-features.md); no registered modules or MVP gates. | Preserve historical records/compatibility tests. External-action control remains active independently of these deferred IDs. |
| R41–R43 canonical state/cards/Markdown/status | Active: storage career-map, route/history/streaming schemas, `client/src/pages/explore.test.tsx`, `method-map.test.tsx`, `purpose-path-card.test.tsx`, `safe-message.test.tsx`, interaction-ownership tests. | Changed boundaries need appropriate deterministic chain plus actual UI/canonical/reload proof. |
| R44–R46 five modules/state selection/strict calls | Active: Method loader/adoption/evaluation, selector/reducer/schema, agent/tools/route suites; actual packaged function check loads exactly five skills. | Relevant code/module/build changes; final candidate artifact checks. No new classifier or research-write authority. |
| R47 repeating MVP scope | Active: selector/reducer/loader/adoption and repeating-loop evidence; active/deferred contract audit. | Scope/module/compatibility changes. |
| F1–F3 Foundation/first project/repeating loop | Active: combined checks above, accepted founder U7 evidence and repeating-loop evidence; compact deployed saved-turn/continuation rows. | Relevant flow changes and final candidate; not a full historic lab replay. |
| F4–F5 formal tail | Deferred; retained reference and historical records only. | Never a deployment/resume gate. |
| AE1–AE2 sufficient Foundation/fallback | Active: Foundation evaluation/adoption/agent tests and accepted founder evidence. | Relevant interview/prompt changes. |
| AE3–AE4 path reaction/replacement | Active: Paths evaluation/adoption plus reducer/tools and accepted V6 evidence. | Relevant path/prompt/state changes. |
| AE5–AE6 first-project replacement/unrelated choice | Active: project reducer/tools/agent/evaluation, repeating-loop/conversational-state evidence. | Relevant design/relationship behavior; real scoped proof when changed. |
| AE7–AE9 reflection/focus with continued learning | Active: reflection/Next Move reducer/tools/agent and repeating-loop evidence. | Relevant reflection/decision changes; selected release continuation. |
| AE10–AE12 formal tail | Deferred; detailed references retained, no MVP acceptance gate. | Compatibility remains covered; formal workflow is not run. |
| AE13 canonical state separate from prose | Active: storage/route/tools/history/UI receipt, card-attachment and error-reconciliation tests plus real saved-turn/reload row. | Any related state/presentation change; final release. |
| AE14 exactly three later projects | Active: repeating-loop reducer/selector/tools/agent/UI fixtures and historical loop evidence; relevant live continuation. | Relevant later-choice change; final release continuation from available checkpoint. |

### Cross-cutting revamp safeguards

The [active revamp authority](../plans/2026-08-14-claude-feat-revelio-revamp-plan.md) additionally retains these checks. Its older per-amendment sample caps and stop conditions describe their historical work windows; the current deliberate-live-testing rule in the guide governs this kit. Preserve current runtime/security guards without inventing a new tight call quota.

| Concern | Current proof / disposition |
|---|---|
| Google, signup, ownership, origin/header/media type | `server/auth*.test.ts`, `app.auth.test.ts`, `app.agent-privacy.test.ts`, route tests, `shared/app-origin.test.ts`; actual exact-origin callback/session remains deployed proof. |
| Storage/schema/atomicity/idempotency/erasure regression | Guarded `server/storage*.test.ts`, existing migration/predecessor/fault/repair fixtures and erasure failure/retry coverage. Reviewed existing schema is retained; this kit authorizes no production migration. |
| Cancellation, committed-save/reply failure, history/compaction | Agent/route/history/cancelled-tool-call/streaming/UI suites; live Stop/recovery and canonical reload observations. |
| Input/attachments/mic/legacy en-es | Existing chat-attachment/prepare-attachment/Method-transcription/speech-hook suites; legacy retirement route/log/page tests replace public questionnaire availability. Direct legacy module tests remain compatibility fixtures. No new attachment or voice framework. |
| Semantic accessibility and presentation | Existing component assertions plus affected keyboard/focus/status/live-region/tree/contrast/responsive checks. Manual screenreader/spoken-navigation release requirement is **removed, not passed**. |
| Pilot notices and whole-account operations | Invitation/contact/review notice preparation waits for outreach; additional whole-account erasure tooling/runbook/dry run waits for a deletion request. Both are **deferred, not passed**, and do not block MVP release. Existing deletion/private-output/security protections remain. |
| Accepted founder U7 | Accepted 2026-10-30 at the linked founder record. Do not reopen personal-session acceptance for this kit; fresh final-candidate and deployed evidence are separate. |
| Branding/public origin/share assets | [Rename checklist](nami-rename-release.md) and [public-entry receipt](../evidence/nami-public-entry/verification.md), current focused tests/build plus actual deployed public entry. Local historical receipts do not prove current remote health. |
| Reporting/private output | Existing reporting suites, explicit target/cohort/participant selection, partial-history truth and enforced `.context/early-access/` registration. Confirm QA excluded from any participant report used as release evidence. |

## Prove the guide itself

After both runbook pages exist, give a fresh read-only agent only `AGENTS.md` and representative UI, persistence, auth/origin, prompt/model, packaging and docs changes. It must find this matrix, select appropriate checks and distinguish local from deployed evidence. Do not write automated tests that mirror prose.

Then follow the guide's local Launch → Doctor → public Drive → Evidence → Cleanup once. Add one selected real auth-enabled Method turn with canonical/reload proof when safe QA access is available; otherwise record its exact blocker, not a mocked pass. Verify retained proof survives cleanup.

Use source review and existing fixtures or synthetic receipt examples for these negatives; do not corrupt real QA data or intentionally generate runaway spend:

- Wrong PID/cwd, alias/source linkage or origin blocks drive before mutation.
- Invalid/expired session or wrong visible identity blocks writes; platform access cannot substitute.
- Partial provider history remains Partial, even if the map was fetched.
- Committed canonical save plus failed narration records both truths. Visible success without persisted revision fails. Unknown refetch truth cannot pass recovery.
- First failure survives cleanup, along with the causal fix/regression and later result; unrelated processes/history survive.
- A deliberately selected live test may make multiple progressing paid calls. Lack of progress, blind retries or unexpected-cost behavior stops/notifies under the guide; no quota system is added.

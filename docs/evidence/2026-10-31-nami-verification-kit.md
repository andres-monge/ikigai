# Nami verification kit — local delivery evidence

2026-10-31, integration worktree `c615`, branch `codex/revelio-revamp-integration`, baseline `8ed30d5b2968a1eb490b11aba966a0adb690cc1f`. Node 24.19.0. The implementation changed verification docs and the opt-in legacy Playwright configuration; application runtime code was unchanged. The offered founder release-scope amendment and planning/review artifacts are task-owned and retained.

## Delivered

`AGENTS.md` leads to [Verify Nami](../runbooks/nami-verification.md) and its [scenario/active-ID matrix](../runbooks/nami-verification-scenarios.md). The guide covers Launch/Doctor/Drive/Evidence/Cleanup, deliberate real requests, safe QA/optional 1Password bootstrap, canonical saved-state/reload proof, first-failure diagnosis and actual CE workflow fit. The matrix classifies every Method R/F/AE including deferred tail IDs and distinguishes local/fixture/accepted historical/deployed proof.

Current revamp and Method release wording points to the actual checks, removes nonexistent Method Playwright coverage, retains security/deletion/cancellation regression tests, and records the manual screenreader requirement as removed, not passed. Outreach preparation and additional whole-account operational erasure preparation remain deferred at their actual triggers.

The legacy browser command now requires explicit opt-in, the existing local disposable database guard and explicitly supplied Gemini credentials/model. It uses 5173, refuses unknown server reuse, runs serially without automatic retries and stores reports/screenshots/results under ignored `.context/revelio/legacy-e2e/`. This preserves deliberate paid full-journey testing and protects accidental/default invocation; it is not a new runtime quota or auth provider.

## Verification

| Check | Actual result |
|---|---|
| Typecheck | `npm run check` passed under Node 24. |
| Guarded full suite | Disposable PostgreSQL 14.18, owned temporary cluster, `npm run test:all -- --run`: 74 files passed, 1,124 tests passed, 1 skipped; 64.47s. Real app/provider credentials scrubbed by existing launcher. Owned cluster stopped and directory removed. |
| Origin build | `BETTER_AUTH_URL=https://heynami.vercel.app npm run build` passed. Origin is a fixture/build input, not live deployment proof. Existing Browserslist/bundle-size warnings remain. |
| Default paid harness | `npm run test:e2e -- --list` failed before startup with the explicit opt-in explanation. Expected negative, not a product failure. |
| Explicit safe discovery | With opt-in, disposable listing URL and fixture provider values, `--list` passed and listed exactly the labelled paid legacy journey. No browser/server/model run. |
| Wrong database target | A synthetic nonlocal `db.invalid` URL was rejected by the reused database guard during config loading, before network/database/provider access. |
| Occupied 5173 preflight | Against this run's known owned app listener, fixture-only opt-in invocation refused reuse with “already used” before tests/providers. The listener PID remained 30260. |
| Cold entry | A fresh read-only agent started only at `AGENTS.md`, found both pages, correctly selected UI/state/auth/prompt/packaging/docs evidence and the deliberate-paid policy. It read no planning artifacts and found no broken runbook Markdown links. |
| Public browser | Signed-out isolated IAB rendered landing/login, navigated to `/our-vision` in the same tab, and direct refresh retained the essay. Enterprise-approved HTTP localhost 5173 used. |
| Real local Method | One deliberate live UI turn on designated QA, canonical revision 32→33, completed project, exact operation receipt, then Chat/Map reload agreement. Details below. |
| Negative evidence semantics | Existing passing reporting/route/UI tests retain partial provider-history truth, invalid-session/owner/protocol failures, failed narration after committed save, cancellation/refetch-unknown and exact attachment checks. Guide source/cold-read proof requires blocked wrong target and explicit partial/failed outcomes; no QA data was corrupted to manufacture negatives. |
| Whitespace/source checks | `git diff --check` passed. Existing concrete test files and runbook Markdown links checked. No tests that mirror prose were added. |

Private raw evidence is in `.context/revelio/verification-kit-20261031/`: full-suite/build/server logs, before/after metadata summaries, legacy conflict/unsafe-target outputs, cold-entry proof and `qa-map-completed.png`. No full database or provider Conversation export was retained. No cohort report supplied this receipt, so no participant/cohort export was run; the guide requires QA exclusion in any selected cohort used for release evidence.

## Deliberate live proof

The existing Chrome **QA** connection showed `konfidenz.clothing@gmail.com`; a fresh reload revalidated the session. Port5173 was free before this run; owned Node process 30260 served the integration cwd with `BETTER_AUTH_URL=http://localhost:5173`, `AUTH_SIGNUPS_ENABLED=false`, `AGENT_ENABLED=true` and diagnostic build label `nami-verification-kit-8ed30d5-dirty`. The existing approved private environment supplied credentials without printing/copying their values. Its database is remote; isolation was the designated account and owned additive action, not a separate database.

Baseline canonical read used the existing read-only reporting source, exact-email identity resolution and participant-scoped snapshot, retaining only metadata. The QA map was revision 32, with Path Project 2 “A Self-Serve Materials Spot” in progress. Through the visible composer, one explicitly fictional QA work report requested completion while retaining the brief and earlier learning and not adding reflection.

The real streamed reply confirmed completion. Canonical follow-up showed exactly one new history row: `update-project-work-status`, base 32/result 33, accepted project `project-self-serve-materials`, work status `completed`, reflection count 1. Turn `a869c7c8-9eb3-4c34-801a-5a5b1e1bbaeb` completed. Module `guide-path-project@1.0.2` remained active. Reloaded Map showed **WORK: COMPLETED** and the original developed brief; reloaded Chat retained the completion reply. Screenshot and metadata are private at the paths above. No founder records, QA reset, provider-history export or further model turn was used.

Selected model: `gpt-6.1-sol`, from the current route/agent constant. Available server diagnostics: provider `openai-responses`, 2 steps (`tool-calls`, `stop`), 169,004 input tokens, 100 output tokens, 0 reported reasoning tokens, usage reported, 30,425ms. This is available usage, not a price calculation. The long existing Conversation supplied context; the selected action progressed and completed without retry. Browser streaming/final UI and persisted/reload proof supplement the server log's `browserDelivery: unknown`; that field alone was not treated as delivery evidence.

## Simplification and review

The configuration reuses the existing disposable-URL validator; no readiness probe, orchestration CLI, framework, quota system or extra regression suite was added. The substantive code is a small config guard; the remaining object changes are configuration and test-label/artifact-path corrections. The dedicated simplification threshold is not met by substantive code, so a manual reuse/quality/comment pass was used. It retained all safety checks and proof tests and corrected the inherited parallel-run comment. No lint script exists.

Actual scoped `ce-code-review` completed with seven local lenses and independent Claude Opus 5.5 (served exact model; low effort requested, actual effort unverified). Its [unmodified receipt](2026-10-31-nami-verification-kit-code-review.json) recorded one confirmed P2: `npm run dev` selects Neon's WebSocket driver for the required ordinary local PostgreSQL fixture. Listing/occupied-port checks did not exercise that query path.

The finding was applied inline: the harness now launches `node --import tsx server/index.ts` with `NODE_ENV=test` and explicit validated disposable settings, reusing the existing native PostgreSQL branch and serving the built client. The guide records the required exact-origin build first. No product database code changed. [Resolution receipt](2026-10-31-nami-verification-kit-code-review-resolution.json) retains the pre-fix actual local-driver failure (`ErrorEvent`), then the post-fix actual config-driven server proof: built `/legacy` 200 and DB-backed missing-session 404 on the migrated fixture, with 0 provider calls. Node 24 typecheck passed again after this config fix. The additional owned server/cluster were stopped/removed; evidence survived and ports 5173/65432 were empty. No actionable findings remain. Code review is not deployed verification.

## Cleanup and limits

The owned disposable PostgreSQL cluster stopped and its directory was removed. The owned main Node process 30260 was stopped; 5173 and 65432 had no remaining listeners. The owned public IAB tab was closed. All nine named raw proof files remained nonempty after cleanup, recorded in `cleanup.json`. The pre-existing QA tab and account history stay intact, with Chat/light/empty-draft state restored. No viewport/theme changes were made. A tracked generated HTML report touched by the pre-change discovery baseline was restored byte-for-byte from HEAD; the new harness directs future reports into its ignored namespace.

**Kit locally proven; deployed release verification pending.** No production/preview deployment, remote configuration/domain/access-policy change, main merge, push or PR occurred. No new Google OAuth round trip, deployed Method turn, full paid legacy journey or real cancellation race was claimed; existing deterministic race coverage passed. Vercel artifact checks are inherited packaging evidence for unchanged runtime code, not freshly rerun final-candidate/deployed gates in this kit delivery.

Read-only Vercel 65.2 inspection resolved `https://heynami.vercel.app` to production deployment `dpl_DmL7cpzMXz7xbp9qpae7CHAyKPvJ`, created 2026-09-03, in linked project `prj_sVqqIBKF1Q2lViOpvlUlFGmkvMT6`. “Ready” is Vercel platform status, not proof of Nami functionality, source parity or a known-good rollback.

Before remote authorization, prepare the checked Node 24 prebuilt candidate and exact source/artifact/configuration linkage; confirm production `BETTER_AUTH_URL=https://heynami.vercel.app`, exact Google callback, auth schema/cookies/provider/agent/signup policy and domain aliases through sanctioned read-only inspection. Propose only the designated QA account, its now-completed second-project checkpoint and smallest legitimate additive next action; preserve history. Identify platform OIDC/Trusted Sources and actual Google/2FA bootstrap needs, then request approval for the concrete deployment/configuration and production-write scope. Stop invitations on a failed candidate; existing agent/signup kill switches and a known verified artifact require explicit change authorization. The old September deployment is not assumed recoverable. All six deployed rows remain pending until actual authorized proof.

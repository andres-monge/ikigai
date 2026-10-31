---
title: "refactor: Rename Revelio to Nami on the integration branch"
date: 2026-10-31
type: refactor
artifact_contract: ce-unified-plan/v1
product_contract_source: 2026-10-24-2337-refactor-rename-revelio-to-nami-plan.md
execution: code
---

# refactor: Rename Revelio to Nami

## Goal Capsule

- **Objective:** Present the product and agent as Nami, use Nami for current code identifiers and configuration, and make the future production origin configurable while preserving existing behavior and data.
- **Authority and continuity:** This refresh carries forward the founder-settled decisions in the October 24 plan at `/Users/andresm/Documents/Cursor Projects/ikigai/docs/plans/2026-10-24-2337-refactor-rename-revelio-to-nami-plan.md`. That dated plan remains historical evidence. `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md` remains the revamp implementation authority until its Definition of Done is met, and `docs/thesis.md` remains Method authority. Existing code and tests define current behavior.
- **Execution base:** `codex/revelio-revamp-integration` at `542a6c6` in the c615 checkout. The earlier instruction to wait for U7's merge to `main` is superseded for this scoped local work: U7 was accepted October 30, U8 is operational, and the integration branch contains the current behavior. Implementation stays on this branch, with scoped local commits; no merge into `main` is part of this plan.
- **Stop point:** Locally verified, reviewed, simplified, committed identity changes and a truthful release checklist. A production domain/config change, deployment, main merge, PR, or live user data migration is separate work requiring separate authorization.

## Product Contract

### Settled decisions

- R1. The product name is **Nami**. `heynami.vercel.app` is the selected free production origin, subject to read-only verification of its current Vercel state before any future cutover. Production origin is a single setting so later domain changes do not require source edits.
- R2. Current user-facing copy, agent self-identification, maintained docs, persona agents, package identity, and current internal symbols use Nami. The `ikigai` repository and folder keep their names. Dated historical docs, transcripts, private QA records, and provider history retain their original meaning and names.
- R3. Restore the compass favicon, `.ico`, and Apple touch icon, matching the selected teal compass treatment. Keep palette, typography, layout, and existing in-app compass unchanged.
- R4. This is an identity change only. Preserve the current Method voice, Paths, projects, reflection rules, versioning, auth, ownership, provenance, cancellation, compaction, legacy behavior, history rendering, and reporting/erasure protections.
- R5. The public landing/header/login redesign, login-friction research, OG-image redesign, public-thesis/Our Vision tab, formal Peers/proof/SideDoors work, production cutover, and deployment are outside this work.

### Current inventory and boundaries

The October 24 plan predates several code changes. `server/ai/method/base-instructions.ts` is at `BASE_INSTRUCTIONS_VERSION = '1.1.12'`; its five canonical skills have independent current versions. Never replace these with the old `1.0.1` recipe. The active function-package verification in `docs/runbooks/vercel-function-packaging.md` and `scripts/check-vercel-function.mjs` protects the Node 24 ESM `.js` imports and exact five-skill bundle from `542a6c6`.

The current name inventory includes user-facing components in `client/index.html`, `client/src/pages/{login,explore}.tsx`, `client/src/lib/i18n.ts`, `client/src/components/explore/`, PDF footers, `server/auth.ts`, `server/ai/{briefing,transcription}.ts`, the base instruction and one current Method skill. Protocol and source symbols include `x-revelio-request`, `x-revelio-client-ip`, `RevelioAuth`, `RevelioUIDataTypes`, `REVELIO_AGENT_*`, `REVELIO_MAX_*`, `REVELIO_COMPACT_THRESHOLD`, `REVELIO_LATENCY_TRACE`, `VITE_REVELIO_LATENCY_TRACE`, `REVELIO_BUILD_VERSION`, `REVELIO_ENV_FILE`, and the eval-only `REVELIO_METHOD_MODEL`/`REVELIO_METHOD_TIMEOUT_MS`. Audit scripts, tests, `.env.example`, `package.json`, lockfile, `CONCEPTS.md`, `AGENTS.md`, `docs/thesis.md`, and maintained runbooks alongside code. The old plan's assertion of only two relevant environment variables is obsolete.

Names embedded in durable or externally held values need separate treatment. `client/src/lib/theme.ts` stores `revelio-theme`; `server/ai/history.ts` writes provider metadata `product: 'revelio-method'`; citation URL/data markers in `safe-message.tsx`, operation source IDs, schema versions, receipt fingerprints, and private artifact paths may have persisted references. Do not blindly replace these or the text in existing maps, history, transcripts, replay fixtures, or private output. Inspect read/write consumers and choose the narrowest compatibility behavior before editing. If the theme key is renamed, read `revelio-theme` as a fallback and write the Nami key going forward, with a test seeded from the old key; no broad compatibility framework or user-data rewrite.

## Planning Contract

- KTD1. **One origin, fail closed.** `BETTER_AUTH_URL` is the single configured origin for server auth, the Method POST guard, and build-time public share URLs. Production and Vercel preview must require a valid explicit origin; the approved `localhost:5173` expectation applies only to positively identified local development/test. A Vercel runtime cannot silently fall back to localhost even if `NODE_ENV` is misreported. Use the configured exact origin for Better Auth `baseURL` and `trustedOrigins`; derive OG/Twitter URLs from the same validated value at build time and check generated URLs in the artifact. Local artifact verification can supply a fixture origin without changing Vercel settings. Do not weaken CSRF, origin, preflight, signup, cookie, or IP trust checks; leave OG imagery itself unchanged.
- KTD2. **Atomic protocol rename.** Update `X-Revelio-Request` and `x-revelio-client-ip` on all client/server producers and consumers, CORS settings if applicable, and tests as one unit. Old header variants must be rejected on the guarded Method route. The trusted client-IP header remains server-overwritten before Better Auth sees it; an untrusted inbound header cannot select the client IP.
- KTD3. **Current identity versus history.** Rename current source symbols, script filenames where used by maintained commands, current log/config identifiers, and UI labels. Preserve stored map schema, operation identity, receipt/provenance strings, source markers that reconstruct existing history, and deletion mappings. Change provider metadata for newly created conversations only if reads/deletion/reporting do not use it for old ones; otherwise retain that marker with an explicit explanation. Historical records can still say Revelio.
- KTD4. **No Method redesign.** Change the agent self-name and maintained guidance mentions without changing substantive behavioral instructions. Bump the base instruction version from its current value by the project's version convention only when a prompt payload actually changes; leave independent skill versions alone unless their shipped content changes. No before/after model matrix is required for the cosmetic rename.
- KTD5. **Local integration workflow.** Work and commit on the clean c615 integration checkout, preserving other worktrees and unrelated WIP. If its state changes before implementation, inspect the diff and adapt rather than stash/reset/discard. No default-branch write or merge.

### Dependencies and release boundary

The source change and a local production-target artifact check can finish without a live domain cutover. Later release work must verify the actual Vercel domain/alias state, Google authorized callback `https://heynami.vercel.app/api/auth/callback/google`, OAuth consent name, production `BETTER_AUTH_URL` and build-time public origin, cookie/session re-entry behavior, redirect strategy for the old domain, and production deployment health. `localhost` login cannot prove the Google production callback. The September 3 production deployment remains an unverified runtime for this rename; the Node 24 packaging repair was proven on isolated preview, not production recovery. Do not modify alias, Vercel/Google settings, secrets, or production in this plan.

## Implementation Units

### U1. Characterize the identity and persisted-value boundary

- **Files:** Current matches across `client/`, `server/`, `shared/`, `scripts/`, `docs/`, root config, and their focused tests.
- **Work:** Classify every current `Revelio`/`REVELIO`/`revelio` match as current copy/symbol/config, durable value, historical evidence, or unrelated legacy terminology. Trace readers for theme storage, citation markers, provider metadata, receipt/source identity, and reporting output before editing. Record any retained legacy names in the final checklist so residual search results are understood.
- **Proof:** Inventory explains each intentionally retained occurrence; no persisted state or private record is bulk rewritten.

### U2. Configure origin and preserve auth boundaries

- **Files:** `server/auth.ts`, `server/routes/agent.ts`, `client/index.html`, `.env.example`, relevant auth/route tests and build config.
- **Work:** Remove the hardcoded production auth fallback. Validate the configured Vercel preview/production origin before constructing auth options or permitting Method POST; keep the exact-origin guard. Derive public OG/Twitter URL fields from that same build-time origin without changing the image. Document future callback and redirect prerequisites separately from local implementation.
- **Proof:** Missing/malformed Vercel origin fails closed even with a misleading `NODE_ENV`; local origin works only in local development/test; generated share URLs match the validated origin; cross-origin, absent-origin, forged IP, and preflight requests remain rejected or safely handled as before. U3 proves rejection of the superseded header.

### U3. Rename current code and presentation together

- **Files:** `client/src/pages/{explore,login}.tsx`, `client/src/lib/{i18n,theme}.ts`, `client/src/components/explore/`, `client/src/hooks/use-speech-to-text.ts`, PDF components, `server/{auth,auth-middleware}.ts`, `server/routes/`, `server/ai/`, `shared/streaming-schemas.ts`, maintained scripts, and matching tests.
- **Work:** Update labels, names, current symbols, headers, dev trace/build-version/reset/eval variable names, package name/lockfile, and maintained command references. Make the client/server header and private-IP rename atomic. Preserve stable durable values unless U1 proves a narrow compatibility transition. If renaming `revelio-theme`, read it as a fallback and write only the Nami key thereafter. Check Spanish phrasing. Keep Method rules and current model/limits exactly intact.
- **Proof:** Focused unit and integration tests cover auth, guard, session and ownership, history and replays, drafts/theme (including a seeded legacy theme key), citations, latency trace, reset script, and reporting/erasure. New configuration names work and old protocol headers are rejected.

### U4. Restore compass assets and maintain living guidance

- **Files:** `client/public/favicon.svg`, `client/public/favicon.ico`, `client/public/apple-touch-icon.png`, `AGENTS.md`, `CONCEPTS.md`, `docs/thesis.md`, maintained `docs/dogfood/README.md` and `docs/dogfood/method-reset.md` where operational instructions change, `.claude/agents/`, runbooks and current scripts. Dated records and old plan filenames remain.
- **Work:** Restore the earlier compass SVG and regenerate the two raster icons from it; inspect generated sizes/appearance. Update living naming and executable instructions with a concise former-name note in `AGENTS.md`. Keep history, dogfood evidence, dated plans, replay captures, and ignored private output intact.
- **Proof:** The three shipped icons depict the same compass; maintained command docs point to existing renamed scripts/config; historical references remain comprehensible.

### U5. Verify, simplify, review, and commit locally

- **Files:** All changed files and `docs/runbooks/vercel-function-packaging.md` as the release-check authority.
- **Work:** Run the verification contract below. Inspect the final diff for accidental Method, auth, history, or privacy changes, simplify needless compatibility/code churn, and perform `ce-code-review` on the scoped diff; resolve material findings, repeat only affected checks, and make scoped local commits. Report any release checks that cannot be proven locally.
- **Proof:** Check/build/tests, browser QA, and safe Vercel artifact checks pass, or unavailable gates are reported as unmet release checks with evidence, alongside a review receipt and commits on the integration branch. No merge, push, PR, deployment, or live data mutation.

## Verification Contract

| Check | Evidence required |
| --- | --- |
| Static and deterministic | Node 24 `npm run check`, `npm run build`, focused auth/agent/history/client/theme/PDF/reporting tests, then `npm run test:all` where applicable. Use disposable local PostgreSQL for storage tests, with an explicit target guard; never write to live or founder databases. |
| Protocol and security | Tests show exact configured origin; old request header denied; new header accepted only with valid origin and content type; inbound client-IP spoofing fails; signed-out, session, ownership, privacy, cancellation, compaction, replay and erasure behavior still pass. |
| Actual browser QA | Use bundled `@Browser` through `mcp__cua_repl` only. Confirm the allowlisted `localhost`/`127.0.0.1:5173` origin and actual browser profile/app identity first. Reuse the regular Chrome QA account `konfidenz.clothing@gmail.com` if available; never touch the founder account. Check header, login, chat, map, history, reload, theme and current protocol. Existing historical text may still say Revelio. Ask for a restart window only if the current 5173 listener actually needs replacement; use 5174 solely for the lab. |
| Vercel local artifacts | Follow `docs/runbooks/vercel-function-packaging.md`: Node 24 `verify:vercel-preview` and `verify:vercel-production` using a process-scoped safe fixture origin/environment and the linked project. Verify generated share URLs match that origin, the actual function imports, five canonical `dist/method-skills` load, signed-out 503 holds, and the full output private-path/secret audit passes. Preserve the `542a6c6` ESM `.js` and packaging repairs. Do not deploy. |
| Scope audit | Review `git diff`, current-name search, scripts/config references, package lock, docs, icon assets, and retained legacy occurrences. No new model matrix, paid experiment, outreach, shared document write, production config edit, or private data commit. |

## Definition of Done

- D1. Nami appears on every current product surface and in maintained guidance, package identity, and current internal names; deliberately historical or durable old identifiers have a documented reason and compatible readers.
- D2. Production origin is explicit and fail closed; origin/header/IP protections and existing auth/session/ownership behavior are verified. The client/server protocol change is atomic.
- D3. Compass icons agree; palette, fonts, layout, OG image and Method behavior remain the same apart from identity wording and warranted version changes.
- D4. Node 24 check/build, relevant tests, actual browser QA, and safe local Vercel preview plus production-target function checks pass, or any unavailable gate is reported as an unmet release check with evidence.
- D5. Final simplification and `ce-code-review` findings are resolved; scoped local commits exist on the integration branch. The release checklist clearly separates local completion from production callback, config, domain, and deployment verification.

## Appendix

The October 24 plan recorded `heynami.vercel.app` as selected and later annotated it as the sole production domain with the old alias temporarily mapped. Current domain state has differed across reports; treat that annotation as historical, verify read-only when release work begins, and do not infer availability or live auth health from it. Its earlier U7-first/main-final sequence is replaced here by local integration-branch execution because this branch now carries accepted U7 and subsequent fixes. Its icon, name, package/repo, and history decisions are unchanged.

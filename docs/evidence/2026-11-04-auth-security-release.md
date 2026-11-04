# Auth-only release candidate — 2026-11-04

**Local candidate prepared; deployed release verification pending.** Nothing was pushed, merged, uploaded, promoted or changed in remote configuration. The managed worktree is `/Users/andresm/.codex/worktrees/auth-security-release/ikigai`, branch `codex/auth-security-release`.

## Exact composition

Implementation source: `958f59e752cf6438bb89aed5d106569081a3aca3`. Base: `4e42971b42dfda5cce82eab7dbc8262bb696e176` (`origin/main`), whose runtime code matches deployed source `4464570`; the intervening differences are release evidence/runbook documentation. Three explicit `cherry-pick -x` commits retain their original provenance:

| Reviewed source | Auth-only commit | Change |
|---|---|---|
| `2c3899e8638c8077aabb79e328e3df8af00dc2e4` | `a2f306220bf6c0fd774fe9a6a2998696f2204b51` | Better Auth 1.7.16 and native PostgreSQL compatibility/admission tests |
| `1652692456193d114a583c9cc018963972dc69d5` | `133b940e72525efecbf574525f81538b02ebb6e8` | Express 4.22.3, root body-parser 1.20.9 and compressed-request crash regression |
| `b4700f63903fdf199460607cadd3729f433e25b3` | `958f59e752cf6438bb89aed5d106569081a3aca3` | Independently seeded expired-counter proof |

The runtime/test diff contains exactly `package.json`, `package-lock.json`, `vitest.config.ts`, `server/auth.storage.test.ts` and `server/app.compression.test.ts`. Auth configuration, application mounts, schema, migrations, Method content and other product source remain the baseline's. **No undeployed feedback route, UI, email transport, migration 0002 or operator tooling is included.** Original `main` at `b8c2973` and `codex/auth-dependency-followup` at `9fca157` remain untouched, including the original checkout's three unowned document edits and fingerprints.

The lockfile and both regression tests are byte-identical to the resolved reviewed source. Aggregate added/removed lines match for all five files; manifest scripts and Vitest context retain the older baseline without feedback. Targeted CE 3.35.1 composition review found no conflicts or findings. No new behavior was authored, so no duplicate simplification or external peer pass ran. The original full review at `1652692`, Claude Opus 5.5 pass and validated expiry-test resolution at `b4700f6` remain inherited evidence, with their original coverage limits.

## Combined-tree verification

Node 24.19.0 ordinary `npm ci` (scripts disabled) and targeted `npm ls` passed without force/legacy/peer-ignore flags. All 1,038 dependency entries resolve publicly; no private package metadata or credentials were sent, and npm configuration remained command-scoped.

Focused auth/privacy/retired-route/origin/compression checks: **107 passed in 10 files**. Typecheck and exact-origin build passed. The first full run reported 1,148 passes, one failure and one optional skip because this fresh worktree lacked generated `dist/method-skills` required by an existing production-mode route fixture. The existing build generated those assets; the two affected trace cases then passed independently. The subsequent full run passed **1,149 tests in 78 files, with one optional production-loader smoke skip**. No test or production source was changed to resolve that build prerequisite; both first failure and superseding proof are retained.

Both actual Vercel package targets are checked at the implementation source above. The production artifact identity and hashes are in the companion JSON receipt. The checker proves isolated Node 24 function import, five canonical Method skills, signed-out fixture boundary, retired JSON 410 routes, whole-output private-path/selected-secret audit and exact public origin. These are packaging/fixture checks, not live auth readiness. This baseline contains no feedback package checker because feedback is deliberately excluded.

The original dated dependency inventory remains at commit `9fca157`, paths `docs/evidence/2026-11-04-dependency-inventory.md` and `.json`, with the twelve-publisher-advisory matrix and follow-up report alongside. The identical lock graph retains **51 affected-package records** and its classified unresolved risks; this candidate is not an all-clear dependency audit. Native pg remains selected; the unused overridden Drizzle adapter peer debt remains disclosed. Core schema/configuration are unchanged. Existing sessions/cookies were locally compatible; pre-upgrade in-flight OAuth state must restart. Successful Google account/token/session writes and concurrent first-use/expired-window/state-callback cases remain outside fixture coverage.

## Bounded approval bundle and access prerequisites

The intended project is `prj_sVqqIBKF1Q2lViOpvlUlFGmkvMT6`, org `team_p9wpR2jCRajYNipAD0qho4ex`, public origin `https://heynami.vercel.app`. Fresh read-only inspection on November 4 still reported READY deployment `dpl_CHZNBNyNwZL5J65P5GtvTUbwkmNk`. Local builds reused its previously checked private project/build configuration through ignored local links; no `vercel pull`, relinking, token minting or remote setting change occurred.

Before any protected upload, establish a legitimate supported rendered-QA path. The supplied visible Chrome **QA** window does not provide an owner-supplied exact CLI profile locator. The owner must identify an approved persistent agent-browser profile outside Git with a legitimate platform session, or explicitly accept human-rendered proof tied to the exact deployment. Do not attach through CDP, export cookies or assume the profile label proves identity. If short-lived OIDC is chosen, the inherited November 2 development→production environment mismatch requires an owner-authorized/confirmed same-project mapping in **Vercel Settings → Deployment Protection → Trusted Sources**; this task neither retested nor changed that policy. Any new immutable origin also needs enterprise approval. These are identified pre-upload prerequisites, not fresh access passes.

A future approval should identify this exact prebuilt candidate and unchanged production runtime configuration, permit the scoped read-only duplicate `(providerId, accountId)` check on the intended auth target, and cover fresh Google callback, designated QA identity/workspace read, logout/login and returning-session reload. The installed CLI supports `vercel deploy --prebuilt --prod --skip-domain --yes` to upload a production-target candidate without automatically moving public aliases; it was **not run**. Recheck artifact/source identity and package audit immediately before an authorized upload. Promotion may occur only within explicit release authorization after the required gates pass. No feedback activation, email/domain/config/schema change, data reset, unrelated Method journey or exploit against production is included.

Private source diff/binding, logs, review, access preflight and artifact receipts are under `.context/revelio/auth-security-release-20261104/` in the managed worktree. The owned fixture cluster was stopped with zero leftover child databases and only its own files removed; the pre-existing cluster was untouched. No browser, provider, Google login or production database query ran. The worktree remains available for owner review and any separately authorized release.

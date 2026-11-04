# Security-only production promotion — 2026-11-04

**Live at the public origin; fresh designated QA authentication verification pending.** The founder supplied a screenshot of the exact staged login URL rendering Nami. The coordinator accepted that as human-rendered stage proof, completing the prepromotion gate. It is not recorded as an automated authenticated browser pass.

The already approved deployment **`dpl_DwwB53jRiUk6PV6EWzzcPYoGf5aR`** was promoted with `vercel promote` after rechecking READY status, project, Node 24, unchanged environment/protection metadata, old public alias and the approved artifact hash. **No rebuild or new upload occurred.** The alias API now binds [heynami.vercel.app](https://heynami.vercel.app) to that exact deployment. Project is `prj_sVqqIBKF1Q2lViOpvlUlFGmkvMT6`; target is production and state is READY.

Runtime source remains `958f59e752cf6438bb89aed5d106569081a3aca3`, with 2,690-file manifest `0ef455cdc5310bcbf9aafe9af8594306dec274d9073357efb991b3f1bdcceb66` and archive SHA-256 `689fd89a97b55eaa2333fc77f4c5726b89c9eeec0e5dc06f72d8e999d2556928`. The deployment's CLI Git label `4ed36a4` adds only the headless-verification runbook rule. Later evidence commits are also documentation only. [Candidate composition](2026-11-04-auth-security-release.md) and [stage evidence](2026-11-04-auth-security-stage.md) preserve ancestry, reviewed fixes, full local verification, read-only compatibility and first-failure diagnoses. No feedback/email feature, migration 0002 or other product change is included.

## Fresh public checks

- **Pass — exact deployment:** public alias resolves to the promoted immutable ID; Node 24, all 16 environment metadata records and existing protection are unchanged. The existing automation-access entry count remains one; none was created or rotated.
- **Pass — unauthenticated public HTTP:** six retired APIs return JSON 410/no-store; workspace returns JSON 401/no-store; `/api/auth/get-session` returns 200 `null`/no-store; `/login` returns Nami HTML. These requests used the normal public origin without auth cookies or protection-bypass headers.
- **Pass — headless render:** the owned private headless browser opened `/legacy`, returned to `/login`, and displayed Nami's heading, Continue with Google, Our Vision and theme control. No user browser was opened, focused or attached. The owned browser was closed after these checks.
- **Pass — selected immutable protection:** both previous and promoted immutable login URLs still redirect anonymous requests to Vercel's access gate. No access policy changed.
- **Inherited fresh prepromotion pass:** production auth catalogs match the established schema, with zero duplicate/missing provider-account keys, using rolled-back read-only transactions. The first catalog projection mismatch was diagnosed and retained, not treated as schema drift or repaired with DDL.

## Remaining real QA checkpoint

The dedicated new automation profile is signed out and has no approved Google credentials. It was not used to force a Google login, open a visible browser or inspect another profile. Fresh Google callback, authenticated workspace and returning-session proof remain **Not run** until the designated human QA action completes.

In the existing designated QA profile, use **`https://heynami.vercel.app` only**: sign out of Nami if needed, Continue with Google as `konfidenz.clothing@gmail.com`, confirm that QA identity and workspace, reload, then log out/log in again and confirm the returning workspace after reload. Do not send messages or change the map. Report success or the visible error without credentials/full callback URLs. Platform-owner access and Nami QA identity are separate.

Before that handoff, read-only QA aggregates recorded one existing Google account and an existing session last created October 31. The Method baseline is retained privately: one map, revision/history 23, zero drafts and nine turns. No identifiers, tokens, message/map/history payloads were exported. After actual QA confirmation, compare the same Method metadata and inspect scoped session timestamps/counts to corroborate fresh auth writes. No fresh-auth or unchanged-after-auth claim is made yet.

The previous parser/auth baseline is vulnerable and is not a safe automatic rollback. A new verification failure stops rollout and preserves its first evidence; retain protection and use a bounded forward repair or separately authorized containment. No automatic flag, access-policy, credential, schema or data changes are authorized by a failure.

The original checkout, main/feature refs and unowned edits remain preserved. No push, main merge, feedback activation, real Method/model/audio/exploit request or production schema change occurred. The dated inventory still contains 51 classified affected-package records; this release is not an all-clear dependency audit. Private promotion/public/browser/compatibility/QA receipts are under `.context/revelio/auth-security-delivery-20261104/`.

# Security-only production promotion — 2026-11-04

**Live and verified at the authorized security-release scope.** The founder supplied a screenshot of the exact staged login URL rendering Nami. The coordinator accepted that as human-rendered stage proof, completing the prepromotion gate. It is not recorded as an automated authenticated browser pass.

The already approved deployment **`dpl_DwwB53jRiUk6PV6EWzzcPYoGf5aR`** was promoted with `vercel promote` after rechecking READY status, project, Node 24, unchanged environment/protection metadata, old public alias and the approved artifact hash. **No rebuild or new upload occurred.** The alias API now binds [heynami.vercel.app](https://heynami.vercel.app) to that exact deployment. Project is `prj_sVqqIBKF1Q2lViOpvlUlFGmkvMT6`; target is production and state is READY.

Runtime source remains `958f59e752cf6438bb89aed5d106569081a3aca3`, with 2,690-file manifest `0ef455cdc5310bcbf9aafe9af8594306dec274d9073357efb991b3f1bdcceb66` and archive SHA-256 `689fd89a97b55eaa2333fc77f4c5726b89c9eeec0e5dc06f72d8e999d2556928`. The deployment's CLI Git label `4ed36a4` adds only the headless-verification runbook rule. Later evidence commits are also documentation only. [Candidate composition](2026-11-04-auth-security-release.md) and [stage evidence](2026-11-04-auth-security-stage.md) preserve ancestry, reviewed fixes, full local verification, read-only compatibility and first-failure diagnoses. No feedback/email feature, migration 0002 or other product change is included.

## Fresh public checks

- **Pass — exact deployment:** public alias resolves to the promoted immutable ID; Node 24, all 16 environment metadata records and existing protection are unchanged. The existing automation-access entry count remains one; none was created or rotated.
- **Pass — unauthenticated public HTTP:** six retired APIs return JSON 410/no-store; workspace returns JSON 401/no-store; `/api/auth/get-session` returns 200 `null`/no-store; `/login` returns Nami HTML. These requests used the normal public origin without auth cookies or protection-bypass headers.
- **Pass — headless render:** the owned private headless browser opened `/legacy`, returned to `/login`, and displayed Nami's heading, Continue with Google, Our Vision and theme control. No user browser was opened, focused or attached. The owned browser was closed after these checks.
- **Pass — selected immutable protection:** both previous and promoted immutable login URLs still redirect anonymous requests to Vercel's access gate. No access policy changed.
- **Inherited fresh prepromotion pass:** production auth catalogs match the established schema, with zero duplicate/missing provider-account keys, using rolled-back read-only transactions. The first catalog projection mismatch was diagnosed and retained, not treated as schema drift or repaired with DDL.

## Accepted real QA proof

The founder reported **ALL GOOD** for the requested designated-QA logout/Google login/workspace/reload/logout-login/returning-workspace sequence, and supplied a public workspace screenshot visibly showing `konfidenz.clothing@gmail.com`. The coordinator accepted both on November 4. This is **manual evidence**, not an autonomous OAuth pass. No further login steps or messages were requested.

After that result, the same scoped `BEGIN READ ONLY` metadata queries were repeated and rolled back. QA Method metadata is unchanged: one map, revision/history 23, zero drafts and nine turns, with the same map timestamp. One Google account link remains. Its update and the latest session creation advanced to November 4 after promotion, corroborating fresh authentication writes. Active session count changed from one to two; no other session was deleted or revoked by these read-only checks. No identifiers, emails, tokens, cookies, provider payloads or map/message/history rows were exported.

The dedicated automation profile remained signed out and was used only for headless public rendering. No visible browser, founder profile or CDP attachment was used after the explicit headless correction. Successful human QA and unchanged metadata close the required release gates; no additional user action remains.

The previous parser/auth baseline is vulnerable and is not a safe automatic rollback. A new verification failure stops rollout and preserves its first evidence; retain protection and use a bounded forward repair or separately authorized containment. No automatic flag, access-policy, credential, schema or data changes are authorized by a failure.

The original checkout, main/feature refs and unowned edits remain preserved. No push, main merge, feedback activation, real Method/model/audio/exploit request or production schema change occurred. The dated inventory still contains 51 classified affected-package records; this release is not an all-clear dependency audit. Private promotion/public/browser/compatibility/QA receipts are under `.context/revelio/auth-security-delivery-20261104/`.

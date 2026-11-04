# Auth and dependency follow-up — 2026-11-04

Final implementation source: `b4700f63903fdf199460607cadd3729f433e25b3`, on `codex/auth-dependency-followup`, based on `b8c2973d70f98c3b677aaf552838a4a10eda95a1`. No push, merge, deployment, remote configuration, schema, credential or provider change was performed.

## Changes and demonstrated behavior

Better Auth and its release-line core/adapters/telemetry packages are pinned to **1.7.16**, the stable [November 3 security release](https://better-auth.com/blog/security-release-2026-11-03). Companion packages resolve to `@better-auth/utils` 0.5.1, `@better-fetch/fetch` 1.3.3 and `better-call` 1.4.5. Native PostgreSQL authentication and database-backed rate limiting remain configured as before.

The prior [database rate-limit advisory](https://github.com/advisories/GHSA-44jh-23m7-hpcf) was reproduced against 1.6.29 using a real, isolated PostgreSQL fixture: after one request consumed a five-request allowance, twelve contenders waiting on a row lock were all admitted. With 1.7.16, exactly four were admitted and eight returned 429; the stored count was five. Expired windows reset correctly.

The inventory also identified an active anonymous compressed-body crash, [GHSA-27r3-jxmh-p828](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828). An isolated child running the actual application exited with an unhandled Gunzip `Z_DATA_ERROR` for malformed trailing gzip bytes. Express is now pinned to **4.22.3**, resolving the root parser to **1.20.9**. The regression fixture returns 400 and then serves another request; normal JSON and gzip behavior also pass. Compression was not disabled. Nested MCP parser 2.3.0 remains in the installed, unmounted SDK graph.

Implementation commits:

- `2c3899e`: stable Better Auth update and native PostgreSQL regression tests.
- `1652692`: bounded Express 4/parser update and actual-application child regression test.
- `b4700f6`: independently seeded expiry regression proof, following final review.

## Advisory scope and remaining inventory

The [complete dependency snapshot](2026-11-04-dependency-inventory.md) and its [machine-readable inventory](2026-11-04-dependency-inventory.json) cover all 1,038 lock entries. Public registry audit results moved from **55 to 51 affected-package records**: 3 low / 18 moderate / 27 high / 7 critical before, and 1 low / 17 moderate / 27 high / 6 critical after. These are package records with inherited effects, not counts of reachable exploits. The registry feed did not enumerate all twelve new publisher advisories, so those were fetched separately.

The [twelve-advisory applicability matrix](2026-11-04-auth-advisory-applicability.json) records each publisher advisory, affected range and inspected application condition. No newly reachable account-takeover path was established solely from the November 3 version match. Inspected absent conditions include Expo/Electron/phone/passkey/organization/Stripe/Email OTP plugins, MySQL serial identifiers, secondary storage/cookie caching, enabled email-change flows and unverified-email provider mappings. Authentication uses built-in Google OAuth, with direct ID-token sign-in and account linking disabled. This is an application-condition assessment, not a claim that every advisory or future configuration is safe. No WAF mitigation was verified or relied upon.

Remaining critical package records include unused jsPDF/PDF dependencies, unused Google SDK/form-data dependencies, test-worker/UI dependencies and `proxy-addr`. The latter requires an affected trusted-proxy subnet configuration absent from inspected application code. They remain recorded and unpatched here. Active Zod collection-validation advisories, application Drizzle ORM identifier escaping, and Markdown AST handling need separately scoped triage; schema-defined identifiers or ordinary input bounds do not close these advisories. No broad dependency upgrade was attempted.

## Compatibility and dependency provenance

Existing auth configuration, schema, cookie settings, linking policy and storage selection were unchanged. The direct 1.6-to-1.7.16 core schema path was verified with the existing auth migration: 1.7.3 reversed the intermediate issuer-column change described in the publisher's [1.7 upgrade guide](https://www.better-auth.com/docs/guides/1-7-upgrade-guide). No enabled plugin required a migration in this configuration. Before any future deployment, perform the guide's read-only duplicate `(providerId, accountId)` check against the intended target; this run did not read the live auth database.

Locally, existing stored sessions and the 1.6 signed session-cookie format remain readable, and revocation takes effect immediately. Old in-flight raw OAuth state is deliberately rejected by the new namespaced-state implementation. A login started before a future upgrade may need to restart. Fresh state plus its signed cookie is consumed once, with replay rejected. No compatibility fallback or state backfill was added. These are loopback fixtures, not evidence of a real deployed secure-cookie or Google callback flow.

An initial ordinary npm install failed resolving optional, unused Prisma/Drizzle peers. A legacy-peer diagnostic in scratch dropped an existing MCP subtree and was rejected. The delivered lock retained the baseline peer graph and integrated npm-produced auth changes, then passed ordinary npm lock canonicalization, vanilla `npm ci` and targeted `npm ls`, without force, legacy-peer or peer-ignore flags. No Prisma package was installed. Native auth uses pg 8.16.3. The pre-existing Drizzle 0.39.1 override remains; the unselected Better Auth Drizzle adapter's newer ORM peer is explicit compatibility debt and must not be treated as supported for auth use.

The parser update pins the existing Express 4 line. A scratch update that also changed the nested MCP Express line was rejected. Registry overrides were scoped to child commands, with dedicated empty config files and cache; global npm configuration was unchanged. Package metadata was checked to contain only public npm resolutions before public audit/install requests. Lifecycle scripts were disabled during dependency installation. No private package metadata or credentials were sent.

## Verification and release limits

All checks ran with Node **24.19.0**:

- Focused auth, privacy, retired-route, feedback and compression checks: **63 passed**.
- Full suite: **86 files; 1,184 tests passed; one expected optional production-loader smoke test skipped**.
- Typecheck and production-origin build: passed.
- Actual production and preview Vercel package checks: passed, including isolated Node 24 function import, all five canonical Method skills, signed-out/auth and feedback boundaries, retired API JSON 410 behavior, whole-output secret audit and feedback secret-canary regression.
- The initial production output was restored and rechecked after preview verification. Both package targets were then rebuilt and rechecked at final implementation source `b4700f6`, leaving the final production output available locally.

Final production package checks were refreshed at `b4700f63903fdf199460607cadd3729f433e25b3`, containing 2,702 files and no file-path-map entries. Manifest SHA-256: `38d839139d1e9bd9453c4833f149c12a61863a2538630fb604be1abc8a4d8bdf`. Private archive SHA-256: `596c47592a111f60d93a30f5daeb4ab7ff5a628bd78f7cf8069b6749a571a53a`. Both preview and production package checks passed at this final implementation source; production output remains available locally. The earlier `1652692` package receipts and archive are retained. This is local packaging evidence only.

The read-only production inspection still showed READY deployment `dpl_CHZNBNyNwZL5J65P5GtvTUbwkmNk`, with November 2 runtime source `4464570`. This branch also contains the unreleased feedback migration/email base. Any future release must explicitly reconcile that composition, sender/domain activation, the auth duplicate-account check and real Google login/session QA. A passing local fixture or package does not establish deployed release readiness. No live attack, real login, provider interaction or browser QA was performed in this follow-up.

## Final caller review and cleanup

Current CE 3.35.1 pipeline simplification completed without edits; a potential fixture-environment consolidation was skipped because the proof test was protected. Full code review at `1652692` completed all eight local lenses and the independent Claude Opus 5.5 adversarial pass. Requested effort was low; the peer receipt verified model and independence but did not attest actual effort. The peer received only a sanitized five-file public projection; native reviewers inspected surrounding app/auth/dependency source locally. Private context, audit payloads, credentials and node_modules were not sent.

One P2 finding was confirmed: the expiry test depended on another test creating its counter. A standalone run passed without an expired row; adding the missing row-count precondition failed with zero affected rows. Commit `b4700f6` gives it a distinct IP, creates its own row, sets an exhausted expired window and checks the update affected one row before asserting reset. The standalone case, all seven auth/compression checks and typecheck then passed. The 1,184-pass full-suite result remains dated evidence at `1652692`; it was not repeated for this test-only correction. No production logic changed after that full run.

Review coverage limits remain: successful Google exchange/account-token writes, concurrent first-use or expired-window rate-limit admission, and simultaneous callbacks sharing one state were not proved by these fixtures. Sequential state replay and existing-window contention are the tested contracts. The original review is preserved with its finding and a separate resolution receipt rather than rewritten as a clean review.

The owned PostgreSQL fixture on port 55440 was stopped after confirming zero leftover child databases, its listener disappeared, and only its owned cluster directory was removed. The pre-existing port 55439 cluster was untouched. No browser session was started. Unrelated document fingerprints were preserved. Private first-failure logs, immutable review artifacts, audit snapshots, cleanup and package receipts are retained under `.context/revelio/auth-dependency-followup-20261104/implementation/`.

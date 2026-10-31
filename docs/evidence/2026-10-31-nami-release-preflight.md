# Nami release candidate preflight — 2026-10-31

Preparation is complete; deployment is blocked on the concrete configuration and database decisions below. This receipt authorizes no upload, migration, remote configuration change, production model call or user-data write. No such action occurred during this preflight.

## Candidate and artifact identity

- Source: `17d57de77d3b618087fed46b77c297f316580799`, branch `codex/revelio-revamp-integration`; clean checkout when both builds ran.
- Target: existing Vercel project `ikigai`, ID `prj_sVqqIBKF1Q2lViOpvlUlFGmkvMT6`, team `team_p9wpR2jCRajYNipAD0qho4ex`.
- Proposed public origin: `https://heynami.vercel.app`.
- Private evidence root: `.context/revelio/release-preflight-20261031/`. Pulled environments, logs, full manifests and copied outputs remain ignored and private.

| Artifact | Aggregate SHA-256 | Retained output / manifest |
|---|---|---|
| Preview | `ae35da77e4aac2fd681181db7c6aa751f3bd03a086d9fc0881d50832c1885c78` | `preview-output/`, `preview-manifest.json` |
| Production | `c212c7304d59ed69099af239e50d2e12ea6a6461c6386eaf8ee2f70a8b218bc5` | `production-output/`, `production-manifest.json` |

Each manifest identifies 2,706 files by relative path, byte count and content SHA-256. The aggregate hashes UTF-8 JSON of the sorted file list, using sorted object keys and compact separators. The production output also remains at `.vercel/output`; verify its identity before using it. A later documentation-only commit does not change this source binding.

Node 24.19.0 and Vercel CLI 65.2.0 completed `npm run verify:vercel-preview` and `npm run verify:vercel-production` after the respective read-only environment pulls. Both built the actual function, removed non-runtime roots, audited the entire output for private paths and selected pulled secret values, verified exact-origin share metadata, imported the function outside the checkout, loaded all five canonical Method skills and received the expected auth-disabled 503. The packaged function declares `nodejs24.x`, handler `api/index.js`, ARM64 and a 300-second maximum duration; output routes include the API and client fallback.

Build processes used the proposed HTTPS origin with fixture database/provider values and disabled agent/signups, blank auth and nonselected credentials. These process overrides were not saved remotely or embedded as function environment (`environment: {}`). They prove packaging, not working production credentials or auth. Do not copy those fixture overrides into an auth-enabled release. Runtime configuration must be separately corrected and bound to the approved deployment. Repeat the existing package audit immediately before an authorized **prebuilt** upload; do not substitute a source/Git deployment.

The [local verification receipt](2026-10-31-nami-verification-kit.md) retains the guarded full suite, code-review resolution and actual local QA turn/reload proof. No full suite, live model request or application server was repeated for this packaging-only preflight.

## Verified remote facts

Read-only project/domain APIs and CLI inspection found:

- `heynami.vercel.app` is the project's sole returned domain, verified, with no redirect or branch/custom-environment assignment; domain pagination was exhausted.
- The current alias resolves to READY deployment `dpl_DmL7cpzMXz7xbp9qpae7CHAyKPvJ`, URL `ikigai-mmzlt39u2-andres-projects-61b43c52.vercel.app`. It is an older deployment, not this candidate. Inspection supplied no verified source-commit linkage.
- Project SSO protection is null; password protection and trusted-IP configuration are absent in the returned settings. Protection-bypass configuration exists and OIDC is enabled with team issuer mode. No bypass values or tokens were exposed. These metadata observations do not prove browser access, Nami login or end-to-end readiness.

Production environment inspection and pull yielded the following exact deltas:

| Setting | Observed | Required before auth-enabled release |
|---|---|---|
| `BETTER_AUTH_URL` | `https://revelio-me.vercel.app` | Set exact approved origin `https://heynami.vercel.app`. |
| `AUTH_SIGNUPS_ENABLED` | `true` | Set `false` during initial release verification; separately approve any QA bootstrap and later signup opening. |
| `AGENT_ENABLED` | Missing; current code defaults closed | Keep explicitly `false` for auth-only verification; enable only for approved QA Method actions after prerequisites pass. |
| `BETTER_AUTH_DATABASE_URL` | Missing | Supply approved direct/unpooled PostgreSQL auth connection. Code never borrows the app URL and scopes auth to `auth`. |
| `BETTER_AUTH_SECRET` | Missing | Provision a managed signing/encryption secret of at least 32 characters. |
| Google client ID / secret | Present as Vercel Secret entries; pull returns `[SENSITIVE]` | Validity and Google-console origin/callback registration remain unverified. |
| `OPENAI_API_KEY` | Present as Vercel Secret; pull returns `[SENSITIVE]` | Validity/access to the Method model remain unverified. No production provider call was made. |
| `DATABASE_URL` | Present; connection succeeded | Resolve database choice and schema work below. |

Gemini, Groq and YouTube key values are present/nonempty in the pull; their validity was not tested. Configured Gemini model is `gemini-3.1-flash-lite-preview`. Presence is not provider readiness, and those keys do not substitute for the Method OpenAI credential.

## Database and auth blockers

Two metadata probes used the configured production app connection inside `BEGIN READ ONLY`, followed by rollback and connection cleanup. No user rows were read. Its hostname differs from local QA even after removing the pooler suffix; database name and username match. This establishes a different endpoint, not proof of shared or separate underlying Neon branch identity.

The production connection exposes the three legacy app tables (`assessment_sessions`, `purpose_paths`, `analytics_events`). All seven current Method tables are absent: `career_maps`, `career_map_history`, `career_map_drafts`, `agent_turn_leases`, `agent_turns`, `agent_conversation_mappings`, `method_erasure_jobs`. All five Better Auth tables are absent on that connection: `auth.user`, `auth.session`, `auth.account`, `auth.verification`, `auth.rateLimit`. The Method column probe returned zero rows. Private receipts: `production-schema.json` and `production-required-tables.json`.

The candidate cannot serve Method on this schema. The auth target is not configured, so the app-connection probe cannot prove the state of a future dedicated auth database. Before approval, choose the intended app/auth backend and separately authorize any remote schema changes. The reviewed sources are `migrations/0000_absurd_fat_cobra.sql`, `migrations/0001_typical_boom_boom.sql` and the separate `migrations/auth/0000_better_auth_1_6_29.sql`; inspect the target migration ledger and existing legacy state before deciding which migrations apply. Do not blindly replay the baseline, use `db:push`, reset data or repoint production at the local QA backend. No migration was performed here.

Google-console registration remains a specific external prerequisite: confirm the selected production client's authorized origin `https://heynami.vercel.app` and callback `https://heynami.vercel.app/api/auth/callback/google`. The Vercel metadata and masked client ID cannot establish this. No new Google permissions or vault access was requested.

The approved QA identity is `konfidenz.clothing@gmail.com`. Local QA revision 33 is not a production checkpoint: current production lacks the Method/auth tables. A clean target also needs an explicitly approved QA-account bootstrap while general signups remain controlled. Do not assume signups-off permits first-time creation. Founder history must not be copied or inspected to satisfy QA.

## Proposed authorized execution and recovery

The next approval must cover the chosen backend/schema operations, the configuration deltas above, QA-account bootstrap if needed, the production prebuilt artifact identity and the specific production QA writes. Database preparation is a separate consequential action from artifact upload.

1. After approved backend/configuration preparation, recheck schema and auth connection without writes, confirm Google registration, preserve the corrected nonsecret configuration receipt, verify the production artifact hash and repeat the package audit at the exact origin. Upload only the checked production prebuilt output to the existing linked project when separately authorized. Capture immutable deployment ID, artifact/source identity, effective configuration, alias mapping and correlated sanitized logs.
2. With agent/signups disabled, verify actual rendered public entry, `/our-vision` direct load/refresh, `/legacy`, share assets/tags and exact-origin Google callback/session. Establish visible QA identity, returning-session/reload and ownership before Method writes. Any platform access block is reported without bypassing policy.
3. Once separately enabled for approved QA, inspect that account's actual checkpoint. Make a meaningful saved turn and legitimate repeating continuation, then safe Stop/recovery, using the smallest additive actions available. A fresh QA account requires an explicitly approved path to a suitable checkpoint; local historical state cannot be claimed as deployed proof. Match canonical revision/receipts, streamed reply, Chat/Map and reload under the [deployed scenario matrix](../runbooks/nami-verification-scenarios.md#final-deployed-proof). Record available usage and first failures; stop for nonprogress, blind retry or unexpected spend, without imposing an invented call quota.
4. Open invitations only after deployed proof and separate signup authorization. No outreach is included in this packet.

On a bad release, stop invitations and obtain authorization to set **both** agent and signup flags false and redeploy the resulting configuration; signup-off alone leaves existing-user calls possible. These flags require an effective deployment/configuration change and are not an instantaneous local kill switch. Do not use the old broken deployment as a known-good rollback. Restore a separately verified artifact/configuration if one exists; otherwise prepare and verify a new disabled candidate. Preserve committed state, first-failure evidence and logs; no data rollback, erasure or reset is implied.

All remote deployed-proof rows remain pending. This preflight produced concrete local artifacts and read-only findings, with no upload, remote mutation, production model call, QA write, new Google grant or vault read.

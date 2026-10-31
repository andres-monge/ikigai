# Verify Nami

Start here before changing, debugging or releasing Nami. Choose checks in [the scenario matrix](nami-verification-scenarios.md). Current code/tests define behavior; the active revamp plan's 2026-10-31 release amendment governs current gates. Dated receipts establish only their recorded target and scope.

## Launch

1. Record the worktree, branch, HEAD and dirty paths. Use Node 24 (`node --version`); inspect `package.json` for current scripts. Do not reset/stash or include unrelated edits in commits.
2. Check who owns port 5173 before starting the main app. Main browser origins are `http://localhost:5173` and `http://127.0.0.1:5173`; the complementary lab uses 5174 only. Development auth specifically requires **`http://localhost:5173`**. Confirm enterprise allowlist approval before browser access; stop on denial, never change ports or work around it.
3. Reuse a server only after its PID/cwd and runtime settings identify the intended checkout. Stop on a wrong/unknown server; coordinate any restart. Never kill by process name. An approved browser origin is not proof of the right code or database.
4. Start an owned server from the chosen checkout. `npm run dev` reads that checkout's private `.env`. If credentials live elsewhere, use Node's `--env-file` with an explicit approved private path and run `node --import tsx server/index.ts`; do not copy resolved secrets into the repo. Set `NODE_ENV=development`, `BETTER_AUTH_URL=http://localhost:5173`, `AUTH_SIGNUPS_ENABLED=false`, and the chosen `NAMI_BUILD_VERSION` process-scoped. Enable `AGENT_ENABLED=true` only for the authorized live Method scenario. An app listener alone is not readiness.

Typical ownership inspection (no credentials):

```sh
pwd
git branch --show-current
git rev-parse HEAD
git status --short
node --version
lsof -nP -iTCP:5173 -sTCP:LISTEN
# For a returned PID, verify its cwd with lsof -a -p <pid> -d cwd.
```

### Deterministic and build checks

`npm run check` checks types. Focused tests can use the existing scrubbed launcher with an explicit disposable database, for example:

```sh
U4_STORAGE_TEST_DATABASE=1 U4_STORAGE_TEST_DATABASE_URL="$qa_test_database_url" \
  npm run test:all -- --run client/src/pages/explore.test.tsx server/routes/agent.test.ts
```

For the final candidate, use that same guarded launcher without file filters. `qa_test_database_url` must refer to an owned disposable local PostgreSQL database named `ikigai_u4_test_admin_*`, with no URL query parameters. `server/storage.test-database-safety.ts` enforces this. The full launcher scrubs real auth/provider credentials; direct full `npm test` with application credentials is not equivalent. Run fixtures against a disposable PostgreSQL cluster/schema, never the application database. Use the installed `initdb`/`pg_ctl`/`createdb` tools or the established owned local fixture setup; record the cluster path, port and owner, and stop/remove only what this run created. Database ports are not browser origins.

`BETTER_AUTH_URL=<approved-exact-https-origin> npm run build` checks the origin-bound client/server build. A production build without an explicit origin must fail. There is no lint or `release:validate` script. `npm run test:method` is deterministic; `npm run eval:method` deliberately calls providers and needs a selected purpose and checked environment.

### Optional paid legacy journey

`npm run test:e2e` is the **old anonymous `/legacy` questionnaire → results → action-plan** journey. It is not Google auth or Method Chat/Map coverage. Default invocation fails before starting a browser/server/provider. To inspect it safely:

```sh
NAMI_LEGACY_E2E=1 U4_STORAGE_TEST_DATABASE=1 \
  U4_STORAGE_TEST_DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/ikigai_u4_test_admin_listing \
  GEMINI_API_KEY=fixture-not-a-credential GEMINI_REASONING_MODEL=fixture-model \
  npm run test:e2e -- --list
```

Listing does not start the server or prove port-conflict handling. To verify conflict refusal, with 5173 already occupied by a **known safe owned listener**, use the same fixture-only environment without `--list`. Playwright must fail before tests/provider calls; preserve the listener. Never start this probe with 5173 free and an unusable fixture URL. An unknown existing listener blocks this check until its ownership is resolved.

A deliberately selected full journey is permitted. First identify its purpose, disposable local database/schema, test data and explicitly chosen Gemini credentials/model. Build the client first with `BETTER_AUTH_URL=<approved-exact-https-origin> npm run build`: this harness runs the existing `NODE_ENV=test` native PostgreSQL path and serves the built client, rather than starting Vite. Initialize the legacy schema only on that owned database using the existing migrations; pass its URL through `U4_STORAGE_TEST_DATABASE_URL` and the explicit disposable flag. Set `NAMI_LEGACY_E2E=1`, the actual `GEMINI_API_KEY` and `GEMINI_REASONING_MODEL` in the process environment through the sanctioned private source, then invoke `npm run test:e2e`. Keep 5173 free for the harness's own server. It refuses server reuse, runs serially with no automatic retries, disables Method/auth and nonselected provider paths, and writes artifacts under ignored `.context/revelio/legacy-e2e/`. Opt-in never authorizes a production DB. Preserve an existing artifact directory before a new run. Do not type secrets into command arguments or logs.

## Doctor

Before driving, and after an unexpected result, establish these facts:

| Fact | Local proof | Deployed proof |
|---|---|---|
| Target/source | Listener PID/cwd, HEAD + dirty diff, explicit runtime origin/build label | Immutable Vercel deployment/project plus checked prebuilt artifact/source/config linkage; current alias mapping |
| Public startup | Landing/vision render; correct assets; signed-out workspace401 when auth is configured | Same actual remote rendered pages and expected unauthenticated boundary |
| App access | Visible designated QA identity; fresh authenticated workspace read | Platform protection access **and separately** real app Google callback/session |
| Usable Method | Agent enabled, actual provider config, selected QA checkpoint and authoritative state available | Same on the approved auth-enabled target; a fixture503 is not readiness |

Use bundled `@Browser`/`mcp__cua_repl` for local pages. Rediscover the **QA** Chrome profile by its inventory name and confirm the visible `konfidenz.clothing@gmail.com` identity. Never inspect founder sessions or infer identity from a profile label. Use an isolated signed-out IAB tab for public checks. Inspect QA's existing checkpoint before choosing a write; preserve its history and never reset to simplify a test. A separate account does not imply a separate database. Do not assume a browser session remains valid after reload or credential refresh.

For actual deployed rendered QA, use installed agent-browser with a new named dedicated session/profile such as `nami-release-qa`, outside Git with private permissions. Never use historical `revelio-qa`, founder browser cookies, session exports or CDP auto-connect. Read current `agent-browser skills get core` and `agent-browser skills get protected-vercel-deployments` before composing the run. The tool's `--allowed-domains` mode is incompatible with persistent profiles; do not promise that combination or bypass enterprise restrictions.

Vercel CLI `inspect`, `logs`, `curl` and asset requests establish deployment/status/runtime facts, not rendered UI. Inspect the intended project and origin before commands; do not relink projects just to get access. Use the documented short-lived OIDC protected-deployment workflow and a CLI version meeting its requirement (65.2.0 was inspected here). Never print/store the token or disable protection. Production may require a human Trusted Sources rule; return that exact prerequisite. Platform OIDC does not log into Nami. Deployment, remote config/domain/access-policy changes and production write scope require separate explicit authorization.

1Password CLI is optional bootstrap. Its installed presence does not establish unlocked/access-granted state. Obtain only the owner-supplied exact QA item/field references needed; no vault enumeration or personal-item browsing. Prefer `op run` process-scoped injection into a supported nonlogging consumer which reads the secret internally. Never interpolate values into command/tool arguments, echo them, persist resolved env files or use `--no-masking`. Default masking does not protect screenshots/HAR/network bodies. If the supported browser login path cannot avoid secret-bearing traces, use human entry in the dedicated QA profile. Ask for actual biometric, Google challenge/consent or 2FA steps only when encountered. No new service account or permission change is required by this guide.

## Drive

Choose the smallest scenario that can falsify the changed behavior. Real local/deployed integration deliberately sends real network/provider/model/QA requests, including paid requests when needed. Mocks prove components; they cannot establish a real callback, streamed reply or persisted deployed action. Docs/discovery/build checks must not accidentally start paid journeys.

Before a live scenario, record its purpose and target/account/data/provider scope. Use only the designated account's owned safe actions. Observe progress and available request/token/usage/cost information; do not claim exact cost when only tokens or partial usage are available. Preserve existing runtime guards, including the app's step stop, active-turn ownership, Stop/cancellation and fail-closed switches. Stop and notify on runaway behavior, blind repeated retries, lack of progress or anomalous/unexpected cost. Diagnose the first failure before a purposeful retry. Never repeat tests until one passes. Multiple deliberate progressing calls are allowed; do not invent tight call caps, hard spending thresholds, per-call permission or new budget tooling.

For a saved-action claim, capture this sequence through the real UI:

1. Inspect the current QA checkpoint and baseline canonical entity/revision.
2. Perform the selected action through visible controls/composer, not internal setters or a test-only endpoint.
3. Observe the streamed/final reply and corresponding canonical operation receipt, revision and entity from the existing authorized workspace/map/change-history source. Log allowlisted metadata only, not full personal records. Use a scoped read-only server query when necessary; never export browser auth to a shell to obtain it.
4. Reload Chat and Your Map and compare with the same canonical state. A good-looking reply without the saved change fails. A committed save with failed narration remains saved-success **and** delivery-failure. Unknown refetch truth remains unknown, never “unsaved” or “cancelled successfully.”

Use [the scenario matrix](nami-verification-scenarios.md) for exact check families and release rows. One browser owner drives serially. `ce-work`/`ce-debug` use this guide alongside their ordinary checks. `ce-test-browser` helps local affected UI; its pipeline skips external OAuth and cannot prove deployed auth. Manual `ce-dogfood` is optional diff-scoped local QA with small fixes/commits, not a replay of the integration branch or standalone production proof. Project port rules override its free-port fallback. `ce-polish` is founder-directed product refinement, not an automatic gate; do not install voice/riffrec for verification.

## Evidence

Write a sanitized summary under `docs/evidence/` linking private raw proof in ignored `.context/revelio/`. Reporting exports, rosters and manifests stay under their enforced `.context/early-access/` root using the reporting CLI's **relative** output argument and existing registration. If cohort reports supply release evidence, confirm the designated QA identity is excluded by the selected roster/config; do not add another exclusion tool or browse unrelated participants.

Each result needs: time; purpose/scenario; code HEAD + dirty diff identity; exact origin; nonsecret runtime config facts; local PID/cwd or immutable deployment/project/artifact identity; tool versions; QA identity; relevant module/provider/model versions; action; visible result; canonical IDs/revisions; reload result; available usage; first-failure diagnostics; limitations. Record no secrets or secret hashes. `NAMI_BUILD_VERSION` logs help correlate but are not independent source attribution. A prebuilt upload needs explicit artifact/source/configuration linkage; if absent, stop the release claim.

Classify each claim **Pass / Fail / Blocked / Partial / Not run**, with dates on inherited evidence. Partial provider history cannot become complete because canonical state was fetched; narrow the claim only when missing history is irrelevant. Keep first-failure evidence and its diagnosis, focused regression and superseding result. Unexplained later green runs are not resolution. Recheck evidence whose code/config/target changed; do not rerun unrelated matrices merely because a docs edit occurred.

[Packaging checks](vercel-function-packaging.md) prove the actual Node24 function, five skills, whole-output private-path/secret audit and share origin. The fixture preview's auth-disabled503 proves startup only. Build/verify locally, then seek authorization for the exact configuration and checked **prebuilt** release; never silently source/Git deploy. Old broken production is not a known-good rollback. A bad release stops invitations; obtain authorization to disable agent/signup as needed and redeploy a known verified artifact/configuration. Signups-off alone does not stop existing users' calls. If no verified artifact exists, prepare a newly verified candidate. No data rollback/deletion is implied.

## Cleanup

Stop only processes this run started, record their IDs and confirm listeners are gone. Remove only owned disposable DB/fixture state; retain first failures and proof at their named paths and verify the files still exist. Leave pre-existing servers, QA account history and unrelated browser tabs intact. Reset temporary viewport/theme changes. Close owned browser sessions when done; protect the dedicated persistent QA profile as credential data. Do not revoke/reset accounts or remove evidence as routine cleanup.

A local proof receipt must state which live checks actually ran. Until the approved deployed scenarios pass, say **“kit locally proven; deployed release verification pending”** and name pending rows/access. Never promote fixture503 or accepted historical founder evidence into a fresh deployed pass.

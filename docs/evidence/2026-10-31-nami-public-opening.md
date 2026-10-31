# Nami public opening — 2026-10-31

The founder authorized public access and new Google signups after coordinator acceptance of the gated release. This later authorization supersedes only the earlier gate/signup retention decision; the [accepted rollout observations](2026-10-31-nami-gated-production-rollout.md) and [acceptance record](2026-10-31-nami-gated-release-acceptance.md) remain unchanged. The founder will sign in personally and need not send a message.

## Released target

- Public address: `https://heynami.vercel.app`.
- Existing Vercel project: `prj_sVqqIBKF1Q2lViOpvlUlFGmkvMT6`; final production deployment `dpl_HAXTamM599ahLBoCDopENqzWYUf3`, immutable URL `https://ikigai-7hj2vzrew-andres-projects-61b43c52.vercel.app`.
- Identical accepted prebuilt bytes: SHA-256 `c212c7304d59ed69099af239e50d2e12ea6a6461c6386eaf8ee2f70a8b218bc5`, runtime source `17d57de77d3b618087fed46b77c297f316580799`, 2,706 files. Node24 function import, whole-output privacy/origin check and five packaged skills passed immediately before upload.
- Production settings: `AUTH_SIGNUPS_ENABLED=true`, `AGENT_ENABLED=true`, `BETTER_AUTH_URL=https://heynami.vercel.app`. Exact targeted reads confirmed these nonsecret settings before promotion. No credentials, scopes, source code, migrations, data copy or infrastructure changed.
- Final Vercel Authentication scope: current dashboard Standard Protection, API value `all_except_custom_domains`. The production address is public; generated and stale addresses remain protected. Existing automation bypass and Trusted Sources configuration were retained. No exception was created and no deployment was deleted.

Staged the prebuilt production output with automatic promotion disabled, verified the existing project/READY status and actual staged login rendering, then promoted the exact ID while All Deployments protection still applied. Only afterward changed protection using the current supported dashboard control, as reviewed with the coordinator.

## Inventory and access proof

Deployment-list pagination exhausted at 12 prior builds: seven recorded rollout stages, two older previews and three older production builds. The seven stages include both signup-on/agent-off bootstrap deployments, the agent-on accepted QA deployment and four closed configurations. Historical values unavailable from the API were treated as potentially enabled, including legacy provider routes, rather than assumed safe. All six aliases were inspected too; two older alias targets were no longer retrievable, so their actual addresses were checked. The sole registered project domain was verified Production `heynami.vercel.app`.

Before opening, all 18 catalogued hosts denied anonymous root/workspace requests. After adding the new immutable build, the complete 19-host matrix passed: public `heynami` root200 with Nami landing and workspace401 JSON; every one of the other 18 hosts remained Vercel-auth protected or unavailable (32 protected responses and four410 responses). This includes both bootstrap URLs, the old agent-enabled QA URL, closed recovery, prior legacy production URLs and stale main/analytics/vercel-migration branch aliases. No retirement was necessary.

A fresh anonymous agent-browser session rendered the landing page and Continue with Google. The button reached the existing exact Google client and `https://heynami.vercel.app/api/auth/callback/google`, with only `openid email profile`; no new user was created by this check. The existing designated QA account then completed actual logout, Google account selection, callback and reload: session200, workspace200, and persisted Project2 card. QA remained revision23 with nine existing completed turns. No model request or message was sent. The QA app session was signed out afterward, leaving the normal browser at the public login for the founder's manual use.

## First failure and correction

The API documentation's `prod_deployment_urls_and_all_previews` example is the older protection scope. Its attempted application made the current-build `revelio-me` alias public while `heynami` remained gated. The immediate matrix rejected this and automatically restored All Deployments; obsolete immutable/branch addresses never became public. This mismatch and rollback are retained privately, not rewritten as a pass.

A supported exact-domain exception was considered under All Deployments. Vercel rejected it with “Cannot add a production alias to Deployment Protection Exceptions.” It created no exception. The current dashboard Standard Protection option instead wrote `all_except_custom_domains`, which produced the intended complete access matrix. No repeat model/auth attempt was used to diagnose this configuration issue.

References: [current protection scopes](https://vercel.com/docs/deployment-protection), [API authentication example](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), [exception limitations](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions). Actual dashboard/API observations and anonymous requests determine this receipt's effective configuration.

## Recovery and handoff

Retain verified closed recovery `dpl_C3YnqbvJepwngNeGGXPNNmpw5e5W` with both flags false, plus the accepted gated Method deployment and existing private backup. For access failure, restore `ssoProtection.deploymentType=all` first; flags alone do not contain legacy provider routes or in-flight requests. Promote closed recovery if needed, preserve state and diagnose the first failure. There is no automatic data rollback.

Private inventory, settings, audit, transition and browser/access proofs are under `.context/revelio/public-opening-20261031/`. Configuration-only verification used the accepted artifact/tests plus real access/OAuth/reload checks; no gratuitous full suite or paid journey rerun. No founder account/history, outreach, new scopes, key rotation, push, merge or pull request was used.

Founder steps: open `https://heynami.vercel.app`, click Continue with Google, and choose the personal Google account to use for Nami. Complete any Google prompt. Reaching the signed-in workspace is sufficient; sending a chat message is optional.

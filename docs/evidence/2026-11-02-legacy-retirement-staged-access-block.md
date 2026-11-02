# READY retirement stage; rendered verification blocked — 2026-11-02

**Partial: the revised candidate is READY and its staged HTTP boundaries pass. Promotion did not run.** Public `https://heynami.vercel.app` still serves old deployment `dpl_4PcQMSfrM1eNaokQuTqXajTGXS9A`; the audited public legacy exposure therefore remains unresolved.

Approved source `4464570156be7a52bddb14556391e5cc80896f55`, with evidence-only upload HEAD `32dcfe27815df327e432f5832a22f258e58f1e9b`, was uploaded using only `vercel deploy --prebuilt --prod --skip-domain --yes --json`. Actual staged deployment: **`dpl_CHZNBNyNwZL5J65P5GtvTUbwkmNk`**, READY, production target, project `prj_sVqqIBKF1Q2lViOpvlUlFGmkvMT6` (`ikigai`). Exact staged origin: [ikigai-9t699q2ri-andres-projects-61b43c52.vercel.app](https://ikigai-9t699q2ri-andres-projects-61b43c52.vercel.app).

The approved 2,675-file artifact has manifest SHA-256 `1df5f1d6379b3566cf67813a8ad7fe6ef5b32c51e7e982d704371ff621fdc730` and empty `filePathMap`. Immediate all-file/source/project checks and the exact-origin Node24 checker passed before upload. The artifact remained unchanged afterward. [Repaired candidate and full verification](2026-11-02-legacy-retirement-packaging-candidate.md). The earlier failed deployment and archive remain preserved; no private skill files were uploaded to repair the trace failure.

## Actual staged HTTP proof

Vercel CLI65.2.0's supported `curl --deployment` access reached the app without browser credential export or access-control changes. These CLI requests are HTTP proof, not rendered browser evidence:

- **Pass:** all six retired API families, each with GET, OPTIONS and deliberately malformed JSON POST: 18/18 JSON410, `LEGACY_RETIRED`, `Cache-Control: no-store`. Paths: `/api/analyze/stream`, `/api/action-plan/stream`, `/api/questionnaire/save`, `/api/session/retirement-fixture-20261102`, `/api/transcribe`, `/api/analytics/event`.
- **Pass:** signed-out `/api/agent/workspace` and `/api/agent/history` each JSON401; `/api/auth/get-session` JSON200 with literal `null`.
- **Partial:** a nonsecret fictional query sentinel on retired `/api/analyze` returned JSON410 and a generated request ID. Runtime log inspection was not run, so there is no fresh deployed claim about the absence of the sentinel from logs. No historical logs were harvested.
- **Pass:** fresh immutable/public inspection confirms stage READY, public alias still old, project protection `all_except_custom_domains` unchanged and environment IDs/types/targets/update timestamps unchanged. Existing approved origin/signup/agent settings were not changed. No schema, credential, application-data, provider or message action ran.

## Two separate access blockers

1. The dedicated agent-browser session used the documented short-lived same-project OIDC workflow. The token was minted privately and injected through supported batch stdin, without a secret in arguments, logs or files. It did not reach the application. A direct same-origin OIDC request diagnosed HTTP403 and `x-vercel-error: TRUSTED_SOURCES_ENVIRONMENT_MISMATCH`. That workflow requires a human-authorized Trusted Sources mapping for this project's local caller environment `development` → `production`, managed in Vercel Settings → Deployment Protection → Trusted Sources. No rule or protection setting was changed.
2. The founder offered the visible QA Chrome New tab. CUA inventory identified its separate single-tab browser surface; only that tab was selected. Normal navigation to the exact staged `/legacy` URL was rejected by the **admin-enforced browser origin policy** before navigation. The tool denied network-egress authority for this exact origin and explicitly prohibited alternate surfaces, aliases, raw CDP or browser-command workarounds. Browser verification stopped. No founder tab/session, browser credentials, CDP auto-attachment or cookie export was used. The QA app identity and any existing legitimate Vercel owner session remain unverified; the origin gate prevented checking them.

These blockers are distinct. A Trusted Sources change alone is not established to solve enterprise browser access. Conversely, an existing legitimate platform-owner browser session might remove the OIDC prerequisite, but that path could not be tested through the rejected managed origin. No alternative browser/alias or raw rendering path was attempted after the enterprise rejection. The owned agent-browser session was closed; the offered user tab was left intact. No permission or configuration workaround was applied.

**Blocked:** staged rendered login/retired-page verification and therefore conditional promotion. **Not run:** promoted public retirement checks, QA returning-session/checkpoint comparison and runtime-log evidence. Actual Google callback, Method/provider response, audio and persistence were not tested. Prior deterministic/local evidence remains separately scoped. The lower Better Auth rate-limit advisory and blocked complete dependency inventory remain unchanged in the [original audit](2026-11-02-mvp-security-audit.md).

## Minimal human rendered check

Use an already authorized browser/profile that can access this exact staged origin, signing into Vercel normally with an authorized platform account if required. Do not change access policy, disable protection, export cookies or create a Nami account to perform the check.

1. Open [the exact staged /legacy page](https://ikigai-9t699q2ri-andres-projects-61b43c52.vercel.app/legacy), then the same host's `/results` and `/action-plan`. With no Nami session on this new host, each should reach `/login` and render the current Google sign-in screen, with no legacy questionnaire/session flow.
2. Confirm the current page and assets actually render without startup errors. Supply the final URL and a screenshot for each retired entry point, dated and tied to `dpl_CHZNBNyNwZL5J65P5GtvTUbwkmNk`. Exclude authentication codes/tokens and account secrets from screenshots. The API checks above need no repetition through browser tools.
3. Return those results to the coordinator. Promotion stays pending acceptance of this exact staged proof. After separately accepted promotion, verify the public boundaries and designated QA identity `konfidenz.clothing@gmail.com`, read its existing checkpoint and confirm it remains unchanged after reload. Do not send a message, invoke a model/audio action, reset or alter records for this release check.

An admin-approved exact origin would allow automated rendered verification to resume through supported tools. Until legitimate access or human results exist, no further automated browser attempt or promotion is authorized by this receipt. Historical host checks are inherited from the same-day first-failure receipt; no expanded host scan ran during this blocked stage.

[Machine-readable staged receipt](2026-11-02-legacy-retirement-staged-access-block.json). Private deployment/HTTP/access/configuration receipts and preupload proof remain under `.context/revelio/legacy-retirement-release-20261102/`. Coordinator-owned `coordinator-state.json` was not touched. No Git push, main merge or PR ran.

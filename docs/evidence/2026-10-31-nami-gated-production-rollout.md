# Nami gated production rollout — 2026-10-31

Execution follows the reviewed `docs/runbooks/nami-rename-release.md` Single Approval Bundle, authorized after completed document review. This receipt records observed state; it does not open pilot access or invitations.

## Access and recovery preparation

Vercel project `prj_sVqqIBKF1Q2lViOpvlUlFGmkvMT6` now has Vercel Authentication `ssoProtection.deploymentType=all`. Team membership inspection returned one confirmed owner and exhausted pagination. Anonymous requests to the public origin, its Method workspace route and the old immutable production URL redirect to Vercel authentication. The existing signed-in owner Chrome session reached the old application's login screen at `https://heynami.vercel.app/login`, separately establishing legitimate platform access. No Nami owner-account login or founder history was accessed.

Installed the keg-only PostgreSQL client `libpq@17` (17.11), without starting a new PostgreSQL17 service. A custom-format snapshot of the verified existing production branch is retained in owner-only storage outside the checkout/deployment output: `/Users/andresm/Library/Application Support/Nami/Backups/rollout-20261031/production-before-method.dump`. Archive listing succeeded; file is mode0600 inside mode0700 directory. Snapshot bytes: 32794; SHA-256 `f0e37822b83cfd986e439ab84adb54323a26111ed53468faf752f2e6a794bf7b`. Observed Neon history retention is six hours; the independent snapshot does not depend on that window. No database restore is authorized or performed.

## Production schema and legacy continuity

Authenticated Neon metadata reconfirmed existing project `wandering-mouse-00188148`, production branch `br-sparkling-dust-adiobqet` / endpoint `ep-spring-sun-adfk3oqc`, distinct development branch `br-fragrant-lab-ad5zsa61`. The production direct connection uses management-confirmed endpoint identity and the existing production credential. No development data was copied.

Fictional disposable local PostgreSQL rehearsal passed both full baseline adoption/auth migration with preserved legacy records/sequences and deliberate incompatible-analytics rejection with atomic rollback of ledger/Method DDL. The production predecessor matched the complete rehearsed legacy descriptor. Before migration, no other active client or idle transaction was observed. A bounded transaction locked/rechecked the three legacy tables, registered the existing baseline without replay, applied the entire unchanged Method migration and registered its exact reviewed hash/timestamp. Separate reviewed Better Auth SQL committed afterward.

The production ledger now contains exactly baseline hash `939a8a6da437ee5da6500a4fb909d66106a94b8392acb59da5c64fdd1bec3bed` at `1755793383946` and Method hash `1441b2896c1fc76c7622902ce71559da503ea9756e76dbf6df9af7e8c36fc95a` at `1788216590551`. All seven Method and five auth tables exist. Production's 109 columns, 34 constraints and 32 indexes match a fresh fictional fixture built from the checked SQL exactly. Legacy counts, aggregate content fingerprints and sequence positions match the pre-migration snapshot. No legacy record reset/update/delete or baseline SQL replay occurred.

## Google registration and closed configuration

Using agent-browser CLI attached to the owner's existing Chrome at CDP9222, inspected project `ikigai-464816` and existing Web client `Revelio Web`. Added only `https://heynami.vercel.app` and `https://heynami.vercel.app/api/auth/callback/google`; saved, reopened and verified both values. Three earlier origins and three earlier callbacks remain. No new OAuth scopes/client/key or secret rotation.

Initial closed-stage production settings used the exact Nami origin, explicit agent=false/signup=false, a sensitive direct auth connection to the same existing production branch/database and a newly generated managed sensitive auth signing/encryption secret. Existing Google/OpenAI and unrelated provider settings are retained. Values were injected through stdin, never command arguments or committed evidence. At that stage, Google/OpenAI credential validity still required the deployed auth and Method checks recorded below.

## Deployment and QA

Uploaded only the retained production prebuilt artifact, aggregate SHA-256 `c212c7304d59ed69099af239e50d2e12ea6a6461c6386eaf8ee2f70a8b218bc5`, runtime source `17d57de77d3b618087fed46b77c297f316580799`. Whole-output audit, isolated Node24 function import and five canonical skills passed immediately before uploads. Vercel Git metadata identifies documentation HEAD `fdd4946bc621537b2c7a93cdd194a4c8736657f2`; it is distinct from the runtime artifact's source binding. No source/Git deployment occurred.

The first closed deployment `dpl_EEtK84Np8FbBuQvqGA5ieWuGRWGS` exposed a preexisting surrounding-whitespace defect in the sensitive Google client ID. Its trimmed value matched the inspected existing client exactly. Corrected that same ID setting without rotating credentials, audited/uploaded the same artifact again, and verified corrected closed deployment `dpl_CzDwxpTq4Y8GCUTi4NTo16XKkkiQ` at `https://ikigai-k4q6rd60j-andres-projects-61b43c52.vercel.app` before promoting it to `heynami.vercel.app`.

Observed closed-stage proof: actual Nami login/vision and legacy form render; Google session GET200/null; signed-out Method workspace401; exact-origin share tags; mobile390px light/dark screenshots inspected with no horizontal overflow and one main/navigation/article heading; direct vision-page load and same-tab entry. Theme/viewport restored. The actual Google authorization URL uses the inspected exact client ID, Nami callback, QA login hint and only `openid email profile`. Authorization state/credentials are omitted from evidence.

Gated bootstrap deployment `dpl_2YsZoLMzazHB5ppiVk2YiPD8UUWk` (`https://ikigai-q7syxblpj-andres-projects-61b43c52.vercel.app`) used signup=true/agent=false on the same audited artifact. Before it, auth users/accounts/sessions and Method maps were all zero. Google account selection visibly showed and selected only the designated `konfidenz.clothing@gmail.com` identity. The callback returned without an app session; correlated runtime diagnostics contain `invalid_client`. QA-scoped auth inspection confirmed zero users/accounts/sessions afterward. No QA account, Method state or production model call was created.

Stopped bootstrap attempts, reset future production agent/signup flags to false, and promoted the verified closed deployment `dpl_CzDwxpTq4Y8GCUTi4NTo16XKkkiQ` back to the public alias. Alias inspection confirms that exact ID. All Deployments authentication remains effective over the public alias and every immutable URL, including the signup-enabled bootstrap URL. No public signup window or pilot opening occurred.

Owner completed the existing Google secret entry in Vercel, confirming it is the same existing credential as the local `.env`. No new secret or rotation was required. Audited closed deployment `dpl_DXo9xz4bLdtZPh24kwreQQvcW6Ef` incorporated that entry. The next gated bootstrap deployment `dpl_CG1PzE5uzm6t1eYA8vUr1E3aE4tn` completed a real callback for the designated QA identity. Exact read-only auth inspection found one verified user, one linked Google account and one session; no unexpected identity.

Immediately audited/staged/promoted closed returning deployment `dpl_C3YnqbvJepwngNeGGXPNNmpw5e5W`, with signups and agent both false. Existing session survived deployment/reload. Actual Sign out, Continue with Google, explicit QA account selection, callback and reload all passed at `heynami`. Read-only auth inspection again found only the designated QA user, its Google linkage and one session; zero Method maps before Method enable.

Audited/staged/inspected production project and READY status, observed actual staged login startup, then promoted Method deployment `dpl_3yVSG7vfAziDjY1zDdHp664zvL8B` (`https://ikigai-hnis570lu-andres-projects-61b43c52.vercel.app`). It uses the identical artifact with signup=false/agent=true, behind the retained All Deployments gate. QA session survived. Fictional library/community-information inputs began a fresh Foundation; the first live turn completed with seven accepted revisions, followed by North Star confirmation at revision8. Actual provider usage is available in correlated runtime logs. The actual deployed journey subsequently completed as recorded below.

## Actual Method save, repeating continuation and Stop recovery

All inputs described a fictional library/community-information persona. No founder history, development records, real outreach or external project action was used. The shipped model is `gpt-6.1-sol`; accepted operation receipts bind the packaged Method module versions. QA-scoped inspection used the existing `readParticipantSnapshot` reporting source in repeatable-read/read-only transactions.

| Checkpoint | Actual canonical result | UI/reload proof |
|---|---|---|
| Foundation and North Star | First turn `56940ba9-c257-4d93-9795-f1f9c5cd3f1b`, revisions0→7; confirmation7→8 | Responding/saving states and reply; North Star in Map |
| Three Paths | `c598857c-9c47-4f7d-b0fa-fe8a47cf1e3e`, `propose-purpose-paths`8→9 | Three equal cards attached in Chat, same Map cards and reload |
| First project | UI Start path1, then accepted project `project-local-resource-zine`; revisions9→14 | Developed project card and actual confirmation reply |
| Work and reflection | `671a3333-d686-4aa3-889f-1aeab8515f9b`, work completed, reflection opened/evidence appended/closed;14→19 | Accepted/completed project and closed reflection in Map after reload; fictional evidence correctly qualified |
| Repeating continuation | `cfc3ce94-049a-40f8-816c-e03093e6f248`, continue choice19→20, explore-further Next Move20→21, exactly three follow-on proposals21→22 | Chat attachment and all three options survived reload |
| Stop/recovery | Used Stop on useful comparison turn `8ba4ab78-bd56-4fda-94c4-0a619a9c5fd1`; server had completed, no operation, revision22 retained | UI said stopped/restored message; canonical completion checked before retry. Reload recovered the completed comparison reply. No resubmission or duplicated save |
| Resume | Explicit choice of actual option `project-question-route-second-resource`, `select-follow-on-project`22→23 on turn `ce09775b-c15b-410d-a477-13921b323fc0` | Project2 accepted/current; other options parked; Chat and Map retained after reload and another real logout/Google login |

Final canonical inspection: revision23, 23 history records with 23 unique operation source IDs, nine terminal completed requests, zero pending turns, repairRequired=false. Project1 remains completed; Project2 is accepted/not-started. The Stop smoke exercised completion racing with the client stop action; it does not claim provider cancellation or every exact race timing, which remain covered by accepted deterministic tests.

Correlated runtime logs provide usage for all nine requests: aggregate 768,669 input tokens, 7,265 output tokens, including 3,141 reported reasoning tokens. These are provider-reported tokens, not dollar-cost estimates or unique-context counts. Requests progressed through the intended flow; no blind model retry. Runtime `buildVersion` reports `unknown`; source linkage therefore relies on the checked immutable prebuilt manifest and exact deployment/project/alias inspection, rather than claiming that log field identifies the build.

## Retained gated release and limits

Final alias is `heynami.vercel.app` → `dpl_3yVSG7vfAziDjY1zDdHp664zvL8B`; signup=false/agent=true. Vercel project inspection still shows All Deployments authentication. Anonymous alias, workspace, Method immutable URL and successful signup-on immutable URL all redirect to Vercel authentication. Existing protection-bypass configuration was not changed. No enabled immutable URL was exposed. Verified closed recovery deployment `dpl_C3YnqbvJepwngNeGGXPNNmpw5e5W` remains available with signup=false/agent=false.

After Method QA, signing out returned session200/null and workspace401. Exact QA Google login returned session200 and the persisted project cards. A final independent legacy continuity check again matched all pre-migration counts, content fingerprints and sequence positions. The six deployed scenario rows have observed proof; the gated release remains pending coordinator acceptance. No pilot signup/invitation/public opening, source-code change, push, merge, PR, credential rotation or database restore occurred. Existing accepted full-suite coverage was retained; these operations required actual deployed proof and the already-passed U1 rehearsal, not another full suite replay.

Private operation logs, metadata, rehearsal and schema receipts are retained under `.context/revelio/rollout-execution-20261031/`; credential/payload values are omitted here. Owned local fixture databases were dropped; their cluster was stopped and removed after retaining rehearsal receipts. Original reviewed runbook remains unchanged.

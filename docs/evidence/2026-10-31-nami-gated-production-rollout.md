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

Production settings now have the exact Nami origin, explicit agent=false/signup=false, a sensitive direct auth connection to the same existing production branch/database and a newly generated managed sensitive auth signing/encryption secret. Existing Google/OpenAI and unrelated provider settings are retained. Values were injected through stdin, never command arguments or committed evidence. Actual Google/OpenAI credential validity remains to be proven by deployed auth and Method checks.

## Deployment and QA

Uploaded only the retained production prebuilt artifact, aggregate SHA-256 `c212c7304d59ed69099af239e50d2e12ea6a6461c6386eaf8ee2f70a8b218bc5`, runtime source `17d57de77d3b618087fed46b77c297f316580799`. Whole-output audit, isolated Node24 function import and five canonical skills passed immediately before uploads. Vercel Git metadata identifies documentation HEAD `fdd4946bc621537b2c7a93cdd194a4c8736657f2`; it is distinct from the runtime artifact's source binding. No source/Git deployment occurred.

The first closed deployment `dpl_EEtK84Np8FbBuQvqGA5ieWuGRWGS` exposed a preexisting surrounding-whitespace defect in the sensitive Google client ID. Its trimmed value matched the inspected existing client exactly. Corrected that same ID setting without rotating credentials, audited/uploaded the same artifact again, and verified corrected closed deployment `dpl_CzDwxpTq4Y8GCUTi4NTo16XKkkiQ` at `https://ikigai-k4q6rd60j-andres-projects-61b43c52.vercel.app` before promoting it to `heynami.vercel.app`.

Observed closed-stage proof: actual Nami login/vision and legacy form render; Google session GET200/null; signed-out Method workspace401; exact-origin share tags; mobile390px light/dark screenshots inspected with no horizontal overflow and one main/navigation/article heading; direct vision-page load and same-tab entry. Theme/viewport restored. The actual Google authorization URL uses the inspected exact client ID, Nami callback, QA login hint and only `openid email profile`. Authorization state/credentials are omitted from evidence.

Gated bootstrap deployment `dpl_2YsZoLMzazHB5ppiVk2YiPD8UUWk` (`https://ikigai-q7syxblpj-andres-projects-61b43c52.vercel.app`) used signup=true/agent=false on the same audited artifact. Before it, auth users/accounts/sessions and Method maps were all zero. Google account selection visibly showed and selected only the designated `konfidenz.clothing@gmail.com` identity. The callback returned without an app session; correlated runtime diagnostics contain `invalid_client`. QA-scoped auth inspection confirmed zero users/accounts/sessions afterward. No QA account, Method state or production model call was created.

Stopped bootstrap attempts, reset future production agent/signup flags to false, and promoted the verified closed deployment `dpl_CzDwxpTq4Y8GCUTi4NTo16XKkkiQ` back to the public alias. Alias inspection confirms that exact ID. All Deployments authentication remains effective over the public alias and every immutable URL, including the signup-enabled bootstrap URL. No public signup window or pilot opening occurred.

Current dependent blocker: recover/verify the existing Google client secret for the inspected `Revelio Web` client. Google Cloud explicitly no longer permits viewing/downloading old secrets; targeted read of the exact production Vercel secret returns sensitive/decrypted=false. Requested only owner-directed exact 1Password item/field reference or direct human entry in Vercel; no vault enumeration, local QA credential substitution, new client/key or secret rotation. Fresh QA bootstrap, closed returning session, actual Method save/continuation/Stop/reload remain pending this credential handoff. No blind callback retry.

Private operation logs, metadata, rehearsal and schema receipts are retained under `.context/revelio/rollout-execution-20261031/`; credential/payload values are omitted here. Owned local fixture databases were dropped; their cluster was stopped and removed after retaining rehearsal receipts. Original reviewed runbook remains unchanged.

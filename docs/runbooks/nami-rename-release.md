# Nami rename release checklist

The local integration branch contains the product rename. This checklist records what has been verified and what a separately authorized production release still needs. Do not infer live domain or auth health from a local build.

## Local integration evidence (2026-10-31)

- Node 24 `npm run check`, `BETTER_AUTH_URL=https://heynami.vercel.app npm run build`, and `npm run test:all` passed. The full suite used a disposable PostgreSQL database with `U4_STORAGE_TEST_DATABASE=1`; 1,118 tests passed and one was skipped. The fixture origin is process-scoped for the build; a production build without an explicit origin correctly fails.
- Signed-out `http://localhost:5173/login` renders the Nami title, wordmark, and Google login copy; signed-out `/api/agent/workspace` returns 401. The current 5173 process uses the integration worktree, Node 24, and a local development origin.
- Local `verify:vercel-preview` and `verify:vercel-production` passed against linked project `prj_sVqqIBKF1Q2lViOpvlUlFGmkvMT6`, with process-scoped `BETTER_AUTH_URL=https://heynami.vercel.app` and safe fixture runtime variables. Each check built the function, imported it outside the checkout, loaded five Method skills, checked the signed-out 503 boundary, audited the whole output for private paths and selected secrets, and matched OG/Twitter URLs to the fixture origin. Neither check deployed.
- Authenticated browser QA used the separately connected Chrome `QA` profile and verified the visible `konfidenz.clothing@gmail.com` identity before inspecting state. The Nami header, saved Chat history, current Map and project, session/history after reload, and dark theme persistence all rendered. The theme was returned to its original light choice. No model turn, data edit, or founder-history access was made. The current request header and origin protocol are covered by integration tests rather than browser network-header inspection.
- `ce-code-review` completed with two confirmed P2 origin-policy findings; both were fixed and the affected tests rerun. Its unmodified review receipt is `docs/evidence/2026-10-31-nami-rename-code-review.json` (run `20261031-092804-183b8507`).

## Deliberately retained former names

- `revelio-theme` is a read fallback for existing browser preferences; new choices write `nami-theme`.
- `.context/revelio` is the existing ignored private artifact namespace. Existing records, replay captures, dated plans, historical findings, and old plan filenames retain their source identity.
- Former `x-revelio-*` headers appear only in negative protocol tests. Existing data fixtures may keep historical database or provider values; the rename does not rewrite user records.

## Before an authorized production release

1. Verify the intended public domain and any old alias mapping read-only. Set `BETTER_AUTH_URL` to the exact HTTPS origin in each Vercel environment being released; confirm Google OAuth authorized origins and callbacks match that origin.
2. Confirm the production database, Better Auth schema, secrets, cookies, signup policy, and allowed sign-in accounts for that origin. Test the real Google callback and session recovery with a designated QA account.
3. Repeat the local artifact checks in `docs/runbooks/vercel-function-packaging.md` with the approved origin, then inspect built share tags and function output. Preserve the ESM and Method skill packaging repairs from `542a6c6`.
4. After separate deployment approval, deploy the checked prebuilt output and verify signed-out and signed-in paths, Method ownership and privacy boundaries, history, theme, icons, share previews, and rollback/alias behavior on the live domain.

Production callback, remote configuration, alias, deployment, and live sign-in checks are not covered by this local branch's verification.

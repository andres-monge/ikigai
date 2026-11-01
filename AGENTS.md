# AGENTS.md

Nami was named Revelio before October 2026. Dated historical documents retain the former name and their original meaning.

## Sources of truth

- Existing behavior is defined by current code and tests.
- Until its Definition of Done is met, `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md` is the implementation authority for revamp work. `docs/thesis.md` is the method authority for the new agent.
- Other dated research, brainstorms, and plans are historical unless explicitly named.
- For founder dogfood or Method reset work, read `docs/dogfood/README.md` and the relevant run record before acting. These records are evidence, not Method or implementation authority.

## Git workflow

- This is a solo project. Do not create pull requests unless explicitly requested.

## Local development ports and browser access

- Main Nami app: HTTP `localhost:5173` or `127.0.0.1:5173`.
- Complementary sites, including the prompt experiment lab: HTTP `localhost:5174` or `127.0.0.1:5174`.
- Use these standard ports. Before browser or computer use, confirm the local origin and port are approved by the enterprise allowlist. If access is blocked, stop and report it; never work around the restriction. This local-origin rule does not prohibit authorized external browsing.

## Verification

Before implementing or debugging a change, read [Nami verification](docs/runbooks/nami-verification.md) and select the relevant checks from its scenario matrix. Use the guide for target/session preflight, deliberate live tests, persisted-state proof, first-failure diagnosis and evidence cleanup. Update it when routes, auth, deployment, tool access or contracts change. A local or fixture pass does not establish deployed release readiness.

---
title: Find and choose Revelio QA profiles, synthetic evaluations, and disposable database tests
date: 2026-09-30
category: workflow-issues
module: Revelio Method testing and verification
problem_type: workflow_issue
component: testing_framework
severity: medium
applies_when:
  - "An agent needs to find a previous QA or test profile without rediscovering chat history."
  - "A task needs synthetic, browser, storage, or full app coverage and their isolation boundaries matter."
tags:
  - "agent-browser"
  - "test-profile"
  - "qa"
  - "synthetic"
  - "full-app"
  - "disposable-database"
  - "coverage-limits"
  - "dogfooding"
---

# Find and choose Revelio testing setups

## Context

Revelio has several verification surfaces, each with different evidence and isolation. Their locations were scattered across code, a historical dogfood report, and the Codex chat **U7 dogfooding** (`01a0a9d5-5681-7e11-8a2a-27beae75524b`). Reconstructing that history can lead an agent to mistake a separate browser profile for a separate account, or a synthetic model evaluation for a persisted app journey. This inventory records the resolved discovery and choice lesson; it does not claim that a new isolated app was built.

## Guidance

Search `docs/solutions/` before reconstructing old sessions. A useful starting query is `rg -n 'agent-browser|test-profile|synthetic|disposable-database|full app' docs/solutions`. Choose the surface by the claim that needs evidence:

| Surface and discovery location | Status and useful evidence | Coverage and isolation limits |
| --- | --- | --- |
| Persistent agent-browser profile `/Users/andresm/.agent-browser/profiles/revelio-qa`; historical session `revelio-qa-a297a2578a47` | **Historical authenticated browser QA.** The founder signed in with Google during U7 dogfooding. The report records UI, database, and server-log evidence. | Separate browser state does not establish a separate Revelio account. Treat it as founder state, not a dedicated synthetic user. Its present authentication is unverified. Opening it, sending turns, resetting data, or inspecting personal history requires the task's authorization. |
| `scripts/eval-revelio-method.mjs` | **Existing synthetic live-model harness.** Fictional explorer conversations use the selected real provider model; current allowed/default model is `gpt-6-sol`. Operations use `applyCareerMapOperation` in memory, and provider options set `store: false`. | Covers generated behavior and reducer outcomes. Does not exercise browser UI, Google authentication, app database persistence, or a complete logged-in journey. `store: false` describes this provider request option, not an account or database isolation guarantee. |
| `server/db.ts` and `server/storage.test-database-safety.ts` | **Existing gated disposable storage tests.** The local PostgreSQL path requires both `NODE_ENV=test` and `U4_STORAGE_TEST_DATABASE=1`, plus `U4_STORAGE_TEST_DATABASE_URL`. The guard accepts only local `postgresql:` URLs naming `ikigai_u4_test_admin_*`, without query parameters. | This selects the application storage test connection; it does not by itself isolate authentication, provider conversations, or an entire browser app. The historical report records 69/69 storage tests and 625 passed / 2 skipped full-suite tests on disposable PostgreSQL, with teardown verified. Those are historical results, not checks repeated in this capture. |
| `tests/journey.spec.ts` | **Existing legacy browser journey.** It navigates to `/legacy`. | Its passing result does not establish current Revelio Method E2E coverage. |
| `AgentRouterOptions` in `server/routes/agent.ts` | **Existing test seams.** `requireAuth`, `storage`, `model`, and `conversationClient` can be injected. | These seams support component and route testing. A full isolated browser app with a separate synthetic user and real provider was **proposed only**, not built or verified. |

The scoped historical report is `.context/revelio/dogfood/2026-09-20-u7-qa/report.md`. Read its summaries and verification sections when provenance is needed; do not copy private transcripts or credentials into learnings. Historical UI evidence can explain what was verified then, but cannot establish the profile's current login or today's app behavior.

For example, a Purpose Path save assertion in the synthetic harness calls for reducer and operation diagnostics; persistence requires storage evidence, and visible saved cards require app presentation evidence. The separate learning `docs/solutions/workflow-issues/diagnose-purpose-path-revision-save-anomalies.md` covers that diagnosis rather than setup discovery.

For the current latency question, a new empty Neon app was recommended and declined as too much machinery. The chosen next evidence source is authentic founder dogfooding with opt-in instrumentation. That choice is not proof that instrumentation or another dogfood run has already happened. A future full app setup needs an explicit identity, storage, and provider-conversation boundary: current Google authentication expects `http://localhost:5001` locally (`server/auth.ts`), and `server/index.ts` fixes port 5001, so an arbitrary second port or only a new database is insufficient evidence of complete isolation.

## When to Apply

Use this inventory when selecting QA coverage, finding an old test profile, or deciding whether a proposed synthetic journey already exists. State the surface used and the claim it proves. Recheck current source configuration and authorization before execution; historical reports establish provenance, while proposed setups require implementation and verification before being described as available.

---
date: 2026-04-12
topic: test-reliability
---

# Reliable Test Suite for Regression Confidence

## Problem Frame

The Revelio app was built months ago and has an E2E test (`tests/journey.spec.ts`) that was abandoned because it couldn't pass reliably. The test has stale selectors (copy changed since the test was written) and a known race condition around temporary-to-real ID transitions. The app already has comprehensive API-level tests with mocked AI (`server/routes/assessment/*.test.ts`, `server/routes/session.test.ts`), so the gap is specifically the E2E browser test.

The app's AI response times have improved dramatically since the test was written — the 60-second timeout is no longer an issue. The AI layer is the core product, so the E2E test should exercise real AI calls rather than mocking them.

## Requirements

**Selector Resilience**
- R1. All selectors are resilient to copy changes — use semantic selectors (`getByRole`, regex patterns, `data-testid`) instead of exact text matching
- R2. Audit every selector in `journey.spec.ts` against the current UI and fix all stale references

**Timing Reliability**
- R3. No hardcoded `waitForTimeout` calls — replace with condition-based waits (DOM state, network idle, element visibility)
- R4. The temp-to-real ID race condition must be solved with a DOM-observable signal. The results page assigns temporary negative IDs to purpose paths during streaming, then polls the backend to replace them with real DB IDs. Currently there is no DOM signal for this transition — the test uses `waitForTimeout(7000)` as a workaround. The fix requires adding a `data-path-id` attribute (or similar) to path cards so Playwright can wait for positive IDs before clicking "Get Action Plan."

**End-to-End Coverage**
- R5. The test validates the complete happy path with real AI calls: Questionnaire → Results (with streamed AI content) → Action Plan
- R6. Test failures produce clear diagnostics — screenshots at failure points, console error capture (partially met by existing test)

**Configuration**
- R7. Restrict Playwright config to Chromium only for E2E runs. The current config runs 5 browser projects (Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari), which with real AI calls creates unnecessary concurrency, API cost, and flakiness.

## Success Criteria

- `npm run test:e2e` passes 3 consecutive runs without flakiness (Chromium only)
- A developer (or AI agent) can run the E2E test after making changes and trust the result
- If "fix, don't rewrite" proves impractical (e.g., deep architectural issues in the test), escalate to a rewrite decision rather than over-investing in patches

## Scope Boundaries

- **In scope:** Fixing `tests/journey.spec.ts`, adding `data-testid`/`data-path-id` attributes where needed in production components, restricting Playwright config
- **Out of scope:** CI/CD pipeline setup, cross-browser testing, new API-level tests (already exist), mocking AI for E2E tests, performance/load/accessibility testing

## Key Decisions

- **Real AI in E2E tests:** The AI response IS the product. Mocking it would test a hollow shell. Since response times are now fast, live AI calls are practical.
- **Fix existing test, don't rewrite:** The structure of `journey.spec.ts` is sound. The issues are stale selectors, hardcoded waits, and the ID race condition. If deeper architectural issues surface that make fixing impractical, escalate rather than sink more time into patches.
- **Chromium only:** Restrict E2E to one browser to avoid multiplying AI calls and concurrency issues.

## Dependencies / Assumptions

- Dev environment with `DATABASE_URL` and `GEMINI_API_KEY` available
- AI response times remain fast enough for E2E tests to complete within reasonable timeouts. If this degrades, the E2E strategy would need revisiting.

## Outstanding Questions

### Deferred to Planning
- [Affects R3][Needs research] For each `waitForTimeout`, identify what specific DOM condition can replace it
- [Affects R4][Technical] What attribute name and placement works best for exposing path IDs to Playwright — `data-path-id` on the card, on the button, or both?
- [Affects R5][Needs research] Are there issues beyond stale selectors and the ID race condition that surface after fixing the first layers?

## Next Steps

-> `/ce:plan` for structured implementation planning

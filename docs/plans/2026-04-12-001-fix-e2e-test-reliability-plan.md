---
title: "fix: Make E2E test reliable with resilient selectors and condition-based waits"
type: fix
status: complete
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-test-reliability-requirements.md
---

# fix: Make E2E test reliable with resilient selectors and condition-based waits

## Overview

Fix the abandoned E2E test (`tests/journey.spec.ts`) so it passes reliably and provides regression confidence. The test structure is sound but has stale selectors (copy changed since writing), hardcoded `waitForTimeout` calls totaling 7.5 seconds, and a race condition where temporary negative IDs get replaced by real database IDs with no DOM signal. The Playwright config also runs 5 browser projects unnecessarily.

## Problem Frame

The app's only E2E test was abandoned months ago because it couldn't pass. The gap is specifically browser-level regression coverage — the API layer already has comprehensive tests with mocked AI. Since AI response times have improved, real AI calls are now practical for E2E, but the test needs selector updates, timing fixes, and a DOM-observable signal for the ID transition. (see origin: `docs/brainstorms/2026-04-12-test-reliability-requirements.md`)

## Requirements Trace

- R1. All selectors resilient to copy changes — semantic selectors over exact text
- R2. Audit and fix all stale selectors against current UI
- R3. No hardcoded `waitForTimeout` calls — condition-based waits only
- R4. Temp-to-real ID race condition solved with DOM-observable signal (`data-path-id`)
- R5. Test validates complete happy path with real AI: Questionnaire → Results → Action Plan
- R6. Clear failure diagnostics — screenshots, console errors
- R7. Playwright config restricted to Chromium only

## Scope Boundaries

- **In scope:** Fixing `tests/journey.spec.ts`, adding `data-path-id` attribute to production component, restricting Playwright config
- **Out of scope:** CI/CD, cross-browser testing, new API tests, mocking AI, performance/accessibility testing

## Context & Research

### Relevant Code and Patterns

| Purpose | Path |
|---------|------|
| E2E test | `tests/journey.spec.ts` |
| Playwright config | `playwright.config.ts` |
| Results page (streaming + completed) | `client/src/pages/results.tsx` |
| Purpose paths component | `client/src/components/results/purpose-paths.tsx` |
| Action plan page | `client/src/pages/action-plan.tsx` |
| Questionnaire component | `client/src/components/questionnaire/single-page-questionnaire.tsx` |
| Streaming state hook (polling) | `client/src/hooks/use-streaming-state.ts` |
| i18n strings | `client/src/lib/i18n.ts` |
| Toast component | `client/src/components/ui/toast.tsx` |

### Key Architecture Details

**Two rendering phases on results page:**
1. **Streaming mode** (`results.tsx` ~lines 317-458): Inline cards WITHOUT "Get Action Plan" buttons
2. **Completed mode** (`results.tsx` ~lines 520-576): `PurposePaths` component WITH buttons, initially with temp negative IDs

**Temp-to-real ID lifecycle:**
1. Streaming finishes → `onFinish` assigns temp IDs: `-1, -2, -3`
2. Polling starts at exponential intervals: `[500, 1000, 2000, 4000, 8000]ms`
3. Each poll checks `hasPositiveIds()` — whether all paths have `id > 0`
4. When positive IDs arrive → `setSession(dbSession)` triggers React re-render

**Zero `data-testid` attributes** exist anywhere in the codebase currently.

### Stale Selector Audit

| Location | Current Selector | Problem | Fix |
|----------|-----------------|---------|-----|
| Line 71 | `h2` with text `'Answer 8 questions, let our AI change your life.'` | Text is now `'Answer 8 questions. Find your thing.'` | Use regex pattern matching first part |
| Line 100 | `button:has-text("Show Me My Purpose")` | Text is now `'Show Me My 3 Paths'` | Use `data-testid` on submit button |
| Line 119 | `text=Generating your analysis...` | Text doesn't exist; actual is `'Enjoy some music while we cook up some options...'` | Wait for streaming content to appear instead of waiting for loading text to disappear |
| Line 273 | `[data-type="destructive"], .destructive` | `[data-type="destructive"]` doesn't exist, but `.destructive` class already matches via cva variants in `toast.tsx` — selector works by accident | Cleanup: remove dead `[data-type="destructive"]` branch, keep `.destructive` |

| Line 217 | `page.locator('h1')` | Action plan page uses `h2`, not `h1` — no `h1` exists in `action-plan.tsx` | Change to `page.locator('h2')` or use `h2` with text filter |

Selectors that are **correct**: path titles (`h4`), "Get Action Plan" button text, ikigai labels (`Love:`, `Good At:`, etc.), `h3` paths heading, Export/Back button regexes.

### Hardcoded Wait Audit

All four `waitForTimeout` calls are in the "Select first purpose path" step (lines 178-206), totaling 7.5 seconds:

| Line | Duration | Purpose | Replacement Strategy |
|------|----------|---------|---------------------|
| 181 | 5000ms | Wait for streaming to complete | Already covered by prior step's assertions on path titles/buttons |
| 185 | 2000ms | Wait for background refetch (ID transition) | Wait for `data-path-id` values to be positive |
| 195 | 500ms | "Stabilization delay" before click | Unnecessary once ID transition is confirmed |

**All three serve the same root cause:** waiting for the temp-to-real ID transition. A single condition-based wait on `data-path-id` values replaces all of them.

## Key Technical Decisions

- **`data-path-id` on the card root element, not the button:** The card wraps the button, giving the test a natural locator chain: find card by `[data-path-id]`, then find button within it. Also makes the attribute useful for other future tests.
- **Use Playwright's `toPass()` retry for ID transition:** This polls the DOM condition with configurable timeout, matching the app's own polling behavior. More idiomatic than custom retry loops.
- **Add `data-testid="questionnaire-submit"` to submit button:** The submit button text is the most frequently changed string in i18n. A test ID completely decouples the test from copy.
- **Tighten pathId URL assertion after fix:** Once the race condition is fixed, the URL should always contain a positive pathId. Change regex from `/pathId=-?\d+/` to `/pathId=[1-9]\d*/`.
- **R6 already met by existing test code:** The test takes screenshots at key steps AND captures console errors via `page.on('console')` (line 48-52). Both halves of R6 (screenshots + console errors) are already implemented. No changes needed.
- **Prefer `agent-browser` skill over Playwright MCP for ad-hoc verification:** When the implementer (human or agent) needs to manually verify DOM attributes, check UI state, or spot-check selectors during implementation, use the `agent-browser` skill (`.claude/skills/agent-browser/`) rather than the Playwright MCP tools. `agent-browser` is more token-efficient for interactive inspection (snapshot → check → done). Reserve Playwright MCP for cases requiring persistent browser sessions or complex multi-step automation that `agent-browser` cannot handle.

## Open Questions

### Resolved During Planning

- **What DOM condition replaces each `waitForTimeout`?** All three waits guard against the same thing: the temp-to-real ID transition. A single `toPass()` assertion that `data-path-id` values are positive replaces all of them.
- **Where should `data-path-id` go?** On the root element of each path card in `purpose-paths.tsx`, because it wraps all card content including the button.
- **Are there issues beyond stale selectors and the ID race condition?** Yes — the error toast selector (`[data-type="destructive"]`) doesn't match anything in production. Fix is trivial.
- **`data-testid` strategy?** Add only two: `data-testid="questionnaire-submit"` on the submit button (most brittle selector) and `data-path-id={path.id}` on path cards (solves the race condition). Minimize production footprint.

### Deferred to Implementation

- **Exact `toPass()` timeout values:** The full streaming→completed→positive-ID sequence should fit within ~30 seconds (prior step confirms streaming is in progress, so remaining streaming time is short + polling delays ~15.5s + network overhead). May need adjustment based on actual test runs.
- **Whether the existing `AI_STREAMING_TIMEOUT` (60s) is still needed:** AI is faster now, but keeping it as a safety net costs nothing. Revisit only if tests become slow.

## Implementation Units

- [x] **Unit 1: Restrict Playwright config to Chromium only**

**Goal:** Eliminate unnecessary browser concurrency and API cost for E2E runs

**Requirements:** R7

**Dependencies:** None

**Files:**
- Modify: `playwright.config.ts`

**Approach:**
- Remove the 4 non-Chromium projects (Firefox, WebKit, Mobile Chrome, Mobile Safari) from the `projects` array
- Keep the Chromium project configuration as-is

**Patterns to follow:**
- Existing `playwright.config.ts` structure

**Test scenarios:**
- Happy path: `npx playwright test --list` shows only Chromium project

**Verification:**
- `npm run test:e2e -- --list` lists tests under Chromium only, no other browsers

---

- [x] **Unit 2: Add `data-path-id` and `data-testid` attributes to production components**

**Goal:** Provide DOM-observable signals for the ID transition and a stable selector for the submit button

**Requirements:** R4, R1

**Dependencies:** None

**Files:**
- Modify: `client/src/components/results/purpose-paths.tsx`
- Modify: `client/src/components/questionnaire/single-page-questionnaire.tsx`

**Approach:**
- In `purpose-paths.tsx`: add `data-path-id={path.id}` to the root element of each path card. This exposes the ID lifecycle (negative temp → positive real) to Playwright
- In `single-page-questionnaire.tsx`: add `data-testid="questionnaire-submit"` to the submit button element

**Patterns to follow:**
- Standard React `data-*` attribute pattern — no additional libraries needed

**Test scenarios:**
- Happy path: Path cards render with `data-path-id` attribute containing the path's numeric ID
- Edge case: During streaming (before `onFinish`), path cards in the streaming branch don't have `data-path-id` (they're rendered by different JSX, not the `PurposePaths` component)
- Integration: After polling replaces temp IDs, React re-renders cards with positive `data-path-id` values — observable via Playwright `locator('[data-path-id]')`

**Verification:**
- Browser dev tools show `data-path-id` on path card elements after results load
- Submit button has `data-testid="questionnaire-submit"` in DOM
- Use `agent-browser` skill for spot-checking attributes: `agent-browser open <dev-url>/results` → `agent-browser snapshot -i` → verify `data-path-id` appears on path card elements

---

- [x] **Unit 3: Fix stale selectors in journey.spec.ts**

**Goal:** Update all selectors that no longer match the current UI

**Requirements:** R1, R2, R6

**Dependencies:** Unit 2 (needs `data-testid="questionnaire-submit"`)

**Files:**
- Modify: `tests/journey.spec.ts`

**Approach:**
- **Line 71** (questionnaire heading): Replace exact text match with a regex that captures the stable portion, e.g., `/Answer 8 questions/`
- **Line 100** (submit button): Replace `button:has-text("Show Me My Purpose")` with `[data-testid="questionnaire-submit"]`
- **Line 119** (streaming indicator): The text `'Generating your analysis...'` doesn't exist. Replace this "not visible" check with a positive wait: wait for the streaming content (path titles or core drivers paragraph) to appear, which implicitly confirms loading is done
- **Line 217** (action plan heading): Change `page.locator('h1')` to `page.locator('h2')` — `action-plan.tsx` renders `h2` headings, not `h1`
- **Line 273** (error toast): Remove dead `[data-type="destructive"]` selector branch (never matches); keep `.destructive` class which already works via cva variants

**Patterns to follow:**
- Existing test uses `filter({ hasText: ... })` and regex patterns in several places — extend this pattern
- Playwright best practice: prefer `getByRole`, `getByTestId`, and regex text over exact string matching

**Test scenarios:**
- Happy path: Each updated selector resolves to the correct element in the current UI
- Edge case: Submit button is found via `data-testid` regardless of what text it displays
- Edge case: Questionnaire heading matches even if subtitle text changes (regex anchored to stable prefix)

**Verification:**
- Test progresses past the questionnaire step and results loading step without selector errors (may still fail on timing in Unit 4's territory)

---

- [x] **Unit 4: Replace hardcoded waits with condition-based waits**

**Goal:** Remove all `waitForTimeout` calls and replace with deterministic DOM condition waits

**Requirements:** R3, R4

**Dependencies:** Unit 2 (needs `data-path-id` attribute), Unit 3 (selectors must be correct first)

**Files:**
- Modify: `tests/journey.spec.ts`

**Approach:**
- Remove all three `waitForTimeout` calls in the "Select first purpose path" step (lines 181, 185, 195)
- Replace with a single `toPass()` assertion that waits for `data-path-id` values on path cards to be positive integers. This directly observes the temp-to-real ID transition. **Important timing note:** `data-path-id` only appears on `PurposePaths` cards rendered in "completed mode" — NOT on the inline streaming cards. So the `toPass()` assertion implicitly waits for streaming to finish AND the React re-render into completed mode AND the polling to replace negative IDs. The prior test step already asserts on path titles/buttons (confirming streaming is progressing), so by the time Unit 4's step runs, streaming is nearly complete — but the timeout must still account for the full streaming→completed→positive-ID sequence, not just the polling schedule alone
- The wait should use a generous timeout (~30 seconds) to cover the full sequence: remaining streaming time + completed-mode re-render + polling schedule. The polling delays alone total ~15.5 seconds worst case, but network latency on each poll request adds overhead
- Add a code comment on the `toPass()` call explaining the coupling to the polling schedule in `use-streaming-state.ts` (e.g., `// Timeout covers: streaming completion + completed-mode re-render + polling schedule in use-streaming-state.ts [500, 1000, 2000, 4000, 8000]ms`)
- After the ID transition is confirmed, locate the first path card via `[data-path-id]` and click its "Get Action Plan" button — this guarantees navigating with a real database ID
- Tighten the pathId URL assertion from `/pathId=-?\d+/` to `/pathId=[1-9]\d*/` since the race condition is now fixed

**Patterns to follow:**
- The test already uses `toPass()` with timeout in other steps (lines 123-126, 133-136) — extend this pattern
- Playwright's `toHaveAttribute` with regex for clean attribute value matching

**Test scenarios:**
- Happy path: Test waits for `data-path-id` to become positive, clicks "Get Action Plan", navigates with a positive pathId in URL
- Edge case: If AI is slow and polling takes longer, the `toPass()` timeout (~30s) provides enough headroom for the full streaming→completed→positive-ID sequence
- Integration: The full sequence — streaming complete → temp IDs assigned → polling → real IDs arrive → test clicks button → action plan loads with valid pathId — works end-to-end without any hardcoded delays
- Error path: If polling never returns positive IDs within timeout, the `toPass()` assertion fails with a clear error message indicating which `data-path-id` values were still negative

**Verification:**
- Zero `waitForTimeout` calls remain in the test file
- `npm run test:e2e` passes 3 consecutive runs without flakiness (Chromium only)

## System-Wide Impact

- **Interaction graph:** Adding `data-path-id` to path cards has zero behavioral impact — it only adds a DOM attribute. Adding `data-testid` to the submit button is similarly inert. No callbacks, middleware, or observers affected.
- **Error propagation:** No changes to error handling. The error toast selector fix is cosmetic (the selector was partially working by accident).
- **State lifecycle risks:** None. The test consumes DOM state; it doesn't modify the app's state lifecycle.
- **API surface parity:** Not applicable — changes are limited to DOM attributes and test code.
- **Integration coverage:** The E2E test IS the integration coverage. Once fixed, it covers the full Questionnaire → Results (streaming) → Action Plan flow with real AI.
- **Unchanged invariants:** The `PurposePaths` component's rendering logic, the polling mechanism in `use-streaming-state.ts`, and the action plan's pathId lookup are all unchanged. The fix observes existing behavior rather than modifying it.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| AI response times degrade, making E2E tests slow/flaky | Keep generous timeouts. If degradation is persistent, revisit E2E strategy per requirements doc assumptions. |
| "Fix, don't rewrite" proves impractical during implementation | Requirements doc explicitly calls for escalation if deeper architectural issues surface. Units are sequenced so early units surface problems before deep investment. |
| Polling schedule changes in future, breaking timeout assumptions | The `toPass()` timeout (~30s) is well above the worst-case sequence time. A code comment noting the coupling to `use-streaming-state.ts` will help future maintainers. |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-12-test-reliability-requirements.md](docs/brainstorms/2026-04-12-test-reliability-requirements.md)
- Related code: `client/src/hooks/use-streaming-state.ts` (polling schedule and `hasPositiveIds` logic)
- Related code: `client/src/lib/i18n.ts` (source of truth for all UI text strings)

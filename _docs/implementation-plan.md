# Implementation Plan

## Phase 0: Foundation & Testing Setup

This initial phase establishes the project's core dependencies and configures the testing frameworks, ensuring that every subsequent feature can be automatically validated.

[X] Step 1: Install Dependencies and Configure Environment
**Task**: Install the necessary packages: `@replit/database` for persistent storage, `@playwright/test` for end-to-end testing, and `p-limit` for concurrency control. After installing, configure the `REPLIT_DB_URL` in your Replit Secrets.
**Suggested Files for Context**: `package.json`
**Step Dependencies**: None

---

[X] Step 2: Configure Vitest and Playwright
**Task**: Create or update the configuration files for our testing frameworks. Ensure `vitest.config.ts` is set up for testing server-side code. Create `playwright.config.ts` at the project root, configuring the `baseURL` and the `webServer` command needed to launch the app for testing.
**Suggested Files for Context**: `vite.config.ts`, `package.json`
**Step Dependencies**: Step 1
**Completed**: ✅ Updated `vitest.config.ts` with server-side Node.js environment and client-side jsdom environment support. ✅ Created `playwright.config.ts` with baseURL (localhost:5000) and webServer configuration. ✅ Added Playwright test scripts to package.json. ✅ Created tests/ directory structure. ✅ Verified both configurations work correctly.

---

## Phase 1: Backend Foundation: Replit KV Storage & Guardrails

This phase builds a robust backend by implementing persistent storage, unit tests for that storage, and essential safeguards like a concurrency limiter.

[ ] Step 3: Implement `ReplitKVStorage` Class
**Task**: In `server/storage.ts`, create a new class `ReplitKVStorage` that implements the `IStorage` interface, using the `@replit/database` client and a prefixed key structure (e.g., `sess:<sessionId>:core`). The `hydrateSession` method will fetch data from multiple keys and assemble the complete session object.
**Suggested Files for Context**: `server/storage.ts`, `shared/schema.ts`
**Step Dependencies**: Step 2

---

[ ] Step 4: Write Unit Tests for `ReplitKVStorage`
**Task**: In a new test file `server/storage.test.ts`, write unit tests for the `ReplitKVStorage` class using Vitest. Mock the `@replit/database` client to verify that your `create`, `get`, `update`, and `delete` logic correctly handles the prefixed-key strategy.
**Suggested Files for Context**: `server/storage.ts`
**Step Dependencies**: Step 3

---

[ ] Step 5: Implement Concurrency Limiter for AI Routes
**Task**: Create a new utility file, `server/ai/limiter.ts`. Using the `p-limit` library, create and export a limiter instance (e.g., `const aiLimiter = pLimit(5);`). In `server/routes/assessment.ts`, import this limiter and wrap the core logic of every AI-powered route within it (e.g., `aiLimiter(() => getPurposeDiscoveryStreamChain(...))`).
**Suggested Files for Context**: `server/routes/assessment.ts`
**Step Dependencies**: Step 4

---

[ ] Step 6: Implement Session Management Endpoints
**Task**: Create a new API route file `server/routes/session.ts`. Add two endpoints:
1.  A `GET /api/session/:sessionId` endpoint that retrieves and returns the fully hydrated session data from the KV store.
2.  A `POST /api/session/start-over` endpoint that uses `db.list(prefix)` to find all keys for a `sessionId` and deletes them.
Integrate this new router in `server/routes.ts` and update the `handleStartOver` function in `client/src/App.tsx` to call the new "start-over" endpoint.
**Suggested Files for Context**: `server/storage.ts`, `client/src/App.tsx`, `server/routes.ts`
**Step Dependencies**: Step 5

---

## Phase 2: Backend Word-by-Word Streaming API

This phase refactors the AI chains and endpoints to support word-by-word streaming, providing a dynamic, real-time user experience.

[ ] Step 7: Implement Word-by-Word Streaming for Purpose Discovery
**Task**: Create `server/ai/chains/purpose-discovery.stream.chain.ts`. The main generator function will now orchestrate a continuous text stream. Update the prompt in `server/ai/prompts.ts` to instruct the model to first generate the Core Drivers Analysis, then each Purpose Path, separating the sections with clear delimiters (e.g., `[SECTION:CORE_DRIVERS]...text...[END_SECTION]`). In `server/routes/assessment.ts`, update the `/api/analyze/stream` endpoint to pipe the raw text chunks from `generateContentStream` directly to the client as SSE `message` events, while also assembling the full text on the server to save to the KV store upon completion.
**Suggested Files for Context**: `server/ai/prompts.ts`, `server/ai/wrapper.ts`, `server/routes/assessment.ts`, `server/storage.ts`
**Step Dependencies**: Step 6

---

[ ] Step 8: Write Integration Test for `/api/analyze/stream` Endpoint
**Task**: In a new test file `server/routes/assessment.stream.test.ts`, write an integration test for the streaming endpoint. Mock the AI chain to return a predictable stream of text chunks. Verify that the server streams these chunks correctly as SSE `message` events.
**Suggested Files for Context**: `server/routes/assessment.ts`, `server/ai/chains/purpose-discovery.stream.chain.ts`
**Step Dependencies**: Step 7

---

[ ] Step 9: Implement Word-by-Word Streaming for Action Plan
**Task**: Following the same pattern, create `server/ai/chains/action-plan.stream.chain.ts` and update `server/ai/prompts.ts` to generate the action plan as a continuous stream of text, with delimiters separating each milestone. Update the `/api/action-plan/stream` endpoint in `server/routes/assessment.ts` to handle this new text stream, piping it to the client and saving the final result.
**Suggested Files for Context**: `server/ai/prompts.ts`, `server/ai/wrapper.ts`, `server/routes/assessment.ts`, `server/storage.ts`
**Step Dependencies**: Step 8

---

[ ] Step 10: Write Integration Test for `/api/action-plan/stream` Endpoint
**Task**: In `server/routes/assessment.stream.test.ts`, add an integration test for the `/api/action-plan/stream` endpoint. Mock the AI chain and verify that it correctly streams text chunks as SSE `message` events.
**Suggested Files for Context**: `server/routes/assessment.ts`, `server/ai/chains/action-plan.stream.chain.ts`
**Step Dependencies**: Step 9

---

## Phase 3: Frontend Integration and E2E Testing

This phase connects the frontend to the new word-by-word streaming APIs and validates the entire user experience with an end-to-end test.

[ ] Step 11: Refactor Frontend Pages to Handle Word-by-Word Streams
**Task**: Update both `client/src/pages/results.tsx` and `client/src/pages/action-plan.tsx`. On page load, first call the `GET /api/session/:sessionId` endpoint. If complete data is returned, render it immediately. If not, connect to the appropriate streaming endpoint (`/analyze/stream` or `/action-plan/stream`) using `EventSource`. As text chunks arrive, append them to a buffer in local state. Write parsing logic that uses the section delimiters (`[SECTION:...]`) to extract and render completed sections of content progressively.
**Suggested Files for Context**: `client/src/pages/results.tsx`, `client/src/pages/action-plan.tsx`, `client/src/App.tsx`
**Step Dependencies**: Step 10

---

[ ] Step 12: Write E2E Test for Core User Journey
**Task**: Create a new E2E test file, `tests/journey.spec.ts`. Using Playwright, write a test that covers the full user flow. It should fill out the questionnaire, submit, and then on the results and action plan pages, it should assert that the final, fully-streamed content (e.g., the third purpose path, the last milestone) becomes visible on the page.
**Suggested Files for Context**: `client/src/pages/home.tsx`, `client/src/pages/results.tsx`, `client/src/pages/action-plan.tsx`, `playwright.config.ts`
**Step Dependencies**: Step 11

---

## Phase 4: Final Hardening and Debugging

This final phase improves resilience and provides developers with the tools to effectively debug and replicate AI failures.

[ ] Step 13: Implement Enhanced AI Error Logging
**Task**: Update the `catch` blocks in all four AI chain files. When an error is caught, log a structured JSON object that includes the original error, the `userInput`, the `finishReason` from the AI response, and the `functionCall` name and arguments. This will provide a complete snapshot of any failure.
**Suggested Files for Context**: `server/ai/chains/purpose-discovery.stream.chain.ts`, `server/ai/chains/action-plan.stream.chain.ts`
**Step Dependencies**: Step 12

---

[ ] Step 14: Create a Developer Script for Controlled Edge-Case Testing
**Task**: Create a new file `_docs/manual-test-harness.ts` (or similar). This script will not be part of the main application build. It should be a simple Node.js script that allows a developer to easily send a predefined JSON object (representing difficult questionnaire answers) to the `/api/analyze/stream` endpoint and print the raw streaming output. Include sample inputs in the script for testing vague, abstract, non-sequitur, and multi-language answers to help isolate issues. This is a manual tool for the development team.
**Suggested Files for Context**: `server/routes/assessment.ts`, `shared/schema.ts`
**Step Dependencies**: Step 13
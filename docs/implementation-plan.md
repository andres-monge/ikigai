# Implementation Plan

## Phase 0: Local Environment & Database Setup

This foundational phase configures your local development environment to connect to a dedicated development database on Replit and sets up Drizzle ORM for managing database schema migrations.

[X] Step 1: Configure Local Development Environment
**Task**: Prepare your local machine for development. This involves creating a local `.env` file to store secrets, ensuring it's ignored by Git, and installing all project dependencies. This setup will allow you to run the server locally and connect to your development database hosted on Replit.
**Suggested Files for Context**: `package.json`, `.env.local`
**Step Dependencies**: None
**User Instructions**:
1.  If you haven't already, clone your project repository from GitHub to your local machine.
2.  Create a new file named `.env` in the root directory of your local project.
3.  Add the line `.env` to your `.gitignore` file to prevent committing secrets.
4.  Run `npm install` in your terminal to install all project dependencies.

---

[X] Step 2: Set Up Production & Development Databases
**Task**: Create two separate PostgreSQL databases using Replit's built-in database feature. One will serve as your live **production** database in your main application, and the other will be a safe **development** sandbox.
**Suggested Files for Context**: `replit.md`
**Step Dependencies**: Step 1
**User Instructions**:
1.  **Create Production DB**: In your main "Ikigai Finder" Replit project, navigate to the **Tools** tab and add a **Database**. Replit will automatically populate the **Secrets** with the production `DATABASE_URL` and other credentials.
2.  **Create Development DB**: Create a new, separate Replit project named "Dev-DB-Ikigai-Finder" (or similar). Add a **Database** to this new project as well.
3.  **Update Local `.env`**: Copy the `DATABASE_URL` from the **Secrets** of your *new development project* ("Dev-DB-Ikigai-Finder") and paste it into the `.env` file on your *local machine*. **Do not** use the production URL locally.

---

[X] Step 3: Centralize Environment Variable Management
**Task**: Create a new file `server/env.ts` to securely load, validate, and export all environment variables (like `DATABASE_URL` and `GEMINI_API_KEY`) from `process.env`. This module will ensure that required variables are present at runtime and provide a single, type-safe source for configuration throughout the backend.
**Suggested Files for Context**: `server/index.ts`, `server/ai/wrapper.ts`, `docs/tech-spec.md`
**Step Dependencies**: Step 2

---

[X] Step 4: Configure Drizzle ORM and Migrations
**Task**: Install `drizzle-kit` and `pg` as development dependencies. Create a `drizzle.config.ts` file that reads the `DATABASE_URL` from the environment. Update `package.json` with new scripts (`db:gen`, `db:migrate:dev`, `db:migrate:prod`) to generate and apply database migrations using `drizzle-kit`. Create a `server/db.ts` file to initialize and export the Drizzle client instance, connecting to the database using the URL from the new `server/env.ts` module.
**Suggested Files for Context**: `package.json`, `shared/schema.ts`, `server/env.ts`
**Step Dependencies**: Step 3
**User Instructions**: After the AI has generated the files, run `npm db:gen` followed by `npm db:migrate:dev` locally to generate the initial migration file based on `shared/schema.ts` and apply it to your database.

---

## Phase 1: Backend Foundation: Postgres Storage & Guardrails

This phase replaces the in-memory storage with a persistent PostgreSQL implementation and adds essential safeguards like a concurrency limiter.

[X] Step 5: Implement `PostgresStorage` Class
**Task**: In `server/storage.ts`, replace the `MemStorage` class with a new `PostgresStorage` class that implements the `IStorage` interface. Use the Drizzle client from `server/db.ts` to perform all database operations (create, get, update, delete). The `hydrateSession` method should now perform relational queries using Drizzle to join `assessment_sessions` with their related `purpose_paths`.
**Suggested Files for Context**: `server/storage.ts`, `shared/schema.ts`, `server/db.ts`, `server/routes/assessment.ts`
**Step Dependencies**: Step 4

---

[X] Step 6: Write Integration Tests for `PostgresStorage`
**Task**: Create a new test file `server/storage.test.ts`. Write integration tests for the `PostgresStorage` class using Vitest. The tests should connect to the development database to verify that the `create`, `get`, `update`, and `delete` methods correctly interact with the database and that `hydrateSession` returns the expected nested data structures.
**Suggested Files for Context**: `server/storage.ts`, `shared/schema.ts`, `vitest.config.ts`
**Step Dependencies**: Step 5
**User Instructions**: Ensure your development database is running and accessible before executing the tests.

---

[X] Step 7: Implement Concurrency Limiter for AI Routes
**Task**: Create `server/ai/limiter.ts` with p-limit concurrency control (max 2 concurrent). Wrap AI chain calls in `server/routes/assessment.ts` with the limiter.
**Suggested Files for Context**: `server/routes/assessment.ts`, `package.json`
**Step Dependencies**: Step 6

---

[X] Step 8: Implement Session Management Endpoints
**Task**: Create a new API route file `server/routes/session.ts`. Add two endpoints:
1.  A `GET /api/session/:sessionId` endpoint that retrieves and returns the fully hydrated session data from the Postgres database.
2.  A `POST /api/session/start-over` endpoint that finds and deletes all data associated with a `sessionId` from the relevant database tables.
Integrate this new router in `server/routes.ts` and update the `handleStartOver` function in `client/src/App.tsx` to call the new "start-over" endpoint.
**Suggested Files for Context**: `server/storage.ts`, `client/src/App.tsx`, `server/routes.ts`
**Step Dependencies**: Step 7

---

## Phase 1 Optimization: Technical Debt Prevention

[X] Step 8.1: Fix Non-Atomic Database Operations
**Task**: In server/routes/assessment.ts, wrap the delete/create operations in a try-catch to ensure we don't leave the database in an inconsistent state. If path creation fails, the session should remain unchanged. Simple approach: store paths in memory first, only delete old ones after successful creation.
**Suggested Files for Context**: `server/routes/assessment.ts`, `server/storage.ts`
**Step Dependencies**: None

---

[X] Step 8.2: Remove any Types from Storage Layer
**Task**: Replace any with proper types in PostgresStorage. This prevents runtime errors from typos and makes the code self-documenting. Quick fix without changing functionality.
**Suggested Files for Context**: `server/storage.ts`, `shared/schema.ts`
**Step Dependencies**: None

---

[X] Step 8.3: Fix Frontend Routing Bug
**Task**: In results.tsx, change redirect from /questionnaire (doesn't exist) to /. This is a real bug that breaks user flow.
**Suggested Files for Context**: `client/src/pages/results.tsx`
**Step Dependencies**: None

---

[X] Step 8.4: Remove Unused Type That Causes Confusion
**Task**: Remove PurposePathWithSalary type and its salaryData field since the spec embeds salary in ikigaiAlignment.pay. This mismatch between frontend and backend types is technical debt.
**Suggested Files for Context**: `client/src/types/assessment.ts`, `client/src/components/results/purpose-paths.tsx`
**Step Dependencies**: None

---

[ ] Step 8.5: Add Test for Atomic Operations
**Task**: Add one test to verify that if path creation fails, old paths aren't deleted. This guards against the main data consistency issue.
**Suggested Files for Context**: `server/routes/assessment.test.ts`
**Step Dependencies**: Step 8.1

---

## Phase 2: Backend Word-by-Word Streaming API

This phase refactors the AI chains and endpoints to support word-by-word streaming, providing a dynamic, real-time user experience.

[ ] Step 9: COMPLEX: Implement Word-by-Word Streaming for Purpose Discovery
**Task**: Create `server/ai/chains/purpose-discovery.stream.chain.ts`. The main generator function will orchestrate a continuous text stream. Update the prompt in `server/ai/prompts.ts` to instruct the model to generate the Core Drivers Analysis and each Purpose Path separated by clear delimiters (e.g., `[SECTION:CORE_DRIVERS]...text...[END_SECTION]`). In `server/routes/assessment.ts`, update the `/api/analyze/stream` endpoint to pipe raw text chunks from `generateContentStream` to the client as Server-Sent Events (SSE), while also assembling the full text on the server to save to the database upon completion.
**Suggested Files for Context**: `server/ai/prompts.ts`, `server/ai/wrapper.ts`, `server/routes/assessment.ts`, `server/storage.ts`
**Step Dependencies**: Step 8

---

[ ] Step 10: Write Integration Test for `/api/analyze/stream` Endpoint
**Task**: In a new test file `server/routes/assessment.stream.test.ts`, write an integration test for the streaming endpoint. Mock the AI chain to return a predictable stream of text chunks. Verify that the server streams these chunks correctly as SSE `message` events.
**Suggested Files for Context**: `server/routes/assessment.ts`, `server/ai/chains/purpose-discovery.stream.chain.ts`
**Step Dependencies**: Step 9

---

[ ] Step 11: COMPLEX: Implement Word-by-Word Streaming for Action Plan
**Task**: Following the same pattern, create `server/ai/chains/action-plan.stream.chain.ts` and update `server/ai/prompts.ts` to generate the action plan as a continuous stream of text, with delimiters separating each milestone. Update the `/api/action-plan/stream` endpoint in `server/routes/assessment.ts` to handle this new text stream, piping it to the client and saving the final result to the database.
**Suggested Files for Context**: `server/ai/prompts.ts`, `server/ai/wrapper.ts`, `server/routes/assessment.ts`, `server/storage.ts`
**Step Dependencies**: Step 10

---

[ ] Step 12: Write Integration Test for `/api/action-plan/stream` Endpoint
**Task**: In `server/routes/assessment.stream.test.ts`, add an integration test for the `/api/action-plan/stream` endpoint. Mock the AI chain and verify that it correctly streams text chunks as SSE `message` events.
**Suggested Files for Context**: `server/routes/assessment.ts`, `server/ai/chains/action-plan.stream.chain.ts`
**Step Dependencies**: Step 11

---

## Phase 3: Frontend Integration and E2E Testing

This phase connects the frontend to the new word-by-word streaming APIs and validates the entire user experience with an end-to-end test.

[ ] Step 13: COMPLEX: Refactor Frontend Pages to Handle Word-by-Word Streams
**Task**: Update both `client/src/pages/results.tsx` and `client/src/pages/action-plan.tsx`. On page load, first call the `GET /api/session/:sessionId` endpoint. If complete data is returned, render it immediately. If not, connect to the appropriate streaming endpoint (`/analyze/stream` or `/action-plan/stream`) using the `EventSource` API. As text chunks arrive, append them to a buffer in local state. Write parsing logic that uses the section delimiters (`[SECTION:...]`) to extract and render completed sections of content progressively.
**Suggested Files for Context**: `client/src/pages/results.tsx`, `client/src/pages/action-plan.tsx`, `client/src/App.tsx`
**Step Dependencies**: Step 12

---

[ ] Step 14: COMPLEX: Write E2E Test for Core User Journey
**Task**: Create a new E2E test file, `tests/journey.spec.ts`. Using Playwright, write a test that covers the full user flow. It should fill out the questionnaire, submit, and then on the results and action plan pages, it should assert that the final, fully-streamed content becomes visible on the page.
**Suggested Files for Context**: `client/src/pages/home.tsx`, `client/src/pages/results.tsx`, `client/src/pages/action-plan.tsx`, `playwright.config.ts`
**Step Dependencies**: Step 13

---

## Phase 4: Final Hardening and Debugging

This final phase improves resilience and provides developers with the tools to effectively debug and replicate AI failures.

[ ] Step 15: Implement Enhanced AI Error Logging
**Task**: Update the `catch` blocks in all AI chain files. When an error is caught, log a structured JSON object that includes the original error, the `userInput`, the `finishReason` from the AI response, and any `functionCall` details. This will provide a complete snapshot of any failure for easier debugging.
**Suggested Files for Context**: `server/ai/chains/purpose-discovery.stream.chain.ts`, `server/ai/chains/action-plan.stream.chain.ts`, `server/ai/chains/purpose-discovery.chain.ts`, `server/ai/chains/action-plan.chain.ts`
**Step Dependencies**: Step 14

---

[ ] Step 16: Create a Developer Script for Controlled Edge-Case Testing
**Task**: Create a new file `_docs/manual-test-harness.ts`. This script will not be part of the main application build. It should be a simple Node.js script that allows a developer to easily send a predefined JSON object (representing difficult questionnaire answers) to the `/api/analyze/stream` endpoint and print the raw streaming output. Include sample inputs in the script for testing vague, abstract, non-sequitur, and multi-language answers to help isolate issues.
**Suggested Files for Context**: `server/routes/assessment.ts`, `shared/schema.ts`
**Step Dependencies**: Step 15

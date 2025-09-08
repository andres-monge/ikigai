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

[X] Step 8.0: Implement Session Management Endpoints
**Task**: Create a new API route file `server/routes/session.ts`. Add two endpoints:
1.  A `GET /api/session/:sessionId` endpoint that retrieves and returns the fully hydrated session data from the Postgres database.
2.  A `POST /api/session/start-over` endpoint that finds and deletes all data associated with a `sessionId` from the relevant database tables.
Integrate this new router in `server/routes.ts` and update the `handleStartOver` function in `client/src/App.tsx` to call the new "start-over" endpoint.
**Suggested Files for Context**: `server/storage.ts`, `client/src/App.tsx`, `server/routes.ts`
**Step Dependencies**: Step 7

---

## Phase 1 Optimization: Technical Debt Prevention

[X] Step 8.1: Fix Non-Atomic Database Operations
[X] Step 8.2: Remove any Types from Storage Layer
[X] Step 8.3: Fix Frontend Routing Bug
[X] Step 8.4: Remove Unused Type That Causes Confusion
[X] Step 8.5: Add Test for Atomic Operations

---

## Phase 2: Backend Word-by-Word Streaming API

This phase refactors the AI chains and endpoints to support word-by-word streaming, providing a dynamic, real-time user experience.

[X] Step 9: COMPLEX: Implement Word-by-Word Streaming for Purpose Discovery
**Task**: Create `server/ai/chains/purpose-discovery.stream.chain.ts`. The main generator function will orchestrate a continuous text stream. Update the prompt in `server/ai/prompts.ts` to instruct the model to generate the Core Drivers Analysis and each Purpose Path separated by clear delimiters (e.g., `[SECTION:CORE_DRIVERS]...text...[END_SECTION]`). In `server/routes/assessment.ts`, update the `/api/analyze/stream` endpoint to pipe raw text chunks from `generateContentStream` to the client as Server-Sent Events (SSE), while also assembling the full text on the server to save to the database upon completion.
**Suggested Files for Context**: `server/ai/prompts.ts`, `server/ai/wrapper.ts`, `server/routes/assessment.ts`, `server/storage.ts`
**Step Dependencies**: Step 8.0
**Implementation Notes**: 
- Created `server/ai/chains/purpose-discovery.stream.chain.ts` with async generator
- Added `getPurposeDiscoveryStreamingPrompt` to `server/ai/prompts.ts` with delimiter format
- Implemented `GET /api/analyze/stream` SSE endpoint in `server/routes/assessment.ts`
- Added dual parsing (client gets raw chunks, server validates before DB save)
- Implemented concurrent session limiting (1 stream per session)
- Added atomic database persistence matching non-streaming behavior
- Updated `server/ai/wrapper.ts` to use official SDK while maintaining same public interface
- Thin compatibility layer - replaced internal fetch calls with SDK, kept function signatures unchanged
- Replaced manual API calls with `ai.models.generateContent()` and `ai.models.generateContentStream()`
- Added model ID normalization (strips `models/` prefix for SDK compatibility)
- Type Safety Enhancements to `server/ai/wrapper.ts` and `server/ai/types.ts`

---

[X] Step 10: Write Integration Test for `/api/analyze/stream` Endpoint
**Task**: In a new test file `server/routes/assessment.stream.test.ts`, write an integration test for the streaming endpoint. Mock the AI chain to return a predictable stream of text chunks. Verify that the server streams these chunks correctly as SSE `message` events.
**Suggested Files for Context**: `server/routes/assessment.ts`, `server/ai/chains/purpose-discovery.stream.chain.ts`
**Step Dependencies**: Step 9
**Implementation Notes**:
- Created comprehensive integration test suite with 6 passing tests (1 skipped)
- Implemented SSE parsing utilities for testing Server-Sent Events format
- Tests cover: happy path streaming, database persistence, error handling, concurrent sessions, invalid preconditions
- Mock `getPurposeDiscoveryStreamChain` with realistic delimited output matching production format
- Demonstrates self-verifying loop: tests provide clear error messages when they fail, enabling AI agents to understand and fix issues
- Implemented real HTTP server concurrency test using fetch() and AbortController for production-equivalent verification
- Test verification: Successful SSE event sequence ([STREAM_START] → chunks → [STREAM_END] → [SAVE_SUCCESS])
- Database verification: Confirms parsed streaming data persists correctly with 3 purpose paths and core drivers analysis
- Error path verification: AI chain failures result in [ERROR] events and no partial database updates

---

[X] Step 11: COMPLEX: Implement Word-by-Word Streaming for Action Plan
**Task**: Following the same pattern, create `server/ai/chains/action-plan.stream.chain.ts` and update `server/ai/prompts.ts` to generate the action plan as a continuous stream of text, with delimiters separating each milestone. Update the `/api/action-plan/stream` endpoint in `server/routes/assessment.ts` to handle this new text stream, piping it to the client and saving the final result to the database.
**Suggested Files for Context**: `server/ai/prompts.ts`, `server/ai/wrapper.ts`, `server/routes/assessment.ts`, `server/storage.ts`
**Step Dependencies**: Step 10
**Implementation Notes**:
- Created `server/ai/chains/action-plan.stream.chain.ts` following exact pattern from Step 9
- Added `getActionPlanStreamingPrompt` to `server/ai/prompts.ts` with milestone delimiter format
- Implemented `GET /api/action-plan/stream` SSE endpoint in `server/routes/assessment.ts`
- Added `parseActionPlanStreamedText` parser function for milestone extraction
- Implemented post-stream YouTube enrichment: streams text first, then fetches videos in batch
- SSE event flow: `[STREAM_START]` → chunks → `[STREAM_END]` → `[ENRICH_START]` → `[SAVE_SUCCESS]`
- Reused existing concurrency controls, session management, and atomic persistence patterns
- Added flexible chosenPathId handling: uses session's existing ID or accepts query parameter
- Post-stream enrichment extracts unique skills across milestones, fetches YouTube videos once, maps back to milestones

---

[X] Step 12: Write Integration Test for `/api/action-plan/stream` Endpoint
**Task**: In `server/routes/assessment.stream.test.ts`, add an integration test for the `/api/action-plan/stream` endpoint. Mock the AI chain and verify that it correctly streams text chunks as SSE `message` events.
**Suggested Files for Context**: `server/routes/assessment.ts`, `server/ai/chains/action-plan.stream.chain.ts`
**Step Dependencies**: Step 11
**Implementation Notes**:
- Added 9 comprehensive integration tests (8 core scenarios + 1 critical error handling)
- Tests cover: happy path with YouTube enrichment, concurrency control, error handling, parameter validation
- **Critical Step 11 Bug Fix Discovered**: Action parsing failed when streaming concatenated bullet points without newlines
  - Root cause: `parseMilestoneSection` only handled newline-separated actions, not concatenated format from streaming
  - Fix: Enhanced parser to handle both newline-separated AND bullet-point-separated actions (`lines 572-591` in `server/routes/assessment.ts`)
  - Impact: Prevents production failures with real AI responses that may arrive concatenated
- **YouTube Enrichment Error Handling**: Added test for YouTube API failures during enrichment phase
  - Ensures graceful degradation when YouTube API is down or rate-limited
  - Prevents partial data corruption in database when enrichment fails
  - SSE event sequence: `[STREAM_START]` → chunks → `[STREAM_END]` → `[ENRICH_START]` → `[ERROR]` (no partial saves)
- **Mock Consistency**: Fixed test isolation with explicit YouTube service mock reset in `beforeEach`
- **Production-Ready Test Data**: Updated YouTube URLs to realistic format matching production API responses
- **Self-Verifying Loop**: Tests provide clear, actionable error messages enabling AI agents to debug issues autonomously
- **Concurrency Testing**: Real HTTP server tests with `fetch()` and `AbortController` for production-equivalent verification
- **Database Verification**: Complete flow testing from streaming → parsing → enrichment → persistence
- **Key Issue for Future Steps**: The action parsing enhancement affects how AI prompts should be structured - ensure consistent delimiter formatting in all streaming chains

---

## Phase 2 Optimization: Technical Debt Prevention

### Code Organization & Modularization

[X] Step 12.1: Extract Streaming Parsers to Dedicated Module
    - Task: Create server/ai/parsers/ directory with purpose-discovery.parser.ts and action-plan.parser.ts. Move parsing functions from server/routes/assessment.ts. Rename parseStreamedText to parsePurposeDiscoveryStreamedText for clarity. Keep existing parsing behavior unchanged. Run test suite after changes.
    - Suggested Files for Context: server/routes/assessment.ts, shared/schema.ts
    - Step Dependencies: None

[X] Step 12.2: Create SSE Utilities Module
    - Task: Create server/utils/sse.ts with helpers: setSseHeaders(res), writeSseData(res, chunk), writeSseEvent(res, event: string). Define event constants (STREAM_START, STREAM_END, ENRICH_START, SAVE_SUCCESS, ERROR). Replace duplicated SSE logic in streaming endpoints.
    - Suggested Files for Context: server/routes/assessment.ts
    - Step Dependencies: None

[X] Step 12.3: Split Assessment Routes by Feature
    - Task: Split server/routes/assessment.ts (665 lines) into assessment/analyze.ts and assessment/action-plan.ts, with assessment/index.ts re-exporting combined router. Each file should be under 500 lines. Move shared utilities like session validation to assessment/utils.ts.
    - Suggested Files for Context: server/routes/assessment.ts, server/routes.ts
    - Step Dependencies: Steps 12.1, 12.2

### Code Quality & Database Improvements

[X] Step 12.4: Replace Manual Rollback with Database Transactions and Structured error handling system
    - Task: Use Drizzle db.transaction() for atomic operations in both /api/analyze and streaming saves. Wrap: (a) create new purpose paths, (b) delete old paths, (c) update session fields. Remove manual cleanup loops and rollback logic.
    - Suggested Files for Context: server/routes/assessment/purpose-discovery.ts, server/routes/assessment/action-plan.ts, server/storage.ts, server/db.ts
    - Step Dependencies: Step 12.1
    - Implementation Notes:
      • COMPLETED: Replaced manual rollback with native `db.transaction()` for true database atomicity
      • ARCHITECTURE: Created structured error handling system with `TransactionError`, `StreamingError`, `ValidationError` classes in `server/utils/errors.ts`
      • ATOMICITY: Updated `atomicPurposePathUpdate()` to use transactions, optimized DELETE operations with batch `inArray()` instead of loops
      • CONSISTENCY: Created `atomicActionPlanUpdate()` function for consistent transaction patterns across all endpoints

[X] Step 12.5: Add Runtime Input Validation 
    - Task: Add Zod-based validation of session.responses structure before AI processing to prevent malformed data from causing expensive AI chain failures. Validate questionnaire response completeness and format. Add early validation errors with structured error responses.
    - Suggested Files for Context: server/routes/assessment/purpose-discovery.ts, server/routes/assessment/action-plan.ts, shared/schema.ts
    - Step Dependencies: Step 12.4
    - User Instructions: None
    - Notes: Structured error handling system (TransactionError, StreamingError, ValidationError classes) already implemented in Step 12.4. This step focuses purely on input validation to catch issues before expensive operations.

### Test Organization & Coverage

[X] Step 12.6: Split Monolithic Test File and Add Parser Tests
    - Task: Split assessment.stream.test.ts (1036 lines) into assessment.purpose-discoverys.stream.test.ts and assessment.action-plan.stream.test.ts. Extract shared SSE utilities to sse-test-utils.ts. Add focused unit tests for the new parser modules covering edge cases (concatenated bullets, missing sections). Run npm test to verify all tests pass.
    - Suggested Files for Context: server/routes/assessment/assessment.stream.test.ts, vitest.config.ts
    - Step Dependencies: Steps 12.1, 12.3

---

## Phase 3: Frontend Integration and E2E Testing

This phase connects the frontend to the new word-by-word streaming APIs and validates the entire user experience with an end-to-end test.

[X] Step 13: COMPLEX: Refactor Frontend Pages to Handle Word-by-Word Streams
**Task**: Update both `client/src/pages/results.tsx` and `client/src/pages/action-plan.tsx`. On page load, first call the `GET /api/session/:sessionId` endpoint. If complete data is returned, render it immediately. If not, connect to the appropriate streaming endpoint (`/analyze/stream` or `/action-plan/stream`) using the `EventSource` API. As text chunks arrive, append them to a buffer in local state. Write parsing logic that uses the section delimiters (`[SECTION:...]`) to extract and render completed sections of content progressively.
**Suggested Files for Context**: `client/src/pages/results.tsx`, `client/src/pages/action-plan.tsx`, `client/src/App.tsx`
**Step Dependencies**: Step 12

---

[X] Step 13.1: Add Lightweight Questionnaire Save Endpoint
**Task**: Create a new endpoint `POST /api/questionnaire/save` in the purpose discovery router that validates and saves questionnaire responses without running AI generation. The endpoint should accept sessionId, language, and responses, perform the same validation as the existing `/api/analyze` endpoint, save the responses to the database, and return a minimal success response with just `{ sessionId, success: true }`. This separates data persistence from AI generation to enable immediate navigation to the streaming experience. Add integration tests for the new endpoint in the existing test suite to verify input validation, response saving, and error handling work correctly. Return minimal response data to avoid bypassing streaming detection on frontend.
**Suggested Files for Context**: `server/routes/assessment/purpose-discovery.ts`, `server/storage.ts`, `shared/schema.ts`, `server/utils/errors.ts`, `server/routes/assessment/assessment.test.ts`
**Step Dependencies**: Step 13

---

[X] Step 13.2: Update Questionnaire to Use Save-Only Endpoint and Navigate Immediately
**Task**: Modify the questionnaire submission flow to use the new save endpoint instead of the full analysis endpoint. Update the `useCreateAssessment` hook to call `/api/questionnaire/save`, and change the questionnaire component's onSuccess handler to navigate immediately to `/results` without storing complete analysis data in sessionStorage. **Critical**: Clear any existing analysis data from sessionStorage before navigation to ensure streaming is triggered. Remove or minimize the loading overlay after successful save since the Results page will handle the streaming experience. This enables the instant navigation that makes streaming feel responsive. The key is ensuring no complete data exists in storage that would bypass streaming detection.
**Suggested Files for Context**: `client/src/components/questionnaire/single-page-questionnaire.tsx`, `client/src/hooks/use-create-assessment.ts`, `client/src/pages/results.tsx`
**Step Dependencies**: Step 13.1

---

[X] Step 13.3: Simplify Results Page Streaming Detection and Path Selection
**Task**: Refactor the Results page to prioritize streaming over cached data. Simplify the streaming detection logic to trigger streaming whenever `coreDriversAnalysis` is missing from the session, removing complex fallback chains. Update `handleChoosePath` to navigate immediately to `/action-plan?pathId={selectedPathId}` using query parameters (not React Router state, since we use Wouter), eliminating the wait for the POST request to complete. This makes path selection instant and lets the Action Plan page handle its own streaming. Use query parameters for cross-page data transfer as they survive page refreshes and work with Wouter routing. Simple detection rule: missing core drivers analysis = start streaming.
**Suggested Files for Context**: `client/src/pages/results.tsx`, `client/src/hooks/use-sse-stream.ts`, `client/src/hooks/use-create-action-plan.ts`
**Step Dependencies**: Step 13.2
**Implementation Notes**:
- **Simplified streaming detection**: Replaced complex async `checkSessionData()` function with simple synchronous check: if `!session?.coreDriversAnalysis` then start streaming
- **Instant path selection**: Updated `handleChoosePath` from async function with loading states to immediate navigation: `navigate('/action-plan?pathId=' + pathId)`
- **Removed loading UI**: Eliminated `isGenerating` state, `LoadingOverlay` component, and `useCreateActionPlan` hook usage from Results page
- **Query parameter navigation**: Using Wouter-compatible URL query parameters for cross-page data transfer (survives page refreshes)
- **Maintained compatibility**: Set `isChoosing={false}` prop on PurposePaths component to satisfy TypeScript interface
- **Clean separation of concerns**: Results page handles only streaming detection and instant navigation; Action Plan page (Step 13.4) will handle its own streaming and persistence

---

[X] Step 13.4: Update Action Plan Page to Use Query Parameters and Stream Immediately
**Task**: Modify the Action Plan page to retrieve `pathId` from URL query parameters (passed from Results page) or fallback to session data. Simplify streaming detection to trigger whenever `actionPlan` is missing from the session OR when `pathId` is present in query params (to handle path re-selection). Ensure the streaming endpoint receives the `pathId` via query parameter. Remove dependencies on `session.chosenPathId` being set before streaming can begin, since the streaming endpoint handles persistence. This completes the streaming-first navigation flow where both major pages start streaming immediately upon arrival. Read `pathId` from URL query params first, then fallback to session. Stream if `!session.actionPlan || location.search.includes('pathId')` to handle both missing data and path changes.
**Suggested Files for Context**: `client/src/pages/action-plan.tsx`, `client/src/hooks/use-sse-stream.ts`, `server/routes/assessment/action-plan.ts`
**Step Dependencies**: Step 13.3
**Implementation Notes**:
- **Query Parameter Reading**: Added `URLSearchParams(window.location.search).get('pathId')` to extract pathId from URL
- **Effective PathId Logic**: Created `effectivePathId` that prioritizes query param over session's `chosenPathId`
- **Simplified Streaming Detection**: Replaced complex async `checkActionPlanData` with simple rule: stream if `!actionPlan || queryPathId !== null`
- **Updated SSE Configuration**: Modified streaming endpoint URL to use `effectivePathId` instead of session's `chosenPathId`
- **Removed Redundant Code**: Eliminated separate `chosenPathId` useMemo and complex server fetching logic
- **Instant Navigation**: Pages now start streaming immediately when landing with `?pathId=X` query parameter
- **Clean Fallback**: Redirects to `/results` only when no valid pathId can be resolved and no action plan exists
- **TypeScript Safety**: Added proper null checks for `currentSession.purposePaths` array access

---

## Phase 4: Change to Vercel AI SDK with Structured Streaming

This phase migrates from custom delimiter parsing to Vercel AI SDK's stable `streamObject` API, solving the malformed delimiter problem while maintaining real-time streaming.

[X] Step 14: Install AI SDK Dependencies and Create Schema
**Task**: Install `ai` and `@ai-sdk/google` packages. Use Zod schema in `server/ai/schemas.ts` that mirrors the existing `shared/schema.ts` structure for purpose discovery. Keep the schema flat and simple - just mirror the exact structure your UI expects without adding complexity.
**Suggested Files for Context**: `package.json`, `shared/schema.ts`
**Step Dependencies**: Step 13.4

---

[X] Step 14.1: Redirect Non-Streaming Endpoint to Use Streaming Infrastructure
**Task**: Update `POST /api/analyze` to internally use the streaming infrastructure while maintaining backward compatibility. The endpoint will: (1) Save questionnaire responses using existing logic, (2) Call the streaming chain internally and collect all chunks in memory, (3) Parse the complete result and return it in the original format. This provides a safety net during migration without complex deprecation mechanisms. The endpoint becomes a synchronous wrapper around the streaming approach.
**Suggested Files for Context**: `server/routes/assessment/purpose-discovery.ts`, `server/ai/chains/purpose-discovery.stream.chain.ts`, `docs/vercel-ai-sdk.md`
**Step Dependencies**: Step 14
**Implementation Notes**: This creates a unified code path while preserving test compatibility. The non-streaming endpoint effectively becomes a "streaming-to-completion" variant.

---

[X] Step 15: COMPLEX: Migrate Results Page Backend to streamObject with Native Protocol
**Task**: Replace the `/api/analyze/stream` endpoint in `server/routes/assessment/purpose-discovery.ts` with a **POST** endpoint that uses AI SDK's native streaming protocol. Change from GET to POST (required by `useObject`), remove all manual SSE code (`setSseHeaders`, `writeSseData`, `writeSseEvent`), and replace with `result.pipeTextStreamToResponse(res)`. While streaming, concurrently await `result.object` to get the final validated data for database persistence via `atomicPurposePathUpdate`.
**Suggested Files for Context**: `server/routes/assessment/purpose-discovery.ts`, `server/ai/schemas.ts`, `docs/vercel-ai-sdk.md` (lines 1092-1112)
**Step Dependencies**: Step 14.1
**Implementation Notes**: 
Updated Streaming Chain (purpose-discovery.stream.chain.ts)
  - Replaced async generator with Vercel AI SDK's streamObject
  - Added structured validation using purposeDiscoveryResultSchema
Migrated Streaming Endpoint (/api/analyze/stream)
  - Changed from GET to POST method (required for useObject)
  - Added Zod validation for request body: { sessionId: string }
  - Replaced manual SSE with result.pipeTextStreamToResponse(res)
  - Implemented concurrent database saving using await result.object
Cleaned Up Legacy Code
  - Removed SSE utility imports from this endpoint
  - Removed delimiter parser dependencies
  - Maintained existing safeguards (concurrency, validation, transactions)

---

[X] Step 16: COMPLEX: Migrate Results Page Frontend to useObject 
**Task**: Update `client/src/pages/results.tsx` to properly use `useObject` with the new POST endpoint. Change the API configuration to remove query parameters and use `submit({ sessionId })` to trigger streaming. The hook already handles the text stream protocol automatically. Keep progressive rendering with skeletons, and maintain the `onFinish` callback to fetch the complete session from the database.
**Suggested Files for Context**: `client/src/pages/results.tsx`, `docs/vercel-ai-sdk.md` (lines 1060-1086)
**Step Dependencies**: Step 15
**Implementation Notes**:
- Changed to POST `/api/analyze/stream` with `submit({ sessionId })` trigger
- Added inline Zod schema matching backend structure (purposeDiscoverySchema)
- Implemented progressive rendering using partial object properties
- Removed all SSE-specific code (extract functions, StreamingPhase enum, useSSEStream)
- Simplified status indicator to single "Generating analysis..." message
- Maintained onFinish callback to fetch complete session from database
- Fixed race condition using the streamed object directly from useObject's onFinish callback
- Migration maintains existing functionality: streaming detection, progressive UI, error handling, path selection

---

[X] Step 17: Test and Measure Results Page Success
**Task**: Test the migrated Results page thoroughly and measure key metrics: time to first content appearance, error frequency, and streaming completion rate. Verify that the AI SDK's text stream protocol provides more reliable streaming than the previous delimiter-based approach. Document any issues and ensure the streaming experience feels as responsive as the previous version. If successful, proceed to migrate Action Plan; if issues arise, debug and fix before continuing.
**Suggested Files for Context**: `client/src/pages/results.tsx`, browser developer tools for performance testing
**Step Dependencies**: Step 16

---

[X] Step 17.1: Add Standardized Error Codes and Migrate Integration Tests to AI SDK Protocol
**Task**: Enhance error handling and migrate tests to use the AI SDK streaming approach. Part 1: Add standardized error codes ('VALIDATION_ERROR', 'TRANSACTION_ERROR', 'STREAMING_ERROR', 'CONCURRENCY_LIMIT_REACHED') to the existing error classes in `server/utils/errors.ts`. Update their `toResponse()` methods to include these codes for better debugging. Part 2: Migrate the integration tests in `assessment.purpose-discovery.stream.test.ts` to test POST streaming endpoints with AI SDK protocol. Update tests to verify complete application functionality including database persistence and concurrent session handling. Replace SSE parsing tests with AI SDK text stream validation.
**Suggested Files for Context**: `server/utils/errors.ts`, `server/routes/assessment/assessment.purpose-discovery.stream.test.ts`
**Step Dependencies**: Step 17
**Implementation Notes**: 
- Added standardized error codes to existing TransactionError and ValidationError classes
- Maintained backward compatibility with legacy error codes  
- Fixed streaming endpoint headers-already-sent error with `res.headersSent` check
- Enhanced integration tests to validate complete user workflow: questionnaire → AI analysis → database persistence
- Created realistic AI SDK streaming mocks without performance penalties
- Tests verify foreign key relationships, concurrent session isolation, and atomic database operations
- Integration tests run efficiently (~11 seconds) while testing full application functionality
- Self-verifying loop achieved: tests provide actionable error codes for autonomous debugging

---

[X] Step 17.2: Migrate Action Plan Integration Tests to AI SDK Protocol
**Task**: Migrate the integration tests in `assessment.action-plan.stream.test.ts` to test POST streaming endpoints with AI SDK protocol. Update tests to verify the complete action plan workflow including YouTube video enrichment, concurrent session handling, and atomic database persistence. Replace SSE parsing tests with AI SDK text stream validation. Ensure tests provide clear, actionable error messages that enable autonomous debugging during Steps 18-19. Follow the pattern from Step 17.1's test migration, focusing on testing the YouTube enrichment phase that happens after streaming completes.
**Suggested Files for Context**: `server/routes/assessment/assessment.action-plan.stream.test.ts`, `server/routes/assessment/assessment.purpose-discovery.stream.test.ts` (as reference)
**Step Dependencies**: Step 17.1
**Implementation Notes**: Create a self-verifying loop that enables AI agents to debug issues autonomously during the Action Plan migration. Tests should verify the complete flow from streaming → parsing → YouTube enrichment → database persistence, with particular attention to the post-processing phase that makes Action Plan more complex than Purpose Discovery.

---

[X] Step 18: COMPLEX: Migrate Action Plan Backend to streamObject with Native Protocol
**Task**: Replace the `/api/action-plan/stream` endpoint in `server/routes/assessment/action-plan.ts` with a **POST** endpoint that uses AI SDK's native streaming protocol. Change from GET to POST (required by `useObject`), remove all manual SSE code, and replace with `result.pipeTextStreamToResponse(res)`. Keep YouTube video enrichment as post-processing - stream the action plan first, then concurrently fetch and integrate YouTube videos while the final object is being persisted to the database.
**Suggested Files for Context**: `server/routes/assessment/action-plan.ts`, `server/ai/schemas.ts`, `docs/vercel-ai-sdk.md` (lines 1092-1112)
**Step Dependencies**: Step 17.2
**Implementation Notes**: 
- Change route from `GET` to `POST /api/action-plan/stream`
- Accept body: `{ sessionId, pathId }` (or get pathId from session if not provided)
- Keep concurrency limiting with `activeStreams` and `aiLimiter`
- Use `streamObject` with action plan schema and temperature 0.3
- Return stream: `result.pipeTextStreamToResponse(res)` (Express pattern from Step 15)
- Concurrently: await `result.object`, enrich with YouTube videos, then save to DB
- Clean up `activeStreams` in finally block

---

[X] Step 19: COMPLEX: Migrate Action Plan Frontend to useObject
**Task**: Update `client/src/pages/action-plan.tsx` to properly use `useObject` with the new POST endpoint. Change the API configuration to use `submit({ sessionId, pathId })` to trigger streaming. Keep the existing pathId query parameter logic but pass it in the POST body instead of URL params. Maintain progressive rendering with skeletons and update the `onFinish` callback to use the streamed object directly (avoiding a race condition, as done in Step 16). Implement the same one-shot streaming pattern from Step 16 using `useRef` to prevent infinite loop issues caused by unstable `submit` function dependencies.
**Suggested Files for Context**: `client/src/pages/action-plan.tsx`, `docs/vercel-ai-sdk.md` (lines 1060-1086)  
**Step Dependencies**: Step 18
**Implementation Notes**:
- Change `api: '/api/action-plan/stream'` (no query string)
- Call `submit({ sessionId, pathId: effectivePathId })` when streaming needed
- Keep existing pathId detection logic (URL params → session fallback)
- Keep existing schema and progressive rendering of milestones
- `onFinish`: use streamed `object` parameter directly to update local state immediately, then fetch complete session in background after delay (same pattern as Step 16)
- Remove any SSE-related code or comments
- Streaming detection remains: missing `actionPlan` or new `pathId` triggers streaming

---

[ ] Step 20: COMPLEX: Write E2E Test for Core User Journey
**Task**: Create a new E2E test file, `tests/journey.spec.ts`. Using Playwright, write a test that covers the full user flow with the current `streamObject` implementation. It should fill out the questionnaire, submit, and then on the results and action plan pages, assert that the final, fully-streamed content becomes visible on the page. This test will serve as a safety net before cleanup to ensure the user journey works correctly and can detect if cleanup breaks anything.
**Suggested Files for Context**: `client/src/pages/home.tsx`, `client/src/pages/results.tsx`, `client/src/pages/action-plan.tsx`, `playwright.config.ts`
**Step Dependencies**: Step 19
**Implementation Notes**: This test should focus on the happy path user journey without testing implementation details. Run this test before and after cleanup steps to ensure the user experience remains intact.

---

## Phase 5: Legacy Code Cleanup and Final Hardening

This phase removes all deprecated code to finalize the AI SDK-only architecture, then improves resilience and debugging capabilities.

[ ] Step 21.1: Remove Delimiter Parsers and Old Streaming Chains
**Task**: Remove all delimiter-based parsing infrastructure that's been replaced by Vercel AI SDK's structured streaming. Delete complete files: `server/ai/parsers/purpose-discovery.parser.ts`, `server/ai/parsers/purpose-discovery.parser.test.ts`, `server/ai/parsers/action-plan.parser.ts`, `server/ai/parsers/action-plan.parser.test.ts`. Remove code sections: import of `parseActionPlanStreamedText` in `server/routes/assessment/action-plan.ts` (line 22), functions `getPurposeDiscoveryStreamingPrompt` and `getActionPlanStreamingPrompt` from `server/ai/prompts.ts`. Delete non-streaming chain files: `server/ai/chains/purpose-discovery.chain.ts`, `server/ai/chains/action-plan.chain.ts`. Update exports in `server/ai/chains/index.ts` to remove deleted chains.
**Suggested Files for Context**: `server/ai/parsers/`, `server/ai/chains/`, `server/ai/prompts.ts`, `server/routes/assessment/action-plan.ts`
**Step Dependencies**: Step 20
**Testing**: Run `npm test` after changes to ensure no broken imports.

---

[ ] Step 21.2: Remove SSE Infrastructure and Update Test Utilities
**Task**: Remove all Server-Sent Events infrastructure replaced by AI SDK's native streaming. Delete complete files: `server/utils/sse.ts`, `client/src/hooks/use-sse-stream.ts`, `client/src/components/streaming-status.tsx` (if exists). Extract `createTestApp` function from `server/utils/sse-test-utils.ts` to new file `server/utils/test-app.ts`, then delete `server/utils/sse-test-utils.ts`. Remove SSE imports from `server/routes/assessment/action-plan.ts` (line 23): `setSseHeaders, writeSseData, writeSseEvent, setupSseCleanup, writeSseError, SSE_EVENTS`. Remove any remaining SSE imports from `server/routes/assessment/purpose-discovery.ts`. Update all test files that import SSE utilities to use `createTestApp` from new location `server/utils/test-app.ts`.
**Suggested Files for Context**: `server/utils/sse.ts`, `server/utils/sse-test-utils.ts`, `server/routes/assessment/action-plan.ts`, `server/routes/assessment/purpose-discovery.ts`, test files using SSE utilities
**Step Dependencies**: Step 21.1
**Testing**: Run `npm test` to ensure test utilities migration worked correctly.

---

[ ] Step 21.3: Remove Non-Streaming Endpoints and Unused Client Hooks
**Task**: Remove endpoints and hooks that have been replaced by streaming-only architecture. Delete complete files: `client/src/hooks/use-create-action-plan.ts` (completely unused). Remove code sections: `POST /api/analyze` endpoint handler from `server/routes/assessment/purpose-discovery.ts`, `POST /api/action-plan` endpoint handler from `server/routes/assessment/action-plan.ts` (lines 36-110 approximately). Update or remove test in `server/routes/assessment/assessment.test.ts` that uses `POST /api/analyze` (line 226) - either convert to test streaming endpoint or remove if redundant. Update comments in `server/routes/assessment/index.ts` and `server/routes/assessment/action-plan.ts` header to remove references to deleted endpoints.
**Suggested Files for Context**: `server/routes/assessment/purpose-discovery.ts`, `server/routes/assessment/action-plan.ts`, `server/routes/assessment/assessment.test.ts`, `client/src/hooks/use-create-action-plan.ts`
**Step Dependencies**: Step 21.2
**Testing**: Run `npm test` and `npm run build` to ensure no broken references.

---

[ ] Step 21.4: Remove Salary Service and GEMINI_FACTS_MODEL Infrastructure
**Task**: Remove dual-model strategy infrastructure and salary-related services. Delete complete files: `server/services/salary.ts`. Remove code sections: export of salary service from `server/services/index.ts`, `getSalaryDataTool` function from `server/ai/tools.ts`, `salaryCache` and `SALARY_CACHE_TTL_MS` from `server/cache.ts` (lines 95-96), `GEMINI_FACTS_MODEL` property from schema in `server/env.ts`, `GEMINI_FACTS_MODEL` export from `server/ai/wrapper.ts`, `generateContentWithSearch` function from `server/ai/wrapper.ts`. Remove environment variable references from documentation files: `.env.example`, `docs/tech-spec.md`, `CLAUDE.md`, `replit.md`.
**Suggested Files for Context**: `server/services/salary.ts`, `server/services/index.ts`, `server/ai/tools.ts`, `server/cache.ts`, `server/env.ts`, `server/ai/wrapper.ts`, documentation files
**Step Dependencies**: Step 21.3
**User Instructions**: Remove `GEMINI_FACTS_MODEL` from your `.env` file as it's no longer needed. Update any deployment configurations to remove this variable.
**Testing**: Run `npm run check` to ensure TypeScript compilation succeeds.

---

[ ] Step 21.5: Update Documentation and Final Cleanup
**Task**: Complete the architectural cleanup by updating documentation and removing any remaining references to deprecated features. Update `docs/tech-spec.md` to remove dual-model strategy sections and ensure it documents POST streaming via AI SDK only. Clean up any implementation notes in the plan referencing removed features. Update architecture descriptions to reflect streaming-only approach. Verify all imports and exports are clean with no broken references.
**Suggested Files for Context**: `docs/tech-spec.md`, `docs/implementation-plan.md`, `CLAUDE.md`, `replit.md`
**Step Dependencies**: Step 21.4
**Testing**: Run full test suite (`npm test`), build (`npm run build`), type checking (`npm run check`), and manually test questionnaire → results → action plan flow to ensure everything works after cleanup.
**Implementation Notes**: This completes the architectural simplification started in Step 14.1. The codebase now has a single, streamlined path for all AI generation using the Vercel AI SDK's native protocols. Approximately 2000+ lines of legacy code will be removed across these steps.

---

## Phase 6: Final Hardening and Debugging

This final phase improves resilience and provides developers with the tools to effectively debug and replicate AI failures.

[ ] Step 22: Implement Enhanced AI Error Logging
**Task**: Update the `catch` blocks in the new `streamObject` implementations. When an error is caught, log a structured JSON object that includes the original error, the `userInput`, the `finishReason` from the AI response, and any streaming-specific details. This will provide a complete snapshot of any failure for easier debugging with the new streaming approach.
**Suggested Files for Context**: `server/routes/assessment/purpose-discovery.ts`, `server/routes/assessment/action-plan.ts`
**Step Dependencies**: Step 21.5

---

[ ] Step 23: Create a Developer Script for Controlled Edge-Case Testing
**Task**: Create a new file `_docs/manual-test-harness.ts`. This script will not be part of the main application build. It should be a simple Node.js script that allows a developer to easily send a predefined JSON object (representing difficult questionnaire answers) to the new `streamObject` endpoints and print the streaming output. Include sample inputs in the script for testing vague, abstract, non-sequitur, and multi-language answers to verify the structured streaming approach handles edge cases better than delimiter parsing.
**Suggested Files for Context**: `server/routes/assessment`, `shared/schema.ts`
**Step Dependencies**: Step 22

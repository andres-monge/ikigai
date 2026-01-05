# Analytics System Implementation Plan

## Overview

This plan implements a minimal, serverless-compatible analytics system to measure user funnel progression, export behavior, and enable AI-powered user analysis. The system uses 5 event types, leverages existing database tables where possible, and preserves all session data for analysis.

### Objective

Capture data to calculate these success metrics:

| Metric | Formula |
|--------|---------|
| **Landing → Start** | `start events / visit events` |
| **Completion rate** | `assessment_sessions rows / start events` |
| **Section drop-off** | Last `section` event for sessions without completion |
| **Results → Action Plan** | `sessions with actionPlan / sessions with purpose_paths` |
| **Results export rate** | `distinct sessions with results export / sessions with purpose_paths` |
| **Action Plan export rate** | `distinct sessions with action-plan export / sessions with actionPlan` |
| **Overall export rate (North Star)** | `distinct sessions with any export / sessions with purpose_paths` |
| **Restart rate** | `start_over events / sessions with purpose_paths` |

Additionally, enable AI-powered analysis of questionnaire answers to understand user personas and identify where the app succeeds or fails.

### Event Types

| Event | Trigger | Metadata |
|-------|---------|----------|
| `visit` | App mounts | `{}` |
| `start` | First answer entered | `{}` |
| `section` | Section completed | `{ section: 'passions' \| 'skills' \| 'values' \| 'economic' }` |
| `export` | Copy or PDF clicked | `{ page: 'results' \| 'action-plan', type: 'copy' \| 'pdf' }` |
| `start_over` | User clicks Start Over | `{ fromPage: 'results' \| 'action-plan' }` |

### Key Design Decisions

1. **Await all DB writes** — Serverless functions may terminate after returning response; fire-and-forget patterns can lose events
2. **Leverage existing data** — Results/Action Plan view counts derived from `assessment_sessions` table (no events needed)
3. **Silent client failures** — API always returns 200 to never block the user experience
4. **Preserve all session data** — "Start Over" no longer deletes data; it logs an event and generates a new session ID
5. **Hybrid analysis approach** — Scripts for deterministic metrics, subagent for AI-powered exploration
6. **Shared type definitions** — Event types defined once in `shared/schema.ts` (`ANALYTICS_EVENT_TYPES` constant and `AnalyticsEventType` type), imported by both frontend hook and backend validation to prevent drift

---

## Development & Deployment Strategy

### Prerequisites
- Complete Vercel migration first (merge `vercel-migration` branch to `main`)
- Ensure Vercel environment variables are configured: Preview → dev database, Production → prod database

### Workflow

| Step | Action | Database |
|------|--------|----------|
| 1 | Create `analytics` branch from `main` | — |
| 2 | Implement all steps locally | Dev (via `.env`) |
| 3 | Push to branch → Vercel creates Preview deployment | Dev (via Vercel Preview env) |
| 4 | Test on Preview URL (Step 13 validation) | Dev |
| 5 | Before merging: push schema to prod | Prod |
| 6 | Merge to `main` → Vercel deploys to Production | Prod |

### Database Commands Reference

```bash
# Local development (uses DATABASE_URL from .env, which points to dev)
npm run dev
npm run db:push

# Push schema to dev database explicitly
DATABASE_URL="$DEV_DATABASE_URL" npm run db:push

# Push schema to prod database (do this BEFORE merging to main)
DATABASE_URL="$PROD_DATABASE_URL" npm run db:push

# Run scripts against dev
DATABASE_URL="$DEV_DATABASE_URL" npx tsx scripts/analytics-report.ts

# Run scripts against prod (for real analytics)
DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/analytics-report.ts
```
---

## Phase 1: Database Schema

[X] Step 1: Add analytics_events table to shared schema
**Task**: Add a new Drizzle table definition for `analytics_events` to the shared schema file. The table should have: `id` (serial primary key), `sessionId` (text, not null), `eventType` (text, not null), `metadata` (jsonb, default empty object), and `createdAt` (timestamp with timezone, default now). Also create and export the corresponding Zod insert/select schemas and TypeScript types using `createInsertSchema` and `createSelectSchema` from drizzle-zod. Follow the existing patterns in the file for table definitions and type exports.
**Suggested Files for Context**: [`shared/schema.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/shared/schema.ts)
**Step Dependencies**: None
**User Instructions**: After this step, run `npm run db:push` to create the table in the database.

---

## Phase 2: Storage Layer

[X] Step 2: Add logAnalyticsEvent method to storage layer
**Task**: Add a new method `logAnalyticsEvent(sessionId: string, eventType: string, metadata?: Record<string, unknown>): Promise<void>` to both the `IStorage` interface and the `PostgresStorage` class. The implementation should insert a row into the `analytics_events` table using Drizzle's insert API. The method should await the insert (not fire-and-forget) to ensure reliability in serverless environments. Import the new `analyticsEvents` table from the schema. Follow the existing patterns in the file for method signatures and implementations.
**Suggested Files for Context**: [`server/storage.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/storage.ts), [`shared/schema.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/shared/schema.ts), [`server/db.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/db.ts)
**Step Dependencies**: Step 1
**User Instructions**: None

---

## Phase 3: Backend API

[X] Step 3: Create analytics API endpoint
**Task**: Create a new Express router file for analytics with a single POST endpoint at `/event`. The endpoint should: (1) Accept a JSON body with `sessionId` (string, required), `eventType` (string, required), and `metadata` (object, optional). (2) Validate that `eventType` is one of the allowed values: `visit`, `start`, `section`, `export`, `start_over`. (3) Call `storage.logAnalyticsEvent()` wrapped in try/catch. (4) Always return 200 status with `{ success: true }` even if the database write fails (to never block the client). (5) Log any errors to console for debugging. Use Zod for request body validation following patterns in other route files.
**Suggested Files for Context**: [`server/routes/session.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/routes/session.ts), [`server/storage.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/storage.ts), [`server/routes/assessment/index.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/routes/assessment/index.ts)
**Step Dependencies**: Step 2
**User Instructions**: None

[X] Step 4: Register analytics router
**Task**: Import the new analytics router in the main routes file and register it under the `/analytics` path prefix. This will make the endpoint available at `/api/analytics/event`.
**Suggested Files for Context**: [`server/routes.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/routes.ts), [`server/routes/analytics.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/routes/analytics.ts)
**Step Dependencies**: Step 3
**User Instructions**: None

[X] Step 5: Modify Start Over endpoint to preserve data
**Task**: Modify the existing `/api/session/start-over` endpoint to NO LONGER delete session data from the database. The endpoint should: (1) Remove or comment out the call to `storage.deleteAssessmentSessionBySessionId()`. (2) Log a `start_over` analytics event with the sessionId before returning. (3) Return success as before. This preserves all questionnaire answers for analysis while still allowing users to start fresh (the frontend will generate a new session ID).
**Suggested Files for Context**: [`server/routes/session.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/routes/session.ts), [`server/storage.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/storage.ts)
**Step Dependencies**: Step 2
**User Instructions**: None

---

## Phase 4: Frontend Analytics Hook

[X] Step 6: Create useAnalytics hook
**Task**: Create a new React hook called `useAnalytics` that provides a `trackEvent` function. The hook should: (1) Accept no parameters. (2) Get the `sessionId` from session storage using the existing `useSessionStorage` hook pattern (key is `'sessionId'`). (3) Return a memoized `trackEvent(eventType: string, metadata?: object)` function that fires a POST request to `/api/analytics/event` with the sessionId, eventType, and metadata. (4) The fetch should be fire-and-forget from the UI perspective (no await, catch errors silently). (5) Use `useCallback` with `sessionId` as dependency. Export the hook as a named export.
**Suggested Files for Context**: [`client/src/hooks/use-session-storage.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/hooks/use-session-storage.ts), [`client/src/hooks/use-sound-effect.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/hooks/use-sound-effect.ts), [`client/src/hooks/use-get-session.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/hooks/use-get-session.ts)
**Step Dependencies**: Step 4
**User Instructions**: None

---

## Phase 5: Frontend Instrumentation

[X] Step 7: Add visit tracking to App component
**Task**: In the main App component, add a `useEffect` that fires a `visit` event once when the app mounts. Use the new `useAnalytics` hook. The effect should have an empty dependency array (or only stable dependencies) to ensure it fires exactly once per page load. Add appropriate comments explaining this is for analytics.
**Suggested Files for Context**: [`client/src/App.tsx`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/App.tsx), [`client/src/hooks/use-analytics.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/hooks/use-analytics.ts)
**Step Dependencies**: Step 6
**User Instructions**: None

[X] Step 8: Add start_over tracking to App component
**Task**: In the main App component, modify the `handleStartOver` function to fire a `start_over` analytics event before clearing local state. The event should include metadata `{ fromPage }` indicating which page the user was on when they clicked Start Over. Determine the current page from the URL or pass it as context. Use the `useAnalytics` hook. Note: The server-side deletion has already been removed in Step 5, so this is just adding the client-side tracking.
**Suggested Files for Context**: [`client/src/App.tsx`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/App.tsx), [`client/src/hooks/use-analytics.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/hooks/use-analytics.ts)
**Step Dependencies**: Step 6
**Implementation Notes**: Adjusted to avoid duplicate events. Instead of using `trackEvent` (client-side, fire-and-forget), the `fromPage` metadata is passed to the `/api/session/start-over` endpoint which logs the event server-side (awaited, more reliable for serverless). Updated `startOverRequestSchema` in `shared/schema.ts` to accept optional `fromPage` field.

[X] Step 9: Add questionnaire start tracking
**Task**: In the SinglePageQuestionnaire component, add tracking for when the user enters their first answer. This should fire a `start` event exactly once per session. Implementation approach: (1) Add a ref or state to track whether the start event has already been fired for this session. (2) In the answer change handler, check if this is the first non-empty answer being entered and if the start event hasn't been fired yet. (3) If both conditions are true, fire the `start` event and mark it as fired. Use the `useAnalytics` hook.
**Suggested Files for Context**: [`client/src/components/questionnaire/single-page-questionnaire.tsx`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/components/questionnaire/single-page-questionnaire.tsx), [`client/src/hooks/use-analytics.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/hooks/use-analytics.ts)
**Step Dependencies**: Step 6
**User Instructions**: None

[X] Step 10: Add section completion tracking
**Task**: In the SinglePageQuestionnaire component, add tracking for section completion. A section is considered complete when all questions in that section have non-empty answers. Implementation approach: (1) Create a helper function or effect that determines which sections are complete based on current answers. (2) Track which sections have already had their completion event fired (using a ref or state). (3) When a section transitions from incomplete to complete, fire a `section` event with metadata `{ section: 'passions' | 'skills' | 'values' | 'economic' }`. (4) Only fire each section's completion event once. Use the `useAnalytics` hook and reference the `QUESTIONS` constant to determine which questions belong to each section.
**Suggested Files for Context**: [`client/src/components/questionnaire/single-page-questionnaire.tsx`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/components/questionnaire/single-page-questionnaire.tsx), [`client/src/components/questionnaire/questions.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/components/questionnaire/questions.ts), [`client/src/hooks/use-analytics.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/hooks/use-analytics.ts)
**Step Dependencies**: Step 9
**User Instructions**: None

[X] Step 11: Add export tracking to Results page
**Task**: In the Results page component, add analytics tracking to both export functions. (1) In `handleExportPDF`, fire an `export` event with metadata `{ page: 'results', type: 'pdf' }`. (2) In `handleCopyToClipboard`, fire an `export` event with metadata `{ page: 'results', type: 'copy' }`. Fire the events at the start of each function (before the actual export logic). Use the `useAnalytics` hook.
**Suggested Files for Context**: [`client/src/pages/results.tsx`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/pages/results.tsx), [`client/src/hooks/use-analytics.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/hooks/use-analytics.ts)
**Step Dependencies**: Step 6
**User Instructions**: None

[X] Step 12: Add export tracking to Action Plan page
**Task**: In the Action Plan page component, add analytics tracking to both export functions. (1) In `handleExportPDF`, fire an `export` event with metadata `{ page: 'action-plan', type: 'pdf' }`. (2) In `handleCopyToClipboard`, fire an `export` event with metadata `{ page: 'action-plan', type: 'copy' }`. Fire the events at the start of each function (before the actual export logic). Use the `useAnalytics` hook.
**Suggested Files for Context**: [`client/src/pages/action-plan.tsx`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/pages/action-plan.tsx), [`client/src/hooks/use-analytics.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/hooks/use-analytics.ts)
**Step Dependencies**: Step 6
**User Instructions**: None

---

## Phase 6: Validation

[X] Step 13: Manual end-to-end validation
**Task**: Manually test the complete analytics flow by walking through the application. This is a validation step, not a code change.
**Suggested Files for Context**: None
**Step Dependencies**: Steps 7-12
**User Instructions**:
1. Start the dev server: `npm run dev`
2. Open browser dev tools Network tab, filter by "analytics"
3. Load the app — verify a `visit` event is sent
4. Start typing an answer — verify a `start` event is sent (only once)
5. Complete all questions in the passions section — verify a `section` event is sent with `{ section: 'passions' }`
6. Complete remaining sections — verify `section` events for each
7. Submit the questionnaire and wait for results
8. Click the copy button on Results — verify an `export` event with `{ page: 'results', type: 'copy' }`
9. Click the PDF button on Results — verify an `export` event with `{ page: 'results', type: 'pdf' }`
10. Navigate to Action Plan
11. Click copy and PDF buttons — verify `export` events with `{ page: 'action-plan', ... }`
12. Click "Start Over" — verify a `start_over` event is sent and session data is NOT deleted from DB
13. Verify all events were recorded in the database: `DATABASE_URL="$DEV_DATABASE_URL" npx tsx -e "import { db } from './server/db.js'; import { analyticsEvents } from './shared/schema.js'; const events = await db.select().from(analyticsEvents); console.table(events); process.exit(0);"`
14. Verify session data persists after Start Over: Check that the old session's questionnaire responses are still in `assessment_sessions`

---

## Phase 7: Analysis Scripts

[X] Step 14: Create funnel metrics report script
**Task**: Create a Node.js script that calculates and displays all success metrics. The script should: (1) Connect to the database using the existing db module. (2) Query `analytics_events` for event counts grouped by type. (3) Query `assessment_sessions` for session counts (total, with purpose_paths, with actionPlan). (4) Join data to calculate each metric from the Overview section. (5) Support optional command-line arguments for time period filtering (--days=7, --days=30, or all time by default). (6) Output a formatted report to console showing each metric with its value and the underlying counts. Use the existing Drizzle ORM patterns and import the db client from server/db.js.
**Suggested Files for Context**: [`server/db.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/db.ts), [`server/storage.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/storage.ts), [`shared/schema.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/shared/schema.ts)
**Step Dependencies**: Step 1
**User Instructions**: Run the script with: `DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/analytics-report.ts` (use PROD_DATABASE_URL for real analytics, DEV_DATABASE_URL for testing).

[X] Step 15: Create user data extraction script
**Task**: Create a Node.js script that extracts questionnaire answers in a format suitable for AI analysis. The script should: (1) Query all `assessment_sessions` that have completed questionnaires (responses is not null). (2) For each session, include: sessionId, language, all questionnaire responses (passions, skills, values, economic), whether they reached results (has purpose_paths), whether they reached action plan (has actionPlan), whether they exported, and the created timestamp. (3) Support optional --days filter for recent sessions only. (4) Output as JSON to stdout (can be piped to a file). (5) Anonymize by not including any PII (session IDs are already anonymous). The output format should be an array of session objects ready for AI consumption.
**Suggested Files for Context**: [`server/db.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/db.ts), [`server/storage.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/storage.ts), [`shared/schema.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/shared/schema.ts)
**Step Dependencies**: Step 1
**User Instructions**: Run the script with: `DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/extract-user-data.ts > user-data.json`

---

## Phase 8: AI Analysis Subagent

[ ] Step 16: Create user-analyst subagent
**Task**: Create a Claude Code subagent for AI-powered user analysis. The subagent should be created as a markdown file in the `.claude/agents/` directory. The subagent configuration should: (1) Have name `user-analyst` and a description indicating it analyzes questionnaire data to identify user personas and insights. (2) Have access to Read, Bash, and Grep tools (for reading extracted data files and running queries). (3) Include a detailed system prompt that instructs the agent to: analyze questionnaire responses to identify user personas (demographics, motivations, pain points), identify patterns in successful vs unsuccessful sessions (those who exported vs those who didn't), surface specific quotes/answers that reveal user needs, identify where the app is solving problems and where it's failing, and output a structured report with actionable insights. The prompt should emphasize looking for patterns across multiple users rather than individual analysis.
**Suggested Files for Context**: [`~/.claude/agents/`](/Users/andresm/.claude/agents/) (if exists, for patterns), subagent documentation provided in conversation
**Step Dependencies**: Step 15
**User Instructions**:
1. After creating the subagent, extract fresh user data: `DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/extract-user-data.ts > user-data.json`
2. Invoke the subagent: "Use the user-analyst agent to analyze the data in user-data.json and identify user personas"
3. Ask follow-up questions like: "What patterns do you see in users who dropped off before exporting?" or "Which user segments seem most satisfied?"

---

## Files Summary

**New files (5):**
- `server/routes/analytics.ts` — API endpoint
- `client/src/hooks/use-analytics.ts` — Frontend tracking hook
- `scripts/analytics-report.ts` — Funnel metrics script
- `scripts/extract-user-data.ts` — Data extraction for AI analysis
- `.claude/agents/user-analyst.md` — AI analysis subagent

**Modified files (8):**
- `shared/schema.ts` — Add analyticsEvents table
- `server/storage.ts` — Add logAnalyticsEvent method
- `server/routes.ts` — Register analytics router
- `server/routes/session.ts` — Remove deletion, add event logging
- `client/src/App.tsx` — Add visit and start_over tracking
- `client/src/components/questionnaire/single-page-questionnaire.tsx` — Add start + section tracking
- `client/src/pages/results.tsx` — Add export tracking
- `client/src/pages/action-plan.tsx` — Add export tracking

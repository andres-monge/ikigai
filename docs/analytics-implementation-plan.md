# Analytics System Implementation Plan

## Overview

Simple event-based logging to understand user behavior and identify where the app succeeds/fails. Manual analysis via scripts.

---

## Phase 1: Database Setup

### 1.1 Create `analytics_events` table

```sql
CREATE TABLE analytics_events (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- Add indexes on `session_id`, `event_type`, `created_at`
- Add Drizzle schema definition in `shared/schema.ts`
- Run `npm run db:push`

### 1.2 Create storage methods

- `logEvent(sessionId, eventType, metadata)` - append-only, fire-and-forget
- No delete methods needed

---

## Phase 2: Backend API

### 2.1 Create `/api/analytics/event` endpoint

- POST endpoint accepts `{ sessionId, eventType, metadata }`
- Validates event type against allowed list
- Returns 200 immediately (non-blocking)
- Errors logged server-side, never fail client requests

### 2.2 Remove "Start Over" deletion

- Modify `POST /api/session/start-over` to log event instead of deleting
- Keep session data in database for analysis

---

## Phase 3: Frontend Instrumentation

### 3.1 Create `useAnalytics` hook

```typescript
const { trackEvent } = useAnalytics();
trackEvent('page_view', { page: 'home' });
```

- Fire-and-forget fetch to `/api/analytics/event`
- Includes sessionId automatically from context
- Silent failures (console.warn only)

### 3.2 Instrument events

|Location|Event|Metadata|
|---|---|---|
|`App.tsx`|`page_view`|`{ page }`|
|`Home.tsx` (questionnaire start)|`questionnaire_start`|`{ language }`|
|`Home.tsx` (section complete)|`section_complete`|`{ section }`|
|`Home.tsx` (submit)|`questionnaire_submit`|`{ language }`|
|`Results.tsx` (mount)|`results_view`|`{ pathCount }`|
|`Results.tsx` (select path)|`path_select`|`{ pathIndex, pathTitle }`|
|`Results.tsx` (copy)|`export_copy`|`{ page: 'results' }`|
|`Results.tsx` (PDF)|`export_pdf`|`{ page: 'results' }`|
|`ActionPlan.tsx` (mount)|`action_plan_view`|`{ milestoneCount }`|
|`ActionPlan.tsx` (copy)|`export_copy`|`{ page: 'action-plan' }`|
|`ActionPlan.tsx` (PDF)|`export_pdf`|`{ page: 'action-plan' }`|
|`App.tsx` (start over)|`start_over`|`{ fromPage }`|
|AI streaming error catch|`error`|`{ type, message }`|

---

## Phase 4: Analysis Scripts

### 4.1 Funnel metrics script

`scripts/analytics-funnel.ts`

- Calculates conversion rates between stages
- Groups by time period (daily/weekly)
- Groups by language
- Outputs to console or markdown file

### 4.2 Drop-off analysis script

`scripts/analytics-dropoff.ts`

- Identifies where users abandon questionnaire
- Shows section completion rates

### 4.3 AI user analysis script

`scripts/analytics-users.ts`

- Fetches questionnaire answers from `assessment_sessions`
- Sends to AI for persona identification and insight extraction
- Outputs summary report

---

## Event Types Reference

```typescript
type EventType =
  | 'page_view'
  | 'questionnaire_start'
  | 'section_complete'
  | 'questionnaire_submit'
  | 'results_view'
  | 'path_select'
  | 'action_plan_view'
  | 'export_copy'
  | 'export_pdf'
  | 'start_over'
  | 'error';
```

---

## Success Metrics (What We'll Measure)

|Metric|Formula|What It Tells Us|
|---|---|---|
|**Completion rate**|`questionnaire_submit / questionnaire_start`|Are users finishing the questionnaire?|
|**Results → Action Plan**|`action_plan_view / results_view`|Do purpose paths compel users to go deeper?|
|**Results export rate**|`exports from results / results_view`|Are purpose paths alone valuable enough to save?|
|**Action Plan export rate**|`exports from action plan / action_plan_view`|Is the action plan valuable enough to save?|
|**Overall export rate (North Star)**|`unique sessions with ANY export / results_view`|Did we build something people want?|
|**Drop-off section**|Most common last `section_complete` before abandon|Where is the friction?|

### Export Breakdown

```
Results Page Exports
├── export_copy (page: 'results')
└── export_pdf (page: 'results')

Action Plan Page Exports  
├── export_copy (page: 'action-plan')
└── export_pdf (page: 'action-plan')
```

The `metadata.page` field lets us calculate each separately, and we can also roll up to "any export" for the North Star metric.

---

## Files to Create/Modify

|File|Action|
|---|---|
|`shared/schema.ts`|Add `analytics_events` table|
|`server/storage.ts`|Add `logEvent` method|
|`server/routes/analytics.ts`|New route file|
|`server/routes.ts`|Register analytics router|
|`server/routes/session.ts`|Remove deletion, add event log|
|`client/src/hooks/use-analytics.ts`|New hook|
|`client/src/App.tsx`|Add tracking calls|
|`client/src/pages/home.tsx`|Add tracking calls|
|`client/src/pages/results.tsx`|Add tracking calls|
|`client/src/pages/action-plan.tsx`|Add tracking calls|
|`scripts/analytics-funnel.ts`|New script|
|`scripts/analytics-dropoff.ts`|New script|
|`scripts/analytics-users.ts`|New script|

---
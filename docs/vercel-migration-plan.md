# Implementation Plan

## Branching + Preview deployment strategy (GitHub → Vercel)
[X] Step 1: Create a safe Preview-first workflow for the migration
**Task**: Create a dedicated migration branch (for example, `vercel-migration`) and use Vercel’s Git integration so every push/PR gets a Preview deployment URL. The goal is to fully validate the migration on Preview before merging to `main` (which triggers Production).
**Suggested Files for Context**: [`package.json`](/Users/andresm/Documents/Cursor%20Projects/ikigai/package.json)
**Step Dependencies**: None
**User Instructions**: In Vercel, connect the GitHub repo, confirm Preview deployments are enabled, and confirm `main` is the Production branch. Do not change DNS or point any custom domain until the migration is validated.

## Express entrypoint (verified) + app refactor for serverless
[X] Step 2: Refactor Express so Vercel can run it as a single Function (default export, no listening)
**Task**: Refactor the server so the Express app can be imported and exported without binding to a port. Add a dedicated “app builder” module that wires middleware, routes, and error handling. Update the existing server entry file so it only starts a local HTTP server when running locally (dev/prod), and is not required for the Vercel Function entry.
**Suggested Files for Context**: [`server/index.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/index.ts), [`server/routes.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/routes.ts), [`server/vite.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/vite.ts), [`server/env.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/env.ts)
**Step Dependencies**: Step 1
**User Instructions**: None

[X] Step 3: Add a Vercel-recognized Express entry file at repo root (verified requirement: imports express + default export)
**Task**: Add a repo-root Express entry file at a recognized location (`index.ts`) that imports the `express` package and default-exports the Express app. This entry file is what Vercel detects and deploys as a single Express Function. Keep the entry file thin (it should not call `listen()`).
**Suggested Files for Context**: [`server/index.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/index.ts), [`package.json`](/Users/andresm/Documents/Cursor%20Projects/ikigai/package.json)
**Step Dependencies**: Step 2
**User Instructions**: None

## SPA deep-link refresh (no rewrites) + Vercel static assets (verified)
[X] Step 4: Build-and-serve the SPA using Vercel's `public/**` (and keep deep-link refresh via Express catch-all)
**Task**: Ensure the built frontend ends up in repo-root `public/**` so Vercel serves it via CDN (verified: `express.static()` is ignored on Vercel). Add an Express “catch-all” route (registered after `/api` routes) that serves `public/index.html` for any non-`/api` route, so hard refresh on deep links (like `/results`) works without `vercel.json` rewrites. Make the catch-all conservative so it doesn’t intercept asset requests.
**Suggested Files for Context**: [`package.json`](/Users/andresm/Documents/Cursor%20Projects/ikigai/package.json), [`vite.config.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/vite.config.ts), [`client/index.html`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/index.html), [`client/src/main.tsx`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/src/main.tsx), [`server/vite.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/vite.ts), [`client/public/sounds`](/Users/andresm/Documents/Cursor%20Projects/ikigai/client/public/sounds)
**Step Dependencies**: Step 2
**User Instructions**: None

## Function runtime limits (verified) for long AI streaming
[ ] Step 5: Add `vercel.json` function config for max streaming duration
**Task**: Add a `vercel.json` that sets `maxDuration` for the Express entry file (the repo-root `index.ts`). Use the official `functions` config pattern you provided, with `maxDuration` in seconds. Set it to the maximum allowed for Hobby if you want to support long streams (300s).
**Suggested Files for Context**: [`package.json`](/Users/andresm/Documents/Cursor%20Projects/ikigai/package.json)
**Step Dependencies**: Step 3
**User Instructions**: In Vercel, confirm your plan supports the configured duration (Hobby up to 300s). If you’re on a different plan, adjust `maxDuration` accordingly.

## Database reliability in serverless (recommended improvement)
[ ] Step 6: Switch Drizzle DB client to Neon serverless driver for Vercel Functions
**Task**: Update the DB connection layer to use Neon’s serverless approach with Drizzle (recommended for serverless). This avoids issues commonly caused by long-lived connection pools in serverless environments. Ensure schema typing stays intact and that all storage code continues to work unchanged from the rest of the app’s perspective.
**Suggested Files for Context**: [`server/db.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/db.ts), [`server/storage.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/storage.ts), [`drizzle.config.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/drizzle.config.ts), [`shared/schema.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/shared/schema.ts), [`migrations`](/Users/andresm/Documents/Cursor%20Projects/ikigai/migrations)
**Step Dependencies**: Step 1
**User Instructions**:

### Part A: Create Two Neon Databases

You need two separate databases so Preview deployments don't affect real user data:

1. **Go to [Neon Console](https://console.neon.tech)** and sign in
2. **Create the Development database**:
   - Click "New Project"
   - Name it `ikigai-dev` (or similar)
   - Choose the same region as your Vercel deployment (e.g., `us-west-2`)
   - Click "Create Project"
   - Copy the connection string (looks like `postgresql://user:pass@host/dbname?sslmode=require`)
   - Save this as your **Dev DATABASE_URL**

3. **Create the Production database**:
   - Click "New Project" again
   - Name it `ikigai-prod`
   - Same region as above
   - Copy this connection string as your **Prod DATABASE_URL**

### Part B: Configure Vercel Environment Variables

Vercel lets you set different values for the same variable in different environments:

1. **Go to your Vercel project** → Settings → Environment Variables
2. **Add `DATABASE_URL`** with these settings:

   | Variable | Environment | Value |
   |----------|-------------|-------|
   | `DATABASE_URL` | Preview | `postgresql://...ikigai-dev...` |
   | `DATABASE_URL` | Production | `postgresql://...ikigai-prod...` |

3. **Important**: Uncheck "Development" for both — your local `.env` file handles local development

### Part C: Push Schema to Both Databases

Before either database can be used, you need to create the tables:

```bash
# Push schema to DEV database
DATABASE_URL="postgresql://...your-dev-url..." npm run db:push

# Push schema to PROD database
DATABASE_URL="postgresql://...your-prod-url..." npm run db:push
```

Alternatively, if you're using migrations:
```bash
DATABASE_URL="postgresql://...your-dev-url..." npm run db:migrate:dev
DATABASE_URL="postgresql://...your-prod-url..." npm run db:migrate:prod
```

### Part D: Local Development Setup

Your local `.env` file should point to the **dev** database:

```env
DATABASE_URL="postgresql://...your-dev-url..."
```

This way:
- **Local development** → Dev database
- **Vercel Preview** → Dev database (same data, good for testing)
- **Vercel Production** → Prod database (real user data, protected)

### Part E: Verify Tests Still Pass

After updating `server/db.ts` to use the Neon serverless driver:

```bash
npm test
```

All tests should pass. If any fail, the database connection change may have affected something — check the error messages.

### Quick Reference: Which Database Am I Using?

| Context | Database | How It's Set |
|---------|----------|--------------|
| `npm run dev` (local) | Dev | Your `.env` file |
| Vercel Preview URL | Dev | Vercel env vars (Preview) |
| Vercel Production URL | Prod | Vercel env vars (Production) |
| `npm test` (local) | Dev | Your `.env` file |

## Validate streaming + routing on Preview, then merge
[ ] Step 7: Validate the Preview deployment end-to-end before merging to `main`
**Task**: On the Preview deployment URL, validate: SPA loads, sounds/assets load, deep-link refresh works, and streaming endpoints work reliably under the configured duration. Confirm DB reads/writes succeed and that the API error handling does not leave the function in a bad state after errors.
**Suggested Files for Context**: [`server/routes/assessment/purpose-discovery.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/routes/assessment/purpose-discovery.ts), [`server/routes/assessment/action-plan.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/routes/assessment/action-plan.ts), [`server/routes/session.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/routes/session.ts), [`server/utils/errors.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/utils/errors.ts), [`server/utils/ai-logger.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/utils/ai-logger.ts)
**Step Dependencies**: Step 4, Step 5, Step 6
**User Instructions**: Use Vercel’s deployment logs to inspect failures and confirm there are no unexpected timeouts. Only merge to `main` after the Preview deployment passes these checks.

[ ] Step 8: Merge to `main` and confirm Production deployment uses Production env vars
**Task**: Merge the migration branch to `main` to trigger a Production deployment. Confirm Production uses the Production environment variables (especially `DATABASE_URL` and `GEMINI_API_KEY`) and re-run the same validation checklist on the Production URL.
**Suggested Files for Context**: [`package.json`](/Users/andresm/Documents/Cursor%20Projects/ikigai/package.json), [`server/env.ts`](/Users/andresm/Documents/Cursor%20Projects/ikigai/server/env.ts)
**Step Dependencies**: Step 7
**User Instructions**: After Production validation passes, you can optionally attach a custom domain and enable any additional Vercel protections (Firewall rules, etc.).

## Brief summary (overall approach + key considerations)
This migration keeps your architecture as a “serverless monolith”: a single Express Function for `/api/*`, and static SPA assets served from Vercel’s CDN via repo-root `public/**` (verified: `express.static()` is ignored on Vercel). SPA deep-link refresh is handled by an Express catch-all route returning `public/index.html`, avoiding `vercel.json` rewrites. Long AI streaming is supported by setting `maxDuration` for the Express entry file in `vercel.json` (verified via the official snippet you provided). The main implementation risk to manage is database connectivity in serverless; switching the Drizzle client to Neon’s serverless driver is the recommended improvement for stability under Vercel Functions.


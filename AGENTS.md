# AGENTS.md

## Project

Revelio is a TypeScript career-guidance application with a React/Vite frontend, an Express backend, PostgreSQL via Drizzle, and AI streaming through the Vercel AI SDK. The product is preparing for a pivot, so treat the current code as the authority for existing behavior and do not infer future direction from historical documents.

## Commands

- `npm run dev` — start the development server.
- `npm run check` — run TypeScript checks.
- `npm test` — run Vitest tests.
- `npm run test:e2e` — run Playwright tests.
- `npm run build` — build the client and server.
- `npm run db:push` — push the Drizzle schema; requires `DATABASE_URL`.

## Codebase

- `client/` — React frontend and browser-side state.
- `server/` — Express API, storage, and AI orchestration.
- `shared/` — shared Drizzle and Zod schemas.
- `docs/research/` — dated, point-in-time evidence and product thinking; it is historical context, not current direction.
- `docs/brainstorms/` — historical requirements and explorations.
- `docs/plans/` — historical implementation plans.

## Working Agreements

- Make the smallest coherent change that satisfies the task and integrate it into existing code paths.
- Follow existing patterns before introducing new abstractions or files.
- Preserve strict TypeScript. Avoid `any`; flag it when it is genuinely unavoidable.
- Run focused tests for behavior changes, then `npm run check` or `npm run build` when the affected surface warrants it.
- Keep agent instructions in the nearest `AGENTS.md`. Do not add organizational README files under `docs/`.
- Treat dated research, brainstorms, and plans as historical unless the task explicitly names one as current authority.
- Ask before adding a production dependency or performing destructive database or data operations.

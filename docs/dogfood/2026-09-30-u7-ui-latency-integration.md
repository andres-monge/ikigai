# U7 local UI and latency integration

**Checkout:** `codex/revelio-revamp-integration` at base commit `5b26585`; changes remain uncommitted. This record contains no founder transcript, Foundation answers, credentials, or raw server logs.

## Scope

- The recording control shows a short recording indicator; normal instruction prose is hidden while control names and screen-reader Send guidance remain. Existing errors and limit warnings remain visible.
- Your Map shows the Method stage without internal checkpoint subtitles. Its North Star card shows the heading and statement only. Foundation evidence and constraints remain canonical state.
- Development-only, opt-in client and server latency traces record fixed timing fields and an opaque request ID, without message, model, tool, URL, or personal data.
- Method R43 and the active U7 display amendment now reflect the founder's Map presentation decision.

## Review and verification

The combined tracked and untracked UI/latency source and tests were inspected for opt-in gating, response behavior, and diagnostic payload boundaries. No concrete integration defect required a code change. The four new latency files were included in that inspection even though they are untracked.

- Focused tests with Node `v24.19.0` and the existing project environment file: 6 files, 203 tests passed. The first run without that environment file stopped at environment validation; it was rerun with the intended file.
- `npm run check`: passed with Node `v24.19.0`.
- `npm run build`: passed with Node `v24.19.0`; existing Browserslist-age and large-chunk notices remain.

The attended founder U7 qualitative gate remains open. This integration run did not submit a Method message or reset account data.

## Local dogfood runtime

The prior listener was confirmed to be the Node `v24.19.0` server from this worktree before replacement. The restarted listener is PID `69835`, uses the same worktree and project environment file, and serves `http://localhost:5001/` with HTTP 200. Vite serves the updated recording and Map modules, and its transformed client trace module confirms the client flag is enabled. The server was launched with `NODE_ENV=development`, `REVELIO_LATENCY_TRACE=1`, and `VITE_REVELIO_LATENCY_TRACE=1` for this local runtime only. No authenticated Method turn was sent, so no live timing sample or founder-journey claim is made.

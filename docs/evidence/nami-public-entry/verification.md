# Nami public entry — local verification

Completed 2026-10-31 on `codex/revelio-revamp-integration`, Node 24.19.0. Feature review base: `fdc8dc6`.

## Delivered

- Integrated landing page with the approved headline, American spelling, subtitle and existing Google entry.
- Public `/our-vision` reading page from the captured essay only, with the final Revelio reference changed to Nami. Our Vision remains accessible in Chat and Your Map.
- Normal same-tab essay navigation, as the founder clarified. Returning to `/` uses existing session routing and restores saved chat and map. Unsent drafts and active streams retain existing unmount behavior; no persistence or keepalive was introduced.
- Exact approved share PNG, matching page/Open Graph/Twitter text, and existing public-origin substitution.

## Automated verification

- `npm run check`: passed.
- Focused seven-file suite after the same-tab correction: 102 tests passed.
- Full guarded suite using the existing scrubbed launcher and a fresh disposable local PostgreSQL 14.18 cluster: 74 files passed, 1,124 tests passed, 1 skipped. See `full-suite-result.json` and `full-suite-summary.txt`. The owned cluster was stopped and removed; no fixture listener remained.
- Final `BETTER_AUTH_URL=https://heynami.vercel.app npm run build`: passed. Fixture origin was process-scoped. Emitted HTML contains the expected absolute image URL with no origin placeholder. Built image and source asset both match approved SHA256 `9ad451f674baffab5f5eff16eb39b6fd02716da944d4b0247853556796d72de0`.
- `git diff --check`: passed. No lint script is configured. Existing stale Browserslist and bundle-size build warnings remain.
- Four simplification lenses (reuse, quality, efficiency and test value): no findings, no changes.
- Actual CE code review: four local lenses plus independent Claude Opus 5.5. See `code-review/review.json` for the completed receipt. No actionable findings. Claude low effort was requested; actual effort was unverified.

## Browser verification

Bundled Computer Use on approved `http://localhost:5173`; existing development server retained. Signed-out IAB and designated synthetic QA account in Chrome; no founder account, model calls or app data edits.

- Landing and essay: desktop 1280px and mobile 390×844, light and dark; readable layouts and no mobile horizontal overflow.
- Public essay direct load and refresh succeeded without authentication. Return to Nami returned signed-out visitors to the existing login route.
- Workspace link visible across Chat and Your Map, including wrapped mobile header controls.
- Final same-tab navigation: Chrome tab 61725092 navigated from `/` to `/our-vision`; only that tab remained. Return to Nami restored saved chat, then Your Map showed the saved North Star, paths and focus. Chat/light/empty-draft state was restored.
- Temporary viewport overrides were reset. Screenshots are in `qa/`; earlier workspace mobile images precede removal of the superseded new-tab arrow, while `workspace-return-light.png` shows the final header.

## Limits

This is local verification, not production health evidence. No deployment, push, PR, merge, domain change or auth configuration change occurred. Google consent was deliberately unchanged; the founder had already verified regular-browser logout/login worked smoothly. No new OAuth round trip was performed in this QA pass. Whole-output Vercel packaging/release gates remain required before separately authorized deployment; server packaging was unchanged here.

Peer review preceded the final founder-directed same-tab adjustment; local review and focused tests covered that adjustment. Its note about dark component-test coverage was addressed with actual light/dark browser inspection. Zoom is now allowed; exhaustive iOS focus behavior was not assessed.

Final post-review formatting check removed five trailing-space artifacts copied from the essay source. The content equality test permits trailing-space cleanup in addition to the authorized product-name replacement; the source snapshot remains untouched. Essay test passed again and base-to-HEAD whitespace check passed after cleanup.

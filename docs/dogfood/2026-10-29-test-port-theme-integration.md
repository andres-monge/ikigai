# Tests, ports and authenticated theme verification — 2026-10-29

The [approved bounded plan](../plans/2026-10-29-1601-fix-tests-ports-dark-mode-plan.md) is implemented and verified in c615. Local commits: `7b8aee3` (U1), `cf33c47` (U2/U3), `3d7b6b1` (U4), following plan commit `d3fc52b`. No push, PR, deployment or Method/model-policy change.

## Deterministic verification

The 32 previously retained failures reproduced before correction. Thirty-one endpoint failures required the reviewed migrated schema; the remaining assertion depended on a wrapped parser's display name. Four legacy route suites now share their real migrated disposable child with the storage singleton before route imports, use owned cleanup and retain their substantive assertions. No migration or fake schema was introduced.

The explicit `test:all` launcher requires the guarded local disposable administrator URL and opt-in before loading tests, removes application/provider/auth credentials and preserves arguments, exit status and signals. Existing storage harness ownership and safety checks remain authoritative. Tests are rooted in current server/client/shared sources; ignored archived copies are excluded.

- Full integrated suite: **1,009 passed, two existing bundle-dependent skips, 63 files**, zero failures.
- Final production bundle-loader smoke: **11/11 passed**. Typecheck and build passed.
- Final review correction: **56/56 Explore tests passed** after replacing response-fixture equality with assertions against actual rendered North Star and all three paths before/after theme switching.
- No lint script exists. Reviewed migration hashes match. Disposable administrator remains empty, no child databases remain, and the task-owned PostgreSQL cluster was stopped after verification.

The four previously preserved port/auth WIP files were deliberately incorporated with their intended bytes unchanged. Main is 5173; complementary lab is 5174. Exact production auth configuration and protections remain unchanged. Behavioral tests establish that auth receives raw JSON/form/malformed-JSON streams before ordinary parsers, while ordinary routes receive parsed bodies.

## Theme implementation and review

Adapted only source commit `900b6f02c3137068ec29ad981b083044ad33e474`, preserving original author/coauthor attribution and the current warm palette/layout. Actual Explore and legacy Header share an accessible toggle. Pre-paint initialization and a shared store honor OS preference until a choice; explicit choice remains coherent across mounted controls and OS events, including blocked storage. Illustration dimming is scoped to owned illustrations.

Completed simplification passes and one scoped code review, including an independent Claude Opus 5.5 pass requested at low effort. The original review verdict was Ready with fixes: its sole admitted P2 assertion finding is resolved and verified. Its then-pending authenticated acceptance gate is closed by the subsequent actual QA below. This is a resolution record, not a second review. No runtime auth, storage-safety or theme-lifecycle defect survived review.

## Actual authenticated Browser proof

After one attended normal login, a separately connected regular Chrome **QA** profile supplied supported, independently isolated test-account access. The founder profile was not claimed or operated. Header identity was verified before testing. The reusable authenticated tab remains open.

Actual Chat and Map were checked in both themes at 1280×900 and 390×844: readable cards/composer/statuses, visible keyboard focus, expanded saved learning, a 44px theme control and no narrow horizontal overflow. Unsent local text survived theme and panel changes. Before reload the composer was restored to its original empty state. Reload retained authentication, dark preference, exact Chat text and exact rendered Map text. The current project, three visible current paths and two saved learning observations persisted.

Cleanup restored the original rendered light theme, Chat panel, empty composer and default viewport. Raw local-storage state was unavailable through supported DOM inspection, so restoring an originally unset preference key is not claimed. Backend restart persistence after this login was not tested. No model message, signout or account write occurred. Read-only before/after comparison confirms both accounts' maps, durable turns, operation histories, conversation mappings and leases unchanged; zero active leases.

Synthetic preview checks separately covered canned Chat/Map, responsive layout and error presentation. They complement actual QA and are not represented as account evidence. All temporary fixture entrypoints were removed; no preview artifact is served or bundled. Private ignored evidence retains logs, review receipt/resolution, canonical comparisons and screenshots; no account identifiers, answers, credentials or real-account pixels are committed.

## Remaining boundaries

- DF-14: narrow reflection correction **approved pending** a separate source-based proposal/verification approval. Rich evidence was saved but the reply repeated an answered opening. No correction is included here.
- DF-15: normal Chrome test-account access is now verified through supported Browser, including reload. The in-app browser's location-assignment-return/no-navigation cause remains unknown and unresolved. No OAuth fallback or security change.
- DF-16: indefinitely busy sign-in recovery remains explicitly deferred.
- Reflection → explicit choice → saved follow-on live loop closure requires separate authorization after DF-14. Founder acceptance, full MVP/U7, U10 and erasure gates remain independently open. Heartbeat remains off.

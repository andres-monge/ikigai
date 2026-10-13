# First-project Chat presentation — 2026-10-13

## Debug Summary

**Problem:** The first completed simple project proposal saved its title and three brief fields, but Chat displayed only supporting acceptance copy. Opening Your Map or making a second display request was necessary. This is a confirmed presentation defect against R8/R9 and U5, not merely a qualitative writing limitation. This bounded `ce-debug` follow-up starts from `d0863185b74aa25ed40bfc5725b4e50ccbd4b599`.

**Root Cause:** `propose_first_project` saves the canonical title, learning goal, first version and first step. `present_first_project_framing` stores ordinary supporting text. Tool-step prose is suppressed, and accepted shared instructions prevent repeating app-owned fields in prose. Natural framing delivery checks that the final assistant output contains framing text, then records completed delivery. Chat projected Purpose Path cards but had no corresponding project brief projection; only Map rendered those canonical fields. A valid completed framing reply therefore omitted the visible brief. Retained private account evidence confirms this chain without another account or provider request.

**Fix:** Chat attaches the saved simple brief to the final assistant item of its exact completed natural-framing delivery turn, before supporting prose. It displays the title, What you'll learn, What you'll make and Suggested starting point as escaped, ordinary text without status or action controls. Delivery and framing provenance must match; pending, failed, cancelled, legacy and unhosted records do not attach. Historical replacements retain their own delivery hosts, and duplicate history or records attach each project revision once. Attachments use hydrated durable history, never an unfinished stream. Map and Chat share the three label/field descriptors while Map retains its existing layout and behavior.

**Regression evidence:** Public reducer fixtures commit selection, proposal, framing and delivery, with support-only final prose. Three expected assertions failed before implementation, including the absent Chat title. Tests then verify the full brief precedes support in the same reply, exact framing delivery even when later than proposal, historical replacement, deduplication, ineligible states and literal escaped hostile text. No provider output is fabricated as account evidence.

**Confidence and limits:** High for the missing canonical Chat projection. The fix requires existing completed delivery provenance; it does not infer delivery or accept a project. Attended founder acceptance (U7), repeated-loop qualitative proof (U8), manual accessibility and release gates remain open.

## Post-Fix Quality

**Scope:** Four client files and these evidence receipts only. No backend, prompt, skill, saved schema, delivery guard or acceptance semantics changed. Design 1.3.0, Guide 1.0.0, Interpret 1.0.0, Foundation 1.1.13, Paths 1.1.7, accepted voice V4 and the immutable repeating-learning plan remain untouched. Prior provider-schema and reload-recovery corrections remain in place.

**Simplify:** Actual `ce-simplify-code` completed with three full-rubric reviewers for reuse, quality and efficiency. All found no actionable changes. Shared section descriptors already avoid duplication; project and path eligibility deliberately differ; small memoized arrays do not justify additional indexing.

**Review:** Targeted manual correctness/security review of fix-owned files, with an independent reviewer, completed with no findings. Exact final completed delivery, revision/history deduplication, escaping, unchanged SafeMessage/citation behavior and absence of premature streaming presentation were checked. This route avoids unrelated dirty branch work; no file-scoped lightweight harness tool is available and no duplicate whole-feature review ran.

**Verification:** Node24 typecheck and production build pass. Five targeted UI files pass all 77 tests: Explore 49, Map 11, SafeMessage 13, interaction ownership 1 and Explore state 3. The run excludes private `.context` snapshots. Diff whitespace check passes; no lint command is configured. Logs are `/tmp/revelio-chat-brief-final-tests.log` and `/tmp/revelio-chat-brief-build.log`.

## Nonmutating Browser proof

An isolated synthetic fixture ran through the actual Explore component and public reducer on enterprise-approved `http://localhost:5173`, in the in-app browser. The fixture intercepted its two history/workspace reads with synthetic data and rejected API writes. No real account interaction, SQL, paid generation or model call was used.

Before the fix the browser showed support-only text despite the saved complete proposal. After the fix it showed one canonical title and all three sections before the support, with zero brief buttons and no horizontal overflow. Duplicate history and reload still showed exactly one brief. Pending framing and failed-turn variants showed no Chat brief. At 390×844 the full brief remained readable without horizontal overflow. Desktop and narrow screenshots were inspected inline; no local screenshot artifact is claimed.

The temporary viewport was restored, fixture tab closed and both ignored fixture source files removed. A reproducible synthetic fixture and `browser-proof.json` remain privately under Git recovery metadata in `recovery/first-project-chat-projection-20261013`, outside tracked content. The founder's existing Chrome tab and revision-28 account state were left alone: selected path and receipt preserved, one suggested project, work not started, framing delivered. No acceptance, replacement, reset or new display request occurred.

The four unrelated integration WIP files (`AGENTS.md`, `server/auth.test.ts`, `server/auth.ts`, `server/index.ts`) remain outside this commit and are byte-identical to the pre-incorporation manifest. Main 5173 and lab 5174 remain available; heartbeat stays off. No push, PR or deployment occurred.

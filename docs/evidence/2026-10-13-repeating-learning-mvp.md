# Repeating-learning MVP: offline implementation evidence

This receipt covers the isolated implementation checkout at `/Users/andresm/.codex/worktrees/mvp-learning-loop/ikigai`, branch `codex/repeating-learning-mvp`. All saved/tested content is synthetic. It establishes implementation behavior, not founder acceptance, live-model quality or deployment readiness. The local formal review is complete; all three confirmed findings are resolved. Final settled-tree check results are recorded below.

## Authority and adopted instructions

Baseline: `de6dcd884d081c0c6905b173182a1a81675b32fa`. The immutable [approved plan](../plans/2026-10-13-1220-feat-repeating-learning-mvp-plan.md) retains SHA256 `7af754024dffda000d561c1d5021602a2ae95378483e3dab22dbe2e70250ddd6`. Existing active plans are reconciled in place; their reviewed integration/replay/interface append histories are retained. Thesis and frozen V2 schema files are unchanged.

| Unit | Local commit | Result |
|---|---|---|
| U1 | `bb5984c` | Active five-module MVP authority; detailed deferred features retained; unaffected draft text preserved. |
| U2/U3 | `09976fa` | Compatible V3 state, pure strict V2 read normalization, focus commitments, honest unrelated continuation and relevant repeat checkpoints. |
| U4 | `63b85e9` | Operational Guide/Interpret tools, exact natural prior-turn acceptance, five-module per-step refresh and instruction adoption. |
| U5 | `ed7a945` | Learning-first simple briefs, current focus and readable historical records in Chat/read-only Map. |
| U3/U6 followup | `ad4fa77`, `a2fab52` | Stable isolated test listeners, lifecycle review fixes and repeat/reload regressions. |
| U6 final receipt | Local commit titled “Verify repeating learning integrity and record remaining human gates (U6)” | Canonical compaction, heterogeneous erasure/performance fixtures, final checks and this receipt. |

| Runtime instruction | Content version | Runtime file SHA256 |
|---|---|---|
| Foundation | 1.1.13 | Existing body unchanged by adoption. |
| Paths | 1.1.7 | Existing body unchanged by adoption. |
| Design | 1.3.0 | `c65b2677ff21a463abbb4a6bf8bc0f66363e4b2f9a2e508a2526af344aee6af1` |
| Guide | 1.0.0 | `b6ced62292e52bcd8dc0b8d837ef2dc7437258bb3873d4e1b6cc01b90c195e70` |
| Interpret | 1.0.0 | `2753f982df372cfcf158a380e046c262ef3a4fec53ce50cd28dac6928355c42a` |
| Shared base | 1.1.9 | Existing accepted voice retained; shared freedom principles adopted. |

Independent byte comparison confirms all three runtime instruction bodies match the reconciled source drafts. Runtime frontmatter versions are separate from the preserved bodies. Interpret's protected passage, from “Decide what to change” through “Do not rewrite the North Star within reflection.”, retains SHA256 `3497faaf9dda0c7dd4af23a589d8f73147d99580cf8fd48e6c3a374ca2bbf8d7`. Design line 18 intentionally retains the approved trailing space; this is the sole known whitespace exception.

## Recorded verification

Authoritative checks use installed project-required Node `24.19.0`; no package or lockfile changes were needed. Use `PATH=/Users/andresm/.nvm/versions/node/v24.19.0/bin:$PATH`. Storage checks source `/tmp/revelio-mvp-test-env.sh`, which selects the task-owned disposable synthetic PostgreSQL cluster on IPv4 loopback port 55439. Existing migrations were applied to its synthetic admin database for legacy route tests; no migration files changed. No live credentials were used.

### Final settled-tree checks

| Command | Result |
|---|---|
| `npm run check` | Passed. |
| `npm test -- --run` with disposable test DB | 53 files passed; 843 tests passed, two production-only smoke cases skipped (845 total); 23.96 s. |
| `npm run test:method-bundle` | Build passed; 18 production loader/evaluation checks passed, including exactly five active bundles. |
| `node --import tsx scripts/eval-revelio-method.mjs --offline-contracts-only` | Passed; `providerCalls: 0`. |
| Focused review-fix regressions | 46 reducer/selector/state-machine checks passed; 18 HTTP fixture/direct-stream checks passed. |
| Protected-content/scope audit | Immutable plan, eight frozen V2 files, protected Interpret passage, draft/runtime bodies and integration history preserved. Current uncommitted diff has no whitespace errors; branch-wide diff retains only the approved Design trailing space. |

Final logs: `/tmp/revelio-mvp-final-tests.log` and `/tmp/revelio-mvp-final-bundle.log`.

The full suite includes disposable storage/migration/performance checks, anonymous legacy route tests, kernel/state-machine, agent/tool/briefing, auth/privacy/cancellation/compaction/erasure and component tests. There is no configured lint command. No paid evaluation, browser session or real-account turn ran.

### Repeated learning, reload and compatibility evidence

Public-operation fixtures exercise at least three completed project select→reflect→decide cycles, commitment followed by further work, same/parked/revised/new directions and unrelated project-scoped continuation. JSON serialization plus `readCareerMap` occurs throughout reducer/repeating helpers and model-based committed transitions, asserting complete map equality, owner, revision, receipts and checkpoint before continuing. Pending acceptance, revision, options, reflection, choice, Next Move, focus, Why confirmation and active-review checkpoints are included.

The deepest retained Why fixture resolves all four active dependency reviews, retains deferred invalidations as history, selects new Why-based paths and a later project, and compares preserved peer/commitment/proof/SideDoor/outcome records. Strict version-2 inputs normalize purely; first authorized version-3 writes retain exact-once receipt and revision behavior.

Two U6 regressions reproduced selector/reducer disagreement before correction: a deferred legacy peer focus blocked an advertised reflection and suppressed helper operations; a saved reflection focus on a superseded project blocked a fresh current-project reflection. Narrow corrections preserve pure reads and historical records, permit explicit active actions, and still reject duplicate reflection on the current project.

The fake-model compaction case uses canonical unrelated work, independent path focus and reflection revision 2 against obsolete revision-1 transcript content. The exact-target tool guard rejects the obsolete target without mutation; a valid later choice refreshes to project-scoped Next Move. Compaction occurs only at step zero.

### Persistence, erasure and bounded performance

A test-only fixture builds heterogeneous state through actual public operations from a strict retained V2 proof/route map. It includes historical route outcomes plus V3 unrelated simple projects, option sets, work reports, evidence, closed reflection, choices and independent focus. Existing Method-data erasure retry tests retain the non-content-bearing provider-failure marker, recreation blockade and zero-orphan checks while deleting map/history/draft/turn/lease/Conversation data. This is separate from BetterAuth identity deletion.

The 300-revision sample contains 29 projects, 29 reflections, 28 option sets and 28 focus records plus historical proof/route/outcome data. Final full-suite sample: 450,175 serialized bytes; validation p95 3.86 ms; 20 mixed durable transactions p95 33.26 ms; 16 concurrent compare-and-swap attempts settled in 279.21 ms with exactly one commit. Existing falsification bounds remain 1,048,576 bytes, validation p95 50 ms, transaction p95 250 ms and concurrent settlement 5,000 ms. Synthetic results establish bounded fixture behavior, not production latency.

### Test infrastructure corrections

Raw Express/Supertest wildcard listeners intermittently collided with the desktop IPv4 proxy: process/socket inspection found a Node IPv6 wildcard listener and Codex IPv4 listener sharing an ephemeral port, with the IPv4 client reaching the proxy. A minimal probe with no application imports reproduced the issue; Node24 wildcard binding passed 598/600 attempts, explicit IPv4 loopback passed 600/600. Node version was not established as the cause.

The test-only fixture now awaits `listen(0, '127.0.0.1')` before Supertest and closes only its own listeners/connections. Ten test files use the fixture; two direct fetch tests use the same bind helper with caller-owned final cleanup. Tests cover ordinary requests, cancellation cleanup and occupied-port rejection. No production network, auth or serving-port behavior changed.

Two existing expectations were corrected: the audio parser test now exceeds the actual 11 MiB limit, enables the agent for that case and asserts transcription is not called; provider effort tests now expect Paths HIGH→Design MEDIUM. Production parser behavior and model selection did not change.

## Simplification and formal review

Settled implementation received the actual `ce-simplify-code` workflow with three local reviewers. Accepted changes reuse schema-owned project keys for content consistency, remove a no-op reflection assignment and filter exact Next Move targets before lineage scans. Typecheck verifies the resulting typed projection.

Actual `ce-code-review` completed once, with 11 local review lenses and five same-run supplemental reviews of test-infrastructure edits, followed by independent validation. Receipt status: `complete`; verdict before fixes: `Ready with fixes`. Run ID: `20261013-135731-c178e631`; artifact: `/tmp/compound-engineering-501/ce-code-review/20261013-135731-c178e631/review.json`. No external model, browser or provider calls were used for review.

| Confirmed finding | Resolution and evidence |
|---|---|
| #1 P1: abandoned Foundation reconsideration stranded new-path project options | Active paths expose a fresh explicit project request even when the accepted project belongs elsewhere or is absent. Completed loops never advertise an illegal first proposal after consuming their basis. Red→green reload regression preserves superseded options/learning history and proves a new action yields exactly three fresh options. |
| #3 P2: direct parked-path selection left pending projects/options active | Shared atomic cleanup parks suggested projects and supersedes suggested option sets on direction transitions. Red→green A→B→A reload regression preserves original content, keeps abandoned options historical and uses the new selection basis for three fresh options. |
| #2 P2: direct test listeners did not reject bind errors | Shared loopback binding rejects errors, removes the error listener after success and closes failed listeners. An occupied-port test proves rejection and cleanup; both direct fetch concurrency tests pass. |

All three actionable findings are applied; the residual local gate has no unresolved required finding. A separate advisory suggested bounded historical-context lookup after compaction. The review demonstrated no failed conversation requiring that new mechanism; current focused context and inspectable history satisfy the scoped MVP, so no new tool was added. Human browser/model acceptance gaps remain explicit below.

## Human and coordinator gates

- Attended U7 and founder actual-app dogfood remain pending.
- Authenticated Method browser/desktop/mobile and manual screen-reader release verification remain pending. Component assertions are separate evidence. The existing Playwright suite contains a single anonymous `/legacy` happy-path journey; it does not establish both-language or authenticated Method browser coverage. Spanish questionnaire unit tests provide narrower evidence. The old Playwright configuration uses 5001 and was not run unchanged; approved origins are main 5173 and lab 5174.
- Separately authorized paid-model evaluation/live judgment quality remains pending. No model samples, live-account turns or provider experiments ran for this implementation.
- Synthetic full Method-data erasure verifies map/history/draft/turn/lease/Conversation controls and retry behavior. I3's real-account/BetterAuth identity deletion runbook and dry run remain pending; these tests do not delete or prove deletion of auth accounts.
- Incorporation into the serving integration checkout and deployment remain coordinator gates. Existing main 5173/lab 5174 processes, unrelated integration WIP and approved port changes are untouched. No push, PR, serving restart or deployment occurred.

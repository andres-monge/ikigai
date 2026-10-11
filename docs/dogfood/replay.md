# Private founder replay

The bounded replay amendment in the active revamp plan controls this workflow. The harness uses production `createMethodAgent`, tools, module loader, state refresh, and visible output barrier. Application callers retain the default instructions; only an explicit replay override substitutes the base text.

Keep the case, source capture, editable instruction copies and output in the Git-ignored `.context/revelio/replay/` directory inside the active worktree. Never add private artifacts to Git. Each run freezes `base.txt` and the copied `skills/` directory, records their digests, seeds a newly created provider Conversation, and applies operations to an in-memory clone through the shared reducer.

```sh
node --import tsx scripts/replay-revelio.ts PRIVATE_CASE_JSON PRIVATE_INSTRUCTIONS_DIR NEW_PRIVATE_OUTPUT_DIR ENV_FILE
```

The instruction directory contains `base.txt` and `skills/` with the same bundle layout as `server/ai/method/skills`. The output directory must be new. The environment file supplies only the provider API key to this run. The case contains `label`, `sourceConversationId`, `initialMap`, `priorTurns`, `priorItems`, `currentMessage`, `historicalReply`, and a `provenance` manifest describing checkpoint recovery and omissions. Recover those fields from retained evidence; do not substitute invented transcript or later map facts.

Review `comparison.md` alongside `result.json`, `provider-requests.json`, `seeded-items.json`, `final-map.json`, and the frozen instructions. Prefix content/order must survive seeding exactly. A separate read-only source check verifies the live map/history/turns and original provider items; the harness's transport restriction alone does not prove source equality.

This tests agent behavior at the selected checkpoint. It excludes browser/auth, database transactions and concurrent lease handling, latency, inaccessible hidden reasoning, and unrecoverable historical request settings. Current application model/settings do not establish exact historical reproduction. Founder review of the first working case gates instruction experiments, voice/path combinations, synthetic cases and an interface.

Focused verification:

```sh
npx vitest run server/ai/agent.test.ts server/ai/tools.test.ts server/ai/method/loader.test.ts server/ai/replay.test.ts
npm run check
```

The CLI script also needs a TypeScript check because project `tsconfig.json` excludes scripts. Use a private config extending the project config and including this script; no private case content belongs in that config or Git.

## Local review interface

The founder-approved interface runs separately from the application, on loopback port 5174:

```sh
node --import tsx scripts/replay-lab/server.ts .context/revelio/replay/interface ENV_FILE 5174
```

Open `http://127.0.0.1:5174`. Paths uses the exact accepted V4 voice with editable private skill copies and no fixed voice-comparison action contract. Voice exposes editable voice candidates and retains original V1–V4 comparisons as archives. Paths opens with **Paths V1** and the first path moment selected. Choose **Run Paths V1**, review the result, and leave notes. Request agent edits for V2 from those notes, then compare candidate versions. Historical Paths outputs are retained inside checkpoint context, rather than used as the quality baseline. Voice retains its original historical comparison. Tick additional candidates and moments separately for **Run selected batch**. Each explicit batch allows at most twelve pairs, running two at a time. There are no automatic variants, repeats, retries or model selectors.

Use **Duplicate** to name a hypothesis, **Edit** to change its full instructions, and **Save version** before running. Instruction comparisons show added and removed lines. Shared product rules and checkpoint controls remain separately inspectable. Results freeze their candidate version, instructions, map input and transcript. Feedback autosaves to that run version, with a visible saved/error status. **Continue this branch** uses its frozen instructions and completed history in a fresh isolated provider Conversation; changing the current candidate draft does not change the branch.

Private root layout:

- `accepted-v4.txt`: exact accepted voice, fixed for Paths.
- `base-template.txt`: shared required instructions with `{{VOICE}}` and `{{CONTROLS}}` placeholders. It contains no expression-only comparison boundary for Paths.
- `candidates/ID/draft/name.json`, `voice.txt`, `skills/MODULE/SKILL.md`: editable files shared by browser and agents. Preserve required registry frontmatter. Reload agent changes before saving; stale versions are rejected.
- `candidates/ID/versions/DIGEST/`: immutable candidate snapshots.
- `checkpoints/ID/case.json` and `checkpoint.json`: recovered engine input and readable review context/provenance. Full provider prefixes stay behind details.
- `jobs/ID/`: per-run snapshots, results, continuation state and feedback.
- `archives/ID/job.json`: optional retained original comparison manifests. Original run artifacts remain in place; archive continuation is unavailable when full generated history was not retained.

Repository-local storage is restricted to `.context/revelio/`, must actually be Git-ignored, and must contain no tracked files. Runtime artifacts cannot be symlinks. External disposable test fixtures remain supported. Credentials are read only from the separate environment file and never served. The service binds to `127.0.0.1`, rejects unrelated Host/Origin headers, and requires same-origin mutations. Port 5173 is rejected. Restarted queued/running jobs become interrupted errors, requiring a new explicit run.

Recovered historical maps are labelled reconstructions. Their focused briefings are verified exactly against original refresh contexts; later facts are excluded. Available tool calls are grouped with every matching result. Hidden reasoning and missing historical request settings remain unavailable. This interface covers Foundation and Purpose Path iteration. First-project terminal framing is outside this implementation; PostgreSQL transactions, production leases and application authentication are not replayed.

Additional verification:

```sh
npx vitest run server/ai/replay-lab.test.ts server/ai/replay.test.ts
```

Typecheck all `scripts/replay-lab/**/*.ts` and `*.tsx` plus the replay CLI using a private config extending the project config with DOM libraries. The normal project check excludes scripts. Browser verification covers review, editing, duplication, diffs, explicit batches, feedback reload and branch continuation at desktop and mobile sizes. Fixture tests verify bounded concurrency and sibling isolation without provider calls; live verification uses only the current application model at LOW effort.

Design references consulted for this narrow interface: [build-review-interface](https://raw.githubusercontent.com/ai-evals-course/evals-skills/main/skills/build-review-interface/SKILL.md), [error-discovery](https://raw.githubusercontent.com/ai-evals-course/evals-skills/main/skills/error-discovery/SKILL.md), [automating eval design and hillclimbing](https://claude.dev/blog/automating-eval-design-and-hillclimbing/), and the repository's `docs/research/evals/pocket-guide-to-ai-evals.md`. These informed readable native outputs, contextual comparisons, collapsible actual traces, and retained human feedback. They were used as design references; no external eval platform or automated optimization loop was installed.

A candidate that still conflicts with the tested production contract can include `draft/preparation.json`. The lab versions and displays that record alongside the original proposal, exact adaptations, and current contract. Such candidates and their duplicates cannot queue a run. After the authorized contract changes are verified, retain the record with `status: "ready"` and no conflicts. Ready candidates can run; preparation metadata never injects extra prompt guidance. Paths V1 uses the exact supplied instruction body with only the registry frontmatter version adapted. New model-facing cards omit `possibility`; canonical maps still read the legacy field. Following founder review, Paths V2 uses four unlabeled one-sentence bullets under Why it may fit: interest, meaningful contribution, relevant ability or experience, and fit with current constraints. The first three use evidence and the fourth practicalFit. Historical values remain readable without invented or padded bullets. The production agent introduces the first completed set once and retains concise acknowledgments on subsequent sets, while preserving canonical card delivery guards. A rejected candidate can be retained with `archived: true` in `name.json`; it stays inspectable through its artifacts but cannot generate new runs or be reactivated by editing or copying it.


## Relocated historical artifacts

Dogfood QA evidence lives in `.context/revelio/dogfood/`. Replay captures and the review interface live in `.context/revelio/replay/`.

Relocation preserves frozen instructions, manifests and result files byte-for-byte. The interface reads `.artifact-relocation.json` for explicit old-to-new path mappings and rebases artifact-reference metadata in memory. Candidate versions and instruction digests do not change merely because storage moved. The private migration receipt includes integrity hashes and separate derived views of historical links; those views are navigation aids, not tested input. Use the relocated CLI root when restarting the interface. No provider run is needed to verify storage migration.

## Frozen Paths V6 review bundle

`scripts/replay-lab/frozen/paths-v6/` preserves the winning candidate's exact base, accepted voice, shared rules, Foundation, Paths and project skills. Its manifest records the candidate content version, module versions, SHA-256 digests and provider settings. It contains instructions and opaque provenance IDs only. Conversations, maps, cards, source posts and founder feedback remain private in the ignored lab root. Byte-preserved instruction files may retain trailing blank lines.

The bundle is a review artifact; the application does not load it. Production skill adoption remains a separate founder decision. The approved card/tool compatibility changes can read historical fields and use the newer card shape, while the retained production skill still describes the older contract. Do not treat these commits as a complete production rollout.

For a source-inspired transfer check, label reconstructed wording and starting context, retain the full source and its existing canonical screening decision privately, and use fresh maps and provider histories. Do not manufacture a confirmed North Star. Stop before a run when known evidence gaps would yield only a generic Foundation interview rather than testing Paths. A Foundation-only branch is inconclusive for Paths distinctness; it is not successful path coverage.

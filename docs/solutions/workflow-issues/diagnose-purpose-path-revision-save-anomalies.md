---
title: Diagnose a missing Purpose Path revision set
date: 2026-09-27
category: workflow-issues
module: Revelio Method Purpose Paths evaluation
problem_type: workflow_issue
component: testing_framework
severity: medium
applies_when:
  - A Purpose Path revision check reports no new saved set or an unexpected set count.
  - An explorer asks to revise multiple paths but does not see one updated group.
tags:
  - purpose-paths
  - live-evaluation
  - save-diagnostics
  - atomic-revision
---

# Diagnose a missing Purpose Path revision set

## Context

When an explorer asks to change paths A and C while keeping B, Revelio should save **one complete replacement set** containing three paths and show **one updated group**. The old set stays in the map's history; the new set should add one to the stored set count. The Method requires one `revise-purpose-paths` operation for changes to two or three cards and exact preservation of any unchanged card (`server/ai/method/skills/create-purpose-paths/SKILL.md:36-40`). The evaluation checks one operation, one added set, unchanged B, and one canonical offer (`scripts/eval-nami-method.mjs:1002-1009`).

In one historical synthetic run, the operation-count check passed but the following set-count check failed. The old assertion did not retain the actual count, operation status, or rejection code (session history, 2026-09-27). **The cause of that run remains unknown.** It is evidence of a failed check, not proof that a real explorer saw missing cards. Later fixes and passing runs cannot retroactively explain it.

## Guidance

Preserve the full privacy-safe diagnostic from a recurrence before changing the prompt or model. On a completed run, the evaluator reports whether the revision tool was offered, each model step's tool names and finish reason, operation status and rejection code, input-shape flags, map revisions, and set counts before and after the operation (`scripts/eval-nami-method.mjs:376-383`, `scripts/eval-nami-method.mjs:977-999`, `scripts/eval-nami-method.mjs:1270-1325`). If the reducer rejects an operation, the runner checks its recorded operations even if the model later completes or its call fails, then throws a small allowlisted diagnostic with the rejection code, input-shape flags, and before/after counts (`scripts/eval-nami-method.mjs:1657-1664`; `scripts/eval-nami-rejection-diagnostic.mjs`). Classify the run:

1. **No save operation was attempted.** Check the request and reply. The `original` fixture leaves the connection to the confirmed North Star open, so asking about that connection can be appropriate; the `clarified` fixture makes it explicit (`scripts/eval-nami-method.mjs:897-910`). Do not call a useful North Star question a save failure. If a clearly connected request was skipped, inspect tool availability and model step diagnostics before changing instructions.
2. **One save was attempted but no set appeared.** Read `status`, `rejectionCode`, `revisionInputShape`, `pathSetCountBefore/After`, `mapRevisionBefore`, `authoritativeRevision`, and `sourceIdReused` from the completed run or rejection error. A `rejected` result calls for a deterministic test of its exact rejection. A `replayed` result calls for checking operation identity and idempotency. A `committed` result with no added set calls for tracing the reducer's returned map and the count assertion. The synthetic harness calls the in-memory reducer; it does **not** prove a database write or failure (`scripts/eval-nami-method.mjs:1284-1305`).
3. **More than one save or group appeared.** Check the same-turn guard and the number of committed operations before investigating presentation. One multi-card request must produce one atomic replacement (`shared/career-map/reducer.ts`; `server/ai/method/skills/create-purpose-paths/SKILL.md:40`).
4. **The new set exists but the explorer sees the wrong cards.** Trace the saved set through history hydration and the Chat attachment separately. A correct stored count does not prove correct presentation, and a display bug does not prove a failed save (`server/ai/history.ts`; `server/routes/agent.ts`).

Run `node scripts/eval-nami-method.mjs --adaptive-revision-only=clarified` with `OPENAI_API_KEY` set. If the failure appears only when fixtures run together, use `--adaptive-revision-concurrent=clarified` (`scripts/eval-nami-method.mjs:1909-1925`). Record the model, reasoning effort, prompt/tool versions, output budget, and each result. Keep a small, bounded replay; repeated passes cannot prove an intermittent failure impossible. Once a cause is identified, fix that layer and add a deterministic regression test for it.

## Why This Matters

“No updated paths” can mean Revelio asked an appropriate question, tried an invalid save, reused an operation, saved correctly but displayed incorrectly, or exposed a problem in the test harness. These need different fixes. Raising model reasoning effort does not repair a rejected reducer operation. The current diagnostic separates a model decision from a completed state change and now reports rejected operations without retaining private conversation text.

## When to Apply

Use this guide when a clear multi-path revision fails in a live check, or an explorer reports old, missing, or duplicate path cards after asking for changes. If only a synthetic assertion fails, establish which case above applies before claiming user impact.

## Examples

- A bounded comparison exposed `stale-target` rejections when the model supplied an old source-set reference. The production revision tool now supplies the current source set itself; its input schema no longer asks the model for that reference (`server/ai/tools.ts:133-138`, `server/ai/tools.ts:600-611`). This is a verified fix for those observed rejections, **not a proven cause** of the historical count failure.
- Other runs exposed `revision-conflict` when a changed card reused its old ID and revision. The tool now advances that card's revision while leaving unchanged cards untouched (`server/ai/tools.ts:139-150`). This also cannot be assigned as the historical cause.
- A bounded post-fix comparison passed the clear revision and genuine North Star mismatch cases at both low and medium reasoning, two runs per condition. That is useful coverage, not a measured failure rate. Revelio remains configured for low reasoning (`server/ai/agent.ts:522-529`).

## Related

- `docs/evidence/2026-09-03-u6-method-presentation-matrices.md` describes save-result presentation and recovery.
- `docs/evidence/2026-09-05-u6-conversation-first-amendment.md` describes Chat attachment of a saved path set.

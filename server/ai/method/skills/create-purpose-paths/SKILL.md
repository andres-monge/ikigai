---
name: create-purpose-paths
description: Create and revise exactly three distinct Purpose Paths with equal weight and explorer-owned choice.
version: 1.0.2
---
# Create Purpose Paths

## Outcome

After a Why I Work is confirmed, offer exactly three meaningfully distinct ways to serve it. A Purpose Path is a direction for exploration, not a job title, identity prediction, prestige ladder, or fit score. The explorer owns every consequential choice.

## Path contract

Each path must contain:

- a clear, concrete name;
- how it serves the confirmed Why;
- what could become possible;
- evidence for why it may be worth exploring;
- the central unknown that action should answer;
- a Path Project preview; and
- a concise researched view of practical fit, including relevant economics, access, credentials, and constraints without using them to define meaning or prestige.

The set must contain exactly three distinct mechanisms for serving the same Why. Give every path equal weight. Never rank, score, highlight, preselect, or recommend a path unless the explorer explicitly asks for a recommendation. Even then, explain uncertainty and leave the choice with them.

## Revision and choice

- Let the explorer question, rewrite, combine, or replace paths before choosing.
- For a replacement, replace only the requested path and preserve the other two unchanged. Commit a complete three-path set atomically and verify that all three remain distinct.
- When you combine paths, commit one complete three-path set atomically: preserve the uncombined sibling, add the merged path, and add a genuinely new third path. Combining never implicitly selects a path.
- If prestige, status, or an attractive identity is carrying a path, investigate that distortion and revise or replace the path without ranking the alternatives.
- Only an explicit explorer choice may activate one path. Do not treat interest, generic assent, or your own recommendation as selection.
- An explicit ordinal reference such as "the first path in the current set" is an exact choice: resolve it against the canonical current three-path order and select that path without asking the explorer to repeat its generated name.

## State operations

- Use `propose-purpose-paths`, `replace-purpose-path`, or `combine-purpose-paths` only when that exact operation is currently exposed.
- Do not include `rank`, `score`, `equalWeight`, `selection`, or confirmation fields in model-authored path input. The deterministic reducer owns equal weighting, availability, activation, parking, lineage, and validation.
- Use `select-purpose-path` or `confirm-purpose-path-revision` only for the exact path and set the explorer explicitly chose after a completed prior presentation.
- After any operation, wait for the authoritative result. Reload the map, checkpoint, active tools, and module before continuing.

## Reply discipline

Present the paths in parallel language with comparable detail. Keep each path at 80 words or fewer and the whole reply at 350 words or fewer, including any introduction and question. Compress the canonical fields into concise prose rather than explaining the Method. Invite questions, revision, combination, replacement, or an explicit choice without steering the explorer toward one option.

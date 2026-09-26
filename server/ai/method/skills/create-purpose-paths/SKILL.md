---
name: create-purpose-paths
description: Create and revise exactly three distinct Purpose Paths with equal weight and explorer-owned choice.
version: 1.1.1
---
# Create Purpose Paths

## Outcome

After Your North Star is confirmed, offer exactly three meaningfully distinct ways to serve it. A Purpose Path is a direction for exploration, not a job title, identity prediction, prestige ladder, or fit score. The explorer owns every consequential choice.

## Path contract

Each path must contain:

- a clear, concrete name;
- how it serves the confirmed North Star;
- what could become possible;
- evidence for why it may be worth exploring;
- one clear question about what the explorer needs to learn through doing this work: their interest, energy, appetite for its daily tasks, or willingness to continue. Do not substitute a question about whether the project or business will succeed;
- a Path Project preview; and
- how a small starting version could fit the explorer's stated time, money, access, and other current constraints. Research specific economics, credentials, or legal requirements only when they genuinely affect that starting action; do not default to enterprise-scale compliance checks, income replacement, or speculative warnings before a low-stakes experiment.

Keep provider citation markers and source references out of every card field. Research citations belong in ordinary conversation, never in canonical Purpose Path data.

The set must contain exactly three distinct mechanisms for serving the same North Star. Give every path equal weight. Never rank, score, highlight, preselect, or recommend a path unless the explorer explicitly asks for a recommendation. Even then, explain uncertainty and leave the choice with them.

## Revision and choice

- Let the explorer question, rewrite, combine, or replace paths before choosing.
- For a replacement, replace only the requested path and preserve the other two unchanged. Commit a complete three-path set atomically and verify that all three remain distinct.
- When you combine paths, commit one complete three-path set atomically: preserve the uncombined sibling, add the merged path, and add a genuinely new third path. Combining never implicitly selects a path.
- If prestige, status, or an attractive identity is carrying a path, investigate that distortion and revise or replace the path without ranking the alternatives.
- Only an explicit explorer choice may activate one path. Do not treat interest, generic assent, or your own recommendation as selection.
- A contextual bare ordinal is an exact choice when it identifies one exact current path: resolve it against the canonical current three-path order without aliases or asking the explorer to repeat its generated name.

## State operations

- Use `propose-purpose-paths`, `replace-purpose-path`, or `combine-purpose-paths` only when that exact operation is currently exposed.
- Do not include `rank`, `score`, `equalWeight`, `selection`, or confirmation fields in model-authored path input. The deterministic reducer owns equal weighting, availability, activation, parking, lineage, and validation.
- Use `select-purpose-path` or `confirm-purpose-path-revision` only for the exact path and set the explorer explicitly chose after a completed prior presentation.
- After any operation, wait for the authoritative result. Reload the map, checkpoint, active tools, and module before continuing.

## Reply discipline

After `propose-purpose-paths`, `replace-purpose-path`, or `combine-purpose-paths` commits, final visible prose is only the localized framing immediately before the application-owned cards. In English use exactly: “Here are three directions to explore in service of your North Star. Each begins with a small, low-commitment project—a date with the work. The aim is to learn whether you want to keep going, not to make the project succeed.” In Spanish use the faithful fixture: “Aquí tienes tres direcciones que explorar al servicio de tu Estrella Polar. Cada una empieza con un proyecto pequeño y de poco compromiso: una cita con ese trabajo. El objetivo es descubrir si quieres seguir, no que el proyecto tenga éxito.” In any other language, translate that framing faithfully and concisely.

Do not repeat path names or any of the seven structured card fields in prose. Add no summary, recommendation, question, or footer invitation after the cards. Discussion-only replies may use normal concise prose while leaving every choice with the explorer.

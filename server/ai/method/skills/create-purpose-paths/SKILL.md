---
name: create-purpose-paths
description: Create and revise exactly three distinct Purpose Paths with equal weight and explorer-owned choice.
version: 1.1.6
---
# Create Purpose Paths

## Outcome

After Your North Star is confirmed, offer exactly three meaningfully distinct ways to serve it. A Purpose Path is a direction for exploration, not a job title, identity prediction, prestige ladder, or fit score. The explorer owns every consequential choice.

## Path contract

Each path must contain:

- a clear, concrete name;
- how it serves the confirmed North Star;
- what could become possible: a concrete, excitingly ambitious picture of the change this path could make for the people or cause named in the explorer's North Star if they chose to keep pursuing it. Give the explorer a reason to feel energized by the potential, without promising success or pretending the first project must achieve it. Make this motivating horizon distinct from how the path serves the North Star, the evidence it may fit, and the small first project; do not merely restate those fields;
- evidence for why it may be worth exploring;
- one clear question about what the explorer needs to learn through doing this work: their interest, energy, appetite for its daily tasks, or willingness to continue. Do not substitute a question about whether the project or business will succeed;
- a Path Project preview; and
- how a small starting version could fit the explorer's stated time, money, access, and other current constraints. Research specific economics, credentials, or legal requirements only when they genuinely affect that starting action; do not default to enterprise-scale compliance checks, income replacement, or speculative warnings before a low-stakes experiment.

Keep provider citation markers and source references out of every card field. Research citations belong in ordinary conversation, never in canonical Purpose Path data.

The set must contain exactly three distinct mechanisms for serving the same North Star. Give every path equal weight. Never rank, score, highlight, preselect, or recommend a path unless the explorer explicitly asks for a recommendation. Even then, explain uncertainty and leave the choice with them.

## Adaptive reflection before choice

- Read each reply for what the explorer is learning about the paths, their daily practices, the people they want to serve, and what fits their life. A partial rejection plus new information is material for revising the set, not a request to choose among the remaining cards. Reflect the specific implication before moving the conversation forward. If the explorer says they do not know which interest to choose, help interpret and shape options; do not repeat the choice or ask them to rank hypothetical activities.
- Use their current Foundation evidence, constraints, conversation, and any firsthand work. Notice expressed curiosity, voluntarily pursued work, energy for the practice, and hesitation about the practice versus its identity. Probe only the uncertainty that matters for the next proposal; do not administer another four-part questionnaire. Work they already pursue is evidence of engagement, but when they ask for a different path, do not keep it by default.
- Curate three paths the explorer could plausibly want to try through small projects within their real constraints. The paths must use distinct mechanisms and pose three distinct learning questions about the explorer's relationship to the work; one project should not answer all three. Do not fill a slot merely for topical variety or force a weak connection to the North Star.
- A new curiosity may be a tentative path without prior firsthand evidence or a declared commitment. Put the uncertainty and a small project inside the path; require no prior test before presenting it. Ask one focused question before drafting only when the missing answer changes the kind of path to propose. Otherwise make the best grounded proposal and let action create evidence.
- If a new interest suggests a different contribution to people or a cause than the confirmed North Star expresses, name the specific tension and invite North Star reflection. Do not force the interest into the three cards, automatically revise the North Star, or permanently set it aside. A new medium, subject, or skill that can credibly serve the existing direction can remain a path. If the explorer asks to revisit the North Star, use `open-foundation-revision-focus` when exposed; then follow Form the Foundation's revision and impact rules. Discuss a possible mismatch without a state change when the explorer has not asked to revisit it.

## Revision and choice

- Let the explorer question, rewrite, combine, or replace paths before choosing.
- For a replacement, replace only the requested path and preserve the other two unchanged. Commit a complete three-path set atomically and verify that all three remain distinct.
- When two or three paths need revision, use one `revise-purpose-paths` operation with the complete set. Preserve every unchanged path exactly, including its position, ID, and revision. Do not save an intermediate set while working through multiple changes.
- When you combine paths, commit one complete three-path set atomically: preserve the uncombined sibling, add the merged path, and add a genuinely new third path. Combining never implicitly selects a path.
- If prestige, status, or an attractive identity is carrying a path, investigate that distortion and revise or replace the path without ranking the alternatives.
- Only an explicit explorer choice may activate one path. Do not treat interest, generic assent, or your own recommendation as selection.
- A contextual bare ordinal is an exact choice when it identifies one exact current path: resolve it against the canonical current three-path order without aliases or asking the explorer to repeat its generated name.

## State operations

- If the checkpoint presents a basis review for a path set tied to a previous North Star, use `resolve-basis-review` with the exact target and `replaced`. Keep the old set in history. Once all pending reviews have been resolved and Foundation focus is closed, propose a fresh set of three paths for the newly confirmed North Star.
- Use `propose-purpose-paths`, `replace-purpose-path`, `revise-purpose-paths`, or `combine-purpose-paths` only when that exact operation is currently exposed.
- Do not include `rank`, `score`, `equalWeight`, `selection`, or confirmation fields in model-authored path input. The deterministic reducer owns equal weighting, availability, activation, parking, lineage, and validation.
- Use `select-purpose-path` or `confirm-purpose-path-revision` only for the exact path and set the explorer explicitly chose after a completed prior presentation.
- After any operation, wait for the authoritative result. Reload the map, checkpoint, active tools, and module before continuing.

## Reply discipline

After `propose-purpose-paths`, `replace-purpose-path`, `revise-purpose-paths`, or `combine-purpose-paths` commits, final visible prose is only this framing immediately before the application-owned cards: “Here are three possible paths to pursue your North Star. Each begins with a small, low-commitment project. Think of it like a date. The aim is to learn whether you want to keep going, not to make the project succeed.”

Do not repeat path names or any of the seven structured card fields in prose. Add no summary, recommendation, question, or footer invitation after the cards. Discussion-only replies may use normal concise prose while leaving every choice with the explorer.

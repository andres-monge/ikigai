---
name: design-path-project
description: Design and refine one first Path Project on the explorer's selected path.
version: 1.2.2
---
# Design a Path Project

## Purpose

Help the explorer turn their selected Purpose Path into exactly one first Path Project they want to try. The project creates firsthand evidence about whether they want to pursue more of that work.

Immediately after a committed path selection, use `propose-first-project` in the same assistant response. Selection authorizes this proposal; do not ask whether the explorer also wants a project. Invite refinement of the committed proposal without assuming acceptance.

## Design the project

Build on the confirmed North Star, the selected path's central work, central unknown and project preview, the explorer's preferences, and the evidence and practical circumstances available. Develop the preview into a concrete proposal and adapt it to what the explorer wants changed. Keep the project on the selected path.

Prefer an outcome the explorer personally wants. Otherwise, serve a firsthand beneficiary: someone they actually know and can learn from directly. A generic portfolio exercise for an imagined client is insufficient.

Point toward an excitingly ambitious outcome through a first version the explorer believes they can start within their time, money, access and responsibilities. Difficulty is never a test of worth. Use the information already available; clarify missing details during refinement when they would materially change the project, without inventing preferences or constraints.

Make the first version provide experience of the path's central work and a short feedback loop before a larger commitment. Its learning should concern the explorer's energy, satisfaction or desire to continue doing the work. Whether the result succeeds is a separate signal.

The saved brief contains:

- `title`: a concrete name for the project.
- `outcome`: what the explorer will make and what it should do or express.
- `audience`: the explorer or a firsthand beneficiary.
- `whyWanted`: why that outcome matters to them.
- `learningGoal`: the personal uncertainty this experience can help resolve.
- `firstVersion`: a useful, low-commitment version they believe they can start.
- `firstStep`: one concrete action to begin.
- `decisionQuestion`: one question about their experience of the work that will help them decide whether to pursue it further.
- `evidenceCue`: one simple observation or piece of firsthand feedback during or just after the first version that bears on that question.

## Refine or replace

The explorer may change the outcome, audience, scope, medium, first version, first step, learning question or evidence cue. Use `replace-project-proposal` to save the revised unaccepted proposal.

If they reject the project or want something different, offer one replacement rather than defending the old proposal. Keep one proposal in this onboarding flow; do not present three project options.

## Frame and accept the first project

Keep the required framing out of the initial proposal and any proposal the explorer rejects. When they indicate the current proposal is ready for acceptance, use `present-first-project-framing` once for that exact pending project. If they try to accept before the framing has appeared, present it and request acceptance in a later turn instead of calling `accept-first-project`.

Use this exact English pilot text as `framingText`:

The point of a project is not to succeed, it's to learn if it's something you'd want to pursue. Think of projects like dating: you start with something chill and low commitment, then invest more only if each date makes you want another.

Use `I explicitly accept this Path Project.` as `acceptancePhrase`. Supply one short, single-line `acceptanceQuestion` that contains that phrase and ends with one question mark. The phrase is reference copy; the explorer does not have to repeat it word for word.

After the framing operation commits, output exactly the persisted framing and question as two plain paragraphs: framing first, question second. Add no formatting or other text, and do not use this framing elsewhere.

Use `accept-first-project` only when a later explorer message unambiguously accepts the exact pending project after its framing was delivered in a completed prior assistant turn. Target the framing's presentation turn, not the original proposal turn.

Do not repeat delivered framing after reload or compaction. If its presentation failed or did not complete, use the framing operation again when exposed; never accept from a failed presentation.

This onboarding flow ends at first-project acceptance. Execution support, reflection and follow-on project choices belong to later stages.

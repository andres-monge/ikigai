---
name: design-path-project
description: Develop and refine projects the user wants to make and learn from.
version: 1.3.0
---
# Develop a Path Project

## Purpose

Turn a project idea into something the user wants to make, understands and can begin. Establish what the experience could teach them before expanding the plan.

For the first project, develop the preview in the selected Purpose Path. Selection authorizes one expanded proposal in the same assistant response through `propose-first-project`; it does not accept that proposal. Preserve its premise unless the user wants something different or a substantial change needs discussion.

## Develop the proposal

Use the user's preferences, available evidence, practical circumstances and the project's relationship to their chosen direction. Reuse what they have already supplied. Ask for missing information only when it would materially change the proposal.

The outcome must be something the user personally wants to create. It may benefit them or someone else. 

Help an ambitious idea become startable through a useful first version with an understandable stopping point. Suggest an early opportunity to experience the work and learn from it, without prescribing a deadline, compulsory sequence or maximum project size.

Keep the personal learning question concrete. Focus on what could give or drain energy in the actual work and whether that experience makes the user want more. A successful result alone cannot answer that question.

## Present the project

Always speak in simple, plain language. Supply a title and three concise sections in this order:

- **What you'll learn:** the personal question, with a simple cue for noticing energy drivers and drainers while making or trying the first version.
- **What you'll make:** the wanted outcome, what the first version should do or express, and its stopping point. Include who it is for and why it matters when helpful.
- **Suggested starting point:** a concrete, approachable first action. Name the tool, material or place to begin and explain unfamiliar basics as needed. Offer sufficient help to start without requiring the user to plan every later step.

The starting point is a suggestion the user can adapt. Further instructions develop through conversation at the level of detail they need.

Make starting easy. Meet the user at their actual level of knowledge. Explain unfamiliar tools or terms when needed. Make the first action clear enough that they do not have to research the basics or design their own starting plan before beginning.

Give enough practical detail to remove the immediate obstacle: where to start, what to use and what the first small result should look like.

Alongside the project, explain that Revelio will help them as they go: they can ask questions, seek advice, share progress or discuss getting stuck, and work out the next steps together. Use ordinary text, without a separate help card or a required choice of reply buttons. Invite a natural response in the text box.

## Refine or replace

Develop the proposal together. The user may change its outcome, audience, scope, medium, first version, starting approach or learning question. Use `replace-project-proposal` for changes to the unaccepted first proposal.

If they want a different project, offer one replacement without defending the previous suggestion. Apply the shared principles for informed disagreement; do not force a project into an inaccurate relationship with the path or North Star.

For a revision of an already accepted project, use the checkpoint's revision and later-confirmation flow. A suggested revision does not silently replace the accepted version.

## Agree on the project

Present the expanded project with what the user will learn first,
followed by what they will make and how to get started.

Invite refinement when useful. If the user has seen the current
proposal and clearly expresses an intention to proceed, record
acceptance using `accept-first-project` and continue. Natural wording such as “let’s do it” is sufficient; no prescribed phrase is required.

Accept only the specific current proposal the user has seen.
Selecting a path authorizes developing its project, but does not
automatically accept the expanded project.

If the user requests changes, revise the proposal. If their intention
is unclear, ask a natural clarifying question rather than recording
acceptance.

## Later projects

For every subsequent project decision after a completed learning loop, develop exactly three distinct, equally weighted project options. This applies both when the user chooses to explore the same path further and when they change directions and select another path. Ground the options in what they learned and want to experience next. Each uses the same learning-first brief.

Support refinement and replacement, and activate only the user's explicit selection. The first-project framing is not repeated for later projects.

Once the project is accepted or selected, ongoing practical support belongs to `guide-path-project`.

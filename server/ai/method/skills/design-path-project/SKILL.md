---
name: design-path-project
description: Design one grounded first Path Project for collaborative refinement and explicit acceptance.
version: 1.2.0
---
# Design a Path Project

## Outcome

For onboarding, propose exactly one first Path Project on the explicitly selected Purpose Path. Design it for real firsthand learning, refine it collaboratively, and replace it freely when the explorer is unconvinced. Do not present three project options until a later completed learning loop.

When this module becomes active immediately after a committed Purpose Path selection, call `propose-first-project` in that same assistant response and then present the committed proposal. The explorer's path selection authorizes this one proposal; do not stop to ask whether they also want a project.

## Project contract

The brief must say:

- what the explorer will make;
- why they might want the outcome;
- what it will help them learn;
- the low-stakes first version;
- the first step;
- one decision-relevant learning question; and
- one unobtrusive evidence cue.

Point toward an excitingly ambitious outcome through a first version the explorer believes they can start. Difficulty is never a test of worth. Prefer an outcome the explorer personally wants. Otherwise, serve a firsthand beneficiary: someone the explorer actually knows and can learn from directly. A generic portfolio exercise for an imagined client is not sufficient; redirect it to a wanted outcome or a real firsthand beneficiary.

## Refinement and replacement

- The explorer may revise outcome, audience, scope, medium, first version, first step, learning question, or evidence cue.
- If they reject the proposal or ask for something different, offer one replacement project. Do not defend the old proposal and do not produce a three-option carousel.
- Replacing an unaccepted proposal keeps this as Path Project 1. The deterministic reducer owns numbering, agreement status, lineage, and supersession.
- Accept only an unambiguous semantic acceptance in a later explorer message directed at the one completed project presentation. The main agent judges that message in its language; positive sentiment, hedging, questioning, quoting, conditional assent, and ambiguity are not acceptance.

## Required framing before acceptance

Do not use the framing in the initial proposal or before a proposal the explorer rejects. Once the explorer indicates that the current proposal is ready for acceptance, use `present-first-project-framing` once for the exact pending project and locale. Supply the exact framing text, one clear localized `acceptancePhrase` as presentation reference copy, and one short question that includes it. After its committed result, output exactly the persisted framing and question. The pending marker becomes delivered only when that exact visible response and the durable assistant turn complete together; a failed or malformed turn is re-framable. Acceptance can happen only after a later explorer message semantically accepts the project. This durable marker prevents repetition after reload or compaction.

That pre-acceptance reply has exactly two plain paragraphs: the locale-correct framing by itself, followed by one short question asking for explicit acceptance. Add no heading, quotation marks, preface, restatement, paraphrase, or second copy of the framing. Do not mention the framing anywhere else.

In an English conversation, use the following sentence as `framingText` exactly:

The point of a project is not to succeed, it's to learn if it's something you'd want to pursue. Think of projects like dating: you start with something chill and low commitment, then invest more only if each date makes you want another.

Use `I explicitly accept this Path Project.` as the English `acceptancePhrase` reference copy. The one-line `acceptanceQuestion` must contain that phrase and end with one question mark; the later message does not need to exact-match it.

In a Spanish conversation, use this faithful concise translation as `framingText` exactly:

El objetivo de un proyecto no es tener éxito, sino aprender si es algo que querrías seguir explorando. Piensa en los proyectos como en las citas: empiezas con algo relajado y de poco compromiso, y solo inviertes más si cada cita te deja con ganas de otra.

Use `Acepto explícitamente este Proyecto de Camino.` as the Spanish `acceptancePhrase` reference copy. The one-line `acceptanceQuestion` must contain that phrase and end with one question mark; the later message does not need to exact-match it.

For any other language, translate all five ideas faithfully and concisely: success is not the point; the project tests desire to pursue; projects are like dating; begin chill and low commitment; invest more only when each date creates desire for another. If the explorer tries to accept before the framing has appeared, give the framing and ask for explicit acceptance in the next turn instead of calling the acceptance operation. Do not repeat it after acceptance.

## State operations

- Use `propose-first-project` for the one initial proposal and `replace-project-proposal` for one new unaccepted proposal.
- Use `present-first-project-framing` exactly once only when the explorer says the current proposal is ready for acceptance. Its locale is the BCP 47 language tag mirrored from the explorer's latest message. Persist `framingText`, `acceptancePhrase`, and `acceptanceQuestion`; after it commits, emit only `${framingText}\n\n${acceptanceQuestion}` with no formatting or extra text.
- Do not expose or use follow-on project operations during the first-project decision.
- Use `accept-first-project` only after canonical state says the framing was delivered once in a completed prior presentation and the main agent judges an unambiguous semantic acceptance from the current explorer message. `acceptancePhrase` is reference copy, not an exact-match authorization gate. Target the framing presentation turn, not the earlier proposal turn.
- After any operation, wait for the authoritative result. Reload the map, checkpoint, active tools, and module before continuing. Acceptance may derive the later `guide-path-project` module; this three-module build must then stop rather than load an unregistered module.

## Reply discipline

Make the project concrete enough to begin and small enough to believe. Do not perform the core work whose experience should become the explorer's evidence. Ask for one refinement or explicit acceptance without pressure.

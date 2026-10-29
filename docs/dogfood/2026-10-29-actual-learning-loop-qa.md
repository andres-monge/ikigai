# Actual dedicated-account learning loop — 2026-10-29

**Overall: QUALIFIED, not full-journey PASS.** The authorized fictional QA continuation closed reflection, saved an explicit further-exploration choice and three follow-on options, and accepted option 2 without inferring work. All canonical transitions survived reload. Two user-facing failures remain: the options are absent from Chat, and the selection turn failed during final internal-context binding after saving.

The coordinator authorized both natural inputs and mechanical option-2 selection. This is test-scenario execution, not founder preference or product acceptance. Main served `fdceed8` (Interpret 1.0.2) from c615. The existing independently connected Chrome QA profile was verified against the dedicated account, revision 25, zero active leases and an empty draft before sending. The founder profile was not claimed.

## First actual continuation

The approved natural message endorsed the existing physical-arrangement versus lettering experience and explicitly requested another small project on the same path. It introduced no new completed work. The actual reply said it would build on that interest, referred to three equal options and asked which was most interesting. **It did not show the briefs or direct the user to Map.** No favorable retry or additional clarification was used.

Revision **25→30**, with five committed operations in order:

1. Append authored reflection evidence.
2. Close the existing reflection.
3. Record explicit desire to continue on the path.
4. Record the explore-further Next Move.
5. Propose exactly three equal follow-on options linked to that Next Move.

The original two learning records remain byte-equal, with one new authored observation. Reflection is Closed. North Star, path set and focus commitments are unchanged. The turn completed durably. **Six provider steps, five tool calls**, no search calls; request duration **91,691 ms**. This is observed whole-request duration, not normalized generation latency.

## Three saved options before selection

All three full briefs were captured privately from canonical state and actual Map **before selection**, then checked after reload. Each uses one ten-minute session within once-a-month availability, one existing postcard-sized sheet or folded scrap, zero purchases, no adhesive, no visitor testing and no lettering polish. These honor the latest limits expressed in the existing fictional conversation.

| Option | Actual title | Distinct work and learning question |
| --- | --- | --- |
| 1 | A Message at a Turning Point | Keep wording fixed and compare doorway/corner positions and approach angles; explore interest in deciding where a directional cue is needed. |
| 2 | A Self-Serve Materials Spot | Arrange a first-action message alongside two or three existing objects for an imagined workshop; explore the appeal of making message and materials work together. |
| 3 | A Tiny Museum Display | Pair one owned object with a short explanation and compare label placement; explore interest in curating an object/message relationship and the existing museum interest. |

**Bounded quality judgment: PASS for distinctness, learning alignment and constraints.** These are related experiments in physical communication with meaningfully different work: navigation, self-serve task arrangement and interpretation/display. They preserve the user's interest in arrangement while distinguishing it from cosmetic polish. Human judgment of whether they are compelling remains open.

**Chat presentation: FAIL (DF-17).** All three titles/briefs were absent in the actual Chat DOM before and after reload. Map displayed all three Available with equal weight. Correct Map data does not make Chat presentation pass: the reply asks the user to choose unseen options, without telling them to open Map. This could block a first user. The authorized mechanical selection proceeded using the valid saved Map options, not by assuming unseen generated content.

## Actual option-2 selection

The ordinary natural selection named **A Self-Serve Materials Spot**. It was sent once, after the complete preselection capture and reload. Revision **30→31** committed one `select-follow-on-project` operation from that exact current human action.

- Option 2 becomes **Accepted / Not started**, Project 2, with Guide a Path Project as current focus. No work report or inferred activity was added.
- Options 1 and 3 are Parked; neither was accepted.
- The previous sign project remains Completed and is Parked. Its brief and reported work remain readable under earlier projects.
- The closed reflection and all three observations remain readable. Prior durable turns and operation receipts remain unchanged.

**Saved-state selection/persistence: PASS.** Actual Map shows the selected project's full brief, Agreement Accepted and Work Not started after reload. The canonical map is byte-equal before/after that reload.

**Selection reply delivery: FAIL (DF-18).** The visible reply accepted the choice, suggested starting with the visitor's first action, and asked which existing objects could stand in for workshop materials. The model finished with `stop`, but the durable turn is Failed with `InternalContextBindingError`, `operationCommitted: true` and revision 31. The app showed “Your map was updated, but Revelio’s follow-up reply did not finish.” **Two provider steps, one tool call**, no search calls; whole-request duration **37,274 ms**. HTTP 200 here does not establish durable-turn success.

No Continue in Chat, resend, replay or favorable retry was performed. After reload the partial reply remains readable and the transient alert is absent, while the durable turn remains Failed. The restored failed-input draft was captured, then cleared back to the original empty composer before reload. No response to the objects question was invented.

## Bounded read-only diagnosis

**DF-17:** `client/src/pages/explore.tsx:138` attaches project briefs only from `map.projects` with delivered first-project acceptance framing; the memo at line 918 passes only `map.projects`. There is no Chat attachment path for `projectOptionSets`. Map separately reads those sets in `client/src/components/explore/method-map.tsx:260`. A bounded proposed fix is to attach the saved three-option set to its exact completed presenting Chat turn using shared brief presentation and equal weight. No new selection control, prose-generated cards or broader redesign is implied. No fix is authorized by this receipt.

**DF-18:** `server/routes/agent.ts:1340` obtains observed internal-context markers and reads recent provider items, with bounded attempts. At line 1733 an incomplete binding prevents durable completion. `server/ai/history.ts:458` requires exactly one provider item per expected marker. This failed turn retains two expected markers and a display projection, but the failed-attempt provider item pages were not captured. Current evidence does **not** identify which marker was missing or duplicated, or whether timeout, pagination or visibility caused the failure.

The new observation occurs on this follow-on selection. Those binding functions are unchanged by the reflection and theme patches; no unchanged-baseline reproduction establishes when the cause began. The prior test snapshot has one differently labeled ExternalProviderError failure and two cancellations, with no earlier same-class record. A next bounded ce-debug scope should inspect this exact failed turn's retained marker expectations and provider-page match counts under the current timeout, establish the cause and add the smallest regression before any change. Preserve the committed selection; no new learning, reset, resend, broad history repair or provider-identity rewrite.

## Integrity, evidence and handoff

Across **two human inputs**, the app executed **eight provider steps and six committed operations**. One durable turn completed; one failed after committing. Those counts must not be described as eight independent scenarios or a wholly passing conversation.

Read-only comparison verifies every founder row in maps, turns, operation history, conversation mappings and leases unchanged. All pre-existing dedicated-account durable turns/receipts, original learning, North Star, paths and focus commitments remain unchanged. Dedicated-account revision is 31, with 20 durable turns and 31 receipts; zero active leases. No historical turn, receipt or learning evidence was deleted or rewritten.

The QA session remains open, authenticated, in Chat with an empty composer and its original light theme/default viewport. Main 5173 remains the correct c615 process; lab 5174 is unchanged. No application code, prompt, build or tests changed in this evidence-only pass. No signout, founder account action, automatic repair, heartbeat, push, PR or deployment.

Private ignored `.context/revelio/live-loop-20261029/` retains exact inputs, `continuation-reply.txt`, `selection-reply.txt`, `three-briefs-before-selection.json`, complete Chat/Map captures and screenshots, before/after/reload canonical snapshots, request diagnostics and integrity results. Account identities, marker/item IDs, private inputs and pixels are not copied into Git.

The kernel loop and reload are verified; the actual user journey remains QUALIFIED by DF-17 and DF-18. Founder review of the actual options/replies and broader U7/MVP/U10/erasure acceptance remain open. These findings authorize no fixes automatically.

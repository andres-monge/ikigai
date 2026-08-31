---
name: form-foundation
description: Form a provisional Why I Work through an adaptive minimum-sufficient Foundation interview.
version: 1.0.2
---
# Form the Foundation

## Outcome

Help the explorer form a concise, provisional Why I Work that says whom or what their work serves and what they believe should be different. Reflection generates a useful possibility; it does not reveal a permanent identity. Do not propose Purpose Paths until the explorer has explicitly confirmed the Why through a later user action.

## Interview rules

1. Ask one short question per turn. Reuse everything the explorer has already supplied and never administer a fixed questionnaire.
2. Continue only until the evidence covers:
   - revealed fascination from doing;
   - importance and a point of view;
   - starting assets with concrete evidence when needed; and
   - the current reality boundary, including income, time, location, responsibilities, health, risk, or no current constraint.
3. Start with: “What activities pull you in so much that you lose track of time?”
4. Prefer doing evidence. Ask about watching, reading, or thinking only when doing evidence is absent or too weak; consumption is a fallback, not a co-equal checklist item.
   - If the explorer explicitly says they cannot name an absorbing activity, the next question asks only what they find themselves watching, reading, or thinking about for hours. Do not seek another doing example first, and do not re-ask meaning, assets, or constraints they already supplied.
5. Ask the ten-year meaningful-change question only when the explorer has not already supplied that meaning: “If you could fast-forward ten years, what meaningful change would you be proud you helped create?” Ask what should be done differently only when their point of view remains unclear.
6. Treat abilities as starting assets, never eligibility filters. If evidence is thin, ask what people already rely on them for and request a concrete example only when needed.
7. Record practical constraints without putting detailed economics into the Why itself. “No current constraint” is a valid reality boundary.
8. If status, praise, attention, or identity is visibly distorting an answer, you may ask what they would choose if those needs were already satisfied. Do not ask this routinely.

The quoted questions above are canonical English wording for an English conversation. In every other language, translate them faithfully and keep every user-facing word in the language of the explorer's latest message; never switch to English merely because an example is written in English.

## State operations

- Use `append-foundation-evidence` for each new supported evidence item and `record-reality-constraint` for a current constraint. Do not infer canonical evidence from a conversational recap.
- Once coverage is sufficient, use `propose-why` for one concise Suggested Why with `statement`, `serves`, and `pointOfView`. Do not keep interviewing merely to fill turns.
- A Suggested Why remains provisional. Discuss or revise it until a later explicit explorer message makes `confirm-why` available.
- After any operation, wait for the authoritative result. Reload the map, checkpoint, active tools, and module before continuing.

## Reply discipline

- When coverage is insufficient, acknowledge only what helps orient the next single question.
- When coverage is sufficient, present the Suggested Why concisely and invite refinement or explicit confirmation. Do not call it destiny, a calling, a diagnosis, or a fit score.
- Never preview, rank, or propose paths before a Why is confirmed.

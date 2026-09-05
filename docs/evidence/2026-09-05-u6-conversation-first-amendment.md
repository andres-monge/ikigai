# U6 conversation-first amendment evidence

Date: 2026-09-05
Scope: reopened U6 acceptance only. The earlier
`2026-09-03-u6-method-presentation-matrices.md` remains historical.

## Contract implemented

- Chat joins canonical `pathSets` to authenticated history only when
  `set.presentation.assistantTurnId === message.turn.turnId` and
  `message.isFinalAssistantItem === true`; the join deduplicates exact `set.id@set.revision`.
  History has no attachment field.
- A current completed Suggested set exposes exactly three `Start this path` buttons only when the
  canonical pending decision names the same set revision and both newest-history and workspace
  reads have completed. Historical, superseded, active, failed/cancelled-presentation, streaming,
  and Map placements are read-only.
- `MethodMap` accepts only `map`, retains canonical status/disclosure content, and contains no
  operation, prefill, busy-fieldset, focus, or empty-state action. Interaction ownership lists only
  `select-purpose-path` and `confirm-purpose-path-revision` as direct UI operations.
- One shared `PurposePathCard` preserves Path 01/02/03, teal/yellow/orange identity, black borders
  and hard shadows, and the seven direct bands in this order: identity, possibility, evidence,
  central unknown, first project, practical fit, action. Chat may supply one Start action; Map
  supplies none.
- Assistant text uses installed `react-markdown` with the fixed prose elements `p`, `h2`-`h4`,
  `strong`, `em`, `ol`, `ul`, and `li`. The only anchor is adapter-injected citation output after
  independent turn/item identity, whole-visible-message SHA-256, exact range/claim, unique literal
  single-text-node, and sanitized HTTPS checks. User text remains literal. Model links, images,
  HTML, SVG, iframe, code, table, blockquote, unsafe protocols, split claims, duplicate claims, and
  forged citation schemes produce no active/network element.
- Page-local attempts retain only correlation, start time, unresolved state, optional terminal
  receipt hint, and direct retry input. `Saving…` waits 500 ms. Exact receipts clear success/replay
  silently; rejection and pre-write cancellation clear silently; conflict, failure,
  commit-then-reply failure, and unknown-after-refetch share one persistent actionable error. No
  missing terminal is converted to `Failed`. An error originating while Your Map is active marks
  Chat; opening Chat clears the marker without clearing the error.

## Automated action and semantic evidence

Command:

```text
npm test -- client/src/components/explore/purpose-path-card.test.tsx client/src/components/explore/method-map.test.tsx client/src/components/explore/safe-message.test.tsx client/src/components/explore/explore-state.test.ts client/src/components/explore/interaction-ownership.test.ts client/src/pages/explore.test.tsx --run
```

Result: 6 files passed, 26 tests passed.

The focused assertions cover exact final-item attachment and exact-revision deduplication; a failed
turn without a final host; three current Chat Starts; zero Map/historical actions; exact direct
operation payload; disabled-until-refetch behavior; composer focus; delayed Saving and silent exact
receipt success; persistent conflict plus accessible unseen Chat marker; fixed seven-band order;
read-only card mode; restricted Markdown; whole-message citation safety; literal user text; and
interaction ownership. Draft preservation, microphone presence, and the existing Stop control are
also re-proved. Testing Library role/tab/tabpanel/heading/list/alert/status assertions supply
the automated accessibility-tree inspection and live-region evidence.

Cross-boundary command:

```text
npm test -- shared/streaming-schemas.test.ts server/ai/history.test.ts server/routes/agent.test.ts --run
```

Result: 3 files passed, 117 tests passed. This re-proves the U5 turn/final-item projection, browser
history schema, exact direct-operation route, and authenticated terminal presentation boundary used
by the U6 join.

Type and whitespace commands:

```text
npm run check
git diff --check
```

Result: both passed with no output errors.

## Responsive evidence

- The Chat transcript shell is `max-w-[82rem]`; every prose `SafeMessage` remains centered at
  `max-w-[38rem]`. Only `.purpose-path-comparison` uses the wider shell.
- `.purpose-path-comparison` establishes `container-type: inline-size` and defaults its direct-child
  `.method-path-grid` to one column. At `@container (min-width: 1000px)`, that grid becomes three
  equal `minmax(0, 1fr)` columns and each direct card spans the shared seven-row subgrid.
- The focused card/Map tests assert the container-query source, absence of the retired viewport
  breakpoint, exactly three direct card children, Path order, and one shared component.
- Pixel geometry at just-below/at-1000px was not executed in this return-to-caller run because the
  task explicitly prohibited a dev browser. That attended rendered-width check remains a caller
  gate; this document does not claim measured browser geometry.

## Test-first observation

Before production edits, the new shared-card test failed because the component did not exist and
the ownership test failed because `confirm-why` remained a third direct operation. The proof-first
command reported 2 failed files / 1 failed assertion plus the missing-module failure. After the
atomic Chat-Start/read-only-Map implementation, the focused command above is green.

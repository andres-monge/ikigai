# Purpose Paths presentation prototype

Fixture-only prototype for the U6 Purpose Paths comparison. This is the artifact the active
plan's Verification Contract names for the "Purpose Paths presentation" gate:

> `ce-prototype` artifact plus founder selection — one deterministic equal-weight comparison
> contract is selected before final component styling.

**This is not application code.** No live data, no model, no imports from `client/src`, no
runtime dependencies. Plain HTML, CSS, and a few lines of vanilla JS for the interactions the
avenues are actually testing.

## Open it

Any static server from this directory, or open `index.html` directly in a browser:

```bash
python3 -m http.server 8000 --directory docs/prototypes/revelio-purpose-paths
```

`index.html` is the exploration surface. `selected-single-view.html` is the outcome — the
presentation the founder selected, and the thing connected U6 implements.

> **2026-09-05 connected-product amendment:** the selected file remains the visual authority for
> numbering, colours, borders, band order, subgrid alignment, and equal weight. In the product,
> Chat alone may add one `Start this path` action to each currently eligible card; Your Map and
> historical cards are inspection-only. Rewrite, replace, combine, and questions now happen in
> conversation, so the prototype's other buttons document the earlier interaction exploration.

## Files

| File | What it is |
|---|---|
| `selected-single-view.html` | **The selected presentation.** D's mechanism without the depth control, in the product's own design language |
| `project-band-options.html` | The narrow second pass on the First project band — three ways of drawing the same tint |
| `index.html` | Exploration surface — the four avenues described, not ranked |
| `a-columns.html` | A — the option governs; go deeper into one path at a time |
| `b-dimensions.html` | B — the schema governs; compare one question across all three |
| `d-lockstep.html` | D — depth governs globally; equality enforced by the control |
| `e-week.html` | E — time governs; a lived week instead of a field set |
| `shared.css` | Token system for the four exploration avenues |

The letters are the avenue labels from the exploration and are not a ranking. C — one path at a
time with an equal rotation switcher — was scoped and not built. The four avenues use a separate
palette from the selected view; that direction was explored and rejected (see below).

## The contract this is testing

Every presentation shows the same three paths with the same content, so what is being judged is
the mechanism. Each path carries the seven elements Method R14 requires: a name, how it serves
the confirmed North Star, what could become possible, evidence it may fit, the central unknown, a first
project, and a researched view of how it would fit this person's life.

## Fixture explorer

38, software engineer, high-earning, burned out, feels trapped by lifestyle — one of the personas
already defined in this repo. Chosen because it stresses R17 hardest: economic viability, access,
and practical constraints are the live tension, so the researched life-fit element gets a real
workout instead of a token line.

Content is written to the Method contract and grounded in `docs/thesis.md` — action creates
self-knowledge, anti-prestige, paths are provisional rather than permanent callings. Each path's
life-fit names a real cost, so none of the three reads as the obvious answer.

## Scope

Accessibility beyond legible contrast and visible keyboard focus is deliberately deferred here;
connected U6 retains every accessibility obligation in the active plan. Nothing in this directory
is imported by the application, and the selected contract governs the connected implementation
rather than being copied into it.

---

## Selected presentation contract

**Selected: `selected-single-view.html`.** Avenue D's arrangement — all three paths visible at
once, nothing disclosed or hidden — with D's shared depth control removed, and rendered in the
product's existing design language. This is what connected U6 implements.

### Hierarchy

1. **The confirmed North Star sits above the three paths**, on the same white as the path bands,
   titled *Your North Star*. It is context for the comparison, not a fourth card competing with it.
2. **Three equal cards side by side**, each numbered `Path 01 / 02 / 03` and given its own colour.
   Numbering and colour are identification, not ranking — door one, door two, door three.
3. **Within a card, seven bands in a fixed order**, identical across all three paths: name and how
   it serves the North Star (in the coloured header), what could become possible, evidence it may fit,
   the central unknown, the first project, how it could fit your life, then the actions.
4. **Two of those seven bands are marked**, and marked identically: the central unknown (cream)
   and the first project (the path's own colour at 18%). Both carry 2px rules on both edges, flush
   to the card. The doubt and the thing you would actually do next are the two blocks a person
   acts on, so they get the same weight as each other and more than the rest.

### Equal-weight rules (Method R15)

These are structural, not a matter of discipline:

- **The three cards are one subgrid.** Every band starts at the same y-position in all three
  columns, so no path can be made taller or visually heavier by its own contents. Verified on the
  rendered result: band tops identical across all three columns, card heights identical, footers
  aligned.
- **Per-path colour identifies, it does not rank.** Teal, yellow, orange, in fixed positional
  order. Chosen so all three clear the same contrast floor with black text — measured 7.31:1,
  10.95:1 and 6.30:1 on the headers, and 15.37:1, 16.24:1 and 14.80:1 on the project bands. No
  path needed white text where the others had black, which would have been an asymmetry.
- **No score, badge, highlight, preselection, or recommended state.** Nothing is chosen until the
  explorer starts a path.
- **Identical optional action placement.** Current eligible Chat cards each carry one `Start this
  path` action in the seventh band, styled with that path's colour. Every read-only placement keeps
  the same empty seventh band so alignment and visual weight do not change.
- **Entrance animation is a staggered fade-up across the three cards** (60/180/300 ms), suppressed
  under `prefers-reduced-motion`. Sequence here is reading order, not preference order.

### Content density

- Each band is one short paragraph. The life-fit band is the only one allowed to run longer,
  because it carries researched numbers.
- The central unknown is a single question at display weight, one typographic rank above body.
- Nothing is truncated, collapsed, or behind a control. The whole comparison is legible in one
  pass without interaction.

### Interaction language

- The only connected card button is verb-led and exact: *Start this path*. Rewrite, replace,
  combine, questions, and every other decision stay in Chat conversation.
- Square corners, 2px black borders, hard offset shadow, press-down active state
  (`translate(2px, 2px)`, shadow to zero). Minimum 44px touch target.
- Starting uses the exact authenticated current presentation. Discussion or revision in Chat
  confirms or activates nothing until the explorer explicitly chooses.

### Design language

The product's existing retro-modern language, not a new one: DM Sans 700–900 display, Manrope
body, square corners, 2px black borders, `6px 6px 0` hard shadows, the ikigai palette
(`#4db6ac` / `#ffc107` / `#ff6b35`, cream `#fff9f3`, beige `#f6f4ed`).

**An earlier direction was built and rejected.** The four avenues under `shared.css` use a matte
grey-blue palette with no per-path colour, no numbering, and no entrance animation — three
self-imposed refusals that read R15 as forbidding all differentiation. The founder rejected that
reading: colour, numbering, animation, and buttons with personality do not create preference, they
create clear understanding. R15 forbids *ranking*, not *identity*. Those four files are kept as the
mechanism exploration they are; they do not describe the selected contract.

### Governed by

Method R13–R17, AE3–AE4, and KTD11 — deterministic components, no runtime-generated
visualization, `session-settled: user-approved`.

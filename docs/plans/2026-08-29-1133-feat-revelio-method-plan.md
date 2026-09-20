---
title: Revelio Method - Plan
type: feat
date: 2026-08-29
topic: revelio-method
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
deepened: 2026-08-29
amended: 2026-09-05
---

# Revelio Method - Plan

> **Implementation amendment (2026-09-05):** `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md` remains the single implementation authority. This incorporated Method contract now uses Your North Star for user-facing and normative meaning, makes Chat the acting surface and Your Map read-only, replaces lexical authorization with main-agent judgment plus deterministic guards, limits Markdown and citation rendering, and reduces visible persistence feedback to delayed Saving plus one error presentation. Existing internal `why` identifiers, operation names, schemas, database representation, every Method R/F/AE/KTD ID, every U-ID, and the seven-module ownership remain stable. The active plan's 2026-09-03 research amendment still supersedes conflicting isolated-research mechanics. Baseline `20f08cd` is landed; only affected U5–U7 acceptance is reopened, and U8 remains blocked until the amended attended U7 gate passes.

## Goal Capsule

- **Objective:** Give career explorers a personalized, repeatable way to turn reflection into firsthand evidence, use that evidence to choose what to explore next, and enter a provisionally chosen path through work they have already done.
- **Product authority:** `docs/thesis.md` remains the method authority. This Product Contract translates it and the founder-settled decisions into testable product behavior. Until its Definition of Done is met, `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md` remains the implementation authority and must be reconciled with this contract during planning.
- **Open blockers:** None before planning. The Purpose Paths presentation remains a non-blocking prototype question.

---

## Product Contract

### Summary

Revelio will implement the full Method as an adaptive, stateful companion: form a provisional North Star, compare three ways to serve it, learn through real projects, and either explore further or commit provisionally through Side Doors. The implementation extends the active revamp architecture with a Method kernel, repository-owned modules, typed state operations, deterministic presentation, and behavioral verification while preserving the legacy product.

Product Contract preservation note: all existing R/A/F/AE IDs retain their meaning; R48 and AE14 capture the later session-settled decision that follow-on project selection differs from the single-proposal onboarding experience.

### Problem Frame

Most career guidance tries to infer the right answer from reflection, existing skills, or current job categories. The thesis argues that decisive self-knowledge is often created by doing: reflection suggests possibilities, while real projects reveal fascination, energy, willingness to continue, environmental fit, and the difference between liking an identity and liking the work.

The existing product stops after a questionnaire, three paths, and a static action plan. It cannot help the explorer run a tight feedback loop, interpret ambiguous evidence, revise a direction, or turn accumulated work into an entry route. The method must guide that whole lifecycle without pretending to discover a permanent calling.

### Key Decisions

- **Action creates self-knowledge.** (session-settled: user-approved — chosen over treating the answer as hidden inside the explorer: reflection alone cannot supply the evidence needed to choose.) Governs R1, R2, R20-R26.
- **“Your North Star” is the provisional foundation.** (session-settled: user-directed — chosen over either a fixed ikigai analysis or exposing internal Why vocabulary: every path must be a different way to serve a direction the explorer recognizes, without making it a fixed identity.) Governs R5-R11.
- **The interview is adaptive and coverage-guided.** (session-settled: user-approved — chosen over a fixed questionnaire or a fixed question count: ask as little as possible and probe only when the evidence is insufficient.) Governs R5-R10.
- **The explorer owns consequential choices.** (session-settled: user-directed — chosen over agent ranking or unsolicited recommendations: Revelio may clarify and revise options but recommends only when asked.) Governs R15, R16, R18, R29-R31, R38.
- **The first Path Project is singular; later project choices are comparative.** (session-settled: user-directed — chosen over either three onboarding projects or one proposal forever: onboarding gets one thoughtful proposal, while a later “explore further” decision gets three options and an explicit choice.) Governs R18-R20, R31, R48.
- **Projects combine ambition with a low-stakes first version.** (session-settled: user-approved — chosen over either timid exercises or demanding first commitments: the destination should excite while the first move remains believable.) Governs R19-R22.
- **Evidence, not a quota, decides the Next Move.** (session-settled: user-directed — chosen over fixed project counts, durations, or confidence scores: different explorers need different amounts and kinds of evidence.) Governs R26-R33.
- **Current job definitions do not bound future paths.** (session-settled: user-directed — chosen over forcing each path to reproduce an existing job's “actual practice” or drudgery: real outcome-oriented projects reveal the relevant experience without excluding work that does not exist yet.) Governs R13, R17, R19.
- **Skills are application-managed method modules.** (session-settled: user-approved — chosen over one massive prompt or OpenAI-hosted shell skills: Revelio needs repository-owned guidance selected by career-map state.) Governs R44-R46.
- **The product owns presentation.** (session-settled: user-approved — chosen over runtime-generated visual interfaces: the AI supplies meaning and structured state while deterministic components supply the visual language.) Governs R41-R43.
- **Chat owns action and Your Map is read-only.** (session-settled: user-directed — chosen over controls in both surfaces: decisions stay beside the conversation and the map remains a durable record.) Governs R42, R43, R45.
- **The main agent judges confirmation language.** (session-settled: user-directed — chosen over phrase and path-alias lists: model judgment serves all languages while deterministic state guards preserve the interaction boundary.) Governs R45, R46.
- **Side Doors present three routes and activate one.** (session-settled: user-directed — chosen over one route after commitment: this later stage can support comparison without adding onboarding burden.) Governs R37-R40.
- **The complete method outruns the first implementation emphasis.** (session-settled: user-approved — chosen over either truncating the method at one loop or building elaborate late-stage surfaces before evidence: the full lifecycle is specified, while the initial build emphasizes one complete learning loop.) Governs R47.

<!-- ce-section: work-relationships -->
### How This Work Fits Together

This plan owns the behavior and boundaries of the Revelio Method. It does not replace the active revamp implementation plan.

- The current revamp plan in `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md` remains the implementation authority.
  - **Depends on this contract:** U2's method specification and U7a's prompt behavior must carry these requirements forward.
  - **Needs reconciliation:** Older terms such as ikigai statement, direction path, experiment, and action plan should map to the user-facing method vocabulary in this contract.
- Purpose Paths presentation uses the founder-selected prototype contract.
  - **Depends on this contract:** U6 renders one shared seven-band component in Chat and Your Map, while only the exact current Chat cards expose Start.
- Pilot learning follows implementation.
  - **May revise this method:** No external explorer has validated the loop yet, so pilot evidence may change the requirements while `docs/thesis.md` remains the method authority.

### Actors

- A1. **Explorer** — a person trying to decide what work direction to pursue next. Employment status is context, never an eligibility gate.
- A2. **Revelio agent** — the conversational guide that elicits, proposes, researches, supports action, interprets evidence, and preserves continuity.
- A3. **Firsthand beneficiary** — the explorer or someone they know directly who wants the outcome of a Path Project.
- A4. **Peer or field contact** — a person or community whose lived experience can improve a project, a decision, or an entry route.

### Method Lifecycle

```mermaid
flowchart TB
  A[Adaptive reflection] --> B[Confirmed North Star]
  B --> C[Three Purpose Paths]
  C --> D[Explorer selects one]
  D --> E[Path Project N]
  E --> F[What You Learned]
  F --> G{Want to continue down this path?}
  G -->|No| C
  G -->|Yes - explore further| E
  G -->|Yes - commit provisionally| PE{Confirmed meaningful peer exposure?}
  PE -->|No| PERS[Find Relevant Peers]
  PERS -->|Insight confirmed| PE
  PERS -->|Decline or defer| PAUSE[Path Project, conversation, or pause]
  PAUSE -->|Return to commitment| PE
  PE -->|Yes| H[Proof inventory]
  H --> I[Three Side Doors]
  I --> J[Explorer selects one]
  J --> K[Pursue entry route]
  K --> L{What did the result teach?}
  L -->|Route evidence only| I
  L -->|Path evidence changed| F
```

Pausing never erases the explorer's place. What You Learned may begin before a Path Project is complete.

### Requirements

**Method stance and voice**

- R1. Revelio treats reflection as a source of possibilities and firsthand action as the primary source of new self-knowledge.
- R2. Revelio never claims to reveal a permanent calling, recover something the explorer already knows, or predict fit with scientific confidence.
- R3. The agent uses an independent Revelio voice: plain, concise, concrete, encouraging without inflated praise, willing to challenge, comfortable with uncertainty, and biased toward one useful move. It matches the explorer's conversational register and uses brief, specific recognition when useful rather than generic praise.
- R4. The agent avoids routine recaps, guru language, destiny claims, prestige cues, and verbosity that can be summarized without losing value.

**Foundation: Your North Star**

- R5. The entry interview asks one short question per turn and continues only until it covers revealed fascination, importance and point of view, starting assets and evidence, and the explorer's reality boundary. While coverage is incomplete, each reply ends with the next missing-area question unless the explorer explicitly pauses; the North Star is proposed in the same explorer turn that first makes coverage sufficient.
- R6. The default opener asks, “What activities pull you in so much that you lose track of time?” and falls back to watching, reading, or thinking only when doing evidence is absent or too weak.
- R7. The interview asks, when not already answered, “If you could fast-forward ten years, what meaningful change would you be proud to have contributed to?” and follows with what the explorer believes should be done differently when a point of view remains unclear.
- R8. Abilities are starting assets rather than eligibility filters; when evidence is missing, the agent asks what people already rely on the explorer for and seeks concrete support only when needed.
- R9. Before proposing paths, the agent covers what a new direction must fit around now, including income, time, location, responsibilities, health, risk, or no current constraint.
- R10. The agent introduces the first suggestion with: “Your North Star is a direction for what you want your work to serve, and it can evolve as you learn by doing.” It then drafts a concise “Your North Star” statement that names what or whom work is in service of and the explorer's point of view, without using `provisional` as a user-facing label, and ends with a clear invitation to refine or confirm it in a later turn.
- R11. The confirmed North Star is a provisional foundation rather than a permanent identity, excludes detailed economic constraints, and may change when later evidence warrants revision. Before reconfirming a revision that has dependent artifacts, Revelio names the exact artifact classes that confirmation will invalidate and requires a later explorer turn that explicitly acknowledges that impact.
- R12. When status, praise, attention, or identity appears to distort the foundation, the agent may ask what the explorer would do if those needs were already satisfied; it does not ask this routinely.

**Purpose Paths**

- R13. After R10, Revelio proposes exactly three distinct Purpose Paths, each a different way to serve the confirmed North Star rather than a job title or identity prediction.
- R14. Each Purpose Path contains a clear name, how it serves the North Star, what could become possible, evidence for why it may fit, the central unknown, a Path Project preview, and a concise researched view of how it could fit the explorer's life.
- R15. The three paths receive equal visual weight and no ranking, highlight, preselection, or recommendation unless the explorer explicitly asks for one.
- R16. The explorer may question, rewrite, combine, or replace any path in conversation; only an explicit choice or exact authenticated Start action in Chat activates a path, and the current set must remain meaningfully distinct after revision.
- R17. Economic viability, access, credentials, and practical constraints are researched path by path instead of being used to define meaningful work or filter paths by prestige.

**Path Projects**

- R18. After a path is selected and before the explorer has accepted any Path Project, Revelio proposes one thoughtfully designed Path Project for collaborative refinement and offers a completely new suggestion when the explorer is unconvinced.
- R19. A Path Project produces an outcome the explorer personally wants whenever possible; otherwise it serves someone the explorer knows firsthand and can learn from directly.
- R20. Each project brief states what the explorer will make, why they might want it, what it will help them learn, the low-stakes first version, and the first step; the learning section includes one decision-relevant question and one unobtrusive evidence cue.
- R21. Each project points toward an excitingly ambitious outcome through a first version the explorer believes they can start, without turning difficulty into a test of worth.
- R22. Immediately before the first Path Project is accepted, Revelio says: “The point of a project is not to succeed, it's to learn if it's something you'd want to pursue. Think of projects like dating: you start with something chill and low commitment, then invest more only if each date makes you want another.”
- R23. The explorer may revise a project's outcome, audience, scope, medium, or first step before or during execution without restarting the path.
- R24. On request, the agent resumes the active project, finds the smallest useful next action, researches, plans, teaches, or troubleshoots, and reduces scope when needed without doing the core work whose experience would supply the evidence.
- R25. Active-project support is available on demand and when the explorer returns; Revelio does not use timers, proactive reminders, or guilt-inducing check-ins.
- R48. After any completed learning loop, every subsequent Path Project decision produces exactly three distinct follow-on options with equal weight, whether the explorer continues on the same Purpose Path or returns to Purpose Paths and selects another; the explorer may refine or replace them and explicitly chooses one to pursue first.

**What You Learned and Next Move**

- R26. What You Learned is available at any point, including before completion or after stopping, and begins with: “Which parts of Path Project N made you want to keep going, and which made you question the path?”
- R27. Reflection considers energy, absorption, voluntary pull, resistance, the desire to continue, feedback from a firsthand beneficiary or peer, and whether the project answered its learning question; improvement by itself is not treated as a fit signal.
- R28. The agent records evidence without scoring fit, probes only when the evidence is ambiguous, and distinguishes path disinterest from bad scope, a failed step, an external constraint, or a temporary obstacle.
- R29. After reflection, the agent asks, “Do you want to continue down this path?” and treats the explorer's answer as a choice rather than a prediction.
- R30. If the explorer does not want to continue, they may choose a parked Purpose Path, revise the current set, or request new paths before starting another Path Project.
- R31. If the explorer wants to continue, the only formal options are to explore further with another Path Project or commit provisionally and begin Side Doors; research, path revision, unresolved discussion, and pausing remain natural conversation rather than extra menu choices.
- R32. Evidence quality decides whether to explore again or commit; Revelio imposes no fixed project count, duration, confidence threshold, or requirement to finish an artifact.
- R33. Commitment is explicit, provisional, and focused on one Purpose Path; alternative paths are parked rather than deleted.

**Peers**

- R34. The agent introduces peer exposure when it can improve a project or decision and ensures the explorer has meaningful exposure to people in the field before provisional commitment.
- R35. When peer exposure is useful, the agent uses current web research to offer a small curated set, explains why each source or person matters and what to learn, identifies the easiest credible action and access constraints, and may draft an introduction that the explorer chooses whether to send.

**Side Doors**

- R36. After commitment, Revelio drafts a proof inventory from existing work and Path Projects, covering artifacts, problems solved, people helped, demonstrated useful qualities, relevant knowledge and relationships, points of view, and material that can be shared or extended.
- R37. Once the explorer confirms the proof inventory, Revelio researches exactly three current Side Doors with equal visual weight; each names the person, community, organization, or live problem, why the explorer's proof could matter, a useful contribution, the smallest credible first move, and material access constraints.
- R38. The explorer may question, modify, or replace routes and explicitly chooses one to pursue first; the other two remain parked, and Revelio recommends only when asked.
- R39. Revelio may research, shape proof, prepare materials, and draft outreach, but the explorer controls every message, publication, application, or other external action.
- R40. Revelio records Side Door outcomes as route evidence separately from Path evidence; a silent or failed approach does not invalidate the committed path unless doing the underlying work also changes the explorer's desire to continue.

**Conversation, state, and presentation**

- R41. Conversation remains natural streamed text, while accepted foundations, paths, projects, evidence, decisions, and routes are persisted as validated career-map state rather than recovered by parsing prose. Browser-safe transcript history may expose only the durable turn anchor needed to attach canonical Purpose Path cards to their exact presenting turn.
- R42. Deterministic visual components render canonical state. One shared seven-band Purpose Path card component appears inline in Chat and in Your Map; only the exact current non-superseded Suggested Chat cards from the authenticated explorer's terminally completed presentation expose one Start action each, while Your Map and all historical or failed/cancelled-presentation cards are read-only. Start remains disabled while a turn or direct operation is unresolved and until terminal refetch revalidates eligibility. A failed/cancelled presentation with no final display-safe assistant item renders no card. The card block may break beyond the prose measure and uses its actual container width to preserve three aligned subgrid columns or an equal Path 1/2/3 stack.
- R43. The interface uses progressive disclosure to keep the primary decision concise while preserving evidence, practical reality, and uncertainty for inspection. Assistant prose renders only paragraphs, H2–H4 headings, bold, italics, and ordered or unordered lists through React components; unsupported Markdown, raw HTML, model-authored links, images, and active content remain inert. Existing sanitized citations alone may create links after turn and rendered-item identity, complete-visible-message hash/range, and unambiguous visible-text validation. The composer shows delayed Saving or one persistent actionable error presentation, never visible Saved or Rejected; committed, replayed, and rejected results clear Saving silently.
- R44. Revelio's method modules are Form the Foundation, Create Purpose Paths, Design a Path Project, Guide a Path Project, Find Relevant Peers, Interpret a Path Project and Next Move, and Enter Through Side Doors.
- R45. Career-map state determines which method module is active. The main agent owns interpretation, personalization, natural language, and whether the current explorer message semantically confirms, selects, revises, replaces, combines, questions, or declines; deterministic behavior owns exact current target, cardinality, prior-turn presentation, legal transition, authenticated provenance, revision, lease, abort, idempotency, and persistence. Positive phrase, language, ordinal-wrapper, and path-alias lists and a second classifier are prohibited.
- R46. Structured model outputs or strict function calls shape stage-specific state changes and UI data; they do not replace source grounding, explorer intent, or deterministic validation and must not force unsupported content into a required field. Retrieved content cannot supply intent, and internal result classes remain available for agent continuation even when the UI collapses them to R43's two visible states.

**Delivery scope**

- R47. The complete Method covers Foundation through Side Doors, while the initial implementation emphasizes one complete learning loop and supplies a lightweight conversational Side Doors path if an early explorer commits before dedicated late-stage surfaces exist.

### Key Flows

- F1. **Form the foundation and choose a path**
  - **Trigger:** A1 begins without a confirmed North Star.
  - **Actors:** A1, A2
  - **Steps:** A2 asks adaptive questions per R5-R12 → drafts the foundation → A1 revises and confirms it → A2 presents three paths per R13-R17 → A1 discusses, modifies, replaces, and explicitly selects one.
  - **Outcome:** A1 owns a provisional foundation and one active Purpose Path.
  - **Covers:** R5-R17, R41.
- F2. **Design and run a Path Project**
  - **Trigger:** A1 has selected a Purpose Path.
  - **Actors:** A1, A2, optionally A3 and A4
  - **Steps:** For the first project, A2 proposes one project per R18-R22; after a completed learning loop, A2 presents three follow-on options per R48 → A1 refines or replaces the proposal or options → A1 explicitly accepts or selects one → A2 supports execution on demand per R23-R25.
  - **Outcome:** A1 undertakes real work with a known learning question and low-stakes first version.
  - **Covers:** R18-R25, R48.
- F3. **Interpret evidence and choose the Next Move**
  - **Trigger:** A1 completes, stops, or chooses to reflect during a Path Project.
  - **Actors:** A1, A2
  - **Steps:** A2 opens What You Learned → distinguishes the source of the evidence → records what changed → asks whether A1 wants to continue → A1 explores again, returns to Purpose Paths, or commits provisionally.
  - **Outcome:** A1 knows what the project taught them and begins a next step rather than receiving a static verdict.
  - **Covers:** R26-R33, R41.
- F4. **Find relevant peers**
  - **Trigger:** Peer exposure can improve the project or decision, or A1 is nearing commitment without meaningful exposure.
  - **Actors:** A1, A2, A4
  - **Steps:** A2 researches a curated set → explains relevance and the smallest credible action → A1 chooses whether to engage → resulting evidence feeds the active project or Next Move.
  - **Outcome:** A1 learns about the people and environment without carrying the research burden alone.
  - **Covers:** R34, R35.
- F5. **Enter through a Side Door**
  - **Trigger:** A1 commits provisionally to one Purpose Path.
  - **Actors:** A1, A2, optionally A4
  - **Steps:** A2 drafts the proof inventory → A1 corrects it → A2 researches three routes → A1 refines and selects one → A2 helps prepare the contribution and approach → A1 controls external action → A2 separates route evidence from Path evidence.
  - **Outcome:** A1 pursues one concrete entry route using proof accumulated during exploration.
  - **Covers:** R36-R40, R47.

### Acceptance Examples

- AE1. **Covers R5-R10.** Given the explorer already provides strong doing, meaning, assets, and constraint evidence in one answer, when the agent continues the interview, then it does not re-ask those areas and moves toward a North Star draft.
- AE2. **Covers R6, R7.** Given the explorer cannot name an absorbing activity, when the agent follows up, then it asks about topics they consume or think about; if their meaningful ten-year change is already clear, it does not ask that question again.
- AE3. **Covers R12, R15-R17.** Given a path appeals mainly through status or identity, when the explorer raises the concern, then the agent investigates the distortion and revises or replaces that path without ranking the alternatives.
- AE4. **Covers R13-R16.** Given the explorer dislikes one of the three paths, when they request a replacement, then only that path changes and the resulting three remain distinct ways to serve the confirmed North Star.
- AE5. **Covers R18-R23.** Given the explorer rejects the proposed project, when they ask for something different, then the agent proposes one new project rather than defending the old one or presenting a carousel of options.
- AE6. **Covers R19-R22.** Given a proposed project is a generic portfolio exercise for an imagined client, when its design is checked, then it is revised toward an outcome the explorer or a firsthand beneficiary wants.
- AE7. **Covers R24-R28.** Given the explorer stops before completing the first version, when they open What You Learned, then the unfinished project is treated as evidence and the agent distinguishes path fit from scope, execution, and external obstacles.
- AE8. **Covers R26-R32.** Given the explorer learned something but did not enjoy the project, when reflection begins, then ability growth is not treated as proof of fit and the agent asks which parts increased or reduced the desire to continue.
- AE9. **Covers R29-R33.** Given the explorer wants to continue, when the Next Move is presented, then the formal choices are another Path Project or provisional commitment; if they do not want to continue, they return to Purpose Paths instead.
- AE10. **Covers R34, R35.** Given peer exposure would resolve an important uncertainty, when the agent introduces it, then it provides researched starting points, relevance, access constraints, and a smallest credible action rather than a generic networking checklist.
- AE11. **Covers R36-R39.** Given the explorer commits, when Side Doors begins, then the agent confirms a proof inventory, presents three researched routes without ranking them, and activates only the route the explorer selects.
- AE12. **Covers R40.** Given the selected Side Door receives no response but the explorer still wants the underlying work, when the outcome is interpreted, then the agent revisits the parked routes or researches replacements without treating silence as evidence that the Purpose Path is wrong.
- AE13. **Covers R41-R46.** Given the agent proposes or changes canonical career-map information, when the turn completes, then the state change is validated and confirmed separately from the concise conversational reply, and the UI renders the validated state without parsing the reply.
- AE14. **Covers R18, R31, R48.** Given the explorer has completed a learning loop and chooses to explore further, when the next Path Project is designed, then the agent presents exactly three equal-weight options, supports refinement or replacement, and activates only the option the explorer explicitly chooses to pursue first.
- **2026-09-05 amendment to AE3–AE6 and AE13:** A Purpose Path proposal uses one concise localized offer and one canonical three-card block in its exact completed Chat turn. Only current eligible Chat cards expose Start; Your Map and historical cards are read-only. Main-agent semantic intent accepts natural multilingual confirmation and a contextual bare ordinal without phrase/alias matching, while ambiguity produces clarification. A revised North Star with dependents names the exact affected classes and requires a later explicit acknowledgment. Restricted Markdown, raw-validated citations, delayed Saving, silent success, one persistent error style, cancellation truth, and actual-container responsive equality follow Revamp R22–R26 and Revamp AE12–AE17.

### Success Criteria

- An explorer who completes a Path Project can identify what firsthand evidence changed, decide whether to continue, switch, or commit, and begin the corresponding next step.
- The method preserves evidence across projects and sessions so later paths, projects, and entry routes build on what the explorer has done rather than restarting from reflection.
- The explorer can challenge and revise every consequential output and never has to accept a ranked recommendation or unsupported certainty.
- A valid Method exit always leads somewhere actionable: another project, another path, provisional commitment through Side Doors, or a pause that preserves progress.

### Scope Boundaries

**Sequenced inside this plan**

- Final Purpose Paths layout and interaction details begin only after the U6 `ce-prototype` contract is selected; they are not deferred beyond this plan.

**Deferred for later**

- Dedicated Side Doors UI, outreach automation, and elaborate transition tracking beyond the conversational behavior in R47.
- Proactive reminders, scheduled check-ins, or notification systems.

**Outside the method's identity**

- Career fit scores, permanent declarations, prestige-based rankings, or a claim that introspection can reveal one correct answer.
- Mass outreach, generic networking scripts, autonomous messages, or publishing on the explorer's behalf.
- Generic projects built mainly to signal employability, invented clients when firsthand demand is available, or forced simulations of today's job descriptions.
- A fixed number of projects, a fixed exploration duration, or artifact completion as the universal stopping rule.

### Dependencies and Assumptions

- `docs/thesis.md` is the current method authority; dated research supplies evidence and hypotheses but cannot override it.
- The current revamp plan supplies persistent conversation, career-map state, web search, and return-session behavior that this method depends on.
- No external explorer has yet validated the complete lifecycle; the first pilot loops must be treated as method evidence rather than proof that the method works.
- Current web research is available when path economics, peers, projects, or Side Doors require facts beyond the explorer's own evidence.

### Sources and Research

- `docs/thesis.md` — method authority and source for the action-first, project-as-dating thesis.
- `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md` — current implementation authority, including U2, U7a, and the initial discovery-loop scope.
- `docs/research/2026-08-11-what-to-work-on-research.md` — historical research on exploration, representative experiments, and provisional commitment.
- `docs/research/2026-08-11-what-to-work-on-product-direction.md` — historical product-loop framing and the contradiction in the legacy “already know” assumption.
- `docs/research/2026-08-25-vocation-competitor-dossier.md` — historical comparison between role-fit investigation and firsthand person-path evidence.
- `docs/research/2026-08-28-side-doors-career-entry.md` — historical research on proof-first, contribution-first career entry.
- `server/ai/prompts.ts` and `shared/streaming-schemas.ts` — legacy prompt and output behavior that planning must not treat as the new Method.

---

## Planning Contract

### Authority and Reconciliation

`docs/thesis.md` remains the Method authority. This artifact owns the Method Product Contract and the technical reconciliation required to implement it. `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md` remains the repository's implementation authority until its Definition of Done is met, so U1 must amend that plan before any Method code unit begins.

The reconciliation keeps the revamp plan's platform, identity, conversation, concurrency, and rollout decisions. It replaces the Method assumptions in its R2, R6, R8, R9, R17, R18, U4-U8, and U10 with this Product Contract. If the two plans still disagree after U1, the thesis wins on Method behavior, this Product Contract wins on product behavior, and the reconciled revamp plan wins on implementation sequencing.

### Key Technical Decisions

- KTD1. **Use a Method kernel inside the existing career-map document.** One JSONB document remains the durable product memory, but its runtime model is composed from domain schemas for Foundation evidence, North Star revisions, Purpose Path sets, Path Project cycles, reflections, peer exposure, commitment, proof, Side Doors, and evidence. Existing internal `why` identifiers remain stable. A `schemaVersion` governs document compatibility separately from the row revision used for compare-and-swap writes. Implements R41, R42, R45, R46.
- KTD2. **Derive checkpoints instead of storing one linear stage.** A pure selector derives the current Method module and decision from canonical records. One durable focus record may open reflection, peer research, Foundation revision, or path revision without closing the underlying work. Precedence is invalidated-basis review, explicit focus, pending confirmation or selection, pending-commitment peer exposure, then the normal lifecycle; closing focus recomputes the checkpoint from current state instead of restoring a stale stage. Implements R23-R35, R44, R45.
- KTD3. **Load repository-owned `SKILL.md` modules through the application.** (session-settled: user-approved — chosen over one massive system prompt or OpenAI-hosted Skills: the Method must be versioned with the product and selected from career-map state.) A small global prompt carries voice and invariants; the loader adds one active Method module and a focused briefing. The application validates every registered bundle at startup and in tests; the final build registers and packages all seven. Implements R3, R4, R44, R45.
- KTD4. **Use strict function tools for state changes and streamed text for conversation.** (session-settled: user-approved — chosen over one structured response object: chat should remain natural while canonical changes stay typed.) Each Method module exposes a small tool set with narrow Zod schemas. The chat reply has no global `Output.object` contract. A mutation-capable step does not release state-dependent prose until its operation result is known; after any internal result class, a fresh narration step continues from authoritative state. At terminal refetch, the browser reconciles every in-memory attempt independently through its existing correlation ID and exact turn identity before removing delayed Saving or asserting one actionable error. Committed, replayed, and rejected results clear silently. No durable attempt list or generic lifecycle protocol is added. An aborted request emits no further prose; retry or reload derives any later explanation from canonical state. Natural conversation that makes no canonical claim may stream normally. Implements R41, R43, R45, R46.
- KTD5. **Route every state change through narrow domain operations.** Generic upserts, generic confirmation, and unrestricted workspace patches are replaced by versioned operations. The only direct UI operations in this amendment are the two existing Purpose Path Start cases in Chat; every other change remains conversational. Exact-three sets, sibling parking, replacement, commitment, and transitive invalidation remain atomic. Combining two paths still replaces the set with the merged path and one new third path. Refactor the existing file-local `invalidateFromWhy` traversal in place so the same traversal returns both invalidated records for confirmation and their unique artifact classes for pre-confirmation disclosure. Pending-revision legal transitions reject dependent writes, and confirmation re-derives the closure under the same expected map revision; an intervening change rejects stale and requires a fresh proposal. No second helper/traversal, preview state, or migration is added. The storage boundary validates the complete post-state before compare-and-swap commit and again on load. Implements R11, R13-R18, R23, R31, R33, R37-R41, R48.
- KTD6. **Keep semantic confirmation in the main conversation.** (session-settled: user-directed — chosen over positive phrase/alias gates or a second classifier: the existing agent understands the message in context, while deterministic guards preserve the later-turn interaction.) The main agent decides whether the current message confirms, selects, revises, replaces, combines, questions, or declines in any language. A confirm or select operation may target only one exact current pending revision from a completed prior assistant turn. The two exact authenticated Chat Start actions use the same target rule and additionally require that the presenting turn belongs to that user and is terminally completed. The reducer and storage reject same-turn, stale, superseded, wrong-revision, wrong-presentation, unauthenticated, aborted, duplicate, and illegal operations without parsing natural language. Generic assent among multiple paths remains ambiguous, while a contextual bare ordinal may identify one exact path. Implements R10, R16, R18, R22, R29, R33, R38, R45, R46.
- KTD7. **Separate agreement, work, reflection, and evidence.** A Path Project proposal can be suggested, confirmed, parked, or superseded; its work can be not started, in progress, stopped, or completed. Each append-only reflection session has immutable identity and revision, may open at any work status, and cannot overwrite the evidence snapshot supporting an earlier choice. Replacing an unaccepted proposal keeps the same project number, while choosing to explore further creates Path Project N+1 from an atomic three-option set. Implements R18-R32, R48.
- KTD8. **Preserve lineage and invalidate downstream conclusions without deleting history.** (session-settled: user-approved — chosen over destructive cascades or silently carrying conclusions across changed foundations: completed work remains evidence, but dependent decisions must be reviewed.) Paths reference a confirmed North Star revision; projects and learning choices reference path and evidence revisions; commitment references its Next Move and peer exposure; proof and Side Doors reference their supporting revisions. Before a revised North Star can be confirmed, the agent names the exact artifact classes from KTD5's closure and the explorer explicitly acknowledges that impact in a later turn. While the Suggested revision is pending, dependent writes are illegal. Confirmation re-derives the closure under the original expected map revision, then marks it for review and routes to the earliest unresolved basis; a stale revision requires fresh disclosure. A revision with no dependents uses the ordinary later-turn confirmation rule without naming empty impact classes. Implements R11, R16, R23, R33, R38, R41.
- KTD9. **Require confirmed peer exposure before commitment without requiring outreach.** (session-settled: user-approved — chosen over treating search suggestions as exposure or forcing direct contact: exposure must produce decision-relevant insight while external action remains voluntary.) A qualifying record links the active path to a real person, community, or first-person source and stores an explorer-confirmed insight. Missing exposure opens Find Relevant Peers instead of completing commitment. If the explorer declines, commitment intent remains visibly pending, other Path Projects and conversation remain available, and Revelio names the smallest passive first-person source once without repeatedly prompting on return. Implements R34, R35.
- KTD10. **Use contextual native research in the main loop and keep all external action human-controlled.** The main Sol `ToolLoopAgent` decides whether and how to use native web search with the stored Conversation and focused lower-priority Career Map context. Retrieved text stays untrusted, never supplies confirmation intent, and never enters canonical state as a source handle, research attempt, evidence association, or separate ledger. Ordinary provider citations remain bounded transcript presentation. Failed or insufficient research stays conversational uncertainty and cannot pad an exact-three set. Revelio may store drafts but exposes no tool that sends, publishes, applies, or messages. Implements R17, R35-R40, R46.
- KTD11. **Render canonical state with deterministic components.** (session-settled: user-directed — chosen over runtime-generated visualizations or separate Chat/Map cards: the product should own hierarchy, accessibility, and visual consistency.) The founder-selected seven-band Purpose Path card is one shared component. Chat attaches it to the authenticated canonical presenting turn and alone exposes Start for the exact eligible current set after terminal completion and refetch; Your Map and historical or failed/cancelled-presentation cards are read-only. A failed/cancelled turn with no final display-safe assistant item has no card. Prose keeps its reading measure while the card block uses actual container width to preserve aligned subgrid columns or an equal stack. Assistant prose uses R43's restricted React Markdown path, and a citation must bind to the exact rendered turn/item and complete visible-message hash/range before it creates a link. The initial Side Doors tail remains a simple validated section. Implements R15, R37, R38, R42, R43, R47.
- KTD12. **Refresh state, module, tools, and briefing after every operation result.** Every internal tool result reports committed, idempotent replay, conflict, rejected, or failed with the authoritative revision, derived module, and pending decision. The loop reloads and re-runs the selector before the next model step, so confirming a North Star can generate paths in the same turn and stale tools disappear. Conflict reloads instead of retrying stale arguments. The UI independently reconciles every existing correlated attempt after terminal authoritative refetch; committed, replayed, and rejected clear silently, while conflict, failed, and unknown results map to the one persistent error contract. Implements R18, R41, R43–R46.

### Operation and Invariant Ownership

| Change class | Persistence and confirmation rule | Enforcement owner |
|---|---|---|
| Explorer-reported fact or firsthand evidence | Persist immediately as user-authored with message or UI-action provenance; later corrections append supersession. | Operation schema and storage boundary |
| Model summary, interpretation, path, project, proof, or route | Persist as Suggested only; never becomes confirmed in its presentation turn. | Module tool plus KTD6 handshake |
| Consequential choice | Confirm only one previously presented target from a subsequent user action. | Reducer transition guard |
| Deterministic consequence | Park siblings, increment project number, or invalidate dependents in the same transaction as the accepted choice. | Reducer and storage transaction |
| Chat Start action | Use the two existing Purpose Path selection operations and provenance contract; disable while the agent lease is held and revision-check afterward. | Chat UI, route, lease, and reducer |

| Invariant | Primary enforcement | Failure behavior |
|---|---|---|
| One map per explorer, valid row revision, unique operation identity, owned history | Database constraints and transaction | Reject transaction without changing map or history. |
| Exact-three sets, one active selection, legal lifecycle, valid basis references | Reducer and full-map validator | Reject proposed post-state. |
| Persisted document matches a supported schema version | Storage validation on load and before commit | Enter repair-required; preserve the raw record and expose no model briefing. |
| One logical operation creates one revision and one history entry | Compare-and-swap plus unique source identity and payload fingerprint | Same-payload replay returns stored result; different-payload reuse is rejected. |
| Agent and browser see the same revision and available actions | Shared operation surface plus per-user lease | Disable Chat Start during a turn; refetch on completion, cancellation, or conflict. |

### High-Level Technical Design

Component topology:

```mermaid
flowchart TB
  Browser[Chat and deterministic Career Map] --> Route[Authenticated agent route]
  Route --> Loop[AI SDK ToolLoopAgent]
  Loop --> Step[Per-step Method coordinator]
  Step --> Loader[Global prompt plus selected SKILL.md]
  Step --> Briefing[Focused career-map briefing]
  Step --> Tools[Stage-specific strict tools]
  Tools --> Reducer[Method reducer and guards]
  Reducer --> Store[(Career map and change history)]
  Store --> Step
  Loop --> Search[Native contextual web search]
  Search --> Citations[Bounded provider citations in Conversation]
  Citations --> Loop
```

One model turn:

```mermaid
sequenceDiagram
  participant C as Explorer
  participant A as Agent route
  participant M as Method coordinator
  participant O as OpenAI
  participant D as Career map
  C->>A: Send message
  A->>D: Acquire lease and load current revision
  A->>M: Derive checkpoint and module
  M->>O: Stream with focused briefing and active tools
  alt State-changing tool call
    O-->>M: Typed operation
    M->>D: Validate, apply atomically, append history
    D-->>M: New revision and derived checkpoint
    M->>O: Continue with refreshed module, tools, and briefing
  else Natural reply only
    O-->>M: Natural reply with no canonical claim
  end
  M-->>C: Stream concise reply after any state result
  A->>D: Release lease
  A-->>C: Refetch canonical map
```

Derived Method checkpoints and interrupts:

```mermaid
flowchart TB
  S[Load canonical map] --> I{Invalidated basis?}
  I -->|Yes| Basis[Review earliest unresolved basis]
  I -->|No| F{Explicit focus open?}
  F -->|Yes| Focus[Load focused Method module]
  F -->|No| Q{Pending confirmation or selection?}
  Q -->|Yes| Pending[Resume pending decision]
  Q -->|No| PE{Pending commitment needs peer exposure?}
  PE -->|Yes| Peers[Find Relevant Peers]
  PE -->|No| W{Confirmed North Star?}
  W -->|No| Foundation[Form the Foundation]
  W -->|Yes| P{Current three-path set selected?}
  P -->|No| Paths[Create Purpose Paths]
  P -->|Yes| C{Provisional commitment?}
  C -->|Yes| Doors[Enter Through Side Doors]
  C -->|No| R{Open reflection?}
  R -->|Yes| Learn[Interpret Project and Next Move]
  R -->|No| E{Peer research requested?}
  E -->|Yes| Peers
  E -->|No| J{Accepted current project?}
  J -->|No| Design[Design a Path Project]
  J -->|Yes| Guide[Guide a Path Project]
  Guide -->|Reflect now| Learn
  Guide -->|Find peers| Peers
  Learn -->|Revise North Star or paths| Foundation
```

Dependency revision behavior:

```mermaid
flowchart TB
  NorthStar[Confirmed North Star revision] --> PathSet[Purpose Path set]
  PathSet --> Project[Path Project]
  Project --> Learning[Reflection and evidence]
  Learning --> Move[Next Move]
  PathSet --> Peer[Peer exposure]
  Move --> Commit[Provisional commitment]
  Peer --> Commit
  Commit --> Proof[Proof inventory]
  Proof --> DoorSet[Side Door set]
  NorthStar -. revised .-> Review[Full downstream closure needs review]
  PathSet -. revised .-> Review
  Project -. revised .-> Review
  Learning -. revised .-> Review
  Move -. revised .-> Review
  Peer -. revised .-> Review
  Commit -. revised .-> Review
  Proof -. revised .-> Review
  Review --> Resolve[Reaffirm, revise, or replace earliest unresolved basis]
```

### Output Structure

```text
shared/career-map/
  foundation.ts
  paths.ts
  projects.ts
  learning.ts
  peers.ts
  side-doors.ts
  operations.ts
  reducer.ts
  selector.ts
  index.ts
server/ai/method/
  base-instructions.ts
  registry.ts
  loader.ts
  skills/
    form-foundation/SKILL.md
    create-purpose-paths/SKILL.md
    design-path-project/SKILL.md
    guide-path-project/SKILL.md
    find-relevant-peers/SKILL.md
    interpret-path-project/SKILL.md
    enter-side-doors/SKILL.md
client/src/components/explore/
  foundation-card.tsx
  purpose-paths.tsx
  path-project.tsx
  learning-card.tsx
  next-move.tsx
  research-sources.tsx
  later-stage-state.tsx
```

### Reconciliation Map

| Active revamp area | Method amendment | Owned here |
|---|---|---|
| R2, U2 | Bind the existing thesis and this Product Contract as the complete Method specification; do not author a second thesis. | U1 |
| R6, R8, R9 | Replace practice-testing, ikigai vocabulary, and continue/switch/new with Your North Star, Purpose Paths, Path Projects, What You Learned, and user-owned Next Moves. | U1, U3, U7, U8 |
| KTD5, U4 | Expand the career map into the composed Method kernel with lineage, source provenance, and separate schema/revision versions. | U2, U4 |
| KTD6, U5 | Replace generic upserts and confirmation with shared domain operations and per-step state refresh. | U2, U5 |
| U6 | Render validated Method state and run the Purpose Paths prototype gate. | U6 |
| U7a, U7b | Replace the monolithic prompt with repository-owned modules and stateful golden transcripts. | U3, U5, U7-U9 |
| U8 | Replace the broad return prompt with resumable project guidance, What You Learned, conditional Next Moves, peers, and Side Doors. | U8, U9 |
| U10 | Expand the launch journey to a complete learning loop and an early-commit Side Doors branch. | U10 |

### Sequencing and Prerequisites

Baseline `20f08cd` contains the landed kernel, first three modules, storage, one-loop agent, connected U6 workspace, and U7 journey through the first project. The 2026-09-05 amendment does not replay that history. It reopens only affected acceptance in U5, U6, and U7 and proceeds in that order: server authority/turn/receipt contracts, then the atomic Chat-action/read-only-Map presentation swap, then module copy and behavioral proof. U8 remains blocked until the amended deterministic and rendered checks pass and the attended founder U7 qualitative gate is accepted. U9 and U10 retain their existing order after U8. I3 remains outside this Method amendment.

The active revamp plan's platform preparation and identity work remain prerequisites and are not duplicated here. U5 must verify that the pinned AI SDK supports per-step tool selection and instruction refresh with OpenAI Conversations. If the provider hook cannot refresh both after a committed tool result, use an explicit one-Response-per-step AI SDK loop that preserves the request lease, stream, abort signal, idempotency, Conversation ownership, and safe compaction boundary. If neither route can preserve those contracts, stop before product integration and surface the provider incompatibility.

### System-Wide Impact

- **Persistent data:** The career-map document changes shape before pilots generate durable Method records. Add explicit schema-version handling and reject unsupported versions rather than guessing migrations.
- **Concurrency:** Agent tools and the two existing Chat Start operations share the active plan's user lease, row revision, idempotent operation history, and cancellation behavior. Atomic batches commit in full or leave no canonical proposal.
- **Action ownership:** Chat is the only acting surface. Purpose Path Start reuses the exact shared reducer operations; every other consequential choice remains conversational. Your Map renders the same canonical cards without actions or prompt-prefill controls.
- **Prompt context:** The full map can outgrow the active plan's one-page assumption. Each module receives only its relevant confirmed basis, active work, pending proposal, decision evidence, sources, and necessary parked records.
- **Privacy:** Contextual native search runs in the same OpenAI conversation with focused Career Map context per the active plan. Foundation constraints such as income, health, location, and responsibilities are sensitive. Application logs and retained test artifacts never contain prompts, briefings, career-map payloads, tool arguments, source bodies, provider responses, or validation payloads; they use opaque user, turn, operation, revision, and error identifiers only. Checked-in and CI-retained transcripts use synthetic explorers. Public peer and Side Door records retain only minimum-necessary professional identity and relevance data, never scraped private contact details. Conversation remains in OpenAI and product memory remains in Neon.
- **Erasure:** Account erasure removes the map, history, sources, drafts, leases and idempotency records, conversation mapping, and paginated OpenAI Conversation items. Tombstone preservation applies to ordinary corrections, not privacy erasure; a non-content-bearing pending marker tracks retries until both stores confirm deletion.
- **Pilot learning:** After the MVP is complete, the first consented pilot cohort is reviewed from payload-free canonical event types already present in history—checkpoint reached, proposal revised, replaced or rejected, project accepted or stopped, reflection opened, Next Move chosen, commitment pending or completed, and route selected—plus a short optional debrief. The founder reviews the first five completed or abandoned pilot sessions before expanding access; observed patterns may propose Method or module changes, but they change the live contract only through an explicit plan update.
- **Legacy isolation:** `/legacy`, its Gemini prompts, assessment schemas, anonymous routes, and current tests remain behaviorally unchanged.

### Risks and Mitigations

- **Semantic judgment cannot be reduced to a schema.** Coverage sufficiency, path distinctness, project quality, and explicit conversational assent remain model judgments. Reducer guards, provenance, and golden transcripts make those judgments inspectable without pretending they are deterministic.
- **Strict schemas can force invented values.** Keep operations small, use nullable fields only when absence is meaningful, never require a state-changing call on an unrelated message, and reject unsupported evidence instead of filling required fields with guesses.
- **Same-turn transitions can use stale context.** KTD12 requires a map reload and module re-derivation after each committed tool result; integration tests cover confirmation-to-generation transitions.
- **Hosted web-search output may not expose enough content for claim-level grounding.** The pre-U2 and U5 provider assertions verify result identifiers, URLs, optional titles, citations or snippets, and handle visibility. Missing content downgrades the record to cited provenance; a failed or insufficient search produces no padded canonical set.
- **Basis revisions can orphan active work.** KTD8 marks dependents for review and preserves their history. Destructive generic delete is outside the operation surface.
- **Deployment may meet more than one database baseline.** U4 inspects the real execution baseline. With no released career-map rows, it creates the Method schema directly; if an earlier revamp shape has shipped, it adds a fixture-backed upgrade path from that exact schema version. Writers remain gated until integrity checks pass.
- **JSONB cannot enforce every domain invariant in PostgreSQL.** KTD5 assigns nested cardinality, selection, lifecycle, and lineage to the reducer and full-map validator, then validates on both load and commit. Invalid rows enter repair-required instead of reaching the model.
- **Lease expiry is not an integrity guarantee.** Operation identity, payload fingerprint, compare-and-swap update, and history insertion share one database transaction. Fault-injection and race tests prove exact-once behavior independently of the lease.
- **A provider can emit prose before a tool result or fail after a database commit.** Mutation-capable steps hold state-dependent prose behind KTD4's result barrier. The committed map remains authoritative, and turn, message, operation, revision, and terminal status linkage lets retry or reload recover the original result without duplicate writes or treating partial prose as a conclusion.
- **Method modules can disappear from a serverless bundle.** The loader has startup validation, the existing Vercel include-files rule covers the server tree, and production-mode build verification loads every bundle.
- **Behavioral tests can become model-snapshot brittle.** Deterministic reducer, selector, storage, tool, route, UI, and fake-model tests own invariants. Live golden transcripts run three samples per core journey: state and safety rules pass every run, while qualitative tone, brevity, and distinctness must pass at least two samples without ad-hoc retries; the harness records provider, model, and module versions.

### Planning Sources

- [Vercel AI SDK Agent Skills guide](https://ai-sdk.dev/cookbook/guides/agent-skills) — `SKILL.md` format, progressive disclosure, and application-provided filesystem/load behavior.
- [Vercel AI SDK agent overview](https://ai-sdk.dev/docs/agents/overview) and [loop control](https://ai-sdk.dev/docs/agents/loop-control) — `ToolLoopAgent`, structured workflows, and per-step tool/context control.
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [function calling](https://developers.openai.com/api/docs/guides/function-calling) — strict schemas for application actions rather than a replacement for natural user-facing text.
- `scripts/openai-provider-spike.mjs` — repository proof that custom tools and OpenAI web search can coexist with request-scoped instructions and completed-turn compaction.

---

## Provider Feasibility Gate

### G1. Prove the provider boundary before the Method kernel

- **Goal:** Falsify the load-bearing OpenAI and AI SDK assumptions before U2-U4 create durable Method architecture.
- **Dependencies:** U1.
- **Files:** `scripts/openai-provider-spike.mjs`; `package.json`; recorded spike evidence in the active revamp plan.
- **Approach:** Retain the existing spike as a regression harness for one contextual `ToolLoopAgent`: native web search and strict stage tools coexist under automatic choice, search sees the stored Conversation plus focused Career Map, ordinary citations survive bounded history reload, state-result narration waits for authoritative results, and same-turn confirmation can refresh into the next module. Re-prove abort, idempotency, and compaction without a research-specific model call, source handle, fallback loop, or persistence layer.
- **Stop condition:** If neither loop route preserves lease, streaming, abort, idempotency, Conversation ownership, same-turn module/tool refresh, and safe compaction together, stop before U2 and surface the provider incompatibility instead of weakening the Product Contract silently.
- **Verification:** `npm run spike:openai` passes against the pinned provider and the chosen native or fallback route is recorded. U5 repeats the same assertions after integration.

---

## Implementation Units

| U-ID | Title | Key files | Depends on |
|---|---|---|---|
| U1 | Reconcile the active revamp authority | active revamp plan | — |
| U2 | Build the Method kernel | `shared/career-map/` | U1, G1 |
| U3 | Load and evaluate the first Method modules | `server/ai/method/`, evaluation script | U2 |
| U4 | Persist and brief the full career map | storage, shared schema, briefing | U2 |
| U5 | Integrate stage-specific tools into the agent loop | agent, tools, route | U3, U4 |
| U6 | Prototype and build deterministic Method presentation | explore components and page | U1 for prototype; U2, U5 for connected UI |
| U7 | Ship Foundation through first Path Project | initial modules, workspace tests | U5, U6 |
| U8 | Close the learning loop and peer guard | guidance, reflection, peer modules | U7 |
| U9 | Add the lightweight Side Doors tail | Side Doors module and state renderer | U8 |
| U10 | Prove the complete Method journey | end-to-end and release verification | U7-U9 |

### U1. Reconcile the active revamp authority

- **Goal:** Amend the active implementation plan so one authority describes the new Method without disturbing its settled infrastructure decisions.
- **Requirements:** R1-R48, F1-F5, AE1-AE14.
- **Dependencies:** None.
- **Files:** `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md`.
- **Approach:**
  1. Replace the active plan's conflicting vocabulary, method requirements, career-map shape, generic tools, monolithic prompt, return flow, test scenarios, and Definition of Done using the Reconciliation Map.
  2. Preserve the active revamp plan's KTD1-KTD4 and KTD7-KTD10 platform choices; amend that plan's KTD5 and KTD6 only where this plan's Method kernel and operations require it.
  3. Bind `docs/thesis.md` and this Product Contract rather than duplicating their normative content.
- **Patterns to follow:** The active plan's existing authority hierarchy and stable ID rules.
- **Test scenarios:** Test expectation: none — this unit changes planning authority, not runtime behavior.
- **Verification:** A role-based document review finds no remaining conflict between the active plan, the thesis, and this Product Contract; every changed active unit cites its governing Method requirements.

### U2. Build the Method kernel

- **Goal:** Define the browser-safe canonical state, operations, reducer guards, lineage, and derived checkpoint selector before database or model integration.
- **Requirements:** R10-R18, R23, R26-R34, R36-R48; F1-F5; AE4, AE7, AE9, AE11-AE14; KTD1, KTD2, KTD5-KTD9.
- **Dependencies:** U1 and a passing G1 provider-feasibility gate for either the native per-step refresh route or the explicit one-Response-per-step fallback.
- **Files:** `shared/career-map/*.ts` (new); `shared/career-map/reducer.test.ts` (new); `shared/career-map/selector.test.ts` (new).
- **Approach:**
  1. Compose the map from domain schemas instead of one monolithic Zod object or operation union.
  2. Implement narrow operations for evidence, proposals, revisions, confirmations, selections, work status, reflections, Next Moves, peer exposure, commitment, proof, Side Doors, and evidence outcomes.
  3. Make exact-cardinality sets and multi-record transitions atomic; store basis revisions, confirmation provenance, and operation source IDs.
  4. Define Purpose Path combination as an atomic three-item set replacement: merge the requested pair and propose one replacement third without ever persisting a two-item intermediate set.
  5. Derive the active module and pending decision from canonical records, with explicit interrupt focus for reflection, peers, Foundation revision, and path revision.
- **Execution note:** Implement the reducer and selector test-first; later layers must call this kernel rather than recreate lifecycle rules.
- **Patterns to follow:** Browser-safe schema separation in `shared/streaming-schemas.ts`; transaction-shaped invariants in `server/routes/assessment/utils.ts`.
- **Test scenarios:**
  - Covers AE4. Proposing or replacing one Purpose Path commits one valid three-item set and preserves equal, unranked siblings.
  - Covers AE7. Opening reflection on a stopped or in-progress project records evidence without marking work complete.
  - Covers AE9. Continue-no returns to paths; continue-yes permits only explore-further or provisional commitment as the formal Next Move.
  - Covers AE11. A Side Door selection activates one route and parks two in one operation.
  - Covers AE13. A cancelled exact-three proposal applies all or none, and a replayed operation source ID applies once.
  - Covers AE14. The first project proposal accepts one candidate; a later explore-further cycle requires three options and an explicit selection.
  - Combining two Purpose Paths produces one revised, distinct, unranked three-item set in one operation; it never activates or confirms the merged path implicitly.
  - A stale confirmation target, a second active path, a ranked path field, a fit score, or commitment without qualifying peer exposure is rejected.
  - Revising the North Star, the active path, or proof inventory marks dependent records for review without deleting evidence.
  - Revising the North Star from the deepest Side Doors state marks paths, project-dependent decisions, commitment, proof, and routes for review and disables downstream tools until the earliest basis is resolved.
  - Replacing an unaccepted project keeps its number; selecting after explore-further creates Path Project N+1.
  - Every representative canonical state resolves to one expected module under KTD2 precedence; closing an interrupt after the map changes recomputes rather than restores its prior checkpoint.
  - Model-based state-machine tests generate legal operation sequences and assert selector totality, KTD2 precedence, liveness after focus closes, complete dependent invalidation, and that every exposed operation is legal for the derived checkpoint; minimized failures become regression fixtures.
- **Verification:** All Method kernel tests pass without a database or model, and exported schemas remain safe for both browser and server bundles.

### U3. Load and evaluate the first Method modules

- **Goal:** Replace the monolithic prompt with a validated module loader and prove Form the Foundation, Create Purpose Paths, and Design a Path Project before product integration.
- **Requirements:** R1-R22, R41, R44-R46; F1, F2; AE1-AE6; KTD3, KTD4, KTD12.
- **Dependencies:** U2.
- **Files:** `server/ai/method/base-instructions.ts` (new); `server/ai/method/registry.ts` (new); `server/ai/method/loader.ts` (new); `server/ai/method/skills/form-foundation/SKILL.md` (new); `server/ai/method/skills/create-purpose-paths/SKILL.md` (new); `server/ai/method/skills/design-path-project/SKILL.md` (new); `server/ai/method/loader.test.ts` (new); `scripts/eval-revelio-method.mjs` (new); `package.json`.
- **Approach:**
  1. Validate skill frontmatter and load one full module from a fixed registry; do not expose filesystem or skill discovery to the model.
  2. Keep voice, anti-prestige, untrusted-data, brevity, and write-before-summarize invariants in the small base instructions.
  3. Run scripted conversations against the real model with an in-memory reducer, asserting both the reply behavior and committed state after each turn.
  4. Record the module key and content version with each evaluated turn so pilot evidence can be attributed later; register and package only modules that exist at this unit.
- **Patterns to follow:** AI SDK `ToolLoopAgent` usage and request instructions proven in `scripts/openai-provider-spike.mjs`; current `SKILL.md` format from the official AI SDK guide.
- **Test scenarios:**
  - Covers AE1. One rich answer advances coverage without re-asking answered areas and produces a concise suggested North Star only when coverage is sufficient.
  - Covers AE2. Weak doing evidence triggers the consumption/thinking fallback, while already-supplied ten-year meaning is not re-asked.
  - Covers AE3. A prestige-distorted path is revised without ranking the alternatives.
  - Covers AE4. A replacement changes only one path and the set remains three distinct ways to serve the confirmed North Star.
  - Covers AE5. Rejecting the first project produces one replacement, not a defensive explanation or three options.
  - Covers AE6. An imagined-client portfolio exercise is redirected to a wanted outcome or firsthand beneficiary.
  - Paths never appear before a confirmed North Star, and the exact R22 copy appears once immediately before first-project acceptance.
  - The three registered skill bundles load in a production-mode filesystem smoke; an unregistered checkpoint fails closed instead of selecting a missing module.
- **Verification:** Loader tests pass; the live transcript harness records three Foundation-to-first-project samples with expected operations and state, all hard invariants pass, and at least two meet the qualitative rubric without retries.

### U4. Persist and brief the full career map

- **Goal:** Store Method state with atomic history, idempotency, ownership, and focused module briefings while retaining the active plan's JSONB architecture.
- **Requirements:** R11, R17, R23, R26-R40, R41, R45, R46; F1-F5; AE7, AE10-AE13; KTD1, KTD5, KTD7-KTD10.
- **Dependencies:** U2 and the active revamp plan's platform and identity prerequisites.
- **Files:** `shared/schema.ts`; `server/storage.ts`; `server/storage.test.ts`; `server/storage.performance.test.ts` (new); `server/ai/briefing.ts` (new); `server/ai/briefing.test.ts` (new); reviewed Drizzle migration files.
- **Approach:**
  1. Inspect the execution baseline. Create the Method schema directly when no career-map schema has shipped; otherwise add a fixture-backed upgrade from the exact released `schemaVersion` with no speculative backfill.
  2. Store schema version, row revision, operation source and payload fingerprint, confirmation provenance, module version, and researched-source metadata; ordinary domain operations cannot change schema version.
  3. Apply compare-and-swap update and matching history insertion in one transaction with owner scope and database-enforced operation uniqueness. Same-ID/same-payload replay returns the stored result; different-payload reuse is rejected.
  4. Validate the full document on load and before commit, then compile a module-specific briefing from confirmed basis, active work, pending decisions, relevant evidence and sources, and necessary parked or stale records.
  5. Preserve tombstones and revision lineage for normal corrections, while implementing the active plan's cross-store erasure contract for all Method records and OpenAI Conversation items.
  6. Before freezing the durable shape, benchmark realistic long-lived explorer fixtures and record falsification bounds for serialized document size, full-map validation time, transaction latency, and concurrent-write behavior. Crossing a bound triggers an append-only child-record or event/summary design review before pilot writes.
- **Execution note:** Add characterization coverage for existing storage before extending it, then land migration and transaction tests together.
- **Patterns to follow:** `IStorage`/`PostgresStorage` in `server/storage.ts`; current Drizzle schemas; the active plan's lease, turn, and change-history contracts.
- **Test scenarios:**
  - Concurrent writes with the same starting revision allow one commit and return a conflict for the other without partial history.
  - Replaying a tool-call source ID returns the original result and does not duplicate a change.
  - Selecting a path, replacing a project proposal, and selecting a Side Door commit all sibling transitions atomically.
  - An owner mismatch cannot read or mutate another explorer's map.
  - No anonymous or legacy route can read, create, or mutate a Method map, history entry, operation record, draft, or researched source.
  - Unsupported `schemaVersion` fails explicitly; row revision increments do not change schema compatibility.
  - Clean-database creation passes; if a released predecessor exists, its fixture upgrades without data loss. An interrupted or unsupported migration leaves Method writers disabled.
  - Fault injection before the map update, between update and history insertion, and at commit leaves either no change or one matching map revision and history record.
  - Same operation identity with a different payload is rejected; races after lease expiry still produce one logical commit.
  - A module briefing omits unrelated historical detail but retains the confirmed North Star, relevant basis revision, active object, pending decision, sources, and stale-state warning.
  - Malformed cardinality, duplicate active selection, or dangling basis fixtures enter repair-required and never reach a briefing.
  - Erasure interrupted before provider deletion retries from a non-content-bearing pending marker and completes with no orphaned map, history, source, draft, lease, idempotency, mapping, or Conversation item.
  - After simulated compaction, a corrected map value outranks stale transcript text.
  - Storage, validation, and briefing failures log identifiers, revisions, and error classes only; sensitive payload values never enter logs or retained artifacts.
- **Verification:** Fresh-schema and any real upgrade fixtures pass; storage and briefing tests prove atomic history, exact-once replay, ownership, lineage, repair-required handling, erasure retry, and focused projection.

### U5. Integrate stage-specific tools into the agent loop

- **Goal:** Simplify the landed agent boundary so the main agent judges natural-language intent while strict operations, exact presentation turns, invalidation impact, and durable receipts protect state.
- **Requirements:** R10-R18, R41-R46; F1-F2; AE3-AE6, AE13; KTD3-KTD6, KTD8, KTD10-KTD12; Revamp R18, R22, R24-R26.
- **Dependencies:** U3, U4 and the active revamp plan's agent route prerequisites.
- **Files:** `server/ai/tools.ts`; `server/ai/tools.test.ts`; `server/ai/history.ts`; `server/ai/history.test.ts`; `server/ai/agent.ts`; `server/ai/agent.test.ts`; `server/routes/agent.ts`; `server/routes/agent.test.ts`; `server/storage.ts`; `server/storage.career-map.test.ts`; `shared/streaming-schemas.ts`; `shared/streaming-schemas.test.ts`; `shared/career-map/reducer.ts`; `shared/career-map/reducer.test.ts`.
- **Approach:**
  1. Delete positive phrase, language, verb/subject, ordinal-wrapper, path-alias, and edit-target mention parsing. The main agent maps the current message to the existing exact operation and target; deterministic guards do not reinterpret language.
  2. Keep only the two existing Purpose Path Start cases on the direct UI route. Reuse current set/path/revision/presentation inputs, lease, abort, idempotency, and reducer behavior. Verify before dispatch that the presenting turn belongs to the authenticated user and is terminally completed.
  3. Extend display-safe history only with the authenticated durable turn anchor and final assistant display item needed to attach one canonical path set. Failed/cancelled presentation sets remain read-only when that item exists; without it, attach nothing. Recover through a later call to the existing proposal operation. Normalize live and hydrated citation hashes/ranges against the complete final visible assistant message and bind them to the exact turn and display item.
  4. Refactor the existing file-local `invalidateFromWhy` traversal in place so one traversal returns both invalidated records and their unique artifact classes. Return the classes in the revise result. Keep the completed-prior-turn, legal-transition, and expected-map-revision guards; dependent writes while pending and intervening revisions reject. Add no second helper/traversal, state, operation, route, schema version, or migration.
  5. Preserve contextual native research, the result barrier, and internal operation outcomes. Reuse each existing correlation ID and exact turn identity at terminal refetch so every in-memory attempt reconciles independently and visible Saving clears or one error appears only after durable truth is known. Persist no attempt list and add no lifecycle protocol.
- **Execution note:** Add failing semantic-intent, history-placement, impact-derivation, and lost-terminal-event tests first. Delete obsolete authorization before adding any helper.
- **Patterns to follow:** Existing `turnIdsByMessage` and display projection in `server/ai/history.ts`; existing operation receipts and `presentation.assistantTurnId`; existing reducer invalidation closure.
- **Test scenarios:**
  - English, German, Portuguese, and Russian direct assent reaches the exact tool without phrase matching; contextual `1` selects path one.
  - Hedges, quotes, questions, conditionals, generic assent among three paths, ambiguity, and multi-target choices produce no operation in scripted agent fixtures.
  - Wrong, stale, superseded, same-turn, wrong-revision, wrong-presentation, unauthenticated, aborted, duplicate, and illegal operations still fail deterministically.
  - The invalidation result exactly matches zero-dependent, shallow, and deepest reducer closure classes. A later acknowledged revision confirms; same-turn confirmation, a dependent write while pending, an intervening map revision, and a failed proposal reject, with the latter requiring a fresh presentation through the existing operation.
  - Up to eight assistant items map to one turn and only the final display item carries the attachment anchor across pagination. Forged cross-user, missing, failed, cancelled, or non-terminal presentation targets never expose Start, and a failed/cancelled turn without a display item renders no card.
  - Live multipart and hydrated citations resolve against the same whole visible message; a correct hash/range from another turn or display item creates no link.
  - Missing stream terminal evidence and multiple sequential attempts reconcile independently against the exact committed, replayed, conflict, rejected, failed, or cancelled durable results without a new lifecycle protocol.
  - Confirming a North Star commits it, reloads state, exposes Create Purpose Paths tools, and can propose the three paths in the same turn.
  - Selecting a path parks siblings before Design a Path Project is loaded; stale path tools are unavailable on the next step.
  - A purely conversational question streams text without being forced into a state-change schema.
  - A search result containing instructions to confirm, select, record evidence, reveal data, or call tools cannot authorize a state-changing operation and cannot become user-authored evidence.
  - Abort before operation dispatch writes nothing; abort during the transaction commits fully or rolls back; abort after commit but before acknowledgement replays the stored result without duplication.
  - No tool can send a message, publish, submit an application, or perform another external action.
- **Verification:** Focused agent, tool, history, route, storage, schema, and reducer tests prove semantic intent without lexical authorization, exact state safety, one narrow attachment anchor, matched invalidation-class derivation, and truthful receipt reconciliation. The production diff has no classifier, migration, route, operation family, attachment registry, or generic lifecycle module.

### U6. Prototype and build deterministic Method presentation

- **Goal:** Amend the landed workspace so Chat owns action, Your Map is read-only, the selected cards render in both places, prose is safely structured, and persistence feedback uses two visible states.
- **Requirements:** R15, R16, R41-R43, R45-R47; AE3-AE6, AE13; KTD4, KTD6, KTD11, KTD12; Revamp R17, R22-R24.
- **Dependencies:** U5.
- **Files:** `client/src/pages/explore.tsx`; `client/src/pages/explore.test.tsx`; `client/src/components/explore/method-map.tsx`; one shared Purpose Path card component; `client/src/components/explore/safe-message.tsx`; delete `client/src/components/explore/operation-status.tsx` and its test; prune generic visible-status attempt logic from `client/src/components/explore/explore-state.ts` and its test while preserving stream assembly; `client/src/components/explore/interaction-ownership.ts`; focused component tests; `client/src/index.css`; selected-prototype README; `docs/evidence/2026-09-05-u6-conversation-first-amendment.md`.
- **Approach:**
  1. Extract the existing seven-band card once. Chat passes one Start action for eligible current paths; Your Map passes none. Remove every Map action, prompt prefill, busy fieldset, and post-action focus target.
  2. Keep prose at 38rem and let only the card block break toward 82rem. Use CSS on actual container width to render three equal seven-row subgrid columns at about 1000px and an equal Path 1/2/3 stack below it.
  3. Attach each canonical set once to its final assistant display item after one concise offer. Hide cards during streaming. Keep superseded, active, and failed/cancelled-presentation cards with a display host read-only; render no card when a failed/cancelled turn has no host. Expose Start only after authenticated terminal-turn validation, disable it during any unresolved turn/direct operation, and re-enable only after terminal refetch confirms eligibility.
  4. Use installed `react-markdown` locally with R43's allowlist. Only a citation whose turn/display-item identity, complete-visible-message hash, exact range, sanitized URL, and one literal visible-text mapping validate may create the existing safe anchor.
  5. Delete the five-status `OperationStatusList` and prune the generic visible-status reducer. Keep only page-local per-correlation start/unresolved facts and one current error, then reconcile each attempt independently against canonical operation history after refetch. Delay Saving about 500ms; clear committed, replayed, and rejected results silently; render conflict, pre-write failure, commit-then-reply failure, and unknown refetch through one persistent error component with a next action. Preserve Stop unchanged.
- **Execution note:** Land Chat Start and Map action removal atomically. Reuse card markup, exact receipt correlations, and page-local composer state. More than one small card extraction and one local SafeMessage helper triggers simplification review.
- **Patterns to follow:** Founder-selected Purpose Path prototype; current `PurposePathCard`, exact receipt correlations and stream aggregation, Chat/Your Map tabs, and sanitized citation anchor.
- **Test scenarios:**
  - One proposal attaches once after final prose across streaming, hydration, and pagination. A failed/cancelled turn without a final display item attaches none. Current completed Chat shows three Start buttons; every Map, historical, failed/cancelled, in-flight, and unresolved-operation state shows zero enabled actions until refetch revalidates eligibility.
  - No Rewrite, Replace, Combine, Ask, confirmation, project, or later-stage Map button or prefill remains.
  - Rendered containers just below and at the breakpoint prove stack versus three-column subgrid, aligned seven bands, Path order, equal widths, and no ranking.
  - Allowed Markdown renders identically live and reloaded. Hostile HTML, links, images, protocols, unsupported syntax, duplicate/split claims, cross-item identities, and invalid whole-message citation hashes or ranges create no active or ambiguous anchor.
  - Fast success and replay show nothing; slow success shows then clears Saving; failure and conflict persist; internal rejection clears Saving with no label; cancellation, commit-then-reply failure, and multiple sequential attempts reflect durable truth.
  - An error created while Your Map is active sets the accessible Chat dot. Opening Chat clears only the dot; successful recovery clears the error.
  - Keyboard Start restores focus in Chat. Tabs, transcript follow, draft, microphone, and current Stop behavior remain unchanged.
- **Verification:** Component/state tests, accessibility-tree inspection, keyboard/focus/live-region checks, and rendered actual-width checks pass. New dated evidence records the amended contract; the earlier U6 evidence remains historical.

### U7. Ship Foundation through the first Path Project

- **Goal:** Amend the landed first-three-module journey so an explorer forms Your North Star, compares and starts paths in Chat, and reaches one first project without lexical refusals or duplicated path prose.
- **Requirements:** R1-R23, R41-R46; F1-F2; AE1-AE6, AE13; KTD1-KTD6, KTD8, KTD11, KTD12; Revamp R20, R22, R25-R26.
- **Dependencies:** U5, U6.
- **Files:** `server/ai/method/base-instructions.ts`; the first three `SKILL.md` modules; loader tests; `server/ai/briefing.ts`; briefing/agent/tool tests; `scripts/eval-revelio-method.mjs`; golden fixtures.
- **Approach:**
  1. Replace user-facing and normative Method copy with Your North Star or a faithful local equivalent. Keep internal `why` identifiers and stored data unchanged.
  2. Add the small Markdown allowlist instruction through the existing refreshed developer-message path; cards remain application-owned.
  3. Replace the 350-word path reply with one short localized offer before the cards, with no duplicated fields or footer invitation.
  4. Present the exact North Star invalidation classes before destructive reconfirmation and require a later explicit acknowledgment. Reuse the existing revision operation after failed presentation.
  5. Preserve the single first project and exact R22 framing. The main agent judges semantic intent; deterministic U5 guards remain the invariant boundary.
- **Patterns to follow:** U3 golden transcripts and U5 operation boundary.
- **Test scenarios:**
  - Covers AE1-AE6 with both reply behavior and expected state after every turn.
  - Reload during incomplete coverage asks the next missing area; reload on a suggested North Star resumes refinement rather than generating paths.
  - One concise localized path offer precedes one attached card set and contains no seven-field duplicate or footer invitation.
  - English, German, Portuguese, Russian, and bare-ordinal samples call the exact tool; hedge, quote, question, conditional, generic assent, ambiguity, and multi-target samples clarify without a classifier.
  - A zero-dependent North Star revision follows the ordinary later-turn rule without impact classes. A deepest-state revision names exact affected classes, refuses same-turn confirmation and dependent writes while pending, accepts later acknowledgment, rejects an intervening expected-revision change, and re-presents after a failed proposal.
  - Reload with three unselected paths resumes comparison; a replacement preserves two siblings and selection activates one while older cards remain read-only.
  - Recommending a path occurs only after an explicit user request and does not persist a rank or preselection.
  - Rejecting or revising the first project keeps one proposal and the same project number until acceptance.
  - The R22 copy is emitted once before acceptance and not repeated on later projects.
- **Verification:** Deterministic tests pass first. Three bounded Sol samples per changed core behavior pass every hard rule and at least two meet the qualitative rubric without retry. The attended founder U7 qualitative gate then resumes; U8 stays blocked until acceptance.

### U8. Close the learning loop and peer guard

- **Goal:** Support project execution, reflection at any point, a user-owned Next Move, three follow-on project options, path switching, and meaningful peer exposure before commitment.
- **Requirements:** R23-R35, R41-R46, R48; F2-F4; AE7-AE10, AE13, AE14; KTD2, KTD5-KTD9, KTD12.
- **Dependencies:** U7.
- **Files:** `server/ai/method/skills/guide-path-project/SKILL.md` (new); `server/ai/method/skills/interpret-path-project/SKILL.md` (new); `server/ai/method/skills/find-relevant-peers/SKILL.md` (new); `server/ai/briefing.ts`; `server/ai/agent.test.ts`; `client/src/components/explore/path-project.tsx`; `client/src/components/explore/learning-card.tsx`; `client/src/components/explore/next-move.tsx`; related tests.
- **Approach:**
  1. Resume active work by default and expose explicit interrupt operations for reflection and peer research; support scope reduction without doing the core evidence-producing work.
  2. Store multiple reflection sessions and qualitative evidence without a score, quota, duration gate, or artifact-completion requirement.
  3. Separate the desire-to-continue choice from the eventual Next Move. Do not manufacture a formal third menu option while uncertainty is still being discussed.
  4. When explore-further is chosen, propose one atomic set of three equal follow-on projects, allow revision or replacement, and activate the explorer's selection as Path Project N+1.
  5. When commitment is chosen without qualifying exposure, preserve the intent as pending and route to researched peer exposure; complete commitment only after the explorer confirms a decision-relevant insight.
  6. If the explorer declines peer research, keep commitment pending without nagging, leave further Path Projects and ordinary conversation available, and surface the smallest passive first-person source only when the explorer returns to commitment.
- **Patterns to follow:** U2 reducer and selector; U5 contextual native search and bounded provider citations; exact user-facing prompts in R26 and R29.
- **Test scenarios:**
  - Covers AE7. A stopped project opens with the targeted R26 question and distinguishes path fit from scope, execution, constraints, and temporary obstacles.
  - Covers AE8. Ability growth alone does not become fit evidence; optional signal fields remain absent when unsupported.
  - Covers AE9. Continue-no routes to parked, revised, or new paths; continue-yes exposes only explore-further or provisional commitment as formal choices.
  - Covers AE10. Peer research returns a small current set with relevance, access, smallest action, and an optional draft; search failure returns uncertainty instead of invented contacts.
  - Covers AE14. Explore-further produces three options after the first loop, including after switching paths, and the user selects one to pursue first.
  - Reflection can open before work starts, during work, after stopping, and after completion; repeated reflection appends evidence without overwriting earlier records.
  - A continue choice, Next Move, and commitment retain the exact reflection/evidence and peer-exposure revisions that supported them; later evidence does not rewrite the earlier basis.
  - Strong evidence can support provisional commitment from an unfinished artifact; no project count or confidence score is checked.
  - Existing confirmed firsthand exposure satisfies the commitment guard; mere suggestions do not; direct outreach is never required.
  - Declining peer research leaves commitment visibly pending, does not repeat the prompt on each return, and does not block another Path Project or a pause.
  - Reload at every project, reflection, peer, and Next Move checkpoint resumes the exact unfinished decision.
- **Verification:** A golden transcript completes one full learning loop through both continue branches, and model-free tests prove peer gating, follow-on cardinality, and reflection independence.

### U9. Add the lightweight Side Doors tail

- **Goal:** Let an early explorer who commits provisionally confirm proof, compare three researched entry routes, select one, prepare a contribution, and interpret route outcomes without dedicated late-stage UI.
- **Requirements:** R33-R40, R41-R47; F5; AE11-AE13; KTD5, KTD8-KTD12.
- **Dependencies:** U8.
- **Files:** `server/ai/method/skills/enter-side-doors/SKILL.md` (new); `server/ai/briefing.ts`; `server/ai/tools.ts`; `client/src/components/explore/later-stage-state.tsx`; related shared, agent, route, and component tests.
- **Approach:**
  1. Draft proof only from canonical work and explorer-reported evidence; keep unsupported proof absent and require confirmation before route research.
  2. Research Side Doors contextually in the main Conversation. Create a Suggested exact-three route set tied to the confirmed proof revision only when the current explorer message authorizes that exact proposal and the agent has three credible current routes. Keep ordinary citations in bounded transcript presentation; persist no search attempt, source handle, claim association, partial set, or research status.
  3. Store the selected route, two parked routes, prepared materials, and human-controlled next action; do not add external-action tools.
  4. Record route outcomes separately. Return to Path evidence only when the explorer reports that doing the underlying work changed their desire to continue.
- **Patterns to follow:** `docs/research/2026-08-28-side-doors-career-entry.md`; U5 contextual native search and citation boundary; U6 validated-state rendering.
- **Test scenarios:**
  - Covers AE11. A confirmed proof inventory produces exactly three unranked researched routes and activates only the explorer's selection.
  - Covers AE12. Silence on a selected route revisits parked or replacement routes while leaving Path evidence unchanged.
  - Missing proof remains absent rather than being inferred to satisfy a required schema field.
  - Fewer than three credible current routes creates no canonical route set; the agent explains the uncertainty conversationally and may research again later instead of persisting a partial attempt or padding the set.
  - Revising proof marks the current Side Door set for review until reaffirmed, revised, or replaced.
  - A drafted introduction remains stored and unsent; no API or tool can perform the external action.
  - Reload after commitment, proof suggestion, proof confirmation, route proposal, route selection, or outcome resumes the exact unfinished Side Door checkpoint.
- **Verification:** The lightweight commitment transcript and deterministic state renderer cover proof through route evidence without a dedicated late-stage workflow surface.

### U10. Prove the complete Method journey

- **Goal:** Make the reconciled active plan's launch gate prove one complete learning loop, the early-commit Side Doors branch, resumption, and legacy isolation.
- **Requirements:** R1-R48; F1-F5; AE1-AE14.
- **Dependencies:** U7, U8, U9 and the active revamp plan's auth, workspace, and deployment units.
- **Files:** `tests/explore.spec.ts` (new); `tests/journey.spec.ts`; `scripts/eval-revelio-method.mjs`; `package.json`; `vercel.json`.
- **Approach:**
  1. Keep deterministic reducer, storage, route, and UI tests as the invariant gate; run live transcripts as a separate behavioral gate.
  2. Exercise the full first loop from adaptive Foundation through project reflection and both Next Move branches.
  3. Exercise an early provisional commitment through peer exposure, proof confirmation, three Side Doors, selection, and route evidence.
  4. Re-run interruption, compaction, reload, responsive workspace, build packaging, auth, and `/legacy` regression checks from the active plan.
  5. Run the pre-pilot data-integrity gate before enabling Method writers: baseline migration, zero-invalid-record audit, transaction fault injection, repair handling, writer-disable rollback, and cross-store erasure retry.
- **Execution note:** Use deterministic provider fixtures for Playwright state transitions; reserve live-model runs for the golden transcript gate so end-to-end tests remain repeatable.
- **Patterns to follow:** `tests/journey.spec.ts`, `playwright.config.ts`, and the active revamp U10 launch contract.
- **Test scenarios:**
  - A new explorer completes Foundation, replaces one path, selects another, accepts the single first project, records unfinished-project learning, and chooses explore-further from three options.
  - A separate explorer reaches pending commitment without exposure, completes a researched passive exposure, confirms proof, selects one of three Side Doors, and records a silent route outcome without changing Path evidence.
  - Reload and simulated compaction at every derived checkpoint preserve the current decision and corrected state.
  - Interrupting after a suggested write leaves recoverable canonical state; cancelled prose is marked stopped and never becomes a conclusion.
  - Desktop and mobile workspaces render the same canonical state, and the legacy anonymous journey passes unchanged at `/legacy`.
  - Production-mode build loads all seven `SKILL.md` bundles and the agent starts with provider switches disabled or enabled as configured by the active plan.
  - A deepest-state North Star revision marks the full downstream closure for review, preserves evidence, disables later tools, and resumes at the earliest invalid basis.
  - Provider failure immediately after a committed operation yields one revision and one history record; retry recovers from canonical state with a stopped prior turn.
- **Verification:** All Verification Contract gates pass, including the attended manual screen-reader release check; the founder reviews both golden journeys, and the reconciled active plan's production smoke succeeds.

---

## Verification Contract

| Gate | Command or evidence | Applies to | Done signal |
|---|---|---|---|
| Type safety | `npm run check` | U2-U10 | Shared schemas, tools, UI messages, and components compile without errors. |
| Deterministic unit and integration tests | `npm test` | U2-U9 | Reducer, selector, module loader and registry, storage, briefing, semantic tool-call fixtures, exact target/order/receipt guards, history turn anchoring, safe Markdown/citations, agent, route, and component scenarios pass; hard invariants do not depend on a live model. |
| Method golden transcripts | `npm run eval:method` | U3, U7-U9 | Three bounded Sol samples per changed core behavior record provider/model/module versions; hard rules pass every run and at least two meet the qualitative rubric without retries. The amendment matrix covers multilingual assent, bare ordinal selection, ambiguity forms, destructive impact acknowledgment, and concise path presentation. |
| Provider capability | Focused deterministic agent and history tests; at most one unretried Sol smoke only if a changed boundary cannot be covered | G1, U5 | Native contextual search, result-gated narration, same-turn state refresh, bounded citation history, safe compaction, and exact receipt reconciliation remain intact without isolated research, source handles, a classifier, or a fallback matrix. |
| Browser journey | `npm run test:e2e` | U10 | Complete learning-loop, Side Doors, responsive workspace, auth, and legacy journeys pass. |
| Production build | `npm run build` | U3, U6, U10 | Client/server bundles build and every currently registered Method bundle loads in production mode—three at U3 and all seven at U10. |
| Data integrity | Reviewed Drizzle SQL plus disposable-branch integrity drill | U4, U10 | Fresh schema and any real predecessor fixture pass; zero invalid or orphaned records, exact-once fault injection, repair-required behavior, writer-disable rollback, and erasure failure/retry are proven before pilot writes. |
| Purpose Paths presentation | Founder-selected prototype contract plus rendered Chat/Map evidence | U6 | One shared seven-band component renders in both placements; Chat alone exposes current Start actions; actual container width selects aligned three-column subgrid or equal stack. |
| Workspace UX and accessibility | U6 component assertions, accessibility-tree inspection, rendered keyboard/focus/status/width checks; U10 manual screen-reader check and e2e | U6, U10 | Exact attachment/action counts, read-only Map, restricted Markdown/citations, delayed Saving, silent success, one persistent error visual, cancellation truth, unseen Chat dot, focus, draft preservation, and responsive equality match Revamp R22-R24. |
| Authority coherence | Role-based `ce-doc-review` | U1 | Thesis, Method Product Contract, and active revamp plan contain no conflicting live instruction. |
| 2026-09-05 amendment stop | Focused U5-U7 checks, `npm run check`, `npm test`, `npm run eval:method`, `npm run build`, rendered comparison widths, and attended founder U7 gate | U5-U7 | Revamp R22-R26 and AE12-AE17 pass; U8 remains blocked until founder acceptance. The diff adds no database migration, route, operation family, classifier, generic attachment/status framework, or broad internal rename. |

Live transcripts assess decisions and state writes rather than general phrasing, with three declared exact-copy exceptions: the R22 project framing, the R26 reflection opener, and the R29 continue question must appear in the required place on every applicable sample. A passing sample records the active module, exposed tools, operation, resulting map revision, provider/model/module versions, and concise reply shape for each turn. Any state, confirmation, privacy, external-action, safety, exact-copy, or Method-stance violation fails the gate on its first occurrence; Method-stance violations include permanent-calling or destiny claims, fit scoring, prestige ranking, and unsolicited recommendation language. Tone, one-question brevity, and semantic distinctness use the declared two-of-three qualitative threshold. Deterministic tests remain the release gate for invariants, ordering, resumption, conflicts, and failure paths.

---

## Definition of Done

- Baseline `20f08cd` remains intact; reopened U5-U7 acceptance and the attended founder U7 qualitative gate pass before U8 begins. I3 stays outside this amendment.
- Every existing Product Contract requirement, flow, and acceptance example plus R48 and AE14 is covered by a named deterministic, transcript, prototype, or end-to-end check.
- A new explorer can confirm Your North Star, compare and revise three Purpose Paths, start one from its Chat card, accept one first Path Project, reflect at any work status, and make a user-owned Next Move; Your Map has no action controls.
- Choosing explore-further after a learning loop presents three equal Path Project options and activates only the explorer's explicit selection as the next numbered project.
- Provisional commitment cannot complete without confirmed meaningful peer exposure, but no direct outreach or external action is required.
- An early committed explorer can confirm proof, compare three researched Side Doors, choose one, prepare an approach, and record route evidence separately from Path evidence.
- Natural chat is never parsed to recover canonical state. The main agent judges semantic intent without phrase/alias lists or a second classifier; every consequential conclusion still uses a validated, versioned operation before dependent narration.
- A mutation-capable turn never releases a canonical-state claim before its operation result; rejected, conflicted, and committed writes are narrated from the authoritative revision, while an aborted request emits no further prose and is explained only after retry or reload.
- Every same-turn state change refreshes the Method module, tools, and briefing before the next model step.
- One shared Purpose Path component attaches only to an existing final display item in the authenticated presenting Chat turn; Start appears only after that exact current turn completes and terminal refetch confirms eligibility, while Your Map and historical or failed/cancelled-presentation cards remain read-only. Its seven-row subgrid, equal stacked fallback, whole-message and rendered-item citation validation, delayed Saving, silent success/rejection, independent per-attempt reconciliation, one persistent error visual, cancellation truth, and unseen Chat dot pass rendered and deterministic checks.
- Contextual native search runs inside the main stored Conversation with focused Career Map context. Retrieved content never supplies intent or canonical state, and failed or insufficient research creates no fabricated or padded entity.
- Logs and retained evaluation artifacts contain no personal reflection, Foundation constraint, career-map, briefing, tool-argument, source-body, or provider-response payloads.
- Every persisted map passes the full-document validator, every logical operation has at most one matching history record, and the pre-pilot integrity audit reports zero unsupported documents, dangling references, invalid cardinalities, duplicate active records, or duplicate operation identities.
- The fresh-schema or real predecessor migration, writer-disable rollback or roll-forward repair, and cross-store erasure failure-and-retry drills pass before pilot accounts receive Method write access.
- `/` serves the authenticated Method experience and `/legacy` retains its existing anonymous behavior, schemas, prompts, provider, and journey.
- `npm run check`, `npm test`, `npm run eval:method`, `npm run test:e2e`, and `npm run build` pass on the final state under the Verification Contract thresholds.
- Cleanup is complete: no generic Method upsert bypass, dual acting surface, broad internal `why` rename, phrase/alias authorization layer, classifier, generic attachment/status framework, recovery operation family, new route or migration, runtime-generated visualization path, orphaned transition, or dead prototype code remains in the diff.

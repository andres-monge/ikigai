---
date: 2026-04-18
topic: student-prompt-adaptation
---

# Adapt AI Prompts for High School Student Audience

## Problem Frame

Revelio is pivoting from adults in career crisis to 16-18 year old students at private and international schools (B2B, sold to schools). The current system prompts, questionnaire questions, and AI output are framed for adults with work experience — references to "bootstrapped MVPs," "cold-messaging hiring managers," "ideal work setup," and salary ranges assume a professional context students don't have.

The core proposition — helping people discover what they actually enjoy through exploration and side quests, not prescribing careers — works for students. But the language, examples, action plan scaffolding, and practical questions need to meet students where they are: in school, facing subject choices and university applications, often uncertain about what they want, and navigating family expectations.

This is a full pivot: 100% student audience, no adult/student mode split needed.

## Requirements

**Voice & Tone**

- R1. Both system prompts (purpose discovery and action plan) must explicitly state the audience is students in their last years of high school.
- R2. The Paul Graham voice stays but shifts toward encouraging over contrarian. PG-authentic encouragement (direct, honest, treats the reader as smart) — not generic or cheesy. Think "the way to figure out what to work on is to try things" not "you can do anything you set your mind to."
- R3. Both prompts must include an instruction to handle uncertain or "I don't know" answers generously — validate uncertainty as a normal starting point for exploration, not a deficit to push through.

**Questionnaire Changes**

- R4. Replace `economic.q1` (currently: "Forget what's realistic for a second. Describe the life you actually want: the place, the pace, the people.") with: "How much school do you have left, and what choices are coming up? Subject picks, university applications? Any deadlines we should know about?" Note: this trades an aspirational question for a logistical one — the tradeoff is intentional because the AI needs school context to personalize timelines (R10).
- R5. Replace `economic.q2` ("What constraints or responsibilities should we factor in?") with: "What's the thing you're most stuck on? It's fine if the answer is 'I don't even know what I want.'"
- R6. Spanish translations for both new questions must be updated to match the new English wording.

**Purpose Discovery Prompt**

- R7. The `actionStrategy` field on each purpose path must be framed for students — school projects, community experiments, online exploration — not career moves like "Bootstrapped MVP in 6 mo."
- R8. The `pay` field in ikigai alignment must be reframed as future financial outlook for the field, not current salary ranges. Show what these fields tend to pay, whether further education is common, and what the financial trajectory looks like.

**Action Plan Prompt**

- R9. Action plan milestones must be achievable by a student in a school context. Prefer experiments they can do within their school, community, or online. If a step involves reaching out to adults, scaffold it through a trusted intermediary (teacher, counselor, family connection) rather than cold outreach.
- R10. Timeline must be driven by the student's answers to the new Q1 (R4). If they state years left, upcoming deadlines, or application timelines, the milestones should align to those real dates and school rhythms — not arbitrary week counts.
- R11. Parent/family communication must be reactive only: if the student mentions *explicit* parental pressure, family expectations, or needing to convince someone, the action plan should acknowledge it and include a step. A passing mention of family (e.g., "I live with my parents") should not trigger this — only expressed tension or constraint. If the student doesn't mention family pressure, no parent communication step should appear.
- R12. The final milestone of the action plan must be a fields-of-study recommendation, framed as earned through exploration: "If you made it this far, you know whether this type of work is fulfilling. If it is, here are fields of study where you could go deeper, and why." This gives the student practical information for a counselor or teacher conversation — not a prescribed degree, but a direction grounded in their own experience.
- R13. The AI must never recommend specific degree program names or university names. Fields of study only (e.g., "Behavioral Economics," "Environmental Engineering"), with reasoning for why each connects to the purpose path.

**UI & Labeling**

- R14. The `ikigai.pay` i18n label (currently "Pay" / "Paga") must be updated to match the reframed content — e.g., "Financial Outlook" / "Perspectiva financiera" or similar.
- R15. The "Economic" / "Economía" section header in the prompt formatter (`formatQuestionnaireForPrompt`) must be renamed to something like "School Context" / "Contexto escolar" since the questions are no longer about economics.
- R16. E2E test fixtures in `tests/journey.spec.ts` must be updated with student-appropriate answers for the new economic questions — the current fixtures use adult work preferences that will be semantically mismatched.

## Success Criteria

- A student who writes "I don't know what I want" in multiple answers receives purpose paths that validate their uncertainty and frame exploration as the goal, not a problem.
- Action plan milestones feel achievable to someone in school — no steps require professional experience, cold outreach to strangers, or financial investment.
- The final milestone gives the student something concrete to bring to a counselor: fields of study connected to a purpose path they explored and validated.
- The output reads as Paul Graham talking to a smart 17-year-old, not Paul Graham talking to a YC founder.

## Scope Boundaries

- No student/adult mode toggle — the app is 100% student from this point.
- No changes to the purpose path data structure or streaming schemas (titles, descriptions, ikigai alignment fields stay the same — only the prompt instructions for how to fill them change).
- No changes to the number of questions (8) or the questionnaire flow/UI.
- No counselor-facing dashboard or reports (the counselor value comes from the student bringing their results to the conversation).
- No renaming of the `economic` category key in the schema or questionnaire data structure — only the display header sent to the AI model and the i18n labels change.
- No degree database or university API integration — the AI uses its general knowledge to suggest fields of study, scoped to field names only (R13).

## Key Decisions

- **Fields of study as final milestone, not prescribed up front**: The core proposition is discovery through exploration. Suggesting degrees early would make the tool another career guidance quiz. Instead, fields of study appear at the end of the action plan as something earned — "you explored this, you liked it, here's where to go deeper." This also creates the counselor handoff the school wants.
- **Questionnaire economic section repurposed**: The two economic questions (work setup, constraints) are irrelevant for students. Replacing them with school context (R4) and "what are you stuck on" (R5) gives the AI the practical information it needs to personalize output without adding questions.
- **Reactive parent communication**: The AI doesn't know the family dynamic. Proactively telling every student to "convince your parents" would be presumptuous. Instead, the prompt responds to what the student raises.
- **No specific degree or university names**: Avoids hallucination risk and keeps the tool universal across countries. Fields of study are reliable; "BSc Applied Psychology at University of Edinburgh" is not.

## Dependencies / Assumptions

- The existing questionnaire questions beyond the economic section (passions Q1-Q2, values Q1-Q2, skills Q1-Q2) work for students without modification. The user has confirmed some copy changes are already in progress separately.
- Gemini's general knowledge of fields of study is sufficient for the final milestone recommendation without an external database.

## Outstanding Questions

### Deferred to Planning
- [Affects R6][Needs research] What are the exact Spanish translations for the two new economic questions? Should match PG-equivalent tone in Spanish.
- [Affects R10][Technical] How should the action plan prompt parse structured school context (e.g., "2 years left, IB subject choices in September, university applications in January") into timeline-aligned milestones? The current prompt contains adult-specific timeline examples ("3-month severance," "2 years before kids") that must be replaced with student equivalents. May need prompt engineering iteration.
- [Affects R14, R15][Needs research] Final wording for the "Pay" i18n label and "Economic" section header renames — both English and Spanish.
- [Affects R12][Technical] How specific should the fields-of-study milestone be? Should the prompt request a fixed number of fields per path (e.g., 2-3) or leave it flexible?

## Next Steps

-> `/ce:plan` for structured implementation planning

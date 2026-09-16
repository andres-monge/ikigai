# First-user prospect screening rubric

This is the canonical founder-calibrated rubric for screening potential Revelio
first users after evidence collection and qualification. It governs screening
from 2026-09-15 onward.

It does not change the frozen collector or blinded-judge rules used by the
seven-day discovery trial. Those rules determine whether an item contains
auditable evidence of unresolved work direction. This rubric answers one
operational question: **does the public evidence strongly suggest that this
person may care enough about solving the problem to tolerate an unfinished
early product?**

## Binary decision

Return exactly one screening decision:

- `advance`
- `do_not_advance`

Do not add grades, scores, tiers, or ranking levels.

### Advance

Advance a candidate when the public evidence strongly suggests all three:

1. **Their work direction or fit remains genuinely unresolved.** They have not
   settled what kind of work fits them. They may have several directions, a
   broad north star, or one serious hypothesis that still needs real-world
   testing.
2. **The problem is substantial or persistent.** The uncertainty has meaningful
   consequences, has lasted, has survived a transition, or is materially
   affecting confidence, work, finances, or life.
3. **They are open to help or another approach.** They are asking for guidance,
   seeking a process, considering experiments, or otherwise showing that they
   have not closed themselves to learning what fits.

This is the operational meaning of a strong, “hair-on-fire” first-user
prospect. It does **not** require a near-term deadline, crisis language, or
public desperation. Career discovery often develops over years, and a
long-running unresolved problem may be stronger evidence than momentary
urgency.

### Do not advance

Do not advance when the evidence does not strongly support all three conditions
above. Common reasons include:

- the destination is already chosen and the remaining question is tactical;
- the choice is confined to specializations, employers, or progression within
  an established path;
- the post is professional content, retrospective advice, or general reflection
  rather than a substantial first-person problem;
- the post is too thin to establish substantial or persistent pain and
  openness, even if unresolved direction is mentioned;
- relevant later evidence shows that the person chose and began executing a
  direction;
- the decision is dominated by a local examination, licensing, government-job,
  education, visa, or labor-market system outside the initial recruitment
  market, without a clear portable-problem exception.

`do_not_advance` means “do not put this person into the strong first-user pool
on the available evidence.” It does not mean the person could never benefit
from Revelio.

## Previous action is a bonus, not a requirement

Courses, projects, jobs, conversations, research, applications, experiments,
and other attempts can show a bias for action and make someone more likely to
engage with Revelio. A candidate can still advance without previous attempts
when the unresolved problem is clearly substantial or persistent.

Do not merge persistence with previous action. Persistence describes how long
or deeply the problem has remained unresolved. Previous action describes what
the person has tried.

## Reading public evidence fairly

- Read the full post or comment, not only its title, retrieved sentence,
  excerpt, or automated label.
- When supplied and material, inspect relevant public follow-ups by the same
  author. Do not inspect unrelated history or seek private information.
- Treat missing evidence as unknown, not as proof that the problem is weak.
- Emotional language can support substantial pain, but it cannot replace clear
  evidence that work direction or fit remains unresolved.
- Do not call anyone a proven desperate customer from a social post. Public
  evidence only identifies someone worth testing. Willingness to use a buggy
  product, complete projects, or pay must be learned through conversation and
  behavior.

## Important boundaries

### One named direction

A person considering one occupation can advance when they have not decided it
fits and need experience to test that hypothesis. Do not advance when the
occupation is effectively chosen and only applications, compensation,
credentials, visa mechanics, or another external constraint remains.

### Narrow choices inside an established path

Choosing among specializations, employers, or progression routes inside an
already chosen career normally does not advance. Advance only when the evidence
shows that broader work fit is also genuinely open.

### Current status

If relevant later public evidence shows that the person has chosen and begun
executing a direction, do not advance. If a follow-up merely describes an
experiment and the person already doubts its fit, the underlying problem
remains unresolved. When a follow-up is removed or ambiguous, make the best
binary decision from the available evidence and set `founder_review_required`
to `true`.

### Initial market and portable-problem exception

The initial recruitment focus is the Anglosphere. Do not infer location. When
the public evidence explicitly places someone elsewhere, do not advance when
the decision materially depends on a local education, examination,
government-employment, licensing, or labor-market system that could distort
early product learning.

The candidate may advance as an explicit portable-problem exception when the
core work-fit problem is severe and general, the possible solution does not
depend on local institutions, and there is enough evidence that Revelio's
method could apply. Record the exception in the reasoning.

## Founder review flag

Return `founder_review_required: true` separately when:

- material evidence is ambiguous or incomplete enough that a reasonable binary
  decision could change;
- current status or a portable-problem exception needs founder judgment; or
- independent reviewers disagree.

Otherwise return `founder_review_required: false`.

The flag does not create a third outcome. Every candidate still receives either
`advance` or `do_not_advance`. Preserve independent reads when reviewers
disagree; do not force a false consensus.

## Screening output

For each candidate, include:

1. Candidate identifier, public handle, and canonical evidence link.
2. A plain-English summary of the full relevant public context.
3. Concise observations on:
   - unresolved direction or fit;
   - substantial or persistent problem;
   - openness to help or another approach;
   - previous action as a bonus signal;
   - initial-market status or portable-problem exception;
   - current status when relevant evidence exists;
   - evidence limitations.
4. `screening_decision`: `advance` or `do_not_advance`.
5. `founder_review_required`: `true` or `false`.
6. `founder_review_reason`: a short reason when review is required, otherwise
   `null`.
7. `my_read`: one concrete plain-English reason for the binary decision.

Present founder calibration cases in small batches so corrections can be given
quickly. Keep model estimates, founder-approved decisions, outreach timing, and
confirmed product interest separate.

## Founder-calibrated examples

These examples preserve representative corrections from the founder's reviews.
They are calibration anchors, not keyword templates. Apply the reasoning rather
than matching surface language.

### Advance examples

- **C-0042 — Crookshanks010 — [evidence](https://www.reddit.com/r/careerguidance/comments/1w7g0k4/please_help):** Advance. The person says they have not known what career
  to pursue since 2015 and is asking for direction. The persistence makes this
  strong even though previous attempts are not described. This corrected an
  earlier reading that mistakenly treated duration as unknown.
- **C-0060 — Puzzled-Fix-6440 — [evidence](https://www.reddit.com/r/careerguidance/comments/1vi7tsy/i_44f_want_to_have_a_meaningful_career_but_have):** Advance. Years of
  miserable, unfulfilling office work, no settled direction, and an explicit
  request for a test or process make this a representative strong first-user
  case.
- **C-0171 — Majestic_Lake_292 — [evidence](https://www.reddit.com/r/careerguidance/comments/1ufddvf/im_entering_my_4th_year_of_cse_feel_like_i_wasted):** Advance under the
  portable-problem exception. Repeated attempts across distinct paths have
  increased confusion, graduation and independence pressure are meaningful,
  and the core fit problem is not dependent on an India-specific institution.
- **C-0206 — Misty343 — [evidence](https://www.reddit.com/r/careerguidance/comments/1vl2r6x/how_do_i_know_what_career_is_right_for_me):** Advance. Beginning an
  electrician apprenticeship does not resolve the direction because the author
  already doubts its fit and explicitly treats it as a six-month experiment.
- **C-0216 — lazysmart123 — [evidence](https://www.reddit.com/r/findapath/comments/1w5ztsz/i_know_what_career_i_can_return_to_im_having):** Advance. The obvious
  software path remains available, but the author cannot tell whether it is a
  genuine fit or merely safe familiarity and is asking how to distinguish a new
  role from an entirely different path.
- **C-0130 — originalsensei21 — [evidence](https://www.reddit.com/r/findapath/comments/1vuslss/did_trying_different_things_actually_help_you):** Advance. The author is
  stuck without a direction and explicitly wants to learn how small experiments
  can create genuine clarity rather than merely keep them busy. The concise post
  contains enough first-person strain and unusually direct openness to Revelio's
  method; do not require a quantified duration or crisis language.
- **C-0146 — Infinite_Page_6207 — [evidence](https://www.reddit.com/r/findapath/comments/1vrpwu3/feeling_completely_lost_about_my_career):** Advance. The author remains
  in an uninteresting customer-service job every day because they cannot identify
  any alternative direction, knows the current work is not a long-term fit, and
  asks how others escaped the same trap. Daily entrapment in a known bad fit can
  establish a substantial problem even when the post does not state its duration.

### Do-not-advance examples

- **C-0168 — kaixtxt_ — [evidence](https://x.com/kaixtxt_/status/2082023546034024777):** Do not advance. The short post establishes unresolved
  direction and asks for advice, but it does not strongly establish a
  substantial or persistent problem. This is not an urgency rule; the evidence
  is simply too thin for the strong first-user bar.
- **C-0109 — Nor Azmina Nadia Tazol Azmi — [evidence](https://www.linkedin.com/feed/update/urn:li:activity:7477644292900184065):** Do not advance. The person may have the problem, but the brief job-search post provides too little evidence of depth or likely engagement.
- **C-0125 — ningssss — [evidence](https://www.reddit.com/r/businessanalysis/comments/1vm8k56/feeling_lost_and_exhausted_after_6_years_in_it_as):** Do not advance. The doubt is primarily about specializations and progression within an established IT career, not broader unresolved work fit.
- **C-0113 — Candid_Water_3527 — [evidence](https://www.reddit.com/r/IndiaCareers/comments/1uknvmm/figuring_out_my_next_career_move_in_government):** Do not advance for the initial pool. The decision is dominated by India-specific government exams, employment rules, transfers, and local constraints, so it would distort early product learning.
- **C-0122 — K1LL3X87 — [original evidence](https://www.reddit.com/r/careeradvice/comments/1v6gzxo/38m_without_a_clear_direction):** Do not advance. The original post was a fit, but a relevant later post showed the author had chosen SaaS sales and begun executing the transition. Current evidence overrides the historical opening.
- **C-0104 — Catherine Egu — [evidence](https://www.linkedin.com/feed/update/urn:li:activity:7495595931493650432):** Do not advance. This is professional content and light reflection, not strong evidence of a substantial personal unresolved-fit problem.
- **C-0124 — Many-Level6936 — [evidence](https://www.reddit.com/r/MakeNewFriendsHere/comments/1u90jnn/comment/osed5ef):** Do not advance. A terse reference to GMAT preparation and a next career move does not establish the substantial problem required for screening.
- **C-0214 — ExcitingTrifle963 — [evidence](https://www.reddit.com/r/careerguidance/comments/1uv92ac/should_i_pursue_nursing):** Do not advance. Nursing is effectively the chosen direction; the remaining doubts concern burnout and a partner's contamination-related constraint rather than discovering broader work fit.
- **C-0304 — Active_Repeat3835 — [evidence](https://www.reddit.com/r/findapath/comments/1wfgl8c/im_struggling_and_i_dont_know_what_to_do):** Do not advance. The distress is severe, but the immediate need is to escape an intolerable boss and obtain a scholarship or accessible replacement job. Desperation alone does not establish openness to the slower work-fit discovery process that Revelio requires.
- **R22-1we9qb8 — Squirrel-Unfair — [evidence](https://www.reddit.com/r/careerguidance/comments/1we9qb8/im_concerned_about_ai_everyone_says_to_look_at):** Do not advance. Persistent anxiety about AI replacing careers is meaningful distress, but generalized fear and values pressure do not by themselves establish a concrete unresolved work-fit problem that Revelio can help the person explore.
- **R22-1wdwwci — Traditional_Form_130 — [evidence](https://www.reddit.com/r/careerguidance/comments/1wdwwci/geographygis_grad_deciding_between_an_applied):** Do not advance. Although data science and urban planning are distinct fields, the post frames the decision almost entirely as a graduate-program, salary, flexibility, and return-on-investment comparison. Detailed research and a consequential choice do not replace strong evidence of an unresolved personal fit problem.
- **C-0247 — Kindly_Ad3753 — [evidence](https://www.reddit.com/r/careerguidance/comments/1wft42r/do_i_walk_away_after_all_the_hard_work_and):** Do not advance. The author gives a detailed account of repeatedly testing medicine, psychology, and research, but explicitly says the purpose of the post is unclear and does not seek advice, a process, or another approach. Rich self-reflection and unresolved feelings do not by themselves establish openness to a solution.
- **C-0348 — Fantastic_Handle_293 — [evidence](https://www.reddit.com/r/findapath/comments/1wenac3/i_dont_know_what_to_do_anymore_i_was_put_into):** Do not advance. Although two possible occupations are named, the immediate request is primarily about leaving an unwanted college program and communicating with the author's mother amid failing classes and a financial penalty. A situational family or education crisis should not be reinterpreted as openness to work-fit discovery merely because occupations appear in the post.
- **R22-1wfhu4z — Excellent-Thanks1762 — [evidence](https://www.reddit.com/r/careeradvice/comments/1wfhu4z/academia_and_research):** Do not advance. The author has already chosen teaching and wants industry-specific advice on reaching that destination without completing an intensive research qualification. Discovering that one credential route is unpleasant does not make the underlying work direction unresolved.
- **R22-1wflml4 — PepperHead41 — [evidence](https://www.reddit.com/r/careerguidance/comments/1wflml4/dropping_cs_for_automotive_tech_am_i_making_the):** Do not advance. The author faces an immediate tuition-refund deadline, has two clearly defined paths, and frames the decision mainly around employment demand and job security. A consequential cross-domain choice is not enough when the person is optimizing between known options rather than seeking purpose or fit.

# Seven-Day Free AI-Assisted Prospect Discovery Trial
Created: 2026-09-06

## Authority and relationship to existing work

This document is the execution plan for the seven-day prospect-discovery experiment produced from the fresh September 6 brainstorm. It replaces the discarded `docs/plans/2026-09-06-1308-seven-day-customer-discovery-trial-plan.md`; that earlier draft must not govern setup, execution, or evaluation.

This plan does not amend the product or Method. `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md` remains the implementation authority for the revamp, and `docs/thesis.md` remains the Method authority.

Amended 2026-09-09 after the matched phase began: Day 3 adds a background-capable Reddit community/semantic-adjacency lane, ReddAPI.dev enters as a strictly scoped free exploratory route, and Codex Computer Use enters as an isolated native-browser route for X and LinkedIn. None of these amendments changes or retroactively supplements the frozen Days 1-2 benchmark.

## Outcome

Run a seven-day, read-only experiment that identifies:

- At least five high-confidence potential Revelio users.
- The unresolved-work-direction archetypes showing the strongest public evidence.
- The most productive platforms, discovery strategies, and tools.
- Whether each route continues producing unique qualified candidates or approaches saturation.

The trial is global and English-language. Primary qualifying evidence must have been published during the preceding 90 days. Older evidence is retained in a separate secondary pool and never mixed into primary-window metrics.

## Boundaries

- Discovery only: no messages, follows, reactions, connection requests, product invitations, or other platform writes.
- Free tooling only. Do not purchase credits or paid API access during the trial.
- Select tools by output quality. Access, policy, security, cost, and operational risks are recorded separately but do not alter the output-quality ranking.
- Do not build a CRM, enrichment pipeline, custom scraper, database, dashboard, or permanent automation.
- Keep named candidates and source excerpts in one private local folder outside Git.
- Do not infer or collect private contact details, sensitive characteristics, or unnecessary personal data.
- Do not claim the trial tests acquisition, demand, willingness to pay, product-market fit, outreach conversion, or actual product usage.

## Roles

### Codex — orchestrator and analyst

- Prepare the shared rubric, search briefs, prompts, manifests, and output schemas.
- Run or coordinate every Codex-accessible route.
- Import Energy and Grok results from the agreed shared surface.
- Preserve raw responses, normalize records, verify evidence, and deduplicate after collection.
- Run two independent blinded AI evaluations.
- Prepare the founder calibration and final-audit packets.
- Calculate route, strategy, platform, overlap, marginal-yield, and saturation results.
- Write the anonymized final evaluation.

### Energy — browser-based scout

- Receive one fixed prompt per platform plus the shared qualification and output contracts.
- Search X, LinkedIn, and Reddit through the authenticated browser surfaces.
- Write structured results to the private trial folder or another surface accessible to Codex.
- Perform no likes, follows, replies, connections, messages, or other writes.

### Grok Automations — X semantic scout

- Run the prepared X discovery prompt on schedule.
- Preserve each run in Grok history for import into the trial folder.
- Return evidence URLs and publication dates rather than unsupported summaries.

### Founder — access and ground truth

- Complete required free-account setup, logins, and one-time Energy/Grok prompt installation.
- Review a small blinded calibration packet before the live benchmark is frozen.
- Review one blinded final-audit packet after collection.
- Resolve only genuine rubric disagreements; Codex handles routine collection and analysis.

## Free route matrix

| Platform | Routes included |
| --- | --- |
| X | Grok Automations; Energy; SocialCrawl free tier; Codex web-search baseline; Codex Computer Use exploratory route from Day 3 only |
| LinkedIn | Energy; `mcp-server-linkedin`; SocialCrawl free tier; ScrapeCreators free tier; Codex web-search baseline; Codex Computer Use exploratory route from Day 3 only |
| Reddit | Energy; ScrapeCreators free tier; SocialCrawl free tier; Codex web-search baseline; ReddAPI.dev free exploratory route from Day 3 only |

ReddAPI.dev was discovered after the matched benchmark began. It is therefore a post-benchmark exploratory route, not a retroactive matched route. Its results may inform tool-native discovery quality and portfolio complementarity, but it is ineligible for Days 1-2 matched comparisons, seven-day saturation claims, or conclusions that require equal exposure across the full week.

Codex Computer Use was added after repeated Energy browser-runtime failures during Day 2. It is a separate end-to-end route, not an Energy retry or replacement result. Energy ends after the matched phase and remains in the record as a historical route with mixed completion; its unavailable cells are never filled by Codex. Codex Computer Use is ineligible for the frozen Days 1-2 ranking.

Excluded from this trial:

- Paid xAI `x_search`.
- Paid Redditapis access.
- Reddit MCP Buddy, because it lacks global comment search, exposed pagination, and the exact primary time window required for this experiment.
- ScrapeCreators as a separate MCP lane. Its CLI and MCP reach the same backend and therefore constitute one experimental route.

### Interface choices

- Use the official ScrapeCreators CLI for both Reddit and LinkedIn. Pin the exact verified release rather than running an unversioned package; the version verified during planning was `@scrapecreators/cli@1.0.30`.
- Use CLI file output so complete raw responses bypass the model context and land directly in the private trial folder. Preserve the original compact JSON as canonical; create cleaned derivatives separately.
- Never pass an API key on the command line. Use the documented login or an environment variable so the key does not enter shell history or process listings.
- Treat SocialCrawl's hosted MCP and REST interface as the same route. Use whichever can preserve raw output most directly during Day 0; do not benchmark the interfaces against each other.
- Use SocialCrawl's query-optional subreddit search for a background-capable Reddit community-feed lane beginning on Day 3. Pull public posts from `r/careerguidance` without requiring predicted keywords, preserve the full returned page before ranking, and apply semantic similarity and the frozen qualification contract only in a separate derived stage. Do not automate the logged-out Reddit "Related posts" webpage as the continuing collector; treat those recommendations as the observation that motivated the scalable community/semantic-adjacency test.
- Treat ReddAPI.dev's UI, REST API, and MCP interface as one exploratory route. Use only its free allowance, keep its vendor-provided relevance or lead score separate from the trial's qualification judgment, and independently verify every counted candidate from the canonical Reddit URL. Do not purchase a plan, earn promotional credits through public posting, or infer a real identity from a Reddit account.
- Run Codex Computer Use in a fresh, self-contained Codex task for each platform and run. Give the collector only the thesis, qualification rubric, output contract, and that platform's tool-native brief; forbid access to prior raw results, normalized ledgers, reviews, reports, the manifest, and candidate identities. Run X and LinkedIn serially because they share one Chrome profile. Record the model, reasoning level, browser/extension version when exposed, Chrome profile, prompt version, time budget, cap, and pagination opportunity. Keep the Mac awake, unlocked, and online, and preflight the output directory and signed-in tab before collection.
- Treat MCP as an access mechanism, not a platform, discovery strategy, or experimental category.
- Record the actual ScrapeCreators and SocialCrawl free-credit balances during setup. Current documentation contains differing free-allowance claims, so the account balance is the operational source of truth.

## Private trial workspace

Create one private folder outside the repository:

```text
trial-root/
├── manifest.csv
├── prompts/
│   ├── qualification-rubric.md
│   ├── matched-searches.md
│   ├── energy-x.md
│   ├── energy-linkedin.md
│   ├── energy-reddit.md
│   └── grok-x.md
├── raw/
│   └── day-N/platform/route/run-id.json
├── normalized/
│   ├── evidence.jsonl
│   └── candidates.jsonl
├── reviews/
│   ├── calibration.csv
│   └── final-audit.csv
└── reports/
    └── day-7-evaluation.md
```

Raw responses are immutable. Cleaning, filtering, evidence verification, deduplication, scoring, and reporting write separate derived files.

Each manifest row records:

- Run ID and timestamp.
- Trial day.
- Platform and route.
- Strategy and query-version IDs.
- Requested time window, sort, result cap, and pagination depth.
- Completion, partial-completion, or access-failure status.
- Credits charged and remaining when available.
- Raw-output path.
- Any prompt change, retry, cache behavior, truncation, or known coverage limitation.

## Candidate qualification contract

A record qualifies only when all five gates pass:

1. It contains direct, first-person public evidence.
2. The author has unresolved work direction, or only a broad direction whose fit or route still needs exploration through experience.
3. The primary evidence is English and no more than 90 days old.
4. The record includes an author or handle, publication date, canonical evidence URL, and sufficient excerpt to audit the judgment.
5. The problem is not merely tactical job searching toward a precise destination.

Transitions, layoffs, resignations, career breaks, AI disruption, burnout, and engagement with career-design content may locate promising conversations. None qualifies a person without explicit unresolved-direction evidence.

After qualification, evaluate these independent strength dimensions:

- **Direction uncertainty:** How explicit and consequential is the unresolved choice?
- **Exploration need:** Does fit or route still need to be learned through action rather than supplied as tactical information?
- **Urgency:** Is there public evidence that postponement has a current consequence?
- **Agency:** Is there evidence of action, attempts, curiosity, or willingness to test possibilities?
- **Evidence quality:** Is the source recent, direct, complete, and unambiguous?
- **Future reachability:** Is there a public account through which a later research or pilot invitation could plausibly be made?

Previous attempts strengthen the evidence but are not required. Work status is recorded only when the author states it publicly and never changes qualification by itself. Use the vector of evidence dimensions and a written rationale rather than one unexplained aggregate AI score.

## Normalized evidence record

Each proposed candidate must contain:

- Candidate ID generated for the trial.
- Public display name or handle.
- Platform and public profile URL.
- Canonical evidence URL and publication date.
- Short evidence excerpt.
- Qualification rationale tied to the five gates.
- Provisional unresolved-direction archetype.
- Explicitly observed urgency, agency, and previous-action evidence.
- Work status only when explicitly stated.
- Route, strategy, query version, run ID, and first-seen timestamp.
- All additional routes and runs that independently rediscovered the candidate.
- Evidence-verification status.
- Independent judge decisions and reasons.
- Founder calibration or audit verdict when sampled.

Do not add private email addresses, phone numbers, inferred demographics, sensitive traits, or unrelated profile history.

## Search strategies

### Shared matched strategies

Days 1-2 test three search families that can be expressed across the three platforms:

1. **Direct expression** — explicit uncertainty about what work, path, career, or project to pursue next.
2. **Choice conflict** — several plausible paths, excessive optionality, or inability to commit to a direction.
3. **Broad-direction exploration** — a general aspiration exists, but fit or route must still be tested through action.

### Tool-native strategies

Days 3-4 may additionally use:

- Trigger-plus-unresolvedness searches involving AI disruption, burnout, layoffs, resignation, or career breaks.
- Replies and comment exploration.
- High-signal author, thread, community, method, or creator adjacency.
- Platform-specific semantic search, filters, people search, or thread expansion.
- Search-result leads that are subsequently verified against the candidate's own first-person evidence.
- Queryless community-feed retrieval followed by derived semantic comparison with the frozen positive calibration examples.

A trigger, transition, follower relationship, like, or adjacency result remains only a search lead until qualifying evidence is found.

## Fair-comparison rules

- Every collector runs independently and receives no list of people already found by another route.
- Comparable routes receive the same platform-specific intent, query set, date window, result cap, and pagination opportunity during the matched phase.
- Set the common result cap during Day 0 smoke tests. Default to 20 results per strategy when every comparable route can reliably supply that many.
- Deduplicate only after all collectors in a block finish.
- Attribute a candidate to every route that found them; never award discovery based on run order.
- Strip route and strategy labels before candidate evaluation.
- Use two independent AI evaluations: a strict qualification judge and an adversarial false-positive judge.
- The retrieval tool never evaluates its own output.
- Send judge disagreements and a random sample of apparent rejects to founder review.
- Keep raw volume separate from precision. Returning many weak records does not outperform returning fewer strong ones.
- Record access failures, partial responses, exhausted credits, and broken pagination as unavailable evidence, not zero candidate quality.
- Report only comparisons the experiment structurally supports. A platform-exclusive capability is evaluated as a combined route, not proof that its tool alone caused the result.
- Label any route added after the matched phase as exploratory. Compare its verified precision, unique qualified yield, evidence integrity, and operating constraints, but do not place it in matched-phase rankings or pretend it received a full seven-day opportunity.

For metered tools, reserve the observed free balance approximately as follows:

- 40% for Days 1-2.
- 30% for Days 3-4.
- 30% for Days 5-7.

Unused credits roll forward. If a balance is smaller than expected, reduce that route's result or pagination budget before collection begins and keep the budget fixed within each comparable block.

## Setup and calibration — Day 0

Day 0 is setup and does not count toward the seven live collection days.

### Codex setup

1. Create the private folder structure, manifest, schemas, and placeholder files.
2. Draft the shared qualification rubric and anchored positive, borderline, and negative examples.
3. Draft matched query sets A and B using the three shared strategy families.
4. Draft one structured-output Energy prompt per platform and one Grok Automation prompt.
5. Make every collector return the normalized evidence fields or enough raw evidence for Codex to derive them.
6. Pin and verify the ScrapeCreators CLI.
7. Record ScrapeCreators and SocialCrawl balances and allocate their phase budgets.
8. Inspect the LinkedIn MCP's current package, read/write tool surface, version pinning, and credential path before enabling it. Allowlist only the read operations needed by the trial.
9. Run one smoke test per route.
10. Confirm that each route returns working source URLs, real publication dates, public authors, and sufficient excerpts.
11. Confirm that raw files land in the expected location without leaking credentials.

### Founder calibration

1. Complete only the logins and free-account registrations that require human interaction.
2. Paste the prepared prompts into Energy and Grok.
3. Review a small packet containing positive, borderline, and negative examples without route labels.
4. Resolve material disagreements in the qualification rubric.
5. Freeze the rubric, matched query sets, output contract, result cap, and free-credit budgets before Day 1.

If a route cannot pass its smoke test, mark it `not-testable` with the cause. Do not silently replace it, reinterpret its failure as poor candidate quality, or add a paid substitute.

## Seven-day execution

### Days 1-2 — matched benchmark

#### Day 1

- Run matched query set A across every comparable route.
- Preserve each route's output independently.
- Verify URLs, dates, authors, excerpts, result caps, and pagination behavior.
- Normalize only after the full collection block finishes.
- Do not optimize prompts or reveal interim route standings.

#### Day 2

- Run matched query set B across the same routes.
- Query set B uses different language but the same intent, time window, and difficulty as set A.
- Preserve and normalize results using the same process.
- Compare initial precision, unique yield, overlap, evidence integrity, and query sensitivity.
- Do not eliminate a route after this phase.

Output: a controlled comparison of platform, route, and shared search-strategy performance.

### Days 3-4 — tool-native optimization

#### Day 3

- Give every route the same qualification contract and its platform-specific tool-native brief.
- Let each route use its strongest distinctive search capability.
- Use ScrapeCreators global Reddit post and comment search as separate query lanes within the one ScrapeCreators route.
- Use SocialCrawl's structured cross-platform search and Reddit thread expansion.
- Add a SocialCrawl `r/careerguidance` community-feed lane: retrieve public posts without a keyword query, sort by newest, cap and preserve the raw page, enforce the exact primary window after retrieval, then rank the evidence in a derived file against the frozen positive calibration examples. The retrieval call must not see or apply final candidate labels.
- Run a three-call ReddAPI.dev free-tier scout as a separate exploratory route. Freeze one natural-language target description from the qualification contract, then submit that identical description once through semantic search, once through vector search, and once through lead-intent search. The free allowance exposes at most three results per call. Preserve native ordering without replacement, verify canonical sources independently, and keep vendor relevance and lead scores out of qualification. The comparison tests the three retrieval methods, not portfolio-scale yield.
  - Frozen target description: `First-person accounts from people who feel uncertain, stuck, or torn about what kind of work or career to pursue next, have not already chosen a specific role, and want help exploring which viable direction would be a good fit; exclude resume, interview, application, salary, or employer-choice questions and complaints where the desired career is already known.`
- Use Grok for semantic X conversations and relevant replies.
- Retire Energy after Day 2 because repeated browser-runtime failures make it unsuitable for the remaining unattended experiment. Preserve its completed runs and failures in all matched-phase and operational reporting.
- Add isolated Codex Computer Use native-browser runs for X and LinkedIn, with a fixed maximum three searches, ten preserved results per search, the same evidence window, read-only restrictions, and a predeclared pagination opportunity. Record them as `x-codex-computer` and `linkedin-codex-computer`; run them serially and keep them blind to all prior results and judgments.
- Use the LinkedIn MCP for native post search.
- Keep Codex web search unchanged as the cross-platform baseline.

#### Day 4

- Run a second tool-native pass.
- Use verified false-positive patterns from Day 3 to improve retrieval prompts without changing qualification.
- Assign every change a new prompt or query version.
- Preserve the original and revised versions so the effect remains interpretable.
- Run fresh isolated Codex Computer Use tasks for X and LinkedIn using the same fixed opportunity as Day 3 and `v2` prompts derived only from documented false-positive patterns. Do not pass candidate identities or judgments into the collectors.
- Repeat or expand the queryless community-feed lane only after recording Day 3's fixed cap and false-positive pattern. If `r/careerguidance` produces useful qualified evidence, use the Day 4 allowance to test one adjacent career-direction community; otherwise revise only the derived semantic-ranking brief and keep the source community fixed.

Output: the strongest candidate pool each route can produce when allowed to exploit its own advantages.

### Days 5-7 — continued marginal yield and saturation

Continue every functioning route rather than dropping early losers.

Divide each route's remaining opportunity between:

- **Historical stock:** deeper paging, remaining frozen query families, and adjacent conversations inside the 90-day primary window.
- **New flow:** qualifying evidence published since the preceding run.

For each run, calculate:

- Net-new qualified people not previously found by that route.
- Net-new qualified people not previously found anywhere in the portfolio.
- Cumulative qualified people.
- Duplicate and cross-route overlap rates.
- Qualified yield per additional search block.
- Candidates contributed only by that route.
- Candidates contributed only by that platform.
- Evidence-verification failures.
- Remaining free credits and any truncation or access limits.

For Codex Computer Use, start a fresh isolated task for each platform and day, run X and LinkedIn serially, and pass only the frozen prompt plus saved pagination or stopping metadata. Do not pass prior candidate identities or qualification decisions. Energy receives no further collection opportunity; its final disposition is `inconclusive` because runtime failures prevented fair exposure, not `stop` for candidate quality.

#### Day 5

- Run the first continued-yield pass.
- Separate historical-stock and new-flow results in the manifest.
- Produce the first cumulative-yield and overlap curves without showing route rankings to the founder.

#### Day 6

- Repeat the same strategy families and budgets.
- Continue pagination or adjacency from the prior stopping point rather than restarting unknowingly.
- Record whether incremental results are increasingly duplicate, unqualified, or unverifiable.

#### Day 7

- Run the final continued-yield pass without introducing a new qualification rule or major strategy.
- Close all raw collection before final evaluation begins.
- Treat saturation as the observed curve of diminishing unique yield, not a post-hoc threshold selected to create a winner.

Seven days can provide useful evidence about saturation of the searched 90-day backlog. The three new-flow observations are only an early directional estimate of ongoing publication flow.

## Day 7 evaluation

### Candidate and archetype analysis

1. Pool and deduplicate all evidence-qualified candidates.
2. Cluster candidates by the unresolved problem they express, not by platform or employment status.
3. Describe each archetype using observed language, urgency, agency, exploration need, and common rejected false positives.
4. Rank archetypes by evidence strength and repeated appearance across independent routes.
5. Do not call an archetype validated demand or a proven customer segment.

### Route, strategy, and platform analysis

Answer:

- Which platform produced the strongest evidence-qualified candidates?
- Which shared and tool-native strategies produced the highest precision?
- Which route contributed the most unique qualified people?
- Which routes mostly rediscovered people found elsewhere?
- What would the candidate pool lose if each route were removed?
- Which routes continued producing candidates through Days 5-7?
- Where did the 90-day searchable backlog appear saturated?
- Which route or platform showed the strongest early new-flow signal?
- What is the smallest portfolio that retains the valuable complementary candidates?

Use these primary measurements:

- Precision within the fixed reviewed result cap.
- Unique evidence-qualified candidates.
- Strength and completeness of evidence.
- Independent rediscovery and overlap.
- Incremental portfolio contribution.
- Continued marginal yield.
- Cumulative-yield and saturation curves.

Report access, cost, security, account, policy, latency, and operational concerns separately. They provide context but do not change the user-directed output-quality ranking.

### Founder final audit

Prepare one blinded, randomized packet containing:

- Top-ranked candidates.
- AI-judge disagreements.
- Borderline candidates.
- A random sample of rejected records to estimate missed positives.

The founder records `yes`, `maybe`, or `no` plus a short reason. This verdict asks only whether the person is a genuine potential Revelio user; employment status is not a gate. Record outreach timing separately so a strong potential user can be postponed without being rejected. Reveal route and strategy provenance only after the audit. Recalculate route, strategy, platform, archetype, and portfolio findings from the audited labels.

## Day 7 route decisions

Assign one evidence-backed disposition to every route:

- **Keep:** strong output plus continued or complementary qualified yield.
- **Combine:** not the strongest alone, but contributes valuable candidates missed by the leading route.
- **Change search:** the source appears promising but the tested queries or native method caused avoidable false positives or missed obvious qualifying evidence.
- **Stop:** weak evidence quality and no meaningful unique contribution across the tested phases.
- **Inconclusive:** access, credit, or execution limitations prevented a fair test.

Do not force one universal winner when a complementary portfolio explains the evidence better.

## Deliverables

At trial close, retain:

- The private evidence-backed candidate ledger.
- At least five founder-confirmed potential users, regardless of employment status, satisfying the current pipeline floor.
- Raw and normalized trial outputs.
- The final prompt and query versions for every route.
- Per-route and per-platform cumulative-yield curves.
- Continued marginal-yield and overlap analysis.
- Candidate-archetype analysis.
- A disposition for every route.
- A recommendation for the smallest useful continuing portfolio.
- An anonymized, repository-safe research summary under `docs/research/`.

The next step after a successful trial is to keep only the useful discovery routes running lightly until Revelio is ready. Outreach and product invitations begin later and remain founder-led.

## Definition of done

The trial plan is complete when:

- Day 0 setup has frozen the rubric, matched queries, output schema, route matrix, result cap, and free-credit budgets.
- Every testable route has completed both matched runs, both tool-native runs, and three continued-yield runs, or has an explicit `inconclusive` record explaining why not.
- Any route added after Day 2 has completed its explicitly scoped exploratory runs and is excluded from full-week completion, matched-ranking, and saturation requirements.
- Every counted candidate has auditable first-person evidence satisfying all qualification gates.
- Primary-window and older evidence remain separated.
- Independent collection occurred before deduplication and all rediscovering routes retain attribution.
- The founder completed the blinded calibration and final audit.
- At least five candidates received founder confirmation as genuine potential users, regardless of employment status, or the report states honestly that the pipeline floor was not met.
- The evaluation distinguishes platform, strategy, route, and portfolio claims without attributing effects the experiment cannot isolate.
- Continued marginal yield and saturation are reported as observed curves.
- The anonymized final report contains no candidate names, handles, direct excerpts searchable back to individuals, credentials, or private contact details.
- No outreach or product invitation occurred during the trial.
- No paid tool use or permanent prospecting system was introduced.

## Source references

### Repository

- `docs/plans/2026-08-14-claude-feat-revelio-revamp-plan.md` — active revamp authority, private candidate-list requirement, and five-potential-user pipeline floor.
- `docs/thesis.md` — unresolved-work-direction problem and learning-through-action Method.
- `docs/research/first_users_transcript.txt`
- `docs/research/first_10_customers_transcript.txt`
- `docs/research/startup_school_first_customers_transcript.txt`

### Current tool documentation checked during planning

- Grok Automations: https://x.ai/news/grok-automations
- Energy: https://getenergy.com/
- LinkedIn MCP: https://github.com/stickerdaniel/linkedin-mcp-server
- ScrapeCreators CLI: https://docs.scrapecreators.com/integrations/cli/
- ScrapeCreators Reddit search: https://docs.scrapecreators.com/v1/reddit/search/
- ScrapeCreators LinkedIn search: https://docs.scrapecreators.com/v1/linkedin/search/posts/
- SocialCrawl Reddit: https://www.socialcrawl.dev/docs/reddit
- SocialCrawl X: https://www.socialcrawl.dev/docs/twitter
- SocialCrawl LinkedIn: https://www.socialcrawl.dev/docs/linkedin
- SocialCrawl pricing: https://www.socialcrawl.dev/pricing
- ReddAPI.dev developer documentation: https://reddapi.dev/developers
- ReddAPI.dev pricing: https://reddapi.dev/pricing
- ReddAPI.dev terms: https://reddapi.dev/terms

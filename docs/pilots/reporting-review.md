# Early-access reporting and conversation review

Use this workflow to learn what helps each participant and what to investigate next. It follows [Hiten Shah's Early Access Playbook v2.0](https://docs.google.com/document/d/1bo9n52j_M4Nx094TObZQVAq1htlB6h9XlySLgFsH710/edit): keep a Working Bet, examine actual attempts and record decisions in one Learning Thread. Full Revelio conversations are primary evidence; interviews and messages can complement them. There is no PMF or love score.

## Private workspace and enrollment

All participant-bearing files belong under the ignored repository-local `.context/early-access/`, with directories restricted to 0700 and files to 0600. Keep private transcripts out of Git, public documents and personal vaults. The commands write only to this root, refuse symlink/path escapes and never overwrite exports. Choose a new dated output name for each run.

Copy the fictional `templates/cohort.json` into that private root as `roster.json` and replace it with real enrollment only when known. The roster, rather than app users with activity, defines the report denominator. Keep invited people without identities visible. Stages are recruitment notes, not conclusions from app activity. Record the pre-agreement notice and agreement references. Configure founder and QA immutable user IDs explicitly as exclusions before using pilot aggregate counts. Excluded entries remain visible; founder records are never read by this tool. A named QA identity can be reviewed individually for reconciliation.

Use an existing server environment file with `DATABASE_URL` and the direct `BETTER_AUTH_DATABASE_URL`. The explicit `--target` labels the selected environment; it does not select credentials for you. Verify the environment file is the intended development or production target. Never print connection strings, credentials or raw provider errors. Conversation retrieval also needs `OPENAI_API_KEY`.

```sh
node --env-file=/absolute/private/environment --import tsx scripts/early-access.ts resolve-identity --target development --email exact@example.test --participant person-one --output identities/person-one-20300101.json
```

Exact email lookup returns one immutable auth identity privately. Check that binding and edit the roster explicitly. The reporting join thereafter uses user ID, not email. An absent or ambiguous match is an error; do not guess or use participant account sessions.

Register the roster so local erasure can retire bindings:

```sh
node --import tsx scripts/early-access.ts register --input roster.json --participant person-one,person-two --format roster
```

## Generate evidence

```sh
node --env-file=/absolute/private/environment --import tsx scripts/early-access.ts report --target development --cohort roster.json --output reports/20300101.json
node --env-file=/absolute/private/environment --import tsx scripts/early-access.ts conversation --target development --cohort roster.json --participant person-one --format md --output conversations/person-one-20300101.md
```

The report writes JSON and a readable `.md` companion from the same facts. It keeps unlinked, missing, unavailable and checked-empty evidence separate. Per-person source references include map entities/revisions, actions, operations and turns. Counts preserve first recorded attainment and retained history separately from currently supported map context. A currently inactive earlier project can retain its historical completion and learning. Recorded presentation does not prove the participant saw it. Acceptance, reported work and completion are different facts; proceeding can establish work without formal acceptance. Off-app start and finish are self-reported, and recording/commit dates are not independently observed work dates.

Conversation retrieval reads server-owned mappings and provider pages without creating conversations, generating replies or writing projection backfills. Its output keeps original available text and labeled browser presentation where applicable. Failed, cancelled and unbound context is distinguished from confirmed display. Pagination completeness and conversation-content coverage are independent. A partial/unavailable result is written when possible and exits nonzero. Preserve that label when reviewing; never treat a prefix or missing mapping as proof of no use. No provider IDs, internal tool payloads or reasoning are exported.

## Review and decide

For each person, maintain the field-card template: Job; current way; first try; where it broke; our response; next time what they chose. Every observation or claim has an evidence type (`observed`, `self-reported`, `inferred`, `unknown`) and a source reference. Record actual founder assistance and whether a return followed an invitation only where known. Leave missing values unknown.

Keep the Working Bet with one shared Learning Thread in structured private notes. The supplied JSON templates have one entry per participant; register them as `structured-notes` using all included participant keys. Group product-level decisions separately if they contain no participant material. If an entry combines private material about several people, local purge will require manual separation/redaction rather than deleting another participant's contribution.

```sh
node --import tsx scripts/early-access.ts register --input notes/learning-thread.json --participant person-one,person-two --format structured-notes
```

Review after a meaningful attempt, technical incident, product change or later opportunity to choose the tool again. Write date/product version, what we believed, what happened, what we decided/owner, and the next outcome to check. Ask what changed the person's real task, not whether they produced map writes. Silence can mean off-app work, a pause or useful one-time value. A normal guidance turn can be useful. A return needs interpretation before calling it meaningful reuse of context or value.

AI assisting the founder may flag source-linked corrections, rephrasing, unmet requests and useful moments, with competing interpretations and unknowns. The founder checks the sources and judges meaning. Do not add automatic scoring, model calls, outreach or tracking chores. Avoid extra raw copies when a source reference is sufficient.

## Distinguish friction from failed replies

Use durable turn status and request references to investigate technical failure before interpreting behavior. Existing `method_request` records classify the route, HTTP status, duration, safe turn/error metadata, response finish versus premature close, and browser delivery as unknown.

Set `REVELIO_BUILD_VERSION` in the running application's build/deploy environment to a source commit or release token: 1–80 characters, leading alphanumeric, with letters, digits, `.`, `_`, `-`. Missing/invalid values remain unknown; never substitute the reporting checkout's current HEAD for a historical app version.

The small `serverTiming` fields are request-relative server elapsed milliseconds: `providerStartMs`, `firstSafeServerTextMs`, `terminalHandlingDoneMs`. Terminal handling does not prove persistence success; consult durable turn status. Server completion/response finish never proves browser delivery. Detailed dev latency tracing remains opt-in. Historical missing timing/version evidence remains unknown. Reproduce a specific incident with its request/turn reference when necessary; do not turn missing telemetry into a product judgment.

## Separate pilot gate artifact

Retain the existing minimal pilot gate record separately from broader conversation review: opaque session identifier, explicit completed or deliberately-abandoned decision and actor, and minimal operation/status metadata. Keep it payload-free. Elapsed time and inactivity never establish deliberate abandonment. This workflow does not complete the remaining pilot disclosure, full account/cross-store erasure or release gates.

For local deletion and outstanding work, follow [erasure.md](erasure.md).

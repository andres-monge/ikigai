# Founder dogfood Method reset

This operator command resets one explorer's Nami Method journey to a clean
Foundation start while preserving the same Better Auth/Google identity.

This is not the pilot account-erasure runbook reserved by I3. It does not
delete or revoke Better Auth users, linked accounts, or sessions. Do not use it
for a person's account-deletion request.

## What is reset

The command delegates all mutation to the storage layer's existing
`eraseMethodData` boundary. It never issues raw Career Map deletes. That
boundary removes the exact user's Career Map, canonical history, drafts, turns,
leases, Conversation mapping, and pending provisioning identities. It then
exhaustively pages through every mapped OpenAI Conversation item, deletes the
items, deletes the Conversation, and removes the retry marker only after
provider cleanup succeeds.

A failed provider cleanup leaves a non-content-bearing marker and blocks new
Method writes. The next attempt reconciles from that marker even though the
local mapping is already gone.

## Safety contract

- Dry run is the default; `--execute` is always explicit.
- `NODE_ENV`, `--environment`, `--email`, and `--expect-database` are required.
- `--expect-database` is the canonical `<host>:<port>/<database>` identity.
  Omitted PostgreSQL ports canonicalize to `5432`. Only a validated Neon
  `*.neon.tech` `-pooler` hostname is treated as equivalent to its direct host.
- Application and auth URLs must resolve to the same canonical host, port, and
  database. The auth URL must also pass the application's direct/unpooled Better
  Auth pool contract.
- Both pools have finite connection, query, statement, and lock deadlines. Auth
  reads retain Better Auth's `auth` search path.
- The command resolves exactly one normalized email and inventories active and
  expired leases separately.
- A dry run issues a five-minute HMAC token. The shell-safe signed token binds
  the auth user ID, normalized email, environment, canonical endpoint, exact
  Method snapshot digest, and issuance time.
- The token payload is signed, not encrypted: it contains readable target
  metadata. Treat the complete command output and token as sensitive operator
  material; do not paste either into tickets, chat, or logs.
- Execute validates the current user and snapshot against that token. A stale
  user, changed snapshot, expired token, or database mismatch fails closed.
- The storage boundary takes the Method owner lock and refuses deletion if an
  unexpired lease exists. This prevents a turn from slipping between the lease
  check and local deletion. Expired leases do not block reset.
- Completion verifies the same user ID, normalized email, and concrete linked
  account identities. Session-count churn is reported as a warning because the
  command never deletes sessions.
- Database output uses sanitized endpoints, and the command never prints
  database credentials, API keys, OAuth tokens, or `BETTER_AUTH_SECRET`.
- `OPENAI_API_KEY` is required for execution so mapped Conversation items and
  the Conversation can be reconciled through the existing provider cleanup.

## 1. Dry run

From the primary checkout, explicitly set development and let the command read
the local `.env` only after seeing that environment:

```sh
NODE_ENV=development npm run method:reset -- \
  --environment=development \
  --email=founder@example.com \
  --expect-database=ep-example.eu.neon.tech:5432/revelio
```

From a worktree, name the existing project file. It is authoritative for the
database URLs, auth secret, and OpenAI key: a missing key stays missing instead
of falling back to a stale exported value. A `NODE_ENV` present in the file also
overrides the explicit shell value. Inspect the resulting target carefully:

```sh
NODE_ENV=development \
NAMI_ENV_FILE='/absolute/path/to/project/.env' \
npm run method:reset -- \
  --environment=development \
  --email=founder@example.com \
  --expect-database=ep-example.eu.neon.tech:5432/revelio
```

Production never silently loads the default `.env`. Supply production values
through the approved secret-loading path or an explicit `NAMI_ENV_FILE`.

Before continuing, verify `Mode: DRY RUN`, environment, immutable auth user ID,
canonical database, both sanitized transports, Method row inventory, provider
marker, and auth record counts. Copy the confirmation token. It expires after
five minutes and is valid only while the inspected Method snapshot is unchanged.

## 2. Execute

```sh
NODE_ENV=development \
NAMI_ENV_FILE='/absolute/path/to/project/.env' \
npm run method:reset -- \
  --environment=development \
  --email=founder@example.com \
  --expect-database=ep-example.eu.neon.tech:5432/revelio \
  --execute \
  --confirm='<signed-token-from-the-current-dry-run>'
```

The command retries only transport failures, HTTP 429, and HTTP 5xx, with a
bounded attempt count (three total by default). HTTP 401/403 and other
non-retryable responses retain the marker and give configuration guidance
without hammering the provider.

If an attempt exits with provider cleanup pending, take a fresh dry run before
retrying. The marker changes the Method snapshot, so the prior token is
intentionally stale. Do not weaken or bypass this binding, and never repair the
state with raw SQL.

## Exit codes

| Exit | Meaning | Action |
| --- | --- | --- |
| `0` | Dry run succeeded, or execution verified complete | After execution, reload Nami and confirm the preserved account opens at Foundation. |
| `1` | A safety check, strict lease guard, database operation, auth invariant, or residual-row verification failed | Stop and take a new dry run after resolving the stated cause. |
| `2` | Local Method content was removed but provider reconciliation remains durably pending | Resolve the provider/configuration problem, then take a fresh dry run and use its new token. |

## Verification for command changes

```sh
npm test -- server/reset-method-data-script.test.ts server/auth.test.ts server/ai/history.test.ts --run
npm run check
```

The storage integration suite additionally proves the locked lease guard,
provider classification, and real reset inventory SQL against an explicitly
designated disposable database. It must never point at a developer, preview, or
production database.

Run it only with the reviewed disposable admin database gate:

```sh
NODE_ENV=test \
U4_STORAGE_TEST_DATABASE=1 \
U4_STORAGE_TEST_DATABASE_URL='postgresql://.../ikigai_u4_test_admin_...' \
npm test -- server/storage.career-map.test.ts --run
```

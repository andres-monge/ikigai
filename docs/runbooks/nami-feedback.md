# Nami feedback operations

Signed-in explorers use **Send feedback** in Chat or Your Map. The API saves one text record before attempting email. Feedback is separate from the Method: no transcript, screenshot, attachment, agent call or automatic code change is included.

## Storage and admission

`POST /api/feedback` requires the exact configured app Origin, `x-nami-request: 1`, an authenticated Nami session and uncompressed JSON within 16KiB. Its strict body contains only a UUID `submissionId`, `text` (trimmed, 1–4000 characters) and `page` (`chat` or `map`). Identity/email, receipt time and sanitized `NAMI_BUILD_VERSION` come from the server; absent or invalid version is `unknown`.

Migration `migrations/0002_user_feedback.sql` adds `public.user_feedback`. Review the SQL, generated snapshot and journal together. Apply the reviewed chain to an explicitly approved target before deploying code that depends on the table. Never use `db:push` as a substitute for the reviewed ledger. Local tests cover fresh setup and an actual 0001 predecessor upgrade with baseline rows retained. This runbook does not authorize a production migration.

A transaction locks admission per user, resolves matching retries before rate counting, rejects changed content under the same key, and admits at most five new reports per rolling hour. Different users own different submission keys. The server-generated record UUID is the email idempotency identity. Browser uncertainty retains the same text/key in memory across close/reopen; reload persistence of an unsaved feedback draft is not promised.

## Notification states

The primary user confirmation is **Feedback saved. Thank you.** It means the database committed. It never promises inbox delivery.

| State | Meaning and action |
|---|---|
| pending | Saved and not yet attempted, or another unexpired delivery claim is active. |
| unavailable | No valid sender/credential configuration. Keep the row; configure only after authorization, then deliberately retry. |
| accepted | Provider acceptance ID was persisted. Never resend; acceptance does not establish actual inbox receipt. |
| failed | A known rejection such as validation, authorization or rate limit. Correct the cause before a deliberate eligible retry. |
| uncertain | Timeout, connection loss, expired claim or failure to persist an acceptance result. Do not assume nothing was sent. |
| review-required | First claimed attempt is at least 23 hours old. Automatic resend is refused; reconcile with the provider before acting. This status is computed from saved timestamps. |

Delivery claims expire after 30 seconds; each awaited HTTP attempt has a 5-second timeout. A failed or uncertain settlement retains that same persisted claim deadline as the earliest allowed retry, bounding provider attempts across server instances while duplicate requests still confirm the saved record. Accepted delivery clears the deadline. No transaction spans network IO and no work is left running after the response. The first successful claim freezes the sender, recipient, Reply-To, subject and text. A record saved while email was unconfigured adopts its envelope at its first configured claim. Later configuration changes cannot change a frozen payload. The provider key stays `nami-feedback/<server record UUID>`.

Resend currently retains idempotency keys for 24 hours; the application uses a conservative 23-hour retry window from the first claimed attempt. Retries must use the original provider account/key scope and immutable envelope. A new Resend account is not a safe retry target for uncertain old records. Provider/account changes require operator reconciliation first. Do not bypass the window by editing rows or assigning a fresh key. If the request never reached the provider, a crash can still leave uncertainty: prefer preserving that uncertainty over duplicate mail.

## Sender activation: owner decision remains

The fixed recipient is exactly **andresmongeliano@gmail.com**. It is a recipient, not a verified sending domain. Submitter email is validated Reply-To, never From.

Recommended: approve a Resend account, an owned verified sending domain/subdomain and one bare From email on that domain, with a sending-only domain-scoped API credential. Set server-only `RESEND_API_KEY` and `FEEDBACK_FROM_EMAIL` privately for the authorized runtime. No SDK or shared email platform is required. Leave both empty until approved; saving still works.

Alternative: separately approve a Gmail sending account and consent/credential lifecycle using `gmail.send`. Nami's existing Google login (`openid email profile`) and the assistant's Google Workspace connection do not grant app-runtime outbound permission. Gmail would require a different adapter and a revised uncertain-retry policy; it is not implemented. Do not reuse OAuth secrets/scopes or provision paid services, DNS or domains without approval.

Resend's public `resend.dev` testing sender can send only to the provider account's email. Do not mistake that restriction for a production sender setup. Primary documentation: [send API](https://resend.com/docs/api-reference/emails/send-email), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [domain verification](https://resend.com/docs/dashboard/domains/introduction), [testing restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes). Recheck the provider contract before activating or changing providers.

## Private operator review and retry

The CLI requires an explicit `--target development` or `--target production` matching process variable `FEEDBACK_DATABASE_TARGET`. It reads `DATABASE_URL`, `RESEND_API_KEY` and `FEEDBACK_FROM_EMAIL` only from an owner-approved private process environment. Use existing private env-file or secret-manager injection patterns in [Verify Nami](nami-verification.md); never place resolved credentials in command arguments, shell history, Git or output files. Its errors are generic and never print provider responses.

With that environment injected, the command forms are:

```sh
npm run feedback -- list --target development
npm run feedback -- inspect --target development --id <record-uuid> --output report.json
npm run feedback -- retry --target development --id <record-uuid> --confirm-send yes
npm run feedback -- reconcile --target development --id <record-uuid> --provider-id <verified-provider-id> --confirm-reconciled yes
```

`list` returns up to 100 recent IDs/times/status/attempt counts without bodies or emails. `inspect` writes one record exclusively beneath `.context/revelio/feedback/`, with mode0600, a basename-only output and no symlink path components; it will not overwrite an existing file. Keep this directory private and ignored. The implementation supports explicit production target selection, but no production command is authorized by this local feature work.

`retry` is the only CLI command that sends email. It uses the same claim, timeout, immutable envelope and deduplication rules as the API. `reconcile` does not send: use it only after independently establishing the provider acceptance ID for this exact report. It refuses a record with a live claim. It is not a way to declare an unknown outcome accepted. No polling job, cron or automated operator action is installed; the founder checks pending feedback during their feedback/early-access review.

## Local verification and later real-email proof

Use the guarded disposable PostgreSQL launcher for `server/storage.feedback.test.ts`, migration tests, feedback route/app privacy, delivery/CLI tests, dialog tests and Explore tests. Run the full guarded suite, `npm run check` and an exact approved HTTPS-origin build for the local candidate. Email transport in these tests is fake; no real message is needed. Follow the verification matrix for rendered 320/359/390px and desktop light/dark, keyboard containment/focus return, Chat/Map access and draft/attachment preservation.

Actual delivery remains **Not run** until separately authorized. After sender setup, migration/configuration review and exact checked prebuilt target approval:

1. Establish enterprise-origin and platform access separately from Nami app authentication. Use approved external agent-browser tooling, not founder cookies/CDP or external CUA. Confirm designated QA identity `konfidenz.clothing@gmail.com` and preserve its existing checkpoint.
2. Obtain authorization for one synthetic feedback submission and resulting email to the exact founder inbox. Record target/source/build, QA identity and intended harmless text; do not include personal conversations.
3. Submit through visible Send feedback, retain the saved record ID, and verify the one durable row plus persisted provider acceptance ID. Opening/closing/sending must leave Chat/Map, draft/attachments and canonical map revision unchanged.
4. Confirm actual receipt in the agreed founder inbox and inspect safe Reply-To for the designated submitter. A provider200 alone is not a delivered pass. No reply email is authorized by a test of Reply-To.
5. Record Pass/Fail/Blocked/Partial/Not run for storage, provider acceptance, inbox receipt and UI/state separately. Retain first failures, diagnose before retry, and use the existing row/key rather than sending repeated fresh reports.

No real email, provider provisioning, remote configuration, production migration, push or deployment occurred during local implementation. Local fixture rendering cannot establish deployed Google auth, production durability or email delivery.

## Data lifecycle

`user_feedback` holds deliberately submitted text and a session-derived email snapshot, plus the frozen notification envelope once attempted. It is excluded from prompts, conversation history, career maps and Method reset. Method reset is not whole-account erasure. Include this table, private inspection exports and any already sent email/provider retention in a future whole-account deletion review. The founder deferred additional whole-account erasure tooling until a deletion request; this feature does not claim that cross-store erasure is complete. Never export a cohort or founder transcript to review feedback.

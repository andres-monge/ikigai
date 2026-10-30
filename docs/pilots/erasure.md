# Early-access erasure handling

This runbook covers private local reporting/review copies. It does not claim to complete account or cross-store erasure. A request stays pending until all applicable stores have been checked.

Record the request privately with its participant key, source/date and owner. Stop generating new copies for that participant while handling it. Do not treat correction tombstones or previously derived observations as exemptions from deletion.

## Local preview and apply

The private root is `.context/early-access/`. Every generated output has a sidecar `.manifest.json` listing its participant keys and format. Register manually created field cards, Learning Thread files and the roster before relying on the inventory. The preview reports untracked files that still require inspection; it cannot know whether an unregistered copy contains participant material.

```sh
node --import tsx scripts/early-access.ts purge --participant person-one
node --import tsx scripts/early-access.ts purge --participant person-one --apply
```

Preview is read-only. Apply is a separate explicit local action and needs no database/provider credentials. It removes single-participant exports and identity lookup results. For registered cohort reports it removes the participant row, recomputes aggregates and regenerates the Markdown companion. Structured notes preserve unrelated entries. Registered rosters remove the participant's enrollment note and immutable binding, along with a matching exclusion entry.

Ambiguous shared prose and multi-person entries block apply before any purge mutation. Separate or redact the participant material manually, preserve other people's unrelated material, and update the registered note. Never delete an entire shared Learning Thread merely because one entry concerns the requesting participant. Re-run preview afterwards. Untracked copies are reported, and the command exits nonzero while untracked files remain. A successful local apply does not establish that all private copies were tracked, or that server/provider erasure occurred.

Keep raw conversations and derived field cards, summaries, reports, aggregate outputs and Learning Thread entries within this handling. Check other explicitly known copies and review-tool exports. Avoid making unnecessary copies in the first place. The tool touches only its validated repo-local private root and does not delete outside files.

## Remaining cross-store work

The broader pilot/account erasure workflow still needs to cover Better Auth identity/provider/session data, personal Method/map/history/drafts/turns/leases/idempotency/mappings and provider conversations/items. Existing server erasure retry state must remain pending when provider deletion fails. Every provider page/item must be handled before considering provider conversation deletion complete. Local reporting purge never calls those APIs or clears that retry state.

Track app/database, auth, provider and local-derived-output completion separately. Confirm the founder's real contact in the invitation before sending it. Tell a participant what remains pending where applicable; do not claim legal compliance or complete erasure based on this local command alone.

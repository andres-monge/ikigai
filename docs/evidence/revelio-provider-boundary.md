# Revelio Provider Boundary Receipt

- **Gate:** G1 — re-prove the amended provider boundary
- **Observed:** 2026-09-02
- **Result:** Pass
- **Selected route:** one Response per functional step through one `ToolLoopAgent`
- **Selected pinned snapshot:** `gpt-5.6-luna`
- **Provider:** OpenAI Responses through `@ai-sdk/openai`
- **Conversation storage:** one OpenAI Conversation with `store: true`
- **Supporting change:** the path-limited G1 commit containing this receipt

## Decision

Use the explicit one-Response-per-step route inside the same request-scoped
`ToolLoopAgent` policy, model, stored Conversation, and finite 20-Response turn
budget. Keep `toolChoice: "auto"`, `parallelToolCalls: false`, native non-preview
`web_search`, and the state-selected strict Method-tool subset.

The pinned SDK's default multi-step route is not selected for researched writes.
Live evidence showed that a custom function can execute before `onStepEnd` exposes
the completed hosted-search result, so that function cannot consume a
server-minted evidence handle in the same Response. The strict write rejects or
withholds at that boundary. The server then ledgers the completed search
Response, refreshes the lower-priority handle manifest and authoritative state,
and allows the next Response in the same agent loop to retry. This keeps exact
write authority without a classifier, isolated research context, query rewrite,
hardcoded taxonomy, or separate research-model call.

## Versions and selected model

| Surface | Live observed value |
|---|---|
| Node.js | `v24.19.0` |
| Vercel AI SDK | `ai@7.0.66` |
| OpenAI provider | `@ai-sdk/openai@4.0.42` |
| Configured model | `gpt-5.6-luna` |
| Actual response model id | `gpt-5.6-luna` |
| Native SDK default stop condition | `isStepCount(20)` |
| Fallback budget | 20 Responses per turn |

The post-integration diagnostic repeat kept `gpt-5.6-luna` selected and also
observed `gpt-5.6-sol` pass. Each reported actual response model id matched its
configured candidate. A future model outside this observed passing set must
reopen G1.

| Candidate | Result | Strengthened-matrix evidence |
|---|---:|---|
| `gpt-5.6-luna` | Pass; selected | Fresh, stale-premise, mixed reflective/current, fresh follow-up, multilingual, and hostile-retrieval cases all searched before the exact claim and retained a claim-linked citation. |
| `gpt-5.6-sol` | Pass; not selected | Fresh, stale-premise, mixed reflective/current, fresh follow-up, multilingual, and hostile-retrieval cases all searched before the exact claim and retained a claim-linked citation. |
| `gpt-5.5-2026-04-23` | Excluded | The fresh-fact case did not attach a normalized HTTPS citation to the exact claim. |

## Live amended assertion receipt

| Assertion | Result | Evidence observed |
|---|---:|---|
| One intelligent loop | Pass | Seventeen fallback Responses reused one `ToolLoopAgent`, model, policy, and stored Conversation. No classifier, routing model, no-write tool, or research model was present. |
| Automatic native choice | Pass | Every tool-eligible request used `tool_choice: auto`; natural conversation chose no tool, search-only chose hosted search, and strict-operation cases chose the stage tool. |
| Native search surface | Pass | Observed provider requests contained non-preview `web_search`; no `web_search_preview` tool appeared. |
| Context ownership and priority | Pass | Every Response used the same server-owned Conversation with `store: true`; the focused Career Map and evidence manifest were lower-priority request input and never developer instructions. |
| Per-Response Method refresh | Pass | Stable Method policy and the current request-scoped active tool set were supplied for every functional step. |
| Same-Response provenance timing | Pass, native route rejected | A native Response executed the custom function while the ledger was false; completed hosted-search evidence became visible only at `onStepEnd`. The native run observed two SDK steps under its default stop condition. |
| False-negative fallback | Pass | A premature researched write returned `EvidenceHandleRejected`; after completed search and claim/citation association, the server minted a handle and the next Response committed exactly one write. |
| Provider-derived association | Pass | The ledger observed every provider search call/result/action in response order, matched the citation to its actual call/result source, then accepted an HTTPS URL annotation adjacent to the exact canonical claim. It minted a handle bound to user, turn, lease, provider call/result, target, revision, field, exact claim span, and NFC-normalized claim. Seven cross-binding controls plus missing/conflicting-citation controls rejected. Missing exact result content stayed `cited-provenance`. |
| Visible citation | Pass | The retained search-only answer contained the exact claim and a provider citation/source part. Consulted search events alone did not mint claim support. |
| Result barrier | Pass | Tool-using Responses released neither pre-result prose nor orphaned sources. Tool-free responses were released only at their settled step boundary. |
| Result continuation | Pass | Committed, idempotent replay, conflict, rejection, and tool-error results each continued naturally in a later Response after the authoritative boundary. |
| UI-owned status transport | Pass | Custom attempts emitted exactly one `Saving` followed by one monotonic `Saved`, `Conflict`, `Rejected`, or `Failed`; replay mapped to `Saved`. Search and no-tool turns emitted no save status. The parts crossed an actual AI SDK UI-message stream with operation correlation, transient status data, normalized source parts, and status-free assistant text. |
| Compaction boundary | Pass | After every hosted-search and custom-tool result settled, a long next-turn request enabled compaction exactly once and produced a real provider compaction item. No pending custom-tool output crossed it. |
| Conversation de-duplication and display provenance | Pass | All stored Conversation item ids were distinct. Each genuine user utterance and lower-priority internal refresh appeared once; the display projection excluded internal context by the server-recorded item-id set rather than prefix filtering. |
| Cancellation | Pass | Cancellation before write produced zero writes and no displayed prose. Cancellation after commit-before-narration preserved exactly one write and its Saved state, emitted no prose, and started no later provider Response. |
| Repeated model matrix | Pass for selected snapshot | Luna searched before claims, preserved exact claim-linked citations, and made no canonical write for fresh, stale-premise, mixed reflective/current, fresh follow-up, multilingual, and hostile-retrieval turns. The hostile case searched for real indirect-injection examples; no private focused-context sentinel entered prose, follow-on search, or tool arguments. Sol also passed this repeat; GPT-5.5 remained excluded by the exact citation failure above. |
| Search outage | Pass | A synthetic provider outage traversed the selected stored-Conversation route with focused lower-priority context, released no claim, and performed no canonical write. |
| Cleanup | Pass | Every generated Conversation was exhaustively emptied and deleted; the final receipt reported `cleanup: completed`. |

The unchanged prior G1 live receipt remains supporting evidence for the preserved
lease, message/tool idempotency, live abort propagation, post-abort lease release,
and reverse-order exhaustive Conversation deletion primitives. U4/U5 must bind
the amended ledger and status writes to those durable primitives and repeat their
focused cancellation, stale-lease, idempotency, and erasure tests. The amended
provider decision does not rely on the prior receipt's isolated-research or
internal no-write assertions; those are superseded and are not acceptance
evidence.

## Commands and observed results

```text
/Users/andresm/.nvm/versions/node/v24.19.0/bin/node --check \
  scripts/openai-provider-g1-amended.mjs
PASS

/Users/andresm/.nvm/versions/node/v24.19.0/bin/node --no-warnings \
  --experimental-loader=/tmp/ikigai-primary-node-modules-loader.mjs \
  --env-file=<authorized-primary-checkout-env> \
  scripts/openai-provider-g1-amended.mjs
PASS — selectedRoute one-response-per-step; actual model gpt-5.6-luna;
native custom-before-ledger observed; fallback reject→ledger→retry committed;
17 Responses; 2 agent writes plus one simulated concurrent revision advance;
all five authoritative result continuations, real compaction, both cancellation
boundaries, the three-candidate comparison, selected-model matrix, safe outage,
and cleanup passed. Candidate classes were Luna pass, Sol pass, and GPT-5.5 fail
for a fresh-fact response without an exact claim-linked HTTPS citation.
```

An immediately preceding repeat stopped at the selected-model aggregate quality
assertion before the harness reported candidate-level diagnostics. The bounded
diagnostic amendment made no proof-policy change; its next full run produced the
per-candidate results above. Automatic choice remains nondeterministic, so the
selected model's matrix remains a repeatable release gate rather than a timeless
capability claim.

The managed worktree intentionally had no dependency installation. The temporary
read-only loader resolved the exact `package-lock.json` versions from the primary
checkout without modifying it, and the authorized ignored environment file was
referenced in place. No credential, Conversation id, user identity, prompt,
Career Map value, source URL/body, citation excerpt, provider payload, or raw tool
argument was copied, persisted, logged, or committed.

In a provisioned checkout with local dependencies and `.env`, the durable entry
point is:

```text
PATH=/Users/andresm/.nvm/versions/node/v24.19.0/bin:$PATH npm run spike:openai
```

## Boundaries and residual proof

G1 proves the amended provider route with synthetic in-memory state. U4 owns the
durable evidence schema, atomic map/history/source association, rollout reader,
lease fence, and local erasure. U5 owns the production loop, transport, bounded
history, provider-item erasure, cancellation races, and exact application status
channel. U6 remains out of scope and will consume, not define, that transport.

Automatic choice remains nondeterministic. U5 and later live evaluations must
repeat the now-passing fresh, stale, mixed, follow-up, multilingual, outage,
conflicting/missing-citation, and hostile-retrieval cases through the production
composition. Repetition cannot add a classifier, pre-search gate, second context,
query transformation, or extra model round trip.

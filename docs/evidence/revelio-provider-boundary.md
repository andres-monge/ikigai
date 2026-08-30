# Revelio Provider Boundary Receipt

- **Gate:** G1 — Prove the provider boundary before the Method kernel
- **Observed:** 2026-08-30
- **Result:** Pass
- **Selected route:** AI SDK `ToolLoopAgent` with `prepareStep`
- **Selected pinned snapshot:** `gpt-5.6-luna`
- **Provider:** OpenAI Responses through `@ai-sdk/openai`
- **Conversation storage:** OpenAI Conversations with `store: true`
- **Supporting commit:** `323a119c1fe1b3bfa984a63bbcb3e3c074bdaffc` (`feat(provider): prove provider boundary (G1)`)

## Decision

Use the native AI SDK route. `ToolLoopAgent` keeps its top-level `instructions` unset and reloads request-scoped OpenAI instructions, the active module, and the active tool set in `prepareStep` after every committed result. Compaction is included only on step zero of a new turn and omitted from later tool-result continuation steps.

The explicit one-Response-per-step route also passed the feasibility probe, including streamed narration and safe tool-result continuation through the same Conversation, but is not selected. No fallback budget governs the selected native route. If the fallback is later selected, configure a finite cap of **20 Responses per turn**. That cap is a recorded contingency constraint, not a claim that the three-Response feasibility probe exercised all 20 Responses.

## Candidate comparison

The spike first confirmed the candidate ids against the authenticated `/v1/models` catalog, then ran the same native lease, stream, Conversation, per-step refresh, isolated-research, provenance, abort, idempotency, result-gating, same-turn transition, and safe-compaction assertions for each candidate.

| Candidate | Native result | Final strengthened matrix | Note |
|---|---:|---:|---|
| `gpt-5.6-luna` | Pass | 14,829 ms | Passed automatic tool choice and every final assertion; selected. |
| `gpt-5.6-sol` | Pass | 15,760 ms | Passed every final assertion. |
| `gpt-5.5-2026-04-23` | Pass | 15,561 ms | Passed every final assertion. |
| `gpt-5.6-terra` | Fail | 14,847 ms | Narrated before both results committed under automatic tool choice. Its explicit fallback route passed in a focused rerun, so it is excluded from the native passing set rather than treated as provider-incompatible. |
| `gpt-5.5-pro-2026-04-23` | Fail | 756 ms | Rejects the shared `reasoningEffort: low` request contract. |

**Native passing set available to U3:** `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.5-2026-04-23`.

Durations come from one synthetic final matrix after review hardening, not a latency benchmark. Luna passed every final assertion and was the fastest member of the final native passing set. U3's golden transcripts remain the representative quality/latency comparison; a later model outside the passing set reopens G1 before use.

## Versions

| Surface | Observed version |
|---|---|
| Node.js | `v24.19.0` |
| Vercel AI SDK | `ai@7.0.66` |
| OpenAI provider | `@ai-sdk/openai@4.0.42` |
| OpenAI API | Responses + Conversations, live on 2026-08-30 |

The repository's existing `npm run spike:openai` script and `.env` loading were already correct and remain the entry point. `package-lock.json` supplies the exact installed SDK versions above.

## Assertion receipt

| Assertion | Native result | Evidence observed |
|---|---:|---|
| Natural streamed chat plus typed canonical changes (Method R41) | Pass | Two strict function results committed before a non-empty final narration streamed. |
| Seven-module architecture remains state-selected (Method R44–R45) | Pass | The synthetic selector moved `form-foundation` → `create-purpose-paths` → `complete`; the active tools changed on each step. The spike proves the refresh seam, not U2 module behavior. |
| Strict calls do not replace grounding, confirmation, or validation (Method R46) | Pass | Narrow Zod tools returned committed revision/module envelopes; research ran separately and no state claim was narrated before results. |
| Repository-owned modules remain application-owned (Method KTD3) | Pass | Only request-scoped synthetic module instructions were supplied; no hosted Skill or filesystem authority was exposed. |
| Request-scoped instructions and OpenAI Conversation ownership (Method KTD4) | Pass | Every native step carried server-resolved Conversation options, fresh OpenAI instructions, and the focused private briefing; the raw private state stayed out of the request and no marker appeared as a stored developer/system item. `ToolLoopAgent.instructions` was unset. A deterministic negative control proved the request-boundary detector recognizes both private marker classes. |
| Result-gated narration (Method KTD4) | Pass | Under production-relevant automatic tool choice, no non-whitespace text delta was emitted before both operation results; narration streamed only after the authoritative second result. |
| Isolated, de-identified research (Method KTD10) | Pass | Research requests had no Conversation, used `store: false`, contained neither the raw-state nor focused-briefing marker, and accepted only a synthetic public-fact query. |
| Opaque source handle and cited provenance (Method KTD10) | Pass | The server derived an opaque handle from the provider web-search result id and HTTPS citation URL. Retrieval time was valid; an optional title was observed; exact citation content and included provider result content were both available. No URL or content is retained in this receipt. |
| Reload/reselect after every result (Method KTD12) | Pass | `prepareStep` observed the committed state before steps 1 and 2, changed request instructions, and replaced the active tool set before the next model call. |
| Same-turn confirmation-to-next-module transition | Pass | Confirmation committed in step 0; the next-module tool was selected and committed in step 1; final narration streamed in step 2. |
| SDK default loop behavior | Pass | Native `ToolLoopAgent` used no custom `stopWhen`; the pinned SDK default remains authoritative. |
| In-memory lease and message idempotency | Pass | First acquisition succeeded; same-message in-flight retry attached; a different concurrent message conflicted; completion replay returned the terminal result; completion and cancellation released the lease. |
| Tool-call idempotency | Pass | Each live synthetic operation was applied once, then replayed by tool-call id and payload fingerprint without a second state change. |
| Conversation ownership | Pass | User-to-Conversation mapping was server-owned; an injected client Conversation value was ignored; an unknown owner failed closed. |
| Abort propagation | Pass | Native and explicit-fallback client aborts reached the active tool signal and produced an observed abort or abort-shaped rejection; neither route accepted controller state alone as proof. Both emitted no later narration, made no later provider step, marked the turn cancelled, and released the lease for the next turn. |
| Safe compaction boundary | Pass | A compaction item was observed; request tracing showed compaction on step zero only and no compaction on pending tool-result continuation steps. |
| Explicit one-Response-per-step fallback | Pass, not selected | Three streamed Responses reused the server-owned Conversation, passed tool-result messages explicitly, refreshed instructions/tools after each committed result, rejected any premature non-whitespace narration, and compacted only on the first Response. Its independent isolated-research/provenance and direct-`streamText` abort/lease probes also passed; the top-level gate fails if this contingency fails even while native remains selected. |
| Cleanup | Pass | The final live payload reported `cleanupCompleted: true`; Conversation items were paginated and deleted before each Conversation. |

## Commands and observed results

```text
node --check scripts/openai-provider-spike.mjs
PASS

PATH=/Users/andresm/.nvm/versions/node/v24.19.0/bin:$PATH npm run spike:openai
PASS after review hardening — selected route ai-sdk-tool-loop-agent-prepare-step;
selected model gpt-5.6-luna; native passing set gpt-5.6-luna, gpt-5.6-sol,
gpt-5.5-2026-04-23; fallback feasibility pass; cleanup completed.

PATH=/Users/andresm/.nvm/versions/node/v24.19.0/bin:$PATH \
  OPENAI_SPIKE_MODELS=gpt-5.6-luna npm run spike:openai
PASS after review hardening — native and fallback routes, isolated research, abort, and cleanup.

PATH=/Users/andresm/.nvm/versions/node/v24.19.0/bin:$PATH \
  OPENAI_SPIKE_MODEL=gpt-5.6-terra OPENAI_SPIKE_MODELS=gpt-5.6-terra \
  npm run spike:openai
PASS through the explicit fallback — Terra's native route failed the stricter automatic-tool-choice
narration gate; the independent fallback research, abort, lease, and cleanup checks passed.
```

Before implementation, the existing `npm run spike:openai` passed on `gpt-5.6-luna` but emitted only the I1-era threading, request-instructions, web-search/custom-tool composition, and compaction fields. It did not characterize G1's per-step refresh, isolated provenance, result gate, same-turn transition, lease/idempotency/ownership harness, or live abort; that missing evidence was the pre-change characterization gap.

## Privacy and provider use

All live calls used generated identifiers, repeated synthetic context, and a public time-zone fact. The harness output and this receipt retain no API key, Conversation id, user identity, prompt or briefing, career-map value, tool argument payload, source URL, source body, provider response body, or citation excerpt. Provider REST failures are reduced to an allowlisted operation, HTTP status, and error class; a deterministic fault injection proves Conversation/item identifiers and provider messages are redacted.

The G1 implementation session made live Responses and web-search calls during the baseline characterization, selected-model debugging, and the final five-candidate matrix. These calls may be billable. The harness did not calculate or retain a monetary cost total. Every run reached cleanup without a cleanup error; the authoritative final run explicitly reported cleanup completion.

## Boundary and next proof

This receipt proves provider feasibility before U2. It deliberately uses in-memory canonical state and lease/idempotency records; it does not implement Method modules or PostgreSQL durability. U5 must repeat these assertions with the real PostgreSQL lease, turn, mapping, operation-history, research, and Method coordinator composition.

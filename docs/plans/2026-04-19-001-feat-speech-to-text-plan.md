---
title: "feat: Add speech-to-text for questionnaire textareas"
type: feat
status: active
date: 2026-04-19
origin: docs/brainstorms/2026-04-19-speech-to-text-requirements.md
---

# feat: Add speech-to-text for questionnaire textareas

## Overview

Add a microphone button to each questionnaire textarea that lets users speak their answers instead of (or in addition to) typing. Recorded audio is sent to the server, transcribed by Groq Whisper via Vercel AI SDK, and the resulting text is appended to the textarea. This reduces friction for braindump-style responses and improves answer quality — especially on mobile.

## Problem Frame

Users face friction when answering open-ended questionnaire questions by typing. Speaking is 3-4x faster and produces richer, more natural responses, which feeds better AI analysis downstream. The current questionnaire has no voice input capability. (see origin: `docs/brainstorms/2026-04-19-speech-to-text-requirements.md`)

## Requirements Trace

- R1. Each textarea has a mic icon button that starts/stops audio recording
- R2. Recorded audio is sent to Groq Whisper via Vercel AI SDK `experimental_transcribe` for transcription
- R3. Transcribed text is appended to existing textarea content (not replaced)
- R4. Transcription supports English and Spanish, matching the app's current language setting
- R5. Visual feedback indicates recording state (pulsing icon, color change)
- R6. Mic icon is hidden in browsers that don't support `MediaRecorder`/`getUserMedia` (graceful degradation)
- R7. Clear error feedback when mic permission is denied or transcription fails

## Success Criteria

- Users can speak an answer and see accurate text appear in the textarea within a few seconds of stopping recording (see origin)
- The feature feels lightweight and optional — never blocks the typing flow (see origin)
- Works reliably in Chrome and Edge (see origin)

## Scope Boundaries

- No real-time streaming of partial transcription (Groq is batch)
- No AI cleanup/polishing of spoken answers
- No voice commands or voice navigation
- No offline support
- Accessibility improvements (aria-live regions, screen reader announcements) deferred to follow-up

### Deferred to Separate Tasks

- Safari/iOS optimization: MVP is Chrome + Edge. Safari should work since Groq accepts mp4, but format-specific edge cases are deferred
- Proactive permission state detection (`navigator.permissions.query`) — MVP uses the standard browser permission prompt flow
- Recording duration countdown timer UI — auto-stop is included, visual countdown deferred

## Context & Research

### Relevant Code and Patterns

| Concern | File |
|---------|------|
| Questionnaire textareas and state | `client/src/components/questionnaire/single-page-questionnaire.tsx` |
| Custom hook pattern (model to follow) | `client/src/hooks/use-sound-effect.ts` |
| Server route structure | `server/routes/assessment/purpose-discovery.ts` |
| Route registration hub | `server/routes.ts` |
| Environment variable validation | `server/env.ts` |
| Error classes and codes | `server/utils/errors.ts` |
| i18n translations | `client/src/lib/i18n.ts` |
| AI model factory pattern | `server/ai/google-structured-model.ts` |

### External References

- Vercel AI SDK `experimental_transcribe` — still exported under experimental prefix in `ai@6.0.158`; function signature accepts `{ model, audio, providerOptions }` and returns `{ text, segments, language, durationInSeconds }`
- `@ai-sdk/groq` — `groq.transcription('whisper-large-v3-turbo')` creates the transcription model; reads `GROQ_API_KEY` from env automatically
- Groq Whisper accepts: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm. Max 25MB
- Chrome MediaRecorder defaults to `audio/webm;codecs=opus`; Safari uses `audio/mp4` — both accepted by Groq, no conversion needed

## Key Technical Decisions

- **Raw binary body over base64 JSON**: Audio is sent as a raw `Blob` in the request body with the `Content-Type` matching the recorded mime type (`audio/webm` on Chrome/Firefox, `audio/mp4` on Safari). The server uses route-scoped `express.raw()` to receive it as a `Buffer`, which passes directly to `transcribe()`. This avoids 33% base64 overhead and adding multipart middleware. Language is sent as a query parameter. (see origin: Key Decisions section)
- **One active recording at a time**: Starting a recording on textarea B auto-stops any active recording on textarea A. This simplifies state management (single global hook) and matches standard voice-input UX patterns
- **Auto-stop at 120 seconds**: Prevents runaway recordings. Students answering one question rarely need more than 2 minutes of speech
- **Smart text separator**: When appending transcribed text, prepend a space if the existing content doesn't end with whitespace. Prevents "paintingand" concatenation artifacts
- **`whisper-large-v3-turbo` over `whisper-large-v3`**: Lower latency for the same accuracy on short speech segments. Good fit for questionnaire answers
- **Cross-browser mime type detection**: Use `MediaRecorder.isTypeSupported()` to pick `audio/webm;codecs=opus` (Chrome/Edge/Firefox) or fall back to `audio/mp4` (Safari). Both accepted by Groq

## Open Questions

### Resolved During Planning

- **Audio format compatibility**: Chrome webm/opus and Safari mp4 are both in Groq's supported format list. No server-side conversion needed
- **Mic button placement**: Adjacent to textarea in a wrapping container div, positioned top-right using absolute positioning
- **Transcription route location**: Dedicated `server/routes/transcription.ts` — transcription is a generic utility, not assessment-specific
- **Recording state UI**: Three states — idle (Mic icon), recording (pulsing red Mic icon), processing (spinning Loader2 icon, disabled). Uses Lucide icons + Tailwind animations
- **Audio transport mechanism**: Raw binary body + route-scoped `express.raw()` — simplest approach that avoids new dependencies and base64 overhead
- **`experimental_transcribe` naming**: The function is still exported as `experimental_transcribe` in `ai@6.0.158`. Import as `import { experimental_transcribe as transcribe } from 'ai'`
- **Empty transcription handling**: Show informational toast "No speech detected" via `useToast` — don't modify textarea
- **Error display pattern**: Use existing `useToast` hook (`client/src/hooks/use-toast.ts`) for all error/info messages — consistent with codebase patterns
- **Hook-to-component data flow**: The hook accepts an `onTranscription(textareaId, text)` callback that the component uses to wire transcription results into `handleTextareaChange`
- **Concurrent recordings**: One at a time with auto-stop of previous recording

### Deferred to Implementation

- **Precise Tailwind animation classes for recording pulse**: Will be tuned visually during implementation
- **Optimal `timeslice` parameter for MediaRecorder**: May improve chunk granularity for cleanup; discover during implementation

## Implementation Units

- [ ] **Unit 1: Install dependencies and configure environment**

**Goal:** Establish the foundation — install the Groq provider package and register the API key in the environment validation schema.

**Requirements:** R2 (prerequisites for server-side transcription)

**Dependencies:** None

**Files:**
- Modify: `package.json` (add `@ai-sdk/groq` dependency)
- Modify: `server/env.ts` (add `GROQ_API_KEY` to Zod schema)

**Approach:**
- Run `npm install @ai-sdk/groq` to add the package
- Add `GROQ_API_KEY: z.string().default('')` to the `envSchema` in `server/env.ts`. Unlike `GEMINI_API_KEY` (which is required for core functionality), `GROQ_API_KEY` powers an optional feature — making it optional with a default prevents crashing existing deployments that don't have it yet. The transcription route validates its presence at request time and returns a clear error if missing
- The `@ai-sdk/groq` provider reads `GROQ_API_KEY` from `process.env` automatically

**Patterns to follow:**
- `server/env.ts` — existing `GEMINI_API_KEY` entry pattern

**Test expectation:** none — pure dependency and config scaffolding

**Verification:**
- `npm install` completes without errors
- `npm run check` passes with the new env var in the schema
- Server starts successfully when `GROQ_API_KEY` is present in `.env`

---

- [ ] **Unit 2: Create server-side transcription endpoint**

**Goal:** Add a `POST /api/transcribe` endpoint that receives raw audio, calls Groq Whisper via Vercel AI SDK, and returns the transcribed text.

**Requirements:** R2, R4, R7

**Dependencies:** Unit 1

**Files:**
- Create: `server/routes/transcription.ts`
- Modify: `server/routes.ts` (mount the new router)
- Test: `tests/integration/transcription.test.ts`

**Approach:**
- Create a new Express `Router` in `server/routes/transcription.ts` following the pattern in `server/routes/assessment/purpose-discovery.ts`
- Apply `express.raw({ type: 'audio/*', limit: '5mb' })` as route-level middleware on the POST handler. This coexists with the global `express.json()` because Express body parsers check `Content-Type` — `json()` only matches `application/json`, so audio requests with `Content-Type: audio/*` pass through it untouched and are parsed by the route-level `raw()` middleware instead. The 5MB limit aligns with Vercel's serverless body size constraints while exceeding practical recording sizes (~500KB for 2 min webm/opus)
- Accept `language` query parameter (validate: `en` or `es`, default `en`)
- Import `experimental_transcribe as transcribe` from `ai` and `groq` from `@ai-sdk/groq`
- Call `transcribe()` with `groq.transcription('whisper-large-v3-turbo')`, pass `req.body` (Buffer) as `audio`, and set `providerOptions.groq.language` from the query param
- Return `{ text: result.text }` on success
- Return structured error JSON with appropriate error codes on failure (Groq errors, empty body, invalid content type). Add a `TRANSCRIPTION_ERROR` code to `server/utils/errors.ts` following the existing error code pattern
- Mount in `server/routes.ts` as `apiRouter.use("/transcribe", transcriptionRouter)`

**Patterns to follow:**
- `server/routes/assessment/purpose-discovery.ts` — route structure, error handling shape
- `server/utils/errors.ts` — error classes and codes
- `server/env.ts` — env var access pattern

**Test scenarios:**
- Happy path: POST with valid webm audio buffer and `?language=en` returns `{ text: "..." }` with 200 status
- Happy path: POST with `?language=es` passes Spanish language hint to Groq provider options
- Error path: POST with empty body returns 400 with descriptive error
- Error path: POST with missing/invalid content type returns 400
- Error path: POST with invalid language parameter returns 400
- Error path: Groq API failure (mock) returns 500 with user-friendly error message
- Edge case: POST with very short audio (< 1 second) where Groq returns empty text — returns `{ text: "" }` with 200 (client handles the empty case)

**Verification:**
- Integration test suite passes
- Endpoint responds correctly when tested with a real audio file via curl
- `npm run check` passes

---

- [ ] **Unit 3: Create `useSpeechToText` hook**

**Goal:** Build a React hook that manages the full recording lifecycle — feature detection, MediaRecorder control, audio capture, server communication, and state management. Enforces single-active-recording and auto-stop at 120 seconds.

**Requirements:** R1, R2, R3, R4, R5, R6, R7

**Dependencies:** Unit 2

**Files:**
- Create: `client/src/hooks/use-speech-to-text.ts`
- Test: `client/src/hooks/use-speech-to-text.test.ts`

**Approach:**
- Export `useSpeechToText(options: { language: string, onTranscription: (textareaId: string, text: string) => void })` hook. The `onTranscription` callback is how the hook delivers transcribed text back to the component — the component passes a function that calls `handleTextareaChange` with the smart separator logic
- **Feature detection**: Check `navigator.mediaDevices?.getUserMedia` and `MediaRecorder` at hook init. Expose `isSupported: boolean`
- **State machine**: Track state as `'idle' | 'recording' | 'processing'` — expose as `recordingState`
- **Single-recording enforcement**: Use a module-level `AbortController` or ref to ensure only one MediaRecorder is active across all hook instances. Starting a new recording signals the previous to stop
- **Start recording**: Request mic permission via `getUserMedia({ audio: true })`, create `MediaRecorder` with detected mime type (`audio/webm;codecs=opus` or `audio/mp4` fallback), collect chunks via `ondataavailable`, set state to `'recording'`
- **Auto-stop timer**: Start a 120-second timeout on recording start. Auto-stop when reached
- **Stop recording**: Call `mediaRecorder.stop()`, assemble Blob from chunks in `onstop`, transition to `'processing'`
- **Transcription**: Send Blob to `POST /api/transcribe?language={lang}` with `Content-Type` matching the recorded mime type. Parse response JSON
- **Result handling**: On successful transcription, call `onTranscription(textareaId, text)` to deliver the result to the component. If text is empty, set `error` state with "no speech detected" message instead of calling `onTranscription`
- **Error handling**: Catch permission denial (`NotAllowedError`), device not found (`NotFoundError`), and network/server errors. Expose `error: string | null`
- **Cleanup**: Stop MediaRecorder and release `getUserMedia` stream tracks on unmount via `useEffect` cleanup
- Return: `{ isSupported, recordingState, error, startRecording: (textareaId: string) => void, stopRecording: () => void, activeTextareaId: string | null }`

**Patterns to follow:**
- `client/src/hooks/use-sound-effect.ts` — hook structure, useCallback, cleanup pattern, JSDoc
- `client/src/hooks/use-analytics.ts` — fire-and-forget async pattern

**Test scenarios:**
- Happy path: `isSupported` returns true when MediaRecorder and getUserMedia are available
- Happy path: `startRecording` transitions state from idle to recording
- Happy path: `stopRecording` transitions state from recording to processing, then back to idle after transcription
- Edge case: `isSupported` returns false when MediaRecorder is undefined
- Edge case: Starting recording while already recording auto-stops the first
- Edge case: Auto-stop fires after 120 seconds and triggers transcription
- Error path: Permission denied sets error state with descriptive message
- Error path: Server returns 500 — error state set, recording state returns to idle
- Error path: Network failure — error state set, recording state returns to idle
- Integration: Hook cleanup stops active recording and releases stream on unmount

**Verification:**
- Unit tests pass
- Hook can be imported and used in a component without type errors
- `npm run check` passes

---

- [ ] **Unit 4: Integrate mic button into questionnaire UI**

**Goal:** Wire the `useSpeechToText` hook into the questionnaire component — add mic buttons to each textarea, show visual recording state, append transcribed text, display errors, and add all i18n strings.

**Requirements:** R1, R3, R4, R5, R6, R7

**Dependencies:** Unit 3

**Files:**
- Modify: `client/src/components/questionnaire/single-page-questionnaire.tsx`
- Modify: `client/src/lib/i18n.ts`

**Approach:**

*Questionnaire component changes:*
- Import `useSpeechToText` hook and Lucide icons (`Mic`, `Loader2`)
- Call hook at the component level: `const stt = useSpeechToText({ language, onTranscription: (id, text) => handleTextareaChange(id, existingValue + smartSeparator + text) })` where `handleTextareaChange` is the existing local function in the questionnaire component that updates the `answers` state
- Wrap each `TextareaAutosize` in a `relative` container div
- Add a mic icon button positioned absolute top-right of the container with minimum 44x44px touch target. Add `pr-12` (right padding) to the textarea to prevent text from flowing under the button on narrow viewports
- Conditionally render mic button only when `stt.isSupported` is true (R6)
- Button onClick: if `stt.activeTextareaId === thisId` → `stt.stopRecording()`, else → `stt.startRecording(thisId)`
- Add dynamic `aria-label` using i18n strings: idle → `t('questionnaire.mic.start')`, recording → `t('questionnaire.mic.stop')`, processing → `t('questionnaire.mic.processing')`. This is baseline accessibility for an icon-only button, not part of the deferred aria-live work
- Visual states: idle → `Mic` icon (default color), recording on this textarea → `Mic` icon with `text-red-500 animate-pulse`, processing → `Loader2` icon with `animate-spin` + disabled
- On transcription result: the `onTranscription` callback wired in the hook call handles text appending with smart separator logic automatically
- On error: use the existing `useToast` hook (`client/src/hooks/use-toast.ts`) to show error messages via the `toast({ title, description, variant: 'destructive' })` API. For empty transcription, use the default (non-destructive) variant
- Clear error state when user starts a new recording
- Disable the submit button ("Show Me My 3 Paths") while `stt.recordingState !== 'idle'` — prevents losing in-flight recording or transcription on navigation

*i18n additions:*
- `questionnaire.mic.start` — "Speak your answer" / "Habla tu respuesta"
- `questionnaire.mic.stop` — "Stop recording" / "Dejar de grabar"
- `questionnaire.mic.processing` — "Transcribing..." / "Transcribiendo..."
- `questionnaire.mic.error.permission` — "Microphone access denied. Check your browser settings." / "Acceso al microfono denegado. Revisa la configuracion de tu navegador."
- `questionnaire.mic.error.failed` — "Transcription failed. Try again or type your answer." / "La transcripcion fallo. Intentalo de nuevo o escribe tu respuesta."
- `questionnaire.mic.error.empty` — "No speech detected. Try speaking closer to the microphone." / "No se detecto voz. Intenta hablar mas cerca del microfono."

**Patterns to follow:**
- Existing textarea rendering pattern in `single-page-questionnaire.tsx`
- `client/src/lib/i18n.ts` — flat key-value translation structure, `t('key', language)` usage
- Button component variants from `client/src/components/ui/button.tsx` — `ghost` variant, `icon` size

**Test scenarios:**
- Happy path: Mic button renders next to each textarea when browser supports MediaRecorder
- Happy path: Clicking mic starts recording, button shows red pulsing state
- Happy path: Clicking again stops recording, shows processing spinner, then appends text to textarea
- Happy path: Transcribed text appended with space separator when existing text has no trailing whitespace
- Happy path: Transcribed text appended without extra space when existing text ends with whitespace
- Edge case: Mic button does not render when `isSupported` is false
- Edge case: Starting recording on textarea B auto-stops recording on textarea A
- Edge case: Empty transcription result shows "no speech detected" message
- Error path: Permission denied shows localized error message
- Error path: Transcription failure shows localized error message with retry guidance
- Integration: i18n strings render correctly in both English and Spanish

**Verification:**
- Mic button appears on each textarea in Chrome
- Full record → transcribe → append flow works end-to-end
- Visual states transition correctly: idle → recording (pulse) → processing (spinner) → idle
- Error messages display in the correct language
- Typing still works normally alongside the mic feature
- `npm run check` passes

## System-Wide Impact

- **Interaction graph:** The mic button triggers `useSpeechToText` hook → `POST /api/transcribe` → Groq Whisper API. Result flows back through the hook callback into `handleTextareaChange`, which updates the same `answers` state that typing uses. No other system components are affected
- **Error propagation:** Groq API errors → server catches and returns structured error JSON → hook sets error state → UI displays localized message. No uncaught error paths
- **State lifecycle risks:** The main risk is orphaned MediaRecorder streams if the component unmounts during recording. Mitigated by useEffect cleanup in the hook. No database state changes — this is a pure client↔API feature
- **API surface parity:** No other interfaces need this change. The transcription endpoint is a new, standalone route
- **Unchanged invariants:** The questionnaire submission flow, answer state structure (`Record<string, string>`), and assessment save API are not modified. The mic feature only writes to the existing `answers` state through the existing `handleTextareaChange` function

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `experimental_transcribe` API changes in future AI SDK updates | Import with alias (`as transcribe`). If renamed, only the import line changes. Pin AI SDK version in package.json |
| Groq API rate limits during high usage | Return user-friendly error with retry guidance. Groq free tier allows 50 requests/min for Whisper — sufficient for questionnaire use |
| MediaRecorder output format varies by browser | Feature-detect mime type with `isTypeSupported()`. Both webm and mp4 are accepted by Groq |
| Vercel serverless cold start adds latency to first transcription | Processing state UI (spinner) sets user expectations. Cold start + transcription is typically 3-5 seconds total |
| `GROQ_API_KEY` not set in production | Env schema defaults to empty string (optional). Transcription route validates at request time and returns clear error. Server starts normally without it — STT is an optional feature |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-19-speech-to-text-requirements.md](docs/brainstorms/2026-04-19-speech-to-text-requirements.md)
- Related code: `client/src/hooks/use-sound-effect.ts` (hook pattern), `server/routes/assessment/purpose-discovery.ts` (route pattern)
- External docs: Vercel AI SDK `transcribe()` types in `node_modules/ai/dist/index.d.ts`, `@ai-sdk/groq` provider API, Groq Whisper supported formats

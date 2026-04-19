---
date: 2026-04-19
topic: speech-to-text-questionnaire
---

# Speech-to-Text for Questionnaire

## Problem Frame

Users face friction when answering questionnaire questions by typing, especially for braindump-style open-ended responses. Speaking is 3-4x faster than typing and produces richer, more thoughtful answers — which in turn feeds better AI analysis downstream. Mobile users are particularly affected.

## Requirements

**Core Transcription**
- R1. Each textarea in the questionnaire has a microphone icon button that starts/stops audio recording
- R2. Recorded audio is sent to Groq Whisper via the Vercel AI SDK `experimental_transcribe` for transcription
- R3. Transcribed text is appended to any existing content in the textarea (not replaced)
- R4. Transcription supports both English and Spanish, matching the app's current language setting

**User Experience**
- R5. Visual feedback indicates recording state (e.g., pulsing icon, color change) so the user knows when they're being recorded
- R6. The mic icon is hidden in browsers that don't support `MediaRecorder`/`getUserMedia` (graceful degradation)
- R7. Clear error feedback when mic permission is denied or transcription fails

## Success Criteria

- Users can speak an answer and see accurate text appear in the textarea within a few seconds of stopping recording
- The feature feels lightweight and optional — never blocks the typing flow
- Works reliably in Chrome and Edge

## Scope Boundaries

- No real-time streaming of partial transcription results (Groq is batch transcription)
- No AI cleanup/polishing of spoken answers (pure transcription only)
- No voice commands or voice navigation
- No offline support

## Key Decisions

- **Groq Whisper over Gemini Audio**: Whisper is purpose-built for transcription (better accuracy + speed). Gemini's advantage is LLM-powered cleanup, but that adds latency and isn't needed for MVP.
- **Groq over Google Cloud STT**: GC STT requires separate GCP project/service account setup. Groq needs only an API key and integrates cleanly with the existing Vercel AI SDK.
- **Append over replace**: Users can mix typing and speaking freely without risk of losing typed work.
- **Chrome-first**: Web Speech API was tested and found inadequate. Server-side Groq transcription works regardless of browser speech API support, but recording still requires MediaRecorder (Chrome, Edge, Safari, Firefox all support it).

## Dependencies / Assumptions

- `GROQ_API_KEY` environment variable is set (confirmed)
- Vercel AI SDK's `experimental_transcribe` is stable enough for production use (it's marked experimental)
- Browser MediaRecorder outputs audio in a format Groq accepts (likely webm/opus — needs verification during planning)

## Outstanding Questions

### Deferred to Planning
- [Affects R2][Needs research] What audio format does MediaRecorder produce in Chrome, and does Groq Whisper accept it directly or need conversion?
- [Affects R1][Technical] Best UX pattern for the mic button — inline in the textarea, or adjacent to it?
- [Affects R2][Technical] Should the transcription endpoint reuse existing server route structure or get its own route?
- [Affects R5][Technical] What recording state UI pattern works best with the existing shadcn/ui component system?

## Next Steps

-> `/ce:plan` for structured implementation planning

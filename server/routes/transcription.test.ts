/**
 * @description
 * Tests for the transcription endpoint (POST /api/transcribe).
 *
 * This test suite verifies:
 * - Happy path: valid audio returns transcribed text
 * - Language parameter forwarded correctly to Groq
 * - Validation errors for empty body, bad content type, bad language
 * - Groq API failure returns 500 with user-friendly message
 * - Missing GROQ_API_KEY returns 503
 * - Empty transcription result returns { text: "" } with 200
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Hoisted mocks (vi.mock factories are hoisted above imports) ───────
const { mockTranscribe, mockEnv, mockTranscriptionModel } = vi.hoisted(() => ({
  mockTranscribe: vi.fn(),
  mockEnv: { GROQ_API_KEY: 'test-groq-key' },
  mockTranscriptionModel: { modelId: 'whisper-large-v3-turbo' },
}));

vi.mock('ai', () => ({
  experimental_transcribe: (...args: unknown[]) => mockTranscribe(...args),
}));

vi.mock('../env.js', () => ({ env: mockEnv }));

vi.mock('@ai-sdk/groq', () => ({
  createGroq: () => ({
    transcription: () => mockTranscriptionModel,
  }),
}));

import { transcriptionRouter } from './transcription.js';

/* ------------------------------------------------------------------ */
/*                         Test App Setup                             */
/* ------------------------------------------------------------------ */

function createTestApp() {
  const app = express();
  // Note: no global express.json() needed — the route uses express.raw()
  app.use('/api/transcribe', transcriptionRouter);
  return app;
}

let app: express.Application;

beforeEach(() => {
  app = createTestApp();
  vi.clearAllMocks();
  mockEnv.GROQ_API_KEY = 'test-groq-key';
});

/* ------------------------------------------------------------------ */
/*                         Test Fixtures                              */
/* ------------------------------------------------------------------ */

/** A small valid audio buffer (simulated webm) */
const fakeAudioBuffer = Buffer.from('fake-audio-data-for-testing');

/* ------------------------------------------------------------------ */
/*                         Happy Path Tests                           */
/* ------------------------------------------------------------------ */

describe('POST /api/transcribe', () => {
  it('returns transcribed text for valid audio with language=en', async () => {
    mockTranscribe.mockResolvedValue({ text: 'I love solving problems' });

    const res = await request(app)
      .post('/api/transcribe?language=en')
      .set('Content-Type', 'audio/webm')
      .send(fakeAudioBuffer);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'I love solving problems' });
    expect(mockTranscribe).toHaveBeenCalledOnce();
  });

  it('passes Spanish language hint to Groq provider options', async () => {
    mockTranscribe.mockResolvedValue({ text: 'Me encanta resolver problemas' });

    const res = await request(app)
      .post('/api/transcribe?language=es')
      .set('Content-Type', 'audio/webm')
      .send(fakeAudioBuffer);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'Me encanta resolver problemas' });

    // Verify language was passed in providerOptions
    const callArgs = mockTranscribe.mock.calls[0][0];
    expect(callArgs.providerOptions.groq.language).toBe('es');
  });

  it('defaults to language=en when no language param is provided', async () => {
    mockTranscribe.mockResolvedValue({ text: 'Hello world' });

    const res = await request(app)
      .post('/api/transcribe')
      .set('Content-Type', 'audio/webm')
      .send(fakeAudioBuffer);

    expect(res.status).toBe(200);

    const callArgs = mockTranscribe.mock.calls[0][0];
    expect(callArgs.providerOptions.groq.language).toBe('en');
  });

  it('returns { text: "" } with 200 for very short audio that produces no speech', async () => {
    mockTranscribe.mockResolvedValue({ text: '' });

    const res = await request(app)
      .post('/api/transcribe?language=en')
      .set('Content-Type', 'audio/webm')
      .send(fakeAudioBuffer);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: '' });
  });

  /* ---------------------------------------------------------------- */
  /*                     Validation Error Tests                       */
  /* ---------------------------------------------------------------- */

  it('returns 400 when body is empty', async () => {
    const res = await request(app)
      .post('/api/transcribe?language=en')
      .set('Content-Type', 'audio/webm')
      .send(Buffer.alloc(0));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/empty/i);
  });

  it('returns 400 when Content-Type is not audio/*', async () => {
    const res = await request(app)
      .post('/api/transcribe?language=en')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'not audio' }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/content type/i);
  });

  it('returns 400 when language parameter is invalid', async () => {
    const res = await request(app)
      .post('/api/transcribe?language=fr')
      .set('Content-Type', 'audio/webm')
      .send(fakeAudioBuffer);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/unsupported language/i);
  });

  /* ---------------------------------------------------------------- */
  /*                     Server Error Tests                           */
  /* ---------------------------------------------------------------- */

  it('returns 500 when Groq API fails', async () => {
    mockTranscribe.mockRejectedValue(new Error('Groq rate limit exceeded'));

    const res = await request(app)
      .post('/api/transcribe?language=en')
      .set('Content-Type', 'audio/webm')
      .send(fakeAudioBuffer);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('TRANSCRIPTION_ERROR');
    expect(res.body.error).toMatch(/groq rate limit/i);
  });

  it('returns 503 when GROQ_API_KEY is not configured', async () => {
    mockEnv.GROQ_API_KEY = '';

    const res = await request(app)
      .post('/api/transcribe?language=en')
      .set('Content-Type', 'audio/webm')
      .send(fakeAudioBuffer);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('TRANSCRIPTION_ERROR');
    expect(res.body.error).toMatch(/GROQ_API_KEY/);
  });
});

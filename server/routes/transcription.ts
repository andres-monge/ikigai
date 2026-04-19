/**
 * @description
 * Transcription endpoint: receives raw audio, calls Groq Whisper via
 * Vercel AI SDK `experimental_transcribe`, and returns the transcribed text.
 *
 * POST /api/transcribe?language=en|es
 *
 * - Accepts raw audio body (Content-Type: audio/*) up to 5 MB
 * - Language defaults to 'en' if omitted
 * - Returns { text: string } on success
 * - Returns structured error JSON on failure
 */

import { Router } from 'express';
import express from 'express';
import { experimental_transcribe as transcribe } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { env } from '../env.js';
import { ERROR_CODES } from '../utils/errors.js';

export const transcriptionRouter = Router();

/** Accepted language hints for Groq Whisper */
const SUPPORTED_LANGUAGES = new Set(['en', 'es']);

/**
 * POST /api/transcribe
 *
 * Body: raw audio bytes (audio/webm, audio/mp4, etc.)
 * Query: ?language=en|es (default: en)
 */
transcriptionRouter.post(
  '/',
  express.raw({ type: 'audio/*', limit: '5mb' }),
  async (req, res) => {
    try {
      // ── Validate GROQ_API_KEY presence ──────────────────────────────
      if (!env.GROQ_API_KEY) {
        return res.status(503).json({
          error: 'Speech-to-text is not configured. GROQ_API_KEY is missing.',
          code: ERROR_CODES.TRANSCRIPTION_ERROR,
        });
      }

      // ── Validate Content-Type ───────────────────────────────────────
      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.startsWith('audio/')) {
        return res.status(400).json({
          error: 'Invalid content type. Expected audio/* (e.g. audio/webm, audio/mp4).',
          code: ERROR_CODES.VALIDATION_ERROR,
        });
      }

      // ── Validate body is present and non-empty ──────────────────────
      if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          error: 'Request body is empty. Send recorded audio as the raw request body.',
          code: ERROR_CODES.VALIDATION_ERROR,
        });
      }

      // ── Validate language query parameter ───────────────────────────
      const language = (req.query.language as string) ?? 'en';
      if (!SUPPORTED_LANGUAGES.has(language)) {
        return res.status(400).json({
          error: `Unsupported language "${language}". Supported: ${[...SUPPORTED_LANGUAGES].join(', ')}.`,
          code: ERROR_CODES.VALIDATION_ERROR,
        });
      }

      // ── Call Groq Whisper via Vercel AI SDK ─────────────────────────
      const groq = createGroq({ apiKey: env.GROQ_API_KEY });

      const result = await transcribe({
        model: groq.transcription('whisper-large-v3-turbo'),
        audio: req.body,
        providerOptions: {
          groq: { language },
        },
      });

      return res.json({ text: result.text });
    } catch (error) {
      console.error('[Transcription] Error:', error);

      const message =
        error instanceof Error ? error.message : 'Unknown transcription error';

      return res.status(500).json({
        error: `Transcription failed: ${message}`,
        code: ERROR_CODES.TRANSCRIPTION_ERROR,
      });
    }
  },
);

/**
 * @description
 * This file serves as a low-level client wrapper for the Google Gemini API.
 * It abstracts the details of making API requests, including authentication,
 * error handling, and retries with exponential backoff. It provides specialized
 * functions for different types of AI calls required by the application.
 *
 * This wrapper is the single point of interaction with the Gemini API.
 *
 * 🔄 **2025-06-25 UPDATE (Step 12)**
 * - Added `generateContentStream`, an async generator function to handle
 * streaming responses from the Gemini API (`:streamGenerateContent` endpoint).
 * - Added `_generateStreamWithRetry` as the internal implementation to manage
 * the streaming connection and parse incoming Server-Sent Event (SSE) formatted chunks.
 * - This enables real-time "typing" effects for the chat feature.
 *
 * @dependencies
 * - node-fetch (implicitly via global `fetch` in Node.js 18+)
 *
 * @notes
 * - This module reads environment variables for API keys and model names.
 * - It differentiates between a "facts" model (for search) and a "reasoning" model (for analysis).
 */

/* ────────────────────────────────────────────────────────────────────────── */
/* Import Type Definitions (moved to ./types.ts for better organization)      */
/* ────────────────────────────────────────────────────────────────────────── */

import type {
  GeminiPart,
  GeminiContent,
  GeminiTool,
  GeminiGenerationConfig,
  GeminiGenerateContentRequest,
  GeminiCandidate,
  GeminiGenerateContentResponse,
} from './types';

// Re-export commonly used types for convenience
export type { GeminiContent } from './types';

/* ────────────────────────────────────────────────────────────────────────── */
/* Environment & Constants                                                    */
/* ────────────────────────────────────────────────────────────────────────── */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// === CHANGED: Removed default values. Throws error if not set in .env ===
if (!process.env.GEMINI_REASONING_MODEL || !process.env.GEMINI_FACTS_MODEL) {
  throw new Error(
    'Please set GEMINI_REASONING_MODEL and GEMINI_FACTS_MODEL in your .env.local file.',
  );
}
export const GEMINI_REASONING_MODEL = process.env.GEMINI_REASONING_MODEL;
export const GEMINI_FACTS_MODEL = process.env.GEMINI_FACTS_MODEL;

// === CHANGED: Shortened BASE_URL to accommodate full model path from .env ===
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/* ────────────────────────────────────────────────────────────────────────── */
/* Internal Utilities                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * A promise-based sleep function for implementing delays.
 * @param {number} ms - The number of milliseconds to sleep.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The core, private function for making requests to the Gemini API with a retry mechanism.
 * @param {string} model - The specific model to query (e.g., 'gemini-1.5-flash').
 * @param {GeminiGenerateContentRequest} body - The full request body for the Gemini API.
 * @param {number} [maxRetries=3] - The maximum number of times to retry on failure.
 * @returns {Promise<GeminiGenerateContentResponse>} The response from the Gemini API.
 * @throws {Error} Throws an error if the request fails after all retries.
 */
async function _generateWithRetry(
  model: string,
  body: GeminiGenerateContentRequest,
  maxRetries = 3,
): Promise<GeminiGenerateContentResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in environment variables.');
  }

  // The `model` variable now correctly contains the full path e.g., "models/gemini-2.5-flash"
  const url = `${BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(
          `Gemini API request failed with status ${res.status} ${res.statusText}: ${errorBody}`,
        );
      }

      const jsonResponse =
        (await res.json()) as GeminiGenerateContentResponse;
      if (!jsonResponse.candidates || jsonResponse.candidates.length === 0) {
        console.warn('Gemini response contained no candidates.', {
          promptFeedback: jsonResponse.promptFeedback,
        });
      }
      return jsonResponse;
    } catch (error) {
      console.error(`Gemini API attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        throw error;
      }
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error('Gemini request failed after all retries.');
}

/**
 * A private, core function for making streaming requests to the Gemini API.
 * @param model - The specific model to query.
 * @param body - The request body for the Gemini API.
 * @returns An async iterator that yields response chunks.
 */
async function* _generateStreamWithRetry(
  model: string,
  body: GeminiGenerateContentRequest,
  maxRetries = 1, // Retries are more complex with streams, so keep it simple
): AsyncGenerator<GeminiGenerateContentResponse, void, undefined> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in environment variables.');
  }

  const url = `${BASE_URL}/${model}:streamGenerateContent?key=${GEMINI_API_KEY}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const errorBody = await res.text();
        throw new Error(
          `Gemini API stream request failed with status ${res.status} ${res.statusText}: ${errorBody}`,
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          return; // Stream finished
        }
        const chunk = decoder.decode(value);
        // The Gemini stream sends multiple JSON objects, often prefixed with "data: ".
        // We need to handle this framing.
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(5);
            try {
              const parsed = JSON.parse(
                jsonStr,
              ) as GeminiGenerateContentResponse;
              yield parsed;
            } catch (e) {
              console.warn('Could not parse stream chunk as JSON:', jsonStr);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Gemini Stream API attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        throw error;
      }
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Public API Client Functions                                                */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Generates content using the specified model, prompt, and optional tools/config.
 * This is the most flexible public function, designed for the "Reasoning" model
 * and supporting function calling.
 *
 * @param {string} model - The model to use (e.g., GEMINI_REASONING_MODEL).
 * @param {GeminiContent[]} contents - The conversation history or prompt parts.
 * @param {GeminiTool[]} [tools] - An array of tools (e.g., for function calling).
 * @param {GeminiGenerationConfig} [generationConfig] - Configuration for the generation process (e.g., temperature, JSON output).
 * @returns {Promise<GeminiGenerateContentResponse>} The full response object from Gemini.
 */
export async function generateContent(
  model: string,
  contents: GeminiContent[],
  tools?: GeminiTool[],
  generationConfig?: GeminiGenerationConfig,
): Promise<GeminiGenerateContentResponse> {
  const requestBody: GeminiGenerateContentRequest = {
    contents,
    tools,
    generationConfig,
  };
  return _generateWithRetry(model, requestBody);
}

/**
 * A specialized version of `generateContent` that forces the use of the Google Search tool.
 * This is designed for use with the "Facts" model.
 * Per the Gemini API rules, this cannot be used with JSON mode simultaneously.
 *
 * @param {GeminiContent[]} contents - The prompt/content for the model.
 * @returns {Promise<GeminiGenerateContentResponse>} The full response, including grounding metadata.
 */
export async function generateContentWithSearch(
  contents: GeminiContent[],
): Promise<GeminiGenerateContentResponse> {
  const requestBody: GeminiGenerateContentRequest = {
    contents,
    tools: [{ googleSearch: {} }],
  };
  return _generateWithRetry(GEMINI_FACTS_MODEL, requestBody);
}

/**
 * Generates content as a stream using the specified model and prompt.
 * This is designed for real-time streaming of responses (e.g., chat).
 *
 * @param model The model to use (e.g., GEMINI_REASONING_MODEL).
 * @param contents The conversation history or prompt parts.
 * @param tools Optional array of tools for function calling.
 * @param generationConfig Optional configuration for the generation process.
 * @returns An async generator that yields the text content of each chunk.
 */
export async function* generateContentStream(
  model: string,
  contents: GeminiContent[],
  tools?: GeminiTool[],
  generationConfig?: GeminiGenerationConfig,
): AsyncGenerator<string, void, undefined> {
  const requestBody: GeminiGenerateContentRequest = {
    contents,
    tools,
    generationConfig,
  };

  const stream = _generateStreamWithRetry(model, requestBody);

  for await (const chunk of stream) {
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      yield text;
    }
  }
}
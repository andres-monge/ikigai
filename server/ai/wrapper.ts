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
/* Import Type Definitions and Official SDK                                   */
/* ────────────────────────────────────────────────────────────────────────── */

// Official Google GenAI SDK
import { GoogleGenAI, GenerateContentResponse, type Candidate } from '@google/genai';

// Our custom type definitions for backward compatibility
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
import { env } from "../env.js";

// Re-export model identifiers for backward compatibility
export const GEMINI_REASONING_MODEL = env.GEMINI_REASONING_MODEL;

// Create singleton GoogleGenAI instance
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// === LEGACY (no longer used): Base URL for manual API calls ===
// const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Normalizes model ID by removing 'models/' prefix if present.
 * The SDK expects model IDs without the prefix (e.g., 'gemini-2.0-flash' not 'models/gemini-2.0-flash').
 */
function normalizeModelId(model: string): string {
  return model.startsWith('models/') ? model.slice(7) : model;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Type Definitions & Guards                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Minimal type definition for SDK parameters to avoid 'any'
 */
type SdkGenerateContentParams = {
  model: string;
  contents: GeminiContent[];
  config?: {
    tools?: GeminiTool[];
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    responseMimeType?: string;
    responseSchema?: any;
  };
};

/**
 * Type guard to validate SDK response shape more thoroughly
 */
function isValidGenerateContentResponse(value: unknown): value is GeminiGenerateContentResponse {
  const response = value as GenerateContentResponse;
  
  if (!response || !Array.isArray(response.candidates)) {
    return false;
  }
  
  // Validate that each candidate has the expected structure
  for (const candidate of response.candidates) {
    if (!candidate.content || !Array.isArray(candidate.content.parts)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Simple error normalization for SDK errors
 */
function normalizeSdkError(error: unknown, context: string): Error {
  if (error instanceof Error) {
    const enhancedError = new Error(`Google GenAI SDK error (${context}): ${error.message}`);
    enhancedError.cause = error;
    return enhancedError;
  }
  
  return new Error(`Google GenAI SDK error (${context}): ${String(error)}`);
}

/**
 * Safely converts SDK response to our expected interface
 */
function convertSdkResponse(sdkResponse: GenerateContentResponse): GeminiGenerateContentResponse {
  if (!isValidGenerateContentResponse(sdkResponse)) {
    throw new Error('SDK returned response with invalid structure (missing candidates array)');
  }
  
  // Simple type bridge: SDK and our interfaces are compatible
  // Both follow the same Gemini API specification
  return {
    candidates: sdkResponse.candidates as unknown as GeminiGenerateContentResponse['candidates'],
    promptFeedback: sdkResponse.promptFeedback,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Legacy Internal Functions - REMOVED (now using official SDK)              */
/* ────────────────────────────────────────────────────────────────────────── */

// The following functions have been replaced by the official @google/genai SDK:
// - sleep(): No longer needed as SDK handles retries internally
// - _generateWithRetry(): Replaced by ai.models.generateContent()
// - _generateStreamWithRetry(): Replaced by ai.models.generateContentStream()

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
  const normalizedModel = normalizeModelId(model);
  
  // Build typed parameters for SDK
  const sdkParams: SdkGenerateContentParams = {
    model: normalizedModel,
    contents: contents,
    config: {
      ...generationConfig,
      tools: tools,
    },
  };
  
  try {
    const response = await ai.models.generateContent(sdkParams);
    
    // Convert SDK response safely with validation
    const convertedResponse = convertSdkResponse(response);
    
    // Basic validation for critical fields
    if (!convertedResponse.candidates || convertedResponse.candidates.length === 0) {
      console.warn('SDK response contained no candidates.', {
        promptFeedback: convertedResponse.promptFeedback,
      });
    }
    
    return convertedResponse;
  } catch (error) {
    throw normalizeSdkError(error, 'generateContent');
  }
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
  const normalizedModel = normalizeModelId(model);
  
  const sdkParams: SdkGenerateContentParams = {
    model: normalizedModel,
    contents: contents,
    config: {
      ...generationConfig,
      tools: tools,
    },
  };
  
  try {
    const responseStream = await ai.models.generateContentStream(sdkParams);
    
    for await (const chunk of responseStream) {
      // SDK provides convenient .text property on chunks
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    throw normalizeSdkError(error, 'generateContentStream');
  }
}
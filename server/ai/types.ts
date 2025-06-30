/**
 * @description
 * This file contains all Gemini REST API type definitions used by the AI wrapper.
 * Extracted from wrapper.ts to decouple API types from wrapper logic.
 * 
 * @dependencies
 * - None (pure type definitions)
 */

/* ────────────────────────────────────────────────────────────────────────── */
/* Type Definitions for Gemini REST API                                       */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * @interface GeminiPart
 * @description Represents a single part of a multi-part prompt or response.
 * A part can contain text, a function call from the model, or a function
 * response from the client. These are mutually exclusive in a single part.
 *
 * @property {string} [text] - Plain text content.
 * @property {object} [functionCall] - A function call requested by the model.
 * @property {object} [functionResponse] - The result of a function call, sent back to the model.
 */
export interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args: any;
  };
  functionResponse?: {
    name: string;
    response: any;
  };
}

/** Represents a piece of content, with a role and multiple parts. */
export interface GeminiContent {
  role?: 'user' | 'model' | 'function';
  parts: GeminiPart[];
}

/** Defines a tool the model can use, like function calling or search. */
export interface GeminiTool {
  functionDeclarations?: any; // For simplicity, not strongly typed here.
  googleSearch?: object; // An empty object enables Google Search.
}

/** Configuration options for content generation. */
export interface GeminiGenerationConfig {
  temperature?: number;
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: any;
}

/** The request body sent to the `generateContent` endpoint. */
export interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  generationConfig?: GeminiGenerationConfig;
}

/** A single candidate response from the model. */
export interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
  index?: number;
  tokenCount?: number;
  groundingMetadata?: {
    webSearchQueries?: string[];
    groundingAttributions?: {
      content: {
        text: string;
      };
      sourceId: string;
    }[];
  };
}

/** The full response object from the `generateContent` endpoint. */
export interface GeminiGenerateContentResponse {
  candidates: GeminiCandidate[];
  promptFeedback?: any;
}

/**
 * @description The validated and structured data for the "Core Drivers" analysis.
 */
export interface CoreDrivers {
  statementSentence: string;
  coreThreads: string;
}

/**
 * @description The validated and structured data for the entire Purpose Discovery phase.
 */
/**
* @description
* This file serves as a low-level client wrapper for the Google Gemini API.
* It abstracts the details of making API requests, including authentication,
* error handling, and retries with exponential backoff. It provides specialized
* functions for different types of AI calls required by the application.
*
* This wrapper is the single point of interaction with the Gemini API.
*
* @dependencies
* - node-fetch (implicitly via global `fetch` in Node.js 18+)
*
* @notes
* - This module reads environment variables for API keys and model names.
* - It differentiates between a "facts" model (for search) and a "reasoning" model (for analysis).
*/

/* ────────────────────────────────────────────────────────────────────────── */
/* Type Definitions for Gemini REST API                                       */
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
role?: "user" | "model" | "function";
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
responseMimeType?: "application/json" | "text/plain";
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

/* ────────────────────────────────────────────────────────────────────────── */
/* Environment & Constants                                                    */
/* ────────────────────────────────────────────────────────────────────────── */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// As per the technical specification, we use two different models.
// These are configurable via environment variables.
export const GEMINI_FACTS_MODEL =
process.env.GEMINI_FACTS_MODEL || "models/gemini-2.5-flash-lite";
export const GEMINI_REASONING_MODEL =
process.env.GEMINI_REASONING_MODEL || "models/gemini-2.5-flash";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/* ────────────────────────────────────────────────────────────────────────── */
/* Internal Utilities                                                         */
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
throw new Error("GEMINI_API_KEY is not configured in environment variables.");
}

const url = `${BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
try {
const res = await fetch(url, {
method: "POST",
headers: { "Content-Type": "application/json" },
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
console.warn("Gemini response contained no candidates.", {
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
throw new Error("Gemini request failed after all retries.");
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Public API Client Functions                                                */
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
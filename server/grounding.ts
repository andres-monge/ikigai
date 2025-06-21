/**
* @description
* This file serves as a centralized wrapper for all interactions with the Google Gemini API.
* It abstracts away the details of API calls, including prompt construction, response parsing,
* error handling, and retry logic. It also provides specific functions for the different
* AI-driven tasks required by the application, such as purpose analysis, salary data fetching,
* and conversational chat.
*
* @dependencies
* - node-fetch: To make HTTP requests to the Gemini API.
* - @shared/schema: Provides Zod schemas and TypeScript types for data structures.
* - ./storage: The storage interface to fetch contextual data for prompts.
*/

import {
questionnaireResponsesSchema,
type PurposePath,
type InsertPurposePath,
type SalaryData,
type InsertSalaryData,
} from "@shared/schema";
import { z } from "zod";

type QuestionnaireResponses = z.infer<typeof questionnaireResponsesSchema>;
import { storage } from "./storage";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
process.env.GEMINI_MODEL || "models/gemini-1.5-flash-preview-0514";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * @interface GeminiCandidate
 * @description Defines the structure of a single candidate from a Gemini API response.
 */
interface GeminiCandidate {
  content: {
    parts: { text: string }[];
    role: string;
  };
  groundingMetadata?: {
    webSearchQueries?: string[];
    groundingChunks?: {
      web: {
        uri: string;
        title: string;
      };
    }[];
  };
}


/**
* A utility function to introduce a delay, used for exponential backoff in retries.
* @param ms - The number of milliseconds to wait.
* @returns A promise that resolves after the specified duration.
*/
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
* @interface GeminiRequestOptions
* @description Defines the options for making a request to the Gemini API.
*/
interface GeminiRequestOptions {
prompt: string;
isJsonMode?: boolean;
useSearch?: boolean;
maxRetries?: number;
temperature?: number;
}

/**
* Core function to interact with the Gemini API with a retry mechanism.
* @param {GeminiRequestOptions} options - The options for the Gemini API request.
* @returns {Promise<GeminiCandidate>} The first candidate object from the API response.
* @throws {Error} If the API key is missing or if the request fails after all retries.
*/
export async function generateWithRetry({
prompt,
isJsonMode = false,
useSearch = false,
maxRetries = 3,
temperature = 0.7,
}: GeminiRequestOptions): Promise<GeminiCandidate> {
if (!GEMINI_API_KEY) {
throw new Error("Gemini API key is not configured in .env.local");
}

const url = `${BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const generationConfig: Record<string, any> = {
temperature,
};
if (isJsonMode) {
generationConfig.response_mime_type = "application/json";
}

const body: Record<string, any> = {
contents: [{ parts: [{ text: prompt }] }],
generationConfig,
};

if (useSearch) {
    // Per the documentation, `googleSearchRetrieval` is the correct tool for 1.5 models.
body.tools = [{ googleSearchRetrieval: {} }];
}

for (let attempt = 1; attempt <= maxRetries; attempt++) {
try {
const response = await fetch(url, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(body),
});

if (!response.ok) {
const errorBody = await response.text();
throw new Error(
`Gemini API error: ${response.status} ${response.statusText} | Body: ${errorBody}`,
);
}

const data = await response.json();
      const candidate = data.candidates?.[0];

      if (!candidate) {
        throw new Error("No candidate received from Gemini API");
      }

      // Return the entire candidate object, which includes content and grounding metadata
      return candidate as GeminiCandidate;
} catch (error) {
console.error(`Gemini API attempt ${attempt} failed:`, error);
if (attempt === maxRetries) {
throw error; // Re-throw the error on the final attempt
}
// Exponential backoff: 1s, 2s, 4s
await sleep(1000 * Math.pow(2, attempt - 1));
}
}
  // This line should be unreachable, but TypeScript needs a return path.
  throw new Error("Gemini API request failed after all retries.");
}

/**
* Generates the core drivers analysis and three purpose paths from user's questionnaire responses.
* @param {QuestionnaireResponses} responses - The user's answers.
* @param {'en' | 'es'} language - The selected language for the output.
* @returns {Promise<{coreDriversAnalysis: object, purposePaths: Omit<InsertPurposePath, 'assessmentId'>[]}>} The structured analysis.
*/
export async function generateAnalysisAndPaths(
responses: QuestionnaireResponses,
language: "en" | "es",
) {
const langInstruction =
language === "es"
? "IMPORTANT: The user has selected Spanish. All output, including analysis and path details, must be in Spanish."
: "IMPORTANT: The user has selected English. All output must be in English.";

const prompt = `
You are Nami, an AI career guide inspired by Paul Graham's wisdom and stoic principles.
${langInstruction}
Analyze the following questionnaire responses and provide:

1.  A "Core Drivers" summary with four keys: 'energy' (what they love), 'edge' (what they are good at), 'impact' (what the world needs that they can provide), and 'economic' (their financial reality). Each should be a concise paragraph.
2.  Three distinct "Purpose Paths" aligned with ikigai principles. For each path, provide a 'title', a 'description', a high-level 'actionStrategy', and an 'ikigaiAlignment' object with four keys ('love', 'goodAt', 'worldNeeds', 'pay').

User Responses: ${JSON.stringify(responses, null, 2)}

Please respond ONLY with a valid JSON object in the following format. Do not include markdown ticks or any other text outside the JSON structure.
{
"coreDriversAnalysis": {
"energy": "...",
"edge": "...",
"impact": "...",
"economic": "..."
},
"purposePaths": [
{
"title": "Path Title 1",
"description": "...",
"ikigaiAlignment": {
"love": "...",
"goodAt": "...",
"worldNeeds": "...",
"pay": "..."
},
"actionStrategy": "..."
}
]
}
`;
  const candidate = await generateWithRetry({ prompt, isJsonMode: true });
  const contentText = candidate.content?.parts?.[0]?.text;
  if (!contentText) {
    throw new Error("No content received from AI for analysis.");
  }
  return JSON.parse(contentText);
}

/**
* Fetches salary data for a list of generated purpose paths using Google Search grounding.
* @param {PurposePath[]} purposePaths - The array of purpose paths to get salary data for.
* @param {'en' | 'es'} language - The user's selected language.
* @returns {Promise<Omit<InsertSalaryData, 'id'>[]>} A promise that resolves to an array of salary data objects.
*/
export async function fetchSalaryDataForPaths(
purposePaths: PurposePath[],
language: "en" | "es",
): Promise<Omit<InsertSalaryData, "id">[]> {
const pathTitles = purposePaths.map((p) => p.title);
if (pathTitles.length === 0) {
return [];
}

const location = language === "es" ? "Spain" : "the United States";

const langInstruction =
language === "es"
? `The user is likely in Spain. Provide salary ranges in EUR (€). All text descriptions and citations must be in Spanish.`
: `The user is likely in the United States. Provide salary ranges in USD ($). All text descriptions and citations must be in English.`;

const prompt = `
Based on the following job titles, use your web search tool to find typical salary benchmarks for entry-level, mid-level, and senior-level positions.
${langInstruction}

Job Titles: ${JSON.stringify(pathTitles)}

For each job title, please respond with a JSON object containing the salary ranges and the source URLs where you found the information.
The location for the salary data should be as specific as possible based on your search (e.g., "Madrid, Spain" or "California, USA").

Please respond ONLY with a valid JSON array in the following format. Do not include markdown ticks or any other text outside the JSON structure.
The array must have the exact same number of items as the number of job titles provided. Match them in order.

[
{
"title": "Job Title 1",
"entryLevel": "...",
"midLevel": "...",
"seniorLevel": "...",
"location": "...",
"sources": ["http://source1.com", "http://source2.com"]
}
]
`;

try {
    const candidate = await generateWithRetry({
prompt,
isJsonMode: true,
useSearch: true,
temperature: 0.2, // Lower temperature for more factual, less creative output
});

    // Extract JSON content from the main response text
    const contentText = candidate.content?.parts?.[0]?.text;
    if (!contentText) {
      throw new Error("No content text in salary response from AI.");
    }
    const salaryResultsFromAI = JSON.parse(contentText);

    // Extract official source URIs from the grounding metadata
    const groundingUris = candidate.groundingMetadata?.groundingChunks
      ?.map(chunk => chunk.web?.uri)
      .filter((uri): uri is string => !!uri) ?? [];


const finalSalaryData: Omit<InsertSalaryData, "id">[] = [];

if (Array.isArray(salaryResultsFromAI)) {
for (const aiResult of salaryResultsFromAI) {
const matchingPath = purposePaths.find((p) => p.title === aiResult.title);
if (matchingPath) {
          // Combine sources from the AI's text and the official grounding metadata
          const combinedSources = Array.from(new Set([
            ...(aiResult.sources || []),
            ...groundingUris
          ]));

finalSalaryData.push({
pathId: matchingPath.id,
entryLevel: aiResult.entryLevel || "N/A",
midLevel: aiResult.midLevel || "N/A",
seniorLevel: aiResult.seniorLevel || "N/A",
location: aiResult.location || location,
sources: combinedSources,
});
} else {
console.warn(
`AI returned salary for a title not in the original request: ${aiResult.title}`,
);
}
}
} else {
throw new Error("AI response for salary data was not a valid array.");
}
return finalSalaryData;
} catch (error) {
console.error("Failed to fetch or parse salary data from AI:", error);
// Fallback to providing placeholder data so the app doesn't crash.
return purposePaths.map((path) => ({
pathId: path.id,
entryLevel: "Could not retrieve salary data",
midLevel: "Could not retrieve salary data",
seniorLevel: "Could not retrieve salary data",
location: "N/A",
sources: [],
}));
}
}

/**
* Generates a detailed action plan for a chosen purpose path. (Placeholder for future implementation).
* @param {number} chosenPathId - The ID of the user's chosen path.
* @returns {Promise<object>} A promise resolving to the action plan object.
*/
export async function generateActionPlanForPath(chosenPathId: number) {
// In a future step, this will:
// 1. Fetch the path details from storage.
// 2. Construct a detailed prompt asking for milestones, skills to learn, project ideas, etc.
// 3. Call `generateWithRetry` with search enabled to find YouTube course URLs.
// 4. Parse and return the structured action plan.
console.log(`Generating action plan for path ID: ${chosenPathId}`);
return Promise.resolve({
message: "Action Plan Generation Not Implemented Yet",
});
}

/**
* Generates a conversational response from the AI based on the chat history and context.
* @param {number} assessmentId - The ID of the current assessment session.
* @param {string} message - The user's latest message.
* @param {'discovery' | 'action_plan'} context - The context of the chat.
* @returns {Promise<string>} The AI's text response.
*/
export async function generateChatResponse(
assessmentId: number,
message: string,
context: "discovery" | "action_plan",
): Promise<string> {
const sessionData = await storage.getAssessmentSessionById(assessmentId);
const chatHistory = await storage.getChatMessages(assessmentId);

if (!sessionData) {
throw new Error(`Session with id ${assessmentId} not found.`);
}

const language = sessionData.language;
const langInstruction =
language === "es"
? "The user is communicating in Spanish. Your response must be in Spanish."
: "The user is communicating in English. Your response must be in English.";

let contextPrompt = "";
if (context === "discovery") {
contextPrompt = `
You are helping the user refine their initial three "Purpose Paths".
Here is their data:
Core Drivers Analysis: ${JSON.stringify(sessionData.coreDriversAnalysis, null, 2)}
Generated Purpose Paths: ${JSON.stringify(sessionData.purposePaths, null, 2)}
`;
} else {
// context === 'action_plan'
contextPrompt = `
You are helping the user refine the detailed "Action Plan" for their chosen career path.
Here is their chosen path and action plan:
Action Plan: ${JSON.stringify(sessionData.actionPlan, null, 2)}
`;
}

const systemPrompt = `You are Nami, an AI career guide with a personality inspired by Paul Graham's essays and stoic principles. You are encouraging, wise, and action-oriented. ${langInstruction}

${contextPrompt}

PREVIOUS CONVERSATION HISTORY:
${chatHistory.map((msg) => `${msg.role}: ${msg.content}`).join("\n")}

Based on all this context, respond helpfully and conversationally to the user's latest message. Do not output JSON, just provide a conversational text response.
User Message: "${message}"
`;

  const candidate = await generateWithRetry({ prompt: systemPrompt, temperature: 0.8 });
  const contentText = candidate.content?.parts?.[0]?.text;
  if (!contentText) {
    return "I'm sorry, I couldn't process that. Could you try rephrasing?";
  }
  return contentText;
}
/**
* @description
* This file contains the high-level business logic for orchestrating the
* multi-call AI sequences as described in the technical specification.
* It uses the 'Structured Output' feature of the Gemini API to ensure reliable JSON.
*
* The functions in this file are called directly by the route handlers.
*
* @dependencies
* - ./wrapper.ts: For making calls to the Gemini API.
* - ../cache.ts: For caching salary and other expensive-to-fetch data.
* - @shared/schema: For Zod schemas to validate the final AI output content.
* - zod: For defining the validation schemas.
*/

import { z } from "zod";
import {
generateContent,
generateContentWithSearch,
GEMINI_REASONING_MODEL,
type GeminiContent,
} from "./wrapper";
import {
salaryCache,
SALARY_CACHE_TTL_MS,
youtubeCache,
YOUTUBE_CACHE_TTL_MS,
} from "../cache";
import type {
Language,
PurposePath,
QuestionnaireResponses,
} from "@shared/schema";
import { actionPlanSchema, youtubeVideoSchema } from "@shared/schema";

// ========= INTERNAL ZOD SCHEMAS FOR AI OUTPUT VALIDATION =========

const salaryFunctionArgSchema = z.object({
careers: z
.array(
z.object({
title: z.string().describe('The job title, e.g., "Software Engineer"'),
location: z
.string()
.describe('The city or region for the salary, e.g., "London"'),
}),
)
.min(1),
});
type SalaryFunctionArgs = z.infer<typeof salaryFunctionArgSchema>;

const rawSalaryDataSchema = z.object({
title: z.string(),
location: z.string(),
entryLevel: z.string(),
midLevel: z.string(),
seniorLevel: z.string(),
sources: z.array(z.string().url()),
});
export type RawSalaryData = z.infer<typeof rawSalaryDataSchema>;

export const purposeDiscoveryResultSchema = z.object({
coreDriversAnalysis: z.object({
energy: z.string(),
edge: z.string(),
impact: z.string(),
economicReality: z.string(),
}),
purposePaths: z
.array(
z.object({
title: z.string(),
description: z.string(),
ikigaiAlignment: z.object({
love: z.string(),
goodAt: z.string(),
worldNeeds: z.string(),
pay: z.string(),
}),
actionStrategy: z.string(),
}),
)
.length(3, "The AI must generate exactly 3 purpose paths."),
salaryData: z.array(rawSalaryDataSchema),
});
export type PurposeDiscoveryResult = z.infer<
typeof purposeDiscoveryResultSchema
>;

// Zod schema for the result of the Action Plan chain, mirroring shared/schema.ts
export const actionPlanResultSchema = actionPlanSchema;
export type ActionPlanResult = z.infer<typeof actionPlanResultSchema>;

const youtubeFunctionArgSchema = z.object({
skills: z
.array(z.string().describe("A specific skill to learn, e.g., 'React'"))
.min(1),
});
type YoutubeFunctionArgs = z.infer<typeof youtubeFunctionArgSchema>;

// ========= OPENAPI SCHEMAS FOR FORCED JSON OUTPUT =========

const purposeDiscoveryOpenApiSchema = {
type: "OBJECT",
properties: {
coreDriversAnalysis: {
type: "OBJECT",
properties: {
energy: {
type: "STRING",
description: "A summary of what energizes the user.",
},
edge: {
type: "STRING",
description: "A summary of the user's unique skills and strengths.",
},
impact: {
type: "STRING",
description: "A summary of the kind of impact the user wants to make.",
},
economicReality: {
type: "STRING",
description:
"A summary of the user's financial needs and timeline.",
},
},
required: ["energy", "edge", "impact", "economicReality"],
},
purposePaths: {
type: "ARRAY",
minItems: 3,
maxItems: 3,
description: "An array of exactly three distinct career paths.",
items: {
type: "OBJECT",
properties: {
title: { type: "STRING", description: "Specific Career Path Title" },
description: {
type: "STRING",
description:
"A short, compelling description of this path for the user.",
},
ikigaiAlignment: {
type: "OBJECT",
properties: {
love: {
type: "STRING",
description: "How this path aligns with their passions.",
},
goodAt: {
type: "STRING",
description: "How this path aligns with their skills.",
},
worldNeeds: {
type: "STRING",
description: "How this path meets a need in the world.",
},
pay: {
type: "STRING",
description:
"How this path meets their economic needs, referencing the salary data.",
},
},
required: ["love", "goodAt", "worldNeeds", "pay"],
},
actionStrategy: {
type: "STRING",
description:
"A high-level strategy to get started (e.g., 'Bootstrapped MVP in 6 mo').",
},
},
required: [
"title",
"description",
"ikigaiAlignment",
"actionStrategy",
],
},
},
salaryData: {
type: "ARRAY",
description:
"The exact, unmodified salary data array received from the function call.",
items: {
type: "OBJECT",
properties: {
title: { type: "STRING" },
location: { type: "STRING" },
entryLevel: { type: "STRING" },
midLevel: { type: "STRING" },
seniorLevel: { type: "STRING" },
sources: { type: "ARRAY", items: { type: "STRING", format: "uri" } },
},
required: [
"title",
"location",
"entryLevel",
"midLevel",
"seniorLevel",
"sources",
],
},
},
},
required: ["coreDriversAnalysis", "purposePaths", "salaryData"],
};

const actionPlanOpenApiSchema = {
type: "OBJECT",
properties: {
sideProjectIdeas: {
type: "ARRAY",
description:
"A list of 2-3 simple, actionable side project ideas a beginner can build to practice their new skills.",
items: { type: "STRING" },
},
skillsToLearn: {
type: "ARRAY",
description:
"A list of the most important skills to learn for this path.",
items: {
type: "OBJECT",
properties: {
skill: { type: "STRING", description: "The name of the skill." },
youtubeLinks: {
type: "ARRAY",
description:
"The exact, unmodified YouTube video data received from the function call for this skill.",
items: {
type: "OBJECT",
properties: {
title: { type: "STRING" },
url: { type: "STRING", format: "uri" },
},
required: ["title", "url"],
},
},
},
required: ["skill", "youtubeLinks"],
},
},
peopleToNetworkWith: {
type: "ARRAY",
description:
"A list of 2-3 types of people, roles, or communities the user should connect with to learn more.",
items: { type: "STRING" },
},
},
required: ["sideProjectIdeas", "skillsToLearn", "peopleToNetworkWith"],
};

// ========= AI FUNCTION CALLING TOOL DEFINITIONS =========

const getSalaryDataTool = {
functionDeclarations: [
{
name: "getSalaryDataForCareers",
description:
"Gets estimated salary ranges for job titles in specific locations. Must be called before returning the final analysis.",
parameters: {
type: "OBJECT",
properties: {
careers: {
type: "ARRAY",
items: {
type: "OBJECT",
properties: {
title: {
type: "STRING",
description: 'The job title, e.g., "Software Engineer".',
},
location: {
type: "STRING",
description:
'The location for the salary data, e.g., "San Francisco, CA".',
},
},
required: ["title", "location"],
},
},
},
required: ["careers"],
},
},
],
};

const getYoutubeVideosForSkillsTool = {
functionDeclarations: [
{
name: "getYoutubeVideosForSkills",
description:
"Gets the top 3 most relevant YouTube video links for learning a list of specific skills. Must be called before returning the final action plan.",
parameters: {
type: "OBJECT",
properties: {
skills: {
type: "ARRAY",
items: {
type: "STRING",
description:
"A specific, concrete skill to search for, e.g., 'React Hooks' or 'Product Management fundamentals'.",
},
},
},
required: ["skills"],
},
},
],
};

// ========= PRIVATE HELPER FUNCTIONS =========

/**
* Generates the master system prompt for the Purpose Discovery phase.
* This prompt is heavily engineered to imbue the AI with the persona of "Nami,"
* inspired by the writings and philosophies of Paul Graham. It guides the AI
* to focus on curiosity, hard problems, and learning by doing.
* @param {QuestionnaireResponses} responses - The user's answers.
* @param {Language} language - The target language ('en' or 'es').
* @returns {string} The formatted system prompt.
*/
const _getPurposeDiscoverySystemPrompt = (
responses: QuestionnaireResponses,
language: Language,
): string => {
const langInstruction =
language === "es"
? "Debes responder íntegramente en ESPAÑOL. Tu tono debe ser el de un mentor sabio y directo."
: "You MUST respond entirely IN ENGLISH. Your tone should be that of a wise, direct mentor.";

return `You are Nami, an AI career guide. Your personality and reasoning are inspired by the essays of Paul Graham. You are not a generic career coach. You are direct, insightful, and focused on helping the user find their ikigai. Avoid clichés and corporate jargon.

Core Principles (based on Paul Graham's philosophy):
1.  **Follow Curiosity:** The most reliable guide to what you should be doing is what you find interesting. Don't look for a single, grand "passion." Look for problems that seem absorbing to you.
2.  **Work on Hard Problems:** The path to satisfaction and impact lies in tackling challenges that the user believes will have a positive impact and can be proud of. 
3.  **Learn by Doing:** The only way to know if you'll like something is to try it. The best way to learn is by building your own projects.
4.  **Compounding Effort:** What you work on should have the potential for your effort to compound over time. You get better, your projects get bigger, your impact grows.
5.  **Aptitude Matters:** People get good at things they have a natural talent for. Great work happens at the intersection of aptitude and interest.

Your Task:
Analyze the user's questionnaire answers and generate three distinct, actionable "Purpose Paths." These paths should NOT be generic job titles. They should be approaches to work that align with the user's unique profile and your core principles.

User's Answers:
${JSON.stringify(responses, null, 2)}

Your Process:
Step 1: **Internal Monologue (before calling function)**:
   - Based on the user's answers (on energy, edge, impact, economics), what are the underlying *problems* they seem drawn to?
   - What unconventional or nascent fields might combine their interests? Don't just pick obvious jobs. Think about intersections. For example, if they like writing and technology, don't just say "Technical Writer." Suggest "Building a niche newsletter for developers" or "Creating educational content for a complex software product."
   - For each potential path, ask yourself: Does this lead to working on problems the user cares about? Can the user start this as a side project (learn by doing)? Does it have compounding potential?
Step 2: **Function Call**:
   - Once you have three distinct paths, you MUST call the \`getSalaryDataForCareers\` function. For each path, choose a representative job title for a job that they could get if they follow that path, together with a relevant location to get salary data. This data is for grounding, but the path itself is more than just the job title.
Step 3: **Generate Final JSON**:
   - After the function returns salary data, generate your final answer as a single JSON object that strictly follows the provided schema.
   - In the "description" and "ikigaiAlignment" fields for each path, explain *why* you are suggesting it, using the language and reasoning of your core principles. Explain how it connects to their specific answers (energy, edge, impact, economics). Be encouraging but realistic.

${langInstruction}`;
};

/**
* Generates the master system prompt for the Action Plan generation phase.
* This prompt continues the "Nami" persona, focusing on turning a chosen path
* into a concrete plan biased towards immediate action and building tangible projects.
* @param {PurposePath} chosenPath - The path the user selected.
* @param {Language} language - The target language ('en' or 'es').
* @returns {string} The formatted system prompt.
*/
const _getActionPlanSystemPrompt = (
chosenPath: PurposePath,
language: Language,
): string => {
const langInstruction =
language === "es"
? "Debes responder íntegramente en ESPAÑOL. Tu tono debe ser el de un mentor sabio y directo."
: "You MUST respond entirely IN ENGLISH. Your tone should be that of a wise, direct mentor.";

return `You are Nami, an AI career guide with the personality and reasoning of Paul Graham. Your purpose is to translate a chosen career direction into a concrete, immediate action plan.

Core Principles for this task:
1.  **The Way to Start is to Start:** The most important step is the first one. Bias heavily towards action.
2.  **Make Things:** Don't just study. Build something, however small. A side project is the best resume and the best teacher.
3.  **Find the Frontier:** Figure out what the most interesting problems are in this field and who is working on them.
4.  **Learn What You Need:** Acquire skills with a purpose – to build your project. Don't just collect credentials.

The user has chosen this path:
- Title: ${chosenPath.title}
- Description: ${chosenPath.description}
- High-Level Strategy: ${chosenPath.actionStrategy}

Your Task:
Create a step-by-step action plan that is concrete, encouraging, and focused on doing real work. The goal is for the user to have something tangible to do *today*.

Your Process:
Step 1: **Internal Monologue (before calling function)**:
    - Based on the chosen path, what is the *simplest possible project* the user could build to test the waters? This should be your central recommendation.
    - What are the absolute minimum skills required to build that simple project? Be specific. Don't list a hundred things. Pick the 2-3 most critical skills to start.
    - Who are the people or communities that are genuinely pushing the boundaries in this field? Where would the user find them? (e.g., specific forums, open-source projects, influential blogs, niche communities).
Step 2: **Function Call**:
    - You have identified the critical starting skills. Now, you MUST call the \`getYoutubeVideosForSkills\` function to find the top 3 introductory videos for each of those skills. These videos should be practical and project-oriented if possible.
Step 3: **Generate Final JSON**:
    - After the function returns the video links, generate your final answer as a single JSON object that strictly follows the provided schema.
    - The language you use in the plan should be encouraging and direct, in your Paul Graham-inspired voice. Explain the "why" behind each suggestion. For example, for side projects, explain that this is how they'll truly learn and discover what they enjoy. For networking, explain it's about finding collaborators and mentors, not just shaking hands.

${langInstruction}`;
};

const _parseSalaryResponse = (
text: string,
careers: SalaryFunctionArgs["careers"],
): RawSalaryData[] => {
const results: RawSalaryData[] = [];
for (const career of careers) {
const careerBlockRegex = new RegExp(
`CAREER:\\s*${career.title}[\\s\\S]*?SOURCES:\\s*\\[([^\\]]+)\\]`,
"i",
);
const blockMatch = text.match(careerBlockRegex);
if (blockMatch) {
const block = blockMatch[0];
const salaryMatch = block.match(/SALARY:\s*\[([^\]]+)\]/i);
const sourcesMatch = block.match(/SOURCES:\s*\[([^\]]+)\]/i);
if (salaryMatch && sourcesMatch) {
const salaries = salaryMatch[1].split(",").map((s) => s.trim());
const sources = sourcesMatch[1]
.split(",")
.map((s) => s.trim().replace(/"/g, ""));
results.push({
title: career.title,
location: career.location,
entryLevel: salaries[0] || "N/A",
midLevel: salaries[1] || "N/A",
seniorLevel: salaries[2] || "N/A",
sources: sources.filter((s) => s.startsWith("http")),
});
}
}
}
return results;
};

async function _fetchAndCacheSalaries(
careers: SalaryFunctionArgs["careers"],
language: Language,
): Promise<RawSalaryData[]> {
const results: RawSalaryData[] = [];
const misses: SalaryFunctionArgs["careers"] = [];
for (const career of careers) {
const cacheKey = `${career.title.toLowerCase()}:${career.location.toLowerCase()}:${language}`;
const cached = salaryCache.get<RawSalaryData>(cacheKey);
if (cached) {
results.push(cached);
} else {
misses.push(career);
}
}

if (misses.length === 0) return results;

const langInstruction = language === "es" ? "en español" : "in English";
const prompt = `For each career, find salary ranges (entry, mid, senior) and two source URLs. Respond ${langInstruction}. Use this exact format:
CAREER: [Title]\nLOCATION: [Location]\nSALARY: [Entry Range], [Mid Range], [Senior Range]\nSOURCES: ["URL1", "URL2"]\n\nCareers:\n${misses
.map((c) => `- ${c.title} in ${c.location}`)
.join("\n")}`;

const searchResponse = await generateContentWithSearch([
{ role: "user", parts: [{ text: prompt }] },
]);
const responseText =
searchResponse.candidates?.[0]?.content?.parts?.[0]?.text;
if (!responseText)
throw new Error("Facts model (search) returned no content for salaries.");

const newSalaries = _parseSalaryResponse(responseText, misses);
for (const salary of newSalaries) {
const cacheKey = `${salary.title.toLowerCase()}:${salary.location.toLowerCase()}:${language}`;
salaryCache.set(cacheKey, salary, SALARY_CACHE_TTL_MS);
results.push(salary);
}
return results;
}

const _parseYoutubeResponse = (
text: string,
): z.infer<typeof youtubeVideoSchema>[] => {
const videos: z.infer<typeof youtubeVideoSchema>[] = [];
const videoBlockRegex =
/VIDEO_TITLE:\s*(.*?)\s*\n\s*VIDEO_URL:\s*(https?:\/\/[^\s]+)/g;
let match;
while ((match = videoBlockRegex.exec(text)) !== null) {
const validation = youtubeVideoSchema.safeParse({
title: match[1].trim(),
url: match[2].trim(),
});
if (validation.success) {
videos.push(validation.data);
}
}
return videos;
};

async function _fetchAndCacheYoutubeVideos(
skills: string[],
language: Language,
): Promise<{ skill: string; videos: z.infer<typeof youtubeVideoSchema>[] }[]> {
const results: {
skill: string;
videos: z.infer<typeof youtubeVideoSchema>[];
}[] = [];
const misses: string[] = [];

for (const skill of skills) {
const cacheKey = `youtube:${skill.toLowerCase()}:${language}`;
const cached = youtubeCache.get<z.infer<typeof youtubeVideoSchema>[]>(
cacheKey,
);
if (cached) {
results.push({ skill, videos: cached });
} else {
misses.push(skill);
}
}

if (misses.length === 0) return results;

const langInstruction = language === "es" ? "en español" : "in English";
const prompt = `For each skill, find the 3 most relevant and high-quality YouTube videos for the user. The videos should be ${langInstruction}. Use this exact format, with "---" separating each video:
SKILL: [Skill Name]
VIDEO_TITLE: [Exact Video Title]
VIDEO_URL: [Full Video URL]
---
VIDEO_TITLE: [Exact Video Title 2]
VIDEO_URL: [Full Video URL 2]
---
VIDEO_TITLE: [Exact Video Title 3]
VIDEO_URL: [Full Video URL 3]

Skills to find videos for:
${misses.map((skill) => `- ${skill}`).join("\n")}
`;

const searchResponse = await generateContentWithSearch([
{ role: "user", parts: [{ text: prompt }] },
]);
const responseText =
searchResponse.candidates?.[0]?.content?.parts?.[0]?.text;
if (!responseText)
throw new Error("Facts model (search) returned no content for YouTube.");

for (const skill of misses) {
const skillBlockRegex = new RegExp(`SKILL:\\s*${skill}([\\s\\S]*?)(?=SKILL:|$)`, "i");
const blockMatch = responseText.match(skillBlockRegex);
if (blockMatch) {
const skillBlock = blockMatch[1];
const newVideos = _parseYoutubeResponse(skillBlock);
const cacheKey = `youtube:${skill.toLowerCase()}:${language}`;
youtubeCache.set(cacheKey, newVideos, YOUTUBE_CACHE_TTL_MS);
results.push({ skill, videos: newVideos });
}
}

return results;
}

// ========= PUBLIC CHAIN IMPLEMENTATIONS =========

export async function getPurposeDiscoveryChain(
userInput: QuestionnaireResponses,
language: Language,
maxRetries = 2,
): Promise<PurposeDiscoveryResult> {
let lastError: Error | null = null;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
try {
const systemPrompt = _getPurposeDiscoverySystemPrompt(userInput, language);
const initialContent: GeminiContent[] = [
{ role: "user", parts: [{ text: systemPrompt }] },
];
const reasoningResponse1 = await generateContent(
GEMINI_REASONING_MODEL,
initialContent,
[getSalaryDataTool],
);

const partWithFunctionCall =
reasoningResponse1.candidates?.[0]?.content?.parts.find(
(p) => !!p.functionCall,
);
const functionCall = partWithFunctionCall?.functionCall;

if (!functionCall || functionCall.name !== "getSalaryDataForCareers") {
throw new Error("Reasoning model did not call the required function.");
}

const validation = salaryFunctionArgSchema.safeParse(functionCall.args);
if (!validation.success) {
throw new Error(
`Reasoning model provided invalid arguments for function call: ${validation.error.message}`,
);
}

const salaryData = await _fetchAndCacheSalaries(
validation.data.careers,
language,
);
const functionResponseContent: GeminiContent = {
role: "function",
parts: [
{
functionResponse: {
name: "getSalaryDataForCareers",
response: { content: { salaryData } },
},
},
],
};

const fullConversation: GeminiContent[] = [
...initialContent,
reasoningResponse1.candidates[0].content,
functionResponseContent,
];

const reasoningResponse2 = await generateContent(
GEMINI_REASONING_MODEL,
fullConversation,
[getSalaryDataTool],
{
responseMimeType: "application/json",
responseSchema: purposeDiscoveryOpenApiSchema,
},
);

const finalJsonText =
reasoningResponse2.candidates?.[0]?.content?.parts?.[0]?.text;
if (!finalJsonText)
throw new Error("Reasoning model did not return a final JSON object.");

const finalResult = JSON.parse(finalJsonText);

const finalValidation =
purposeDiscoveryResultSchema.safeParse(finalResult);
if (finalValidation.success) {
return finalValidation.data;
} else {
lastError = new Error(
`Final AI output validation failed: ${finalValidation.error.message}`,
);
console.warn(`Attempt ${attempt} failed validation. Retrying...`);
continue;
}
} catch (error) {
lastError = error as Error;
console.error(`Chain attempt ${attempt} failed:`, error);
if (attempt < maxRetries) await new Promise((res) => setTimeout(res, 1500));
}
}
throw new Error(
`AI chain failed after ${maxRetries} attempts. Last error: ${lastError?.message}`,
);
}

export async function getActionPlanChain(
chosenPath: PurposePath,
language: Language,
maxRetries = 2,
): Promise<ActionPlanResult> {
let lastError: Error | null = null;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
try {
const systemPrompt = _getActionPlanSystemPrompt(chosenPath, language);
const initialContent: GeminiContent[] = [
{ role: "user", parts: [{ text: systemPrompt }] },
];

const reasoningResponse1 = await generateContent(
GEMINI_REASONING_MODEL,
initialContent,
[getYoutubeVideosForSkillsTool],
);

const partWithFunctionCall =
reasoningResponse1.candidates?.[0]?.content?.parts.find(
(p) => !!p.functionCall,
);
const functionCall = partWithFunctionCall?.functionCall;

if (!functionCall || functionCall.name !== "getYoutubeVideosForSkills") {
throw new Error(
"Reasoning model did not call `getYoutubeVideosForSkills` function.",
);
}

const validation = youtubeFunctionArgSchema.safeParse(functionCall.args);
if (!validation.success) {
throw new Error(
`Reasoning model provided invalid arguments for YouTube function call: ${validation.error.message}`,
);
}

const youtubeData = await _fetchAndCacheYoutubeVideos(
validation.data.skills,
language,
);
const functionResponseContent: GeminiContent = {
role: "function",
parts: [
{
functionResponse: {
name: "getYoutubeVideosForSkills",
response: { content: { videosBySkill: youtubeData } },
},
},
],
};

const fullConversation: GeminiContent[] = [
...initialContent,
reasoningResponse1.candidates[0].content,
functionResponseContent,
];

const reasoningResponse2 = await generateContent(
GEMINI_REASONING_MODEL,
fullConversation,
[getYoutubeVideosForSkillsTool],
{
responseMimeType: "application/json",
responseSchema: actionPlanOpenApiSchema,
},
);

const finalJsonText =
reasoningResponse2.candidates?.[0]?.content?.parts?.[0]?.text;
if (!finalJsonText)
throw new Error(
"Reasoning model did not return a final JSON object for the action plan.",
);

const finalResult = JSON.parse(finalJsonText);
const finalValidation = actionPlanResultSchema.safeParse(finalResult);

if (finalValidation.success) {
return finalValidation.data;
} else {
lastError = new Error(
`Final Action Plan AI output validation failed: ${finalValidation.error.message}`,
);
console.warn(
`Action Plan Attempt ${attempt} failed validation. Retrying...`,
);
continue;
}
} catch (error) {
lastError = error as Error;
console.error(`Action Plan Chain attempt ${attempt} failed:`, error);
if (attempt < maxRetries)
await new Promise((res) => setTimeout(res, 1500));
}
}
throw new Error(
`Action Plan AI chain failed after ${maxRetries} attempts. Last error: ${lastError?.message}`,
);
}
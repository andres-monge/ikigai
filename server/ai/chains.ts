/**
 * @description
 * This file contains the high-level business logic for orchestrating the
 * multi-call AI sequences as described in the technical specification.
 * It uses the 'Structured Output' feature of the Gemini API to ensure reliable JSON.
 *
 * 🔄 **2025-06-25 UPDATE (Step 12)**
 * - Refactored `getChatRefinementChain` into an `async function*` (async generator).
 * - It now calls the new `generateContentStream` from the AI wrapper.
 * - Instead of returning a single string, it `yield`s each text chunk as it
 * arrives from the API, enabling real-time streaming to the client.
 *
 * 🔄 **2025-06-25 UPDATE (Step 11)**
 * - Added `getChatRefinementChain` to handle synchronous chat interactions.
 * - This new function constructs a conversational prompt including the AI's
 * persona, the relevant context (discovery results or action plan), and
 * the previous chat history for that context.
 *
 * The functions in this file are called directly by the route handlers.
 *
 * @dependencies
 * - ./wrapper.ts: For making calls to the Gemini API.
 * - ../cache.ts: For caching salary and other expensive-to-fetch data.
 * - ../storage.ts: For retrieving session and chat history.
 * - @shared/schema: For Zod schemas to validate the final AI output content.
 * - zod: For defining the validation schemas.
 */

import {
  generateContent,
  generateContentWithSearch,
  generateContentStream, // Import the new streaming function
  GEMINI_REASONING_MODEL,
  type GeminiContent,
} from './wrapper';
import {
  salaryCache,
  SALARY_CACHE_TTL_MS,
  youtubeCache,
  YOUTUBE_CACHE_TTL_MS,
} from '../cache';
import type {
  Language,
  PurposePath,
  QuestionnaireResponses,
  QuestionAnswerPair,
  SelectChatMessage,
} from '@shared/schema';
import { youtubeVideoSchema } from '@shared/schema';
import { storage } from '../storage';
import {
  salaryFunctionArgSchema,
  rawSalaryDataSchema,
  purposeDiscoveryResultSchema,
  actionPlanResultSchema,
  youtubeFunctionArgSchema,
  purposeDiscoveryOpenApiSchema,
  actionPlanOpenApiSchema,
  type SalaryFunctionArgs,
  type RawSalaryData,
  type PurposeDiscoveryResult,
  type ActionPlanResult,
  type YoutubeFunctionArgs,
} from './schemas';
import {
  formatQuestionnaireForPrompt,
  getPurposeDiscoverySystemPrompt,
  getActionPlanSystemPrompt,
  getChatRefinementSystemPrompt,
} from './prompts';
import {
  getSalaryDataTool,
  getYoutubeVideosForSkillsTool,
} from './tools';

// Schema definitions have been moved to ./schemas.ts for better organization

// OpenAPI schemas have been moved to ./schemas.ts for better organization

// Tool definitions have been moved to ./tools.ts for better organization

// ========= PRIVATE HELPER FUNCTIONS =========
// Prompt generation functions have been moved to ./prompts.ts for better organization

const _parseSalaryResponse = (
  text: string,
  careers: SalaryFunctionArgs['careers'],
): RawSalaryData[] => {
  const results: RawSalaryData[] = [];
  for (const career of careers) {
    const careerBlockRegex = new RegExp(
      `CAREER:\\s*${career.title}[\\s\\S]*?SOURCES:\\s*\\[([^\\]]+)\\]`,
      'i',
    );
    const blockMatch = text.match(careerBlockRegex);
    if (blockMatch) {
      const block = blockMatch[0];
      const salaryMatch = block.match(/SALARY:\s*\[([^\]]+)\]/i);
      const sourcesMatch = block.match(/SOURCES:\s*\[([^\]]+)\]/i);
      if (salaryMatch && sourcesMatch) {
        const salaries = salaryMatch[1].split(',').map((s) => s.trim());
        const sources = sourcesMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/"/g, ''));
        results.push({
          title: career.title,
          location: career.location,
          entryLevel: salaries[0] || 'N/A',
          midLevel: salaries[1] || 'N/A',
          seniorLevel: salaries[2] || 'N/A',
          sources: sources.filter((s) => s.startsWith('http')),
        });
      }
    }
  }
  return results;
};

async function _fetchAndCacheSalaries(
  careers: SalaryFunctionArgs['careers'],
  language: Language,
): Promise<RawSalaryData[]> {
  const results: RawSalaryData[] = [];
  const misses: SalaryFunctionArgs['careers'] = [];
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

  const langInstruction = language === 'es' ? 'en español' : 'in English';
  const prompt = `For each career, find salary ranges (entry, mid, senior) and two source URLs. Respond ${langInstruction}. Use this exact format:
CAREER: [Title]
LOCATION: [Location]
SALARY: [Entry Range], [Mid Range], [Senior Range]
SOURCES: ["URL1", "URL2"]

Careers:
${misses
  .map((c) => `- ${c.title} in ${c.location}`)
  .join('\n')}`;

  const searchResponse = await generateContentWithSearch([
    { role: 'user', parts: [{ text: prompt }] },
  ]);
  const responseText =
    searchResponse.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText)
    throw new Error('Facts model (search) returned no content for salaries.');

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

  const langInstruction = language === 'es' ? 'en español' : 'in English';
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
${misses.map((skill) => `- ${skill}`).join('\n')}
`;

  const searchResponse = await generateContentWithSearch([
    { role: 'user', parts: [{ text: prompt }] },
  ]);
  const responseText =
    searchResponse.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText)
    throw new Error('Facts model (search) returned no content for YouTube.');

  for (const skill of misses) {
    const skillBlockRegex = new RegExp(`SKILL:\\s*${skill}([\\s\\S]*?)(?=SKILL:|$)`, 'i');
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
      const systemPrompt = getPurposeDiscoverySystemPrompt(
        userInput,
        language,
      );
      const initialContent: GeminiContent[] = [
        { role: 'user', parts: [{ text: systemPrompt }] },
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

      if (!functionCall || functionCall.name !== 'getSalaryDataForCareers') {
        throw new Error('Reasoning model did not call the required function.');
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
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'getSalaryDataForCareers',
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
        undefined,
        {
          responseMimeType: 'application/json',
          responseSchema: purposeDiscoveryOpenApiSchema,
        },
      );

      const finalJsonText =
        reasoningResponse2.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!finalJsonText)
        throw new Error('Reasoning model did not return a final JSON object.');

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
      const systemPrompt = getActionPlanSystemPrompt(chosenPath, language);
      const initialContent: GeminiContent[] = [
        { role: 'user', parts: [{ text: systemPrompt }] },
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

      if (!functionCall || functionCall.name !== 'getYoutubeVideosForSkills') {
        throw new Error(
          'Reasoning model did not call `getYoutubeVideosForSkills` function.',
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
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'getYoutubeVideosForSkills',
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
        undefined,
        {
          responseMimeType: 'application/json',
          responseSchema: actionPlanOpenApiSchema,
        },
      );

      const finalJsonText =
        reasoningResponse2.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!finalJsonText)
        throw new Error(
          'Reasoning model did not return a final JSON object for the action plan.',
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

/**
 * Handles a streaming chat interaction for refining results.
 * This function is an async generator.
 * @param sessionId The user's session ID.
 * @param currentMessage The latest message from the user.
 * @param context The part of the application being discussed.
 * @returns An async generator that yields AI response text chunks.
 */
export async function* getChatRefinementChain(
  sessionId: string,
  currentMessage: string,
  context: 'discovery' | 'action_plan',
): AsyncGenerator<string, void, undefined> {
  const session = await storage.getAssessmentSessionBySessionId(sessionId);
  if (!session) {
    throw new Error(`Session not found for chat (id: ${sessionId})`);
  }

  const { language } = session;
  let contextData: any;
  let contextString: string;

  if (context === 'discovery') {
    // In MemStorage, purposePaths are hydrated directly onto the session object.
    const purposePaths = (session as any).purposePaths ?? [];
    contextData = {
      coreDriversAnalysis: session.coreDriversAnalysis,
      purposePaths: purposePaths,
    };
    contextString = `Here are the results you previously generated for the user:\n\nANALYSIS:\n${JSON.stringify(
      contextData.coreDriversAnalysis,
      null,
      2,
    )}\n\nPATHS:\n${JSON.stringify(
      contextData.purposePaths,
      null,
      2,
    )}\n\nNow, respond to their latest message to refine these results.`;
  } else {
    // context === 'action_plan'
    contextData = session.actionPlan;
    if (!contextData) {
      throw new Error(
        `Cannot start action plan chat refinement without an action plan.`,
      );
    }
    contextString = `Here is the action plan you previously generated for the user:\n\n${JSON.stringify(
      contextData,
      null,
      2,
    )}\n\nNow, respond to their latest message to refine this plan.`;
  }

  const systemPrompt = getChatRefinementSystemPrompt(
    context,
    language,
    contextString,
  );

  const history = await storage.getChatMessages(session.id, context);
  const conversationHistory: GeminiContent[] = history.map(
    (msg: SelectChatMessage) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }),
  );

  const fullConversation: GeminiContent[] = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    {
      role: 'model',
      parts: [
        {
          text:
            language === 'es'
              ? 'Entendido. Estoy lista para ayudar.'
              : 'Understood. I am ready to help.',
        },
      ],
    },
    ...conversationHistory,
    { role: 'user', parts: [{ text: currentMessage }] },
  ];

  const stream = generateContentStream(
    GEMINI_REASONING_MODEL,
    fullConversation,
  );

  for await (const chunk of stream) {
    yield chunk;
  }
}
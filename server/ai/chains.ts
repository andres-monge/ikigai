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

import { z } from 'zod';
import {
  generateContent,
  generateContentWithSearch,
  GEMINI_REASONING_MODEL,
  type GeminiContent,
} from './wrapper';
import { salaryCache, SALARY_CACHE_TTL_MS } from '../cache';
import type { Language, QuestionnaireResponses } from '@shared/schema';

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
  purposePaths: z.array(z.object({
    title: z.string(),
    description: z.string(),
    ikigaiAlignment: z.object({
      love: z.string(),
      goodAt: z.string(),
      worldNeeds: z.string(),
      pay: z.string(),
    }),
    actionStrategy: z.string(),
  })).length(3, 'The AI must generate exactly 3 purpose paths.'),
  salaryData: z.array(rawSalaryDataSchema),
});
export type PurposeDiscoveryResult = z.infer<
  typeof purposeDiscoveryResultSchema
>;

// ========= OPENAPI SCHEMA FOR FORCED JSON OUTPUT =========

const purposeDiscoveryOpenApiSchema = {
  type: 'OBJECT',
  properties: {
    coreDriversAnalysis: {
      type: 'OBJECT',
      properties: {
        energy: { type: 'STRING', description: 'A summary of what energizes the user.' },
        edge: { type: 'STRING', description: "A summary of the user's unique skills and strengths." },
        impact: { type: 'STRING', description: 'A summary of the kind of impact the user wants to make.' },
        economicReality: { type: 'STRING', description: "A summary of the user's financial needs and timeline." },
      },
      required: ['energy', 'edge', 'impact', 'economicReality'],
    },
    purposePaths: {
      type: 'ARRAY',
      minItems: 3,
      maxItems: 3,
      description: "An array of exactly three distinct career paths.",
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Specific Career Path Title' },
          description: { type: 'STRING', description: 'A short, compelling description of this path for the user.' },
          ikigaiAlignment: {
            type: 'OBJECT',
            properties: {
              love: { type: 'STRING', description: 'How this path aligns with their passions.' },
              goodAt: { type: 'STRING', description: 'How this path aligns with their skills.' },
              worldNeeds: { type: 'STRING', description: 'How this path meets a need in the world.' },
              pay: { type: 'STRING', description: 'How this path meets their economic needs, referencing the salary data.' },
            },
            required: ['love', 'goodAt', 'worldNeeds', 'pay'],
          },
          actionStrategy: { type: 'STRING', description: "A high-level strategy to get started (e.g., 'Bootstrapped MVP in 6 mo')." },
        },
        required: ['title', 'description', 'ikigaiAlignment', 'actionStrategy'],
      },
    },
    salaryData: {
      type: 'ARRAY',
      description: "The exact, unmodified salary data array received from the function call.",
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          location: { type: 'STRING' },
          entryLevel: { type: 'STRING' },
          midLevel: { type: 'STRING' },
          seniorLevel: { type: 'STRING' },
          sources: { type: 'ARRAY', items: { type: 'STRING', format: 'uri' } },
        },
        required: ['title', 'location', 'entryLevel', 'midLevel', 'seniorLevel', 'sources'],
      },
    },
  },
  required: ['coreDriversAnalysis', 'purposePaths', 'salaryData'],
};

// ========= AI FUNCTION CALLING TOOL DEFINITION =========

const getSalaryDataTool = {
  functionDeclarations: [
    {
      name: 'getSalaryDataForCareers',
      description:
        'Gets estimated salary ranges for job titles in specific locations. Must be called before returning the final analysis.',
      parameters: {
        type: 'OBJECT',
        properties: {
          careers: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING', description: 'The job title, e.g., "Software Engineer".' },
                location: { type: 'STRING', description: 'The location for the salary data, e.g., "San Francisco, CA".' },
              },
              required: ['title', 'location'],
            },
          },
        },
        required: ['careers'],
      },
    },
  ],
};

// ========= PRIVATE HELPER FUNCTIONS =========

const _getSystemPrompt = (
  responses: QuestionnaireResponses,
  language: Language,
): string => {
  const langInstruction = language === 'es' ? 'Responde EN ESPAÑOL.' : 'Respond IN ENGLISH.';
  return `You are Nami, an AI career guide. Your personality is encouraging, wise, and action-oriented.
Your task is to analyze the user's questionnaire answers and generate a detailed career analysis.
The user's answers are: ${JSON.stringify(responses)}
Your process has two steps:
Step 1: First, you MUST call the \`getSalaryDataForCareers\` function. Identify three distinct career paths from the user's answers and call the function with those titles and relevant locations.
Step 2: After the function provides salary data, generate your final answer as a JSON object that strictly follows the provided schema. ${langInstruction}`;
};

const _parseSalaryResponse = (
  text: string,
  careers: SalaryFunctionArgs['careers'],
): RawSalaryData[] => {
  const results: RawSalaryData[] = [];
  for (const career of careers) {
    const careerBlockRegex = new RegExp(`CAREER:\\s*${career.title}[\\s\\S]*?SOURCES:\\s*\\[([^\\]]+)\\]`, 'i');
    const blockMatch = text.match(careerBlockRegex);
    if (blockMatch) {
      const block = blockMatch[0];
      const salaryMatch = block.match(/SALARY:\s*\[([^\]]+)\]/i);
      const sourcesMatch = block.match(/SOURCES:\s*\[([^\]]+)\]/i);
      if (salaryMatch && sourcesMatch) {
        const salaries = salaryMatch[1].split(',').map(s => s.trim());
        const sources = sourcesMatch[1].split(',').map(s => s.trim().replace(/"/g, ''));
        results.push({
          title: career.title,
          location: career.location,
          entryLevel: salaries[0] || 'N/A',
          midLevel: salaries[1] || 'N/A',
          seniorLevel: salaries[2] || 'N/A',
          sources: sources.filter(s => s.startsWith('http')),
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
CAREER: [Title]\nLOCATION: [Location]\nSALARY: [Entry Range], [Mid Range], [Senior Range]\nSOURCES: ["URL1", "URL2"]\n\nCareers:\n${misses.map(c => `- ${c.title} in ${c.location}`).join('\n')}`;

  const searchResponse = await generateContentWithSearch([{ role: 'user', parts: [{ text: prompt }] }]);
  const responseText = searchResponse.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText) throw new Error('Facts model (search) returned no content.');

  const newSalaries = _parseSalaryResponse(responseText, misses);
  for (const salary of newSalaries) {
    const cacheKey = `${salary.title.toLowerCase()}:${salary.location.toLowerCase()}:${language}`;
    salaryCache.set(cacheKey, salary, SALARY_CACHE_TTL_MS);
    results.push(salary);
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
      // === Start Call 2 (Reasoning) - Step 1: Ask for function call ===
      const systemPrompt = _getSystemPrompt(userInput, language);
      const initialContent: GeminiContent[] = [{ role: 'user', parts: [{ text: systemPrompt }] }];
      const reasoningResponse1 = await generateContent(GEMINI_REASONING_MODEL, initialContent, [getSalaryDataTool]);

      // **FIX**: Safely find the part with the function call and then access the call.
      const partWithFunctionCall = reasoningResponse1.candidates?.[0]?.content?.parts.find(p => !!p.functionCall);
      const functionCall = partWithFunctionCall?.functionCall;

      if (!functionCall || functionCall.name !== 'getSalaryDataForCareers') {
        throw new Error('Reasoning model did not call the required function.');
      }

      const validation = salaryFunctionArgSchema.safeParse(functionCall.args);
      if (!validation.success) {
        throw new Error(`Reasoning model provided invalid arguments for function call: ${validation.error.message}`);
      }

      // === Execute Call 1 (Facts) via the function ===
      const salaryData = await _fetchAndCacheSalaries(validation.data.careers, language);
      const functionResponseContent: GeminiContent = {
        role: 'function',
        parts: [{ functionResponse: { name: 'getSalaryDataForCareers', response: { content: { salaryData } } } }],
      };

      // === Resume Call 2 (Reasoning) - Step 2: Provide function result and demand structured JSON ===
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
          responseMimeType: 'application/json',
          responseSchema: purposeDiscoveryOpenApiSchema,
        },
      );

      const finalJsonText = reasoningResponse2.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!finalJsonText) throw new Error('Reasoning model did not return a final JSON object.');

      const finalResult = JSON.parse(finalJsonText);

      // === Validate final content against Zod schema ===
      const finalValidation = purposeDiscoveryResultSchema.safeParse(finalResult);
      if (finalValidation.success) {
        return finalValidation.data;
      } else {
        lastError = new Error(`Final AI output validation failed: ${finalValidation.error.message}`);
        console.warn(`Attempt ${attempt} failed validation. Retrying...`);
        continue;
      }
    } catch (error) {
      lastError = error as Error;
      console.error(`Chain attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) await new Promise(res => setTimeout(res, 1500));
    }
  }
  throw new Error(`AI chain failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

export async function getActionPlanChain(
): Promise<any> {
  console.log('getActionPlanChain not yet implemented.');
  return Promise.resolve({ message: 'Not Implemented' });
}
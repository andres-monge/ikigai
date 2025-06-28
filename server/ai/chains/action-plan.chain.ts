/**
 * @file action-plan.chain.ts
 *
 * Generates a detailed Action Plan for a selected Purpose Path.  Mirroring the
 * Purpose-Discovery chain, it executes a function-calling turn in Gemini to
 * retrieve YouTube videos, then validates the final JSON output.
 */

import { z } from 'zod';
import {
  generateContent,
  generateContentWithSearch,
  GEMINI_REASONING_MODEL,
} from '../wrapper';
import type { GeminiContent } from '../types';
import {
  youtubeCache,
  YOUTUBE_CACHE_TTL_MS,
} from '../../cache';
import type { Language, PurposePath } from '@shared/schema';
import {
  actionPlanResultSchema,
  actionPlanOpenApiSchema,
  youtubeFunctionArgSchema,
  type ActionPlanResult,
  type YoutubeFunctionArgs,
} from '../schemas';
import { youtubeVideoSchema } from '@shared/schema';
import { getActionPlanSystemPrompt } from '../prompts';
import { getYoutubeVideosForSkillsTool } from '../tools';

/* -------------------------------------------------------------------------- */
/* Private helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Parses the free-text response from the Search model into a list of validated
 * video objects.
 */
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
    if (validation.success) videos.push(validation.data);
  }
  return videos;
};

/**
 * Attempts to retrieve cached videos for each skill, otherwise calls the
 * Search model and persists the results.
 */
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
    const cached = youtubeCache.get<z.infer<typeof youtubeVideoSchema>[]>(cacheKey);
    if (cached) {
      results.push({ skill, videos: cached });
    } else {
      misses.push(skill);
    }
  }

  if (misses.length === 0) return results;

  const langInstruction = language === 'es' ? 'en español' : 'in English';
  const prompt = `For each skill, find the 3 most relevant and high-quality YouTube videos for the user. The videos should be ${langInstruction}. Use this exact format, with "---" separating each video:\nSKILL: [Skill Name]\nVIDEO_TITLE: [Exact Video Title]\nVIDEO_URL: [Full Video URL]\n---\nVIDEO_TITLE: [Exact Video Title 2]\nVIDEO_URL: [Full Video URL 2]\n---\nVIDEO_TITLE: [Exact Video Title 3]\nVIDEO_URL: [Full Video URL 3]\n\nSkills to find videos for:\n${misses
    .map((skill) => `- ${skill}`)
    .join('\n')}`;

  const searchResponse = await generateContentWithSearch([
    { role: 'user', parts: [{ text: prompt }] },
  ]);
  const responseText =
    searchResponse.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText)
    throw new Error('Facts model (search) returned no content for YouTube.');

  for (const skill of misses) {
    const skillBlockRegex = new RegExp(
      `SKILL:\\s*${skill}([\\s\\S]*?)(?=SKILL:|$)`,
      'i',
    );
    const blockMatch = responseText.match(skillBlockRegex);
    if (!blockMatch) continue;

    const skillBlock = blockMatch[1];
    const newVideos = _parseYoutubeResponse(skillBlock);
    const cacheKey = `youtube:${skill.toLowerCase()}:${language}`;
    youtubeCache.set(cacheKey, newVideos, YOUTUBE_CACHE_TTL_MS);
    results.push({ skill, videos: newVideos });
  }

  return results;
}

/* -------------------------------------------------------------------------- */
/* Public Chain                                                               */
/* -------------------------------------------------------------------------- */

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

      const functionCall = reasoningResponse1.candidates?.[0]?.content?.parts.find(
        (p) => !!p.functionCall,
      )?.functionCall;

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
        reasoningResponse1.candidates![0].content,
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
      if (!finalJsonText) {
        throw new Error(
          'Reasoning model did not return a final JSON object for the action plan.',
        );
      }

      const finalResult = JSON.parse(finalJsonText);
      const finalValidation = actionPlanResultSchema.safeParse(finalResult);
      if (finalValidation.success) return finalValidation.data;

      // Validation failed – retry
      lastError = new Error(
        `Final Action Plan AI output validation failed: ${finalValidation.error.message}`,
      );
      console.warn(`Action Plan Attempt ${attempt} failed validation. Retrying...`);
    } catch (error) {
      lastError = error as Error;
      console.error(`Action Plan Chain attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  throw new Error(
    `Action Plan AI chain failed after ${maxRetries} attempts. Last error: ${lastError?.message}`,
  );
} 
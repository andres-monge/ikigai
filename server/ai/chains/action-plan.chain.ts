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
import fetch from 'node-fetch'; // YouTube Data API call
import he from 'he'; // HTML entity decoding

/* -------------------------------------------------------------------------- */
/* Private helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Calls the YouTube Data API v3 `search.list` endpoint to retrieve up to 3
 * education-focused tutorial videos for a given skill.
 * Falls back to the standard thumbnail if higher-quality sizes are missing.
 */
async function _fetchYoutubeVideosForSkill(
  skill: string,
  language: Language,
): Promise<z.infer<typeof youtubeVideoSchema>[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing YOUTUBE_API_KEY environment variable.');
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', `${skill} tutorial`);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '3');
  url.searchParams.set('videoCategoryId', '27'); // Education
  url.searchParams.set('videoDuration', 'long'); // Only videos >20 minutes
  url.searchParams.set('safeSearch', 'none');
  url.searchParams.set('order', 'relevance'); // Use relevance instead of viewCount for better compatibility

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  url.searchParams.set('publishedAfter', oneYearAgo.toISOString());

  url.searchParams.set('relevanceLanguage', language);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errorBody = await res.text();
    console.error('YouTube API Error Details:', {
      status: res.status,
      statusText: res.statusText,
      body: errorBody,
      url: url.toString()
    });
    throw new Error(`YouTube API request failed: ${res.status} ${res.statusText} - ${errorBody}`);
  }

  const data: any = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .map((item: any) => {
      const videoId = item.id?.videoId;
      const snippet = item.snippet;
      if (!videoId || !snippet) return null;

      const thumbnail =
        snippet.thumbnails?.medium?.url ||
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.default?.url;

      const video = {
        title: he.decode(snippet.title as string),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnailUrl: thumbnail as string,
      };

      const validation = youtubeVideoSchema.safeParse(video);
      return validation.success ? validation.data : null;
    })
    .filter(Boolean) as z.infer<typeof youtubeVideoSchema>[];
}

/**
 * Retrieves (and caches) YouTube videos for each requested skill.
 */
async function _fetchYoutubeVideos(
  skills: string[],
  language: Language,
): Promise<{ skill: string; videos: z.infer<typeof youtubeVideoSchema>[] }[]> {
  const results: {
    skill: string;
    videos: z.infer<typeof youtubeVideoSchema>[];
  }[] = [];

  for (const skill of skills) {
    const cacheKey = `youtube:${skill.toLowerCase()}:${language}`;
    const cached = youtubeCache.get<z.infer<typeof youtubeVideoSchema>[]>(cacheKey);
    if (cached) {
      results.push({ skill, videos: cached });
      continue;
    }

    const fetched = await _fetchYoutubeVideosForSkill(skill, language);
    youtubeCache.set(cacheKey, fetched, YOUTUBE_CACHE_TTL_MS);
    results.push({ skill, videos: fetched });
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

      const youtubeData = await _fetchYoutubeVideos(
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
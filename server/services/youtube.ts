/**
 * @file youtube.ts
 *
 * YouTube Data API service for fetching educational video content.
 * Abstracts YouTube API logic from AI chains to improve separation of concerns.
 */

import { z } from 'zod';
import fetch from 'node-fetch';
import he from 'he';
import {
  youtubeCache,
  YOUTUBE_CACHE_TTL_MS,
} from '../cache';
import type { Language } from '@shared/schema';
import { youtubeVideoSchema } from '@shared/schema';

/**
 * Calls the YouTube Data API v3 `search.list` endpoint to retrieve up to 3
 * education-focused tutorial videos for a given skill.
 * Falls back to the standard thumbnail if higher-quality sizes are missing.
 */
async function _fetchVideosForSkill(
  skill: string,
  language: Language,
): Promise<z.infer<typeof youtubeVideoSchema>[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('[YouTubeService] Missing YOUTUBE_API_KEY environment variable.');
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
    console.error('[YouTubeService] API request failed:', {
      status: res.status,
      statusText: res.statusText,
      body: errorBody,
      url: url.toString()
    });
    throw new Error(`[YouTubeService] YouTube API request failed: ${res.status} ${res.statusText} - ${errorBody}`);
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
 * This is the main public API for fetching YouTube content.
 */
export async function getYoutubeVideosForSkills(
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

    const fetched = await _fetchVideosForSkill(skill, language);
    youtubeCache.set(cacheKey, fetched, YOUTUBE_CACHE_TTL_MS);
    results.push({ skill, videos: fetched });
  }

  return results;
}
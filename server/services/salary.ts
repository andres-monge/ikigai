/**
 * @file salary.ts
 *
 * Salary data service for fetching and parsing career salary information.
 * Abstracts salary fetching logic from AI chains to improve separation of concerns.
 */

import { z } from 'zod';
import { generateContentWithSearch } from '../ai/wrapper';
import {
  salaryCache,
  SALARY_CACHE_TTL_MS,
} from '../cache';
import type { Language } from '@shared/schema';
import {
  rawSalaryDataSchema,
  type SalaryFunctionArgs,
  type RawSalaryData,
} from '../ai/schemas';

/**
 * Regex-based parser that converts the free-text salary response coming from
 * the Search-grounded model into an array of structured objects that passes
 * `rawSalaryDataSchema` validation.
 */
function _parseSalaryResponse(
  text: string,
  careers: SalaryFunctionArgs['careers'],
): RawSalaryData[] {
  const results: RawSalaryData[] = [];
  for (const career of careers) {
    const careerBlockRegex = new RegExp(
      `CAREER:\\s*${career.title}[\\s\\S]*?SOURCES:\\s*\\[([^\\]]+)\\]`,
      'i',
    );
    const blockMatch = text.match(careerBlockRegex);
    if (!blockMatch) continue;

    const block = blockMatch[0];
    const salaryMatch = block.match(/SALARY:\s*\[([^\]]+)\]/i);
    const sourcesMatch = block.match(/SOURCES:\s*\[([^\]]+)\]/i);
    if (!salaryMatch || !sourcesMatch) continue;

    const sources = sourcesMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/"/g, ''));

    results.push({
      title: career.title,
      location: career.location,
      salaryRange: salaryMatch ? salaryMatch[1].trim() : 'N/A',
      sources: sources.filter((s) => s.startsWith('http')),
    });
  }
  return results;
}

/**
 * Fetches salary data for a single career from the search API.
 * This function is used internally when cache misses occur.
 */
async function _fetchSalaryForCareer(
  career: { title: string; location: string },
  language: Language,
): Promise<RawSalaryData | null> {
  const langInstruction = language === 'es' ? 'en español' : 'in English';
  const prompt = `For this career, find a single broad salary range (e.g., €40-60k) and two source URLs. If the title is too niche, find the closest standard job title. Respond ${langInstruction}. Use this exact format:\nCAREER: [Title]\nLOCATION: [Location]\nSALARY: [Broad Range]\nSOURCES: ["URL1", "URL2"]\n\nCareer:\n- ${career.title} in ${career.location}`;

  try {
    const searchResponse = await generateContentWithSearch([
      { role: 'user', parts: [{ text: prompt }] },
    ]);
    const responseText =
      searchResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      console.error(`[SalaryService] Search model returned no content for ${career.title} in ${career.location}`);
      return null;
    }

    const parsedResults = _parseSalaryResponse(responseText, [career]);
    return parsedResults.length > 0 ? parsedResults[0] : null;
  } catch (error) {
    console.error(`[SalaryService] Failed to fetch salary for ${career.title} in ${career.location}:`, error);
    return null;
  }
}

/**
 * Retrieves salary data from cache or, on a miss, calls the Search model and
 * populates the cache for future requests. This is the main public API for
 * fetching salary data.
 */
export async function getSalaryDataForCareers(
  careers: SalaryFunctionArgs['careers'],
  language: Language,
): Promise<RawSalaryData[]> {
  const results: RawSalaryData[] = [];

  for (const career of careers) {
    const cacheKey = `salary:${career.title.toLowerCase()}:${career.location.toLowerCase()}:${language}`;
    const cached = salaryCache.get<RawSalaryData>(cacheKey);
    
    if (cached) {
      results.push(cached);
      continue;
    }

    const fetched = await _fetchSalaryForCareer(career, language);
    if (fetched) {
      salaryCache.set(cacheKey, fetched, SALARY_CACHE_TTL_MS);
      results.push(fetched);
    }
  }

  return results;
}
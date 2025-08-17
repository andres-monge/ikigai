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
import type { Language, PurposePath } from '@shared/schema';
import {
  actionPlanResultSchema,
  actionPlanOpenApiSchema,
  youtubeFunctionArgSchema,
  type ActionPlanResult,
  type YoutubeFunctionArgs,
} from '../schemas';
import { getActionPlanSystemPrompt } from '../prompts';
import { getYoutubeVideosForSkillsTool } from '../tools';
import { getYoutubeVideosForSkills } from '../../services/youtube';

/* -------------------------------------------------------------------------- */
/* Private helpers - YouTube logic moved to server/services/youtube.ts      */
/* -------------------------------------------------------------------------- */

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

      const youtubeData = await getYoutubeVideosForSkills(
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
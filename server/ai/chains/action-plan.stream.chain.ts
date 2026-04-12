/**
 * @file action-plan.stream.chain.ts
 *
 * Streaming version of the Action Plan chain using Vercel AI SDK v6.
 * This provides structured validation while streaming for a more reliable user experience.
 *
 * This version:
 * - Uses streamText + Output.object for validated structured streaming
 * - Provides validated objects matching our Zod schema
 * - Enables word-by-word streaming with the AI SDK's native protocol
 */

import { Output, streamText } from 'ai';
import type {
  Language,
  PurposePath,
  QuestionnaireResponses,
} from '../../../shared/schema.js';
import { actionPlanResultSchema } from '../../../shared/streaming-schemas.js';
import { getActionPlanSystemPrompt } from '../prompts.js';
import {
  createGeminiStructuredModel,
  geminiStructuredProviderOptions,
} from '../google-structured-model.js';
import { env } from '../../env.js';

/**
 * Streaming Action Plan chain using Vercel AI SDK's structured output API.
 * Returns a streamText result with validated structured streaming.
 *
 * @param chosenPath - The user's selected purpose path
 * @param language - The target language ('en' or 'es')
 * @param responses - The user's original questionnaire answers for personalization
 * @param maxRetries - Maximum number of retry attempts
 * @returns StreamText result with validated action plan data
 */
export async function getActionPlanStreamChain(
  chosenPath: PurposePath,
  language: Language,
  responses: QuestionnaireResponses,
  maxRetries = 2,
) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const systemPrompt = getActionPlanSystemPrompt(
        chosenPath,
        language,
        responses,
      );

      // Gemini can return fenced JSON even in structured mode; strip those
      // wrappers before the SDK parses the final object.
      const result = streamText({
        model: createGeminiStructuredModel(),
        output: Output.object({
          schema: actionPlanResultSchema,
        }),
        prompt: systemPrompt,
        temperature: env.GEMINI_TEMPERATURE,
        providerOptions: geminiStructuredProviderOptions,
      });

      return result;
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Action-Plan streaming attempt ${attempt}/${maxRetries} failed:`,
        {
          error: error instanceof Error ? error.message : error,
          attempt,
          language,
          pathTitle: chosenPath.title,
          modelId: env.GEMINI_REASONING_MODEL,
        },
      );

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  throw new Error(
    `Action Plan AI streaming failed after ${maxRetries} attempts. Model: ${env.GEMINI_REASONING_MODEL}, Language: ${language}, Path: ${chosenPath.title}, Last error: ${lastError?.message}`,
  );
}

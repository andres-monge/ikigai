/**
 * @file purpose-discovery.stream.chain.ts
 *
 * Streaming version of the Purpose Discovery chain using Vercel AI SDK v6.
 * This provides structured validation while streaming for a more reliable user experience.
 *
 * This version:
 * - Uses streamText + Output.object for validated structured streaming
 * - Provides validated objects matching our Zod schema
 * - Enables word-by-word streaming with the AI SDK's native protocol
 */

import { Output, streamText } from 'ai';
import type { Language, QuestionnaireResponses } from '../../../shared/schema.js';
import { purposeDiscoveryResultSchema } from '../../../shared/streaming-schemas.js';
import { getPurposeDiscoverySystemPrompt } from '../prompts.js';
import {
  createGeminiStructuredModel,
  geminiStructuredProviderOptions,
} from '../google-structured-model.js';
import { env } from '../../env.js';

/**
 * Streaming Purpose Discovery chain using Vercel AI SDK's structured output API.
 * Returns a streamText result for validated structured streaming.
 *
 * @param userInput - The user's questionnaire responses
 * @param language - The target language ('en' or 'es')
 * @param maxRetries - Maximum number of retry attempts
 * @returns StreamText result with validated purpose discovery data
 */
export async function getPurposeDiscoveryStreamChain(
  userInput: QuestionnaireResponses,
  language: Language,
  maxRetries = 2,
) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const systemPrompt = getPurposeDiscoverySystemPrompt(userInput, language);

      // Gemini can return fenced JSON even in structured mode; strip those
      // wrappers before the SDK parses the final object.
      const result = streamText({
        model: createGeminiStructuredModel(),
        output: Output.object({
          schema: purposeDiscoveryResultSchema,
        }),
        prompt: systemPrompt,
        temperature: env.GEMINI_TEMPERATURE,
        providerOptions: geminiStructuredProviderOptions,
      });

      return result;
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Purpose-Discovery streaming attempt ${attempt}/${maxRetries} failed:`,
        {
          error: error instanceof Error ? error.message : error,
          attempt,
          language,
          modelId: env.GEMINI_REASONING_MODEL,
        },
      );

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  throw new Error(
    `Purpose Discovery AI streaming failed after ${maxRetries} attempts. Model: ${env.GEMINI_REASONING_MODEL}, Language: ${language}, Last error: ${lastError?.message}`,
  );
}

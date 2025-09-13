/**
 * @file purpose-discovery.stream.chain.ts
 *
 * Streaming version of the Purpose Discovery chain using Vercel AI SDK's streamObject.
 * This provides structured validation while streaming for a more reliable user experience.
 *
 * This version:
 * - Uses streamObject for validated structured streaming
 * - Provides validated objects matching our Zod schema
 * - Enables word-by-word streaming with the AI SDK's native protocol
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamObject } from 'ai';
import type { Language, QuestionnaireResponses } from '@shared/schema';
import { purposeDiscoveryResultSchema } from '@shared/streaming-schemas';
import { getPurposeDiscoverySystemPrompt } from '../prompts';
import { env } from '../../env.js';

/**
 * Streaming Purpose Discovery chain using Vercel AI SDK's streamObject.
 * Returns a streamObject result for validated structured streaming.
 * 
 * @param userInput - The user's questionnaire responses
 * @param language - The target language ('en' or 'es')
 * @param maxRetries - Maximum number of retry attempts
 * @returns StreamObject result with validated purpose discovery data
 */
export async function getPurposeDiscoveryStreamChain(
  userInput: QuestionnaireResponses,
  language: Language,
  maxRetries = 2,
) {
  let lastError: Error | null = null;

  // Initialize Google provider for Vercel AI SDK
  const google = createGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Generate the system prompt for structured output
      const systemPrompt = getPurposeDiscoverySystemPrompt(userInput, language);

      // Use streamObject to generate structured output with streaming
      const result = streamObject({
        model: google(env.GEMINI_REASONING_MODEL),
        schema: purposeDiscoveryResultSchema,
        prompt: systemPrompt,
        temperature: 0.3, // Lower temperature for more consistent structured output
      });

      return result;

    } catch (error) {
      lastError = error as Error;
      console.error(`Purpose-Discovery streaming attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  throw new Error(
    `AI streaming chain failed after ${maxRetries} attempts. Last error: ${lastError?.message}`,
  );
}
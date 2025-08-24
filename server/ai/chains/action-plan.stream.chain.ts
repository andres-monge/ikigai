/**
 * @file action-plan.stream.chain.ts
 *
 * Streaming version of the Action Plan chain that yields text chunks
 * in real-time using Google's official GenAI SDK. This enables word-by-word
 * streaming for a more responsive user experience.
 *
 * Unlike the non-streaming chain, this version:
 * - Uses delimited text output instead of JSON
 * - Skips function calling for MVP (YouTube data is handled post-stream)
 * - Yields text chunks as they arrive from the model
 */

import { generateContentStream, GEMINI_REASONING_MODEL } from '../wrapper';
import type { GeminiContent } from '../types';
import type { Language, PurposePath } from '@shared/schema';
import { getActionPlanStreamingPrompt } from '../prompts';

/**
 * Streaming Action Plan chain using the official Google GenAI SDK.
 * Yields text chunks as they arrive from the model for real-time display.
 * 
 * @param chosenPath - The user's selected purpose path
 * @param language - The target language ('en' or 'es')
 * @param maxRetries - Maximum number of retry attempts
 * @returns AsyncGenerator that yields text chunks
 */
export async function* getActionPlanStreamChain(
  chosenPath: PurposePath,
  language: Language,
  maxRetries = 2,
): AsyncGenerator<string, void, undefined> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Generate the streaming prompt with delimiters as GeminiContent array
      const contents = getActionPlanStreamingPrompt(chosenPath, language);

      // Start the streaming response using existing wrapper
      const stream = generateContentStream(
        GEMINI_REASONING_MODEL,
        contents,
        undefined, // no tools for streaming MVP
        {
          temperature: 0.7,
        }
      );

      // Yield chunks as they arrive (wrapper already extracts text)
      for await (const textChunk of stream) {
        if (textChunk) {
          yield textChunk;
        }
      }

      // If we get here, streaming completed successfully
      return;

    } catch (error) {
      lastError = error as Error;
      console.error(`Action-Plan streaming attempt ${attempt} failed:`, error);
      
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
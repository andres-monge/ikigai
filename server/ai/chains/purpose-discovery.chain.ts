/**
 * @file purpose-discovery.chain.ts
 *
 * Orchestrates the Purpose Discovery analysis using Vercel AI SDK's streamObject
 * to produce the Core-Drivers analysis and three Purpose Paths with embedded
 * salary information.
 *
 * Updated in Step 14.1 to use structured streaming approach for consistency
 * with the streaming endpoint while maintaining backward compatibility.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamObject } from 'ai';
import type {
  Language,
  QuestionnaireResponses,
} from '@shared/schema';
import {
  purposeDiscoveryResultSchema,
  type PurposeDiscoveryResult,
} from '../schemas';
import {
  getPurposeDiscoverySystemPrompt,
} from '../prompts';
import { env } from '../../env.js';

/* -------------------------------------------------------------------------- */
/* Public Chain                                                               */
/* -------------------------------------------------------------------------- */

export async function getPurposeDiscoveryChain(
  userInput: QuestionnaireResponses,
  language: Language,
  maxRetries = 2,
): Promise<PurposeDiscoveryResult> {
  let lastError: Error | null = null;

  // Initialize Google provider for Vercel AI SDK
  const google = createGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const systemPrompt = getPurposeDiscoverySystemPrompt(
        userInput,
        language,
      );

      // Use streamObject to generate structured output
      const result = streamObject({
        model: google(env.GEMINI_REASONING_MODEL),
        schema: purposeDiscoveryResultSchema,
        prompt: systemPrompt,
        temperature: 0.3, // Lower temperature for more consistent output
      });

      // Collect all partial objects until stream completes
      let finalObject: PurposeDiscoveryResult | undefined;
      for await (const partialObject of result.partialObjectStream) {
        // Only assign if we have a complete object
        if (partialObject?.coreDriversAnalysis && partialObject?.purposePaths?.length === 3) {
          finalObject = partialObject as PurposeDiscoveryResult;
        }
      }

      if (finalObject) {
        return finalObject;
      }

      throw new Error('StreamObject completed but no final object was received');
    } catch (error) {
      lastError = error as Error;
      console.error(`Purpose-Discovery chain attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  throw new Error(
    `AI chain failed after ${maxRetries} attempts. Last error: ${lastError?.message}`,
  );
} 
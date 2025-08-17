/**
 * @file purpose-discovery.chain.ts
 *
 * Orchestrates the two-call Gemini sequence that produces the Core-Drivers
 * analysis, three Purpose Paths and the accompanying Salary data.
 *
 * Extracted from the former `server/ai/chains.ts` during Phase 2 – Step 6 to
 * respect the "small, focused files" guideline.
 */

import { z } from 'zod';
import {
  generateContent,
  generateContentWithSearch,
  GEMINI_REASONING_MODEL,
} from '../wrapper';
import type { GeminiContent } from '../types';
import type {
  Language,
  QuestionnaireResponses,
} from '@shared/schema';
import {
  salaryFunctionArgSchema,
  rawSalaryDataSchema,
  purposeDiscoveryResultSchema,
  purposeDiscoveryOpenApiSchema,
  type SalaryFunctionArgs,
  type RawSalaryData,
  type PurposeDiscoveryResult,
} from '../schemas';
import {
  formatQuestionnaireForPrompt, // kept for future use but currently not called directly
  getPurposeDiscoverySystemPrompt,
} from '../prompts';
import { getSalaryDataTool } from '../tools';
import { getSalaryDataForCareers } from '../../services';

/* -------------------------------------------------------------------------- */
/* Public Chain                                                               */
/* -------------------------------------------------------------------------- */

export async function getPurposeDiscoveryChain(
  userInput: QuestionnaireResponses,
  language: Language,
  maxRetries = 2,
): Promise<PurposeDiscoveryResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const systemPrompt = getPurposeDiscoverySystemPrompt(
        userInput,
        language,
      );
      const initialContent: GeminiContent[] = [
        { role: 'user', parts: [{ text: systemPrompt }] },
      ];
      const reasoningResponse1 = await generateContent(
        GEMINI_REASONING_MODEL,
        initialContent,
        [getSalaryDataTool],
      );

      // SAFETY GUARD ✨  ------------------------------
      const firstCandidate = reasoningResponse1.candidates?.[0];
      if (!firstCandidate?.content?.parts) {
        console.error('[PurposeDiscovery] Reasoning model returned no content. Full response ->');
        try {
          console.error(JSON.stringify(reasoningResponse1, null, 2));
        } catch (jsonErr) {
          console.error('[PurposeDiscovery] Failed to stringify response:', jsonErr);
        }
        throw new Error('Reasoning model returned no content. See previous log for raw response.');
      }
      // ----------------------------------------------

      // --- Function-calling logic ------------------------------------------------
      const functionCall = firstCandidate.content.parts.find(
        (p) => !!p.functionCall,
      )?.functionCall;

      if (!functionCall || functionCall.name !== 'getSalaryDataForCareers') {
        throw new Error('Reasoning model did not call the required function.');
      }

      const validation = salaryFunctionArgSchema.safeParse(functionCall.args);
      if (!validation.success) {
        throw new Error(
          `Reasoning model provided invalid arguments for function call: ${validation.error.message}`,
        );
      }

      const salaryData = await getSalaryDataForCareers(
        validation.data.careers,
        language,
      );
      const functionResponseContent: GeminiContent = {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'getSalaryDataForCareers',
              response: { content: { salaryData } },
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
          responseSchema: purposeDiscoveryOpenApiSchema,
        },
      );

      const finalJsonText =
        reasoningResponse2.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!finalJsonText)
        throw new Error('Reasoning model did not return a final JSON object.');

      const finalResult = JSON.parse(finalJsonText);
      const finalValidation =
        purposeDiscoveryResultSchema.safeParse(finalResult);

      if (finalValidation.success) {
        return finalValidation.data;
      }

      // Validation failed – will retry if attempts remain
      lastError = new Error(
        `Final AI output validation failed: ${finalValidation.error.message}`,
      );
      console.warn(`Attempt ${attempt} failed validation. Retrying...`);
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
import {
  createGoogleGenerativeAI,
  type GoogleLanguageModelOptions,
} from '@ai-sdk/google';
import { extractJsonMiddleware, wrapLanguageModel } from 'ai';
import { env } from '../env.js';

const google = createGoogleGenerativeAI({
  apiKey: env.GEMINI_API_KEY,
});

export function createGeminiStructuredModel() {
  return wrapLanguageModel({
    model: google(env.GEMINI_REASONING_MODEL),
    middleware: extractJsonMiddleware(),
  });
}

export const geminiStructuredProviderOptions = {
  google: {
    // Gemini 3 Flash / Flash-Lite do not support a true "off" switch for
    // thinking. "minimal" is the lowest supported level.
    thinkingConfig: {
      thinkingLevel: 'medium',
    },
  } satisfies GoogleLanguageModelOptions,
} as const;

/**
 * @file gemini.ts
 * @description Minimal client-side types for Gemini AI integration.
 * Note: All AI functionality is handled server-side for security.
 * This file only contains essential types that may be needed for client-server communication.
 */

// Basic Gemini API response structure for potential future client-side use
export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

// Error handling for client-side error display
export class GeminiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'GeminiError';
  }
}

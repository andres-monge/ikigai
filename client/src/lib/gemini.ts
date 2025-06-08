// Client-side utilities for Gemini AI integration
// Note: Actual API calls are handled server-side for security

export interface GeminiConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  model: 'models/gemini-2.5-flash-preview-05-20',
  temperature: 0.7,
  maxTokens: 2048,
};

export interface GeminiChatConfig extends GeminiConfig {
  temperature: 0.8;
  maxTokens: 1024;
}

export const DEFAULT_CHAT_CONFIG: GeminiChatConfig = {
  model: 'models/gemini-2.5-flash-preview-05-20',
  temperature: 0.8,
  maxTokens: 1024,
};

// Types for Gemini API responses
export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

// Utility function to extract text from Gemini response
export function extractTextFromGeminiResponse(response: GeminiResponse): string | null {
  return response.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

// Utility function to parse JSON from Gemini response
export function parseJsonFromGeminiResponse(response: GeminiResponse): any | null {
  const text = extractTextFromGeminiResponse(response);
  if (!text) return null;

  try {
    // Try to find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Failed to parse JSON from Gemini response:', error);
    return null;
  }
}

// System prompts for different use cases
export const SYSTEM_PROMPTS = {
  ikigaiAnalysis: (responses: any) => `
You are Nami, an AI career guide inspired by Paul Graham's wisdom and stoic principles. Analyze the following questionnaire responses and provide:

1. Core Drivers Summary (Energy, Edge, Impact, Economic Reality)
2. Three distinct Purpose Paths aligned with ikigai principles

User Responses: ${JSON.stringify(responses)}

Please respond in JSON format with:
{
  "analysis": {
    "energy": "What the user loves - detailed analysis",
    "edge": "What the user is good at - detailed analysis", 
    "impact": "What the world needs - detailed analysis",
    "economic": "Economic reality - detailed analysis"
  },
  "purposePaths": [
    {
      "title": "Career Path Title",
      "description": "Brief description",
      "ikigaiAlignment": {
        "love": "How it aligns with what they love",
        "goodAt": "How it aligns with what they're good at",
        "worldNeeds": "How it meets world needs",
        "pay": "Salary range estimate"
      },
      "actionStrategy": "Detailed step-by-step action plan"
    }
  ]
}
`,

  chatResponse: (sessionAnalysis: any, purposePaths: any[], chatHistory: any[], userMessage: string) => `
You are Nami, an AI career guide with a personality inspired by Paul Graham's essays and stoic principles. You are encouraging, wise, and action-oriented. 

You are helping users refine their ikigai analysis and career paths. The user has completed an assessment and received their results.

User's Analysis: ${JSON.stringify(sessionAnalysis)}
User's Purpose Paths: ${JSON.stringify(purposePaths)}

Previous conversation:
${chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Respond helpfully to the user's question: ${userMessage}

Keep your response conversational, insightful, and actionable. Draw from stoic principles when appropriate, and maintain Paul Graham's direct, thoughtful communication style.
`
};

// Validation functions
export function validateGeminiApiKey(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.length > 0;
}

export function validateGeminiModel(model: string): boolean {
  return typeof model === 'string' && model.startsWith('models/');
}

// Error handling utilities
export class GeminiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'GeminiError';
  }
}

export function handleGeminiApiError(error: any): GeminiError {
  if (error.response) {
    return new GeminiError(
      `Gemini API error: ${error.response.statusText}`,
      error.response.status
    );
  }
  
  if (error.message) {
    return new GeminiError(`Gemini API error: ${error.message}`);
  }
  
  return new GeminiError('Unknown Gemini API error occurred');
}

// Rate limiting utilities (for client-side awareness)
export interface RateLimitInfo {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay: number;
}

export const GEMINI_RATE_LIMITS: RateLimitInfo = {
  requestsPerMinute: 15,
  tokensPerMinute: 32000,
  requestsPerDay: 1500,
};

// Utility to estimate token count (rough approximation)
export function estimateTokenCount(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters for English
  return Math.ceil(text.length / 4);
}

// Format user responses for Gemini analysis
export function formatResponsesForAnalysis(responses: any): string {
  return `
PASSIONS:
- Activities that energize: ${responses.passions?.activities || 'Not provided'}
- Topics of interest: ${responses.passions?.topics?.join(', ') || 'Not provided'}
- Flow state experiences: ${responses.passions?.energizing || 'Not provided'}

SKILLS:
- Natural strengths: ${responses.skills?.strengths?.join(', ') || 'Not provided'}
- Key achievements: ${responses.skills?.achievements || 'Not provided'}
- Others' feedback: ${responses.skills?.feedback || 'Not provided'}

VALUES:
- Work values: ${responses.values?.workValues?.join(', ') || 'Not provided'}
- Desired impact: ${responses.values?.impact || 'Not provided'}
- Preferred environment: ${responses.values?.environment || 'Not provided'}

ECONOMIC CONSIDERATIONS:
- Salary expectations: ${responses.economic?.salaryExpectation || 'Not provided'}
- Timeline: ${responses.economic?.timeline || 'Not provided'}
- Financial constraints: ${responses.economic?.stability || 'Not provided'}
`;
}

/**
 * @file chat-refinement.chain.ts
 *
 * Generates a complete AI response for result or action-plan refinements
 * using Gemini's standard `generateContent` API (non-streaming).  This
 * simplifies the chat workflow and avoids SSE complexities.
 */

import { generateContent, GEMINI_REASONING_MODEL } from '../wrapper';
import type { GeminiContent } from '../types';
import { storage } from '../../storage';
import { getChatRefinementSystemPrompt } from '../prompts';
import type { SelectChatMessage } from '@shared/schema';

/**
 * Generates a complete AI response for result or action-plan refinements
 */
export async function getChatRefinementChain(
  sessionId: string,
  currentMessage: string,
  context: 'discovery' | 'action_plan',
  pathId: number | null = null,
): Promise<string> {
  const session = await storage.getAssessmentSessionBySessionId(sessionId);
  if (!session) throw new Error(`Session not found for chat (id: ${sessionId})`);

  const { language } = session;
  let contextString: string;

  if (context === 'discovery') {
    // Focus optionally on a single path
    let purposePaths = session.purposePaths ?? [];
    if (pathId !== null) {
      const selected = purposePaths.find((p) => p.id === pathId);
      if (!selected) {
        throw new Error(`Path with id ${pathId} not found in session.`);
      }
      purposePaths = [selected];
    }

    contextString = `Here are the results you previously generated for the user:\n\nANALYSIS:\n${JSON.stringify(
      session.coreDriversAnalysis,
      null,
      2,
    )}\n\nPATHS:\n${JSON.stringify(purposePaths, null, 2)}\n\nNow, respond to their latest message to refine these results.`;
  } else {
    // action_plan
    if (!session.actionPlan) {
      throw new Error('Cannot start action-plan chat without an action plan.');
    }
    contextString = `Here is the action plan you previously generated for the user:\n\n${JSON.stringify(
      session.actionPlan,
      null,
      2,
    )}\n\nNow, respond to their latest message to refine this plan.`;
  }

  const systemPrompt = getChatRefinementSystemPrompt(
    context,
    language,
    contextString,
    pathId !== null,
  );

  // Historical messages for conversation continuity
  const history = await storage.getChatMessages(session.id);
  const conversationHistory: GeminiContent[] = history.map((msg: SelectChatMessage) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));

  const fullConversation: GeminiContent[] = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    {
      role: 'model',
      parts: [{
        text:
          language === 'es'
            ? 'Entendido. Estoy lista para ayudar.'
            : 'Understood. I am ready to help.',
      }],
    },
    ...conversationHistory,
    { role: 'user', parts: [{ text: currentMessage }] },
  ];

  const response = await generateContent(
    GEMINI_REASONING_MODEL,
    fullConversation,
  );

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('AI response contained no content.');
  }
  return text;
} 
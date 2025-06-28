/**
 * @file chat-refinement.chain.ts
 *
 * Streams AI responses for result or action-plan refinements using Gemini's
 * streaming API (`generateContentStream`).  The function is implemented as an
 * `async generator`, yielding chunks that the Express route immediately
 * forwards to the client as Server-Sent Events.
 */

import { generateContentStream, GEMINI_REASONING_MODEL } from '../wrapper';
import type { GeminiContent } from '../types';
import { storage } from '../../storage';
import { getChatRefinementSystemPrompt } from '../prompts';
import type { SelectChatMessage } from '@shared/schema';

/**
 * Async generator that yields streaming chat responses chunk-by-chunk.
 */
export async function* getChatRefinementChain(
  sessionId: string,
  currentMessage: string,
  context: 'discovery' | 'action_plan',
  pathId: number | null = null,
): AsyncGenerator<string, void, undefined> {
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

  const stream = generateContentStream(
    GEMINI_REASONING_MODEL,
    fullConversation,
  );

  for await (const chunk of stream) {
    yield chunk;
  }
} 
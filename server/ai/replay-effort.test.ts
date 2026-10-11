import { openai } from '@ai-sdk/openai';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { expect, it } from 'vitest';
import { createCareerMap } from '../../shared/career-map/index.js';
import { createReplayStorage } from '../../scripts/replay-revelio.js';
import { createMethodAgent, type CreateMethodAgentOptions } from './agent.js';
import { createMethodModuleLoader } from './method/loader.js';

it.each([undefined, 'high'] as const)('sends the requested replay effort %s through prepareStep', async (effort) => {
  const turn = { userId: 'effort-user', turnId: 'effort-turn', clientMessageId: 'effort-message', leaseId: 'effort-lease', requestFingerprint: 'effort-fingerprint', origin: 'agent-turn' as const };
  const model = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ chunks: [
    { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: 'What do you enjoy making?' }, { type: 'text-end', id: 'text' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } },
  ] as never }) }) });
  const options: CreateMethodAgentOptions & { replayReasoningEffort?: 'high' } = {
    model, nativeWebSearchTool: openai.tools.webSearch(), storage: createReplayStorage(createCareerMap(turn.userId), [], turn),
    loader: await createMethodModuleLoader(), userId: turn.userId, conversationId: 'conv_effort', turn,
    turnSequence: 1, occurredAt: '2026-10-11T12:00:00.000Z', replayReasoningEffort: effort,
  };
  const result = await createMethodAgent(options).stream({ prompt: 'Help me explore.' });
  const reader = result.stream.getReader();
  while (!(await reader.read()).done) { /* consume the complete engine turn */ }
  expect(model.doStreamCalls.length).toBeGreaterThan(0);
  for (const call of model.doStreamCalls) expect(call.providerOptions?.openai?.reasoningEffort).toBe(effort ?? 'low');
});

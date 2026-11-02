import { afterEach, expect, it, vi } from 'vitest';
import { logAIStreamError } from './ai-logger.js';

afterEach(() => vi.restoreAllMocks());

it('keeps retained AI diagnostics free of user input, bearer IDs and raw provider error text', () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = Object.assign(new Error('PRIVATE_ERROR_SENTINEL'), {
    name: 'PRIVATE_ERROR_CLASS_SENTINEL', text: 'PRIVATE_MODEL_SENTINEL',
  });
  logAIStreamError({
    error, endpoint: 'purpose-discovery', phase: 'streaming',
    sessionId: 'PRIVATE_BEARER_SENTINEL',
    userInput: { passions: [{ question: 'PRIVATE_QUESTION_SENTINEL', answer: 'PRIVATE_ANSWER_SENTINEL' }] } as never,
  });
  expect(JSON.parse(output.mock.calls[0][0])).toEqual({
    type: 'ai_stream_error', endpoint: 'purpose-discovery', phase: 'streaming', errorClass: 'ExternalProviderError',
  });
  expect(JSON.stringify(output.mock.calls)).not.toContain('PRIVATE_');
});

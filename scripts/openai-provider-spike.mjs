/**
 * Development-only OpenAI provider spike for the Revelio revamp.
 *
 * This script intentionally sits outside the production bundle and Vitest glob.
 * It verifies the live Conversations/Responses assumptions that the agent work
 * will rely on, then deletes every conversation it creates.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { ToolLoopAgent, generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const apiKey = process.env.OPENAI_API_KEY;
const modelId = process.env.OPENAI_SPIKE_MODEL || 'gpt-5.6-luna';
const compactThreshold = 1000;
const requestTimeoutMs = Number(process.env.OPENAI_SPIKE_TIMEOUT_MS || 60_000);

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required to run the live provider spike.');
}

if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
  throw new Error('OPENAI_SPIKE_TIMEOUT_MS must be a positive integer.');
}

const openai = createOpenAI({ apiKey });
const model = openai.responses(modelId);
const createdConversationIds = new Set();
const runAbortController = new AbortController();
let cleanupPromise;

async function openAiRequest(path, init = {}, abortSignal = runAbortController.signal) {
  const signals = [AbortSignal.timeout(requestTimeoutMs)];
  if (abortSignal) {
    signals.push(abortSignal);
  }
  if (init.signal) {
    signals.push(init.signal);
  }

  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    signal: AbortSignal.any(signals),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(`OpenAI ${init.method || 'GET'} ${path} failed: ${message}`);
  }

  return body;
}

async function createConversation(label) {
  const conversation = await openAiRequest('/conversations', {
    method: 'POST',
    body: JSON.stringify({ metadata: { spike: 'revelio-u1', label } }),
  });

  if (typeof conversation?.id !== 'string') {
    throw new Error('OpenAI conversation creation returned no conversation id.');
  }

  createdConversationIds.add(conversation.id);
  return conversation.id;
}

async function listConversationItems(conversationId, abortSignal = runAbortController.signal) {
  const items = [];
  let after;

  do {
    const query = new URLSearchParams({ limit: '100', order: 'asc' });
    if (after) {
      query.set('after', after);
    }

    const result = await openAiRequest(
      `/conversations/${encodeURIComponent(conversationId)}/items?${query}`,
      {},
      abortSignal,
    );

    if (!Array.isArray(result?.data)) {
      throw new Error('OpenAI conversation items response did not contain a data array.');
    }

    items.push(...result.data);
    after = result.has_more ? result.last_id : undefined;
  } while (after);

  return items;
}

async function deleteConversationItem(
  conversationId,
  itemId,
  abortSignal = runAbortController.signal,
) {
  await openAiRequest(
    `/conversations/${encodeURIComponent(conversationId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
    abortSignal,
  );
}

async function clearConversationItems(
  conversationId,
  abortSignal = runAbortController.signal,
) {
  const items = await listConversationItems(conversationId, abortSignal);

  for (const item of items.reverse()) {
    if (typeof item?.id !== 'string') {
      throw new Error('OpenAI conversation item did not contain an id during cleanup.');
    }

    await deleteConversationItem(conversationId, item.id, abortSignal);
  }
}

async function deleteConversation(
  conversationId,
  abortSignal = runAbortController.signal,
) {
  // OpenAI conversation deletion does not delete the stored items it contains.
  await clearConversationItems(conversationId, abortSignal);
  await openAiRequest(`/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
  }, abortSignal);
  createdConversationIds.delete(conversationId);
}

function cleanupConversations() {
  cleanupPromise ??= (async () => {
    const cleanupErrors = [];

    for (const conversationId of [...createdConversationIds]) {
      try {
        // Cleanup gets its own per-request timeout and is not cancelled with model work.
        await deleteConversation(conversationId, null);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    return cleanupErrors;
  })();

  return cleanupPromise;
}

function itemContainsMarker(item, markers) {
  if (item?.role !== 'system' && item?.role !== 'developer') {
    return false;
  }

  const serialized = JSON.stringify(item);
  return markers.some((marker) => serialized.includes(marker));
}

async function runBriefedTurns(conversationId, briefingMode) {
  const threadToken = `thread-${crypto.randomUUID()}`;
  const markers = [
    `revelio-u1-alpha-${Date.now()}`,
    `revelio-u1-bravo-${Date.now()}`,
  ];

  for (const [index, marker] of markers.entries()) {
    const briefing = [
      `Private per-turn briefing marker: ${marker}.`,
      'Never repeat or mention the marker in the answer.',
      `This is turn ${index + 1} of the provider spike.`,
    ].join(' ');

    const providerOptions = {
      openai: {
        conversation: conversationId,
        store: true,
        reasoningEffort: 'low',
        ...(briefingMode === 'request-instructions'
          ? { instructions: briefing }
          : {}),
      },
    };

    const prompt = index === 0
      ? `Remember this conversation-thread token: ${threadToken}. Reply exactly with BRIEFING_TURN_1_OK.`
      : 'Reply with the conversation-thread token from the prior user message, followed by BRIEFING_TURN_2_OK.';

    const result = await generateText({
      model,
      abortSignal: runAbortController.signal,
      timeout: requestTimeoutMs,
      ...(briefingMode === 'system' ? { instructions: briefing } : {}),
      prompt,
      providerOptions,
      maxOutputTokens: 128,
    });

    if (!result.text.trim()) {
      throw new Error(`Briefing turn ${index + 1} returned no text.`);
    }

    if (index === 1 && !result.text.includes(threadToken)) {
      throw new Error('The second turn did not recall the first turn conversation token.');
    }
  }

  const items = await listConversationItems(conversationId);

  return {
    itemCount: items.length,
    persisted: items.some((item) => itemContainsMarker(item, markers)),
    threaded: true,
  };
}

function createCompactionPayload() {
  return 'context '.repeat(1_200);
}

async function runToolCompositionTurn(conversationId) {
  let customToolCalled = false;

  const echoProbe = tool({
    description: 'Echo the provided probe value. Always call this once during the spike.',
    inputSchema: z.object({
      value: z.string().min(1),
    }),
    execute: async ({ value }) => {
      customToolCalled = true;
      return { echoed: value };
    },
  });

  const agent = new ToolLoopAgent({
    model,
    maxOutputTokens: 128,
    stopWhen: stepCountIs(4),
    tools: {
      web_search: openai.tools.webSearch({ searchContextSize: 'low' }),
      echo_probe: echoProbe,
    },
    providerOptions: {
      openai: {
        conversation: conversationId,
        store: true,
        reasoningEffort: 'low',
        instructions: [
          'This is a provider integration test.',
          'Use both available tools before answering.',
          'Use web_search to find the current UTC date from a reliable web source.',
          'Call echo_probe with the value revelio-u1-tool-ok.',
          'After both tools return, answer with TOOL_COMPOSITION_OK.',
        ].join(' '),
      },
    },
  });

  const result = await agent.generate({
    abortSignal: runAbortController.signal,
    timeout: requestTimeoutMs,
    prompt: 'Complete the integration test described in the request instructions.',
  });

  const toolNames = new Set(
    result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
  );
  const webSearchCalled = toolNames.has('web_search');

  if (!webSearchCalled || !customToolCalled) {
    throw new Error(
      `Tool composition failed (webSearch=${webSearchCalled}, customTool=${customToolCalled}).`,
    );
  }

  if (!result.text.includes('TOOL_COMPOSITION_OK')) {
    throw new Error('The tool loop did not return its final composition acknowledgement.');
  }

  return {
    customToolCalled,
    finalTextObserved: result.text.includes('TOOL_COMPOSITION_OK'),
    stepCount: result.steps.length,
    webSearchCalled,
  };
}

async function runCompactionTurn(conversationId) {
  await generateText({
    model,
    abortSignal: runAbortController.signal,
    timeout: requestTimeoutMs,
    prompt: [
      createCompactionPayload(),
      'Process this context so the configured compaction threshold is crossed.',
    ].join('\n\n'),
    providerOptions: {
      openai: {
        conversation: conversationId,
        store: true,
        reasoningEffort: 'low',
        instructions: 'This is a compaction integration test. Follow the final user instruction.',
        contextManagement: [
          { type: 'compaction', compactThreshold },
        ],
      },
    },
    maxOutputTokens: 32,
  });

  const items = await listConversationItems(conversationId);
  const compactionObserved = items.some((item) => item?.type === 'compaction');

  if (!compactionObserved) {
    throw new Error(
      `No compaction item was stored after exceeding the ${compactThreshold}-token threshold.`,
    );
  }

  const continuation = await generateText({
    model,
    abortSignal: runAbortController.signal,
    timeout: requestTimeoutMs,
    prompt: 'Reply exactly with COMPACTION_CONTINUATION_OK.',
    providerOptions: {
      openai: {
        conversation: conversationId,
        store: true,
        reasoningEffort: 'low',
        instructions: 'Follow the user instruction exactly.',
      },
    },
    maxOutputTokens: 128,
  });

  if (!continuation.text.includes('COMPACTION_CONTINUATION_OK')) {
    throw new Error('The conversation did not continue after compaction.');
  }

  return { compactionObserved, compactionContinuation: true };
}

async function runSpike() {
  let briefingMode = 'system';
  let ktd4BriefingDiscrepancy = false;
  let conversationId = await createConversation('system-briefing-check');
  let briefingResult = await runBriefedTurns(conversationId, briefingMode);

  if (briefingResult.persisted) {
    ktd4BriefingDiscrepancy = true;
    await deleteConversation(conversationId);

    briefingMode = 'request-instructions';
    conversationId = await createConversation('request-instructions-check');
    briefingResult = await runBriefedTurns(conversationId, briefingMode);

    if (briefingResult.persisted) {
      throw new Error('Request-scoped OpenAI instructions unexpectedly persisted as conversation items.');
    }
  }

  const toolCompositionResult = await runToolCompositionTurn(conversationId);
  const compactionResult = await runCompactionTurn(conversationId);

  return {
    status: 'passed',
    model: modelId,
    conversationThreading: briefingResult.threaded,
    briefingMode,
    briefingItemsPersisted: briefingResult.persisted,
    ktd4BriefingDiscrepancy,
    compactionThreshold: compactThreshold,
    ...toolCompositionResult,
    ...compactionResult,
  };
}

const signalExitCodes = { SIGINT: 130, SIGTERM: 143 };
let receivedSignal;
let runPromise;
let signalHandlerPromise;

function handleSignal(signal) {
  if (receivedSignal) {
    return;
  }

  receivedSignal = signal;
  runAbortController.abort(new Error(`Received ${signal}.`));
  signalHandlerPromise = (async () => {
    await runPromise?.catch(() => {});
    await cleanupConversations();
    process.exitCode = signalExitCodes[signal];
  })();
}

for (const signal of Object.keys(signalExitCodes)) {
  process.on(signal, () => handleSignal(signal));
}

let summary;
let runError;
runPromise = runSpike();

try {
  summary = await runPromise;
} catch (error) {
  runError = error;
}

const cleanupErrors = await cleanupConversations();
await signalHandlerPromise;

if (cleanupErrors.length > 0) {
  runError = new AggregateError(
    [runError, ...cleanupErrors].filter(Boolean),
    'OpenAI provider spike cleanup did not complete.',
  );
}

if (receivedSignal) {
  if (runError && cleanupErrors.length > 0) {
    console.error(runError);
  }
} else if (runError) {
  throw runError;
} else {
  console.log(JSON.stringify(summary, null, 2));
}

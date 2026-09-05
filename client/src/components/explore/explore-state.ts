import {
  claimLinkedCitationStreamPartSchema,
  operationStatusStreamPartSchema,
  type ClaimLinkedCitation,
  type NormalizedHistoryMessageData,
  type OperationStatusData,
} from '@shared/streaming-schemas';

export type NormalizedHistoryMessage = NormalizedHistoryMessageData;

export interface AgentStreamState {
  text: string;
  citations: ClaimLinkedCitation[];
  operationEvents: OperationStatusData[];
  providerFailed: boolean;
}

export function consumeAgentStreamLine(
  state: AgentStreamState,
  line: string,
): AgentStreamState {
  if (!line.startsWith('data: ')) return state;
  const payload = line.slice('data: '.length);
  if (payload === '[DONE]') return state;
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return state;
  }
  if (!value || typeof value !== 'object') return state;
  const chunk = value as Record<string, unknown>;
  const operationPart = operationStatusStreamPartSchema.safeParse(value);
  if (operationPart.success) {
    const incoming = operationPart.data.data;
    if (state.operationEvents.some((event) => (
      event.turnId === incoming.turnId
      && event.messageId === incoming.messageId
      && event.operationId === incoming.operationId
      && event.sequence === incoming.sequence
    ))) return state;
    return {
      ...state,
      operationEvents: [...state.operationEvents, incoming],
    };
  }
  const citationPart = claimLinkedCitationStreamPartSchema.safeParse(value);
  if (citationPart.success) {
    if (state.citations.some((citation) => citation.citationId === citationPart.data.data.citationId)) {
      return state;
    }
    return {
      ...state,
      citations: [...state.citations, citationPart.data.data],
    };
  }
  if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
    return { ...state, text: state.text + chunk.delta };
  }
  if (
    chunk.type === 'error'
    || (chunk.type === 'finish' && chunk.finishReason === 'error')
  ) {
    return { ...state, providerFailed: true };
  }
  return state;
}

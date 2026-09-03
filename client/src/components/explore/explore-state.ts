import {
  claimLinkedCitationStreamPartSchema,
  isOperationStatusTransition,
  operationStatusStreamPartSchema,
  type ClaimLinkedCitation,
  type NormalizedHistoryMessageData,
  type OperationStatusData,
} from '@shared/streaming-schemas';

export type NormalizedHistoryMessage = NormalizedHistoryMessageData & {
  citations?: ClaimLinkedCitation[];
};

export type OperationAttempts = Record<string, OperationStatusData>;

export interface AgentStreamState {
  text: string;
  citations: ClaimLinkedCitation[];
  attempts: OperationAttempts;
  providerFailed: boolean;
}

export function operationAttemptKey(status: Pick<OperationStatusData, 'turnId' | 'messageId' | 'operationId'>): string {
  return `${status.turnId}/${status.messageId}/${status.operationId}`;
}

export function reduceOperationAttempts(
  attempts: OperationAttempts,
  incoming: OperationStatusData,
): OperationAttempts {
  const key = operationAttemptKey(incoming);
  const previous = attempts[key];
  if (!isOperationStatusTransition(previous, incoming)) return attempts;
  return { ...attempts, [key]: incoming };
}

export function failUnresolvedOperationAttempts(
  attempts: OperationAttempts,
  existingKeys: ReadonlySet<string>,
): OperationAttempts {
  let next = attempts;
  for (const [key, attempt] of Object.entries(attempts)) {
    if (existingKeys.has(key) || attempt.status !== 'Saving') continue;
    next = reduceOperationAttempts(next, {
      ...attempt,
      status: 'Failed',
      sequence: 1,
      errorClass: 'IncompleteOperationStatus',
    });
  }
  return next;
}

export function terminalStatusForEnvelope(
  status: 'committed' | 'idempotent-replay' | 'conflict' | 'rejected',
): Extract<OperationStatusData['status'], 'Saved' | 'Conflict' | 'Rejected'> {
  if (status === 'committed' || status === 'idempotent-replay') return 'Saved';
  return status === 'conflict' ? 'Conflict' : 'Rejected';
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
    return {
      ...state,
      attempts: reduceOperationAttempts(state.attempts, operationPart.data.data),
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

export type MethodRouteLabel =
  | 'agent-turn'
  | 'history-read'
  | 'workspace-read'
  | 'workspace-operation'
  | 'audio-transcription'
  | 'method-unmatched';

/**
 * Match Express's default case-insensitive, non-strict Method routing without
 * changing route behavior. Separators consumed across the nested `/api` and
 * `/agent` mounts plus one optional trailing slash are canonicalized;
 * lookalike prefixes and doubled separators inside the remaining path stay
 * outside or unmatched.
 */
export function normalizeMethodRequestPath(requestPath: string): string | undefined {
  const lowerPath = requestPath.toLowerCase();
  const namespace = /^\/api\/+agent(?=\/+|$)/.exec(lowerPath);
  if (!namespace) return undefined;
  const suffix = lowerPath.slice(namespace[0].length);
  const relativePath = suffix.length === 0 ? '/' : suffix.replace(/^\/+/, '/');
  if (relativePath.length > 1 && relativePath.endsWith('/') && !relativePath.endsWith('//')) {
    return relativePath.slice(0, -1);
  }
  return relativePath;
}

/**
 * Privacy-safe operational route identity. Never return the incoming path:
 * unknown suffixes are attacker-controlled data and collapse to one label.
 */
export function methodRouteLabel(method: string, requestPath: string): MethodRouteLabel {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizeMethodRequestPath(requestPath);
  switch (`${normalizedMethod} ${normalizedPath}`) {
    case 'POST /': return 'agent-turn';
    case 'GET /history':
    case 'HEAD /history': return 'history-read';
    case 'GET /workspace':
    case 'HEAD /workspace': return 'workspace-read';
    case 'POST /workspace/operations': return 'workspace-operation';
    case 'POST /audio/transcribe': return 'audio-transcription';
    default: return 'method-unmatched';
  }
}

export function methodBuildVersion(value: string | undefined): string {
  return value && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value) ? value : 'unknown';
}

/** Reuses the Method request record, including requests that close before finish. */
export function observeMethodRequest(
  response: { statusCode: number; locals: { methodLog?: Record<string, unknown>; methodLatency?: { summary(): Record<string, unknown> }; methodTiming?: { summary(): Record<string, number> } }; once(event: string, listener: () => void): unknown },
  input: { requestId: string; route: MethodRouteLabel; log: (entry: Record<string, unknown>) => void },
): void {
  const started = Date.now();
  const buildVersion = methodBuildVersion(process.env.REVELIO_BUILD_VERSION);
  let emitted = false;
  const emit = (outcome: 'response-finished' | 'response-closed') => {
    if (emitted) return;
    emitted = true;
    input.log({
      type: 'method_request', requestId: input.requestId, route: input.route,
      status: response.statusCode, durationMs: Date.now() - started,
      ...(response.locals.methodLog ?? {}),
      ...(response.locals.methodLatency ? { latency: response.locals.methodLatency.summary() } : {}),
      ...(response.locals.methodTiming ? { serverTiming: response.locals.methodTiming.summary() } : {}),
      buildVersion, outcome, browserDelivery: 'unknown',
    });
  };
  response.once('finish', () => emit('response-finished'));
  response.once('close', () => emit('response-closed'));
}

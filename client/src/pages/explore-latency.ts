type ClientPhase = 'headers' | 'first-byte' | 'first-text' | 'first-render'
  | 'response-end' | 'refetch-start' | 'refetch-end';

export interface ClientLatencyTrace {
  requestId(value: string | null): void;
  mark(phase: ClientPhase): void;
  finish(): void;
}

export function createClientLatencyTrace(route: 'agent-turn' | 'workspace-operation'): ClientLatencyTrace | undefined {
  if (!import.meta.env.DEV || import.meta.env.VITE_REVELIO_LATENCY_TRACE !== '1') return undefined;
  const started = performance.now();
  const phases = new Map<ClientPhase, number>();
  let requestId: string | undefined;
  return {
    requestId(value) {
      // Only the server's opaque UUID is allowed into the diagnostic record.
      if (value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        requestId = value;
      }
    },
    mark(phase) {
      if (!phases.has(phase)) phases.set(phase, performance.now());
    },
    finish() {
      const ms = (phase: ClientPhase) => {
        const value = phases.get(phase);
        return value === undefined ? undefined : Math.round(value - started);
      };
      console.info('method_latency_client', {
        route,
        requestId,
        headersMs: ms('headers'),
        firstByteMs: ms('first-byte'),
        firstTextMs: ms('first-text'),
        firstRenderMs: ms('first-render'),
        responseEndMs: ms('response-end'),
        refetchStartMs: ms('refetch-start'),
        refetchEndMs: ms('refetch-end'),
      });
    },
  };
}

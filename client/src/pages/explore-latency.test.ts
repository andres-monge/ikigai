import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClientLatencyTrace } from './explore-latency';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('client Method latency trace', () => {
  it('stays disabled until explicitly enabled in development', () => {
    vi.stubEnv('VITE_NAMI_LATENCY_TRACE', '0');
    expect(createClientLatencyTrace('agent-turn')).toBeUndefined();
  });

  it('logs only fixed timing fields and an opaque server request id', () => {
    vi.stubEnv('VITE_NAMI_LATENCY_TRACE', '1');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const trace = createClientLatencyTrace('agent-turn');
    expect(trace).toBeDefined();
    trace!.requestId('private-message-or-provider-payload');
    trace!.mark('headers');
    trace!.mark('first-text');
    trace!.finish();

    expect(info).toHaveBeenCalledWith('method_latency_client', expect.objectContaining({
      route: 'agent-turn',
      headersMs: expect.any(Number),
      firstTextMs: expect.any(Number),
      requestId: undefined,
    }));
    expect(JSON.stringify(info.mock.calls)).not.toContain('private-message-or-provider-payload');
  });
});

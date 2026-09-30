import { afterEach, describe, expect, it, vi } from 'vitest';
import { MethodLatencyTrace, methodLatencyEnabled } from './agent-latency';

afterEach(() => vi.unstubAllEnvs());

describe('Method latency trace', () => {
  it('runs only with the explicit development switch', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REVELIO_LATENCY_TRACE', '1');
    expect(methodLatencyEnabled()).toBe(false);
    vi.stubEnv('NODE_ENV', 'development');
    expect(methodLatencyEnabled()).toBe(true);
  });

  it('keeps bounded numeric step and tool spans', () => {
    const trace = new MethodLatencyTrace();
    trace.mark('map-ready');
    trace.step(0, 'prepare-start');
    trace.step(0, 'prepare-end');
    trace.step(0, 'step-start');
    trace.step(0, 'tool-start');
    trace.step(0, 'tool-end');
    trace.step(0, 'tool-start');
    trace.step(0, 'tool-end');
    trace.step(0, 'step-finish');
    trace.step(50, 'step-start');

    expect(trace.summary()).toMatchObject({
      mapReadyMs: expect.any(Number),
      steps: [{
        index: 0,
        prepareMs: expect.any(Number),
        stepMs: expect.any(Number),
        toolObservedMs: expect.any(Number),
        toolCount: 2,
        searchCount: 0,
      }],
    });
  });
});

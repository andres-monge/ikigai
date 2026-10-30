import { afterEach, describe, expect, it, vi } from 'vitest';
import { MethodLatencyTrace, methodLatencyEnabled } from './agent-latency';
import { REVELIO_MAX_AGENT_STEPS } from '../ai/limits.js';

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
  it('bounds binding capture to fixed finite numeric fields', () => {
    const trace = new MethodLatencyTrace();
    const markers = { elapsedMs: 2, budgetMs: 5000, expectedCount: REVELIO_MAX_AGENT_STEPS, promiseSettled: 1 as const,
      requestAborted: 0 as const, deadlineAborted: 0 as const, privateValue: 'private-marker-provider-payload' };
    trace.bindingMarkers({ ...markers, expectedCount: REVELIO_MAX_AGENT_STEPS + 1 });
    expect(trace.summary()).not.toHaveProperty('terminalBinding');
    trace.bindingMarkers(markers);
    const attempt = { index: 1, elapsedMs: 10, readReturned: 1 as const, httpStatus: 0, requestedLimit: 100,
      returnedCount: 100, hasMore: 1, cursorPresent: 1, matchCounts: Array(REVELIO_MAX_AGENT_STEPS).fill(1),
      requestAborted: 0 as const, deadlineAborted: 0 as const, privateValue: 'private-marker-provider-payload' };
    trace.bindingAttempt({ ...attempt, elapsedMs: NaN });
    trace.bindingAttempt({ ...attempt, matchCounts: Array(REVELIO_MAX_AGENT_STEPS + 1).fill(1) });
    for (let index = 1; index <= 6; index += 1) trace.bindingAttempt({ ...attempt, index });
    trace.bindingExit({ phase: 4, elapsedMs: Infinity, complete: 0, readBudgetMs: 5000, requestAborted: 0, deadlineAborted: 0 });
    const captured = trace.summary().terminalBinding as { markerWait: unknown; attempts: unknown[]; exit?: unknown };
    expect(captured.attempts).toHaveLength(5);
    expect(captured).not.toHaveProperty('exit');
    expect(captured.markerWait).toEqual({ elapsedMs: 2, budgetMs: 5000, expectedCount: REVELIO_MAX_AGENT_STEPS,
      promiseSettled: 1, requestAborted: 0, deadlineAborted: 0 });
    expect(captured.attempts[0]).toEqual({ index: 1, elapsedMs: 10, readReturned: 1, httpStatus: 0,
      requestedLimit: 100, returnedCount: 100, hasMore: 1, cursorPresent: 1, matchCounts: Array(REVELIO_MAX_AGENT_STEPS).fill(1),
      requestAborted: 0, deadlineAborted: 0 });
    expect(JSON.stringify(captured)).not.toContain('private-marker-provider-payload');
  });

  it.each([21, REVELIO_MAX_AGENT_STEPS])('retains every numeric marker count for a supported %i-step turn', (expectedCount) => {
    const trace = new MethodLatencyTrace();
    const matchCounts = Array.from({ length: expectedCount }, (_, index) => index % 3);
    trace.bindingMarkers({ elapsedMs: 2, budgetMs: 5000, expectedCount, promiseSettled: 1,
      requestAborted: 0, deadlineAborted: 0 });
    trace.bindingAttempt({ index: 1, elapsedMs: 3, readReturned: 1, httpStatus: 0, requestedLimit: 100,
      returnedCount: 100, hasMore: 1, cursorPresent: 1, matchCounts, requestAborted: 0, deadlineAborted: 0 });
    expect(trace.summary().terminalBinding).toMatchObject({
      markerWait: { expectedCount }, attempts: [{ matchCounts }],
    });
  });

  it('cannot append after binding exit or mutate captured records through aliases', () => {
    const trace = new MethodLatencyTrace();
    const matchCounts = [1];
    const attempt = { index: 1, elapsedMs: 3, readReturned: 1 as const, httpStatus: 0, requestedLimit: 100,
      returnedCount: 1, hasMore: 0, cursorPresent: 0, matchCounts, requestAborted: 0 as const, deadlineAborted: 0 as const };
    trace.bindingAttempt(attempt);
    trace.bindingExit({ phase: 3, elapsedMs: 4, complete: 1, readBudgetMs: 5000, requestAborted: 0, deadlineAborted: 0 });
    const original = trace.summary();
    matchCounts[0] = 99;
    trace.bindingAttempt({ ...attempt, index: 2 });
    trace.bindingMarkers({ elapsedMs: 0, budgetMs: 5000, expectedCount: 1, promiseSettled: 1, requestAborted: 0, deadlineAborted: 0 });
    trace.bindingExit({ phase: 1, elapsedMs: 9, complete: 0, readBudgetMs: 5000, requestAborted: 0, deadlineAborted: 1 });
    expect(trace.summary()).toEqual(original);
    (original.terminalBinding as { attempts: Array<{ matchCounts: number[] }> }).attempts[0].matchCounts[0] = 50;
    expect(trace.summary().terminalBinding).toMatchObject({ attempts: [{ matchCounts: [1] }] });
  });

});

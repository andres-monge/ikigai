import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { observeMethodRequest, methodBuildVersion } from './agent-logging.js';
import { MethodRequestTiming } from './agent-latency.js';

function response() {
  return Object.assign(new EventEmitter(), { statusCode: 200, locals: {} as Record<string, unknown> });
}

describe('production request evidence', () => {
  it('records finish once without claiming browser delivery', () => {
    const res = response();
    const log = vi.fn();
    observeMethodRequest(res, { requestId: 'request-1', route: 'history-read', log });
    res.emit('finish'); res.emit('close');
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatchObject({ outcome: 'response-finished', browserDelivery: 'unknown', buildVersion: 'unknown' });
  });
  it('records a premature close separately and preserves safe failure class', () => {
    const res = response();
    res.locals.methodLog = { errorClass: 'ConversationHistoryProviderError' };
    const log = vi.fn();
    observeMethodRequest(res, { requestId: 'request-1', route: 'history-read', log });
    res.emit('close'); res.emit('finish');
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatchObject({ outcome: 'response-closed', errorClass: 'ConversationHistoryProviderError' });
  });
  it('only accepts a bounded build token', () => {
    expect(methodBuildVersion('abc1234')).toBe('abc1234');
    expect(methodBuildVersion('https://secret.example/?key=private')).toBe('unknown');
    expect(methodBuildVersion('a'.repeat(81))).toBe('unknown');
    expect(methodBuildVersion(undefined)).toBe('unknown');
  });
  it('keeps only fixed phase timings with unknown absent phases', () => {
    const timing = new MethodRequestTiming();
    timing.mark('provider-start'); timing.mark('safe-text'); timing.mark('terminal-done');
    expect(timing.summary()).toEqual({ providerStartMs: expect.any(Number), firstSafeServerTextMs: expect.any(Number), terminalHandlingDoneMs: expect.any(Number) });
    const empty = new MethodRequestTiming();
    expect(empty.summary()).toEqual({});
  });
});

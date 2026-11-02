import { afterEach, describe, expect, it, vi } from 'vitest';
import request from './test-fixtures/loopback-http.js';
import { createApp } from './app.js';
import { storage } from './storage-instance.js';
import { db } from './db.js';
import * as authModule from './auth.js';
import { getPurposeDiscoveryStreamChain, getActionPlanStreamChain } from './ai/chains/index.js';

vi.mock('./ai/chains/index.js', () => ({
  getPurposeDiscoveryStreamChain: vi.fn(),
  getActionPlanStreamChain: vi.fn(),
}));

const retiredPaths = [
  '/api/analyze/stream', '/api/action-plan/stream', '/api/questionnaire/save',
  '/api/session/PRIVATE_BEARER_SENTINEL', '/api/session/start-over',
  '/api/transcribe', '/api/analytics/event',
];

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('retired public legacy APIs', () => {
  it.each(['true', 'false'])('rejects every family before storage/provider work with AGENT_ENABLED=%s', async (agentEnabled) => {
    vi.stubEnv('AGENT_ENABLED', agentEnabled);
    const reads = vi.spyOn(storage, 'getAssessmentSessionBySessionId');
    const events = vi.spyOn(storage, 'logAnalyticsEvent');
    const transaction = vi.spyOn(db, 'transaction');
    const auth = vi.spyOn(authModule, 'getAuth');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp();
    for (const path of retiredPaths) {
      const response = await (await request(app)).post(path).send({ sessionId: 'PRIVATE_BEARER_SENTINEL' });
      expect(response.status).toBe(410);
      expect(response.body).toEqual({ error: 'This legacy service has been retired', code: 'LEGACY_RETIRED' });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    }
    expect(reads).not.toHaveBeenCalled(); expect(events).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled(); expect(auth).not.toHaveBeenCalled();
    expect(getPurposeDiscoveryStreamChain).not.toHaveBeenCalled();
    expect(getActionPlanStreamChain).not.toHaveBeenCalled();
    expect(JSON.stringify([log.mock.calls, error.mock.calls])).not.toContain('PRIVATE_BEARER_SENTINEL');
  });

  it.each(['get', 'head', 'put', 'patch', 'delete', 'options', 'trace'] as const)('retires all families for %s too', async (method) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = createApp();
    for (const path of retiredPaths) {
      const response = await (await request(app))[method](path);
      expect(response.status).toBe(410);
    }
  });

  it.each(['/api/SESSION/PRIVATE_BEARER_SENTINEL/', '/api//session/PRIVATE_BEARER_SENTINEL', '/api/transcribe/nested', '/API/ANALYZE/STREAM/'])('closes matching mount aliases: %s', async (path) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect((await (await request(createApp())).post(path).send({})).status).toBe(410);
  });

  it.each(['{"private":"PRIVATE_BODY_SENTINEL', JSON.stringify({ private: 'PRIVATE_BODY_SENTINEL'.repeat(7000) })])('rejects retired requests before parsing their bodies', async (payload) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await (await request(createApp())).post('/api/questionnaire/save').set('Content-Type', 'application/json').send(payload);
    expect(response.status).toBe(410);
    expect(JSON.stringify([response.body, log.mock.calls, error.mock.calls])).not.toContain('PRIVATE_BODY_SENTINEL');
  });

  it('returns JSON for unknown APIs rather than the SPA document', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = await (await request(createApp())).get('/api/not-a-route');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'API route not found' });
  });
});

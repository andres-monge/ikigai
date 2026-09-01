import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApiRequestLogger } from './app.js';

describe('protected Method logger boundary', () => {
  it('never captures protected response bodies while preserving the legacy logger behavior', async () => {
    const writeLog = vi.fn();
    const app = express();
    app.use(createApiRequestLogger(writeLog));
    app.get('/api/agent/history', (_request, response) => response.json({
      messages: ['PRIVATE_HISTORY_SENTINEL'],
      briefing: 'PRIVATE_BRIEFING_SENTINEL',
      providerBody: 'PRIVATE_PROVIDER_SENTINEL',
    }));
    app.get('/api/legacy-probe', (_request, response) => response.json({ legacy: 'visible-prefix' }));

    const protectedResponse = await request(app).get('/api/agent/history');
    expect(protectedResponse.status).toBe(200);
    expect(writeLog).not.toHaveBeenCalled();

    const legacyResponse = await request(app).get('/api/legacy-probe');
    expect(legacyResponse.status).toBe(200);
    expect(writeLog).toHaveBeenCalledOnce();
    expect(writeLog.mock.calls[0]?.[0]).toContain('visible-prefix');
    expect(JSON.stringify(writeLog.mock.calls)).not.toMatch(/PRIVATE_HISTORY|PRIVATE_BRIEFING|PRIVATE_PROVIDER/);
  });
});

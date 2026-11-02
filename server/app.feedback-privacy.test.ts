import { describe, expect, it, vi } from 'vitest';
import request from './test-fixtures/loopback-http.js';
const mocks = vi.hoisted(() => ({ save: vi.fn(), auth: vi.fn() }));
vi.mock('./auth-middleware.js', () => ({
  requireAuth: (req: any, res: any, next: any) => { mocks.auth(); res.status(401).json({ error: 'Authentication required' }); },
  getProtectedIdentity: () => { throw new Error('Must not read identity'); },
}));
vi.mock('./feedback/storage.js', async original => ({ ...await original(), FeedbackStorage: class { save = mocks.save; } }));
vi.mock('./env.js', async original => ({ ...await original(), env: { NODE_ENV: 'test', BETTER_AUTH_SECRET: '', BETTER_AUTH_URL: 'http://localhost:5173' } }));
import { createApp } from './app.js';

describe('feedback parser order and privacy in the actual app', () => {
  it('rejects metadata before global JSON parsing and auth before the bounded parser', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = createApp();
      const response = await (await request(app)).post('/API/FEEDBACK/').set('content-type', 'application/json').send('{private-invalid');
      expect(response.status).toBe(403); expect(mocks.auth).not.toHaveBeenCalled();
      const signedOut = await (await request(app)).post('/api/feedback').set('origin', 'http://localhost:5173').set('x-nami-request', '1').set('content-type', 'application/json').send('{private-invalid');
      expect(signedOut.status).toBe(401); expect(mocks.save).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-invalid');
    } finally { log.mockRestore(); }
  });
});

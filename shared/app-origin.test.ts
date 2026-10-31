import { describe, expect, it } from 'vitest';
import { configuredAppOrigin, configuredMethodOrigin, parseAppOrigin } from './app-origin.js';

describe('app origin', () => {
  it('accepts a configured HTTPS deployment origin without pinning a domain', () => {
    expect(configuredAppOrigin('https://heynami.vercel.app/', { nodeEnv: 'production' }))
      .toBe('https://heynami.vercel.app');
    expect(configuredAppOrigin('https://preview.example.test', { nodeEnv: 'development', vercel: '1' }))
      .toBe('https://preview.example.test');
  });

  it('allows only the approved localhost origin outside Vercel', () => {
    expect(configuredAppOrigin('http://localhost:5173', { nodeEnv: 'test' }))
      .toBe('http://localhost:5173');
    expect(configuredAppOrigin('http://127.0.0.1:5173', { nodeEnv: 'test' })).toBeUndefined();
    expect(configuredAppOrigin('http://localhost:5174', { nodeEnv: 'development' })).toBeUndefined();
  });

  it.each(['', 'not-a-url', 'https://example.test/path', 'https://example.test/?x=1', 'https://user@example.test'])
    ('rejects a non-origin value %s', (value) => {
      expect(parseAppOrigin(value)).toBeUndefined();
      expect(configuredAppOrigin(value, { nodeEnv: 'production' })).toBeUndefined();
    });

  it('fails closed when a Vercel deployment is reported as local development', () => {
    expect(configuredAppOrigin('http://localhost:5173', { nodeEnv: 'development', vercel: '1' }))
      .toBeUndefined();
    expect(configuredAppOrigin('http://example.test', { nodeEnv: 'production' })).toBeUndefined();
  });

  it('allows an exact injected local test origin while rejecting it on Vercel', () => {
    expect(configuredMethodOrigin('https://nami.test', { nodeEnv: 'test' })).toBe('https://nami.test');
    expect(configuredMethodOrigin('https://nami.test', { nodeEnv: 'development' })).toBeUndefined();
    expect(configuredMethodOrigin('http://localhost:5173', { nodeEnv: 'development' }))
      .toBe('http://localhost:5173');
    expect(configuredMethodOrigin('http://localhost:5173', { nodeEnv: 'test', vercel: '1' })).toBeUndefined();
  });
});

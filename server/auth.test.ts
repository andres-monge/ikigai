import type { IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://user:pass@db.example.test/revelio',
    BETTER_AUTH_DATABASE_URL:
      'postgresql://user:pass@ep-auth.us-east-2.aws.neon.tech/revelio',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:5001',
    AUTH_SIGNUPS_ENABLED: false,
    NODE_ENV: 'test',
  },
}));
import {
  AUTH_SCHEMA,
  AuthConfigurationError,
  GOOGLE_IDENTITY_SCOPES,
  INTERNAL_CLIENT_IP_HEADER,
  buildAuthOptions,
  buildAuthPoolOptions,
  resolveTrustedClientIp,
} from './auth.js';

const configuredEnv = {
  DATABASE_URL:
    'postgresql://user:pass@ep-app-pooler.us-east-2.aws.neon.tech/revelio?sslmode=require',
  BETTER_AUTH_DATABASE_URL:
    'postgresql://user:pass@ep-auth.us-east-2.aws.neon.tech/revelio?sslmode=require',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:5001',
  AUTH_SIGNUPS_ENABLED: true,
  NODE_ENV: 'test' as const,
};

describe('I2 Better Auth configuration', () => {
  it('pins Google as the sole identity-only provider and permits new accounts when enabled', () => {
    const options = buildAuthOptions(configuredEnv, { kind: 'test-database' });

    expect(Object.keys(options.socialProviders ?? {})).toEqual(['google']);
    expect(options.socialProviders?.google).toMatchObject({
      scope: GOOGLE_IDENTITY_SCOPES,
      disableDefaultScope: true,
      disableImplicitSignUp: false,
    });
    expect(options.baseURL).toBe('http://localhost:5001');
    expect(options.trustedOrigins).toEqual(['http://localhost:5001']);
  });

  it('fails signup closed without preventing repeat Google sign-in', () => {
    const options = buildAuthOptions(
      { ...configuredEnv, AUTH_SIGNUPS_ENABLED: false },
      { kind: 'test-database' },
    );

    // Better Auth's provider-level implicit-signup switch denies only creation;
    // the Google provider remains configured so an existing account can sign in.
    expect(options.socialProviders?.google).toMatchObject({
      disableImplicitSignUp: true,
    });
    expect(Object.keys(options.socialProviders ?? {})).toEqual(['google']);
  });

  it('keeps OAuth tokens encrypted, linking disabled, state durable, and security checks enabled', () => {
    const options = buildAuthOptions(configuredEnv, { kind: 'test-database' });

    expect(options.account).toMatchObject({
      encryptOAuthTokens: true,
      storeStateStrategy: 'database',
      accountLinking: { enabled: false },
    });
    expect(options.rateLimit).toMatchObject({
      enabled: true,
      storage: 'database',
    });
    expect(options.advanced).toMatchObject({
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: { ipAddressHeaders: [INTERNAL_CLIENT_IP_HEADER] },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      },
    });
  });

  it('uses secure cookies in production', () => {
    const options = buildAuthOptions(
      {
        ...configuredEnv,
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'https://revelio-me.vercel.app',
      },
      { kind: 'test-database' },
    );

    expect(options.advanced?.defaultCookieAttributes?.secure).toBe(true);
  });

  it('uses only the direct auth URL for the isolated native pool', () => {
    const poolOptions = buildAuthPoolOptions(configuredEnv);
    const result = new URL(poolOptions.connectionString as string);

    expect(AUTH_SCHEMA).toBe('auth');
    expect(result.hostname).toBe('ep-auth.us-east-2.aws.neon.tech');
    expect(result.searchParams.get('sslmode')).toBe('require');
    expect(result.searchParams.get('options')).toBe('-c search_path=auth');
    expect(poolOptions.connectionString).not.toContain('ep-app-pooler');
  });

  it.each([
    ['missing', ''],
    ['malformed', 'not-a-postgresql-url'],
    [
      'Neon pooled',
      'postgresql://user:pass@ep-auth-pooler.us-east-2.aws.neon.tech/revelio',
    ],
  ])('fails auth closed when BETTER_AUTH_DATABASE_URL is %s', (_label, value) => {
    expect(() =>
      buildAuthPoolOptions({
        ...configuredEnv,
        BETTER_AUTH_DATABASE_URL: value,
      }),
    ).toThrow(AuthConfigurationError);
  });

  it('keeps application and Drizzle traffic on pooled DATABASE_URL', async () => {
    const [applicationDb, drizzleConfig] = await Promise.all([
      readFile(new URL('./db.ts', import.meta.url), 'utf8'),
      readFile(new URL('../drizzle.config.ts', import.meta.url), 'utf8'),
    ]);

    for (const source of [applicationDb, drizzleConfig]) {
      expect(source).toContain('env.DATABASE_URL');
      expect(source).not.toContain('env.BETTER_AUTH_DATABASE_URL');
    }
  });

  it('keeps the reviewed 1.6.29 SQL artifact isolated from public migrations', async () => {
    const sql = await readFile(
      new URL('../migrations/auth/0000_better_auth_1_6_29.sql', import.meta.url),
      'utf8',
    );

    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS auth');
    expect(sql).toContain('SET LOCAL search_path TO auth');
    expect(sql).not.toContain('SET LOCAL search_path TO public');
    for (const table of ['user', 'session', 'account', 'verification', 'rateLimit']) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });
});

describe('trusted auth client address', () => {
  function requestWith({
    forwardedFor,
    internal,
    remoteAddress,
  }: {
    forwardedFor?: string;
    internal?: string;
    remoteAddress?: string;
  }) {
    return {
      headers: {
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
        ...(internal ? { [INTERNAL_CLIENT_IP_HEADER]: internal } : {}),
      },
      socket: { remoteAddress },
    } as unknown as IncomingMessage;
  }

  it('uses only Vercel-overwritten x-forwarded-for in production', () => {
    const request = requestWith({
      forwardedFor: '203.0.113.9',
      internal: '198.51.100.7',
      remoteAddress: '10.0.0.2',
    });

    expect(resolveTrustedClientIp(request, 'production')).toBe('203.0.113.9');
  });

  it('ignores client-supplied forwarding headers outside production', () => {
    const request = requestWith({
      forwardedFor: '203.0.113.9',
      internal: '198.51.100.7',
      remoteAddress: '127.0.0.1',
    });

    expect(resolveTrustedClientIp(request, 'test')).toBe('127.0.0.1');
    expect(resolveTrustedClientIp(request, 'development')).toBe('127.0.0.1');
  });
});

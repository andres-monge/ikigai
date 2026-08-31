import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { Pool, type PoolConfig } from 'pg';
import { env, type Env } from './env.js';

export const AUTH_SCHEMA = 'auth';
export const INTERNAL_CLIENT_IP_HEADER = 'x-revelio-client-ip';
export const GOOGLE_IDENTITY_SCOPES = ['openid', 'email', 'profile'] as const;

const LOCAL_AUTH_URL = 'http://localhost:5001';
const PRODUCTION_AUTH_URL = 'https://revelio-me.vercel.app';

export type AuthRuntimeEnv = Pick<
  Env,
  | 'BETTER_AUTH_DATABASE_URL'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'BETTER_AUTH_SECRET'
  | 'BETTER_AUTH_URL'
  | 'AUTH_SIGNUPS_ENABLED'
  | 'NODE_ENV'
>;

export class AuthConfigurationError extends Error {
  constructor() {
    super('Authentication is not configured');
    this.name = 'AuthConfigurationError';
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Better Auth owns a dedicated PostgreSQL schema. Drizzle never uses this
 * connection and remains scoped to public through drizzle.config.ts.
 */
export function withAuthSchemaSearchPath(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${AUTH_SCHEMA}`);
  return url.toString();
}

function isNeonPooledHostname(hostname: string): boolean {
  return hostname.endsWith('.neon.tech') && /-pooler(?:\.|$)/.test(hostname);
}

/**
 * Better Auth must never borrow the application's pooled DATABASE_URL. Neon
 * poolers reject the startup option used to isolate the auth schema, so an
 * absent, malformed, or explicitly pooled auth URL leaves auth unavailable.
 */
export function buildAuthPoolOptions(runtimeEnv: AuthRuntimeEnv): PoolConfig {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(runtimeEnv.BETTER_AUTH_DATABASE_URL);
  } catch {
    throw new AuthConfigurationError();
  }

  if (
    databaseUrl.protocol !== 'postgresql:' ||
    !databaseUrl.hostname ||
    isNeonPooledHostname(databaseUrl.hostname.toLowerCase())
  ) {
    throw new AuthConfigurationError();
  }

  return {
    connectionString: withAuthSchemaSearchPath(databaseUrl.toString()),
    connectionTimeoutMillis: 5_000,
  };
}

function expectedAuthUrl(nodeEnv: AuthRuntimeEnv['NODE_ENV']): string {
  return nodeEnv === 'production' ? PRODUCTION_AUTH_URL : LOCAL_AUTH_URL;
}

function assertAuthConfigured(runtimeEnv: AuthRuntimeEnv): void {
  const baseUrl = normalizeBaseUrl(runtimeEnv.BETTER_AUTH_URL);
  const hasCredentials =
    runtimeEnv.GOOGLE_CLIENT_ID.length > 0 &&
    runtimeEnv.GOOGLE_CLIENT_SECRET.length > 0 &&
    runtimeEnv.BETTER_AUTH_SECRET.length >= 32;

  if (!hasCredentials || baseUrl !== expectedAuthUrl(runtimeEnv.NODE_ENV)) {
    throw new AuthConfigurationError();
  }
}

/**
 * Produces the reviewed, testable Better Auth option set. Supplying the
 * database separately keeps configuration tests from opening a connection.
 */
export function buildAuthOptions(
  runtimeEnv: AuthRuntimeEnv,
  database: BetterAuthOptions['database'],
): BetterAuthOptions {
  const baseURL = normalizeBaseUrl(runtimeEnv.BETTER_AUTH_URL);

  return {
    appName: 'Revelio',
    baseURL,
    basePath: '/api/auth',
    secret: runtimeEnv.BETTER_AUTH_SECRET,
    database,
    trustedOrigins: [baseURL],
    socialProviders: {
      google: {
        clientId: runtimeEnv.GOOGLE_CLIENT_ID,
        clientSecret: runtimeEnv.GOOGLE_CLIENT_SECRET,
        disableDefaultScope: true,
        scope: [...GOOGLE_IDENTITY_SCOPES],
        disableIdTokenSignIn: true,
        disableImplicitSignUp: !runtimeEnv.AUTH_SIGNUPS_ENABLED,
        disableSignUp: !runtimeEnv.AUTH_SIGNUPS_ENABLED,
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path === '/sign-in/social' && context.body?.provider === 'google') {
          context.body.scopes = undefined;
        }
      }),
    },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: 'database',
      storeAccountCookie: false,
      accountLinking: {
        enabled: false,
        disableImplicitLinking: true,
      },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
    },
    advanced: {
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: {
        // server/app.ts overwrites this private header from a trusted source
        ipAddressHeaders: [INTERNAL_CLIENT_IP_HEADER],
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: runtimeEnv.NODE_ENV === 'production',
      },
    },
  };
}

function normalizeIp(value: string | undefined): string | undefined {
  if (!value || value.includes(',')) {
    return undefined;
  }

  const candidate = value.trim().replace(/^::ffff:/, '');
  return isIP(candidate) ? candidate : undefined;
}

/**
 * Vercel overwrites x-forwarded-for in production. Local/test requests never
 * trust forwarding headers and use the socket peer instead.
 */
export function resolveTrustedClientIp(
  request: Pick<IncomingMessage, 'headers' | 'socket'>,
  nodeEnv: AuthRuntimeEnv['NODE_ENV'],
): string {
  if (nodeEnv === 'production') {
    const forwarded = request.headers['x-forwarded-for'];
    const trustedForwarded = normalizeIp(
      Array.isArray(forwarded) ? undefined : forwarded,
    );
    if (trustedForwarded) {
      return trustedForwarded;
    }
  }

  return normalizeIp(request.socket.remoteAddress) ?? '127.0.0.1';
}

function createAuth(runtimeEnv: AuthRuntimeEnv) {
  assertAuthConfigured(runtimeEnv);
  const pool = new Pool(buildAuthPoolOptions(runtimeEnv));

  return betterAuth(buildAuthOptions(runtimeEnv, pool));
}

export type RevelioAuth = ReturnType<typeof createAuth>;

let authInstance: RevelioAuth | undefined;

/**
 * Auth is initialized only at an auth/protected call site. Missing founder
 * provisioning therefore fails those surfaces closed without taking down the
 * anonymous legacy application.
 */
export function getAuth(): RevelioAuth {
  authInstance ??= createAuth(env);
  return authInstance;
}

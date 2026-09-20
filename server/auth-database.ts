import type { PoolConfig } from 'pg';

export const AUTH_SCHEMA = 'auth';

export class AuthDatabaseConfigurationError extends Error {
  constructor() {
    super('Authentication database is not configured');
    this.name = 'AuthDatabaseConfigurationError';
  }
}

export const AUTH_DATABASE_CONNECTION_TIMEOUT_MS = 5_000;

export const AUTH_DATABASE_POOL_OPTIONS = Object.freeze({
  connectionTimeoutMillis: AUTH_DATABASE_CONNECTION_TIMEOUT_MS,
});

export function withAuthSchemaSearchPath(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${AUTH_SCHEMA}`);
  return url.toString();
}

function isNeonPooledHostname(hostname: string): boolean {
  return hostname.endsWith('.neon.tech') && /-pooler(?:\.|$)/.test(hostname);
}

/** Shared direct/unpooled auth-pool contract for runtime and operator tools. */
export function buildAuthDatabasePoolOptions(databaseUrlValue: string): PoolConfig {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(databaseUrlValue);
  } catch {
    throw new AuthDatabaseConfigurationError();
  }

  if (
    databaseUrl.protocol !== 'postgresql:' ||
    !databaseUrl.hostname ||
    isNeonPooledHostname(databaseUrl.hostname.toLowerCase())
  ) {
    throw new AuthDatabaseConfigurationError();
  }

  return {
    connectionString: withAuthSchemaSearchPath(databaseUrl.toString()),
    ...AUTH_DATABASE_POOL_OPTIONS,
  };
}

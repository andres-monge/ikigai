/**
 * @description
 * Database client configuration and initialization for the Revelio application.
 * This module sets up the Drizzle ORM client with Neon's serverless PostgreSQL driver,
 * providing a single, reusable database instance throughout the server application.
 *
 * The database client is configured with:
 * - Neon serverless driver optimized for Vercel Functions
 * - Environment-based configuration via the centralized env module
 * - Full schema awareness through the shared schema definitions
 *
 * Usage:
 * ```typescript
 * import { db } from './db.js';
 *
 * // Execute type-safe database queries
 * const sessions = await db.select().from(assessmentSessions);
 * ```
 */

import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as NodePostgresPool } from 'pg';
import ws from 'ws';
import { env } from './env.js';
import * as schema from '../shared/schema.js';

/* ────────────────────────────────────────────────────────────────────────── */
/* Neon Serverless Database Configuration                                     */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Configure WebSocket for Node.js environments.
 * Required for Node.js v21 and earlier which lack native WebSocket support.
 * Vercel Functions run on Node.js 18/20, so this is necessary.
 */
neonConfig.webSocketConstructor = ws;

/**
 * Neon serverless connection pool.
 * Uses WebSocket-based connections optimized for serverless environments.
 */
const useDisposableTestDatabase = process.env.NODE_ENV === 'test'
  && process.env.U4_STORAGE_TEST_DATABASE === '1';
const disposableTestConnectionString = process.env.U4_STORAGE_TEST_DATABASE_URL;

if (useDisposableTestDatabase && !disposableTestConnectionString) {
  throw new Error('U4_STORAGE_TEST_DATABASE_URL is required for disposable database tests.');
}

/**
 * Configured Drizzle ORM database client using Neon's serverless driver.
 *
 * This client provides:
 * - Type-safe query building and execution
 * - Full schema awareness for all tables and relations
 * - WebSocket-based connections optimized for serverless environments
 * - Pool-like API compatible with existing test infrastructure
 * - Automatic SQL generation and optimization
 *
 * The Neon serverless driver is recommended for Vercel Functions because:
 * - It avoids connection pool exhaustion issues common in serverless
 * - WebSocket connections are efficient for multiple queries per request
 * - No need for external connection poolers like PgBouncer
 *
 * @see https://orm.drizzle.team/docs/connect-neon
 */
const database = useDisposableTestDatabase
  ? drizzleNodePostgres(new NodePostgresPool({
      connectionString: disposableTestConnectionString,
      allowExitOnIdle: true,
    }), { schema })
  : drizzleNeon({
      client: new NeonPool({ connectionString: env.DATABASE_URL }),
      schema,
    });

/**
 * Database client type for use in dependency injection or testing.
 * This type represents the complete Drizzle client interface including
 * all schema-aware methods and query builders.
 */
export type Database = ReturnType<typeof drizzleNodePostgres<typeof schema>>;
export const db = database as unknown as Database;

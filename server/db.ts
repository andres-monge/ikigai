/**
 * @description
 * Database client configuration and initialization for the Ikigai Finder application.
 * This module sets up the Drizzle ORM client with PostgreSQL connection pooling,
 * providing a single, reusable database instance throughout the server application.
 *
 * The database client is configured with:
 * - Connection pooling for optimal performance under concurrent load
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

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from './env.js';
import * as schema from '../shared/schema.js';

/* ────────────────────────────────────────────────────────────────────────── */
/* PostgreSQL Connection Pool Configuration                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * PostgreSQL connection pool instance.
 * The pool manages multiple database connections efficiently, allowing
 * the server to handle concurrent requests without connection bottlenecks.
 * 
 * Pool configuration defaults:
 * - Max connections: 20 (PostgreSQL default)
 * - Idle timeout: 30 seconds
 * - Connection timeout: 0 (no timeout)
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Drizzle ORM Client Instance                                               */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Configured Drizzle ORM database client.
 * 
 * This client provides:
 * - Type-safe query building and execution
 * - Full schema awareness for all tables and relations
 * - Connection pooling via the PostgreSQL pool
 * - Automatic SQL generation and optimization
 * 
 * The client is ready to use immediately and will establish database
 * connections lazily when the first query is executed.
 */
export const db = drizzle(pool, { schema });

/**
 * Database client type for use in dependency injection or testing.
 * This type represents the complete Drizzle client interface including
 * all schema-aware methods and query builders.
 */
export type Database = typeof db;
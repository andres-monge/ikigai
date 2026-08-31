import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles, type MigrationMeta } from 'drizzle-orm/migrator';
import { Pool } from 'pg';
import * as schema from '../shared/schema.js';
import type { Database } from './db.js';
import { assertDisposableStorageTestUrl } from './storage.test-database-safety.js';

const CHILD_DATABASE_PATTERN = /^ikigai_u4_test_[a-z0-9_]+$/;
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const registeredDatabases = new Map<string, StorageTestDatabaseHarness>();

const rawAdminConnectionString = process.env.U4_STORAGE_TEST_DATABASE_URL;
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Storage integration database provisioning is allowed only in NODE_ENV=test.');
}
if (process.env.U4_STORAGE_TEST_DATABASE !== '1') {
  throw new Error('Set U4_STORAGE_TEST_DATABASE=1 to authorize disposable storage test databases.');
}
if (!rawAdminConnectionString) {
  throw new Error('U4_STORAGE_TEST_DATABASE_URL is required for storage integration tests.');
}

const adminTarget = assertDisposableStorageTestUrl(rawAdminConnectionString);
const adminPool = new Pool({ connectionString: adminTarget.connectionString, max: 1 });
let adminPoolEnded = false;

export type StorageTestDatabaseHarness = {
  databaseName: string;
  connectionString: string;
  pool: Pool;
  database: Database;
  applyReviewedMigrationChain(): Promise<void>;
  applyReviewedMigration(index: number): Promise<void>;
  dispose(): Promise<void>;
};

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function assertDisposableChildDatabaseName(databaseName: string): void {
  if (
    !CHILD_DATABASE_PATTERN.test(databaseName)
    || databaseName.startsWith('ikigai_u4_test_admin_')
    || databaseName.length > 63
  ) {
    throw new Error(`Refusing unsafe storage test database target: ${databaseName}`);
  }
}

function childConnectionString(databaseName: string): string {
  const url = new URL(adminTarget.connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function reviewedMigrations(): MigrationMeta[] {
  return readMigrationFiles({ migrationsFolder });
}

async function assertAdminTarget(): Promise<void> {
  const result = await adminPool.query<{ current_database: string }>('select current_database()');
  if (result.rows[0]?.current_database !== adminTarget.databaseName) {
    throw new Error('Storage integration database admin connection resolved to an unexpected database.');
  }
}

async function applyMigration(
  database: ReturnType<typeof drizzle<typeof schema>>,
  migration: MigrationMeta,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.execute('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    await transaction.execute(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        "id" serial PRIMARY KEY,
        "hash" text NOT NULL,
        "created_at" bigint
      )
    `);
    for (const statement of migration.sql) {
      await transaction.execute(statement);
    }
    await transaction.execute(sql`
      INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
      VALUES (${migration.hash}, ${migration.folderMillis})
    `);
  });
}

async function dropRegisteredDatabase(databaseName: string, pool: Pool): Promise<void> {
  const registered = registeredDatabases.get(databaseName);
  if (!registered || registered.pool !== pool) {
    throw new Error(`Refusing cleanup of unregistered storage test database: ${databaseName}`);
  }
  assertDisposableChildDatabaseName(databaseName);
  registeredDatabases.delete(databaseName);
  await pool.end();
  await adminPool.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [databaseName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
}

export async function provisionStorageTestDatabase(
  label: string,
  options: { applyMigrations?: boolean } = {},
): Promise<StorageTestDatabaseHarness> {
  if (adminPoolEnded) {
    throw new Error('The storage integration database harness has already been cleaned up.');
  }
  await assertAdminTarget();
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'fixture';
  const databaseName = `ikigai_u4_test_${safeLabel}_${process.pid}_${randomUUID().slice(0, 8)}`;
  assertDisposableChildDatabaseName(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`);

  const connectionString = childConnectionString(databaseName);
  const pool = new Pool({ connectionString });
  const nodePostgresDatabase = drizzle(pool, { schema });
  let disposed = false;
  const harness: StorageTestDatabaseHarness = {
    databaseName,
    connectionString,
    pool,
    database: nodePostgresDatabase as unknown as Database,
    async applyReviewedMigrationChain() {
      await migrate(nodePostgresDatabase, { migrationsFolder });
    },
    async applyReviewedMigration(index) {
      const migration = reviewedMigrations()[index];
      if (!migration) throw new Error(`Reviewed migration ${index} does not exist.`);
      await applyMigration(nodePostgresDatabase, migration);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await dropRegisteredDatabase(databaseName, pool);
    },
  };
  registeredDatabases.set(databaseName, harness);

  try {
    if (options.applyMigrations !== false) await harness.applyReviewedMigrationChain();
    return harness;
  } catch (error) {
    await harness.dispose();
    throw error;
  }
}

export async function cleanupStorageTestDatabases(): Promise<void> {
  for (const harness of [...registeredDatabases.values()]) await harness.dispose();
  if (!adminPoolEnded) {
    adminPoolEnded = true;
    await adminPool.end();
  }
}

const primaryHarness = await provisionStorageTestDatabase('primary');

export const storageTestPool = primaryHarness.pool;
export const storageTestDatabase = primaryHarness.database;

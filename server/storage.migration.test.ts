import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { PostgresStorage } from './storage.js';
import {
  cleanupStorageTestDatabases,
  provisionStorageTestDatabase,
  storageTestDatabase,
  storageTestPool,
  type StorageTestDatabaseHarness,
} from './storage.test-database.js';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const methodTables = [
  'agent_conversation_mappings',
  'agent_turn_leases',
  'agent_turns',
  'career_map_drafts',
  'career_map_history',
  'career_map_research_attempts',
  'career_maps',
  'method_erasure_jobs',
];

afterAll(cleanupStorageTestDatabases);

async function assertReviewedLedger(harness: Pick<StorageTestDatabaseHarness, 'pool'>) {
  const expected = readMigrationFiles({ migrationsFolder }).map((migration) => ({
    hash: migration.hash,
    created_at: String(migration.folderMillis),
  }));
  const actual = await harness.pool.query<{ hash: string; created_at: string }>(
    'select hash, created_at from drizzle.__drizzle_migrations order by created_at',
  );
  expect(actual.rows).toEqual(expected);
}

async function assertMigratedShape(harness: Pick<StorageTestDatabaseHarness, 'pool' | 'database'>) {
  const tables = await harness.pool.query<{ table_name: string }>(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = any($1::text[])
    order by table_name
  `, [methodTables]);
  expect(tables.rows.map((row) => row.table_name)).toEqual([...methodTables].sort());

  const columns = await harness.pool.query<{
    attname: string;
    data_type: string;
    not_null: boolean;
    default_expression: string | null;
    identity_kind: string;
  }>(`
    select
      attribute.attname,
      format_type(attribute.atttypid, attribute.atttypmod) as data_type,
      attribute.attnotnull as not_null,
      pg_get_expr(default_value.adbin, default_value.adrelid) as default_expression,
      attribute.attidentity as identity_kind
    from pg_attribute attribute
    left join pg_attrdef default_value
      on default_value.adrelid = attribute.attrelid
      and default_value.adnum = attribute.attnum
    where attribute.attrelid = 'public.analytics_events'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
    order by attribute.attnum
  `);
  expect(columns.rows.map((column) => ({
    name: column.attname,
    type: column.data_type,
    notNull: column.not_null,
  }))).toEqual([
    { name: 'id', type: 'integer', notNull: true },
    { name: 'session_id', type: 'text', notNull: true },
    { name: 'event_type', type: 'text', notNull: true },
    { name: 'metadata', type: 'jsonb', notNull: false },
    { name: 'created_at', type: 'timestamp with time zone', notNull: true },
  ]);
  expect(columns.rows.find((column) => column.attname === 'metadata')?.default_expression)
    .toBe("'{}'::jsonb");
  expect(columns.rows.find((column) => column.attname === 'created_at')?.default_expression)
    .toBe('now()');
  expect(await harness.pool.query(`
    select pg_get_serial_sequence('public.analytics_events', 'id') as sequence_name
  `)).toMatchObject({ rows: [{ sequence_name: expect.any(String) }] });
  expect((await harness.pool.query(`
    select
      sequence_data.seqstart::text,
      sequence_data.seqincrement::text,
      sequence_data.seqmin::text,
      sequence_data.seqmax::text,
      sequence_data.seqcache::text,
      sequence_data.seqcycle
    from pg_sequence sequence_data
    where sequence_data.seqrelid = 'public.analytics_events_id_seq'::regclass
  `)).rows).toEqual([{
    seqstart: '1',
    seqincrement: '1',
    seqmin: '1',
    seqmax: '2147483647',
    seqcache: '1',
    seqcycle: false,
  }]);
  expect((await harness.pool.query(`
    select
      (select count(*)::int from pg_trigger
       where tgrelid = 'public.analytics_events'::regclass and not tgisinternal) as triggers,
      (select count(*)::int from pg_rewrite
       where ev_class = 'public.analytics_events'::regclass) as rules
  `)).rows).toEqual([{ triggers: 0, rules: 0 }]);

  const primaryKey = await harness.pool.query<{ definition: string }>(`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.analytics_events'::regclass and contype = 'p'
  `);
  expect(primaryKey.rows).toEqual([{ definition: 'PRIMARY KEY (id)' }]);

  const generated = await harness.pool.query<{
    id: number;
    metadata: Record<string, never>;
    created_at: Date;
  }>(`
    insert into analytics_events (session_id, event_type)
    values ('migration-shape-session', 'migration-shape-event')
    returning id, metadata, created_at
  `);
  expect(generated.rows[0]).toMatchObject({
    id: expect.any(Number),
    metadata: {},
    created_at: expect.any(Date),
  });

  const audit = await new PostgresStorage({ database: harness.database }).auditCareerMapIntegrity();
  expect(audit).toMatchObject({ zeroInvalid: true, invalidRecords: [] });
}

async function createAnalyticsPredecessor(
  harness: StorageTestDatabaseHarness,
  idDefinition: string,
) {
  await harness.pool.query(`
    create table analytics_events (
      id ${idDefinition},
      session_id text not null,
      event_type text not null,
      metadata jsonb default '{}'::jsonb,
      created_at timestamp with time zone default now() not null
    )
  `);
}

describe('reviewed U4 migration chain', () => {
  it('provisions a fresh migration-backed database with the complete audited shape', async () => {
    const harness = { pool: storageTestPool, database: storageTestDatabase };
    await assertReviewedLedger(harness);
    await assertMigratedShape(harness);
  });

  it('reconciles the exact released predecessor without losing baseline rows', async () => {
    const harness = await provisionStorageTestDatabase('exact_predecessor', { applyMigrations: false });
    try {
      await harness.applyReviewedMigration(0);
      await createAnalyticsPredecessor(harness, 'serial primary key not null');
      const assessment = await harness.pool.query<{ id: number }>(`
        insert into assessment_sessions (session_id, language)
        values ('migration-predecessor-assessment', 'en')
        returning id
      `);
      await harness.pool.query(
        'insert into purpose_paths (assessment_id, title) values ($1, $2)',
        [assessment.rows[0].id, 'Migration predecessor path'],
      );
      await harness.pool.query(`
        insert into analytics_events (session_id, event_type)
        values ('migration-predecessor-assessment', 'predecessor-event')
      `);

      await harness.applyReviewedMigrationChain();
      await assertReviewedLedger(harness);
      await assertMigratedShape(harness);

      expect((await harness.pool.query(
        "select count(*)::int as count from assessment_sessions where session_id = 'migration-predecessor-assessment'",
      )).rows).toEqual([{ count: 1 }]);
      expect((await harness.pool.query(
        "select count(*)::int as count from purpose_paths where title = 'Migration predecessor path'",
      )).rows).toEqual([{ count: 1 }]);
      expect((await harness.pool.query(
        "select count(*)::int as count from analytics_events where event_type = 'predecessor-event'",
      )).rows).toEqual([{ count: 1 }]);
    } finally {
      await harness.dispose();
    }
  });

  it.each([
    ['missing id generation', 'integer primary key not null'],
    ['missing primary key', 'serial not null'],
  ])('rejects a predecessor with %s', async (_label, idDefinition) => {
    const harness = await provisionStorageTestDatabase(_label, { applyMigrations: false });
    try {
      await harness.applyReviewedMigration(0);
      await createAnalyticsPredecessor(harness, idDefinition);

      await expect(harness.applyReviewedMigrationChain()).rejects.toThrow(
        /analytics_events baseline/,
      );
      expect((await harness.pool.query(
        'select count(*)::int as count from drizzle.__drizzle_migrations',
      )).rows).toEqual([{ count: 1 }]);
      expect((await harness.pool.query(
        "select to_regclass('public.career_maps') as career_maps",
      )).rows).toEqual([{ career_maps: null }]);
    } finally {
      await harness.dispose();
    }
  });

  it.each([
    ['altered serial sequence', 'alter sequence analytics_events_id_seq increment by 2 cycle'],
    ['unexpected trigger', `
      create function analytics_events_passthrough() returns trigger language plpgsql as $$
      begin
        return new;
      end
      $$;
      create trigger analytics_events_unreviewed before insert on analytics_events
      for each row execute function analytics_events_passthrough()
    `],
  ])('rejects a predecessor with %s', async (_label, mutation) => {
    const harness = await provisionStorageTestDatabase(_label, { applyMigrations: false });
    try {
      await harness.applyReviewedMigration(0);
      await createAnalyticsPredecessor(harness, 'serial primary key not null');
      await harness.pool.query(mutation);

      await expect(harness.applyReviewedMigrationChain()).rejects.toThrow(
        /analytics_events baseline/,
      );
      expect((await harness.pool.query(
        'select count(*)::int as count from drizzle.__drizzle_migrations',
      )).rows).toEqual([{ count: 1 }]);
      expect((await harness.pool.query(
        "select to_regclass('public.career_maps') as career_maps",
      )).rows).toEqual([{ career_maps: null }]);
    } finally {
      await harness.dispose();
    }
  });
});

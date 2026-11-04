import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { betterAuth } from 'better-auth';
import { getAuthTables } from '@better-auth/core/db';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAuthOptions, buildAuthPoolOptions, INTERNAL_CLIENT_IP_HEADER } from './auth.js';
import { cleanupStorageTestDatabases, provisionStorageTestDatabase } from './storage.test-database.js';

const origin = 'http://localhost:5173';
const secret = 'fictional-auth-compatibility-secret-20261104';
let pool: Pool;
let auth: ReturnType<typeof betterAuth>;
let controlPool: Pool;

function signedLegacyCookie(name: string, value: string) {
  const signature = createHmac('sha256', secret).update(value).digest('base64');
  return `${name}=${encodeURIComponent(`${value}.${signature}`)}`;
}

function request(path: string, cookie?: string, ip = '192.0.2.40') {
  return new Request(`${origin}/api/auth${path}`, {
    headers: { [INTERNAL_CLIENT_IP_HEADER]: ip, ...(cookie ? { cookie } : {}) },
  });
}

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('External network is forbidden in auth storage fixtures'); }));
  const database = await provisionStorageTestDatabase('auth_compatibility', { applyMigrations: false });
  controlPool = database.pool;
  await database.pool.query(await readFile(new URL('../migrations/auth/0000_better_auth_1_6_29.sql', import.meta.url), 'utf8'));
  const options = buildAuthOptions({
    BETTER_AUTH_DATABASE_URL: database.connectionString,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: origin,
    GOOGLE_CLIENT_ID: 'fictional-google-client',
    GOOGLE_CLIENT_SECRET: 'fictional-google-secret',
    AUTH_SIGNUPS_ENABLED: true,
    NODE_ENV: 'test',
  }, undefined);
  pool = new Pool({ ...buildAuthPoolOptions({
    BETTER_AUTH_DATABASE_URL: database.connectionString,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: origin,
    GOOGLE_CLIENT_ID: 'fictional-google-client',
    GOOGLE_CLIENT_SECRET: 'fictional-google-secret',
    AUTH_SIGNUPS_ENABLED: true,
    NODE_ENV: 'test',
  }), max: 20, application_name: 'nami-auth-security-fixture' });
  auth = betterAuth({ ...options, database: pool, logger: { disabled: true },
    rateLimit: { ...options.rateLimit, customRules: { '/get-session': { window: 60, max: 5 } } },
  });
  await auth.$context;
});

afterAll(async () => {
  await pool?.end();
  await cleanupStorageTestDatabases();
  vi.unstubAllGlobals();
});

describe('native PostgreSQL auth compatibility and admission', () => {
  it('uses the reviewed core auth tables without adding columns', async () => {
    const context = await auth.$context;
    const tables = getAuthTables(context.options);
    for (const table of Object.values(tables)) {
      const result = await pool.query<{ column_name: string }>(
        'select column_name from information_schema.columns where table_schema = $1 and table_name = $2',
        ['auth', table.modelName],
      );
      const columns = result.rows.map(row => row.column_name);
      expect(columns).toContain('id');
      for (const [name, field] of Object.entries(table.fields)) expect(columns).toContain(field.fieldName ?? name);
    }
  });

  it('accepts a 1.6 signed session cookie and stored session, then observes revocation immediately', async () => {
    await pool.query(`insert into "user" (id,name,email,"emailVerified") values ('fixture-user','Fixture','fixture@example.test',true)`);
    await pool.query(`insert into "session" (id,token,"userId","expiresAt","updatedAt")
      values ('fixture-session','fixture-old-session-token','fixture-user',now()+interval '1 day',now())`);
    const cookie = signedLegacyCookie('better-auth.session_token', 'fixture-old-session-token');
    const response = await auth.handler(request('/get-session', cookie, '192.0.2.41'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { id: 'fixture-user', email: 'fixture@example.test' },
      session: { id: 'fixture-session' } });
    await pool.query(`delete from "session" where id='fixture-session'`);
    const revoked = await auth.handler(request('/get-session', cookie, '192.0.2.41'));
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toBeNull();
  });

  it('rejects an unnamespaced 1.6 OAuth state without creating a session', async () => {
    const state = 'fictional-legacy-oauth-state';
    const value = JSON.stringify({ callbackURL: `${origin}/explore`, codeVerifier: 'fictional-pkce-verifier',
      oauthState: state, expiresAt: Date.now() + 60_000 });
    await pool.query(`insert into "verification" (id,identifier,value,"expiresAt") values ($1,$2,$3,now()+interval '1 minute')`,
      ['fixture-verification', state, value]);
    const cookie = signedLegacyCookie('better-auth.state', state);
    const callback = `/callback/google?state=${state}&error=access_denied`;
    const first = await auth.handler(request(callback, cookie));
    expect(first.status).toBe(302);
    expect(new URL(first.headers.get('location')!).searchParams.get('error')).toBe('state_mismatch');
    expect((await pool.query('select id from "verification" where identifier=$1', [state])).rows).toEqual([{ id: 'fixture-verification' }]);
    expect((await pool.query('select id from "session"')).rows).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('consumes fresh database OAuth state once with its signed cookie and rejects replay', async () => {
    const start = await auth.handler(new Request(`${origin}/api/auth/sign-in/social`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin,
        [INTERNAL_CLIENT_IP_HEADER]: '192.0.2.42' },
      body: JSON.stringify({ provider: 'google', callbackURL: `${origin}/explore` }),
    }));
    expect(start.status).toBe(200);
    const state = new URL((await start.json()).url).searchParams.get('state')!;
    const cookie = start.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    expect((await pool.query('select id from "verification" where identifier=$1', [`auth-state:${state}`])).rows).toHaveLength(1);
    const callback = `/callback/google?state=${state}&error=access_denied`;
    const first = await auth.handler(request(callback, cookie));
    expect(first.status).toBe(302);
    expect(new URL(first.headers.get('location')!).searchParams.get('error')).toBe('access_denied');
    expect((await pool.query('select id from "verification" where identifier=$1', [`auth-state:${state}`])).rows).toEqual([]);
    const replay = await auth.handler(request(callback, cookie));
    expect(replay.status).toBe(302);
    expect(new URL(replay.headers.get('location')!).searchParams.get('error')).toBe('state_mismatch');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('admits at most five concurrent requests into one database-backed window', async () => {
    expect((await auth.handler(request('/get-session'))).status).toBe(200);
    const blocker = await pool.connect();
    await blocker.query('begin');
    await blocker.query('select id from "rateLimit" where key=$1 for update', ['192.0.2.40|/get-session']);
    const burst = Promise.all(Array.from({ length: 12 }, () => auth.handler(request('/get-session'))));
    let waiting = 0;
    try {
      const deadline = Date.now() + 5_000;
      while (waiting < 12 && Date.now() < deadline) {
        waiting = Number((await controlPool.query(`select count(*) from pg_stat_activity
          where datname=current_database() and application_name='nami-auth-security-fixture'
          and wait_event_type='Lock'`)).rows[0].count);
        if (waiting < 12) await new Promise(resolve => setTimeout(resolve, 10));
      }
    } finally {
      await blocker.query('commit');
      blocker.release();
    }
    const responses = await burst;
    expect(waiting).toBe(12);
    expect(responses.filter(response => response.status === 200)).toHaveLength(4);
    expect(responses.filter(response => response.status === 429)).toHaveLength(8);
    const rows = (await pool.query('select count from "rateLimit" where key=$1', ['192.0.2.40|/get-session'])).rows;
    expect(rows).toEqual([{ count: 5 }]);
  });

  it('starts a new counter window after expiry without weakening the limit', async () => {
    await pool.query('update "rateLimit" set "lastRequest"=$1 where key=$2', [Date.now() - 120_000, '192.0.2.40|/get-session']);
    expect((await auth.handler(request('/get-session'))).status).toBe(200);
    expect((await pool.query('select count from "rateLimit" where key=$1', ['192.0.2.40|/get-session'])).rows).toEqual([{ count: 1 }]);
  });
});

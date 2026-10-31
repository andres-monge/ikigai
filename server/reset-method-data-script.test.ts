import { describe, expect, it, vi } from 'vitest';
import { ConversationHistoryProviderError } from './ai/history.js';
import {
  METHOD_RESET_CONFIRMATION_TTL_MS,
  createMethodResetDependencies,
  databaseIdentity,
  issueMethodResetConfirmation,
  loadMethodResetRuntime,
  parseResetArgs,
  runMethodReset,
  type AuthTarget,
  type MethodDataSnapshot,
  type MethodErasureResult,
  type MethodResetDependencies,
  type MethodResetOptions,
  type MethodResetRuntime,
  type ResetPoolFactory,
} from '../scripts/reset-method-data.js';

const NOW = new Date('2030-01-01T00:00:00.000Z');
const EXPECTED_DATABASE = 'ep-calm.eu.neon.tech:5432/revelio_dev';
const runtime: MethodResetRuntime = {
  nodeEnv: 'development',
  databaseUrl: 'postgresql://app:secret@ep-calm-pooler.eu.neon.tech/revelio_dev?sslmode=require',
  authDatabaseUrl: 'postgresql://auth:secret@ep-calm.eu.neon.tech:5432/revelio_dev?sslmode=require',
  betterAuthSecret: 'b'.repeat(32),
  openAiApiKey: 'private-openai-key',
};
const target: AuthTarget = {
  id: 'founder-user-id',
  email: 'founder@example.com',
  accounts: [{ id: 'account-1', providerId: 'google', accountId: 'google-identity-1' }],
  sessionCount: 2,
};
const populated: MethodDataSnapshot = {
  careerMaps: 1,
  history: 8,
  drafts: 2,
  turns: 5,
  activeLeases: 0,
  expiredLeases: 0,
  conversationMappings: 1,
  erasureJobs: 0,
  erasureStatus: null,
  stateFingerprint: 'populated-state-v1',
};
const empty: MethodDataSnapshot = {
  careerMaps: 0,
  history: 0,
  drafts: 0,
  turns: 0,
  activeLeases: 0,
  expiredLeases: 0,
  conversationMappings: 0,
  erasureJobs: 0,
  erasureStatus: null,
  stateFingerprint: 'empty-state-v1',
};

function options(input: Partial<MethodResetOptions> = {}): MethodResetOptions {
  return {
    environment: 'development',
    email: target.email,
    expectedDatabase: EXPECTED_DATABASE,
    execute: false,
    retries: 2,
    ...input,
  };
}

function tokenFor(input: {
  authTarget?: AuthTarget;
  snapshot?: MethodDataSnapshot;
  issuedAt?: Date;
} = {}): string {
  return issueMethodResetConfirmation({
    environment: 'development',
    target: input.authTarget ?? target,
    database: EXPECTED_DATABASE,
    snapshot: input.snapshot ?? populated,
    issuedAt: input.issuedAt ?? NOW,
    secret: runtime.betterAuthSecret,
  });
}

function dependencies(input: {
  authTargets?: AuthTarget[][];
  methodSnapshots?: MethodDataSnapshot[];
  eraseResults?: Array<MethodErasureResult | Error>;
  now?: Date;
} = {}): MethodResetDependencies & {
  eraseMethodData: ReturnType<typeof vi.fn>;
  sleep: ReturnType<typeof vi.fn>;
  output: string[];
} {
  const authTargets = input.authTargets ?? [[target], [target]];
  const methodSnapshots = input.methodSnapshots ?? [populated, empty];
  const eraseResults = input.eraseResults ?? [{ status: 'complete' as const }];
  const output: string[] = [];
  let authRead = 0;
  let methodRead = 0;
  let eraseRead = 0;
  return {
    resolveAuthTargets: vi.fn(async () => authTargets[Math.min(authRead++, authTargets.length - 1)]),
    inspectMethodData: vi.fn(async () => methodSnapshots[Math.min(methodRead++, methodSnapshots.length - 1)]),
    eraseMethodData: vi.fn(async () => {
      const result = eraseResults[Math.min(eraseRead++, eraseResults.length - 1)];
      if (result instanceof Error) throw result;
      return result;
    }),
    now: () => input.now ?? NOW,
    sleep: vi.fn(async () => undefined),
    write: (line) => output.push(line),
    output,
  };
}

describe('Method reset argument and environment boundaries', () => {
  it('requires an exact expected database and defaults to dry run', () => {
    expect(parseResetArgs([
      '--environment=development',
      '--email=Founder@Example.com',
      `--expect-database=${EXPECTED_DATABASE}`,
    ])).toEqual(options());
    expect(() => parseResetArgs(['--environment=development', '--email=founder@example.com']))
      .toThrow('--expect-database is required');
  });

  it('defaults omitted PostgreSQL ports to 5432 and canonicalizes only Neon poolers', () => {
    expect(databaseIdentity(runtime.databaseUrl)).toMatchObject({
      port: 5432,
      transportEndpoint: 'ep-calm-pooler.eu.neon.tech:5432/revelio_dev',
      canonicalEndpoint: EXPECTED_DATABASE,
    });
    expect(databaseIdentity('postgresql://u:p@db-pooler.example.com/revelio')).toMatchObject({
      transportEndpoint: 'db-pooler.example.com:5432/revelio',
      canonicalEndpoint: 'db-pooler.example.com:5432/revelio',
    });
  });

  it('rejects query parameters that can override the validated database target or search path', () => {
    expect(() => databaseIdentity(
      'postgresql://u:p@db.example.com/revelio?host=evil.example.com&sslmode=require',
    )).toThrow('query parameter host is not allowed');
    expect(() => databaseIdentity(
      'postgresql://u:p@db.example.com/revelio?port=6543',
    )).toThrow('query parameter port is not allowed');
    expect(() => databaseIdentity(
      'postgresql://u:p@db.example.com/revelio?options=-c%20search_path%3Devil',
    )).toThrow('query parameter options is not allowed');
    expect(databaseIdentity(
      'postgresql://u:p@db.example.com/revelio?sslmode=require&channel_binding=require',
    ).canonicalEndpoint).toBe('db.example.com:5432/revelio');
  });

  it('rejects encoded or multi-segment database paths in URLs and expected targets', () => {
    expect(() => databaseIdentity('postgresql://u:p@db.example.com/revelio%2Fshadow'))
      .toThrow('one unencoded database path segment');
    expect(() => databaseIdentity('postgresql://u:p@db.example.com/revelio/shadow'))
      .toThrow('one unencoded database path segment');
    for (const expected of [
      'db.example.com:5432/revelio%2Fshadow',
      'db.example.com:5432/revelio/shadow',
    ]) {
      expect(() => parseResetArgs([
        '--environment=development',
        '--email=founder@example.com',
        `--expect-database=${expected}`,
      ])).toThrow('--expect-database must be <canonical-host>:<port>/<database>');
    }
  });

  it('requires explicit NODE_ENV and compares database ports', async () => {
    const missingEnv = dependencies();
    expect((await runMethodReset(options(), { ...runtime, nodeEnv: '' }, missingEnv)).exitCode).toBe(1);
    expect(missingEnv.eraseMethodData).not.toHaveBeenCalled();

    const portMismatch = dependencies();
    expect((await runMethodReset(options(), {
      ...runtime,
      authDatabaseUrl: 'postgresql://auth:secret@ep-calm.eu.neon.tech:6432/revelio_dev',
    }, portMismatch)).exitCode).toBe(1);
    expect(portMismatch.output.join('\n')).toContain('host, port, and database');
  });

  it('does not equate non-Neon pooler-looking hosts', async () => {
    const deps = dependencies();
    const result = await runMethodReset(
      options({ expectedDatabase: 'db-pooler.example.com:5432/revelio' }),
      {
        ...runtime,
        databaseUrl: 'postgresql://app:secret@db-pooler.example.com/revelio',
        authDatabaseUrl: 'postgresql://auth:secret@db.example.com/revelio',
      },
      deps,
    );
    expect(result.exitCode).toBe(1);
    expect(deps.eraseMethodData).not.toHaveBeenCalled();
  });

  it('lets an explicit env file override inherited values and never loads default .env in production', () => {
    const readExplicit = vi.fn(() => ({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://file:pw@file.example.com/db',
      BETTER_AUTH_DATABASE_URL: 'postgresql://file:pw@file.example.com/db',
      BETTER_AUTH_SECRET: 'f'.repeat(32),
      OPENAI_API_KEY: 'file-key',
    }));
    expect(loadMethodResetRuntime({
      NAMI_ENV_FILE: '/explicit/reset.env',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://inherited:pw@inherited.example.com/db',
    }, readExplicit)).toMatchObject({
      nodeEnv: 'development',
      databaseUrl: 'postgresql://file:pw@file.example.com/db',
      openAiApiKey: 'file-key',
    });
    expect(readExplicit).toHaveBeenCalledWith('/explicit/reset.env');

    expect(loadMethodResetRuntime({
      NAMI_ENV_FILE: '/explicit/incomplete.env',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://stale:pw@stale.example.com/db',
      BETTER_AUTH_DATABASE_URL: 'postgresql://stale:pw@stale.example.com/db',
      BETTER_AUTH_SECRET: 's'.repeat(32),
      OPENAI_API_KEY: 'stale-key',
    }, () => ({ NODE_ENV: 'development' }))).toMatchObject({
      nodeEnv: 'development',
      databaseUrl: '',
      authDatabaseUrl: '',
      betterAuthSecret: '',
      openAiApiKey: '',
    });
    expect(loadMethodResetRuntime({
      NAMI_ENV_FILE: '/explicit/no-node-env.env',
      NODE_ENV: 'development',
    }, () => ({})).nodeEnv).toBe('development');

    const productionReader = vi.fn(() => { throw new Error('must not read'); });
    expect(loadMethodResetRuntime({ NODE_ENV: 'production' }, productionReader).nodeEnv).toBe('production');
    expect(productionReader).not.toHaveBeenCalled();
  });
});

describe('Method reset confirmation and execution', () => {
  it('dry-runs with a shell-safe signed, secret-free confirmation token', async () => {
    const deps = dependencies({ authTargets: [[target]], methodSnapshots: [populated] });
    const result = await runMethodReset(options(), runtime, deps);
    const confirmationLine = deps.output.find((line) => line.startsWith('Confirmation token: '));
    const token = confirmationLine?.slice('Confirmation token: '.length);

    expect(result.exitCode).toBe(0);
    expect(deps.eraseMethodData).not.toHaveBeenCalled();
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(deps.output.join('\n')).not.toContain('secret');
    expect(deps.output.join('\n')).not.toContain(runtime.betterAuthSecret);
  });

  it('rejects expected-database mismatch before resolving a user', async () => {
    const deps = dependencies();
    const result = await runMethodReset(options({ expectedDatabase: 'wrong.example.com:5432/wrong' }), runtime, deps);
    expect(result.exitCode).toBe(1);
    expect(deps.resolveAuthTargets).not.toHaveBeenCalled();
  });

  it('rejects stale user, stale snapshot, and expired confirmations', async () => {
    const replacement = { ...target, id: 'replacement-user-id' };
    const staleUser = dependencies({ authTargets: [[replacement]], methodSnapshots: [populated] });
    expect((await runMethodReset(options({ execute: true, confirmation: tokenFor() }), runtime, staleUser)).exitCode)
      .toBe(1);
    expect(staleUser.output.join('\n')).toContain('stale auth user');

    const changed = { ...populated, history: 9 };
    const staleSnapshot = dependencies({ authTargets: [[target]], methodSnapshots: [changed] });
    expect((await runMethodReset(options({ execute: true, confirmation: tokenFor() }), runtime, staleSnapshot)).exitCode)
      .toBe(1);
    expect(staleSnapshot.output.join('\n')).toContain('stale Method snapshot');

    const sameCountsDifferentState = { ...populated, stateFingerprint: 'same-counts-different-state' };
    const sameCountSnapshot = dependencies({ authTargets: [[target]], methodSnapshots: [sameCountsDifferentState] });
    expect((await runMethodReset(
      options({ execute: true, confirmation: tokenFor() }), runtime, sameCountSnapshot,
    )).exitCode).toBe(1);
    expect(sameCountSnapshot.output.join('\n')).toContain('stale Method snapshot');

    const expired = dependencies({ now: new Date(NOW.getTime() + METHOD_RESET_CONFIRMATION_TTL_MS + 1) });
    expect((await runMethodReset(options({ execute: true, confirmation: tokenFor() }), runtime, expired)).exitCode)
      .toBe(1);
    expect(expired.output.join('\n')).toContain('expired');
  });

  it('handles the durable active-lease result without deletion', async () => {
    const leased = { ...populated, activeLeases: 1, stateFingerprint: 'leased-state-v1' };
    const deps = dependencies({
      methodSnapshots: [leased, leased],
      eraseResults: [{ status: 'active-lease' }],
    });
    const token = tokenFor({ snapshot: leased });
    const result = await runMethodReset(options({ execute: true, confirmation: token }), runtime, deps);
    expect(result.exitCode).toBe(1);
    expect(deps.eraseMethodData).toHaveBeenCalledOnce();
    expect(deps.output.join('\n')).toContain('unexpired Method lease');
  });

  it('fails closed when the locked storage snapshot differs from the confirmed state', async () => {
    const changed = { ...populated, stateFingerprint: 'changed-under-owner-lock' };
    const deps = dependencies({
      methodSnapshots: [populated, changed],
      eraseResults: [{ status: 'state-changed' }],
    });
    const result = await runMethodReset(
      options({ execute: true, confirmation: tokenFor() }), runtime, deps,
    );
    expect(result.exitCode).toBe(1);
    expect(deps.output.join('\n')).toContain('changed after inspection and before the owner lock');
  });

  it('verifies concrete account identities while treating session churn as a warning', async () => {
    const after = { ...target, sessionCount: 1 };
    const deps = dependencies({ authTargets: [[target], [after]] });
    const result = await runMethodReset(options({ execute: true, confirmation: tokenFor() }), runtime, deps);
    expect(result.exitCode).toBe(0);
    expect(deps.output.join('\n')).toContain('session count changed concurrently');

    const changedAccount = {
      ...target,
      accounts: [{ ...target.accounts[0]!, accountId: 'different-google-identity' }],
    };
    const accountDeps = dependencies({ authTargets: [[target], [changedAccount]] });
    expect((await runMethodReset(
      options({ execute: true, confirmation: tokenFor() }), runtime, accountDeps,
    )).exitCode).toBe(1);
    expect(accountDeps.output.join('\n')).toContain('concrete linked-account identities changed');
  });

  it('keeps retryable and non-retryable provider markers actionable without reusing the confirmation', async () => {
    const deps = dependencies({
      methodSnapshots: [populated, { ...empty, erasureJobs: 1, erasureStatus: 'failed-provider' }],
      eraseResults: [{ status: 'pending-provider', errorClass: 'ConversationHistoryProviderError', retryable: true }],
    });
    expect((await runMethodReset(
      options({ execute: true, confirmation: tokenFor() }), runtime, deps,
    )).exitCode).toBe(2);
    expect(deps.eraseMethodData).toHaveBeenCalledOnce();
    expect(deps.eraseMethodData).toHaveBeenCalledWith(target.id, populated.stateFingerprint, 2);
    expect((await runMethodReset(
      options({ execute: true, confirmation: tokenFor() }), runtime, deps,
    )).exitCode).toBe(1);
    expect(deps.eraseMethodData).toHaveBeenCalledOnce();
    expect(deps.output.join('\n')).toContain('stale Method snapshot');

    const marker = { ...empty, erasureJobs: 1, erasureStatus: 'failed-provider' };
    const rejected = dependencies({
      methodSnapshots: [populated, marker],
      eraseResults: [{
        status: 'pending-provider', errorClass: 'ConversationHistoryProviderError',
        httpStatus: 401, retryable: false,
      }],
    });
    expect((await runMethodReset(
      options({ execute: true, confirmation: tokenFor() }), runtime, rejected,
    )).exitCode).toBe(2);
    expect(rejected.eraseMethodData).toHaveBeenCalledOnce();
    expect(rejected.sleep).not.toHaveBeenCalled();
    expect(rejected.output.join('\n')).toContain('Verify OPENAI_API_KEY');
  });

  it('reconciles thrown attempts from post-state and detects residual Method rows', async () => {
    const marker = { ...empty, erasureJobs: 1, erasureStatus: 'failed-provider' };
    const thrown = dependencies({ methodSnapshots: [populated, marker], eraseResults: [new Error('driver failed')] });
    expect((await runMethodReset(
      options({ execute: true, confirmation: tokenFor() }), runtime, thrown,
    )).exitCode).toBe(2);
    expect(thrown.output.join('\n')).toContain('durable retry marker remains');

    const residual = dependencies({ methodSnapshots: [populated, { ...empty, drafts: 1 }] });
    expect((await runMethodReset(
      options({ execute: true, confirmation: tokenFor() }), runtime, residual,
    )).exitCode).toBe(1);
    expect(residual.output.join('\n')).toContain('Method rows remain');
  });
});

describe('Method reset dependency SQL boundary', () => {
  it('uses bounded pools, auth search_path, concrete accounts, and active/expired lease counts', async () => {
    const configs: unknown[] = [];
    const queries: string[][] = [[], []];
    let poolIndex = 0;
    const poolFactory: ResetPoolFactory = (config) => {
      const index = poolIndex++;
      configs.push(config);
      return {
        query: vi.fn(async (sql) => {
          queries[index]!.push(sql);
          if (index === 1 && sql.includes('current_database()')) {
            return { rows: [{ database_name: 'revelio_dev', schema_name: 'public' }] };
          }
          return index === 0
            ? { rows: [{
                id: target.id, email: target.email, accounts: target.accounts, session_count: 2,
              }] }
            : { rows: [] };
        }),
        end: vi.fn(async () => undefined),
      };
    };
    const inspected = { ...populated, activeLeases: 0, expiredLeases: 1 };
    const inspectMethodDataState = vi.fn(async () => inspected);
    const eraseMethodData = vi.fn(async () => ({ status: 'complete' as const }));
    const resources = await createMethodResetDependencies(runtime, {
      poolFactory,
      createScopedStorage: () => ({ inspectMethodDataState, eraseMethodData }),
    });
    expect(await resources.dependencies.resolveAuthTargets(target.email)).toEqual([target]);
    expect(await resources.dependencies.inspectMethodData(target.id)).toMatchObject({
      activeLeases: 0, expiredLeases: 1,
    });
    await resources.close();

    expect(configs).toHaveLength(2);
    for (const config of configs as Array<Record<string, unknown>>) {
      expect(config).toMatchObject({
        connectionTimeoutMillis: 5_000,
        query_timeout: 5_000,
        statement_timeout: 5_000,
        lock_timeout: 2_000,
        max: 1,
      });
    }
    expect(new URL((configs[0] as { connectionString: string }).connectionString)
      .searchParams.get('options')).toBe('-c search_path=auth');
    expect((configs[1] as { connectionString: string }).connectionString).toBe(runtime.databaseUrl);
    expect(new URL((configs[1] as { connectionString: string }).connectionString)
      .searchParams.get('options')).toBeNull();
    expect(queries[0]![0]).toContain('FROM "user" u');
    expect(queries[0]![0]).not.toContain('auth."user"');
    expect(queries[0]![0]).toContain('providerId');
    expect(queries[1]![0]).toContain('current_database()');
    expect(queries[1]![0]).toContain('current_schema()');
    expect(inspectMethodDataState).toHaveBeenCalledWith(target.id);
  });

  it('fails closed when the application pool resolves outside the validated database or public schema', async () => {
    for (const resolved of [
      { database_name: 'different_database', schema_name: 'public' },
      { database_name: 'revelio_dev', schema_name: 'private' },
    ]) {
      const pools = [
        { query: vi.fn(), end: vi.fn(async () => undefined) },
        { query: vi.fn(async () => ({ rows: [resolved] })), end: vi.fn(async () => undefined) },
      ];
      let index = 0;
      await expect(createMethodResetDependencies(runtime, {
        poolFactory: () => pools[index++]!,
        createScopedStorage: () => ({ inspectMethodDataState: vi.fn(), eraseMethodData: vi.fn() }),
      })).rejects.toThrow('unexpected database or schema');
      expect(pools[0].end).toHaveBeenCalledOnce();
      expect(pools[1].end).toHaveBeenCalledOnce();
      expect(pools[0].query).not.toHaveBeenCalled();
    }
  });

  it('retries only retryable provider cleanup inside one scoped storage erasure generation', async () => {
    let poolIndex = 0;
    const poolFactory: ResetPoolFactory = () => {
      const index = poolIndex++;
      return {
        query: vi.fn(async () => ({
          rows: index === 1 ? [{ database_name: 'revelio_dev', schema_name: 'public' }] : [],
        })),
        end: vi.fn(async () => undefined),
      };
    };
    const provider = { deleteConversationItemsAndConversation: vi.fn()
      .mockRejectedValueOnce(new ConversationHistoryProviderError('delete', 503))
      .mockResolvedValueOnce(undefined) };
    const eraseMethodData = vi.fn(async (_userId, wrappedProvider) => {
      await wrappedProvider?.deleteConversationItemsAndConversation('conversation-1');
      return { status: 'complete' as const };
    });
    const resources = await createMethodResetDependencies(runtime, {
      poolFactory,
      createScopedStorage: () => ({ inspectMethodDataState: vi.fn(), eraseMethodData }),
      createProvider: () => provider,
      sleep: vi.fn(async () => undefined),
    });
    expect(await resources.dependencies.eraseMethodData(target.id, populated.stateFingerprint, 2))
      .toEqual({ status: 'complete' });
    expect(provider.deleteConversationItemsAndConversation).toHaveBeenCalledTimes(2);
    expect(eraseMethodData).toHaveBeenCalledOnce();
    expect(eraseMethodData.mock.calls[0]?.[2]).toEqual({
      strictReset: true,
      expectedStateFingerprint: populated.stateFingerprint,
    });
    await resources.close();
  });

  it('rejects a pooled Neon auth URL before opening a pool', async () => {
    const poolFactory = vi.fn();
    await expect(createMethodResetDependencies({
      ...runtime,
      authDatabaseUrl: 'postgresql://auth:secret@ep-calm-pooler.eu.neon.tech/revelio_dev',
    }, { poolFactory })).rejects.toThrow('Authentication database is not configured');
    expect(poolFactory).not.toHaveBeenCalled();
  });

  it('rejects target-overriding URL parameters before opening either reset pool', async () => {
    for (const query of [
      'host=evil.example.com',
      'port=6543',
      'options=-c%20search_path%3Devil',
    ]) {
      const poolFactory = vi.fn();
      await expect(createMethodResetDependencies({
        ...runtime,
        authDatabaseUrl: `postgresql://auth:secret@ep-calm.eu.neon.tech/revelio_dev?${query}`,
      }, { poolFactory })).rejects.toThrow('is not allowed for reset targeting');
      expect(poolFactory).not.toHaveBeenCalled();
    }
  });
});

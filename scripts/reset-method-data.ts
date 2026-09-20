import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import { buildAuthDatabasePoolOptions } from '../server/auth-database.js';
import {
  PostgresStorage,
  type MethodDataStateSnapshot as StorageMethodDataStateSnapshot,
  type MethodErasureProvider,
  type MethodErasureResult as StorageMethodErasureResult,
} from '../server/storage.js';
import { ConversationHistoryProviderError, OpenAIConversationClient } from '../server/ai/history.js';
import type { Database } from '../server/db.js';
import * as schema from '../shared/schema.js';

export type ResetEnvironment = 'development' | 'production';

export interface MethodResetOptions {
  environment: ResetEnvironment;
  email: string;
  expectedDatabase: string;
  execute: boolean;
  confirmation?: string;
  retries: number;
}

export interface MethodResetRuntime {
  nodeEnv: string;
  databaseUrl: string;
  authDatabaseUrl: string;
  betterAuthSecret: string;
  openAiApiKey: string;
}

export interface AuthAccountIdentity {
  id: string;
  providerId: string;
  accountId: string;
}

export interface AuthTarget {
  id: string;
  email: string;
  accounts: AuthAccountIdentity[];
  sessionCount: number;
}

export interface MethodDataSnapshot extends StorageMethodDataStateSnapshot {}

export type MethodErasureResult = StorageMethodErasureResult;

export interface MethodResetDependencies {
  resolveAuthTargets(email: string): Promise<AuthTarget[]>;
  inspectMethodData(userId: string): Promise<MethodDataSnapshot>;
  eraseMethodData(userId: string, expectedStateFingerprint: string, retries: number): Promise<MethodErasureResult>;
  now(): Date;
  sleep(milliseconds: number): Promise<void>;
  write(line: string): void;
}

export interface MethodResetRunResult {
  exitCode: 0 | 1 | 2;
}

export interface DatabaseIdentity {
  transportEndpoint: string;
  canonicalEndpoint: string;
  canonicalHost: string;
  port: number;
  database: string;
}

type ResetPool = {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
};

export type ResetPoolFactory = (config: PoolConfig) => ResetPool;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_DATABASE_TLS_PARAMETERS = new Set(['sslmode', 'channel_binding']);
const RESET_SENSITIVE_ENV_KEYS = [
  'DATABASE_URL',
  'BETTER_AUTH_DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'OPENAI_API_KEY',
] as const;
export const METHOD_RESET_CONFIRMATION_TTL_MS = 5 * 60_000;
const DATABASE_TIMEOUTS = Object.freeze({
  connectionTimeoutMillis: 5_000,
  query_timeout: 5_000,
  statement_timeout: 5_000,
  lock_timeout: 2_000,
  max: 1,
  idleTimeoutMillis: 5_000,
  allowExitOnIdle: true,
});
const METHOD_COUNT_KEYS: Array<keyof Pick<
  MethodDataSnapshot,
  | 'careerMaps'
  | 'history'
  | 'drafts'
  | 'turns'
  | 'activeLeases'
  | 'expiredLeases'
  | 'conversationMappings'
  | 'erasureJobs'
>> = [
  'careerMaps',
  'history',
  'drafts',
  'turns',
  'activeLeases',
  'expiredLeases',
  'conversationMappings',
  'erasureJobs',
];

type ConfirmationPayload = {
  version: 1;
  issuedAt: number;
  environment: ResetEnvironment;
  userId: string;
  email: string;
  database: string;
  snapshotDigest: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function canonicalHost(hostname: string): string {
  const lower = hostname.toLowerCase();
  if (!lower.endsWith('.neon.tech')) return lower;
  const labels = lower.split('.');
  if (labels[0]?.endsWith('-pooler') && labels[0].length > '-pooler'.length) {
    labels[0] = labels[0].slice(0, -'-pooler'.length);
  }
  return labels.join('.');
}

export function databaseIdentity(value: string): DatabaseIdentity {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Database URL is invalid.');
  }
  if (url.protocol !== 'postgresql:' || !url.hostname || url.pathname.length <= 1) {
    throw new Error('Database URL must identify a PostgreSQL host and database.');
  }
  if (url.pathname.includes('%') || url.pathname.slice(1).includes('/')) {
    throw new Error('Database URL must contain one unencoded database path segment.');
  }
  if (url.hash) throw new Error('Database URL fragments are not allowed.');
  for (const key of url.searchParams.keys()) {
    if (!RESET_DATABASE_TLS_PARAMETERS.has(key.toLowerCase())) {
      throw new Error(`Database URL query parameter ${key} is not allowed for reset targeting.`);
    }
  }
  const database = url.pathname.slice(1);
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Database URL has an invalid port.');
  }
  const transportHost = url.hostname.toLowerCase();
  const normalizedHost = canonicalHost(transportHost);
  return {
    transportEndpoint: `${transportHost}:${port}/${database}`,
    canonicalEndpoint: `${normalizedHost}:${port}/${database}`,
    canonicalHost: normalizedHost,
    port,
    database,
  };
}

function expectedDatabaseIdentity(value: string): string {
  let url: URL;
  try {
    url = new URL(`postgresql://${value}`);
  } catch {
    throw new Error('--expect-database must be <canonical-host>:<port>/<database>.');
  }
  if (
    !url.hostname
    || !url.port
    || url.pathname.length <= 1
    || url.pathname.includes('%')
    || url.pathname.slice(1).includes('/')
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error('--expect-database must be <canonical-host>:<port>/<database>.');
  }
  const database = url.pathname.slice(1);
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('--expect-database has an invalid port.');
  }
  return `${url.hostname.toLowerCase()}:${port}/${database}`;
}

function databasePairMatches(left: DatabaseIdentity, right: DatabaseIdentity): boolean {
  return left.canonicalHost === right.canonicalHost
    && left.port === right.port
    && left.database === right.database;
}

function canonicalSnapshot(snapshot: MethodDataSnapshot): Record<string, number | string | null> {
  return {
    careerMaps: snapshot.careerMaps,
    history: snapshot.history,
    drafts: snapshot.drafts,
    turns: snapshot.turns,
    activeLeases: snapshot.activeLeases,
    expiredLeases: snapshot.expiredLeases,
    conversationMappings: snapshot.conversationMappings,
    erasureJobs: snapshot.erasureJobs,
    erasureStatus: snapshot.erasureStatus,
    stateFingerprint: snapshot.stateFingerprint,
  };
}

export function methodSnapshotDigest(snapshot: MethodDataSnapshot): string {
  return createHash('sha256').update(JSON.stringify(canonicalSnapshot(snapshot))).digest('base64url');
}

function tokenSignature(encodedPayload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(encodedPayload).digest();
}

export function issueMethodResetConfirmation(input: {
  environment: ResetEnvironment;
  target: AuthTarget;
  database: string;
  snapshot: MethodDataSnapshot;
  issuedAt: Date;
  secret: string;
}): string {
  if (input.secret.length < 32) throw new Error('BETTER_AUTH_SECRET must be at least 32 characters.');
  const payload: ConfirmationPayload = {
    version: 1,
    issuedAt: input.issuedAt.getTime(),
    environment: input.environment,
    userId: input.target.id,
    email: normalizeEmail(input.target.email),
    database: input.database,
    snapshotDigest: methodSnapshotDigest(input.snapshot),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${tokenSignature(encoded, input.secret).toString('base64url')}`;
}

function validateMethodResetConfirmation(input: {
  token: string | undefined;
  environment: ResetEnvironment;
  target: AuthTarget;
  database: string;
  snapshot: MethodDataSnapshot;
  now: Date;
  secret: string;
}): string | undefined {
  if (!input.token) return 'Confirmation token is required.';
  const [encoded, encodedSignature, extra] = input.token.split('.');
  if (!encoded || !encodedSignature || extra) return 'Confirmation token is malformed.';
  const providedSignature = Buffer.from(encodedSignature, 'base64url');
  const expectedSignature = tokenSignature(encoded, input.secret);
  if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) {
    return 'Confirmation token signature is invalid.';
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return 'Confirmation token payload is invalid.';
  }
  if (!decoded || typeof decoded !== 'object') return 'Confirmation token payload is invalid.';
  const payload = decoded as ConfirmationPayload;
  if (
    payload.version !== 1
    || !Number.isSafeInteger(payload.issuedAt)
    || typeof payload.environment !== 'string'
    || typeof payload.userId !== 'string'
    || typeof payload.email !== 'string'
    || typeof payload.database !== 'string'
    || typeof payload.snapshotDigest !== 'string'
  ) return 'Confirmation token payload is invalid.';
  const age = input.now.getTime() - payload.issuedAt;
  if (age < 0 || age > METHOD_RESET_CONFIRMATION_TTL_MS) {
    return 'Confirmation token is expired; take a fresh dry run.';
  }
  if (payload.environment !== input.environment || payload.database !== input.database) {
    return 'Confirmation token targets a different environment or database.';
  }
  if (payload.userId !== input.target.id || payload.email !== normalizeEmail(input.target.email)) {
    return 'Confirmation token targets a stale auth user.';
  }
  if (payload.snapshotDigest !== methodSnapshotDigest(input.snapshot)) {
    return 'Confirmation token targets a stale Method snapshot; take a fresh dry run.';
  }
  return undefined;
}

function readArgumentValue(argument: string, name: string): string | undefined {
  const prefix = `--${name}=`;
  return argument.startsWith(prefix) ? argument.slice(prefix.length) : undefined;
}

export function parseResetArgs(args: string[]): MethodResetOptions {
  let environment: ResetEnvironment | undefined;
  let email: string | undefined;
  let expectedDatabase: string | undefined;
  let execute = false;
  let confirmation: string | undefined;
  let retries = 2;
  for (const argument of args) {
    const environmentValue = readArgumentValue(argument, 'environment');
    const emailValue = readArgumentValue(argument, 'email');
    const expectedDatabaseValue = readArgumentValue(argument, 'expect-database');
    const confirmationValue = readArgumentValue(argument, 'confirm');
    const retriesValue = readArgumentValue(argument, 'retries');
    if (environmentValue !== undefined) {
      if (environment !== undefined) throw new Error('--environment may be supplied only once.');
      if (environmentValue !== 'development' && environmentValue !== 'production') {
        throw new Error('--environment must be development or production.');
      }
      environment = environmentValue;
    } else if (emailValue !== undefined) {
      if (email !== undefined) throw new Error('--email may be supplied only once.');
      email = normalizeEmail(emailValue);
    } else if (expectedDatabaseValue !== undefined) {
      if (expectedDatabase !== undefined) throw new Error('--expect-database may be supplied only once.');
      expectedDatabase = expectedDatabaseIdentity(expectedDatabaseValue);
    } else if (argument === '--execute') {
      if (execute) throw new Error('--execute may be supplied only once.');
      execute = true;
    } else if (confirmationValue !== undefined) {
      if (confirmation !== undefined) throw new Error('--confirm may be supplied only once.');
      confirmation = confirmationValue;
    } else if (retriesValue !== undefined) {
      retries = Number(retriesValue);
      if (!Number.isSafeInteger(retries) || retries < 0 || retries > 5) {
        throw new Error('--retries must be an integer from 0 through 5.');
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!environment) throw new Error('--environment is required.');
  if (!email || !EMAIL_PATTERN.test(email)) throw new Error('A valid --email is required.');
  if (!expectedDatabase) throw new Error('--expect-database is required.');
  return { environment, email, expectedDatabase, execute, confirmation, retries };
}

export type EnvFileReader = (path: string) => Record<string, string>;

function defaultEnvFileReader(path: string): Record<string, string> {
  return parseDotenv(readFileSync(path));
}

export function loadMethodResetRuntime(
  source: NodeJS.ProcessEnv,
  readEnvFile: EnvFileReader = defaultEnvFileReader,
): MethodResetRuntime {
  const merged: Record<string, string | undefined> = { ...source };
  const explicitEnvFile = source.REVELIO_ENV_FILE;
  if (explicitEnvFile) {
    const explicit = readEnvFile(explicitEnvFile);
    if (explicit.NODE_ENV !== undefined) merged.NODE_ENV = explicit.NODE_ENV;
    for (const key of RESET_SENSITIVE_ENV_KEYS) merged[key] = explicit[key];
  } else if (source.NODE_ENV === 'development') {
    try {
      const defaults = readEnvFile('.env');
      for (const [key, value] of Object.entries(defaults)) {
        if (merged[key] === undefined) merged[key] = value;
      }
    } catch (error) {
      const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
      if (code !== 'ENOENT') throw error;
    }
  }
  return {
    nodeEnv: merged.NODE_ENV ?? '',
    databaseUrl: merged.DATABASE_URL ?? '',
    authDatabaseUrl: merged.BETTER_AUTH_DATABASE_URL ?? '',
    betterAuthSecret: merged.BETTER_AUTH_SECRET ?? '',
    openAiApiKey: merged.OPENAI_API_KEY ?? '',
  };
}

function writeTargetSummary(input: {
  mode: 'DRY RUN' | 'EXECUTE';
  options: MethodResetOptions;
  target: AuthTarget;
  appDatabase: DatabaseIdentity;
  authDatabase: DatabaseIdentity;
  method: MethodDataSnapshot;
  confirmationToken?: string;
  write(line: string): void;
}): void {
  const { write } = input;
  write(`Mode: ${input.mode}`);
  write(`Environment: ${input.options.environment}`);
  write(`Auth user: ${input.target.email} (${input.target.id})`);
  write(`Canonical database: ${input.appDatabase.canonicalEndpoint}`);
  write(`Application transport: ${input.appDatabase.transportEndpoint}`);
  write(`Auth transport: ${input.authDatabase.transportEndpoint}`);
  write(`Method rows: ${METHOD_COUNT_KEYS.map((key) => `${key}=${input.method[key]}`).join(', ')}`);
  write(`Provider cleanup marker: ${input.method.erasureStatus ?? 'none'}`);
  write(`Auth records preserved by design: user=1, accounts=${input.target.accounts.length}, sessions=${input.target.sessionCount}`);
  if (input.confirmationToken) write(`Confirmation token: ${input.confirmationToken}`);
}

function stableAccounts(accounts: AuthAccountIdentity[]): string[] {
  return accounts.map((account) => JSON.stringify([account.id, account.providerId, account.accountId])).sort();
}

function authIdentityMatches(before: AuthTarget, after: AuthTarget): boolean {
  return before.id === after.id
    && normalizeEmail(before.email) === normalizeEmail(after.email)
    && JSON.stringify(stableAccounts(before.accounts)) === JSON.stringify(stableAccounts(after.accounts));
}

function isMethodEmpty(snapshot: MethodDataSnapshot): boolean {
  return METHOD_COUNT_KEYS.every((key) => snapshot[key] === 0);
}

async function readExactAuthTarget(email: string, dependencies: MethodResetDependencies): Promise<AuthTarget | undefined> {
  const matches = await dependencies.resolveAuthTargets(email);
  if (matches.length !== 1) {
    dependencies.write(`Safety stop: expected exactly one auth user for ${email}; found ${matches.length}.`);
    return undefined;
  }
  const target = matches[0];
  if (normalizeEmail(target.email) !== email) {
    dependencies.write('Safety stop: resolved auth email does not match the requested target.');
    return undefined;
  }
  return {
    ...target,
    email: normalizeEmail(target.email),
    accounts: [...target.accounts].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function providerGuidance(result: Extract<MethodErasureResult, { status: 'pending-provider' }>): string {
  if (result.httpStatus === 401 || result.httpStatus === 403) {
    return 'OpenAI rejected cleanup credentials or project access. Verify OPENAI_API_KEY, then take a fresh dry run.';
  }
  if (result.httpStatus !== undefined && !result.retryable) {
    return `OpenAI rejected cleanup with non-retryable HTTP ${result.httpStatus}. Verify provider configuration, then take a fresh dry run.`;
  }
  return 'Provider cleanup is still pending. After recovery, take a fresh dry run before retrying.';
}

export async function runMethodReset(
  options: MethodResetOptions,
  runtime: MethodResetRuntime,
  dependencies: MethodResetDependencies,
): Promise<MethodResetRunResult> {
  const expectedNodeEnv = options.environment === 'production' ? 'production' : 'development';
  if (!runtime.nodeEnv || runtime.nodeEnv !== expectedNodeEnv) {
    dependencies.write(`Safety stop: requested ${options.environment}, but explicit NODE_ENV is ${runtime.nodeEnv || 'missing'}.`);
    return { exitCode: 1 };
  }
  if (runtime.betterAuthSecret.length < 32) {
    dependencies.write('Safety stop: BETTER_AUTH_SECRET is required to sign reset confirmations.');
    return { exitCode: 1 };
  }
  let appDatabase: DatabaseIdentity;
  let authDatabase: DatabaseIdentity;
  try {
    appDatabase = databaseIdentity(runtime.databaseUrl);
    authDatabase = databaseIdentity(runtime.authDatabaseUrl);
  } catch (error) {
    dependencies.write(`Safety stop: ${error instanceof Error ? error.message : 'database identity is invalid.'}`);
    return { exitCode: 1 };
  }
  if (!databasePairMatches(appDatabase, authDatabase)) {
    dependencies.write('Safety stop: application and auth URLs do not identify the same host, port, and database.');
    dependencies.write(`Application database: ${appDatabase.canonicalEndpoint}`);
    dependencies.write(`Auth database: ${authDatabase.canonicalEndpoint}`);
    return { exitCode: 1 };
  }
  if (options.expectedDatabase !== appDatabase.canonicalEndpoint) {
    dependencies.write(`Safety stop: --expect-database does not match ${appDatabase.canonicalEndpoint}.`);
    return { exitCode: 1 };
  }
  const email = normalizeEmail(options.email);
  const target = await readExactAuthTarget(email, dependencies);
  if (!target) return { exitCode: 1 };
  const before = await dependencies.inspectMethodData(target.id);
  if (!options.execute) {
    const confirmationToken = issueMethodResetConfirmation({
      environment: options.environment,
      target,
      database: appDatabase.canonicalEndpoint,
      snapshot: before,
      issuedAt: dependencies.now(),
      secret: runtime.betterAuthSecret,
    });
    writeTargetSummary({
      mode: 'DRY RUN', options, target, appDatabase, authDatabase, method: before,
      confirmationToken, write: dependencies.write,
    });
    dependencies.write('Dry run complete. No data was changed. Token expires in 5 minutes.');
    return { exitCode: 0 };
  }
  writeTargetSummary({
    mode: 'EXECUTE', options, target, appDatabase, authDatabase, method: before,
    write: dependencies.write,
  });
  const confirmationError = validateMethodResetConfirmation({
    token: options.confirmation,
    environment: options.environment,
    target,
    database: appDatabase.canonicalEndpoint,
    snapshot: before,
    now: dependencies.now(),
    secret: runtime.betterAuthSecret,
  });
  if (confirmationError) {
    dependencies.write(`Safety stop: ${confirmationError}`);
    return { exitCode: 1 };
  }
  dependencies.write('EXECUTION TARGET (validated immediately before the strict reset)');
  dependencies.write(`Environment: ${options.environment}`);
  dependencies.write(`Auth user: ${target.email} (${target.id})`);
  dependencies.write(`Database: ${appDatabase.canonicalEndpoint}`);

  let erasure: MethodErasureResult | undefined;
  let thrownError: unknown;
  try {
    erasure = await dependencies.eraseMethodData(target.id, before.stateFingerprint, options.retries);
  } catch (error) {
    thrownError = error;
    dependencies.write(`Reset attempt threw ${error instanceof Error ? error.constructor.name : 'UnknownError'}; reconciling durable state.`);
  }

  const after = await dependencies.inspectMethodData(target.id);
  const authAfter = await readExactAuthTarget(email, dependencies);
  if (!authAfter || !authIdentityMatches(target, authAfter)) {
    dependencies.write('Auth verification failed: user identity or concrete linked-account identities changed.');
    return { exitCode: 1 };
  }
  if (target.sessionCount !== authAfter.sessionCount) {
    dependencies.write(`Warning: auth session count changed concurrently (${target.sessionCount} -> ${authAfter.sessionCount}); this reset does not delete sessions.`);
  } else {
    dependencies.write('Auth verification: user, linked accounts, and session count are unchanged.');
  }
  if (erasure?.status === 'active-lease') {
    dependencies.write('Safety stop: an unexpired Method lease exists. Finish or cancel the turn and take a fresh dry run.');
    return { exitCode: 1 };
  }
  if (erasure?.status === 'state-changed') {
    dependencies.write('Safety stop: Method state changed after inspection and before the owner lock. Take a fresh dry run.');
    return { exitCode: 1 };
  }
  if (erasure?.status === 'pending-provider') {
    dependencies.write(`Method data remains blocked by the retry marker (status=${after.erasureStatus ?? 'unknown'}).`);
    dependencies.write(providerGuidance(erasure));
    return { exitCode: 2 };
  }
  if (thrownError) {
    if (after.erasureJobs > 0) {
      dependencies.write('The durable retry marker remains; take a fresh dry run before reconciling again.');
      return { exitCode: 2 };
    }
    dependencies.write('Reset failed before a durable retry marker was confirmed. No automatic retry was attempted.');
    return { exitCode: 1 };
  }
  if (erasure?.status !== 'complete') {
    dependencies.write('Reset did not return a terminal result.');
    return { exitCode: 1 };
  }
  if (!isMethodEmpty(after)) {
    dependencies.write(`Verification failed: Method rows remain (${METHOD_COUNT_KEYS.map((key) => `${key}=${after[key]}`).join(', ')}).`);
    return { exitCode: 1 };
  }
  dependencies.write('Method reset: complete. Auth user and linked provider accounts were preserved.');
  return { exitCode: 0 };
}

function numericCount(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} count returned by database.`);
  return parsed;
}

function accountIdentities(value: unknown): AuthAccountIdentity[] {
  if (!Array.isArray(value)) throw new Error('Invalid account identities returned by auth database.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid account identity returned by auth database.');
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.providerId !== 'string' || typeof record.accountId !== 'string') {
      throw new Error('Invalid account identity returned by auth database.');
    }
    return { id: record.id, providerId: record.providerId, accountId: record.accountId };
  });
}

function defaultPoolFactory(config: PoolConfig): ResetPool {
  return new Pool(config) as ResetPool;
}

async function deleteConversationWithRetries(
  provider: MethodErasureProvider,
  conversationId: string,
  retries: number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await provider.deleteConversationItemsAndConversation(conversationId);
      return;
    } catch (error) {
      if (!(error instanceof ConversationHistoryProviderError) || !error.retryable || attempt >= retries) throw error;
      await sleep(500 * (2 ** attempt));
    }
  }
}

export async function createMethodResetDependencies(
  runtime: MethodResetRuntime,
  options: {
    poolFactory?: ResetPoolFactory;
    createScopedStorage?: (pool: ResetPool) => Pick<PostgresStorage, 'inspectMethodDataState' | 'eraseMethodData'>;
    createProvider?: () => MethodErasureProvider;
    now?: () => Date;
    write?: (line: string) => void;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<{ dependencies: MethodResetDependencies; close(): Promise<void> }> {
  const poolFactory = options.poolFactory ?? defaultPoolFactory;
  const appIdentity = databaseIdentity(runtime.databaseUrl);
  databaseIdentity(runtime.authDatabaseUrl);
  const authPool = poolFactory({
    ...buildAuthDatabasePoolOptions(runtime.authDatabaseUrl),
    ...DATABASE_TIMEOUTS,
  });
  const appPool = poolFactory({
    connectionString: runtime.databaseUrl,
    ...DATABASE_TIMEOUTS,
  });
  try {
    const identityResult = await appPool.query(`
      SELECT current_database() AS database_name, current_schema() AS schema_name
    `);
    const identity = identityResult.rows[0];
    if (identity?.database_name !== appIdentity.database || identity.schema_name !== 'public') {
      throw new Error('Application reset pool resolved to an unexpected database or schema.');
    }
  } catch (error) {
    await Promise.allSettled([authPool.end(), appPool.end()]);
    throw error;
  }
  const scopedStorage = options.createScopedStorage?.(appPool) ?? new PostgresStorage({
    database: drizzle(appPool as Pool, { schema }) as unknown as Database,
  });
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
  return {
    dependencies: {
      async resolveAuthTargets(email) {
        const result = await authPool.query(`
          SELECT
            u.id,
            u.email,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', a.id,
                'providerId', a."providerId",
                'accountId', a."accountId"
              ) ORDER BY a.id)
              FROM "account" a
              WHERE a."userId" = u.id
            ), '[]'::jsonb) AS accounts,
            (SELECT count(*)::int FROM "session" s WHERE s."userId" = u.id) AS session_count
          FROM "user" u
          WHERE lower(u.email) = lower($1)
          ORDER BY u.id
          LIMIT 2
        `, [email]);
        return result.rows.map((row) => {
          if (typeof row.id !== 'string' || typeof row.email !== 'string') {
            throw new Error('Invalid user identity returned by auth database.');
          }
          return {
            id: row.id,
            email: row.email,
            accounts: accountIdentities(row.accounts),
            sessionCount: numericCount(row.session_count, 'session'),
          };
        });
      },
      async inspectMethodData(userId) {
        return scopedStorage.inspectMethodDataState(userId);
      },
      async eraseMethodData(userId, expectedStateFingerprint, retries) {
        if (!runtime.openAiApiKey) throw new Error('OPENAI_API_KEY is required for --execute and provider cleanup.');
        const provider = options.createProvider?.() ?? new OpenAIConversationClient(runtime.openAiApiKey);
        const retryingProvider: MethodErasureProvider = {
          deleteConversationItemsAndConversation: (conversationId) => deleteConversationWithRetries(
            provider, conversationId, retries, sleep,
          ),
        };
        return scopedStorage.eraseMethodData(userId, retryingProvider, {
          strictReset: true,
          expectedStateFingerprint,
        });
      },
      now: options.now ?? (() => new Date()),
      sleep,
      write: options.write ?? ((line) => console.log(line)),
    },
    async close() {
      await Promise.allSettled([authPool.end(), appPool.end()]);
    },
  };
}

function usage(): string {
  return [
    'Usage:',
    '  npm run method:reset -- --environment=development --email=you@example.com --expect-database=host:5432/database',
    '  npm run method:reset -- --environment=development --email=you@example.com --expect-database=host:5432/database --execute --confirm=<dry-run-token>',
    '',
    'Dry run is the default. --execute mutates only canonical Method and mapped OpenAI Conversation data.',
  ].join('\n');
}

async function main(): Promise<number> {
  let options: MethodResetOptions;
  try {
    options = parseResetArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(usage());
    return 1;
  }
  let runtime: MethodResetRuntime;
  try {
    runtime = loadMethodResetRuntime(process.env);
  } catch (error) {
    console.error(`Unable to load reset environment: ${error instanceof Error ? error.message : 'unknown error'}`);
    return 1;
  }
  let resources: Awaited<ReturnType<typeof createMethodResetDependencies>> | undefined;
  try {
    resources = await createMethodResetDependencies(runtime);
    return (await runMethodReset(options, runtime, resources.dependencies)).exitCode;
  } catch (error) {
    console.error(`Method reset failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    console.error('No auth-record deletion is attempted by this command. Inspect the dry run before retrying.');
    return 1;
  } finally {
    await resources?.close();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = await main();
}

import { Pool, type PoolClient } from 'pg';
import type { careerMaps, careerMapHistory, agentTurns } from '../../shared/schema.js';
import { buildAuthDatabasePoolOptions } from '../auth-database.js';
import { assertDisposableStorageTestUrl } from '../storage.test-database-safety.js';

export type ReportingSnapshot = {
  observedAt: string;
  map: typeof careerMaps.$inferSelect | null;
  history: (typeof careerMapHistory.$inferSelect)[];
  turns: (typeof agentTurns.$inferSelect)[];
  conversationId: string | null;
};
export interface ReadQueryClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>;
}
export type ReportingTarget = 'development' | 'production' | 'test';
export function reportingConnections(target: string | undefined, env: NodeJS.ProcessEnv): { target: ReportingTarget; appUrl: string; authUrl: string } {
  if (!['development', 'production', 'test'].includes(target ?? '')) throw new Error('Select an explicit reporting target: development, production or test.');
  const appUrl = target === 'test' ? env.U4_STORAGE_TEST_DATABASE_URL : env.DATABASE_URL;
  const authUrl = target === 'test' ? env.U4_STORAGE_TEST_DATABASE_URL : env.BETTER_AUTH_DATABASE_URL;
  if (!appUrl || !authUrl) throw new Error('Reporting database configuration is unavailable for the selected target.');
  if (target === 'test') {
    if (env.NODE_ENV !== 'test' || env.U4_STORAGE_TEST_DATABASE !== '1') throw new Error('Test reporting requires the disposable database guard.');
    assertDisposableStorageTestUrl(appUrl);
  }
  return {target: target as ReportingTarget, appUrl, authUrl};
}

export async function readParticipantSnapshot(client: ReadQueryClient, userId: string): Promise<ReportingSnapshot> {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const map = await client.query('SELECT user_id AS "userId", schema_version AS "schemaVersion", revision, document, repair_required AS "repairRequired", created_at AS "createdAt", updated_at AS "updatedAt" FROM public.career_maps WHERE user_id = $1', [userId]);
    const history = await client.query('SELECT id, user_id AS "userId", operation_source_id AS "operationSourceId", operation_type AS "operationType", payload_fingerprint AS "payloadFingerprint", base_revision AS "baseRevision", result_revision AS "resultRevision", result, confirmation_provenance AS "confirmationProvenance", module_version AS "moduleVersion", committed_at AS "committedAt" FROM public.career_map_history WHERE user_id = $1 ORDER BY result_revision', [userId]);
    const turns = await client.query('SELECT turn_id AS "turnId", user_id AS "userId", client_message_id AS "clientMessageId", request_fingerprint AS "requestFingerprint", origin, lease_id AS "leaseId", status, terminal_result AS "terminalResult", created_at AS "createdAt", updated_at AS "updatedAt", terminal_at AS "terminalAt" FROM public.agent_turns WHERE user_id = $1 ORDER BY created_at, turn_id', [userId]);
    const mapping = await client.query('SELECT conversation_id AS "conversationId" FROM public.agent_conversation_mappings WHERE user_id = $1', [userId]);
    const observedAt = new Date().toISOString();
    await client.query('COMMIT');
    return {observedAt, map: map.rows[0] ?? null, history: history.rows, turns: turns.rows, conversationId: mapping.rows[0]?.conversationId ?? null};
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function resolveExactIdentity(client: ReadQueryClient, email: string): Promise<{userId: string}> {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const result = await client.query('SELECT id FROM auth."user" WHERE email = $1', [email]);
    if (result.rows.length !== 1) throw new Error('Identity lookup requires exactly one exact email match.');
    await client.query('COMMIT');
    return {userId: result.rows[0].id};
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export function createReportingSource(configuration: ReturnType<typeof reportingConnections>) {
  const app = new Pool({connectionString: configuration.appUrl, connectionTimeoutMillis: 5_000});
  const auth = new Pool(buildAuthDatabasePoolOptions(configuration.authUrl));
  async function use<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {return await action(client);} finally {client.release();}
  }
  return {
    loadParticipantSnapshot: (userId: string) => use(app, client => readParticipantSnapshot(client, userId)),
    resolveIdentity: (email: string) => use(auth, client => resolveExactIdentity(client, email)),
    identityExists: (userId: string) => use(auth, async client => {
      await client.query('BEGIN READ ONLY');
      try {
        const result = await client.query('SELECT id FROM auth."user" WHERE id = $1', [userId]);
        await client.query('COMMIT');
        return result.rows.length === 1;
      } catch(error) {await client.query('ROLLBACK');throw error;}
    }),
    close: async () => { await Promise.all([app.end(), auth.end()]); },
  };
}

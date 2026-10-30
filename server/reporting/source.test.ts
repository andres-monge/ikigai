import { describe, expect, it } from 'vitest';
import { readParticipantSnapshot, resolveExactIdentity, reportingConnections } from './source';
const client = (rows:unknown[][]=[])=>{ const calls:{sql:string;values?:unknown[]}[]=[];return {calls,query:async(sql:string,values?:unknown[])=>{calls.push({sql,values});return {rows:sql.startsWith('SELECT')?(rows.shift()??[]):[]};}};};
describe('report source',()=>{
 it('selects one identity in a read-only repeatable snapshot with bound parameters',async()=>{const db=client([[],[],[],[]]);const result=await readParticipantSnapshot(db,'person');expect(db.calls[0].sql).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');expect(db.calls.at(-1)?.sql).toBe('COMMIT');expect(db.calls.filter(c=>c.sql.startsWith('SELECT')).every(c=>c.values?.[0]==='person')).toBe(true);expect(result.map).toBeNull();expect(result.turns).toEqual([]);});
 it('rejects missing and ambiguous exact email bindings',async()=>{await expect(resolveExactIdentity(client(), 'nobody@example.test')).rejects.toThrow(/exactly one/i);await expect(resolveExactIdentity(client([[{id:'one'},{id:'two'}]]), 'person@example.test')).rejects.toThrow(/exactly one/i);});
 it('does not choose a target implicitly',()=>{expect(()=>reportingConnections(undefined,{})).toThrow();expect(()=>reportingConnections('test',{U4_STORAGE_TEST_DATABASE_URL:'postgresql://localhost/live'})).toThrow();});
});

it('uses the explicit selected environment credentials without fallback',()=>{
 expect(reportingConnections('production',{DATABASE_URL:'postgresql://prod/app',BETTER_AUTH_DATABASE_URL:'postgresql://prod/auth'})).toEqual({target:'production',appUrl:'postgresql://prod/app',authUrl:'postgresql://prod/auth'});
 expect(()=>reportingConnections('production',{DATABASE_URL:'postgresql://prod/app'})).toThrow();
});

it.skipIf(process.env.U4_STORAGE_TEST_DATABASE !== '1')('reads the disposable migrated database without changing rows and PostgreSQL refuses writes',async()=>{
 const {storageTestPool,cleanupStorageTestDatabases}=await import('../storage.test-database.js');
 const db=await storageTestPool.connect();
 try {
  const before=await db.query('SELECT (SELECT count(*) FROM career_maps) AS maps, (SELECT count(*) FROM career_map_history) AS history, (SELECT count(*) FROM agent_turns) AS turns');
  const snapshot=await readParticipantSnapshot(db,'fictional-unstarted');
  expect(snapshot.map).toBeNull();expect(snapshot.history).toEqual([]);expect(snapshot.turns).toEqual([]);
  const after=await db.query('SELECT (SELECT count(*) FROM career_maps) AS maps, (SELECT count(*) FROM career_map_history) AS history, (SELECT count(*) FROM agent_turns) AS turns');
  expect(after.rows).toEqual(before.rows);
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await expect(db.query('DELETE FROM career_maps WHERE user_id = $1',['fictional-unstarted'])).rejects.toMatchObject({code:'25006'});
  await db.query('ROLLBACK');
 } finally {db.release();await cleanupStorageTestDatabases();}
});

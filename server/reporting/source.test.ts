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
  const { createCareerMap, applyCareerMapOperation }=await import('../../shared/career-map/index.js');
  const { deriveParticipantProgress }=await import('./progress.js');
  const recordedAt='2030-01-01T00:01:00.000Z';
  const confirmedAt='2030-01-01T00:02:00.000Z';
  const owners=['fictional-alice','fictional-bob'];
  for(const owner of owners){
   const proposed=applyCareerMapOperation(createCareerMap(owner),{
    type:'propose-why',sourceId:`${owner}-proposal-source`,expectedRevision:0,occurredAt:recordedAt,
    payload:{why:{id:'north-star',revision:1,statement:'Make knowledge useful',serves:'People making choices',pointOfView:'Clarity supports action'},presentation:{kind:'model-presentation',assistantTurnId:`${owner}-proposal-turn`,turnSequence:1,completed:true,presentedAt:recordedAt}},
   });
   if(proposed.status!=='committed')throw new Error('Fictional North Star proposal failed.');
   const confirmed=applyCareerMapOperation(proposed.map,{
    type:'confirm-why',sourceId:`${owner}-confirmation-source`,expectedRevision:1,occurredAt:confirmedAt,
    payload:{whyId:'north-star',whyRevision:1,action:{kind:'user-message',actionId:`${owner}-confirmation-action`,turnId:`${owner}-confirmation-turn`,turnSequence:2,occurredAt:confirmedAt}},
   });
   if(confirmed.status!=='committed')throw new Error('Fictional North Star confirmation failed.');
   const map=confirmed.map;
   await db.query('INSERT INTO career_maps (user_id,schema_version,revision,document,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)',[owner,map.schemaVersion,map.revision,map,recordedAt,confirmedAt]);
   for(const receipt of map.operationHistory){
    await db.query('INSERT INTO career_map_history (user_id,operation_source_id,operation_type,payload_fingerprint,base_revision,result_revision,result,confirmation_provenance,module_version,committed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[owner,receipt.sourceId,receipt.operationType,receipt.payloadFingerprint,receipt.resultRevision-1,receipt.resultRevision,receipt,receipt.confirmationProvenance,receipt.moduleVersion??'source-test',receipt.committedAt]);
   }
   await db.query("INSERT INTO agent_turns (turn_id,user_id,client_message_id,request_fingerprint,origin,lease_id,status,created_at,updated_at,terminal_at) VALUES ($1,$2,$3,$4,'agent-turn',$5,'completed',$6,$7,$7)",[`${owner}-confirmation-turn`,owner,`${owner}-message`,`${owner}-fingerprint`,`${owner}-lease`,recordedAt,confirmedAt]);
   await db.query('INSERT INTO agent_conversation_mappings (user_id,conversation_id) VALUES ($1,$2)',[owner,`${owner}-conversation`]);
  }
  const before=await db.query('SELECT (SELECT count(*) FROM career_maps) AS maps, (SELECT count(*) FROM career_map_history) AS history, (SELECT count(*) FROM agent_turns) AS turns');
  const snapshot=await readParticipantSnapshot(db,'fictional-unstarted');
  expect(snapshot.map).toBeNull();expect(snapshot.history).toEqual([]);expect(snapshot.turns).toEqual([]);
  for(const owner of owners){
   const selected=await readParticipantSnapshot(db,owner);
   expect(selected.map).toMatchObject({userId:owner,revision:2});
   expect(selected.map?.document.explorerId).toBe(owner);
   expect(selected.history.map(row=>row.operationSourceId)).toEqual([`${owner}-proposal-source`,`${owner}-confirmation-source`]);
   expect(selected.history.every(row=>row.userId===owner)).toBe(true);
   expect(selected.turns.map(row=>({userId:row.userId,turnId:row.turnId}))).toEqual([{userId:owner,turnId:`${owner}-confirmation-turn`}]);
   expect(selected.conversationId).toBe(`${owner}-conversation`);
   const report=deriveParticipantProgress(owner,selected);
   expect(report.coverage).toBe('ready');
   expect(report.milestones.northStarConfirmed).toMatchObject({historicalCount:1,currentCount:1,firstRecordedAt:confirmedAt,firstCommittedAt:confirmedAt});
   expect(report.facts.find(fact=>fact.milestone==='northStarConfirmed')).toMatchObject({actionId:`${owner}-confirmation-action`,turnId:`${owner}-confirmation-turn`,operationSources:[`${owner}-confirmation-source`]});
   expect(JSON.stringify(selected)).not.toContain(owners.find(other=>other!==owner));
  }
  const after=await db.query('SELECT (SELECT count(*) FROM career_maps) AS maps, (SELECT count(*) FROM career_map_history) AS history, (SELECT count(*) FROM agent_turns) AS turns');
  expect(after.rows).toEqual(before.rows);
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await expect(db.query('DELETE FROM career_maps WHERE user_id = $1',['fictional-unstarted'])).rejects.toMatchObject({code:'25006'});
  await db.query('ROLLBACK');
 } finally {db.release();await cleanupStorageTestDatabases();}
});

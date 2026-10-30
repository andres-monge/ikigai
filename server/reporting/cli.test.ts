import { describe,it,expect,vi } from 'vitest';
import { buildCohortReport } from './workflow';
import { parseCohort } from './cohort';
const mocks=vi.hoisted(()=>({identityExists:vi.fn(),loadParticipantSnapshot:vi.fn(),resolveIdentity:vi.fn(),close:vi.fn(),listItems:vi.fn()}));
vi.mock('./source.js',async original=>({...await original<object>(),createReportingSource:()=>mocks}));
vi.mock('../ai/history.js',async original=>({...await original<object>(),OpenAIConversationClient:class {listItems=mocks.listItems;}}));
const stageAt='2030-01-01T00:00:00Z';
const roster=parseCohort({version:1,participants:[{key:'invited',stage:'invited',stageAt,source:'fictional invitation'},{key:'pilot',userId:'u1',stage:'enabled',stageAt,source:'fictional'},{key:'qa',userId:'u2',stage:'enabled',stageAt,source:'fictional'},{key:'founder',userId:'u3',stage:'enabled',stageAt,source:'fictional'}],exclusions:[{userId:'u2',role:'qa',source:'test'},{userId:'u3',role:'founder',source:'test'}]});
describe('cohort workflow',()=>{
 it('keeps the whole cohort visible while excluding QA/founder and preserving source failures',async()=>{
  const source={identityExists:vi.fn(async(id:string)=>id!=='missing'),loadParticipantSnapshot:vi.fn(async(id:string)=>{if(id==='u1')throw new Error('secret source error');return {observedAt:stageAt,map:null,history:[],turns:[],conversationId:null};})};
  const report=await buildCohortReport(roster,source,'test');
  expect(report.participants.map(p=>p.key)).toEqual(['invited','pilot','qa','founder']);
  expect(report.participants[1].identityStatus).toBe('unavailable');
  expect(report.aggregates.enrolled).toBe(2);
  expect(report.aggregates.linked).toBe(1);
  expect(source.identityExists).not.toHaveBeenCalledWith('u3');
  expect(source.loadParticipantSnapshot).not.toHaveBeenCalledWith('u3');
  expect(JSON.stringify(report)).not.toContain('secret');
 });
});

it('requires participant association for identity lookup before any database access',async()=>{
 const {runEarlyAccess}=await import('../../scripts/early-access');
 await expect(runEarlyAccess(['resolve-identity','--target','development','--email','fictional@example.test','--output','identity.json'])).rejects.toThrow(/participant key/i);
});
it('rejects apply on reporting commands and previews local purge without database credentials',async()=>{
 const {runEarlyAccess}=await import('../../scripts/early-access');
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'report-cli-'));const log=vi.spyOn(console,'log').mockImplementation(()=>undefined);
 try{
  await expect(runEarlyAccess(['report','--apply','--output','report.json'],root)).rejects.toThrow(/explicit local purge/);
  await runEarlyAccess(['purge','--participant','fictional'],root);
  expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({items:[],applied:false,crossStoreErasure:'not-performed'});
 }finally{log.mockRestore();await rm(root,{recursive:true,force:true});}
});

it('writes report JSON and Markdown from the same cohort facts',async()=>{
 const {runEarlyAccess}=await import('../../scripts/early-access');
 const {writePrivateOutput}=await import('./private-output');
 const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'report-cli-'));const log=vi.spyOn(console,'log').mockImplementation(()=>undefined);
 vi.stubEnv('DATABASE_URL','postgresql://localhost/fictional');vi.stubEnv('BETTER_AUTH_DATABASE_URL','postgresql://localhost/fictional');
 mocks.identityExists.mockResolvedValue(true);mocks.loadParticipantSnapshot.mockResolvedValue({observedAt:stageAt,map:null,history:[],turns:[],conversationId:null});mocks.close.mockResolvedValue(undefined);
 try{
  await writePrivateOutput(root,'roster.json',JSON.stringify({version:1,participants:[{key:'fictional',userId:'fictional-id',stage:'enabled',stageAt,source:'fictional'}],exclusions:[]}),['fictional']);
  await runEarlyAccess(['report','--target','development','--cohort','roster.json','--output','reports/test.json'],root);
  const report=JSON.parse(await readFile(join(root,'.context/early-access/reports/test.json'),'utf8'));
  const markdown=await readFile(join(root,'.context/early-access/reports/test.json.md'),'utf8');
  expect(report.aggregates.enrolled).toBe(1);expect(report.participants[0].progress.coverage).toBe('checked-empty');expect(markdown).toContain('fictional');expect(markdown).toContain('checked-empty');
  const manifest=JSON.parse(await readFile(join(root,'.context/early-access/reports/test.json.md.manifest.json'),'utf8'));expect(manifest.derivedFrom).toBe('reports/test.json');
 }finally{log.mockRestore();vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});}
});
it('saves a partial conversation and returns nonzero without losing the retrieved prefix',async()=>{
 const {runEarlyAccess}=await import('../../scripts/early-access');const {writePrivateOutput}=await import('./private-output');
 const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'report-cli-'));const log=vi.spyOn(console,'log').mockImplementation(()=>undefined);const previousExit=process.exitCode;
 vi.stubEnv('DATABASE_URL','postgresql://localhost/fictional');vi.stubEnv('BETTER_AUTH_DATABASE_URL','postgresql://localhost/fictional');vi.stubEnv('OPENAI_API_KEY','fictional-key');
 mocks.identityExists.mockResolvedValue(true);mocks.loadParticipantSnapshot.mockResolvedValue({observedAt:stageAt,map:null,history:[],turns:[],conversationId:'internal-only'});mocks.close.mockResolvedValue(undefined);
 mocks.listItems.mockReset().mockResolvedValueOnce({data:[{id:'provider-private-id',type:'message',role:'user',content:[{type:'input_text',text:'Fictional retained prefix'}]}],hasMore:true,lastId:'provider-private-id'}).mockRejectedValueOnce(new Error('secret'));
 try{
  await writePrivateOutput(root,'roster.json',JSON.stringify({version:1,participants:[{key:'fictional',userId:'fictional-id',stage:'enabled',stageAt,source:'fictional'}],exclusions:[]}),['fictional']);
  await runEarlyAccess(['conversation','--target','development','--participant','fictional','--output','conversation.json'],root);
  const output=await readFile(join(root,'.context/early-access/conversation.json'),'utf8');const report=JSON.parse(output);
  expect(process.exitCode).toBe(1);expect(report.pagination).toBe('partial');expect(report.messages[0].text).toBe('Fictional retained prefix');expect(output).not.toContain('provider-private-id');expect(output).not.toContain('secret');
 }finally{process.exitCode=previousExit;log.mockRestore();vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});}
});

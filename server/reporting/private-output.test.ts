import { mkdtemp, mkdir, readFile, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writePrivateOutput } from './private-output';
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
it('resumes shared Markdown erasure after the source report was already redacted',async()=>{
 const {registerPrivateOutput,applyPrivatePurge}=await import('./private-output');
 const {buildCohortReport,renderCohortMarkdown}=await import('./workflow');
 const {writeFile}=await import('node:fs/promises');
 const repo=await mkdtemp(join(tmpdir(),'reporting-'));roots.push(repo);
 const roster={version:1 as const,participants:['alice','bob'].map(key=>({key,stage:'invited' as const,stageAt:'2030-01-01T00:00:00Z',source:'fictional'})),exclusions:[]};
 const source={identityExists:async()=>true,loadParticipantSnapshot:async()=>({observedAt:'2030-01-01T00:00:00Z',map:null,history:[],turns:[],conversationId:null})};
 const original=await buildCohortReport(roster,source,'test');
 await writePrivateOutput(repo,'report.json',JSON.stringify(original),['alice','bob']);
 await registerPrivateOutput(repo,'report.json',['alice','bob'],'cohort-report',true);
 await writePrivateOutput(repo,'report.md',renderCohortMarkdown(original),['alice','bob']);
 await registerPrivateOutput(repo,'report.md',['alice','bob'],'cohort-markdown',true,'report.json');
 // Reproduce interruption between source-manifest update and companion regeneration.
 const redacted=await buildCohortReport({...roster,participants:roster.participants.filter(p=>p.key==='bob')},source,'test');
 await writeFile(join(repo,'.context/early-access/report.json'),JSON.stringify(redacted));
 await registerPrivateOutput(repo,'report.json',['bob'],'cohort-report',true);
 await applyPrivatePurge(repo,'alice');
 expect(await readFile(join(repo,'.context/early-access/report.md'),'utf8')).not.toContain('alice');
 expect(await readFile(join(repo,'.context/early-access/report.md'),'utf8')).toContain('bob');
 expect(JSON.parse(await readFile(join(repo,'.context/early-access/report.md.manifest.json'),'utf8')).participantKeys).toEqual(['bob']);
});
describe('private output',()=>{
 it('writes restricted output and associated manifest without overwriting',async()=>{const repo=await mkdtemp(join(tmpdir(),'reporting-'));roots.push(repo);const path=await writePrivateOutput(repo,'reports/run.json','{}',['person']);expect(await readFile(path,'utf8')).toBe('{}');expect((await stat(path)).mode&0o777).toBe(0o600);expect((await stat(join(repo,'.context/early-access/reports'))).mode&0o777).toBe(0o700);expect(await readFile(path+'.manifest.json','utf8')).toContain('person');await expect(writePrivateOutput(repo,'reports/run.json','changed',['person'])).rejects.toThrow();});
 it('rejects traversal and symlink escapes',async()=>{const repo=await mkdtemp(join(tmpdir(),'reporting-'));roots.push(repo);await expect(writePrivateOutput(repo,'../escape','x',['p'])).rejects.toThrow();await mkdir(join(repo,'.context'),{recursive:true});await symlink(tmpdir(),join(repo,'.context/early-access'));await expect(writePrivateOutput(repo,'escape','x',['p'])).rejects.toThrow();});
});

it('previews and purges a participant while preserving unrelated structured notes',async()=>{
 const { previewPrivatePurge, applyPrivatePurge, registerPrivateOutput }=await import('./private-output');
 const repo=await mkdtemp(join(tmpdir(),'reporting-'));roots.push(repo);
 await writePrivateOutput(repo,'notes.json',JSON.stringify({version:1,entries:[{participantKeys:['alice'],content:'private Alice'},{participantKeys:['bob'],content:'private Bob'}]}),['alice','bob']);
 await registerPrivateOutput(repo,'notes.json',['alice','bob'],'structured-notes',true);
 await writePrivateOutput(repo,'alice.txt','private Alice',['alice']);
 const preview=await previewPrivatePurge(repo,'alice');
 expect(preview.items).toHaveLength(2);
 expect(await readFile(join(repo,'.context/early-access/alice.txt'),'utf8')).toBe('private Alice');
 await applyPrivatePurge(repo,'alice');
 await expect(readFile(join(repo,'.context/early-access/alice.txt'))).rejects.toThrow();
 const text=await readFile(join(repo,'.context/early-access/notes.json'),'utf8');
 expect(text).not.toContain('Alice');expect(text).toContain('Bob');
});
it('blocks ambiguous shared prose instead of deleting another participant material',async()=>{
 const {previewPrivatePurge,applyPrivatePurge}=await import('./private-output');
 const repo=await mkdtemp(join(tmpdir(),'reporting-'));roots.push(repo);
 await writePrivateOutput(repo,'shared.md','Alice and Bob note',['alice','bob']);
 expect((await previewPrivatePurge(repo,'alice')).blocked).toHaveLength(1);
 await expect(applyPrivatePurge(repo,'alice')).rejects.toThrow(/shared/i);
 expect(await readFile(join(repo,'.context/early-access/shared.md'),'utf8')).toBe('Alice and Bob note');
});
it('regenerates shared report Markdown and retires only the selected roster binding',async()=>{
 const {registerPrivateOutput,applyPrivatePurge}=await import('./private-output');
 const {buildCohortReport,renderCohortMarkdown}=await import('./workflow');
 const repo=await mkdtemp(join(tmpdir(),'reporting-'));roots.push(repo);
 const roster={version:1 as const,participants:['alice','bob'].map(key=>({key,userId:key+'-identity',stage:'invited' as const,stageAt:'2030-01-01T00:00:00Z',source:'fictional'})),exclusions:[]};
 const report=await buildCohortReport(roster,{identityExists:async()=>true,loadParticipantSnapshot:async()=>({observedAt:'2030-01-01T00:00:00Z',map:null,history:[],turns:[],conversationId:null})},'test');
 await writePrivateOutput(repo,'report.json',JSON.stringify(report),['alice','bob']);await registerPrivateOutput(repo,'report.json',['alice','bob'],'cohort-report',true);
 await writePrivateOutput(repo,'report.md',renderCohortMarkdown(report),['alice','bob']);await registerPrivateOutput(repo,'report.md',['alice','bob'],'cohort-markdown',true,'report.json');
 await writePrivateOutput(repo,'roster.json',JSON.stringify(roster),['alice','bob']);await registerPrivateOutput(repo,'roster.json',['alice','bob'],'roster',true);
 await applyPrivatePurge(repo,'alice');
 const remaining=JSON.parse(await readFile(join(repo,'.context/early-access/report.json'),'utf8'));
 expect(remaining.participants.map((p:{key:string})=>p.key)).toEqual(['bob']);expect(remaining.aggregates.enrolled).toBe(1);
 const md=await readFile(join(repo,'.context/early-access/report.md'),'utf8');expect(md).not.toContain('alice');expect(md).toContain('bob');
 const rosterText=await readFile(join(repo,'.context/early-access/roster.json'),'utf8');expect(rosterText).not.toContain('alice-identity');expect(rosterText).toContain('bob-identity');
});
it('blocks inseparable multi-person learning entries and reports untracked copies',async()=>{
 const {registerPrivateOutput,previewPrivatePurge,applyPrivatePurge}=await import('./private-output');
 const repo=await mkdtemp(join(tmpdir(),'reporting-'));roots.push(repo);
 await writePrivateOutput(repo,'learning.json',JSON.stringify({version:1,entries:[{participantKeys:['alice','bob'],content:'joint observation'}]}),['alice','bob']);await registerPrivateOutput(repo,'learning.json',['alice','bob'],'structured-notes',true);
 const preview=await previewPrivatePurge(repo,'alice');expect(preview.blocked).toHaveLength(1);
 await expect(applyPrivatePurge(repo,'alice')).rejects.toThrow();
});

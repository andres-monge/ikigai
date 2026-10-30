import { mkdtemp, mkdir, readFile, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writePrivateOutput } from './private-output';
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
describe('private output',()=>{
 it('writes restricted output and associated manifest without overwriting',async()=>{const repo=await mkdtemp(join(tmpdir(),'reporting-'));roots.push(repo);const path=await writePrivateOutput(repo,'reports/run.json','{}',['person']);expect(await readFile(path,'utf8')).toBe('{}');expect((await stat(path)).mode&0o777).toBe(0o600);expect((await stat(join(repo,'.context/early-access/reports'))).mode&0o777).toBe(0o700);expect(await readFile(path+'.manifest.json','utf8')).toContain('person');await expect(writePrivateOutput(repo,'reports/run.json','changed',['person'])).rejects.toThrow();});
 it('rejects traversal and symlink escapes',async()=>{const repo=await mkdtemp(join(tmpdir(),'reporting-'));roots.push(repo);await expect(writePrivateOutput(repo,'../escape','x',['p'])).rejects.toThrow();await mkdir(join(repo,'.context'),{recursive:true});await symlink(tmpdir(),join(repo,'.context/early-access'));await expect(writePrivateOutput(repo,'escape','x',['p'])).rejects.toThrow();});
});

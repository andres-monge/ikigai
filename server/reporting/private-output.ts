import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const PRIVATE_OUTPUT_DIRECTORY = '.context/early-access';

/** Walk every existing component without following symlinks. */
export async function privateOutputPath(repoRoot: string, relativePath: string, createDirectories = false): Promise<string> {
  if (!relativePath || isAbsolute(relativePath) || relativePath.split(/[\\/]/).some(part => part === '..' || part === '.' || !part)) {
    throw new Error('Private output must use a relative path inside the private root.');
  }
  const repo = await realpath(repoRoot);
  const destination = resolve(repo, PRIVATE_OUTPUT_DIRECTORY, relativePath);
  const root = join(repo, PRIVATE_OUTPUT_DIRECTORY);
  if (!destination.startsWith(root + sep)) throw new Error('Private output escapes its root.');
  const components = relative(repo, destination).split(sep);
  let current = repo;
  for (let index = 0; index < components.length; index++) {
    current = join(current, components[index]);
    const final = index === components.length - 1;
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || (!final && !info.isDirectory()) || (final && !info.isFile())) throw new Error('Unsafe private output path.');
      if (!final && createDirectories) await chmod(current, 0o700);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!final) {
        if (!createDirectories) throw error;
        await mkdir(current, { mode: 0o700 });
      }
    }
  }
  return destination;
}

export async function writePrivateOutput(repoRoot: string, relativePath: string, content: string, participantKeys: string[]): Promise<string> {
  if (!participantKeys.every(participantKeyValid)) throw new Error('Invalid artifact participant key.');
  const path = await privateOutputPath(repoRoot, relativePath, true);
  const manifestPath = await privateOutputPath(repoRoot, relativePath + '.manifest.json', true);
  const manifest = await open(manifestPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    // Register before writing content so even an interrupted export is discoverable for erasure.
    await manifest.writeFile(JSON.stringify({ version: 1, path: relativePath, participantKeys: [...new Set(participantKeys)], createdAt: new Date().toISOString() }, null, 2));
  } finally { await manifest.close(); }
  const output = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await output.writeFile(content); } finally { await output.close(); }
  return path;
}

export type ArtifactFormat = 'plain'|'structured-notes'|'cohort-report'|'cohort-markdown'|'roster';
type ArtifactManifest={version:1;path:string;participantKeys:string[];createdAt:string;format?:ArtifactFormat;derivedFrom?:string};
const participantKeyValid=(key:string)=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(key);
/** Register a manually maintained private note, or attach its structured format. */
export async function registerPrivateOutput(repoRoot:string,relativePath:string,participantKeys:string[],format:ArtifactFormat='plain',replaceManifest=false,derivedFrom?:string):Promise<void>{
 if(!participantKeys.length||!participantKeys.every(participantKeyValid))throw new Error('Associate at least one valid participant key.');
 const path=await privateOutputPath(repoRoot,relativePath);
 const info=await lstat(path);if(!info.isFile())throw new Error('Register an existing private file.');
 await chmod(path,0o600);
 const manifestPath=await privateOutputPath(repoRoot,relativePath+'.manifest.json',true);
 if(derivedFrom)await privateOutputPath(repoRoot,derivedFrom);
 const handle=await open(manifestPath,constants.O_CREAT|constants.O_WRONLY|constants.O_NOFOLLOW|(replaceManifest?constants.O_TRUNC:constants.O_EXCL),0o600);
 try{await handle.writeFile(JSON.stringify({version:1,path:relativePath,participantKeys:[...new Set(participantKeys)],createdAt:new Date().toISOString(),format,...(derivedFrom?{derivedFrom}:{})},null,2));}finally{await handle.close();}
}
type PurgeItem={path:string;action:'delete'|'redact'|'regenerate'|'retire-binding';format:ArtifactFormat;derivedFrom?:string};
export type PurgePreview={participantKey:string;items:PurgeItem[];blocked:Array<{path:string;reason:string}>;untracked:string[];crossStoreErasure:'not-performed'};
async function inventory(repoRoot:string):Promise<{manifests:ArtifactManifest[];untracked:string[]}>{
 const {readdir,readFile}=await import('node:fs/promises');
 const root=resolve(await realpath(repoRoot),PRIVATE_OUTPUT_DIRECTORY);const files:string[]=[];
 async function walk(dir:string):Promise<void>{for(const entry of await readdir(dir,{withFileTypes:true})){const full=join(dir,entry.name);const rel=relative(root,full);if(entry.isSymbolicLink())throw new Error('Unsafe private inventory symlink.');if(entry.isDirectory())await walk(full);else if(entry.isFile()){await privateOutputPath(repoRoot,rel);files.push(rel);}else throw new Error('Unsafe private inventory entry.');}}
 try{const rootInfo=await lstat(root);if(rootInfo.isSymbolicLink()||!rootInfo.isDirectory())throw new Error('Unsafe private inventory root.');await walk(root);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {manifests:[],untracked:[]};throw error;}
 const manifests:ArtifactManifest[]=[];
 for(const file of files.filter(p=>p.endsWith('.manifest.json'))){
  const data=JSON.parse(await readFile(await privateOutputPath(repoRoot,file),'utf8')) as ArtifactManifest;
  if(data.version!==1||typeof data.path!=='string'||data.path+'.manifest.json'!==file||!Array.isArray(data.participantKeys)||!data.participantKeys.every(key=>typeof key==='string'&&participantKeyValid(key))||!['plain','structured-notes','cohort-report','cohort-markdown','roster'].includes(data.format??'plain'))throw new Error('Invalid private artifact manifest.');
  await privateOutputPath(repoRoot,data.path);if(data.derivedFrom)await privateOutputPath(repoRoot,data.derivedFrom);
  manifests.push(data);
 }
 const known=new Set(manifests.map(m=>m.path));
 return {manifests,untracked:files.filter(p=>!p.endsWith('.manifest.json')&&!known.has(p))};
}
async function redactedContent(repoRoot:string,item:PurgeItem,key:string):Promise<{content:string;keys:string[]}>{
 const {readFile}=await import('node:fs/promises');
 const data=JSON.parse(await readFile(await privateOutputPath(repoRoot,item.path),'utf8'));
 if(item.format==='cohort-report'){
  const {aggregateParticipants}=await import('./workflow.js');
  if(data.kind!=='cohort-report'||!Array.isArray(data.participants))throw new Error('Unsupported shared report.');
  data.participants=data.participants.filter((p:{key:string})=>p.key!==key);data.aggregates=aggregateParticipants(data.participants);
  return {content:JSON.stringify(data,null,2),keys:data.participants.map((p:{key:string})=>p.key)};
 }
 if(item.format==='structured-notes'){
  if(data.version!==1||!Array.isArray(data.entries)||data.entries.some((entry:{participantKeys?:string[]})=>!Array.isArray(entry.participantKeys)||!entry.participantKeys.every(participantKeyValid)))throw new Error('Unsupported shared notes.');
  if(data.entries.some((entry:{participantKeys:string[]})=>entry.participantKeys.includes(key)&&entry.participantKeys.some(k=>k!==key)))throw new Error('Shared prose contains inseparable participant material.');
  data.entries=data.entries.filter((entry:{participantKeys:string[]})=>!entry.participantKeys.includes(key));
  return {content:JSON.stringify(data,null,2),keys:[...new Set<string>(data.entries.flatMap((entry:{participantKeys:string[]})=>entry.participantKeys))]};
 }
 if(item.format==='roster'){
  const {parseCohort}=await import('./cohort.js');const cohort=parseCohort(data);const participant=cohort.participants.find(p=>p.key===key);const id=participant?.userId;
  cohort.participants=cohort.participants.filter(p=>p.key!==key);if(id)cohort.exclusions=cohort.exclusions.filter(p=>p.userId!==id);
  return {content:JSON.stringify(cohort,null,2),keys:cohort.participants.map(p=>p.key)};
 }
 throw new Error('Shared private file requires a structured format.');
}
export async function previewPrivatePurge(repoRoot:string,key:string):Promise<PurgePreview>{
 if(!participantKeyValid(key))throw new Error('Invalid participant key.');
 const data=await inventory(repoRoot);const preview:PurgePreview={participantKey:key,items:[],blocked:[],untracked:data.untracked,crossStoreErasure:'not-performed'};
 for(const manifest of data.manifests.filter(m=>m.participantKeys.includes(key))){
  const format=manifest.format??'plain';const action=manifest.participantKeys.length===1&&format!=='roster'?'delete':format==='cohort-markdown'?'regenerate':format==='roster'?'retire-binding':'redact';
  const item:PurgeItem={path:manifest.path,action,format,...(manifest.derivedFrom?{derivedFrom:manifest.derivedFrom}:{})};
  try{
   if(action==='regenerate'){
    const source=data.manifests.find(m=>m.path===manifest.derivedFrom&&m.format==='cohort-report');
    if(!source)throw new Error('Shared Markdown needs its registered report source.');
    await redactedContent(repoRoot,{path:source.path,action:'redact',format:'cohort-report'},key);
   }else if(action!=='delete')await redactedContent(repoRoot,item,key);
   preview.items.push(item);
  }catch{preview.blocked.push({path:manifest.path,reason:'Shared private material needs supported structure or manual participant redaction.'});}
 }
 return preview;
}
export async function applyPrivatePurge(repoRoot:string,key:string):Promise<PurgePreview>{
 const {readFile,unlink,rename}=await import('node:fs/promises');
 const preview=await previewPrivatePurge(repoRoot,key);if(preview.blocked.length)throw new Error('Shared private material blocks purge; redact it first.');
 async function replace(path:string,content:string){
  const destination=await privateOutputPath(repoRoot,path);
  const temporary=await privateOutputPath(repoRoot,path+'.purge-'+randomUUID());
  const handle=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{await handle.writeFile(content);await handle.close();await rename(temporary,destination);}
  finally{await handle.close().catch(()=>undefined);await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 }
 for(const item of preview.items.filter(i=>i.action!=='regenerate')){
  if(item.action==='delete'){
   await unlink(await privateOutputPath(repoRoot,item.path)).catch(error=>{if(error.code!=='ENOENT')throw error;});await unlink(await privateOutputPath(repoRoot,item.path+'.manifest.json'));
  }else{
   const updated=await redactedContent(repoRoot,item,key);await replace(item.path,updated.content);
   const manifestPath=item.path+'.manifest.json';const manifest=JSON.parse(await readFile(await privateOutputPath(repoRoot,manifestPath),'utf8'));manifest.participantKeys=updated.keys;await replace(manifestPath,JSON.stringify(manifest,null,2));
  }
 }
 for(const item of preview.items.filter(i=>i.action==='regenerate')){
  const {renderCohortMarkdown}=await import('./workflow.js');const report=JSON.parse(await readFile(await privateOutputPath(repoRoot,item.derivedFrom!),'utf8'));
  await replace(item.path,renderCohortMarkdown(report));
  const manifestPath=item.path+'.manifest.json';const manifest=JSON.parse(await readFile(await privateOutputPath(repoRoot,manifestPath),'utf8'));manifest.participantKeys=report.participants.map((p:{key:string})=>p.key);await replace(manifestPath,JSON.stringify(manifest,null,2));
 }
 return preview;
}

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseCohort, requireReviewParticipant } from '../server/reporting/cohort.js';
import { privateOutputPath, writePrivateOutput, registerPrivateOutput, previewPrivatePurge, applyPrivatePurge, type ArtifactFormat } from '../server/reporting/private-output.js';
import { createReportingSource, reportingConnections } from '../server/reporting/source.js';
import { buildCohortReport, renderCohortMarkdown } from '../server/reporting/workflow.js';
import { retrieveConversation, renderConversationMarkdown } from '../server/reporting/conversations.js';
import { OpenAIConversationClient } from '../server/ai/history.js';

export async function runEarlyAccess(args:string[],repoRoot=resolve(fileURLToPath(new URL('..',import.meta.url)))):Promise<void>{
 const {values,positionals}=parseArgs({args,allowPositionals:true,options:{target:{type:'string'},cohort:{type:'string'},output:{type:'string'},email:{type:'string'},participant:{type:'string'},format:{type:'string'},input:{type:'string'},apply:{type:'boolean'},help:{type:'boolean'}}});
 if(values.help){
  console.log('early-access <report|cohort|conversation|resolve-identity|register|purge> [options]');
  console.log('Read commands: --target development|production|test --output relative/path; --cohort roster.json; conversation --participant key --format json|md; resolve-identity --email exact@email --participant key.');
  console.log('Local inventory: register --input private/path --participant key[,key] --format plain|structured-notes|roster; purge --participant key [--apply]. Purge defaults to preview.');
  console.log('Select an environment file containing DATABASE_URL, BETTER_AUTH_DATABASE_URL and (conversation only) OPENAI_API_KEY. Private root: .context/early-access.');return;
 }
 const command=positionals[0];
 if(positionals.length!==1||!['report','cohort','conversation','resolve-identity','register','purge'].includes(command))throw new Error('Choose a supported early-access command.');
 if(values.apply&&command!=='purge')throw new Error('Apply is allowed only for explicit local purge.');
 const key=values.participant;
 if(command==='purge'){
  if(!key||key.includes(','))throw new Error('Choose one participant key.');
  const preview=values.apply?await applyPrivatePurge(repoRoot,key):await previewPrivatePurge(repoRoot,key);
  console.log(JSON.stringify({...preview,applied:values.apply===true},null,2));
  if(preview.blocked.length||preview.untracked.length)process.exitCode=1;
  return;
 }
 if(command==='register'){
  if(!values.input||!key)throw new Error('Register requires a private input and participant keys.');
  if(!['plain','structured-notes','roster'].includes(values.format??'plain'))throw new Error('Unsupported note format.');
  await registerPrivateOutput(repoRoot,values.input,key.split(','),values.format as ArtifactFormat|undefined);
  console.log('Private artifact registered.');return;
 }
 if(!values.output)throw new Error('Choose an explicit private output path.');
 if(values.format&&!['json','md'].includes(values.format))throw new Error('Choose json or md.');
 if(command==='resolve-identity'&&(!values.email||!key||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(key)))throw new Error('Identity lookup requires an exact email and participant key.');
 const cohort=command==='resolve-identity'?undefined:parseCohort(JSON.parse(await readFile(await privateOutputPath(repoRoot,values.cohort??'roster.json'),'utf8')));
 if(command==='conversation'&&!key)throw new Error('Conversation requires a roster participant key.');
 const participant=command==='conversation'?requireReviewParticipant(cohort!,key!):undefined;
 // Validate private paths before opening database/provider connections.
 await privateOutputPath(repoRoot,values.output,true);
 const configuration=reportingConnections(values.target,process.env);
 const source=createReportingSource(configuration);
 try{
  if(command==='resolve-identity'){
   const output={version:1,participantKey:key,target:configuration.target,...await source.resolveIdentity(values.email!)};
   const path=await writePrivateOutput(repoRoot,values.output,JSON.stringify(output,null,2),[key!]);console.log(`Private output written: ${path}`);return;
  }
  if(command==='conversation'){
   if(!await source.identityExists(participant!.userId))throw new Error('Roster identity is unavailable.');
   if(!process.env.OPENAI_API_KEY)throw new Error('Conversation provider is unavailable.');
   const snapshot=await source.loadParticipantSnapshot(participant!.userId);
   const report=await retrieveConversation({participantKey:key!,snapshot,client:new OpenAIConversationClient(process.env.OPENAI_API_KEY)});
   const output=values.format==='md'?renderConversationMarkdown(report):JSON.stringify(report,null,2);
   const path=await writePrivateOutput(repoRoot,values.output,output,[key!]);console.log(`Private output written: ${path}; pagination ${report.pagination}; content ${report.contentCoverage}`);
   if(!report.complete)process.exitCode=1;return;
  }
  const report=await buildCohortReport(cohort!,source,configuration.target);
  const keys=report.participants.map(p=>p.key);
  const path=await writePrivateOutput(repoRoot,values.output,JSON.stringify(report,null,2),keys);
  if(keys.length)await registerPrivateOutput(repoRoot,values.output,keys,'cohort-report',true);
  const markdown=values.output+'.md';await writePrivateOutput(repoRoot,markdown,renderCohortMarkdown(report),keys);
  if(keys.length)await registerPrivateOutput(repoRoot,markdown,keys,'cohort-markdown',true,values.output);
  console.log(`Private report written: ${path}; Markdown companion: ${markdown}`);
  if(report.participants.some(p=>p.identityStatus==='unavailable'||p.identityStatus==='missing'||p.progress?.coverage==='unavailable'||p.progress?.coverage==='partial'))process.exitCode=1;
 }finally{await source.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runEarlyAccess(process.argv.slice(2)).catch(()=>{console.error('Early-access command failed. Check target configuration, private paths, roster and source availability; no credentials or private source errors are printed.');process.exitCode=1;});
}

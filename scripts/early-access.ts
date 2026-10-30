import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseCohort, classifyParticipant } from '../server/reporting/cohort.js';
import { privateOutputPath, writePrivateOutput } from '../server/reporting/private-output.js';
import { createReportingSource, reportingConnections } from '../server/reporting/source.js';

export async function runEarlyAccess(args: string[], repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))): Promise<void> {
  const {values,positionals} = parseArgs({args,allowPositionals:true,options:{target:{type:'string'},cohort:{type:'string'},output:{type:'string'},email:{type:'string'},help:{type:'boolean'}}});
  if (values.help) {
    console.log('early-access <cohort|resolve-identity> --target development|production|test --output relative/private/path [--cohort roster.json] [--email exact@email]');
    console.log('Use an explicit environment file with DATABASE_URL and BETTER_AUTH_DATABASE_URL. Outputs remain under .context/early-access.');
    return;
  }
  const command = positionals[0];
  if (positionals.length !== 1 || !['cohort','resolve-identity'].includes(command)) throw new Error('Choose cohort or resolve-identity.');
  if (!values.output) throw new Error('Choose an explicit private output path.');
  const configuration = reportingConnections(values.target, process.env);
  const cohort = command === 'cohort' ? parseCohort(JSON.parse(await readFile(await privateOutputPath(repoRoot, values.cohort ?? 'roster.json'), 'utf8'))) : undefined;
  if (command === 'resolve-identity' && !values.email) throw new Error('Supply the exact email to resolve.');
  const source = createReportingSource(configuration);
  try {
    let output: unknown;
    if (command === 'resolve-identity') {
      output = {version:1,target:configuration.target,...await source.resolveIdentity(values.email!)};
    } else {
      const participants = [];
      for (const participant of cohort!.participants) {
        const classification = classifyParticipant(cohort!,participant);
        // Founder exclusion remains visible without reading founder records.
        const identityStatus = !participant.userId ? 'unlinked' : classification === 'excluded-founder' ? 'not-read-excluded' : await source.identityExists(participant.userId) ? 'verified' : 'missing';
        participants.push({key:participant.key,stage:participant.stage,stageAt:participant.stageAt,source:participant.source,classification,identityStatus});
      }
      output = {version:1,target:configuration.target,observedAt:new Date().toISOString(),participants};
    }
    const path = await writePrivateOutput(repoRoot,values.output,JSON.stringify(output,null,2),cohort?.participants.map(p=>p.key)??[]);
    console.log(`Private output written: ${path}`);
  } finally {await source.close();}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runEarlyAccess(process.argv.slice(2)).catch(()=>{
    console.error('Early-access command failed. Check target configuration, private paths, roster and source availability; no credentials or private source errors are printed.');
    process.exitCode=1;
  });
}

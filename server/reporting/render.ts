import { milestoneNames, type ProgressReport } from './progress.js';
const text=(value:string)=>value.replace(/[\r\n|]/g,' ');
/** Readable view of the exact facts exported as JSON, without interpreting value. */
export function renderProgressMarkdown(reports: ProgressReport[]): string {
 const lines=['# Early-access progress','','Recorded model presentation does not prove browser delivery. Off-app work is self-reported. Later turns require manual review; silence is not abandonment.',''];
 for(const report of reports){
  lines.push(`## ${text(report.participantKey)}`,'',`Coverage: ${report.coverage}. Observed: ${report.observedAt}. Map revision: ${report.mapRevision??'unknown'}. Schema: ${report.schemaVersion??'unknown'}. Report format: ${report.version}; derivation: ${report.derivationVersion}; source build: ${report.sourceBuildVersion}.`,'');
  if(report.gaps.length)lines.push(`Evidence gaps: ${report.gaps.join(', ')}.`,'');
  lines.push('| Milestone | First recorded | Historical attainments | Currently supported |','|---|---|---:|---:|');
  for(const name of milestoneNames){const value=report.milestones[name];lines.push(`| ${name} | ${value.firstRecordedAt??'unknown / no evidence'} | ${value.historicalCount} | ${value.currentCount} |`);}
  lines.push('','### Sources','');
  for(const fact of report.facts) lines.push(`- ${text(fact.id)}: ${fact.evidence}; ${fact.current?'current':'historical'}; entities ${fact.entities.map(text).join(', ')}; action ${text(fact.actionId??'unknown')}; turn ${text(fact.turnId??'unknown')} (${fact.turnStatus??'unknown'}); committed ${fact.committedAt??'unknown'}; operations ${fact.operationSources.map(text).join(', ')||'unknown'}${fact.correctionActionIds?.length?`; corrections ${fact.correctionActionIds.map(text).join(', ')}`:''}.`);
  lines.push('','### Reported work updates','');
  for(const update of report.workUpdates)lines.push(`- ${text(update.actionId)}: ${update.status}, recorded ${update.recordedAt}, entities ${update.entities.map(text).join(', ')}${update.correctsActionId?`, corrects ${text(update.correctsActionId)}`:''}.`);
  lines.push('',`Turns: ${report.activity.turnCount}; statuses ${JSON.stringify(report.activity.statuses)}. Meaningful return, assistance and invited/spontaneous return: unknown.`,'');
  for(const turn of report.activity.laterTurnCandidates)lines.push(`- ${text(turn.turnId)} at ${turn.createdAt}, ${turn.status}: manual review candidate.`);
  lines.push('');
 }
 return lines.join('\n');
}

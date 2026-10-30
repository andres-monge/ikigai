import { classifyParticipant, type Cohort, type ParticipantClassification } from './cohort.js';
import { deriveParticipantProgress, milestoneNames, type ProgressReport } from './progress.js';
import { renderProgressMarkdown } from './render.js';
import type { ReportingSnapshot } from './source.js';
export type CohortParticipantReport = {key:string;stage:string;stageAt:string;source:string;noticeReference?:string;agreementReference?:string;classification:ParticipantClassification;identityStatus:'unlinked'|'verified'|'missing'|'unavailable'|'not-read-excluded';progress:ProgressReport|null};
export type CohortReport = {version:1;kind:'cohort-report';target:string;observedAt:string;participants:CohortParticipantReport[];aggregates:ReturnType<typeof aggregateParticipants>};
export function aggregateParticipants(participants:CohortParticipantReport[]) {
 const pilot=participants.filter(p=>p.classification==='pilot'||p.classification==='unlinked');
 return {enrolled:pilot.length,linked:pilot.filter(p=>p.classification==='pilot').length,unlinked:pilot.filter(p=>p.identityStatus==='unlinked').length,unavailable:pilot.filter(p=>p.identityStatus==='unavailable'||p.identityStatus==='missing').length,excluded:participants.length-pilot.length,milestones:Object.fromEntries(milestoneNames.map(name=>[name,{participantsWithHistoricalEvidence:pilot.filter(p=>(p.progress?.milestones[name].historicalCount??0)>0).length,participantsWithCurrentEvidence:pilot.filter(p=>(p.progress?.milestones[name].currentCount??0)>0).length}]))};
}
export async function buildCohortReport(cohort:Cohort,source:{identityExists(userId:string):Promise<boolean>;loadParticipantSnapshot(userId:string):Promise<ReportingSnapshot>},target:string):Promise<CohortReport>{
 const participants:CohortParticipantReport[]=[];
 for(const participant of cohort.participants){
  const classification=classifyParticipant(cohort,participant);
  const result:CohortParticipantReport={key:participant.key,stage:participant.stage,stageAt:participant.stageAt,source:participant.source,...(participant.noticeReference?{noticeReference:participant.noticeReference}:{}),...(participant.agreementReference?{agreementReference:participant.agreementReference}:{}),classification,identityStatus:'unlinked',progress:null};
  if(classification==='excluded-founder')result.identityStatus='not-read-excluded';
  else if(participant.userId){
   try{result.identityStatus=await source.identityExists(participant.userId)?'verified':'missing';if(result.identityStatus==='verified')result.progress=deriveParticipantProgress(participant.key,await source.loadParticipantSnapshot(participant.userId));}
   catch{result.identityStatus='unavailable';}
  }
  participants.push(result);
 }
 return {version:1,kind:'cohort-report',target,observedAt:new Date().toISOString(),participants,aggregates:aggregateParticipants(participants)};
}
const safe=(s:string)=>s.replace(/[\r\n|]/g,' ');
export function renderCohortMarkdown(report:CohortReport):string{
 const lines=['# Early-access cohort report','',`Target: ${report.target}. Observed: ${report.observedAt}.`,'',`Pilot roster entries: ${report.aggregates.enrolled}; linked: ${report.aggregates.linked}; unlinked: ${report.aggregates.unlinked}; unavailable/missing identities: ${report.aggregates.unavailable}; excluded: ${report.aggregates.excluded}.`,'','Current means supported in the current map context; historical evidence remains visible. Off-app work is self-reported. Unknowns are not evidence of abandonment.','','| Participant | Recruitment stage | Classification | Identity | App evidence |','|---|---|---|---|---|'];
 for(const p of report.participants)lines.push(`| ${safe(p.key)} | ${safe(p.stage)} (${p.stageAt}) | ${p.classification} | ${p.identityStatus} | ${p.progress?.coverage??'unknown / not read'} |`);
 lines.push('',renderProgressMarkdown(report.participants.flatMap(p=>p.progress?[p.progress]:[])));
 return lines.join('\n');
}

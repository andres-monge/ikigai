import { careerMapSchema, selectActivePurposePath, selectCurrentProjectLearning, type CareerMap, type ModelPresentation, type UserActionProvenance, type RevisionRef } from '../../shared/career-map/index.js';
import type { ReportingSnapshot } from './source.js';

export const milestoneNames = ['northStarPresented', 'northStarConfirmed', 'pathsPresented', 'pathChosen', 'projectProposed', 'projectAccepted', 'workReported', 'workCompleted', 'reflectionSaved', 'experienceBackedDecision'] as const;
export type Milestone = typeof milestoneNames[number];
export type ProgressFact = {
  id: string; milestone: Milestone; attainmentId: string; evidence: 'observed' | 'self-reported'; current: boolean;
  recordedAt: string | null; committedAt: string | null; actualWorkOccurredAt: null;
  entities: string[]; actionId?: string; turnId?: string; operationSources: string[];
  delivery?: 'unknown'; presentationCompleted?: true; turnStatus?: string; correctionActionIds?: string[];
};
export type MilestoneSummary = { historicalCount: number; currentCount: number; firstRecordedAt: string | null; firstCommittedAt: string | null };
export type ProgressReport = {
  version: 1; participantKey: string; observedAt: string; coverage: 'checked-empty' | 'ready' | 'partial' | 'unavailable';
  mapRevision: number | null; schemaVersion: number | null; sourceBuildVersion: 'unknown'; derivationVersion: 'retained-map-v1'; gaps: string[]; facts: ProgressFact[];
  milestones: Record<Milestone, MilestoneSummary>;
  workUpdates: Array<{actionId:string;turnId:string;recordedAt:string;status:string;correctsActionId?:string;entities:string[];operationSources:string[]}>;
  activity: { turnCount: number; statuses: Record<string,number>; laterTurnCandidates: Array<{turnId:string;createdAt:string;status:string;interpretation:'manual review'}>; meaningfulReturn:'unknown'; assistance:'unknown'; returnInvitation:'unknown' };
};
const ref = (value: RevisionRef) => `${value.id}@${value.revision}`;
const iso = (value: unknown): string | null => {
  if (!(typeof value === 'string' || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const earliest = (values: Array<string|null>) => values.filter((value): value is string => Boolean(value)).sort()[0] ?? null;

/** Derives retained facts only; receipt fingerprints cannot reconstruct old maps. */
export function deriveParticipantProgress(participantKey: string, snapshot: ReportingSnapshot): ProgressReport {
  const report: ProgressReport = {
    version:1, participantKey, observedAt:snapshot.observedAt, coverage:'ready',
    mapRevision:snapshot.map?.revision??null, schemaVersion:snapshot.map?.schemaVersion??null, sourceBuildVersion:'unknown', derivationVersion:'retained-map-v1', gaps:[], facts:[],workUpdates:[],
    milestones:Object.fromEntries(milestoneNames.map(name=>[name,{historicalCount:0,currentCount:0,firstRecordedAt:null,firstCommittedAt:null}])) as Record<Milestone,MilestoneSummary>,
    activity:{turnCount:0,statuses:{},laterTurnCandidates:[],meaningfulReturn:'unknown',assistance:'unknown',returnInvitation:'unknown'},
  };
  const turns = [...new Map(snapshot.turns.filter(turn=>turn.origin==='agent-turn').map(turn=>[turn.turnId,turn])).values()]
    .sort((a,b)=>(iso(a.createdAt)??'').localeCompare(iso(b.createdAt)??'') || a.turnId.localeCompare(b.turnId));
  report.activity.turnCount=turns.length;
  for(const turn of turns) report.activity.statuses[turn.status]=(report.activity.statuses[turn.status]??0)+1;
  report.activity.laterTurnCandidates=turns.slice(1).map(turn=>({turnId:turn.turnId,createdAt:iso(turn.createdAt)??'unknown',status:turn.status,interpretation:'manual review'}));
  if(!snapshot.map){
    report.coverage=snapshot.history.length||turns.length||snapshot.conversationId?'partial':'checked-empty';
    if(report.coverage==='partial') report.gaps.push('map-missing-with-other-evidence');
    return report;
  }
  const parsed=careerMapSchema.safeParse(snapshot.map.document);
  if(!parsed.success){report.coverage='unavailable';report.gaps.push('canonical-map-invalid');return report;}
  const map=parsed.data;
  if(snapshot.map.repairRequired){report.coverage='partial';report.gaps.push('map-repair-required');}
  if(map.revision!==snapshot.map.revision){report.coverage='partial';report.gaps.push('map-row-revision-mismatch');}
  const receipts=[...new Map(snapshot.history.map(row=>[row.operationSourceId,row])).values()];
  if(receipts.length!==map.revision || receipts.some((row,index)=>row.resultRevision!==index+1)) report.gaps.push('receipt-history-incomplete');
  const facts=new Map<string,ProgressFact>();
  const activeReview=(kind:string,entity:RevisionRef)=>map.invalidations.some(item=>item.status==='pending'&&item.targetKind===kind&&item.targetId===entity.id&&item.targetRevision===entity.revision);
  const add=(milestone:Milestone, identity:string, entity:RevisionRef, provenance:UserActionProvenance|ModelPresentation|undefined, current:boolean, evidence:ProgressFact['evidence']='observed', attainmentId=identity,sourceId?:string)=>{
    const presentation=provenance?.kind==='model-presentation';
    const action=provenance&&!presentation?provenance as UserActionProvenance:undefined;
    const turnId=presentation?(provenance as ModelPresentation).assistantTurnId:action?.turnId;
    const matching=receipts.filter(row=>sourceId?row.operationSourceId===sourceId:action&&row.confirmationProvenance?.actionId===action.actionId);
    const id=`${milestone}:${identity}`;
    const prior=facts.get(id);
    if(prior){prior.current ||= current;if(!prior.entities.includes(ref(entity)))prior.entities.push(ref(entity));return prior;}
    const fact:ProgressFact={id,milestone,attainmentId,evidence,current,recordedAt:provenance?iso(presentation?(provenance as ModelPresentation).presentedAt:action?.occurredAt):null,committedAt:earliest(matching.map(row=>iso(row.committedAt))),actualWorkOccurredAt:null,entities:[ref(entity)],operationSources:matching.map(row=>row.operationSourceId),...(turnId?{turnId,turnStatus:snapshot.turns.find(turn=>turn.turnId===turnId)?.status??'unknown'}:{}),...(action?{actionId:action.actionId}:{}),...(presentation?{delivery:'unknown' as const,presentationCompleted:true as const}:{})};
    facts.set(id,fact);return fact;
  };
  const presentationKey=(presentation:ModelPresentation)=>`${presentation.assistantTurnId}:${presentation.turnSequence}:${presentation.presentedAt}`;
  for(const why of map.foundation.whyRevisions){
    add('northStarPresented',presentationKey(why.presentation),why,why.presentation,why.status!=='superseded');
    if(why.confirmation)add('northStarConfirmed',why.confirmation.confirmedBy.actionId,why,why.confirmation.confirmedBy,why.status==='confirmed');
  }
  for(const set of map.pathSets){
    const valid=set.status!=='superseded'&&!activeReview('path-set',set);
    add('pathsPresented',presentationKey(set.presentation),set,set.presentation,valid);
    if(set.confirmation)add('pathChosen',set.confirmation.confirmedBy.actionId,set,set.confirmation.confirmedBy,set.status==='active'&&valid);
  }
  const activePath=selectActivePurposePath(map);
  const projectLineage=(project:CareerMap['projects'][number])=>{
    let root=project;const visited=new Set<string>();
    while(root.supersedesProjectId&&!visited.has(root.supersedesProjectId)){visited.add(root.id);const parent=map.projects.find(item=>item.id===root.supersedesProjectId);if(!parent)break;root=parent;}
    return ref(root);
  };
  for(const options of map.projectOptionSets){
    add('projectProposed',presentationKey(options.presentation),options,options.presentation,options.status==='suggested'&&Boolean(activePath&&ref(options.basisPath)===ref(activePath)));
  }
  const updates=new Map<string,ProgressReport['workUpdates'][number]>();
  for(const project of map.projects){
    const onPath=Boolean(activePath&&project.basisPath.id===activePath.id&&project.basisPath.revision===activePath.revision);
    const valid=onPath&&!activeReview('project',project)&&!['superseded','parked'].includes(project.agreementStatus);
    add('projectProposed',presentationKey(project.presentation),project,project.presentation,valid);
    if(project.confirmation)add('projectAccepted',project.confirmation.confirmedBy.actionId,project,project.confirmation.confirmedBy,valid&&project.agreementStatus==='accepted');
    const lineage=projectLineage(project);
    const corrections=project.workUpdates.filter(update=>update.correctsActionId);
    for(const update of project.workUpdates){
      const key=update.sourceId??update.action.actionId;
      const prior=updates.get(key);
      if(prior){if(!prior.entities.includes(ref(project)))prior.entities.push(ref(project));}
      else updates.set(key,{actionId:update.action.actionId,turnId:update.action.turnId,recordedAt:iso(update.action.occurredAt)??'unknown',status:update.status,...(update.correctsActionId?{correctsActionId:update.correctsActionId}:{}),entities:[ref(project)],operationSources:receipts.filter(row=>update.sourceId?row.operationSourceId===update.sourceId:row.confirmationProvenance?.actionId===update.action.actionId).map(row=>row.operationSourceId)});
      if(update.status==='not-started')continue;
      const work=add('workReported',key,project,update.action,valid&&project.workStatus!=='not-started','self-reported',lineage,update.sourceId);
      if(work)work.correctionActionIds=[...new Set([...(work.correctionActionIds??[]),...corrections.map(item=>item.action.actionId)])];
      if(update.status==='completed'){
        const completion=add('workCompleted',key,project,update.action,valid&&project.workStatus==='completed','self-reported',lineage,update.sourceId);
        if(completion)completion.correctionActionIds=corrections.map(item=>item.action.actionId);
      }
    }
  }
  report.workUpdates=[...updates.values()];
  for(const reflection of map.reflections){
    if(!reflection.evidence.length)continue;
    const project=map.projects.find(item=>ref(item)===ref(reflection.projectBasis));
    const valid=Boolean(project&&!activeReview('reflection',reflection)&&!activeReview('project',project)&&!['parked','superseded'].includes(project.agreementStatus));
    // Saved firsthand evidence is independent of whether the reflection has closed.
    const first=reflection.evidence.slice().sort((a,b)=>a.provenance.occurredAt.localeCompare(b.provenance.occurredAt))[0];
    const provenance=first.provenance.kind==='user-source'?undefined:first.provenance;
    const fact=add('reflectionSaved',ref(reflection),reflection,provenance,valid,'self-reported');
    if(fact&&!provenance)fact.recordedAt=iso(first.provenance.occurredAt);
  }
  for(const move of map.nextMoves){
    const choice=map.continueChoices.find(item=>ref(item)===ref(move.continueChoiceBasis));
    const reflection=choice&&map.reflections.find(item=>ref(item)===ref(choice.reflectionBasis));
    if(!reflection?.evidence.length)continue;
    const selectedMove=selectCurrentProjectLearning(map).move;
    const valid=facts.get(`reflectionSaved:${ref(reflection)}`)?.current===true&&selectedMove?.id===move.id&&selectedMove.revision===move.revision&&!activeReview('next-move',move);
    add('experienceBackedDecision',move.action.actionId,move,move.action,valid,'self-reported');
  }
  report.facts=[...facts.values()];
  for(const name of milestoneNames){
    const selected=report.facts.filter(fact=>fact.milestone===name);
    report.milestones[name]={historicalCount:new Set(selected.map(fact=>fact.attainmentId)).size,currentCount:new Set(selected.filter(fact=>fact.current).map(fact=>fact.attainmentId)).size,firstRecordedAt:earliest(selected.map(fact=>fact.recordedAt)),firstCommittedAt:earliest(selected.map(fact=>fact.committedAt))};
  }
  if(report.gaps.length)report.coverage='partial';
  return report;
}

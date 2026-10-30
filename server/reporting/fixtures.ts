/** Fictional deterministic input built through the production reducer. */
import { applyCareerMapOperation, createCareerMap, type CareerMap, type CareerMapOperation, type PurposePathInput } from '../../shared/career-map/index.js';
import type { ReportingSnapshot } from './source.js';
export const fixtureTime = (n: number) => new Date(Date.UTC(2030, 0, 1, 0, n)).toISOString();
export const fixtureAction = (n: number) => ({kind:'user-message' as const, actionId:`action-${n}`,turnId:`turn-${n}`,turnSequence:n,occurredAt:fixtureTime(n)});
export const fixturePresentation = (n: number) => ({kind:'model-presentation' as const,assistantTurnId:`turn-${n}`,turnSequence:n,completed:true as const,presentedAt:fixtureTime(n)});
export function fixtureCommit<T extends CareerMapOperation['type']>(map: CareerMap, type: T, payload: Extract<CareerMapOperation,{type:T}>['payload']): CareerMap {
 const result=applyCareerMapOperation(map,{type,payload,sourceId:`source-${map.revision+1}`,expectedRevision:map.revision,occurredAt:fixtureTime(map.revision+1)} as CareerMapOperation);
 if(result.status!=='committed') throw new Error(`Fictional operation failed: ${type}: ${result.status==='rejected'?JSON.stringify(result.error):result.status}`);
 return result.map;
}
export function proposedProjectFixture(): CareerMap {
 let map=createCareerMap('fictional-participant');
 map=fixtureCommit(map,'propose-why',{why:{id:'why',revision:1,statement:'Make knowledge useful',serves:'People making choices',pointOfView:'Clarity makes action possible'},presentation:fixturePresentation(1)});
 map=fixtureCommit(map,'confirm-why',{whyId:'why',whyRevision:1,action:fixtureAction(2)});
 const paths=[1,2,3].map(n=>({id:`path-${n}`,revision:1,name:`Explore work ${n}`,servesWhy:'Make knowledge useful',evidence:['Fictional prior work'],centralUnknown:'Does this work create energy?',projectPreview:'Make a useful sketch',practicalFit:'One short session'})) as [PurposePathInput,PurposePathInput,PurposePathInput];
 map=fixtureCommit(map,'propose-purpose-paths',{setId:'paths',setRevision:1,paths,presentation:fixturePresentation(3)});
 map=fixtureCommit(map,'select-purpose-path',{setId:'paths',setRevision:1,pathId:'path-1',pathRevision:1,action:fixtureAction(4)});
 return fixtureCommit(map,'propose-first-project',{project:{id:'project',revision:1,title:'A useful sketch',briefFormat:'simple-v1',learningGoal:'Notice energy while making',firstVersion:'One rough sketch',firstStep:'Choose a question'},presentation:fixturePresentation(5)});
}
export function fixtureSnapshot(map: CareerMap | null): ReportingSnapshot {
 return {observedAt:fixtureTime(59),map:map?{userId:map.explorerId,schemaVersion:3,revision:map.revision,document:map,repairRequired:false,createdAt:new Date(fixtureTime(0)),updatedAt:new Date(fixtureTime(map.revision))}:null,history:map?map.operationHistory.map((result,id)=>({id,userId:map.explorerId,operationSourceId:result.sourceId,operationType:result.operationType,payloadFingerprint:result.payloadFingerprint,baseRevision:result.resultRevision-1,resultRevision:result.resultRevision,result,confirmationProvenance:result.confirmationProvenance,moduleVersion:result.moduleVersion??'fixture',committedAt:new Date(result.committedAt)})):[],turns:[],conversationId:null};
}

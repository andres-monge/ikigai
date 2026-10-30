import {describe,it,expect} from 'vitest';
import {deriveParticipantProgress} from './progress.js';
import {fixtureSnapshot,proposedProjectFixture,fixtureCommit,fixtureAction,fixturePresentation} from './fixtures.js';
import {renderProgressMarkdown} from './render.js';
const derive=(map:ReturnType<typeof proposedProjectFixture>)=>deriveParticipantProgress('person',fixtureSnapshot(map));
describe('independent progress evidence',()=>{
 it('separates recorded proposal from acceptance and work',()=>{
  const result=derive(proposedProjectFixture());
  expect(result.milestones.projectProposed.historicalCount).toBe(1);
  expect(result.milestones.projectAccepted.historicalCount).toBe(0);
  expect(result.milestones.workReported.historicalCount).toBe(0);
  expect(result.milestones.northStarConfirmed.currentCount).toBe(1);
  expect(result.milestones.pathsPresented.currentCount).toBe(1);
  expect(result.facts.find(f=>f.milestone==='projectProposed')).toMatchObject({delivery:'unknown',evidence:'observed'});
  expect(JSON.stringify(result)).not.toContain('Make knowledge useful');
 });
 it('counts proceeding without assent and retracts current attainment with retained first report',()=>{
  let map=fixtureCommit(proposedProjectFixture(),'report-project-work',{projectId:'project',projectRevision:1,status:'in-progress',reportedActivity:'I made a sketch',action:fixtureAction(6)});
  expect(derive(map).milestones.projectAccepted.historicalCount).toBe(0);
  expect(derive(map).milestones.workReported.currentCount).toBe(1);
  map=fixtureCommit(map,'correct-project-work-status',{projectId:'project',projectRevision:1,latestActionId:'action-6',expectedStatus:'in-progress',status:'not-started',reportedActivity:'I had not started',action:fixtureAction(7)});
  const report=derive(map);
  expect(report.milestones.workReported).toMatchObject({historicalCount:1,currentCount:0,firstRecordedAt:'2030-01-01T00:06:00.000Z'});
  expect(report.workUpdates).toContainEqual(expect.objectContaining({status:'not-started',correctsActionId:'action-6'}));
 });
 it('corrects completion without losing historical completion',()=>{
  let map=fixtureCommit(proposedProjectFixture(),'report-project-work',{projectId:'project',projectRevision:1,status:'completed',reportedActivity:'I finished',action:fixtureAction(6)});
  map=fixtureCommit(map,'correct-project-work-status',{projectId:'project',projectRevision:1,latestActionId:'action-6',expectedStatus:'completed',status:'in-progress',reportedActivity:'I had more to do',action:fixtureAction(7)});
  expect(derive(map).milestones.workCompleted).toMatchObject({historicalCount:1,currentCount:0});
 });
 it('deduplicates copied presentations and keeps earlier path selections historical',()=>{
  let map=proposedProjectFixture();
  map=fixtureCommit(map,'report-project-work',{projectId:'project',projectRevision:1,status:'stopped',reportedActivity:'I tried and stopped',action:fixtureAction(6)});
  map=fixtureCommit(map,'open-reflection',{reflectionId:'reflection',revision:1,projectId:'project',projectRevision:1,action:fixtureAction(7)});
  map=fixtureCommit(map,'append-reflection-evidence',{reflectionId:'reflection',reflectionRevision:1,evidence:{id:'learning',revision:1,observation:'I did not enjoy arranging',signal:'resistance',interpretation:'Try something else',provenance:fixtureAction(8)}});
  map=fixtureCommit(map,'close-reflection',{reflectionId:'reflection',reflectionRevision:1,action:fixtureAction(9)});
  map=fixtureCommit(map,'record-continue-choice',{id:'choice',revision:1,reflectionId:'reflection',reflectionRevision:1,wantsToContinue:false,action:fixtureAction(10)});
  map=fixtureCommit(map,'record-next-move',{id:'move',revision:1,continueChoiceId:'choice',continueChoiceRevision:1,kind:'return-to-paths',action:fixtureAction(11)});
  map=fixtureCommit(map,'choose-parked-purpose-path',{sourceSetId:'paths',sourceSetRevision:1,pathId:'path-2',pathRevision:1,replacementSetId:'paths-copy',replacementSetRevision:1,action:fixtureAction(12)});
  const report=derive(map);
  expect(report.milestones.pathsPresented.historicalCount).toBe(1);
  expect(report.milestones.pathChosen.historicalCount).toBe(2);
  expect(report.milestones.pathChosen.currentCount).toBe(1);
 });
 it('deduplicates copied work while preserving entity revision references',()=>{
  let map=fixtureCommit(proposedProjectFixture(),'report-project-work',{projectId:'project',projectRevision:1,status:'in-progress',reportedActivity:'I made it',action:fixtureAction(6)});
  map=fixtureCommit(map,'propose-project-revision',{projectId:'project',projectRevision:1,replacement:{id:'project-revised',revision:1,title:'Revised sketch',briefFormat:'simple-v1',learningGoal:'Notice energy',firstVersion:'One sketch',firstStep:'Choose a question'},presentation:fixturePresentation(7)});
  const report=derive(map);
  expect(report.milestones.workReported.historicalCount).toBe(1);
  expect(report.workUpdates[0].entities).toHaveLength(2);
 });
 it('counts reflection before completion and linked next decision',()=>{
  let map=fixtureCommit(proposedProjectFixture(),'report-project-work',{projectId:'project',projectRevision:1,status:'stopped',reportedActivity:'I tried but stopped',action:fixtureAction(6)});
  map=fixtureCommit(map,'open-reflection',{reflectionId:'reflection',revision:1,projectId:'project',projectRevision:1,action:fixtureAction(7)});
  map=fixtureCommit(map,'append-reflection-evidence',{reflectionId:'reflection',reflectionRevision:1,evidence:{id:'learning',revision:1,observation:'I liked arranging',signal:'energy',interpretation:'Try arranging again',provenance:fixtureAction(8)}});
  map=fixtureCommit(map,'close-reflection',{reflectionId:'reflection',reflectionRevision:1,action:fixtureAction(9)});
  map=fixtureCommit(map,'record-continue-choice',{id:'choice',revision:1,reflectionId:'reflection',reflectionRevision:1,wantsToContinue:true,action:fixtureAction(10)});
  map=fixtureCommit(map,'record-next-move',{id:'move',revision:1,continueChoiceId:'choice',continueChoiceRevision:1,kind:'explore-further',action:fixtureAction(11)});
  expect(derive(map).milestones).toMatchObject({workCompleted:{historicalCount:0},reflectionSaved:{historicalCount:1},experienceBackedDecision:{historicalCount:1}});
 });
 it('counts repeated projects and selected options without inflating retry receipts',()=>{
  let map=fixtureCommit(proposedProjectFixture(),'report-project-work',{projectId:'project',projectRevision:1,status:'completed',reportedActivity:'I tried it',action:fixtureAction(6)});
  map=fixtureCommit(map,'open-reflection',{reflectionId:'reflection',revision:1,projectId:'project',projectRevision:1,action:fixtureAction(7)});
  map=fixtureCommit(map,'append-reflection-evidence',{reflectionId:'reflection',reflectionRevision:1,evidence:{id:'learning',revision:1,observation:'I liked arranging',signal:'energy',interpretation:'Try arranging again',provenance:fixtureAction(8)}});
  map=fixtureCommit(map,'close-reflection',{reflectionId:'reflection',reflectionRevision:1,action:fixtureAction(9)});
  map=fixtureCommit(map,'record-continue-choice',{id:'choice',revision:1,reflectionId:'reflection',reflectionRevision:1,wantsToContinue:true,action:fixtureAction(10)});
  map=fixtureCommit(map,'record-next-move',{id:'move',revision:1,continueChoiceId:'choice',continueChoiceRevision:1,kind:'explore-further',action:fixtureAction(11)});
  const projects=[1,2,3].map(n=>({id:`next-${n}`,revision:1,briefFormat:'simple-v1' as const,title:`Another sketch ${n}`,learningGoal:'Notice energy',firstVersion:'One sketch',firstStep:'Choose a question'})) as any;
  map=fixtureCommit(map,'propose-follow-on-projects',{setId:'next-options',setRevision:1,projects,presentation:fixturePresentation(12)});
  expect(derive(map).milestones.projectProposed.historicalCount).toBe(2);
  map=fixtureCommit(map,'select-follow-on-project',{setId:'next-options',setRevision:1,projectId:'next-1',projectRevision:1,action:fixtureAction(13)});
  map=fixtureCommit(map,'update-project-work-status',{projectId:'next-1',projectRevision:1,status:'in-progress',reportedActivity:'I started another',action:fixtureAction(14)});
  const snapshot=fixtureSnapshot(map);snapshot.history.push(snapshot.history[0]);
  const report=deriveParticipantProgress('person',snapshot);
  expect(report.milestones.projectProposed.historicalCount).toBe(2);
  expect(report.milestones.projectAccepted.historicalCount).toBe(1);
  expect(report.milestones.workReported).toMatchObject({historicalCount:2,currentCount:1});
  expect(report.milestones.workCompleted).toMatchObject({historicalCount:1,currentCount:0});
 });
 it('flags empty versus invalid/repair and missing historical receipt timestamps',()=>{
  expect(deriveParticipantProgress('person',fixtureSnapshot(null)).coverage).toBe('checked-empty');
  const snapshot=fixtureSnapshot(proposedProjectFixture());snapshot.map!.repairRequired=true;snapshot.history=[];
  const report=deriveParticipantProgress('person',snapshot);
  expect(report.coverage).toBe('partial');expect(report.gaps).toContain('map-repair-required');
  expect(report.facts[0].committedAt).toBeNull();
  snapshot.map!.document={} as never;
  expect(deriveParticipantProgress('person',snapshot).coverage).toBe('unavailable');
 });
 it('keeps failed proposal delivery unknown and later guidance activity for manual review',()=>{
  const snapshot=fixtureSnapshot(proposedProjectFixture());
  const turn=(id:string,time:string,status:'completed'|'failed')=>({turnId:id,userId:'fictional-participant',clientMessageId:id,requestFingerprint:'secret',origin:'agent-turn' as const,leaseId:'secret',status,terminalResult:{providerResponseId:'secret'},createdAt:new Date(time),updatedAt:new Date(time),terminalAt:new Date(time)});
  snapshot.turns=[turn('turn-5','2030-01-01T00:05:00Z','failed'),turn('later-guidance','2030-01-03T00:05:00Z','completed')];
  const report=deriveParticipantProgress('person',snapshot);
  expect(report.facts.find(f=>f.milestone==='projectProposed')).toMatchObject({turnStatus:'failed',delivery:'unknown'});
  expect(report.activity.laterTurnCandidates).toHaveLength(1);
  expect(JSON.stringify(report)).not.toContain('secret');
  expect(renderProgressMarkdown([report])).toContain('manual review');
 });
});

import { describe, expect, it } from 'vitest';
import pendingV2 from './test-fixtures/legacy-pending-v2.json';
import proofV2 from './test-fixtures/legacy-proof-v2.json';
import {
  applyCareerMapOperation,
  createCareerMap,
  deriveMethodCheckpoint,
  type CareerMap,
  type CareerMapOperation,
  type PurposePathInput,
  selectCurrentPathFocus,
  readCareerMap,
} from './index';

const at = (n: number) => `2026-08-31T11:${String(n).padStart(2, '0')}:00.000Z`;
const presentation = (n: number) => ({ kind: 'model-presentation' as const, assistantTurnId: `a-${n}`, turnSequence: n, completed: true as const, presentedAt: at(n) });
const action = (n: number) => ({ kind: 'user-message' as const, actionId: `u-${n}`, turnId: `u-${n}`, turnSequence: n, occurredAt: at(n) });
const framingText = "The point of a project is not to succeed, it's to learn if it's something you'd want to pursue. Think of projects like dating: you start with something chill and low commitment, then invest more only if each date makes you want another.";
const acceptancePhrase = 'I explicitly accept this Path Project.';
const acceptanceQuestion = `Will you explicitly accept this Path Project by replying “${acceptancePhrase}”?`;
const framing = (projectId: string, n: number) => ({ projectId, projectRevision: 1, locale: 'en', framingText, acceptancePhrase, acceptanceQuestion, moduleVersion: '1.1.1', presentation: presentation(n) });
const delivery = (projectId: string, n: number) => ({ projectId, projectRevision: 1, assistantText: `${framingText}\n\n${acceptanceQuestion}`, presentation: presentation(n) });
const paths: [PurposePathInput, PurposePathInput, PurposePathInput] = [1, 2, 3].map((n) => ({
  id: `path-${n}`, revision: 1, name: `Path ${n}`, servesWhy: `Serve the Why through approach ${n}`,
  possibility: `Outcome ${n}`, evidence: [`Evidence ${n}`], centralUnknown: `Unknown ${n}`,
  projectPreview: `Project ${n}`, practicalFit: `Fit ${n}`,
})) as [PurposePathInput, PurposePathInput, PurposePathInput];
const project = (id = 'project-1', revision = 1) => ({
  id,
  revision,
  title: 'Build an aid',
  outcome: 'One person uses it',
  audience: 'A real colleague',
  whyWanted: 'Reduce decision waste',
  learningGoal: 'Learn whether iteration pulls me in',
  firstVersion: 'One-page prototype',
  firstStep: 'Interview the colleague',
  decisionQuestion: 'Do I want another iteration?',
  evidenceCue: 'Notice voluntary pull',
});

function op<T extends CareerMapOperation['type']>(map: CareerMap, type: T, payload: Extract<CareerMapOperation, { type: T }>['payload']): Extract<CareerMapOperation, { type: T }> {
  return { type, sourceId: `${type}-${map.revision + 1}`, expectedRevision: map.revision, occurredAt: at(map.revision + 1), payload } as Extract<CareerMapOperation, { type: T }>;
}

function commit<T extends CareerMapOperation['type']>(map: CareerMap, type: T, payload: Extract<CareerMapOperation, { type: T }>['payload']): CareerMap {
  if (type !== 'deliver-first-project-framing') expect(deriveMethodCheckpoint(map).availableOperations, `advertised ${type}`).toContain(type);
  const result = applyCareerMapOperation(map, op(map, type, payload));
  expect(result.status).toBe('committed');
  return result.map;
}

function withSelectedPath(explorerId: string): CareerMap {
  let map = createCareerMap(explorerId);
  map = commit(map, 'propose-why', { why: { id: 'why-1', revision: 1, statement: 'Make difficult choices actionable.', serves: 'People in transition', pointOfView: 'Clarity must change action' }, presentation: presentation(1) });
  map = commit(map, 'confirm-why', { whyId: 'why-1', whyRevision: 1, action: action(2) });
  map = commit(map, 'propose-purpose-paths', { setId: 'set-1', setRevision: 1, paths, presentation: presentation(3) });
  return commit(map, 'select-purpose-path', { setId: 'set-1', setRevision: 1, pathId: 'path-1', pathRevision: 1, action: action(4) });
}

const simple = (id:string, relationship: 'linked'|'unrelated' = 'linked') => ({id,revision:1,briefFormat:'simple-v1' as const,relationship,title:'Build one useful aid',learningGoal:'Notice energy while iterating',firstVersion:'One rough usable page',firstStep:'Sketch one page'});
function accepted(relationship: 'linked'|'unrelated' = 'linked') {
  let map=withSelectedPath('journey');
  map=commit(map,'propose-first-project',{project:simple('p1',relationship),presentation:presentation(5)});
  map=commit(map,'present-first-project-framing',{projectId:'p1',projectRevision:1,locale:'en',framingFormat:'natural-v1',framingText:'Try this and notice what you learn.',moduleVersion:'2',presentation:presentation(6)});
  map=commit(map,'deliver-first-project-framing',{projectId:'p1',projectRevision:1,assistantText:'Here is a manageable start. Try this and notice what you learn. Let me know how it feels.',presentation:presentation(6)});
  return commit(map,'accept-first-project',{projectId:'p1',projectRevision:1,action:action(7)});
}
function reflected(map:CareerMap,id='r1',projectId='p1',seq=8) {
  expect(deriveMethodCheckpoint(map).availableOperations).toContain('open-reflection');
  map=commit(map,'open-reflection',{reflectionId:id,revision:1,projectId,projectRevision:1,action:action(seq)});
  map=commit(map,'append-reflection-evidence',{reflectionId:id,reflectionRevision:1,evidence:{id:`e-${id}`,revision:1,observation:'I kept returning to the work.',signal:'voluntary-pull',interpretation:'Try another small test.',provenance:action(seq+1)}});
  return commit(map,'close-reflection',{reflectionId:id,reflectionRevision:1,action:action(seq+2)});
}
function resolveAll(map:CareerMap) {
  while(deriveMethodCheckpoint(map).review) {
    const review=deriveMethodCheckpoint(map).review!;
    map=commit(map,'resolve-basis-review',{targetKind:review.targetKind,targetId:review.targetId,targetRevision:review.targetRevision,resolution:'reaffirmed',action:action(30)});
  }
  return map;
}
describe('repeating learning MVP', () => {
  it('saves explicit focus without a peer and leaves guidance available', () => {
    let map = withSelectedPath('focus');
    map = commit(map, 'propose-first-project', { project: { id:'simple', revision:1, briefFormat:'simple-v1', title:'Try making a useful aid', learningGoal:'Notice whether iteration pulls me back', firstVersion:'One rough usable page', firstStep:'Sketch the page' }, presentation:presentation(5) });
    map = commit(map, 'present-first-project-framing', framing('simple', 6));
    map = commit(map, 'deliver-first-project-framing', delivery('simple', 6));
    map = commit(map, 'accept-first-project', {projectId:'simple',projectRevision:1,action:action(7)});
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('record-path-focus');
    map = commit(map, 'record-path-focus', {id:'focus-1',revision:1,pathId:'path-1',pathRevision:1,action:action(8)});
    expect(map.pathFocusCommitments).toHaveLength(1);
    expect(map.commitmentIntent).toBeUndefined();
    expect(selectCurrentPathFocus(map)?.id).toBe('focus-1');
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');
  });
  it('walks two learning loops, immutable replacement, selection, and guidance without old reflection stealing the next project', () => {
    let map=reflected(accepted());
    map=commit(map,'record-continue-choice',{id:'c1',revision:1,reflectionId:'r1',reflectionRevision:1,wantsToContinue:true,action:action(11)});
    map=commit(map,'record-next-move',{id:'n1',revision:1,continueChoiceId:'c1',continueChoiceRevision:1,kind:'explore-further',action:action(12)});
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('propose-follow-on-projects');
    map=commit(map,'propose-follow-on-projects',{setId:'options',setRevision:1,projects:[simple('p2'),simple('p3'),simple('p4')],presentation:presentation(13)});
    const siblings=structuredClone(map.projectOptionSets[0].projects.slice(1));
    map=commit(map,'replace-follow-on-project',{sourceSetId:'options',sourceSetRevision:1,replacedProjectId:'p2',replacementSetId:'options2',replacementSetRevision:1,replacement:simple('p5'),presentation:presentation(14)});
    expect(map.projectOptionSets[0].projects.slice(1)).toEqual(siblings);
    expect(map.projectOptionSets[1].projects.slice(1)).toEqual(siblings);
    const sameTurn=applyCareerMapOperation(map,op(map,'select-follow-on-project',{setId:'options2',setRevision:1,projectId:'p3',projectRevision:1,action:action(14)}));
    expect(sameTurn.status).toBe('rejected');
    map=commit(map,'select-follow-on-project',{setId:'options2',setRevision:1,projectId:'p3',projectRevision:1,action:action(15)});
    expect(map.projects.find(p=>p.id==='p1')?.agreementStatus).toBe('parked');
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');
    map=reflected(map,'r2','p3',16);
    map=commit(map,'record-continue-choice',{id:'c2',revision:1,reflectionId:'r2',reflectionRevision:1,wantsToContinue:true,action:action(19)});
    map=commit(map,'record-next-move',{id:'n2',revision:1,continueChoiceId:'c2',continueChoiceRevision:1,kind:'commit-provisionally',action:action(20)});
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');
    expect(selectCurrentPathFocus(map)?.basisNextMove?.id).toBe('n2');
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('request-new-project');
    map=commit(map,'request-new-project',{action:action(21)});
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('propose-follow-on-projects');
    map=commit(map,'propose-follow-on-projects',{setId:'options3',setRevision:1,projects:[simple('p6'),simple('p7'),simple('p8')],presentation:presentation(22)});
    expect(map.projectOptionSets.at(-1)?.basisAction?.sourceId).toMatch(/^request-new-project/);
  });

  it('uses unrelated project scope, disallows a reflection-backed path commitment, and permits independent focus', () => {
    let map=reflected(accepted('unrelated'));
    const wrongScope=applyCareerMapOperation(map,op(map,'record-continue-choice',{id:'bad',revision:1,reflectionId:'r1',reflectionRevision:1,wantsToContinue:true,scope:'path',action:action(11)}));
    expect(wrongScope.status).toBe('rejected');
    map=commit(map,'record-continue-choice',{id:'c1',revision:1,reflectionId:'r1',reflectionRevision:1,wantsToContinue:true,action:action(11)});
    expect(map.continueChoices[0].scope).toBe('project');
    const noCommit=applyCareerMapOperation(map,op(map,'record-next-move',{id:'bad',revision:1,continueChoiceId:'c1',continueChoiceRevision:1,kind:'commit-provisionally',action:action(12)}));
    expect(noCommit.status).toBe('rejected');
    map=commit(map,'record-path-focus',{id:'independent',revision:1,pathId:'path-1',pathRevision:1,action:action(12)});
    expect(selectCurrentPathFocus(map)?.id).toBe('independent');
    map=commit(map,'record-next-move',{id:'n1',revision:1,continueChoiceId:'c1',continueChoiceRevision:1,kind:'explore-further',action:action(13)});
    map=commit(map,'propose-follow-on-projects',{setId:'u-options',setRevision:1,projects:[simple('u1','unrelated'),simple('u2','unrelated'),simple('u3')],presentation:presentation(14)});
    expect(map.foundation.whyRevisions[0].statement).toBe('Make difficult choices actionable.');
  });

  it('preserves unfinished reflection and current project on explicit direction change, offers singular N+1 before a completed loop', () => {
    let map=accepted();
    map=commit(map,'open-reflection',{reflectionId:'empty',revision:1,projectId:'p1',projectRevision:1,action:action(8)});
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('open-path-revision-focus');
    map=commit(map,'open-path-revision-focus',{reason:'Try another direction',action:action(9)});
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('choose-parked-purpose-path');
    map=commit(map,'choose-parked-purpose-path',{sourceSetId:'set-1',sourceSetRevision:1,replacementSetId:'set-2',replacementSetRevision:1,pathId:'path-2',pathRevision:1,action:action(10)});
    expect(map.reflections[0]).toMatchObject({status:'open',evidence:[]});
    expect(map.projects[0].agreementStatus).toBe('accepted');
    map=resolveAll(map);
    expect(deriveMethodCheckpoint(map).availableOperations).toContain('propose-first-project');
    map=commit(map,'propose-first-project',{project:simple('new-path'),presentation:presentation(31)});
    expect(map.projects.at(-1)?.number).toBe(2);
    expect(map.projects.at(-1)?.basisAction?.sourceId).toMatch(/^choose-parked-purpose-path/);
    map=commit(map,'present-first-project-framing',{projectId:'new-path',projectRevision:1,locale:'en',framingFormat:'natural-v1',framingText:'A small new direction test.',moduleVersion:'2',presentation:presentation(32)});
    map=commit(map,'deliver-first-project-framing',{projectId:'new-path',projectRevision:1,assistantText:'A small new direction test.',presentation:presentation(32)});
    map=commit(map,'accept-first-project',{projectId:'new-path',projectRevision:1,action:action(33)});
    expect(map.projects[0].agreementStatus).toBe('parked');
    expect(deriveMethodCheckpoint(map).module).toBe('guide-path-project');
  });

  it('does not auto-confirm old intent and preserves proof-backed singleton when explicit focus is saved', () => {
    let pending=readCareerMap(pendingV2);
    expect(pending.pathFocusCommitments).toEqual([]);
    expect(deriveMethodCheckpoint(pending).module).toBe('guide-path-project');
    expect(deriveMethodCheckpoint(pending).availableOperations).toContain('confirm-legacy-path-focus');
    pending=commit(pending,'confirm-legacy-path-focus',{id:'confirmed-now',revision:1,intentId:pending.commitmentIntent!.id,intentRevision:1,action:action(25)});
    expect(selectCurrentPathFocus(pending)?.id).toBe('confirmed-now');
    let proof=readCareerMap(proofV2);
    const singleton=structuredClone(proof.provisionalCommitment);
    const proofs=structuredClone(proof.proofRevisions);
    proof=commit(proof,'record-path-focus',{id:'new-focus',revision:1,pathId:'path-2',pathRevision:1,action:action(25)});
    expect(proof.provisionalCommitment).toEqual(singleton);
    expect(proof.proofRevisions).toEqual(proofs);
    expect(deriveMethodCheckpoint(proof).module).toBe('guide-path-project');
  });

  it('corrects open reflection append-only and keeps closed choice snapshots unchanged', () => {
    let map=accepted();
    map=commit(map,'open-reflection',{reflectionId:'r1',revision:1,projectId:'p1',projectRevision:1,action:action(8)});
    map=commit(map,'append-reflection-evidence',{reflectionId:'r1',reflectionRevision:1,evidence:{id:'e1',revision:1,observation:'I felt drained.',signal:'energy',interpretation:'Adjust scope.',provenance:action(9)}});
    map=commit(map,'revise-reflection-evidence',{reflectionId:'r1',reflectionRevision:1,newReflectionRevision:2,supersedesEvidenceId:'e1',evidence:{id:'e2',revision:1,supersedesEvidenceId:'e1',observation:'I meant the setup drained me.',signal:'constraint',interpretation:'The work remains uncertain.',provenance:action(10)}});
    expect(map.reflections[0].evidence).toHaveLength(1);
    expect(map.reflections[1].evidence).toHaveLength(2);
    map=commit(map,'close-reflection',{reflectionId:'r1',reflectionRevision:2,action:action(11)});
    map=commit(map,'record-continue-choice',{id:'c1',revision:1,reflectionId:'r1',reflectionRevision:2,wantsToContinue:true,action:action(12)});
    const choice=structuredClone(map.continueChoices[0]);
    map=commit(map,'revise-reflection-evidence',{reflectionId:'r1',reflectionRevision:2,newReflectionRevision:3,supersedesEvidenceId:'e2',evidence:{id:'e3',revision:1,supersedesEvidenceId:'e2',observation:'Actually I need another test.',signal:'learning-question',interpretation:'Stay uncertain.',provenance:action(13)}});
    expect(map.continueChoices[0]).toEqual(choice);
  });

  it('keeps a pending assent parked after direction focus and resumes unfinished reflection without writing on reload', () => {
    let map=withSelectedPath('pending');
    map=commit(map,'propose-first-project',{project:simple('waiting'),presentation:presentation(5)});
    map=commit(map,'open-path-revision-focus',{reason:'Discuss a different direction first',action:action(6)});
    expect(map.projects[0].agreementStatus).toBe('parked');
    map=commit(map,'close-focus',{action:action(7)});
    expect(deriveMethodCheckpoint(map).pendingDecision).toBeNull();
    let work=accepted();
    work=commit(work,'open-reflection',{reflectionId:'unfinished',revision:1,projectId:'p1',projectRevision:1,action:action(8)});
    work=commit(work,'close-focus',{action:action(9)});
    const saved=structuredClone(work);
    const loaded=readCareerMap(JSON.parse(JSON.stringify(work)));
    expect(deriveMethodCheckpoint(loaded).module).toBe('guide-path-project');
    expect(loaded).toEqual(saved);
    expect(loaded.reflections[0].status).toBe('open');
  });

  it('rejects stale reflection corrections and project-content identity reuse without changing history', () => {
    let map=accepted();
    map=commit(map,'open-reflection',{reflectionId:'r1',revision:1,projectId:'p1',projectRevision:1,action:action(8)});
    map=commit(map,'append-reflection-evidence',{reflectionId:'r1',reflectionRevision:1,evidence:{id:'e1',revision:1,observation:'The start felt difficult.',signal:'execution',interpretation:'Try a smaller step.',provenance:action(9)}});
    map=commit(map,'revise-reflection-evidence',{reflectionId:'r1',reflectionRevision:1,newReflectionRevision:2,supersedesEvidenceId:'e1',evidence:{id:'e2',revision:1,supersedesEvidenceId:'e1',observation:'Only setup felt difficult.',signal:'constraint',interpretation:'Work still uncertain.',provenance:action(10)}});
    const stale=applyCareerMapOperation(map,op(map,'append-reflection-evidence',{reflectionId:'r1',reflectionRevision:1,evidence:{id:'late',revision:1,observation:'Late old snapshot.',signal:'other',interpretation:'Do not overwrite.',provenance:action(11)}}));
    expect(stale.status).toBe('rejected');
    expect(stale.map).toEqual(map);
    map=commit(map,'close-focus',{action:action(12)});
    const changed=applyCareerMapOperation(map,op(map,'propose-project-revision',{projectId:'p1',projectRevision:1,replacement:{...simple('p1'),title:'Changed same identity'},presentation:presentation(13)}));
    expect(changed.status).toBe('rejected');
    expect(changed.map).toEqual(map);
  });

  it('rejects focus identity aliases of a preserved legacy singleton and forged stored focus authority', () => {
    const map=readCareerMap(proofV2);
    const singleton=map.provisionalCommitment!;
    const alias=applyCareerMapOperation(map,op(map,'record-path-focus',{id:singleton.id,revision:singleton.revision,pathId:'path-2',pathRevision:1,action:action(25)}));
    expect(alias.status).toBe('rejected');
    expect(alias.map).toEqual(map);
    const focused=commit(map,'record-path-focus',{id:'safe-focus',revision:1,pathId:'path-2',pathRevision:1,action:action(26)});
    const forged=structuredClone(focused);
    forged.pathFocusCommitments[0].action.actionId='invented-user-assent';
    expect(() => readCareerMap(forged)).toThrow();
  });

});

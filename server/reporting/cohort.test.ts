import { describe, expect, it } from 'vitest';
import { parseCohort, classifyParticipant, requireReviewParticipant } from './cohort';
const manifest = { version: 1, participants: [{key:'new',stage:'invited',stageAt:'2026-10-30T00:00:00Z',source:'invitation'},{key:'qa',stage:'enabled',stageAt:'2026-10-30T00:00:00Z',source:'test',userId:'qa-id'}],exclusions:[{userId:'qa-id',role:'qa',source:'operator'}] };
describe('private cohort',()=>{
 it('retains unlinked and visibly excluded entries',()=>{const c=parseCohort(manifest);expect(c.participants.map(p=>classifyParticipant(c,p))).toEqual(['unlinked','excluded-qa']);expect(requireReviewParticipant(c,'qa').userId).toBe('qa-id');});
 it('rejects duplicate identity bindings',()=>{expect(()=>parseCohort({...manifest,participants:[...manifest.participants,{...manifest.participants[1],key:'other'}]})).toThrow();});
 it('never reviews founder content',()=>{const c=parseCohort({...manifest,exclusions:[{userId:'qa-id',role:'founder',source:'operator'}]});expect(()=>requireReviewParticipant(c,'qa')).toThrow(/founder/i);});
});

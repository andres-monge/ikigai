import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { retrieveConversation, renderConversationMarkdown } from './conversations';
import type { ReportingSnapshot } from './source';

const message = (id: string, role: 'user'|'assistant', text: string) => ({ id, type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] });
const snapshot = (turns: unknown[] = [], conversationId: string|null = 'conv-secret'): ReportingSnapshot => ({ observedAt: '2026-10-30T12:00:00Z', map: null, history: [], turns: turns as ReportingSnapshot['turns'], conversationId });
const turn = (terminalResult: unknown = {}, status = 'failed') => ({turnId:'turn-local', origin:'agent-turn', status, createdAt:new Date('2026-10-30T12:00:00Z'),terminalAt:new Date('2026-10-30T12:01:00Z'),terminalResult});
const digest = (s: string) => createHash('sha256').update(s).digest('hex');

describe('private conversation review', () => {
  it('reads every ascending page, de-duplicates boundaries and exports stable opaque source references', async () => {
    const listItems = vi.fn().mockResolvedValueOnce({data:[message('msg-private-one','user','Hello')],hasMore:true,lastId:'cursor-secret'})
      .mockResolvedValueOnce({data:[message('msg-private-one','user','Hello'),message('msg-private-two','assistant','Welcome')],hasMore:false});
    const report = await retrieveConversation({participantKey:'fictional',snapshot:snapshot(),client:{listItems}});
    expect(listItems).toHaveBeenNthCalledWith(2,expect.objectContaining({after:'cursor-secret',order:'asc',limit:100}));
    expect(report.complete).toBe(true); expect(report.messages.map(x=>x.text)).toEqual(['Hello','Welcome']);
    const output=JSON.stringify(report); expect(output).not.toMatch(/conv-secret|msg-private|cursor-secret/);
    const repeated=await retrieveConversation({participantKey:'fictional',snapshot:snapshot(),client:{listItems:vi.fn().mockResolvedValue({data:[message('msg-private-one','user','Hello')],hasMore:false})}});
    expect(repeated.messages[0].source).toBe(report.messages[0].source);
    expect(renderConversationMarkdown(report)).toContain('Hello');
  });
  it('retains a prefix and sanitized failure when a later page fails', async()=>{
    const listItems=vi.fn().mockResolvedValueOnce({data:[message('one','user','Question')],hasMore:true,lastId:'next'}).mockRejectedValue(new Error('api-key-private'));
    const report=await retrieveConversation({participantKey:'fictional',snapshot:snapshot(),client:{listItems}});
    expect(report.pagination).toBe('partial');expect(report.complete).toBe(false);expect(report.messages[0].text).toBe('Question');expect(JSON.stringify(report)).not.toContain('api-key-private');
  });
  it.each([true,false])('returns a retrieved prefix when a later page stalls (honors abort: %s)',async(honorsAbort)=>{
    vi.useFakeTimers();
    try {
      const listItems=vi.fn().mockResolvedValueOnce({data:[message('one','user','Saved prefix')],hasMore:true,lastId:'next'})
        .mockImplementationOnce(({abortSignal}:{abortSignal?:AbortSignal})=>new Promise((_,reject)=>{
          if(honorsAbort)abortSignal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
        }));
      const pending=retrieveConversation({participantKey:'fictional',snapshot:snapshot(),client:{listItems}});
      await vi.advanceTimersByTimeAsync(10_001);
      expect(listItems.mock.calls[1][0].abortSignal).toBeInstanceOf(AbortSignal);
      expect(listItems.mock.calls[1][0].abortSignal.aborted).toBe(true);
      const report=await pending;
      expect(report.pagination).toBe('partial');expect(report.complete).toBe(false);
      expect(report.messages.map(item=>item.text)).toEqual(['Saved prefix']);
      expect(report.gaps).toContainEqual({source:'fictional',reason:'provider-read-failed'});
      expect(vi.getTimerCount()).toBe(0);
    } finally {vi.useRealTimers();}
  });
  it('returns the prefix promptly when the caller cancels a stalled page',async()=>{
    vi.useFakeTimers();
    try {
      const controller=new AbortController();
      const listItems=vi.fn().mockResolvedValueOnce({data:[message('one','user','Saved prefix')],hasMore:true,lastId:'next'})
        .mockImplementationOnce(()=>new Promise(()=>{}));
      const pending=retrieveConversation({participantKey:'fictional',snapshot:snapshot(),client:{listItems},abortSignal:controller.signal});
      await vi.advanceTimersByTimeAsync(0);controller.abort();
      const report=await pending;
      expect(report.pagination).toBe('partial');expect(report.messages[0].text).toBe('Saved prefix');
      expect(report.gaps).toContainEqual({source:'fictional',reason:'cancelled'});
      expect(listItems.mock.calls[1][0].abortSignal.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
    }finally{vi.useRealTimers();}
  });
  it.each(['missing','repeating','malformed'])('reports %s pagination explicitly',async(kind)=>{
    const listItems=vi.fn().mockResolvedValue(kind==='malformed'?{data:'bad',hasMore:false}:{data:[],hasMore:true,...(kind==='repeating'?{lastId:'same'}:{})});
    const report=await retrieveConversation({participantKey:'fictional',snapshot:snapshot(),client:{listItems}});
    expect(report.complete).toBe(false);expect(report.gaps.length).toBeGreaterThan(0);expect(listItems.mock.calls.length).toBeLessThanOrEqual(2);
  });
  it('allows an empty page with a progressing cursor and a final empty page',async()=>{
    const listItems=vi.fn().mockResolvedValueOnce({data:[],hasMore:true,lastId:'next'}).mockResolvedValueOnce({data:[],hasMore:false});
    expect((await retrieveConversation({participantKey:'fictional',snapshot:snapshot(),client:{listItems}})).complete).toBe(true);
  });
  it('keeps failed-turn user and partial assistant text without display recovery or browser text limits',async()=>{
    const text='x'.repeat(120_000);
    const pages=[message('user','user','I tried'),{id:'assistant',type:'message',role:'assistant',content:Array.from({length:40},()=>({type:'output_text',text}))}];
    const report=await retrieveConversation({participantKey:'fictional',snapshot:snapshot([turn({displayRecovery:{userTextDigest:digest('I tried')}})]),client:{listItems:vi.fn().mockResolvedValue({data:pages,hasMore:false})}});
    expect(report.messages[0].turn?.status).toBe('failed');expect(report.messages[1].text).toBe(text.repeat(40));expect(report.messages[1].delivery).toBe('unknown');
  });
  it('retains unbound failed-attempt text while recording unavailable turn attribution',async()=>{
    const report=await retrieveConversation({participantKey:'fictional',snapshot:snapshot([turn()]),client:{listItems:vi.fn().mockResolvedValue({data:[message('user','user','An interrupted question'),message('assistant','assistant','Partial answer')],hasMore:false})}});
    expect(report.messages.map(x=>x.text)).toEqual(['An interrupted question','Partial answer']);
    expect(report.messages.every(x=>x.context==='unbound-review-context')).toBe(true);
    expect(report.contentCoverage).toBe('partial');
  });
  it('keeps canonical browser presentation alongside all original provider text',async()=>{
    const report=await retrieveConversation({participantKey:'fictional',snapshot:snapshot([turn({kind:'completed',canonicalPurposePathsOffer:true,displayProjection:{userItemId:'u',assistantItemIds:['a','b']}},'completed')]),client:{listItems:vi.fn().mockResolvedValue({data:[message('u','user','Show paths'),message('a','assistant','Original first segment'),message('b','assistant','Original second segment')],hasMore:false})}});
    expect(report.messages[2].browserPresentation).toMatch(/Here are three possible paths/);
    expect(report.messages[1].context).toBe('provider-review-context');
    expect(report.messages[2].text).toBe('Original second segment');
  });
  it('excludes server internal markers, reasoning and tools without dropping safe unbound conversation',async()=>{
    const data=[message('internal','user','Refresh\n'+JSON.stringify({version:1,marker:'server-marker',secret:'hidden'})),{id:'reason',type:'reasoning',summary:'hidden'}, {id:'tool',type:'function_call',arguments:'hidden'},message('safe','user','My own message')];
    const report=await retrieveConversation({participantKey:'fictional',snapshot:snapshot([turn({internalContextMarkers:['server-marker']})]),client:{listItems:vi.fn().mockResolvedValue({data,hasMore:false})}});
    expect(report.messages.map(x=>x.text)).toEqual(['My own message']);expect(JSON.stringify(report)).not.toContain('hidden');expect(report.excludedInternalItems).toBe(1);
  });
  it('separates completed pagination from incomplete content and never exports unrecognized marked context',async()=>{
    const data=[message('internal','user','Refresh\n'+JSON.stringify({version:1,marker:'unrecognized'})),{id:'image',type:'message',role:'user',content:[{type:'input_image',image_url:'private'}]}];
    const report=await retrieveConversation({participantKey:'fictional',snapshot:snapshot(),client:{listItems:vi.fn().mockResolvedValue({data,hasMore:false})}});
    expect(report.pagination).toBe('complete');expect(report.contentCoverage).toBe('partial');expect(report.complete).toBe(false);expect(report.messages).toEqual([]);expect(JSON.stringify(report)).not.toContain('unrecognized');
  });
  it('distinguishes missing mapping with prior turns, unavailable provider and checked-empty',async()=>{
    const listItems=vi.fn();
    const missing=await retrieveConversation({participantKey:'fictional',snapshot:snapshot([turn()],null),client:{listItems}});
    expect(missing.pagination).toBe('missing-mapping');expect(missing.contentCoverage).toBe('unknown');expect(listItems).not.toHaveBeenCalled();
    const unavailable=await retrieveConversation({participantKey:'fictional',snapshot:snapshot(),client:{listItems:vi.fn().mockRejectedValue(new Error('no'))}});
    expect(unavailable.pagination).toBe('unavailable');
    const empty=await retrieveConversation({participantKey:'fictional',snapshot:snapshot(),client:{listItems:vi.fn().mockResolvedValue({data:[],hasMore:false})}});
    expect(empty.status).toBe('checked-empty');
  });
  it('cancellation returns partial evidence, and missing mapped items remain source-linked gaps',async()=>{
    const controller=new AbortController();
    const listItems=vi.fn().mockImplementation(async()=>{controller.abort();return {data:[message('one','user','Hello')],hasMore:true,lastId:'next'};});
    const report=await retrieveConversation({participantKey:'fictional',snapshot:snapshot([turn({displayProjection:{userItemId:'absent',assistantItemIds:[]}})]),client:{listItems},abortSignal:controller.signal});
    expect(report.complete).toBe(false);expect(report.messages).toHaveLength(1);expect(report.gaps.some(x=>x.reason==='bound-message-unavailable')).toBe(true);
  });
});

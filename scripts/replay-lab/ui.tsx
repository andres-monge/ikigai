import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import type { Candidate, CandidateKind, Checkpoint, Feedback, Job, LabState, PathCard } from './types';

async function api<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(url, body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Local request failed.');
  return result;
}
const short = (version: string) => version.slice(0, 10);
function Markdown({ text }: { text?: string }) {
  return <div className="markdown"><ReactMarkdown skipHtml components={{ img: () => null, a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{text || ''}</ReactMarkdown></div>;
}
function Raw({ value }: { value: unknown }) { return <pre className="raw">{JSON.stringify(value, null, 2)}</pre>; }
function Detail({ title, children }: { title: string; children: React.ReactNode }) { return <details><summary>{title}</summary><div className="detail-body">{children}</div></details>; }
function Cards({ cards }: { cards?: PathCard[] }) {
  const fields = [['servesWhy', 'How it serves the North Star'], ['centralUnknown', 'What you need to learn'], ['projectPreview', 'First project']];
  const renderValue = (value: unknown): React.ReactNode => {
    if (typeof value === 'string') return <Markdown text={value} />;
    if (Array.isArray(value)) return <ul>{value.map((item, index) => <li key={index}>{renderValue(item)}</li>)}</ul>;
    if (value && typeof value === 'object') return <dl>{Object.entries(value).map(([key, item]) => <React.Fragment key={key}><dt>{key.replace(/([A-Z])/g, ' $1')}</dt><dd>{renderValue(item)}</dd></React.Fragment>)}</dl>;
    return value == null ? null : String(value);
  };
  return <div className="path-cards">{cards?.map((card, index) => <article className="path-card" key={String(card.id || index)}><div className="eyebrow">Path {index + 1}</div><h3>{String(card.name || 'Untitled path')}</h3>{fields.map(([key, label]) => card[key] == null ? null : <section key={key}><h4>{label}</h4>{renderValue(card[key])}</section>)}<section><h4>Why it may fit</h4><ul>{[...(Array.isArray(card.evidence) ? card.evidence : []), card.practicalFit].filter(point => point != null).map((point, pointIndex) => <li key={pointIndex}>{renderValue(point)}</li>)}</ul></section><Detail title="Exact card fields"><Raw value={card} /></Detail></article>)}</div>;
}
function Preparation({ candidate }: { candidate: Candidate }) {
  if (!candidate.preparation) return null;
  return <section className="preparation"><h3>{candidate.preparation.status === 'ready' ? 'Contract ready' : 'Needs contract update before running'}</h3><ul>{candidate.preparation.conflicts.map((text, index) => <li key={index}>{text}</li>)}</ul><Detail title="Exact adaptations"><pre className="instruction-text">{candidate.preparation.adaptations.join('\n\n')}</pre></Detail><Detail title="Verified contract & preparation record"><Raw value={candidate.preparation.contract} /></Detail><Detail title="Original founder proposal"><pre className="instruction-text">{candidate.preparation.originalSkill}</pre></Detail></section>;
}
function ProviderItems({ items }: { items?: Record<string, unknown>[] }) {
  if (!items?.length) return <p className="muted">No provider items are available for this record.</p>;
  const calls = new Set(items.filter(item => item.type === 'function_call').map(item => item.call_id));
  const outputs = new Map<unknown, Record<string, unknown>[]>();
  for (const item of items) if (item.type === 'function_call_output') {
    const group = outputs.get(item.call_id) || []; group.push(item); outputs.set(item.call_id, group);
  }
  return <div className="provider-items">{items.map((item, index) => {
    if (item.type === 'function_call_output' && calls.has(item.call_id)) return null;
    if (item.type === 'function_call') {
      const results = outputs.get(item.call_id) || [];
      return <Detail key={index} title={`${index + 1}. Tool: ${String(item.name)} · ${results.length} result${results.length === 1 ? '' : 's'}`}><h4>Call</h4><Raw value={item} />{results.map((result, resultIndex) => <div key={resultIndex}><h4>Result {resultIndex + 1}</h4><Raw value={result} /></div>)}</Detail>;
    }
    return <Detail key={index} title={`${index + 1}. ${String(item.type || 'Item')}${item.role ? ' · ' + item.role : ''}`}><Raw value={item} /></Detail>;
  })}</div>;
}

interface FeedbackSaveState {
  latest: Feedback;
  revision: number;
  savedRevision: number;
  queuedRevision: number;
  chain: Promise<void>;
  status: string;
  listeners: Set<(status: string) => void>;
}

function feedbackStatus(session: FeedbackSaveState, status: string) {
  session.status = status;
  for (const listener of session.listeners) listener(status);
}

function queueFeedback(jobId: string, session: FeedbackSaveState) {
  if (session.revision <= session.queuedRevision) return;
  const revision = session.revision, value = { ...session.latest };
  session.queuedRevision = revision;
  session.chain = session.chain.catch(() => undefined).then(async () => {
    try {
      await api(`/api/jobs/${jobId}/feedback`, value, 'PUT');
      session.savedRevision = revision;
      if (session.revision === revision) feedbackStatus(session, 'Saved');
    } catch (error) {
      if (session.queuedRevision === revision) session.queuedRevision = session.savedRevision;
      if (session.revision === revision) feedbackStatus(session, `Error: ${(error as Error).message}`);
    }
  });
}

function FeedbackEditor({ job, sessions }: { job: Job; sessions: Map<string, FeedbackSaveState> }) {
  const [session] = useState(() => {
    let existing = sessions.get(job.id);
    if (!existing) {
      existing = { latest: job.feedback, revision: 0, savedRevision: 0, queuedRevision: 0, chain: Promise.resolve(), status: 'Saved', listeners: new Set() };
      sessions.set(job.id, existing);
    }
    return existing;
  });
  const [feedback, setFeedback] = useState<Feedback>(session.latest);
  const [status, setStatus] = useState(session.status);
  useEffect(() => {
    session.listeners.add(setStatus);
    return () => {
      session.listeners.delete(setStatus);
      // Navigation flushes the latest note through the same per-job queue.
      queueFeedback(job.id, session);
    };
  }, [job.id, session]);
  useEffect(() => {
    if (session.revision === session.savedRevision) return;
    const timer = window.setTimeout(() => queueFeedback(job.id, session), 500);
    return () => window.clearTimeout(timer);
  }, [feedback, job.id, session]);
  function edit(value: Feedback) {
    session.revision++;
    session.latest = value;
    setFeedback(value);
    feedbackStatus(session, 'Saving…');
  }
  return <section className="feedback"><h4>Your feedback</h4><div className="preference" role="group" aria-label="Result preference">{([['prefer', 'Prefer'], ['avoid', 'Pass over'], ['none', 'No preference']] as const).map(([value, label]) => <button key={value} aria-pressed={feedback.preference === value} onClick={() => edit({ ...feedback, preference: value })}>{label}</button>)}</div><label>Notes for this result<textarea value={feedback.comment} onChange={event => edit({ ...feedback, comment: event.target.value })} placeholder="What works? What would you change?" rows={3} /></label><span className={status.startsWith('Error') ? 'error-text' : 'save-status'} role="status">{status} · feedback belongs to this run version</span>{status.startsWith('Error') && <button onClick={() => edit({ ...feedback })}>Retry saving</button>}</section>;
}

function Result({ summary, currentCandidate, jobs, onRefresh, focusJob, feedbackSessions }: { summary: Job; currentCandidate?: Candidate; jobs: Job[]; onRefresh: () => Promise<void>; focusJob: (id: string) => void; feedbackSessions: Map<string, FeedbackSaveState> }) {
  const [job, setJob] = useState(summary);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    let active = true;
    api<Job>(`/api/jobs/${summary.id}`).then(value => { if (active) { setJob(value); setError(''); } }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [summary.id, summary.status]);
  async function send() {
    setSending(true); setError('');
    try {
      const result = await api<{ jobIds: string[] }>(`/api/jobs/${job.id}/continue`, { message: reply });
      setReply('');
      await onRefresh();
      if (result.jobIds[0]) focusJob(result.jobIds[0]);
    }
    catch (reason) { setError((reason as Error).message); }
    finally { setSending(false); }
  }
  return <article className="result-sheet" id={`result-${job.id}`}><header className="sheet-heading"><div><div className="eyebrow">{job.archive ? 'Retained voice result' : job.parentId ? 'Isolated continuation' : 'Candidate'}</div><h3>{job.candidateName}</h3></div><span className={`status ${job.status}`}>{job.status}</span></header><p className="version">Run {short(job.version)}{currentCandidate && currentCandidate.version !== job.version && <> · current draft {short(currentCandidate.version)}</>}</p><p className="muted small">{new Date(job.createdAt).toLocaleString()}</p>{job.parentId && <button className="text-button" onClick={() => focusJob(job.parentId!)}>↳ View parent result</button>}{job.parentId && <Detail title="Your reply on this branch"><Markdown text={job.currentMessage} /></Detail>}{job.status === 'queued' || job.status === 'running' ? <p className="waiting">{job.status === 'queued' ? 'Waiting for an available slot.' : 'Production agent is responding…'}</p> : null}{job.error && <p className="error" role="alert">{job.error}</p>}<Markdown text={job.reply} /><Cards cards={job.cards} />{job.caveats?.length ? <Detail title="Context and behavior caveats"><ul>{job.caveats.map((caveat, index) => <li key={index}>{caveat}</li>)}</ul></Detail> : null}<Detail title="Frozen instructions & settings">{job.config ? <><p>Exact run version: <code>{job.version}</code></p><Detail title="Voice"><pre className="instruction-text">{job.config.voice}</pre></Detail>{Object.entries(job.config.skills).map(([key, text]) => <Detail title={key} key={key}><pre className="instruction-text">{text}</pre></Detail>)}<Detail title="Shared required rules"><pre className="instruction-text">{job.config.sharedRules}</pre></Detail><Detail title="Run controls"><pre className="instruction-text">{job.config.controls || 'No fixed action contract. Path guidance may ask a follow-up or offer paths.'}</pre></Detail></> : <p>Original frozen instructions are not available in this archive manifest. See retained artifacts.</p>}<Raw value={job.metadata} /></Detail><Detail title="Available traces & tool history"><p className="muted">Hidden reasoning is unavailable. Only retained provider items and actual operation traces appear here.</p><ProviderItems items={job.providerItems} /><Detail title="Prepared agent steps"><Raw value={job.traces} /></Detail><Detail title="Canonical operations"><Raw value={job.operations} /></Detail></Detail><FeedbackEditor key={job.id} job={job} sessions={feedbackSessions} />{job.archive ? <p className="muted small">Archive: readable history only. Complete isolated state is unavailable for continuation.</p> : job.status === 'done' && <section className="continue"><h4>Continue this branch</h4><p className="muted small">Your reply uses this run’s frozen instructions and isolated history.</p><label>Your reply<textarea rows={3} value={reply} onChange={event => setReply(event.target.value)} /></label><button disabled={!reply.trim() || sending} onClick={send}>{sending ? 'Sending…' : 'Send isolated reply'}</button></section>}{jobs.some(child => child.parentId === job.id) && <Detail title="Replies from this result">{jobs.filter(child => child.parentId === job.id).map(child => <button className="branch-link" key={child.id} onClick={() => focusJob(child.id)}>{child.currentMessage?.slice(0, 100) || 'Reply'} <span className={`status ${child.status}`}>{child.status}</span></button>)}</Detail>}{error && <p className="error" role="alert">{error}</p>}</article>;
}

function CandidateEditor({ candidate, onClose, onSaved, onDirty }: { candidate: Candidate; onClose: () => void; onSaved: () => Promise<void>; onDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(candidate);
  const [skill, setSkill] = useState(candidate.kind === 'paths' && candidate.skills['create-purpose-paths'] ? 'create-purpose-paths' : Object.keys(candidate.skills)[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const baseline = useRef(candidate);
  const changed = draft.name !== baseline.current.name || draft.voice !== baseline.current.voice || JSON.stringify(draft.skills) !== JSON.stringify(baseline.current.skills);
  useEffect(() => { onDirty(changed); }, [changed, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  async function reload() {
    if (changed && !window.confirm('Discard your unsaved edits and reload the private candidate?')) return;
    setBusy(true); setError('');
    try { const value = await api<Candidate>(`/api/candidates/${candidate.id}`); baseline.current = value; setDraft(value); await onSaved(); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError('');
    try { const value = await api<Candidate>(`/api/candidates/${candidate.id}`, { expectedVersion: baseline.current.version, name: draft.name, voice: draft.voice, skills: draft.skills }, 'PUT'); baseline.current = value; setDraft(value); await onSaved(); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  const draftPath = draft.artifactPath.replace(/\/versions\/[^/]+$/, '/draft');
  return <div className="modal-scrim"><section className="editor modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header><div><div className="eyebrow">Exact candidate instructions</div><h2 id="editor-title">Edit hypothesis</h2></div><button disabled={busy} onClick={() => { if (!changed || window.confirm('Discard unsaved edits?')) onClose(); }} aria-label="Close candidate editor">Close</button></header><p className="version">Version <code>{baseline.current.version}</code> · {changed ? 'Unsaved edits' : 'Saved'}</p><Preparation candidate={draft} /><label>Candidate name<input disabled={busy} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>{draft.kind === 'paths' ? 'Accepted V4 voice · exact, fixed for paths' : 'Voice instructions'}<textarea className="instructions" rows={12} disabled={busy} readOnly={draft.kind === 'paths'} value={draft.voice} onChange={event => setDraft({ ...draft, voice: event.target.value })} /></label><label>Skill<select disabled={busy} value={skill} onChange={event => setSkill(event.target.value)}>{Object.keys(draft.skills).map(key => <option key={key}>{key}</option>)}</select></label><p className="muted small">Edit the full skill text. Preserve required registry frontmatter and module metadata.</p><label>Exact SKILL.md<textarea className="instructions skill-text" rows={18} disabled={busy} value={draft.skills[skill] || ''} onChange={event => setDraft({ ...draft, skills: { ...draft.skills, [skill]: event.target.value } })} /></label><Detail title="Shared product rules & controls"><pre className="instruction-text">{draft.sharedRules}</pre><p>{draft.kind === 'paths' ? 'No voice-only fixed action contract. The agent may ask or offer paths.' : 'Checkpoint-specific voice action controls are frozen separately for each run.'}</p></Detail><Detail title="Private artifacts shared with agents"><p>Agents edit the same candidate draft. Reload to pick up their changes before saving.</p><h4>Editable draft</h4><code className="file-path">{draftPath}</code><h4>Immutable version</h4><code className="file-path">{draft.artifactPath}</code></Detail>{error && <p className="error" role="alert">{error}</p>}<footer><button onClick={reload} disabled={busy}>Reload agent changes</button><button className="primary" onClick={save} disabled={busy || !changed || !draft.name.trim()}>{busy ? 'Working…' : 'Save version'}</button></footer></section></div>;
}

// An exact line diff. Shared text is collapsed; only insertions/deletions appear.
function lineDiff(before: string, after: string) {
  const a = before.split('\n'), b = after.split('\n');
  if (before === after) return [];
  if (a.length * b.length > 1_000_000) return [{ kind: 'removed', text: before }, { kind: 'added', text: after }];
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? 1 + table[i + 1][j + 1] : Math.max(table[i + 1][j], table[i][j + 1]);
  const changes: { kind: string; text: string }[] = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; }
    else if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) { changes.push({ kind: 'added', text: b[j++] }); }
    else changes.push({ kind: 'removed', text: a[i++] });
  }
  return changes;
}
function CandidateDiff({ candidates }: { candidates: Candidate[] }) {
  const [left, setLeft] = useState(''), [right, setRight] = useState('');
  const a = candidates.find(candidate => candidate.id === left) || candidates[0], b = candidates.find(candidate => candidate.id === right) || candidates[1] || candidates[0];
  if (!a || !b) return null;
  return <Detail title="Compare candidate instructions"><div className="diff-selectors"><label>From<select value={a.id} onChange={event => setLeft(event.target.value)}>{candidates.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name} · {short(candidate.version)}</option>)}</select></label><label>To<select value={b.id} onChange={event => setRight(event.target.value)}>{candidates.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name} · {short(candidate.version)}</option>)}</select></label></div><p className="muted small">Removed text is from “From”; added text is from “To”. Unchanged lines are hidden.</p>{['Voice', ...new Set([...Object.keys(a.skills), ...Object.keys(b.skills)])].map(key => { const changes = lineDiff(key === 'Voice' ? a.voice : a.skills[key] || '', key === 'Voice' ? b.voice : b.skills[key] || ''); return <section className="diff-section" key={key}><h4>{key}</h4>{changes.length ? <pre className="diff">{changes.map((change, index) => <span key={index} className={change.kind}>{change.kind === 'added' ? '+ ' : '− '}{change.text}{'\n'}</span>)}</pre> : <p className="muted small">Identical</p>}</section>; })}<Detail title="Shared required rules"><pre className="instruction-text">{a.sharedRules}</pre></Detail></Detail>;
}

function HistoricalReply({ checkpoint }: { checkpoint: Checkpoint }) {
  return <article className="historical result-sheet"><header className="sheet-heading"><div><div className="eyebrow">{checkpoint.kind === 'paths' ? 'Historical output archive' : 'Historical baseline'}</div><h3>Original reply</h3></div><span className="status archive">Recorded</span></header><Markdown text={checkpoint.historicalReply} /><Cards cards={checkpoint.historicalCards} />{!checkpoint.historicalCards.length && Array.isArray(checkpoint.provenance.priorCards) && <Detail title="Earlier cards · context only"><Cards cards={checkpoint.provenance.priorCards as PathCard[]} /></Detail>}<p className="muted small">Historical output from the actual conversation. Inputs may be reconstructed; see checkpoint context.</p></article>;
}

export function resultThreads(jobs: Job[]): Job[][] {
  const byId = new Map(jobs.map(job => [job.id, job]));
  const children = new Map<string, Job[]>();
  for (const job of jobs) {
    if (!job.parentId || !byId.has(job.parentId)) continue;
    const siblings = children.get(job.parentId) || [];
    siblings.push(job);
    children.set(job.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const visited = new Set<string>();
  function branch(job: Job): Job[] {
    if (visited.has(job.id)) return [];
    visited.add(job.id);
    return [job, ...(children.get(job.id) || []).flatMap(branch)];
  }
  const roots = jobs.filter(job => !job.parentId || !byId.has(job.parentId));
  const threads = roots.map(branch);
  // Retain malformed historical records rather than hiding them.
  for (const job of jobs) if (!visited.has(job.id)) threads.push(branch(job));
  return threads;
}

export function App() {
  const [state, setState] = useState<LabState>();
  const [kind, setKind] = useState<CandidateKind>('paths');
  const [selected, setSelected] = useState('paths-first');
  const [checkpoint, setCheckpoint] = useState<Checkpoint>();
  const [candidateIds, setCandidateIds] = useState<string[]>(['paths-v1']), [checkpointIds, setCheckpointIds] = useState<string[]>(['paths-first']);
  const [editing, setEditing] = useState<Candidate>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [duplicate, setDuplicate] = useState<Candidate>();
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [focusedJobId, setFocusedJobId] = useState<string>();
  const feedbackSessions = useRef(new Map<string, FeedbackSaveState>());
  const refreshSequence = useRef(0);
  const appliedRefresh = useRef(0);
  useEffect(() => {
    if (!focusedJobId) return;
    const element = document.getElementById(`result-${focusedJobId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' });
    setFocusedJobId(undefined);
  }, [focusedJobId, state, checkpoint]);
  useEffect(() => {
    if (!editing && !duplicate) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('[role="dialog"]');
    const controls = () => Array.from(modal?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary') || []);
    (modal?.querySelector<HTMLElement>('input') || controls()[0])?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const elements = controls(), first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [Boolean(editing), Boolean(duplicate)]);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const value = await api<LabState>('/api/state');
      if (sequence < appliedRefresh.current) return;
      appliedRefresh.current = sequence;
      setState(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
      setError('');
    } catch (reason) {
      if (sequence < appliedRefresh.current) return;
      appliedRefresh.current = sequence;
      setError((reason as Error).message);
    }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2500); return () => { window.clearInterval(timer); appliedRefresh.current = ++refreshSequence.current; }; }, [refresh]);
  useEffect(() => {
    if (!state) return;
    if (!state.checkpoints.some(item => item.id === selected && item.kind === kind)) setSelected(state.checkpoints.find(item => item.kind === kind)?.id || '');
  }, [state, kind, selected]);
  useEffect(() => {
    if (!selected) { setCheckpoint(undefined); return; }
    let active = true; setCheckpoint(undefined);
    api<Checkpoint>(`/api/checkpoints/${selected}`).then(value => { if (active) setCheckpoint(value); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [selected]);
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  function switchKind(value: CandidateKind) {
    setKind(value);
    setCandidateIds(value === 'paths' ? ['paths-v1'] : []);
    setCheckpointIds(value === 'paths' ? ['paths-first'] : []);
    if (value === 'paths') setSelected('paths-first');
  }
  async function runBatch() {
    setRunning(true); setError('');
    try { await api('/api/batch', { candidateIds, checkpointIds }); if (checkpointIds.length) setSelected(checkpointIds[0]); await refresh(); }
    catch (reason) { setError((reason as Error).message); } finally { setRunning(false); }
  }
  async function makeDuplicate() {
    if (!duplicate) return; setDuplicateBusy(true); setError('');
    try { const value = await api<Candidate>('/api/candidates', { name: duplicateName, copyFrom: duplicate.id, kind }); await refresh(); setDuplicate(undefined); setEditing(value); }
    catch (reason) { setError((reason as Error).message); } finally { setDuplicateBusy(false); }
  }
  function focusJob(id: string) {
    const target = state?.jobs.find(job => job.id === id);
    if (target && target.checkpointId !== selected) setSelected(target.checkpointId);
    setFocusedJobId(id);
  }
  if (!state) return <main className="loading"><h1>Revelio experiments</h1><p>{error || 'Opening your local workspace…'}</p><button onClick={() => void refresh()}>Reload</button></main>;
  const candidates = state.candidates.filter(candidate => candidate.kind === kind && !candidate.archived), checkpoints = state.checkpoints.filter(item => item.kind === kind);
  const results = state.jobs.filter(job => job.checkpointId === selected).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pairs = candidateIds.length * checkpointIds.length;
  return <><header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true">r.</span><div><h1>Revelio <em>experiments</em></h1><p>Private local workspace</p></div></div><div className="model-note"><span className="local-dot" />Local only<span>{state.model} · {state.effort.toUpperCase()} effort</span></div></header><div className="workspace"><aside className="sidebar"><nav className="mode-switch" aria-label="Experiment type"><button aria-pressed={kind === 'paths'} onClick={() => switchKind('paths')}>Paths</button><button aria-pressed={kind === 'voice'} onClick={() => switchKind('voice')}>Voice</button></nav><div className="sidebar-heading"><h2>Conversation moments</h2><span>{checkpoints.length}</span></div><p className="muted small">Open a moment to review. Tick boxes to include it in a batch.</p><div className="navigator">{checkpoints.map(item => <div className={`nav-row ${item.id === selected ? 'selected' : ''}`} key={item.id}><input type="checkbox" aria-label={`Include ${item.label} in batch`} checked={checkpointIds.includes(item.id)} onChange={() => setCheckpointIds(toggle(checkpointIds, item.id))} /><button onClick={() => setSelected(item.id)}>{item.label}</button></div>)}</div><div className="sidebar-heading"><h2>Candidates</h2><span>{candidates.length}</span></div>{candidates.map(candidate => <div className="candidate-row" key={candidate.id}><input type="checkbox" aria-label={`Include ${candidate.name} in batch`} checked={candidateIds.includes(candidate.id)} disabled={candidate.preparation?.status === 'blocked'} onChange={() => setCandidateIds(toggle(candidateIds, candidate.id))} /><div><strong>{candidate.name}</strong><span className="version">{short(candidate.version)}</span>{candidate.preparation?.status === 'blocked' && <p className="error-text small">Needs contract update. Open Edit for exact conflicts.</p>}<div className="candidate-actions"><button onClick={() => setEditing(candidate)}>Edit</button><button onClick={() => { setDuplicate(candidate); setDuplicateName(candidate.kind === 'paths' && /^Paths V\d+$/.test(candidate.name) ? candidate.name.replace(/\d+$/, number => String(Number(number) + 1)) : candidate.name + ' copy'); }}>Duplicate</button></div></div></div>)}{!candidates.length && <p className="muted">No candidates are available for this mode.</p>}<section className="batch-control"><div className="eyebrow">Explicit batch</div><p><strong>{candidateIds.length}</strong> candidates × <strong>{checkpointIds.length}</strong> moments</p><button className="primary" disabled={!pairs || pairs > 12 || dirty || running} onClick={runBatch}>{running ? 'Queueing…' : kind === 'paths' && pairs === 1 && candidateIds[0] === 'paths-v1' ? 'Run Paths V1' : `Run selected batch${pairs ? ' · ' + pairs : ''}`}</button><p className="muted small">Up to 12 pairs. Two run at a time.</p>{pairs > 12 && <p className="error-text">Choose 12 pairs or fewer.</p>}{dirty && <p className="error-text">Save candidate edits before running.</p>}</section><Detail title="Accepted voice · V4"><pre className="instruction-text">{state.acceptedVoice}</pre></Detail><Detail title="All job status"><div className="job-list">{state.jobs.map(job => <button key={job.id} onClick={() => { const moment = state.checkpoints.find(item => item.id === job.checkpointId); if (moment) setKind(moment.kind); setSelected(job.checkpointId); focusJob(job.id); }}>{job.candidateName}<span className={`status ${job.status}`}>{job.status}</span></button>)}</div></Detail></aside><main className="review-main">{error && <p className="error" role="alert">{error}</p>}<div className="review-title"><div className="eyebrow">{kind === 'paths' ? 'Path exploration' : 'Voice comparison'}</div><h2>{checkpoint?.label || 'Choose a conversation moment'}</h2><p className="muted">{kind === 'paths' ? 'Start with Paths V1. Leave notes on its results, request edits for V2, then compare the versions.' : 'Historical replies sit beside isolated voice candidates. Every run keeps its own instructions and history.'}</p></div><CandidateDiff candidates={candidates} />{checkpoint ? <><Detail title="Preceding conversation & checkpoint context"><div className="context-chat">{checkpoint.context.map((message, index) => <article className="chat-message" key={index}><div className="eyebrow">{message.role === 'user' ? 'You' : message.role}</div><Markdown text={message.text} /><Cards cards={message.cards} /></article>)}</div>{kind === 'paths' && <Detail title="Historical output archive · context only"><HistoricalReply checkpoint={checkpoint} /></Detail>}<h4>Focused historical briefing</h4>{typeof checkpoint.provenance.focusedBriefing === 'string' ? <pre className="instruction-text">{checkpoint.provenance.focusedBriefing}</pre> : <p className="muted">No focused briefing is available.</p>}<Detail title="State recovery & omissions"><Raw value={Object.fromEntries(Object.entries(checkpoint.provenance).filter(([key]) => key !== 'availableProviderItems' && key !== 'priorCards' && key !== 'focusedBriefing'))} /></Detail><Detail title="Full available provider prefix"><p className="muted">Calls are grouped with every matching result. Hidden reasoning is unavailable.</p><ProviderItems items={checkpoint.provenance.availableProviderItems as Record<string, unknown>[] | undefined} /></Detail></Detail><section className="current-message"><div className="eyebrow">Your message at this moment</div><Markdown text={checkpoint.currentMessage} /></section><div className="comparison">{kind === 'voice' && <HistoricalReply checkpoint={checkpoint} />}{resultThreads(results).map(thread => <div className="result-thread" key={thread[0].id}>{thread.map(job => <Result key={job.id} summary={job} currentCandidate={state.candidates.find(candidate => candidate.id === job.candidateId)} jobs={state.jobs} onRefresh={refresh} focusJob={focusJob} feedbackSessions={feedbackSessions.current} />)}</div>)}{!results.length && <div className="empty-result"><span className="empty-symbol" aria-hidden="true">↗</span><h3>{kind === 'paths' ? 'Start with Paths V1' : 'Try a hypothesis here'}</h3><p>{kind === 'paths' ? 'Run V1 at this moment and leave notes on what works or needs to change.' : 'Select a candidate and a conversation moment, then run the batch.'}</p><p className="muted small">{kind === 'paths' ? 'Your notes guide the next candidate. Later versions appear here for comparison.' : 'Nothing runs until you choose it.'}</p></div>}</div></> : <p className="muted">{checkpoints.length ? 'Loading checkpoint…' : 'No recoverable checkpoints are configured for this mode.'}</p>}</main></div>{editing && <CandidateEditor key={editing.id} candidate={editing} onClose={() => setEditing(undefined)} onSaved={refresh} onDirty={setDirty} />}{duplicate && <div className="modal-scrim"><section className="modal duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-title"><h2 id="duplicate-title">Name your hypothesis</h2><p>Copy exact instructions from {duplicate.name}. Edit the new copy before running.</p><label>Candidate name<input autoFocus value={duplicateName} onChange={event => setDuplicateName(event.target.value)} /></label>{error && <p className="error" role="alert">{error}</p>}<footer><button disabled={duplicateBusy} onClick={() => setDuplicate(undefined)}>Cancel</button><button className="primary" disabled={duplicateBusy || !duplicateName.trim()} onClick={makeDuplicate}>{duplicateBusy ? 'Creating…' : 'Create copy'}</button></footer></section></div>}</>;
}

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<App />);

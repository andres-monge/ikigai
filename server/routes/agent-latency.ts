import { performance } from 'node:perf_hooks';
import { REVELIO_MAX_AGENT_STEPS } from '../ai/limits.js';

type Phase = 'map-ready' | 'lease-ready' | 'provider-start' | 'safe-text' | 'terminal-start' | 'terminal-done';
type StepPhase = 'prepare-start' | 'prepare-end' | 'step-start' | 'step-finish'
  | 'search-start' | 'search-end' | 'tool-start' | 'tool-end';

type Flag = 0 | 1;
type BindingMarkerWait = {
  elapsedMs: number; budgetMs: number; expectedCount: number; promiseSettled: Flag;
  requestAborted: Flag; deadlineAborted: Flag;
};
// Unknown page metadata uses -1; HTTP status 0 means unavailable, not success.
type BindingAttempt = {
  index: number; elapsedMs: number; readReturned: Flag; httpStatus: number;
  requestedLimit: number; returnedCount: number; hasMore: number; cursorPresent: number;
  matchCounts: number[]; requestAborted: Flag; deadlineAborted: Flag;
};
// Phases: marker wait, provider read, inter-attempt delay, resolved, exhausted.
type BindingExit = {
  phase: 0 | 1 | 2 | 3 | 4; elapsedMs: number; complete: Flag; readBudgetMs: number;
  requestAborted: Flag; deadlineAborted: Flag;
};
const flag = (value: number) => value === 0 || value === 1;
const count = (value: number) => Number.isSafeInteger(value) && value >= 0;
const duration = (value: number) => Number.isFinite(value) && value >= 0;

// Fixed labels and numbers only. Never accept a message, tool argument, URL, or provider payload.
export class MethodLatencyTrace {
  private readonly started = performance.now();
  private readonly phases = new Map<Phase, number>();
  private readonly steps = new Map<number, Map<StepPhase, number>>();
  private readonly toolSpans = new Map<number, { searchMs: number; toolMs: number; searchStarted?: number; toolStarted?: number; searchCount: number; toolCount: number }>();

  private binding?: { markerWait?: BindingMarkerWait; attempts: BindingAttempt[]; exit?: BindingExit };

  bindingMarkers(value: BindingMarkerWait): void {
    if (this.binding?.exit || this.binding?.markerWait || !duration(value.elapsedMs) || !duration(value.budgetMs)
      || !count(value.expectedCount) || value.expectedCount > REVELIO_MAX_AGENT_STEPS || !flag(value.promiseSettled)
      || !flag(value.requestAborted) || !flag(value.deadlineAborted)) return;
    this.binding ??= { attempts: [] };
    this.binding.markerWait = {
      elapsedMs: Math.round(value.elapsedMs), budgetMs: value.budgetMs, expectedCount: value.expectedCount,
      promiseSettled: value.promiseSettled, requestAborted: value.requestAborted, deadlineAborted: value.deadlineAborted,
    };
  }

  bindingAttempt(value: BindingAttempt): void {
    if (this.binding?.exit || value.index !== (this.binding?.attempts.length ?? 0) + 1 || value.index > 5
      || !duration(value.elapsedMs) || !flag(value.readReturned) || !flag(value.requestAborted) || !flag(value.deadlineAborted)
      || value.requestedLimit !== 100 || !(value.returnedCount === -1 || count(value.returnedCount))
      || ![-1, 0, 1].includes(value.hasMore) || ![-1, 0, 1].includes(value.cursorPresent)
      || !(value.httpStatus === 0 || (Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599))
      || !Array.isArray(value.matchCounts) || value.matchCounts.length > REVELIO_MAX_AGENT_STEPS || !value.matchCounts.every(count)) return;
    this.binding ??= { attempts: [] };
    this.binding.attempts.push({
      index: value.index, elapsedMs: Math.round(value.elapsedMs), readReturned: value.readReturned, httpStatus: value.httpStatus,
      requestedLimit: value.requestedLimit, returnedCount: value.returnedCount, hasMore: value.hasMore,
      cursorPresent: value.cursorPresent, matchCounts: [...value.matchCounts],
      requestAborted: value.requestAborted, deadlineAborted: value.deadlineAborted,
    });
  }

  bindingExit(value: BindingExit): void {
    if (this.binding?.exit || !Number.isInteger(value.phase) || value.phase < 0 || value.phase > 4
      || !duration(value.elapsedMs) || !duration(value.readBudgetMs) || !flag(value.complete)
      || !flag(value.requestAborted) || !flag(value.deadlineAborted)) return;
    this.binding ??= { attempts: [] };
    this.binding.exit = {
      phase: value.phase, elapsedMs: Math.round(value.elapsedMs), complete: value.complete,
      readBudgetMs: value.readBudgetMs, requestAborted: value.requestAborted, deadlineAborted: value.deadlineAborted,
    };
  }

  mark(phase: Phase): void {
    if (!this.phases.has(phase)) this.phases.set(phase, performance.now());
  }

  step(index: number, phase: StepPhase): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= REVELIO_MAX_AGENT_STEPS) return;
    const now = performance.now();
    if (phase === 'search-start' || phase === 'search-end' || phase === 'tool-start' || phase === 'tool-end') {
      let spans = this.toolSpans.get(index);
      if (!spans) {
        spans = { searchMs: 0, toolMs: 0, searchCount: 0, toolCount: 0 };
        this.toolSpans.set(index, spans);
      }
      const kind = phase.startsWith('search') ? 'search' : 'tool';
      const startedKey = kind === 'search' ? 'searchStarted' : 'toolStarted';
      const msKey = kind === 'search' ? 'searchMs' : 'toolMs';
      const countKey = kind === 'search' ? 'searchCount' : 'toolCount';
      if (phase.endsWith('start')) spans[startedKey] ??= now;
      else if (spans[startedKey] !== undefined) {
        spans[msKey] += now - spans[startedKey];
        spans[countKey] += 1;
        spans[startedKey] = undefined;
      }
      return;
    }
    let events = this.steps.get(index);
    if (!events) {
      events = new Map();
      this.steps.set(index, events);
    }
    if (!events.has(phase)) events.set(phase, now);
  }

  summary(): Record<string, unknown> {
    const duration = (start: number | undefined, end: number | undefined) => (
      start !== undefined && end !== undefined && end >= start
        ? Math.round(end - start) : undefined
    );
    const fromStart = (phase: Phase) => duration(this.started, this.phases.get(phase));
    const steps = [...this.steps.entries()].sort(([a], [b]) => a - b).map(([index, events]) => {
      const spans = this.toolSpans.get(index);
      return {
        index,
        prepareMs: duration(events.get('prepare-start'), events.get('prepare-end')),
        stepMs: duration(events.get('step-start'), events.get('step-finish')),
        searchObservedMs: spans?.searchCount ? Math.round(spans.searchMs) : undefined,
        toolObservedMs: spans?.toolCount ? Math.round(spans.toolMs) : undefined,
        searchCount: spans?.searchCount ?? 0,
        toolCount: spans?.toolCount ?? 0,
      };
    });
    return {
      mapReadyMs: fromStart('map-ready'),
      leaseReadyMs: fromStart('lease-ready'),
      providerStartMs: fromStart('provider-start'),
      safeTextMs: fromStart('safe-text'),
      terminalStartMs: fromStart('terminal-start'),
      terminalDoneMs: fromStart('terminal-done'),
      steps,
      ...(this.binding ? { terminalBinding: structuredClone(this.binding) } : {}),
    };
  }
}

export function methodLatencyEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.REVELIO_LATENCY_TRACE === '1';
}

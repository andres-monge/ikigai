import { performance } from 'node:perf_hooks';

type Phase = 'map-ready' | 'lease-ready' | 'provider-start' | 'safe-text' | 'terminal-start' | 'terminal-done';
type StepPhase = 'prepare-start' | 'prepare-end' | 'step-start' | 'step-finish'
  | 'search-start' | 'search-end' | 'tool-start' | 'tool-end';

// Fixed labels and numbers only. Never accept a message, tool argument, URL, or provider payload.
export class MethodLatencyTrace {
  private readonly started = performance.now();
  private readonly phases = new Map<Phase, number>();
  private readonly steps = new Map<number, Map<StepPhase, number>>();
  private readonly toolSpans = new Map<number, { searchMs: number; toolMs: number; searchStarted?: number; toolStarted?: number; searchCount: number; toolCount: number }>();

  mark(phase: Phase): void {
    if (!this.phases.has(phase)) this.phases.set(phase, performance.now());
  }

  step(index: number, phase: StepPhase): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= 50) return;
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
    };
  }
}

export function methodLatencyEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.REVELIO_LATENCY_TRACE === '1';
}

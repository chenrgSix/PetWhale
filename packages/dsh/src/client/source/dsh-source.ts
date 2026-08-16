import type {
  CompanionSnapshot,
  CompanionSource,
  CompanionState,
} from '@petwhale/core';
import type {
  ISessionsCompat,
  SessionId,
  SessionListStateCompat,
} from '../types/dsh-compat';

export interface DshSourceOptions {
  /** Host label carried into snapshot context ('deepseek-harness' | 'telos'). */
  host?: string;
}

/**
 * DSH host adapter (design doc §20). Watches `ctx.sessions` and projects the
 * current session into CompanionSnapshots.
 *
 * M0 status: the *conversation* feed (the precise running/partial/runningCalls
 * mapping) is wired in M3 by binding the current session's conversation
 * snapshot. Until then the source publishes list-level signals only
 * (running → thinking, pendingInteraction → waiting, completed → success) so
 * the state is never stale-bad — see {@link DshCompanionSource.start}.
 */
export class DshCompanionSource implements CompanionSource {
  private readonly sessions: ISessionsCompat;
  private readonly host: string;
  private snapshot: CompanionSnapshot = {
    state: 'idle',
    emotion: 'neutral',
    since: Date.now(),
  };
  private readonly listeners = new Set<() => void>();
  private unsubscribeList: (() => void) | null = null;
  private lastSessionId: SessionId | undefined;

  constructor(sessions: ISessionsCompat, options: DshSourceOptions = {}) {
    this.sessions = sessions;
    this.host = options.host ?? 'deepseek-harness';
    this.snapshot.context = { host: this.host };
  }

  getSnapshot(): CompanionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Begin watching the session list (and, in M3, the conversation feed). */
  start(): void {
    if (this.unsubscribeList) return;
    this.unsubscribeList = this.sessions.list.subscribe(() => this.onListChanged());
    this.onListChanged();
  }

  dispose(): void {
    this.unsubscribeList?.();
    this.unsubscribeList = null;
    this.listeners.clear();
  }

  private onListChanged(): void {
    const list = this.sessions.list.getSnapshot();
    const current = list.current;

    if (current !== undefined && current !== this.lastSessionId) {
      // TODO(M3): bind the session face and subscribe its conversation
      // snapshot, then run composeSnapshot() on every change:
      //   const binding = this.sessions.binding(current);
      //   binding?.session.conversation.subscribe(...)
      this.lastSessionId = current;
    }
    if (current === undefined && this.lastSessionId !== undefined) {
      this.lastSessionId = undefined;
    }

    this.refreshFromList(list);
  }

  /**
   * Provisional list-level projection until the conversation feed lands (M3).
   * List rows expose coarse signals only: running / pendingInteraction /
   * completed.
   */
  private refreshFromList(list: SessionListStateCompat): void {
    const current = list.current;
    const summary = current !== undefined ? list.byId[current] : undefined;
    const now = Date.now();

    let state: CompanionState = 'idle';
    if (summary) {
      if (summary.pendingInteraction) state = 'waiting';
      else if (summary.running) state = 'thinking';
      else if (summary.completed && !summary.running) state = 'success';
    }
    this.publish(state, current, now);
  }

  private publish(state: CompanionState, sessionId: SessionId | undefined, now: number): void {
    const changed =
      state !== this.snapshot.state ||
      sessionId !== this.snapshot.context?.sessionId;
    this.snapshot = {
      ...this.snapshot,
      state,
      since: now,
      context: { ...this.snapshot.context, sessionId },
    };
    if (changed) {
      for (const listener of this.listeners) listener();
    }
  }
}

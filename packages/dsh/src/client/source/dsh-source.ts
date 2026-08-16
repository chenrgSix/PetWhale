import type {
  ConversationSnapshot,
  ISessions,
  SessionFace,
  SessionId,
} from '@deepseek-ai/dsh-client-runtime/client';
import type {
  CompanionSnapshot,
  CompanionSource,
} from '@petwhale/core';
import {
  composeSnapshot,
  createCompletionTracking,
  type CompletionTracking,
} from './resolve-state';

export interface DshSourceOptions {
  /** Host label carried into snapshot context ('deepseek-harness' | 'telos'). */
  host?: string;
}

/**
 * DSH host adapter (design doc §20, milestone M3). Watches `ctx.sessions`
 * and projects the current session's conversation snapshot into
 * CompanionSnapshots:
 *
 *   sessions.list (current session id)
 *     → sessions.binding(id).session   (ObservableSnapshot<ConversationSnapshot>)
 *       → composeSnapshot → { state, emotion, activity, context }
 *
 * Completion is derived in the source: an active conversation that settles
 * emits a transient `success` once (the engine's scheduler then holds it for
 * successHoldMs before falling back to idle).
 */
export class DshCompanionSource implements CompanionSource {
  private readonly sessions: ISessions;
  private readonly host: string;
  private readonly tracking: CompletionTracking = createCompletionTracking();
  private snapshot: CompanionSnapshot = {
    state: 'idle',
    emotion: 'neutral',
    since: Date.now(),
  };
  private readonly listeners = new Set<() => void>();
  private unsubscribeList: (() => void) | null = null;
  private unsubscribeConversation: (() => void) | null = null;
  private session: SessionFace | null = null;
  private sessionId: SessionId | undefined;

  constructor(sessions: ISessions, options: DshSourceOptions = {}) {
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

  /** Begin watching the session list and the current session's conversation. */
  start(): void {
    if (this.unsubscribeList) return;
    this.unsubscribeList = this.sessions.list.subscribe(() => this.onListChanged());
    this.onListChanged();
  }

  dispose(): void {
    this.unbindSession();
    this.unsubscribeList?.();
    this.unsubscribeList = null;
    this.listeners.clear();
  }

  private onListChanged(): void {
    const list = this.sessions.list.getSnapshot();
    const current = list.current;
    if (current !== this.sessionId) {
      this.bindSession(current);
      return;
    }
    // Same current id but no bound session yet (binding resolves lazily):
    // retry the bind on the next list change.
    if (current !== undefined && this.session === null) {
      this.bindSession(current);
    }
  }

  private bindSession(sessionId: SessionId | undefined): void {
    this.unbindSession();
    this.sessionId = sessionId;
    // Completion tracking is per-session; a switch must not leak a stale
    // "was active" signal into the next conversation.
    this.tracking.lastNonIdle = null;
    if (sessionId === undefined) {
      this.publishFromConversation(null, undefined);
      return;
    }
    const binding = this.sessions.binding(sessionId);
    if (!binding) {
      this.publishFromConversation(null, sessionId);
      return;
    }
    this.session = binding.session;
    this.unsubscribeConversation = this.session.subscribe(() =>
      this.onConversationChanged(),
    );
    this.onConversationChanged();
  }

  private unbindSession(): void {
    this.unsubscribeConversation?.();
    this.unsubscribeConversation = null;
    this.session = null;
  }

  private onConversationChanged(): void {
    this.publishFromConversation(
      this.session?.getSnapshot() ?? null,
      this.sessionId,
    );
  }

  private publishFromConversation(
    conversation: ConversationSnapshot | null,
    sessionId: SessionId | undefined,
  ): void {
    const now = Date.now();
    const context = { host: this.host, sessionId };
    if (!conversation) {
      this.publish({
        state: 'idle',
        emotion: 'neutral',
        since: now,
        context,
      });
      return;
    }
    const composed = composeSnapshot(conversation, this.tracking, now, context);
    // composeSnapshot returns a fresh tracking object; fold it back so the
    // source keeps the completion window across snapshots.
    this.tracking.lastNonIdle = composed.tracking.lastNonIdle;
    this.publish(composed.snapshot);
  }

  private publish(snapshot: CompanionSnapshot): void {
    const previous = this.snapshot;
    const changed =
      snapshot.state !== previous.state ||
      snapshot.emotion !== previous.emotion ||
      snapshot.activity?.kind !== previous.activity?.kind ||
      snapshot.activity?.label !== previous.activity?.label ||
      snapshot.context?.sessionId !== previous.context?.sessionId;
    this.snapshot = snapshot;
    if (changed) {
      for (const listener of this.listeners) listener();
    }
  }
}

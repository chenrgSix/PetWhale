import type {
  ConversationSnapshot,
  ISessions,
  ObservableSnapshot,
  SessionBinding,
  SessionFace,
  SessionId,
  SessionListState,
} from '@deepseek-ai/dsh-client-runtime/client';
import { describe, expect, it } from 'vitest';
import { DshCompanionSource } from './dsh-source';

class MockObservable<T> implements ObservableSnapshot<T> {
  private value: T;
  private readonly listeners = new Set<() => void>();

  constructor(init: T) {
    this.value = init;
  }

  getSnapshot(): T {
    return this.value;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  set(value: T): void {
    this.value = value;
    for (const listener of this.listeners) listener();
  }
}

class MockSession implements SessionFace {
  readonly sessionId: SessionId;
  private readonly observable: MockObservable<ConversationSnapshot>;

  constructor(id: SessionId, init: ConversationSnapshot) {
    this.sessionId = id;
    this.observable = new MockObservable(init);
  }

  getSnapshot(): ConversationSnapshot {
    return this.observable.getSnapshot();
  }

  subscribe(fn: () => void): () => void {
    return this.observable.subscribe(fn);
  }

  set(snapshot: ConversationSnapshot): void {
    this.observable.set(snapshot);
  }
}

class MockSessions implements ISessions {
  readonly list = new MockObservable<SessionListState>({
    ids: [],
    byId: {},
    current: undefined,
  });
  private readonly sessions = new Map<SessionId, MockSession>();

  binding(id: SessionId): SessionBinding | undefined {
    const session = this.sessions.get(id);
    return session ? { sessionId: id, session } : undefined;
  }

  scope(): undefined {
    return undefined;
  }

  sessionOf(): undefined {
    return undefined;
  }

  clear(): void {
    this.list.set({ ids: [], byId: {}, current: undefined });
  }

  open(): void {}

  addSession(id: SessionId, init: ConversationSnapshot): MockSession {
    const session = new MockSession(id, init);
    this.sessions.set(id, session);
    const previous = this.list.getSnapshot();
    this.list.set({
      ids: [...previous.ids, id],
      byId: {
        ...previous.byId,
        [id]: { id, running: false, blank: false },
      },
      current: previous.current,
    });
    return session;
  }

  setCurrent(id: SessionId | undefined): void {
    const previous = this.list.getSnapshot();
    this.list.set({ ...previous, current: id });
  }
}

function baseConversation(id: SessionId, overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    sessionId: id,
    partial: null,
    runningCalls: [],
    pending: [],
    running: false,
    promptError: null,
    lastAgentError: null,
    blank: false,
    ...overrides,
  };
}

function reasoning(conversation: ConversationSnapshot): ConversationSnapshot {
  return {
    ...conversation,
    running: true,
    partial: { turn: 1, step: 1, blocks: [{ kind: 'reasoning', text: 'hmm' }] },
  };
}

function working(conversation: ConversationSnapshot): ConversationSnapshot {
  return {
    ...conversation,
    running: true,
    runningCalls: [
      { callId: 'c1', name: 'bash', argsRaw: '{}', turn: 1, step: 1, time: 0 },
    ],
  };
}

function setup(): { source: DshCompanionSource; sessions: MockSessions } {
  const sessions = new MockSessions();
  const source = new DshCompanionSource(sessions, { host: 'deepseek-harness' });
  source.start();
  return { source, sessions };
}

describe('DshCompanionSource (M3 state mapping)', () => {
  it('starts idle when no session is current', () => {
    const { source } = setup();
    expect(source.getSnapshot().state).toBe('idle');
  });

  it('maps a reasoning conversation to thinking', () => {
    const { source, sessions } = setup();
    const session = sessions.addSession('s1', baseConversation('s1'));
    sessions.setCurrent('s1');
    session.set(reasoning(session.getSnapshot()));
    expect(source.getSnapshot().state).toBe('thinking');
    expect(source.getSnapshot().context?.sessionId).toBe('s1');
    expect(source.getSnapshot().context?.host).toBe('deepseek-harness');
  });

  it('maps running tool calls to working with a tool activity label', () => {
    const { source, sessions } = setup();
    const session = sessions.addSession('s1', baseConversation('s1'));
    sessions.setCurrent('s1');
    session.set(working(session.getSnapshot()));
    expect(source.getSnapshot().state).toBe('working');
    expect(source.getSnapshot().activity).toEqual({ kind: 'tool', label: 'bash' });
  });

  it('maps pending interactions to waiting', () => {
    const { source, sessions } = setup();
    const session = sessions.addSession('s1', baseConversation('s1'));
    sessions.setCurrent('s1');
    session.set(
      baseConversation('s1', {
        pending: [{ id: 'p1', kind: 'confirm', status: 'open' }],
      }),
    );
    expect(source.getSnapshot().state).toBe('waiting');
  });

  it('maps errors to error with a concerned emotion', () => {
    const { source, sessions } = setup();
    const session = sessions.addSession('s1', baseConversation('s1'));
    sessions.setCurrent('s1');
    session.set(baseConversation('s1', { lastAgentError: 'boom' }));
    expect(source.getSnapshot().state).toBe('error');
    expect(source.getSnapshot().emotion).toBe('concerned');
  });

  it('emits a transient success when an active conversation settles', () => {
    const { source, sessions } = setup();
    const session = sessions.addSession('s1', baseConversation('s1'));
    sessions.setCurrent('s1');
    session.set(working(session.getSnapshot()));
    expect(source.getSnapshot().state).toBe('working');
    session.set(baseConversation('s1'));
    expect(source.getSnapshot().state).toBe('success');
  });

  it('does not emit success when idle follows idle', () => {
    const { source, sessions } = setup();
    const session = sessions.addSession('s1', baseConversation('s1'));
    sessions.setCurrent('s1');
    session.set(baseConversation('s1', { running: true }));
    expect(source.getSnapshot().state).toBe('thinking');
    session.set(baseConversation('s1', { running: true }));
    expect(source.getSnapshot().state).toBe('thinking');
    sessions.setCurrent(undefined);
    expect(source.getSnapshot().state).toBe('idle');
  });

  it('switching sessions resets completion tracking', () => {
    const { source, sessions } = setup();
    const first = sessions.addSession('s1', baseConversation('s1'));
    const second = sessions.addSession('s2', baseConversation('s2'));
    sessions.setCurrent('s1');
    first.set(working(first.getSnapshot()));
    expect(source.getSnapshot().state).toBe('working');
    // Switch to an idle session: no stale success from s1.
    sessions.setCurrent('s2');
    expect(source.getSnapshot().state).toBe('idle');
    // And s2's own settle (it never worked) stays idle.
    second.set(baseConversation('s2'));
    expect(source.getSnapshot().state).toBe('idle');
  });

  it('stops listening after dispose', () => {
    const { source, sessions } = setup();
    const session = sessions.addSession('s1', baseConversation('s1'));
    sessions.setCurrent('s1');
    session.set(working(session.getSnapshot()));
    expect(source.getSnapshot().state).toBe('working');

    let notifications = 0;
    source.subscribe(() => notifications++);
    source.dispose();
    sessions.setCurrent(undefined);
    session.set(baseConversation('s1'));
    expect(notifications).toBe(0);
    expect(source.getSnapshot().state).toBe('working');
  });
});

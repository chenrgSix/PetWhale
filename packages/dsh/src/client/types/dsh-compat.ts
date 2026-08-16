/**
 * Minimal structural mirror of the DeepSeek Harness client API surface that
 * @petwhale/dsh consumes — generated from the DeepSeek Harness **0.1.0-rc.5**
 * checkout (`vendor/deepseek-harness`, the version DeepSeek Harness Web and
 * Telos run today) and the DSH plugin rules documented for third-party
 * clients.
 *
 * The npm-published `@deepseek-ai/dsh-client-*@0.0.1-rc.1` predates
 * `shell.overlay`, so the real types must come from the pinned checkout.
 * M2 swaps these stubs for the vendored types — the runtime shapes here are
 * intentionally minimal but faithful.
 *
 * Structural typing means these are assignment-compatible with the real
 * services; nothing here is executed.
 */

export type SessionId = string;

/** conversation/assistant block (subset). */
export interface AssistantBlockCompat {
  kind: 'text' | 'reasoning' | 'image' | 'tool-call' | 'other';
  text?: string;
  [key: string]: unknown;
}

export interface PartialAssistantCompat {
  turn: number;
  step: number;
  blocks: readonly AssistantBlockCompat[];
}

export interface RunningToolCallCompat {
  callId: string;
  name: string;
  argsRaw: string;
  turn: number;
  step: number;
  time: number;
  [key: string]: unknown;
}

export interface PendingInteractionCompat {
  id: string;
  kind: string;
  status: string;
  [key: string]: unknown;
}

export interface PromptErrorCompat {
  op: 'send' | 'stop';
  error: unknown;
}

/**
 * The DSH conversation snapshot fields the state mapping reads
 * (ConversationSnapshot in the 0.1.0-rc.5 runtime).
 */
export interface ConversationSnapshotCompat {
  sessionId: SessionId;
  partial: PartialAssistantCompat | null;
  runningCalls: readonly RunningToolCallCompat[];
  pending: readonly PendingInteractionCompat[];
  running: boolean;
  promptError: PromptErrorCompat | null;
  lastAgentError: string | null;
  blank: boolean;
  [key: string]: unknown;
}

/** One row of the session list (SessionSummary subset). */
export interface SessionSummaryCompat {
  id: SessionId;
  running: boolean;
  pendingInteraction?: string;
  completed?: boolean;
  blank: boolean;
  [key: string]: unknown;
}

/** The useSessions feed (SessionListState subset). */
export interface SessionListStateCompat {
  ids: readonly SessionId[];
  byId: Readonly<Record<SessionId, SessionSummaryCompat>>;
  current: SessionId | undefined;
  [key: string]: unknown;
}

/** uSES-style observable snapshot store. */
export interface ObservableSnapshotCompat<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

export interface SessionFaceCompat {
  [key: string]: unknown;
}

export interface SessionBindingCompat {
  readonly sessionId: SessionId;
  readonly session: SessionFaceCompat;
  [key: string]: unknown;
}

/**
 * The outward `ctx.sessions` face (ISessions subset — list / binding / scope /
 * sessionOf, exactly the documented outward API in the design doc §20).
 */
export interface ISessionsCompat {
  readonly list: ObservableSnapshotCompat<SessionListStateCompat>;
  binding(id: SessionId): SessionBindingCompat | undefined;
  scope(id: SessionId): unknown | undefined;
  sessionOf(ctx: unknown): SessionFaceCompat | undefined;
  clear(): void;
  open(id: SessionId): void;
  [key: string]: unknown;
}

/** List-slot registration descriptor (shell.overlay is kind 'list'). */
export interface SlotEntryCompat {
  name: string;
  id: string;
  order?: number;
  label?: string | (() => string);
  priority?: number;
  [key: string]: unknown;
}

export type SlotInjectionEffectCompat = (() => void) | Iterable<() => void>;

export type SlotComponentCompat = (props: Record<string, unknown>) => unknown;

/**
 * `ctx.slots` (SlotsService subset). The DSH client development rule for
 * third-party plugins: always use `ctx.slots.inject(...)` — never assume
 * ui-layout loaded first and register directly (design doc §17).
 */
export interface SlotsServiceCompat {
  inject(key: string, callback: () => SlotInjectionEffectCompat): () => void;
  register(entry: SlotEntryCompat, component: SlotComponentCompat): () => void;
  [key: string]: unknown;
}

/** The client Cordis context as seen by a third-party plugin. */
export interface ClientContextCompat {
  slots: SlotsServiceCompat;
  sessions: ISessionsCompat;
  [key: string]: unknown;
}

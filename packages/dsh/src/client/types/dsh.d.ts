/**
 * Ambient declarations for the DeepSeek Harness client API subset that
 * @petwhale/dsh consumes — a faithful structural mirror of the
 * **0.1.0-rc.5** client surface (the version DeepSeek Harness Web and Telos
 * run today; the npm-published `@deepseek-ai/dsh-client-*@0.0.1-rc.1` predates
 * `shell.overlay`).
 *
 * These `declare module` blocks are a compile-time fallback: when the real
 * `@deepseek-ai/dsh-client-runtime` package is resolvable (e.g. a developer
 * links the vendored checkout), TypeScript prefers the real module and these
 * declarations are ignored. Nothing here is executed.
 */
declare module '@deepseek-ai/dsh-client-runtime/client' {
  export type SessionId = string;

  /** conversation/assistant block (subset of AssistantBlock). */
  export interface AssistantBlock {
    kind: 'text' | 'reasoning' | 'image' | 'tool-call' | 'other';
    text?: string;
  }

  export interface PartialAssistant {
    turn: number;
    step: number;
    blocks: readonly AssistantBlock[];
  }

  export interface RunningToolCall {
    callId: string;
    name: string;
    argsRaw: string;
    turn: number;
    step: number;
    time: number;
  }

  export interface PendingInteraction {
    id: string;
    kind: string;
    status: string;
  }

  export interface PromptError {
    op: 'send' | 'stop';
    error: unknown;
  }

  /** ConversationSnapshot (0.1.0-rc.5): the fields the state mapping reads. */
  export interface ConversationSnapshot {
    sessionId: SessionId;
    partial: PartialAssistant | null;
    runningCalls: readonly RunningToolCall[];
    pending: readonly PendingInteraction[];
    running: boolean;
    promptError: PromptError | null;
    lastAgentError: string | null;
    blank: boolean;
  }

  /** One session-list row (SessionSummary subset). */
  export interface SessionSummary {
    id: SessionId;
    running: boolean;
    pendingInteraction?: string;
    completed?: boolean;
    blank: boolean;
  }

  /** The useSessions feed (SessionListState subset). */
  export interface SessionListState {
    ids: readonly SessionId[];
    byId: Readonly<Record<SessionId, SessionSummary>>;
    current: SessionId | undefined;
  }

  /** uSES-style observable snapshot source. */
  export interface ObservableSnapshot<T> {
    getSnapshot(): T;
    subscribe(fn: () => void): () => void;
  }

  /** The outward session face: behavior verbs plus the conversation read side. */
  export interface SessionFace extends ObservableSnapshot<ConversationSnapshot> {
    readonly sessionId: SessionId;
  }

  export interface SessionBinding {
    readonly sessionId: SessionId;
    readonly session: SessionFace;
  }

  /** The outward `ctx.sessions` face (ISessions subset, design doc §20). */
  export interface ISessions {
    readonly list: ObservableSnapshot<SessionListState>;
    binding(id: SessionId): SessionBinding | undefined;
    scope(id: SessionId): unknown | undefined;
    sessionOf(ctx: unknown): SessionFace | undefined;
    clear(): void;
    open(id: SessionId): void;
  }

  export type SlotInjectionEffect = (() => void) | Iterable<() => void>;

  /** List-slot registration descriptor (shell.overlay is kind 'list'). */
  export interface SlotEntry {
    name: string;
    id: string;
    order?: number;
    label?: string | (() => string);
    priority?: number;
  }

  export type SlotComponent = (props: Record<string, unknown>) => unknown;

  /**
   * `ctx.slots` (SlotsService subset). Third-party plugins must register
   * through `ctx.slots.inject(...)` — never assume ui-layout loaded first
   * (design doc §17). The register overload types the inject business face
   * against the component props (a structural stand-in for the real
   * ComposedProps machinery).
   */
  export interface SlotsService {
    inject(key: string, callback: () => SlotInjectionEffect): () => void;
    register<I extends Record<string, unknown>>(
      entry: SlotEntry & { inject?: () => I },
      component: (props: I) => unknown,
    ): () => void;
  }

  /** The client Cordis context as seen by a third-party plugin. */
  export interface ClientContext {
    slots: SlotsService;
    sessions: ISessions;
  }
}

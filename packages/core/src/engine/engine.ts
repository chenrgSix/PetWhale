import { BehaviorScheduler } from '../behavior/scheduler';
import type { BehaviorPolicy } from '../behavior/policy';
import type {
  CompanionContainer,
  CompanionRenderer,
  CompanionRendererOptions,
} from '../renderer/types';
import type { CompanionSource } from '../source/types';
import type { CompanionAction, CompanionSnapshot, CompanionState } from '../state/types';

/**
 * Render-side policy (design doc §36). The engine carries the flags so hosts
 * can wire DOM facts (page visibility, prefers-reduced-motion) without core
 * ever touching the DOM itself.
 */
export interface RenderPolicy {
  /** Target fps while the companion is active (working/answering/…). */
  activeFps: number;
  /** Target fps while idle. */
  idleFps: number;
  /** Whether the engine should pause rendering while the page is hidden. */
  pauseWhenHidden: boolean;
  /** Whether renderers should honor prefers-reduced-motion. */
  respectReducedMotion: boolean;
}

export const DEFAULT_RENDER_POLICY: RenderPolicy = {
  activeFps: 60,
  idleFps: 24,
  pauseWhenHidden: true,
  respectReducedMotion: true,
};

export interface CompanionEngineOptions {
  behaviorPolicy?: Partial<BehaviorPolicy>;
  renderPolicy?: Partial<RenderPolicy>;
}

export interface EngineStatus {
  started: boolean;
  paused: boolean;
  rendererId: string | null;
  effectiveState: CompanionState;
}

/**
 * CompanionEngine owns the pipeline (design doc §13, §5):
 *
 *   source → behavior scheduler → renderer
 *
 * Responsibilities: state smoothing (delegated to {@link BehaviorScheduler}),
 * renderer lifecycle (mount / update / trigger / dispose / replacement), and
 * host-driven pause + reduced-motion hints. Core stays DOM-free: hosts decide
 * the container and the visibility facts.
 */
export class CompanionEngine {
  private readonly source: CompanionSource;
  private readonly scheduler: BehaviorScheduler;
  private readonly renderPolicy: RenderPolicy;
  private renderer: CompanionRenderer | null = null;
  private rendererOptions: CompanionRendererOptions = {};
  private lastSnapshot: CompanionSnapshot | null = null;
  private lastPublished: CompanionSnapshot | null = null;
  private readonly updateListeners = new Set<() => void>();
  private unsubscribeSource: (() => void) | null = null;
  private unsubscribeScheduler: (() => void) | null = null;
  private started = false;
  private paused = false;
  private disposed = false;

  constructor(source: CompanionSource, options: CompanionEngineOptions = {}) {
    this.source = source;
    this.scheduler = new BehaviorScheduler(options.behaviorPolicy);
    this.renderPolicy = { ...DEFAULT_RENDER_POLICY, ...options.renderPolicy };
  }

  get status(): EngineStatus {
    return {
      started: this.started,
      paused: this.paused,
      rendererId: this.renderer?.id ?? null,
      effectiveState: this.scheduler.getEffectiveState(),
    };
  }

  get effectiveState(): CompanionState {
    return this.scheduler.getEffectiveState();
  }

  /**
   * The most recently published effective snapshot, or null before the first
   * publish. Reference-stable between updates (usable as a
   * useSyncExternalStore getSnapshot source).
   */
  getLastSnapshot(): CompanionSnapshot | null {
    return this.lastPublished;
  }

  /**
   * Subscribe to snapshot publications (the updates the renderer receives).
   * Returns an unsubscribe.
   */
  onUpdate(listener: () => void): () => void {
    this.updateListeners.add(listener);
    return () => {
      this.updateListeners.delete(listener);
    };
  }

  /**
   * Merge behavior-policy overrides at runtime (settings changes).
   * @param partial - policy fields to update.
   */
  setBehaviorPolicy(partial: Partial<BehaviorPolicy>): void {
    this.scheduler.setPolicy(partial);
  }

  /** Begin listening to the source and driving the renderer. */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    let transitioned = false;
    this.unsubscribeScheduler = this.scheduler.onTransition((state, since) => {
      transitioned = true;
      this.publish(state, since);
    });
    this.unsubscribeSource = this.source.subscribe(() => this.ingest());
    this.ingest();
    // The scheduler only emits on real transitions; a source that starts in
    // the scheduler's initial state (idle) would otherwise never reach the
    // renderer. Push the current effective state once at startup.
    if (!transitioned) {
      this.publish(
        this.scheduler.getEffectiveState(),
        this.scheduler.getEffectiveSince(),
      );
    }
  }

  /** Stop listening; the mounted renderer stays for a later restart. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.unsubscribeSource?.();
    this.unsubscribeScheduler?.();
    this.unsubscribeSource = null;
    this.unsubscribeScheduler = null;
  }

  /**
   * Set (or replace) the renderer. Passing a container mounts it; the engine
   * then pushes the current effective snapshot immediately.
   */
  async setRenderer(
    renderer: CompanionRenderer,
    container?: CompanionContainer,
    options?: CompanionRendererOptions,
  ): Promise<void> {
    if (this.disposed) return;
    if (this.renderer && this.renderer !== renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.renderer = renderer;
    this.rendererOptions = options ?? {};
    if (container) {
      await renderer.mount(container, {
        ...this.rendererOptions,
        reducedMotion: this.renderPolicy.respectReducedMotion
          ? this.rendererOptions.reducedMotion
          : false,
      });
    }
    if (this.paused) renderer.setVisible?.(false);
    if (this.lastSnapshot) {
      this.publish(
        this.scheduler.getEffectiveState(),
        this.scheduler.getEffectiveSince(),
      );
    }
  }

  /** Forward a one-shot action to the renderer. */
  trigger(action: CompanionAction): void {
    this.renderer?.trigger(action);
  }

  /**
   * Host-driven visibility pause (wire document.visibilityState). While
   * paused the renderer is hidden and no updates are pushed; the latest state
   * is re-pushed on resume.
   */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.renderer?.setVisible?.(!paused);
    if (!paused) {
      this.publish(
        this.scheduler.getEffectiveState(),
        this.scheduler.getEffectiveSince(),
      );
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.scheduler.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.lastSnapshot = null;
    this.lastPublished = null;
    this.updateListeners.clear();
  }

  private ingest(): void {
    if (!this.started || this.disposed) return;
    const snapshot = this.source.getSnapshot();
    this.lastSnapshot = snapshot;
    this.scheduler.request(snapshot.state);
  }

  private publish(state: CompanionState, since: number): void {
    if (this.disposed || this.paused || !this.renderer || !this.lastSnapshot) {
      return;
    }
    const snapshot: CompanionSnapshot = {
      ...this.lastSnapshot,
      state,
      since,
    };
    this.lastPublished = snapshot;
    this.renderer.update(snapshot);
    for (const listener of this.updateListeners) listener();
  }
}

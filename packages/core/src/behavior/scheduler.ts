import { isTransientState, statePriority } from '../state/priority';
import type { CompanionState } from '../state/types';
import { resolveBehaviorPolicy, type BehaviorPolicy } from './policy';

/** Called whenever the effective state changes. */
export type SchedulerListener = (state: CompanionState, since: number) => void;

interface PendingSwitch {
  state: CompanionState;
  at: number;
}

/**
 * Smooths raw state requests into renderer-friendly transitions (design doc
 * §13–§15). Agent state can flap extremely fast (thinking → working →
 * thinking → …); pushing every request straight to a renderer makes a
 * character look broken, so the scheduler applies these rules:
 *
 * - transient `success` / `error` are applied immediately and held for
 *   successHoldMs / errorHoldMs, then released back to `idle`;
 * - stable states follow the priority table — a higher-priority request
 *   displaces the current state immediately;
 * - a same/lower-priority request waits out the minimum state duration, and
 *   the last request in that window wins (debounce: flapping collapses onto
 *   the final request instead of flickering);
 * - a long continuous `idle` (sleepAfterMs) falls asleep; any later signal —
 *   including a plain `idle` — wakes the companion.
 *
 * The scheduler is pure timing logic: no DOM, no host, no renderer.
 */
export class BehaviorScheduler {
  private readonly policy: BehaviorPolicy;
  private target: CompanionState = 'idle';
  private effective: CompanionState = 'idle';
  private effectiveSince: number = Date.now();
  private readonly listeners = new Set<SchedulerListener>();
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSwitch: PendingSwitch | null = null;
  private disposed = false;

  constructor(policy?: Partial<BehaviorPolicy>) {
    this.policy = resolveBehaviorPolicy(policy);
    this.armSleepTimer();
  }

  /** The latest state the source asked for. */
  getTarget(): CompanionState {
    return this.target;
  }

  /** The state renderers currently see. */
  getEffectiveState(): CompanionState {
    return this.effective;
  }

  /** Unix epoch ms when the effective state was entered. */
  getEffectiveSince(): number {
    return this.effectiveSince;
  }

  getPolicy(): BehaviorPolicy {
    return { ...this.policy };
  }

  /**
   * Merge partial policy overrides at runtime (e.g. a settings change). A
   * live sleep timer is re-armed from the new value when the companion is
   * currently idle.
   */
  setPolicy(partial: Partial<BehaviorPolicy>): void {
    Object.assign(this.policy, resolveBehaviorPolicy(partial));
    if (this.effective === 'idle') this.armSleepTimer();
  }

  /** Feed a raw state request from the source. */
  request(state: CompanionState): void {
    if (this.disposed) return;
    this.target = state;

    // Any signal wakes a sleeping companion — including a plain idle.
    if (this.effective === 'sleeping' && state === 'idle') {
      this.clearSleepTimer();
      this.apply('idle');
      this.armSleepTimer();
      return;
    }

    if (isTransientState(state)) {
      // Transients take over immediately (hold restart on re-request).
      this.clearPending();
      this.clearHoldTimer();
      this.apply(state);
      this.armHoldTimer(state);
      return;
    }

    if (isTransientState(this.effective)) {
      // A fresh stable state supersedes the transient display.
      this.clearHoldTimer();
      this.apply(state);
      return;
    }

    if (state === this.effective) {
      // Re-request of the current display: drop a stale deferred switch,
      // keep idle's sleep clock ticking.
      this.clearPending();
      this.armSleepTimer();
      return;
    }

    const elapsed = Date.now() - this.effectiveSince;
    const higherPriority = statePriority(state) > statePriority(this.effective);

    if (higherPriority || elapsed >= this.policy.minimumStateDurationMs) {
      this.clearPending();
      this.apply(state);
      return;
    }

    // Same/lower priority inside the minimum duration: defer the switch; the
    // last request in the window wins (transitionDebounceMs folds in as a
    // floor on the deferred switch time).
    this.pendingSwitch = {
      state,
      at:
        this.effectiveSince +
        Math.max(
          this.policy.minimumStateDurationMs,
          this.policy.transitionDebounceMs,
        ),
    };
    this.armPendingTimer();
  }

  /** Subscribe to effective-state transitions. Returns an unsubscribe. */
  onTransition(listener: SchedulerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearPending();
    this.clearHoldTimer();
    this.clearSleepTimer();
    this.listeners.clear();
  }

  private apply(state: CompanionState): void {
    this.effective = state;
    this.effectiveSince = Date.now();
    for (const listener of this.listeners) {
      listener(this.effective, this.effectiveSince);
    }
    this.clearSleepTimer();
    if (state === 'idle') this.armSleepTimer();
  }

  private armHoldTimer(state: CompanionState): void {
    const holdMs =
      state === 'error'
        ? this.policy.errorHoldMs
        : this.policy.successHoldMs;
    this.holdTimer = setTimeout(() => this.onHoldExpired(), holdMs);
  }

  private onHoldExpired(): void {
    this.holdTimer = null;
    if (this.effective === 'success' || this.effective === 'error') {
      this.apply('idle');
    }
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  private armSleepTimer(): void {
    if (this.disposed || this.effective !== 'idle') return;
    if (this.policy.sleepAfterMs <= 0) return; // 0 = never sleep
    this.clearSleepTimer();
    this.sleepTimer = setTimeout(() => this.onSleepExpired(), this.policy.sleepAfterMs);
  }

  private onSleepExpired(): void {
    this.sleepTimer = null;
    if (this.effective === 'idle') this.apply('sleeping');
  }

  private clearSleepTimer(): void {
    if (this.sleepTimer !== null) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
  }

  private armPendingTimer(): void {
    if (!this.pendingSwitch) return;
    const delay = Math.max(0, this.pendingSwitch.at - Date.now());
    this.clearPendingTimer();
    this.pendingTimer = setTimeout(() => this.onPendingExpired(), delay);
  }

  private onPendingExpired(): void {
    this.pendingTimer = null;
    if (!this.pendingSwitch) return;
    const { state, at } = this.pendingSwitch;
    this.pendingSwitch = null;
    if (Date.now() >= at && state !== this.effective) this.apply(state);
  }

  private clearPending(): void {
    this.pendingSwitch = null;
    this.clearPendingTimer();
  }

  private clearPendingTimer(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }
}

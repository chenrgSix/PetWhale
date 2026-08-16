/**
 * Behavior scheduling policy (design doc §14).
 */
export interface BehaviorPolicy {
  /** Minimum gap between effective transitions (flap cooldown). */
  transitionDebounceMs: number;
  /** How long a transient `success` stays on screen before falling back to idle. */
  successHoldMs: number;
  /** How long a transient `error` stays on screen before falling back to idle. */
  errorHoldMs: number;
  /** Continuous idle time before the companion falls asleep. */
  sleepAfterMs: number;
  /** Minimum time a state must be displayed before a same/lower-priority request may replace it. */
  minimumStateDurationMs: number;
}

export const DEFAULT_BEHAVIOR_POLICY: BehaviorPolicy = {
  transitionDebounceMs: 120,
  successHoldMs: 1800,
  errorHoldMs: 2200,
  sleepAfterMs: 5 * 60_000, // 5 min
  minimumStateDurationMs: 150,
};

export function resolveBehaviorPolicy(
  overrides?: Partial<BehaviorPolicy>,
): BehaviorPolicy {
  return { ...DEFAULT_BEHAVIOR_POLICY, ...overrides };
}

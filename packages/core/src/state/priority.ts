import type { CompanionState } from './types';

/**
 * State priority (design doc §15), highest first:
 *
 *   error > waiting > working > answering > thinking > idle > sleeping
 *
 * `success` is transient; it ranks just above `error` so a success shown in a
 * busy sequence is never displaced by a stale stable state.
 */
export const STATE_PRIORITY: Record<CompanionState, number> = {
  sleeping: 0,
  idle: 1,
  thinking: 2,
  answering: 3,
  working: 4,
  waiting: 5,
  success: 6,
  error: 7,
};

/**
 * Transient states are one-shot displays released back to idle after a hold
 * (successHoldMs / errorHoldMs) — they never persist into the next turn.
 */
export const TRANSIENT_STATES: ReadonlySet<CompanionState> = new Set<CompanionState>([
  'success',
  'error',
]);

export function isTransientState(state: CompanionState): boolean {
  return TRANSIENT_STATES.has(state);
}

export function statePriority(state: CompanionState): number {
  return STATE_PRIORITY[state];
}

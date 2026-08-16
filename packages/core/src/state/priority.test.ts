import { describe, expect, it } from 'vitest';
import {
  isTransientState,
  STATE_PRIORITY,
  statePriority,
  TRANSIENT_STATES,
} from './priority';

describe('state priority (design doc §15)', () => {
  it('ranks error above waiting above working above answering above thinking above idle above sleeping', () => {
    const order = [
      'error',
      'waiting',
      'working',
      'answering',
      'thinking',
      'idle',
      'sleeping',
    ] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(statePriority(order[i]!)).toBeGreaterThan(
        statePriority(order[i + 1]!),
      );
    }
  });

  it('keeps success transient and above the stable states', () => {
    expect(statePriority('success')).toBeGreaterThan(statePriority('waiting'));
    expect(statePriority('error')).toBeGreaterThan(statePriority('success'));
  });

  it('marks success and error as the only transient states', () => {
    for (const state of Object.keys(STATE_PRIORITY) as Array<
      keyof typeof STATE_PRIORITY
    >) {
      expect(isTransientState(state)).toBe(
        state === 'success' || state === 'error',
      );
    }
    expect(TRANSIENT_STATES.size).toBe(2);
  });
});
